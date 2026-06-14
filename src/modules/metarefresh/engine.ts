/**
 * 刷新引擎:读配置、取条目、计算变更计划(干跑)、应用计划、从备份撤销。
 * "计算"与"写回"分离,正是偏好面板「预览 → 确认」流程的基础。
 *
 * The refresh engine: read config, gather items, compute a change plan (the dry
 * run), apply it, and restore from backup. Splitting "compute" from "write" is
 * what powers the preview-then-confirm flow.
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
  TransportError,
} from "./types";
import {
  extractArxivId,
  hasChinese,
  matchConfidence,
  similarity,
} from "./utils";

export type RefreshScope = "selected" | "collection" | "library" | "search";

/**
 * 每轮查询缓存:存 Promise 以便并发时同 key 的请求去重(只发一次)。
 * Per-run query cache storing Promises, so concurrent identical queries dedupe.
 */
export type QueryCache = Map<string, Promise<SourceRecord | null>>;

/** 字段名 → 对应的偏好开关 key / Zotero field → its pref toggle key. */
const FIELD_PREF_MAP: Record<
  string,
  keyof _ZoteroTypes.Prefs["PluginPrefsMap"]
> = {
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

const BACKUP_TAG = "MetaRefresh";

/** 从偏好读取整轮运行配置 / Read the whole-run config from preferences. */
export function readConfig(): RunConfig {
  const fields = Object.keys(FIELD_PREF_MAP).filter((f) =>
    Boolean(getPref(FIELD_PREF_MAP[f])),
  );
  const threshold =
    parseFloat(String(getPref("titleSimilarityThreshold"))) || 0.85;
  const delayMs = parseInt(String(getPref("delayMs")), 10);
  const maxItems = parseInt(String(getPref("maxItems")), 10);
  const concurrency = parseInt(String(getPref("concurrency")), 10);
  return {
    updateAuthors: Boolean(getPref("updateAuthors")),
    upgradePreprints: Boolean(getPref("upgradePreprints")),
    skipChinese: Boolean(getPref("skipChinese")),
    backupToExtra: Boolean(getPref("backupToExtra")),
    fillEmptyOnly: Boolean(getPref("fillEmptyOnly")),
    titleSimilarityThreshold: threshold,
    delayMs: Number.isFinite(delayMs) ? delayMs : 1200,
    contactEmail: String(getPref("contactEmail") || ""),
    s2ApiKey: String(getPref("s2ApiKey") || ""),
    maxItems: Number.isFinite(maxItems) && maxItems > 0 ? maxItems : 200,
    concurrency:
      Number.isFinite(concurrency) && concurrency > 0
        ? Math.min(8, concurrency)
        : 3,
    sources: {
      crossref: Boolean(getPref("useCrossref")),
      openalex: Boolean(getPref("useOpenAlex")),
      s2: Boolean(getPref("useS2")),
      dblp: Boolean(getPref("useDBLP")),
    },
    fields,
  };
}

/** 递归收集集合及其子集合的条目 / collect items from a collection + subcollections. */
function collectItemsRecursive(col: any): Zotero.Item[] {
  const out: Zotero.Item[] = (col.getChildItems() as Zotero.Item[]) || [];
  for (const child of (col.getChildCollections() as any[]) || []) {
    out.push(...collectItemsRecursive(child));
  }
  return out;
}

/** 按范围收集要处理的常规、可编辑、未删除条目(去重)/ gather regular editable items. */
export async function gatherItems(scope: RefreshScope): Promise<Zotero.Item[]> {
  const pane = Zotero.getActiveZoteroPane();
  let items: Zotero.Item[] = [];
  if (scope === "selected") {
    items = pane ? pane.getSelectedItems() : [];
  } else if (scope === "collection") {
    const col = pane ? pane.getSelectedCollection() : undefined;
    if (col) {
      items = getPref("recurseCollections")
        ? collectItemsRecursive(col)
        : (col.getChildItems() as Zotero.Item[]);
    }
  } else if (scope === "search") {
    // 保存的检索:跑检索拿到命中的条目 id 再取条目。
    // Saved search: run it to get matching ids, then fetch the items.
    const search = (pane as any)?.getSelectedSavedSearch?.();
    if (search) {
      const ids = (await search.search()) as number[];
      items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
    }
  } else if (scope === "library") {
    items = (await Zotero.Items.getAll(
      Zotero.Libraries.userLibraryID,
    )) as Zotero.Item[];
  }

  const seen = new Set<number>();
  return (items || []).filter(
    (it) =>
      it &&
      it.isRegularItem &&
      it.isRegularItem() &&
      !(it as any).deleted &&
      (typeof it.isEditable !== "function" || it.isEditable()) &&
      (seen.has(it.id) ? false : (seen.add(it.id), true)),
  );
}

// —— 日期工具 / date helpers ——
const isYearOnly = (s: string): boolean => /^\d{4}$/.test(s.trim());
const hasMonth = (s: string): boolean => /^\d{4}-\d{2}/.test(s.trim());
const yearOf = (s: string): string =>
  (s.trim().match(/^(\d{4})/) || ["", ""])[1];

// —— 作者工具 / author helpers ——
function authorTypeID(): number {
  return Zotero.CreatorTypes.getID("author") as number;
}
function surnameSet(creators: { lastName?: string }[]): Set<string> {
  return new Set(
    creators
      .map((c) => (c.lastName || "").toLowerCase().trim())
      .filter(Boolean),
  );
}
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * 计算单条条目的变更计划。只查询、只比对,绝不写回。
 *
 * Compute the change plan for one item. Queries and diffs only.
 *
 * @param item 目标条目 / target item.
 * @param config 运行配置 / run configuration.
 * @param cache 本轮查询缓存 / this run's query cache.
 */
export async function computePlan(
  item: Zotero.Item,
  config: RunConfig,
  cache: QueryCache = new Map(),
): Promise<ItemPlan> {
  const title = item.getField("title") || "";
  const plan: ItemPlan = {
    item,
    title,
    status: "not_found",
    fields: [],
    authors: null,
    queryLog: [],
    selected: true,
  };

  if (config.skipChinese && hasChinese(title)) {
    plan.status = "skipped";
    plan.reason = "chinese";
    return plan;
  }

  let metadata: SourceRecord | null = null;
  let transport = false; // 是否遇到限流/网络错误 / hit rate-limit/network error
  let matchedExact = false; // 采用的是否精确 ID 命中 / adopted via exact id
  let matchSim = 0; // 采用时的标题相似度 / similarity at adoption
  const doi = item.getField("DOI");
  const arxivId = extractArxivId(item);
  const queryLog = plan.queryLog;

  // 带缓存执行一次源查询。缓存 Promise:并发时同 key 只发一次请求;
  // 若该 Promise 以传输错误 reject,后续同 key 也复用(不再 hammer)。
  // Cache the Promise: concurrent same-key queries share one request; a
  // transport-error rejection is reused too (don't hammer a throttled host).
  const cached = (
    key: string,
    fn: () => Promise<SourceRecord | null>,
  ): Promise<SourceRecord | null> => {
    let p = cache.get(key);
    if (!p) {
      p = fn();
      cache.set(key, p);
    }
    return p;
  };

  // 尝试一个源。exact=true(DOI/arXiv 精确命中)时无条件采用,不过相似度门;
  // exact=false(标题搜索)时需达到相似度阈值。
  // Try a source. exact (DOI/arXiv) adopts unconditionally; title-search must
  // clear the similarity threshold.
  const trySource = async (
    name: string,
    enabled: boolean,
    exact: boolean,
    key: string,
    fn: () => Promise<SourceRecord | null>,
  ): Promise<void> => {
    if (metadata || !enabled) return;
    try {
      const result = await cached(key, fn);
      if (result && result.title) {
        const sim = similarity(title, result.title);
        if (exact) {
          queryLog.push(`${name}: ✓ 命中(精确 ID, sim=${sim.toFixed(2)})`);
          metadata = result;
          matchedExact = true;
          matchSim = sim;
        } else if (sim >= config.titleSimilarityThreshold) {
          queryLog.push(`${name}: ✓ 命中 (sim=${sim.toFixed(2)})`);
          metadata = result;
          matchSim = sim;
        } else {
          queryLog.push(
            `${name}: ✗ 相似度不足 (sim=${sim.toFixed(2)}) "${result.title.slice(0, 50)}"`,
          );
        }
      } else {
        queryLog.push(`${name}: ✗ 未命中`);
      }
    } catch (e: any) {
      if (e instanceof TransportError) {
        transport = true;
        queryLog.push(
          `${name}: ✗ ${e.kind === "rate_limited" ? "限流" : e.kind} (${e.status})`,
        );
      } else {
        queryLog.push(`${name}: ✗ 错误 (${e?.message || e})`);
      }
    }
  };

  if (doi && !String(doi).toLowerCase().includes("arxiv")) {
    await trySource(
      "CrossRef(DOI)",
      config.sources.crossref,
      true,
      `crossref:doi:${doi}`,
      () => queryCrossRef(config, doi),
    );
    await trySource(
      "OpenAlex(DOI)",
      config.sources.openalex,
      true,
      `openalex:doi:${doi}`,
      () => queryOpenAlex(config, doi, "doi"),
    );
    await trySource("S2(DOI)", config.sources.s2, true, `s2:doi:${doi}`, () =>
      queryS2(config, doi, "doi"),
    );
  } else if (arxivId && config.upgradePreprints) {
    await trySource(
      "S2(arXiv)",
      config.sources.s2,
      true,
      `s2:arxiv:${arxivId}`,
      () => queryS2(config, arxivId, "arxiv"),
    );
    if (title) {
      await trySource(
        "OpenAlex(title)",
        config.sources.openalex,
        false,
        `openalex:title:${title}`,
        () => queryOpenAlex(config, title, "title"),
      );
      await trySource(
        "DBLP(title)",
        config.sources.dblp,
        false,
        `dblp:title:${title}`,
        () => queryDBLP(config, title),
      );
    }
  }

  if (!metadata && title) {
    await trySource(
      "S2(title)",
      config.sources.s2,
      false,
      `s2:title:${title}`,
      () => queryS2(config, title, "title"),
    );
    await trySource(
      "OpenAlex(title)",
      config.sources.openalex,
      false,
      `openalex:title:${title}`,
      () => queryOpenAlex(config, title, "title"),
    );
    await trySource(
      "DBLP(title)",
      config.sources.dblp,
      false,
      `dblp:title:${title}`,
      () => queryDBLP(config, title),
    );
    await trySource(
      "CrossRef(title)",
      config.sources.crossref,
      false,
      `crossref:title:${title}`,
      () => queryCrossRefByTitle(config, title),
    );
  }

  if (!metadata) {
    plan.status = transport ? "rate_limited" : "not_found";
    return plan;
  }
  const meta: SourceRecord = metadata!;
  plan.source = meta.source;

  // 字段 diff:白名单内、对类型有效、新值非空、确有变化;日期不降级。
  // Field diff: whitelisted, valid for type, non-empty, actually different;
  // never downgrade a precise date to a bare year.
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
    if (newVal == null || String(newVal).trim() === "") continue;
    const fid = Zotero.ItemFields.getID(field);
    if (!fid || !Zotero.ItemFields.isValidForType(fid, itemTypeID)) continue;
    const oldVal = String(item.getField(field) || "");
    const nv = String(newVal).trim();
    if (oldVal.trim() === nv) continue;
    // 只填空模式:已有非空值则不动 / fill-empty mode: never touch a non-empty field.
    if (config.fillEmptyOnly && oldVal.trim() !== "") continue;
    // 日期:已有精确日期(同年含月)时,不被纯年份覆盖。
    if (
      field === "date" &&
      isYearOnly(nv) &&
      hasMonth(oldVal) &&
      yearOf(oldVal) === nv
    ) {
      continue;
    }
    planned.push({ field, oldVal, newVal: nv });
  }
  plan.fields = planned;

  // 作者:仅在姓氏有合理重叠(或原本无作者)时才计划覆盖,避免误配清空作者。
  // 姓氏重叠也用于置信度计算。
  // Authors: only overwrite when surnames overlap (or there were none); the
  // overlap also feeds the confidence score.
  let surnameOverlap = -1;
  if (meta.authors && meta.authors.length) {
    const atid = authorTypeID();
    const oldCreators = item.getCreators() as any[];
    const oldAuthors = oldCreators.filter((c) => c.creatorTypeID === atid);
    if (oldAuthors.length) {
      surnameOverlap = overlapRatio(
        surnameSet(oldAuthors),
        surnameSet(meta.authors),
      );
    }
    if (config.updateAuthors) {
      // 只填空模式:仅在原本无作者时才填 / fill-empty: only when there were none.
      const allowed = !config.fillEmptyOnly || oldAuthors.length === 0;
      const oldC = oldCreators
        .map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim())
        .join("; ");
      const newC = meta.authors
        .map((a) => `${a.firstName} ${a.lastName}`.trim())
        .join("; ");
      const risky =
        oldAuthors.length > 0 && surnameOverlap >= 0 && surnameOverlap < 0.34;
      if (allowed && oldC !== newC && !risky) {
        plan.authors = { oldC, newC, list: meta.authors } as AuthorPlan;
      } else if (risky) {
        queryLog.push(
          "作者: ✗ 姓氏重叠过低,跳过覆盖 / authors skipped (low overlap)",
        );
      }
    }
  }

  plan.confidence = matchConfidence(matchedExact, matchSim, surnameOverlap);
  plan.status = planned.length || plan.authors ? "would_update" : "nochange";
  return plan;
}

/** 扫描 Extra 里已有的备份行 / parse existing backup lines from Extra. */
function backupLineRegex(): RegExp {
  return new RegExp(`^\\[${BACKUP_TAG} [^\\]]+\\] (\\{.*\\})$`);
}

/**
 * 应用一条计划:写前复读检测冲突,只改未被改动的字段;合并作者(保留编辑/译者);
 * 备份(JSON 行)到 Extra;失败则 discardChanges 回滚。
 *
 * Apply one plan: re-read before write (skip fields changed since the dry run),
 * merge only author-typed creators (keep editors/translators), back up a JSON
 * line to Extra, and discardChanges() on failure.
 *
 * @returns 实际写入的字段(用于结果汇报)/ the fields actually written.
 */
export async function applyPlan(
  plan: ItemPlan,
  config: RunConfig,
): Promise<{ applied: FieldPlan[]; conflicts: string[] }> {
  const item = plan.item;
  if (typeof item.isEditable === "function" && !item.isEditable()) {
    throw new Error("read-only / 只读条目");
  }

  const applied: FieldPlan[] = [];
  const conflicts: string[] = [];

  try {
    // 写前复读:字段自干跑以来被改过则跳过,避免覆盖他人改动。
    for (const p of plan.fields) {
      const current = String(item.getField(p.field) || "").trim();
      if (current !== p.oldVal.trim()) {
        conflicts.push(p.field);
        continue;
      }
      item.setField(p.field as any, p.newVal);
      applied.push(p);
    }

    let oldCreatorsForBackup: any[] | undefined;
    if (plan.authors) {
      const atid = authorTypeID();
      const existing = item.getCreators() as any[];
      oldCreatorsForBackup = existing.map((c) => ({ ...c }));
      const preserved = existing.filter((c) => c.creatorTypeID !== atid);
      const newAuthors = plan.authors.list.map((a) =>
        a.fieldMode === 1
          ? { creatorTypeID: atid, lastName: a.lastName, fieldMode: 1 }
          : {
              creatorTypeID: atid,
              firstName: a.firstName || "",
              lastName: a.lastName || "",
            },
      );
      item.setCreators([...newAuthors, ...preserved] as any);
    }

    // 备份到 Extra(JSON 行,LIFO);仅备份实际写入的字段。
    if (config.backupToExtra && (applied.length || plan.authors)) {
      const payload: any = {};
      if (applied.length) {
        payload.fields = {};
        for (const p of applied) payload.fields[p.field] = p.oldVal;
      }
      if (plan.authors && oldCreatorsForBackup) {
        payload.creators = oldCreatorsForBackup;
      }
      const stamp = new Date().toISOString();
      const line = `[${BACKUP_TAG} ${stamp}] ${JSON.stringify(payload)}`;
      const oldExtra = item.getField("extra") || "";
      item.setField("extra", oldExtra ? oldExtra + "\n" + line : line);
    }

    await item.saveTx();
  } catch (e) {
    try {
      if (typeof (item as any).discardChanges === "function") {
        (item as any).discardChanges();
      }
    } catch {
      /* ignore rollback failure */
    }
    throw e;
  }

  return { applied, conflicts };
}

/** 撤销计划 / a restore (undo) plan parsed from the latest backup line. */
export interface RestorePlan {
  item: Zotero.Item;
  title: string;
  fields: { field: string; current: string; restoreTo: string }[];
  hasCreators: boolean;
  newExtra: string;
}

/**
 * 解析条目 Extra 里最近一条 MetaRefresh 备份,生成撤销计划(LIFO)。
 *
 * Parse the latest MetaRefresh backup line into a restore plan (LIFO undo).
 */
export function computeRestore(item: Zotero.Item): RestorePlan | null {
  const extra = item.getField("extra") || "";
  const lines = extra.split("\n");
  const re = backupLineRegex();
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (re.test(lines[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const m = lines[idx].match(re);
  let payload: any;
  try {
    payload = JSON.parse(m![1]);
  } catch {
    return null;
  }
  const fields: RestorePlan["fields"] = [];
  for (const [field, oldVal] of Object.entries(payload.fields || {})) {
    fields.push({
      field,
      current: String(item.getField(field as any) || ""),
      restoreTo: String(oldVal),
    });
  }
  const newLines = lines.slice(0, idx).concat(lines.slice(idx + 1));
  return {
    item,
    title: item.getField("title") || "",
    fields,
    hasCreators: Array.isArray(payload.creators),
    newExtra: newLines.join("\n").replace(/\n+$/g, ""),
  };
}

/** 应用撤销:把字段/作者写回备份的旧值,并移除该备份行 / apply the undo. */
export async function applyRestore(item: Zotero.Item): Promise<boolean> {
  const extra = item.getField("extra") || "";
  const lines = extra.split("\n");
  const re = backupLineRegex();
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (re.test(lines[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return false;
  let payload: any;
  try {
    payload = JSON.parse(lines[idx].match(re)![1]);
  } catch {
    return false;
  }
  for (const [field, oldVal] of Object.entries(payload.fields || {})) {
    item.setField(field as any, String(oldVal));
  }
  if (Array.isArray(payload.creators)) {
    item.setCreators(payload.creators);
  }
  const newExtra = lines
    .slice(0, idx)
    .concat(lines.slice(idx + 1))
    .join("\n")
    .replace(/\n+$/g, "");
  item.setField("extra", newExtra);
  await item.saveTx();
  return true;
}
