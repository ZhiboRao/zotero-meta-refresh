/**
 * 用户界面与编排:菜单入口、查询进度、预览(逐条勾选)、确认后应用、撤销。
 *
 * UI and orchestration: menu entries, query progress, preview (with per-item
 * checkboxes), apply-on-confirm, and restore-from-backup.
 */

import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  applyPlan,
  applyRestore,
  computePlan,
  computeRestore,
  gatherItems,
  QueryCache,
  readConfig,
  RefreshScope,
  RestorePlan,
} from "./engine";
import { ItemPlan, RunConfig } from "./types";

/** 预览里最多渲染多少块,避免超大批量把对话框撑爆 / render cap. */
const RENDER_CAP = 200;

/**
 * 有界并发执行:同时最多 `concurrency` 个 worker 从队列取下一个 index 处理。
 *
 * Bounded-concurrency runner: at most `concurrency` workers pull the next index.
 */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  };
  const lanes = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: lanes }, () => run()));
}

/**
 * 查询阶段(可取消)。用一个无模态对话框显示进度并提供「取消」按钮;
 * 取消后正在处理中的少数条目会跑完,但不再领取新条目,然后整轮中止。
 *
 * Cancellable query phase. A modeless dialog shows progress and a Cancel button;
 * on cancel, the few in-flight items finish but no new items are picked up, and
 * the whole run aborts.
 */
async function runQueryWithCancel(
  items: Zotero.Item[],
  cfg: RunConfig,
): Promise<{ plans: ItemPlan[]; cancelled: boolean; processedCount: number }> {
  const total = items.length;
  const state = { cancelled: false };
  const dialogData: { [k: string]: any } = {};
  const dialog = new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      id: "mr-query-status",
      properties: { innerHTML: `查询中 0/${total} / Querying…` },
      styles: {
        minWidth: "320px",
        padding: "12px 10px",
        fontSize: "13px",
        fontFamily: "sans-serif",
      },
    })
    .addButton("取消 / Cancel", "cancel", {
      callback: () => {
        state.cancelled = true;
      },
    });
  dialog.setDialogData(dialogData).open("元数据刷新 / Refreshing", {
    width: 420,
    height: 150,
    centerscreen: true,
    resizable: false,
  });
  addon.data.dialog = dialog;

  const setStatus = (text: string) => {
    try {
      const el = (dialog as any).window?.document?.getElementById(
        "mr-query-status",
      );
      if (el) el.textContent = text;
    } catch {
      /* window may be closing */
    }
  };

  const cache: QueryCache = new Map();
  const plans: ItemPlan[] = new Array(total);
  let completed = 0;
  await runPool(items, cfg.concurrency, async (item, i) => {
    if (state.cancelled) return; // 不再领取新条目 / stop picking up new items.
    try {
      plans[i] = await computePlan(item, cfg, cache);
    } catch (e: any) {
      plans[i] = {
        item,
        title: item.getField("title") || "(无标题)",
        status: "error",
        reason: e?.message || String(e),
        fields: [],
        authors: null,
        queryLog: [`异常 / error: ${e?.message || e}`],
      };
    }
    completed++;
    setStatus(`查询中 ${completed}/${total} / Querying…`);
  });

  try {
    (dialog as any).window?.close();
  } catch {
    /* already closed by the Cancel button */
  }
  addon.data.dialog = undefined;
  return {
    plans: plans.filter((p): p is ItemPlan => !!p),
    cancelled: state.cancelled,
    processedCount: completed,
  };
}

/** 打开本插件的偏好面板(尽力而为)/ open this plugin's prefs pane (best-effort). */
function openSettings(): void {
  try {
    const ui = (Zotero as any).Utilities?.Internal;
    ui?.openPreferences?.(`zotero-prefpane-${config.addonRef}`);
  } catch {
    /* ignore — opening prefs is best-effort */
  }
}

/**
 * 未填邮箱时的提醒。优先用三按钮 confirmEx(继续 / 取消 / 打开设置);
 * 拿不到 Services 时回退到普通 confirm。返回 true 表示继续刷新。
 *
 * No-email reminder. Prefers a 3-button confirmEx (Continue / Cancel / Open
 * Settings), falling back to a plain confirm. Returns true to proceed.
 */
function remindEmail(win: any): boolean {
  const text =
    "未填写联系邮箱 / No contact email set\n\n" +
    "CrossRef 和 OpenAlex 建议提供邮箱(礼貌池),以获得更稳定的服务。\n" +
    "CrossRef and OpenAlex are more reliable with a contact email (polite pool).";
  let Services: any;
  try {
    Services = (ztoolkit.getGlobal as any)("Services");
  } catch {
    Services = undefined;
  }
  const ps = Services?.prompt;
  if (ps && win) {
    const flags =
      ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
      ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING +
      ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING;
    // 0 = 继续 / Continue, 1 = 取消 / Cancel, 2 = 打开设置 / Open Settings
    const idx = ps.confirmEx(
      win,
      config.addonName,
      text,
      flags,
      "继续 / Continue",
      "取消 / Cancel",
      "打开设置 / Open Settings",
      null,
      { value: false },
    );
    if (idx === 2) {
      openSettings();
      return false;
    }
    return idx === 0;
  }
  // 回退 / fallback.
  return win
    ? win.confirm(
        text +
          "\n\n请在「工具 → 插件 → Zotero Metadata Refresh」中填写。\n仍要继续吗? / Continue anyway?",
      )
    : true;
}

/** 注册全部菜单入口(条目右键、集合右键、工具菜单)/ register all menu entries. */
export function registerMenus(): void {
  const icon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${config.addonRef}-refresh`,
    label: getString("menu-refresh-selected"),
    icon,
    commandListener: () => void runRefresh("selected"),
  });
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${config.addonRef}-restore`,
    label: getString("menu-restore-selected"),
    commandListener: () => void runRestore(),
  });
  // 集合右键菜单也覆盖"保存的检索"——点击时按选中项类型分派。
  // The collection menu also covers saved searches — dispatch by selection.
  ztoolkit.Menu.register("collection", {
    tag: "menuitem",
    id: `zotero-collectionmenu-${config.addonRef}-refresh`,
    label: getString("menu-refresh-collection"),
    icon,
    commandListener: () => void runCollectionOrSearch(),
  });
  ztoolkit.Menu.register("menuTools", {
    tag: "menuitem",
    id: `zotero-menutools-${config.addonRef}-library`,
    label: getString("menu-refresh-library"),
    icon,
    commandListener: () => void runRefresh("library"),
  });
}

// —— HTML helpers ——
function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function trunc(s: string, n: number): string {
  const v = String(s == null ? "" : s);
  return v.length > n ? v.slice(0, n) + "…" : v;
}

/** 按选中项类型分派:保存的检索走 search,否则走 collection / dispatch by selection. */
async function runCollectionOrSearch(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const search = (pane as any)?.getSelectedSavedSearch?.();
  return runRefresh(search ? "search" : "collection");
}

/** 置信度色块徽章 / a coloured confidence badge. */
function confBadge(c?: "high" | "medium" | "low"): string {
  if (!c) return "";
  const map: Record<string, [string, string]> = {
    high: ["#27ae60", "高 high"],
    medium: ["#e67e22", "中 med"],
    low: ["#c0392b", "低 low"],
  };
  const [color, label] = map[c];
  return `<span style="display:inline-block;font-size:0.7em;color:#fff;background:${color};border-radius:3px;padding:0 5px;margin-left:6px;vertical-align:middle;">${label}</span>`;
}
function logHtml(lines: string[]): string {
  if (!lines || !lines.length) return "";
  return (
    `<details style="margin:2px 0 2px 12px;"><summary style="cursor:pointer;color:#999;font-size:0.85em;">查询日志 / log</summary>` +
    `<div style="color:#999;font-size:0.82em;white-space:pre-wrap;margin-left:8px;">${esc(lines.join("\n"))}</div></details>`
  );
}

/** 渲染预览 HTML;每个待更新条目带一个默认勾选的复选框 / preview with checkboxes. */
function buildPreviewHtml(plans: ItemPlan[], updatable: ItemPlan[]): string {
  const counts: Record<string, number> = {
    would_update: 0,
    nochange: 0,
    not_found: 0,
    skipped: 0,
    rate_limited: 0,
    error: 0,
  };
  for (const p of plans) counts[p.status] = (counts[p.status] || 0) + 1;

  const summary =
    `<div style="font-weight:600;margin-bottom:8px;">` +
    `共 ${plans.length} 条 — 将更新 ${counts.would_update}，无变化 ${counts.nochange}，` +
    `未找到 ${counts.not_found}，跳过(中文) ${counts.skipped}` +
    (counts.rate_limited ? `，限流 ${counts.rate_limited}` : "") +
    (counts.error ? `，异常 ${counts.error}` : "") +
    `</div>`;

  const blocks: string[] = [];
  const shown = updatable.slice(0, RENDER_CAP);
  shown.forEach((p, i) => {
    const rows: string[] = [];
    for (const f of p.fields) {
      rows.push(
        `<div style="margin:1px 0 1px 24px;">` +
          `<span style="color:#888;">${esc(f.field)}</span>: ` +
          `<span style="text-decoration:line-through;color:#c0392b;">${esc(trunc(f.oldVal, 60))}</span> → ` +
          `<span style="color:#27ae60;">${esc(trunc(f.newVal, 60))}</span></div>`,
      );
    }
    if (p.authors) {
      rows.push(
        `<div style="margin:1px 0 1px 24px;">` +
          `<span style="color:#888;">creators</span>: ` +
          `<span style="text-decoration:line-through;color:#c0392b;">${esc(trunc(p.authors.oldC, 60))}</span> → ` +
          `<span style="color:#27ae60;">${esc(trunc(p.authors.newC, 60))}</span></div>`,
      );
    }
    // 低置信度默认不勾选,需用户主动确认 / low confidence starts unchecked.
    const checkedAttr = p.confidence === "low" ? "" : "checked";
    blocks.push(
      `<div style="padding:6px 4px;border-bottom:1px solid #eee;">` +
        `<label style="font-weight:600;cursor:pointer;display:block;">` +
        `<input type="checkbox" data-plan-idx="${i}" ${checkedAttr} style="margin-right:6px;vertical-align:middle;">` +
        `${esc(trunc(p.title, 80))}${confBadge(p.confidence)}</label>` +
        `<div style="font-size:0.85em;color:#888;margin:2px 0 0 24px;">源=${esc(p.source || "")} · ${p.fields.length} 字段${p.authors ? " + 作者" : ""}</div>` +
        rows.join("") +
        `</div>`,
    );
  });
  if (updatable.length > RENDER_CAP) {
    blocks.push(
      `<div style="padding:6px 4px;color:#888;">…还有 ${updatable.length - RENDER_CAP} 条将更新(未逐条显示,默认全部应用) / and ${updatable.length - RENDER_CAP} more</div>`,
    );
  }

  const misses = plans.filter(
    (p) =>
      p.status === "not_found" ||
      p.status === "skipped" ||
      p.status === "rate_limited" ||
      p.status === "error",
  );
  let missHtml = "";
  if (misses.length) {
    const items = misses
      .slice(0, RENDER_CAP)
      .map(
        (p) =>
          `<div style="margin-left:12px;color:#999;">[${p.status}] ${esc(trunc(p.title, 70))}${logHtml(p.queryLog)}</div>`,
      )
      .join("");
    missHtml = `<details style="margin-top:8px;"><summary style="cursor:pointer;color:#888;">未更新的 ${misses.length} 条 / not updated</summary>${items}</details>`;
  }

  const body =
    blocks.length > 0
      ? blocks.join("")
      : `<div style="color:#888;padding:8px;">没有需要更新的条目。</div>`;
  return (
    `<div style="font-family:sans-serif;font-size:13px;min-width:560px;max-width:780px;">` +
    summary +
    `<div style="max-height:400px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;padding:4px;">${body}</div>` +
    missHtml +
    `</div>`
  );
}

/** 弹预览对话框,返回是否应用 + 被取消勾选的(待更新)索引集合 / preview result. */
async function showPreviewDialog(
  plans: ItemPlan[],
  updatable: ItemPlan[],
): Promise<{ apply: boolean; excluded: Set<number> }> {
  const dialogData: { [k: string]: any } = {};
  const excluded = new Set<number>();
  const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
    tag: "div",
    namespace: "html",
    properties: { innerHTML: buildPreviewHtml(plans, updatable) },
  });
  if (updatable.length > 0) {
    dialog.addButton(`应用更新 (${updatable.length}) / Apply`, "apply", {
      callback: () => {
        try {
          const doc = (dialog as any).window?.document;
          doc?.querySelectorAll("input[data-plan-idx]").forEach((el: any) => {
            if (!el.checked)
              excluded.add(parseInt(el.getAttribute("data-plan-idx"), 10));
          });
        } catch {
          /* read failure → apply all */
        }
      },
    });
    dialog.addButton("取消 / Cancel", "cancel");
  } else {
    dialog.addButton("关闭 / Close", "cancel");
  }
  dialog.setDialogData(dialogData).open("元数据刷新预览 / Refresh preview", {
    width: 860,
    height: 620,
    centerscreen: true,
    resizable: true,
  });
  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;
  return { apply: dialogData._lastButtonId === "apply", excluded };
}

/** 通用确认对话框(用于撤销预览、结果汇报)/ generic confirm dialog. */
async function showConfirmDialog(
  title: string,
  innerHTML: string,
  applyLabel: string | null,
): Promise<boolean> {
  const dialogData: { [k: string]: any } = {};
  const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
    tag: "div",
    namespace: "html",
    properties: { innerHTML },
  });
  if (applyLabel) {
    dialog.addButton(applyLabel, "apply");
    dialog.addButton("取消 / Cancel", "cancel");
  } else {
    dialog.addButton("关闭 / Close", "cancel");
  }
  dialog.setDialogData(dialogData).open(title, {
    width: 760,
    height: 520,
    centerscreen: true,
    resizable: true,
  });
  addon.data.dialog = dialog;
  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;
  return dialogData._lastButtonId === "apply";
}

function popup(text: string, type: "default" | "success" | "fail" = "default") {
  new ztoolkit.ProgressWindow(config.addonName)
    .createLine({ text, type, progress: 100 })
    .show();
}

/**
 * 一轮完整流程:取条目 → (大范围确认) → (邮箱提醒) → 干跑 → 预览 → 应用。
 *
 * One full run: gather → (large-scope confirm) → (email reminder) → dry run →
 * preview → apply.
 */
export async function runRefresh(scope: RefreshScope): Promise<void> {
  const cfg: RunConfig = readConfig();
  let items = await gatherItems(scope);

  if (!items.length) {
    popup("没有可处理的条目 / No items to process");
    return;
  }

  const win = Zotero.getMainWindow();

  // 大范围(集合/整库):截断到上限,并给出数量与耗时预估,确认后再跑。
  if (scope !== "selected") {
    if (items.length > cfg.maxItems) items = items.slice(0, cfg.maxItems);
    const nSources =
      [
        cfg.sources.crossref,
        cfg.sources.openalex,
        cfg.sources.s2,
        cfg.sources.dblp,
      ].filter(Boolean).length || 1;
    const estSec = Math.round((items.length * nSources * cfg.delayMs) / 1000);
    const where =
      scope === "library"
        ? "整个文献库 / whole library"
        : "当前集合 / this collection";
    const msg =
      `将处理 ${items.length} 条(${where})。\n` +
      `预计约 ${estSec}s(受网络与限流影响)。\n` +
      `Will process ${items.length} items, ~${estSec}s.\n\n继续? / Continue?`;
    if (win && !win.confirm(msg)) return;
  }

  // 未填联系邮箱时提醒(仅当用到邮箱的源开启)/ remind when no email.
  if (
    !cfg.contactEmail.trim() &&
    (cfg.sources.crossref || cfg.sources.openalex)
  ) {
    if (!remindEmail(win)) return;
  }

  // 查询阶段(带「取消」按钮,选多了可随时中止)/ cancellable query phase.
  const { plans, cancelled, processedCount } = await runQueryWithCancel(
    items,
    cfg,
  );
  if (cancelled) {
    popup(`已取消查询 / Query cancelled (${processedCount}/${items.length})`);
    return;
  }

  const updatable = plans.filter((p) => p.status === "would_update");
  const { apply, excluded } = await showPreviewDialog(plans, updatable);
  if (!apply) return;
  const finalPlans = updatable.filter((_, i) => !excluded.has(i));
  if (!finalPlans.length) {
    popup("未选择任何条目 / Nothing selected");
    return;
  }

  // 应用阶段 / apply phase.
  const applyProgress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: `应用中 0/${finalPlans.length} / Applying`,
      type: "default",
      progress: 0,
    })
    .show();

  let done = 0;
  const failures: { title: string; reason: string }[] = [];
  const conflicts: { title: string; fields: string[] }[] = [];
  let n = 0;
  for (const plan of finalPlans) {
    n++;
    try {
      const r = await applyPlan(plan, cfg);
      done++;
      if (r.conflicts.length)
        conflicts.push({ title: plan.title, fields: r.conflicts });
    } catch (e: any) {
      failures.push({ title: plan.title, reason: e?.message || String(e) });
    }
    applyProgress.changeLine({
      text: `应用中 ${n}/${finalPlans.length} / Applying`,
      progress: Math.round((n / finalPlans.length) * 100),
    });
  }
  applyProgress.changeLine({
    text:
      `完成 / Done — 已更新 ${done}` +
      (failures.length ? `，失败 ${failures.length}` : ""),
    type: failures.length ? "fail" : "success",
    progress: 100,
  });
  applyProgress.startCloseTimer(4000);

  // 失败/冲突逐条列出 / itemize failures and conflicts.
  if (failures.length || conflicts.length) {
    const fHtml = failures.length
      ? `<div style="font-weight:600;color:#c0392b;margin-top:6px;">失败 / failed (${failures.length})</div>` +
        failures
          .map(
            (f) =>
              `<div style="margin-left:12px;">${esc(trunc(f.title, 70))} — ${esc(f.reason)}</div>`,
          )
          .join("")
      : "";
    const cHtml = conflicts.length
      ? `<div style="font-weight:600;color:#b8860b;margin-top:6px;">字段已被改动而跳过 / skipped (changed since preview) (${conflicts.length})</div>` +
        conflicts
          .map(
            (c) =>
              `<div style="margin-left:12px;">${esc(trunc(c.title, 70))} — ${esc(c.fields.join(", "))}</div>`,
          )
          .join("")
      : "";
    await showConfirmDialog(
      "应用结果 / Apply report",
      `<div style="font-family:sans-serif;font-size:13px;min-width:480px;">已更新 ${done} 条。${fHtml}${cHtml}</div>`,
      null,
    );
  }
}

/** 撤销:对选中条目应用 Extra 里最近一次 MetaRefresh 备份(LIFO)/ undo. */
export async function runRestore(): Promise<void> {
  const pane = Zotero.getActiveZoteroPane();
  const items = (pane ? pane.getSelectedItems() : []).filter(
    (it) => it && it.isRegularItem && it.isRegularItem(),
  );
  if (!items.length) {
    popup("没有选中条目 / No items selected");
    return;
  }
  const plans = items
    .map((it) => computeRestore(it))
    .filter((p): p is RestorePlan => !!p);
  if (!plans.length) {
    popup("选中条目没有 MetaRefresh 备份 / No backup to restore");
    return;
  }

  const html =
    `<div style="font-family:sans-serif;font-size:13px;min-width:520px;max-width:780px;">` +
    `<div style="font-weight:600;margin-bottom:8px;">将撤销最近一次刷新,共 ${plans.length} 条 / restore latest refresh:</div>` +
    `<div style="max-height:400px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;padding:4px;">` +
    plans
      .slice(0, RENDER_CAP)
      .map((p) => {
        const rows = p.fields
          .map(
            (f) =>
              `<div style="margin-left:12px;"><span style="color:#888;">${esc(f.field)}</span>: ` +
              `<span style="text-decoration:line-through;color:#c0392b;">${esc(trunc(f.current, 50))}</span> → ` +
              `<span style="color:#27ae60;">${esc(trunc(f.restoreTo, 50))}</span></div>`,
          )
          .join("");
        return (
          `<div style="padding:6px 4px;border-bottom:1px solid #eee;">` +
          `<div style="font-weight:600;">${esc(trunc(p.title, 80))}</div>` +
          rows +
          (p.hasCreators
            ? `<div style="margin-left:12px;color:#888;">+ 恢复作者 / restore creators</div>`
            : "") +
          `</div>`
        );
      })
      .join("") +
    `</div></div>`;

  const ok = await showConfirmDialog(
    "撤销预览 / Restore preview",
    html,
    `恢复 (${plans.length}) / Restore`,
  );
  if (!ok) return;

  let done = 0;
  let failed = 0;
  for (const p of plans) {
    try {
      if (await applyRestore(p.item)) done++;
    } catch {
      failed++;
    }
  }
  popup(
    `撤销完成 / Restored ${done}` + (failed ? `，失败 ${failed}` : ""),
    failed ? "fail" : "success",
  );
}
