/**
 * 用户界面与编排:右键菜单入口、查询进度、预览对话框、确认后应用。
 *
 * UI and orchestration: the right-click menu entry, the query-progress
 * window, the preview dialog, and applying on confirm.
 */

import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import {
  applyPlan,
  computePlan,
  gatherItems,
  readConfig,
  RefreshScope,
} from "./engine";
import { ItemPlan, RunConfig } from "./types";

/**
 * 在条目右键菜单注册「刷新元数据(预览)」入口。
 *
 * Register the "Refresh metadata (preview)" entry on the item context menu.
 */
export function registerRefreshMenu(): void {
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: `zotero-itemmenu-${config.addonRef}-refresh`,
    label: getString("menu-refresh-selected"),
    icon: `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`,
    commandListener: () => {
      void runRefresh("selected");
    },
  });
}

/** HTML 转义,防止标题里的尖括号破坏预览 / Escape HTML in titles. */
function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 截断显示 / Truncate for display. */
function trunc(s: string, n: number): string {
  const v = String(s == null ? "" : s);
  return v.length > n ? v.slice(0, n) + "…" : v;
}

/**
 * 把所有计划渲染成预览 HTML。
 *
 * Render all plans into the preview HTML.
 */
function buildPreviewHtml(plans: ItemPlan[]): string {
  const counts = {
    would_update: 0,
    nochange: 0,
    not_found: 0,
    skipped: 0,
    error: 0,
  } as Record<string, number>;
  for (const p of plans) counts[p.status] = (counts[p.status] || 0) + 1;

  const summary =
    `<div style="font-weight:600;margin-bottom:8px;">` +
    `共 ${plans.length} 条 — 将更新 ${counts.would_update}，无变化 ${counts.nochange}，` +
    `未找到 ${counts.not_found}，跳过(中文) ${counts.skipped}` +
    (counts.error ? `，异常 ${counts.error}` : "") +
    `</div>`;

  const blocks: string[] = [];
  for (const p of plans) {
    if (p.status !== "would_update") continue;
    const rows: string[] = [];
    for (const f of p.fields) {
      rows.push(
        `<div style="margin:1px 0 1px 12px;">` +
          `<span style="color:#888;">${esc(f.field)}</span>: ` +
          `<span style="text-decoration:line-through;color:#c0392b;">${esc(
            trunc(f.oldVal, 60),
          )}</span> → ` +
          `<span style="color:#27ae60;">${esc(trunc(f.newVal, 60))}</span>` +
          `</div>`,
      );
    }
    if (p.authors) {
      rows.push(
        `<div style="margin:1px 0 1px 12px;">` +
          `<span style="color:#888;">creators</span>: ` +
          `<span style="text-decoration:line-through;color:#c0392b;">${esc(
            trunc(p.authors.oldC, 60),
          )}</span> → ` +
          `<span style="color:#27ae60;">${esc(trunc(p.authors.newC, 60))}</span>` +
          `</div>`,
      );
    }
    blocks.push(
      `<div style="padding:6px 4px;border-bottom:1px solid #eee;">` +
        `<div style="font-weight:600;">${esc(trunc(p.title, 80))}</div>` +
        `<div style="font-size:0.85em;color:#888;margin-bottom:2px;">` +
        `源=${esc(p.source || "")} · ${p.fields.length} 字段` +
        (p.authors ? " + 作者" : "") +
        `</div>` +
        rows.join("") +
        `</div>`,
    );
  }

  // 未找到 / 跳过的简要列出,便于核对 / brief list of misses for review.
  const misses = plans.filter(
    (p) => p.status === "not_found" || p.status === "skipped",
  );
  let missHtml = "";
  if (misses.length) {
    const items = misses
      .map(
        (p) =>
          `<div style="margin-left:12px;color:#999;">` +
          `[${p.status === "skipped" ? "跳过" : "未找到"}] ${esc(
            trunc(p.title, 70),
          )}</div>`,
      )
      .join("");
    missHtml =
      `<details style="margin-top:8px;"><summary style="cursor:pointer;color:#888;">` +
      `未更新的 ${misses.length} 条</summary>${items}</details>`;
  }

  const body =
    blocks.length > 0
      ? blocks.join("")
      : `<div style="color:#888;padding:8px;">没有需要更新的条目。</div>`;

  return (
    `<div style="font-family:sans-serif;font-size:13px;min-width:560px;max-width:760px;">` +
    summary +
    `<div style="max-height:380px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;padding:4px;">` +
    body +
    `</div>` +
    missHtml +
    `</div>`
  );
}

/**
 * 弹出预览对话框,返回用户是否点了「应用」。
 *
 * Show the preview dialog; resolve to whether the user clicked "Apply".
 *
 * @param plans 全部计划 / all plans.
 * @param updatableCount 可更新条数 / number of updatable items.
 */
async function showPreviewDialog(
  plans: ItemPlan[],
  updatableCount: number,
): Promise<boolean> {
  const dialogData: { [key: string | number]: any } = {};
  const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
    tag: "div",
    namespace: "html",
    properties: { innerHTML: buildPreviewHtml(plans) },
  });

  if (updatableCount > 0) {
    dialog.addButton(`应用更新 (${updatableCount}) / Apply`, "apply");
    dialog.addButton("取消 / Cancel", "cancel");
  } else {
    dialog.addButton("关闭 / Close", "cancel");
  }

  dialog.setDialogData(dialogData).open("元数据刷新预览 / Refresh preview", {
    width: 820,
    height: 560,
    centerscreen: true,
    resizable: true,
  });
  addon.data.dialog = dialog;

  await dialogData.unloadLock?.promise;
  addon.data.dialog = undefined;
  return dialogData._lastButtonId === "apply";
}

/**
 * 一轮完整流程:取条目 → 干跑计算 → 预览 → 确认后应用。
 *
 * One full run: gather → dry-run compute → preview → apply on confirm.
 *
 * @param scope 处理范围 / scope to process.
 */
export async function runRefresh(scope: RefreshScope): Promise<void> {
  const cfg: RunConfig = readConfig();
  const items = await gatherItems(scope);

  if (!items.length) {
    new ztoolkit.ProgressWindow(config.addonName)
      .createLine({
        text: "没有选中常规条目 / No regular items selected",
        type: "default",
        progress: 100,
      })
      .show();
    return;
  }

  // 查询阶段:逐条计算计划,带进度条(网络慢,可能数十秒)。
  // Query phase: compute plans one by one with a progress bar (slow).
  const progress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: `查询中 0/${items.length} / Querying`,
      type: "default",
      progress: 0,
    })
    .show();

  const plans: ItemPlan[] = [];
  let idx = 0;
  for (const item of items) {
    idx++;
    try {
      const plan = await computePlan(item, cfg);
      plans.push(plan);
      ztoolkit.log(
        `[MetaRefresh] [${idx}/${items.length}] ${plan.title} -> ${plan.status}`,
        plan.queryLog,
      );
    } catch (e: any) {
      plans.push({
        item,
        title: item.getField("title") || "(无标题)",
        status: "error",
        reason: e?.message || String(e),
        fields: [],
        authors: null,
        queryLog: [`异常 / error: ${e?.message || e}`],
      });
    }
    progress.changeLine({
      text: `查询中 ${idx}/${items.length} / Querying`,
      progress: Math.round((idx / items.length) * 100),
    });
  }
  progress.changeLine({
    text: `查询完成,生成预览 / Building preview`,
    progress: 100,
  });
  progress.startCloseTimer(1500);

  const updatable = plans.filter((p) => p.status === "would_update");
  const confirmed = await showPreviewDialog(plans, updatable.length);
  if (!confirmed || !updatable.length) return;

  // 应用阶段 / Apply phase.
  const applyProgress = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: `应用中 0/${updatable.length} / Applying`,
      type: "default",
      progress: 0,
    })
    .show();

  let done = 0;
  let failed = 0;
  for (const plan of updatable) {
    try {
      await applyPlan(plan, cfg);
      done++;
    } catch (e: any) {
      failed++;
      ztoolkit.log(`[MetaRefresh] apply failed: ${plan.title}`, e);
    }
    applyProgress.changeLine({
      text: `应用中 ${done + failed}/${updatable.length} / Applying`,
      progress: Math.round(((done + failed) / updatable.length) * 100),
    });
  }
  applyProgress.changeLine({
    text:
      `完成 / Done — 已更新 ${done}` + (failed ? `，失败 ${failed}` : ""),
    type: failed ? "fail" : "success",
    progress: 100,
  });
  applyProgress.startCloseTimer(5000);
}
