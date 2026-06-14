/**
 * Zotero 原生 UI 集成:自定义条目列(Published? / Citations)与 item-pane 体检区。
 * 所有注册都包 try/catch —— 即便某 API 在某版本不可用,也不拖垮插件启动。
 *
 * Native Zotero UI integration: custom item-tree columns (Published? / Citations)
 * and an item-pane "health" section. Every registration is wrapped in try/catch
 * so an API that's missing on some version can't break plugin startup.
 */

import { config } from "../../../package.json";
import { isArxivOnlyPreprint, readCitationCount } from "./engine";
import { runRefresh, runRestore } from "./ui";
import { extractArxivId } from "./utils";

const registeredColumns: string[] = [];
let sectionID: string | false = false;

function esc(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Extra 里最近一次刷新的日期 / date of the latest MetaRefresh backup line. */
function lastRefreshed(item: Zotero.Item): string {
  let last = "";
  for (const l of (item.getField("extra") || "").split("\n")) {
    const m = l.match(/\[MetaRefresh (\d{4}-\d{2}-\d{2})/);
    if (m) last = m[1];
  }
  return last;
}

/** 注册两个自定义列 / register the two custom columns. */
function regColumn(opts: any): void {
  try {
    const mgr = (Zotero as any).ItemTreeManager;
    if (!mgr) return;
    if (typeof mgr.registerColumn === "function") {
      const key = mgr.registerColumn(opts);
      if (typeof key === "string") registeredColumns.push(key);
    } else if (typeof mgr.registerColumns === "function") {
      // Zotero 7 异步变体 / async variant; pluginID auto-cleans on shutdown.
      mgr.registerColumns(opts);
    }
  } catch (e) {
    ztoolkit.log("[MetaRefresh] registerColumn failed", e);
  }
}

export function registerColumns(): void {
  regColumn({
    dataKey: "metarefreshPublished",
    label: "Published?",
    pluginID: config.addonID,
    dataProvider: (item: Zotero.Item) => {
      try {
        if (!extractArxivId(item)) return "";
        return isArxivOnlyPreprint(item) ? "📄 preprint" : "✓ published";
      } catch {
        return "";
      }
    },
  });
  regColumn({
    dataKey: "metarefreshCitations",
    label: "Citations",
    pluginID: config.addonID,
    dataProvider: (item: Zotero.Item) => {
      try {
        const n = readCitationCount(item);
        return n == null ? "" : String(n);
      } catch {
        return "";
      }
    },
  });
}

/** 体检区内容(同步,只读条目字段)/ health section content (sync, reads fields). */
function healthHtml(item: Zotero.Item | undefined): string {
  if (!item || !(item.isRegularItem && item.isRegularItem())) {
    return `<div style="padding:6px;color:#999;">—</div>`;
  }
  const rows: string[] = [];
  if (extractArxivId(item)) {
    rows.push(
      isArxivOnlyPreprint(item)
        ? "📄 arXiv 预印本(未发表)/ preprint"
        : "✓ 已发表 / published",
    );
  }
  const checkFields = ["DOI", "abstractNote", "date", "publicationTitle"];
  const missing = checkFields.filter(
    (f) => !String(item.getField(f as any) || "").trim(),
  );
  rows.push(
    missing.length
      ? `缺字段 / missing: ${esc(missing.join(", "))}`
      : "关键字段齐全 / key fields present",
  );
  const cc = readCitationCount(item);
  if (cc != null) rows.push(`引用数 / citations: ${cc}`);
  const lr = lastRefreshed(item);
  rows.push(
    lr ? `上次刷新 / last refreshed: ${esc(lr)}` : "尚未刷新 / never refreshed",
  );
  return (
    `<div style="font-size:13px;line-height:1.7;padding:4px 2px;font-family:sans-serif;">` +
    rows.map((r) => `<div>${r}</div>`).join("") +
    `</div>`
  );
}

/** 注册 item-pane 体检区 / register the item-pane health section. */
export function registerItemPaneSection(): void {
  try {
    const mgr = (Zotero as any).ItemPaneManager;
    if (!mgr?.registerSection) return;
    const icon = `chrome://${config.addonRef}/content/icons/favicon.png`;
    const smallIcon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`;
    sectionID = mgr.registerSection({
      paneID: `${config.addonRef}-health`,
      pluginID: config.addonID,
      header: { l10nID: `${config.addonRef}-pane-header`, icon },
      sidenav: { l10nID: `${config.addonRef}-pane-sidenav`, icon: smallIcon },
      onRender: ({ body, item }: any) => {
        try {
          body.innerHTML = healthHtml(item);
        } catch (e) {
          ztoolkit.log("[MetaRefresh] pane render failed", e);
        }
      },
      onItemChange: ({ body, item, setEnabled }: any) => {
        try {
          setEnabled?.(true);
          body.innerHTML = healthHtml(item);
        } catch {
          /* ignore */
        }
      },
      sectionButtons: [
        {
          type: "metarefresh-refresh",
          icon: smallIcon,
          l10nID: `${config.addonRef}-pane-refresh`,
          onClick: () => void runRefresh("selected"),
        },
        {
          type: "metarefresh-restore",
          icon: smallIcon,
          l10nID: `${config.addonRef}-pane-restore`,
          onClick: () => void runRestore(),
        },
      ],
    });
  } catch (e) {
    ztoolkit.log("[MetaRefresh] registerItemPaneSection failed", e);
  }
}

/** 注销列与体检区(关闭插件时)/ unregister columns and section on shutdown. */
export function unregisterNative(): void {
  try {
    const mgr = (Zotero as any).ItemTreeManager;
    for (const k of registeredColumns) mgr?.unregisterColumn?.(k);
    registeredColumns.length = 0;
  } catch {
    /* ignore */
  }
  try {
    if (sectionID) {
      (Zotero as any).ItemPaneManager?.unregisterSection?.(sectionID);
      sectionID = false;
    }
  } catch {
    /* ignore */
  }
}
