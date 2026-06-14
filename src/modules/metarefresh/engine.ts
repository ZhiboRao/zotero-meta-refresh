/**
 * 刷新引擎:读配置、取条目、计算变更计划(干跑)、应用计划。
 * 把"计算"与"写回"分离,正是偏好面板「预览 → 确认」流程的基础。
 *
 * The refresh engine: read config, gather items, compute a change plan
 * (the dry run) and apply it. Splitting "compute" from "write" is what
 * powers the preview-then-confirm flow.
 */

import { getPref } from "../../utils/prefs";
import {
  queryCrossRef,
  queryCrossRefByTitle,
  queryDBLP,
  queryOpenAlex,
  queryS2,
} from "./sources";
import {
  AuthorPlan,
  FieldPlan,
  ItemPlan,
  RunConfig,
  SourceRecord,
} from "./types";
import { extractArxivId, hasChinese, similarity, sleep } from "./utils";

export type RefreshScope = "selected" | "collection" | "library";

/** 字段名 → 对应的偏好开关 key / Zotero field → its pref toggle key. */
const FIELD_PREF_MAP: Record<string, keyof _ZoteroTypes.Prefs["PluginPrefsMap"]> =
  {
    title: "fieldTitle",
    publicationTitle: "fieldPublicationTitle",
    date: "fieldDate",
    volume: "fieldVolume",
    issue: "fieldIssue",
    pages: "fieldPages",
    DOI: "fieldDOI",
    abstractNote: "fieldAbstractNote",
    conferenceName: "fieldConferenceName",
    proceedingsTitle: "fieldProceedingsTitle",
  };

/**
 * 从偏好读取整轮运行配置。
 *
 * Read the whole-run configuration from preferences.
 */
export function readConfig(): RunConfig {
  const fields = Object.keys(FIELD_PREF_MAP).filter((f) =>
    Boolean(getPref(FIELD_PREF_MAP[f])),
  );
  const threshold =
    parseFloat(String(getPref("titleSimilarityThreshold"))) || 0.85;
  const delayMs = parseInt(String(getPref("delayMs")), 10);
  return {
    updateAuthors: Boolean(getPref("updateAuthors")),
    upgradePreprints: Boolean(getPref("upgradePreprints")),
    skipChinese: Boolean(getPref("skipChinese")),
    backupToExtra: Boolean(getPref("backupToExtra")),
    titleSimilarityThreshold: threshold,
    delayMs: Number.isFinite(delayMs) ? delayMs : 1200,
    contactEmail: String(getPref("contactEmail") || ""),
    s2ApiKey: String(getPref("s2ApiKey") || ""),
    sources: {
      crossref: Boolean(getPref("useCrossref")),
      openalex: Boolean(getPref("useOpenAlex")),
      s2: Boolean(getPref("useS2")),
      dblp: Boolean(getPref("useDBLP")),
    },
    fields,
  };
}

/**
 * 按范围收集要处理的常规条目。
 *
 * Gather the regular items to process for a given scope.
 */
export async function gatherItems(
  scope: RefreshScope,
): Promise<Zotero.Item[]> {
  const pane = Zotero.getActiveZoteroPane();
  let items: Zotero.Item[] = [];
  if (scope === "selected") {
    items = pane ? pane.getSelectedItems() : [];
  } else if (scope === "collection") {
    const col = pane ? pane.getSelectedCollection() : undefined;
    items = col ? (col.getChildItems() as Zotero.Item[]) : [];
  } else if (scope === "library") {
    items = (await Zotero.Items.getAll(
      Zotero.Libraries.userLibraryID,
    )) as Zotero.Item[];
  }
  return (items || []).filter(
    (it) => it && it.isRegularItem && it.isRegularItem(),
  );
}

/**
 * 计算单条条目的变更计划。只查询、只比对,绝不写回。
 *
 * Compute the change plan for one item. Queries and diffs only; never
 * writes back to the item.
 *
 * @param item 目标条目 / target item.
 * @param config 运行配置 / run configuration.
 * @returns 该条目的处理计划 / the plan for this item.
 */
export async function computePlan(
  item: Zotero.Item,
  config: RunConfig,
): Promise<ItemPlan> {
  const title = item.getField("title") || "";
  const plan: ItemPlan = {
    item,
    title,
    status: "not_found",
    fields: [],
    authors: null,
    queryLog: [],
  };

  if (config.skipChinese && hasChinese(title)) {
    plan.status = "skipped";
    plan.reason = "chinese";
    return plan;
  }

  let metadata: SourceRecord | null = null;
  const doi = item.getField("DOI");
  const arxivId = extractArxivId(item);
  const queryLog = plan.queryLog;

  // 依次尝试一个源:命中且标题相似度达标才采用。
  // Try one source: adopt it only if it hits and the title is similar enough.
  const trySource = async (
    name: string,
    enabled: boolean,
    fn: () => Promise<SourceRecord | null>,
  ): Promise<void> => {
    if (metadata || !enabled) return;
    try {
      const result = await fn();
      if (result && result.title) {
        const sim = similarity(title, result.title);
        if (sim >= config.titleSimilarityThreshold) {
          queryLog.push(`${name}: ✓ 命中 (sim=${sim.toFixed(2)})`);
          metadata = result;
        } else {
          queryLog.push(
            `${name}: ✗ 相似度不足 (sim=${sim.toFixed(2)}) "${result.title.slice(
              0,
              50,
            )}"`,
          );
        }
      } else {
        queryLog.push(`${name}: ✗ 未命中`);
      }
    } catch (e: any) {
      queryLog.push(`${name}: ✗ 错误 (${e?.message || e})`);
    }
    await sleep(config.delayMs);
  };

  if (doi && !String(doi).toLowerCase().includes("arxiv")) {
    // 有正式 DOI / has a formal DOI.
    await trySource("CrossRef(DOI)", config.sources.crossref, () =>
      queryCrossRef(config, doi),
    );
    await trySource("OpenAlex(DOI)", config.sources.openalex, () =>
      queryOpenAlex(config, doi, "doi"),
    );
    await trySource("S2(DOI)", config.sources.s2, () =>
      queryS2(config, doi, "doi"),
    );
  } else if (arxivId && config.upgradePreprints) {
    // arXiv 预印本:S2 优先(可拿到正式发表 venue)。
    // arXiv preprint: prefer S2 (it can yield the published venue).
    await trySource("S2(arXiv)", config.sources.s2, () =>
      queryS2(config, arxivId, "arxiv"),
    );
    if (title) {
      await trySource("OpenAlex(title)", config.sources.openalex, () =>
        queryOpenAlex(config, title, "title"),
      );
      await trySource("DBLP(title)", config.sources.dblp, () =>
        queryDBLP(config, title),
      );
    }
  }

  if (!metadata && title) {
    // 只有标题,或上面都没命中 / only a title, or nothing matched above.
    await trySource("S2(title)", config.sources.s2, () =>
      queryS2(config, title, "title"),
    );
    await trySource("OpenAlex(title)", config.sources.openalex, () =>
      queryOpenAlex(config, title, "title"),
    );
    await trySource("DBLP(title)", config.sources.dblp, () =>
      queryDBLP(config, title),
    );
    await trySource("CrossRef(title)", config.sources.crossref, () =>
      queryCrossRefByTitle(config, title),
    );
  }

  if (!metadata) {
    plan.status = "not_found";
    return plan;
  }
  // 非空断言:metadata 在闭包里被赋值,TS 无法自动收窄。
  // Non-null assertion: metadata is assigned inside a closure, so TS can't narrow it.
  const meta: SourceRecord = metadata!;
  plan.source = meta.source;

  // 构建字段 diff:只动白名单内、对该类型有效、且新值非空且确有变化的字段。
  // Build the field diff: only whitelisted fields valid for this item type
  // whose new value is non-empty and actually different.
  const itemTypeID = item.itemTypeID;
  const valueMap: Record<string, string> = {
    title: meta.title,
    publicationTitle: meta.publicationTitle,
    proceedingsTitle: meta.publicationTitle,
    conferenceName: meta.publicationTitle,
    date: meta.date,
    volume: meta.volume,
    issue: meta.issue,
    pages: meta.pages,
    DOI: meta.DOI,
    abstractNote: meta.abstractNote,
  };

  const planned: FieldPlan[] = [];
  for (const field of config.fields) {
    const newVal = valueMap[field];
    if (newVal === undefined || newVal === null || String(newVal).trim() === "")
      continue;
    const fid = Zotero.ItemFields.getID(field);
    if (!fid || !Zotero.ItemFields.isValidForType(fid, itemTypeID)) continue;
    const oldVal = item.getField(field) || "";
    if (String(oldVal).trim() === String(newVal).trim()) continue;
    planned.push({
      field,
      oldVal: String(oldVal),
      newVal: String(newVal).trim(),
    });
  }
  plan.fields = planned;

  // 作者 / authors.
  if (config.updateAuthors && meta.authors && meta.authors.length) {
    const oldC = item
      .getCreators()
      .map((c: any) => `${c.firstName} ${c.lastName}`.trim())
      .join("; ");
    const newC = meta.authors
      .map((a) => `${a.firstName} ${a.lastName}`.trim())
      .join("; ");
    if (oldC !== newC) {
      plan.authors = { oldC, newC, list: meta.authors } as AuthorPlan;
    }
  }

  plan.status = planned.length || plan.authors ? "would_update" : "nochange";
  return plan;
}

/**
 * 应用一条计划:备份旧值到 Extra,写字段、写作者,saveTx。
 *
 * Apply one plan: back up old values to Extra, set fields and creators,
 * then ``saveTx``.
 *
 * @param plan 条目计划 / the item plan.
 * @param config 运行配置 / run configuration.
 */
export async function applyPlan(
  plan: ItemPlan,
  config: RunConfig,
): Promise<void> {
  const item = plan.item;

  if (config.backupToExtra) {
    const stamp = new Date().toISOString().slice(0, 10);
    const parts = plan.fields.map((p) => `${p.field}=${p.oldVal}`);
    if (plan.authors) parts.push(`creators=${plan.authors.oldC}`);
    const backupLine = `[MetaRefresh ${stamp}] ` + parts.join(" | ");
    const oldExtra = item.getField("extra") || "";
    item.setField("extra", oldExtra ? oldExtra + "\n" + backupLine : backupLine);
  }

  for (const p of plan.fields) {
    item.setField(p.field as any, p.newVal);
  }

  if (plan.authors) {
    const authorTypeID = Zotero.CreatorTypes.getID("author");
    item.setCreators(
      plan.authors.list.map((a) => ({
        firstName: a.firstName || "",
        lastName: a.lastName || "",
        creatorTypeID: authorTypeID,
      })) as any,
    );
  }

  await item.saveTx();
}
