/**
 * 插件生命周期钩子。bootstrap.js 调用这些函数串起整个插件。
 *
 * Plugin lifecycle hooks. bootstrap.js calls these to drive the plugin.
 */

import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerMenus, unregisterMenus } from "./modules/metarefresh/ui";
import {
  registerColumns,
  registerItemPaneSection,
  unregisterNative,
} from "./modules/metarefresh/native";

/** 注册偏好设置面板 / Register the preferences pane. */
function registerPrefs(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    // 固定 id,供"打开设置"按钮定位本面板 / stable id for the Open Settings button.
    id: `zotero-prefpane-${addon.data.config.addonRef}`,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-pane-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

/** 启动一次:建 ztoolkit,注册偏好面板、菜单、列与 item-pane 区(均为全局)。 */
async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  // 全部一次性注册:Zotero 10 的菜单/列/面板都是原生 API,按 pluginID 管理,
  // 由 Zotero 负责把它们铺到每一个窗口,不需要逐窗口重注册。
  // Everything registers once: on Zotero 10 menus, columns and sections are all
  // native, pluginID-scoped APIs, and Zotero itself propagates them to every
  // window — no per-window re-registration needed.
  addon.data.ztoolkit = createZToolkit();
  registerPrefs();
  registerMenus();
  // 原生列与 item-pane 体检区(各自内部 try/catch,失败不影响启动)。
  // Native columns + item-pane section (each guarded; failure won't break load).
  registerColumns();
  registerItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

/**
 * 每个主窗口加载时:注入 ftl。菜单项与 item-pane 体检区的标签都是 l10nID,
 * 必须在该窗口的 document 里挂上本插件的 ftl 才解析得出来。
 *
 * Per main window: inject the ftl. Both the menu items and the item-pane
 * section carry l10nIDs, which only resolve once this plugin's ftl is linked
 * into that window's document.
 */
async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  try {
    win.MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-mainWindow.ftl`,
    );
  } catch {
    /* l10n 注入是尽力而为 / l10n injection is best-effort */
  }
}

/** 主窗口卸载时:仅关闭可能开着的对话框,不在此注销全局菜单。 */

async function onMainWindowUnload(_win: Window): Promise<void> {
  addon.data.dialog?.window?.close();
}

/** 插件关闭:在此统一注销 / unregister everything on shutdown only. */
function onShutdown(): void {
  unregisterMenus();
  unregisterNative();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/** 偏好面板事件分发(XHTML 的 onload 回调到这里)。 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
