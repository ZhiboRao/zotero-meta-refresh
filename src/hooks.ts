/**
 * 插件生命周期钩子。bootstrap.js 调用这些函数串起整个插件。
 *
 * Plugin lifecycle hooks. bootstrap.js calls these to drive the plugin.
 */

import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerMenus } from "./modules/metarefresh/ui";
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

/** 启动一次:建 ztoolkit、注册偏好面板与菜单(全局,一次即可)。 */
async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  // ztoolkit 是全局的,启动时建一次;菜单改为逐窗口注册(见 onMainWindowLoad),
  // 因为 toolkit 把 menuitem 插进具体某个窗口的 document,只注册一次会漏掉别的窗口。
  // ztoolkit is global (build once at startup); menus are now registered
  // per-window in onMainWindowLoad — the toolkit inserts each menuitem into one
  // window's document, so a single startup registration misses other windows.
  addon.data.ztoolkit = createZToolkit();
  registerPrefs();
  // 原生列与 item-pane 体检区(各自内部 try/catch,失败不影响启动)。
  // Native columns + item-pane section (each guarded; failure won't break load).
  registerColumns();
  registerItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

/** 每个主窗口加载时:注入 item-pane 用到的 ftl,并为该窗口注册菜单。 */
async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  try {
    win.MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-mainWindow.ftl`,
    );
  } catch {
    /* item-pane l10n is best-effort */
  }
  // 逐窗口注册右键/工具菜单:toolkit 把元素插进具体 document,新开或(尤其 macOS)
  // 从 Dock 重开的窗口必须各注册一次,否则右键里没有本插件的入口。
  // Register menus per window: the toolkit inserts elements into a specific
  // document, so every newly opened or (notably on macOS) dock-reopened window
  // must register its own copy — otherwise its right-click menu lacks our entries.
  registerMenus(win);
}

/** 主窗口卸载时:仅关闭可能开着的对话框,不在此注销全局菜单。 */

async function onMainWindowUnload(_win: Window): Promise<void> {
  addon.data.dialog?.window?.close();
}

/** 插件关闭:在此统一注销 / unregister everything on shutdown only. */
function onShutdown(): void {
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
