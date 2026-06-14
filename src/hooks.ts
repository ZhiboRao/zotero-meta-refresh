/**
 * 插件生命周期钩子。bootstrap.js 调用这些函数串起整个插件。
 *
 * Plugin lifecycle hooks. bootstrap.js calls these to drive the plugin.
 */

import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerRefreshMenu } from "./modules/metarefresh/ui";

/**
 * 注册偏好设置面板。
 *
 * Register the preferences pane.
 */
function registerPrefs(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-pane-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

/** 启动一次 / Runs once on plugin load. */
async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  registerPrefs();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // 供插件外部(如 scaffold 测试)确认加载完成。
  // Confirms load completion for code outside the plugin (e.g. scaffold tests).
  addon.data.initialized = true;
}

/** 每个主窗口加载时 / Runs for each main window. */

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  registerRefreshMenu();
}

/** 主窗口卸载时 / Runs when a main window unloads. */

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

/** 插件关闭 / Plugin shutdown. */
function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * 偏好面板事件分发(XHTML 的 onload 会回调到这里)。
 *
 * Preference-pane event dispatch (the XHTML onload calls back here).
 */
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
