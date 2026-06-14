/**
 * 插件生命周期钩子。bootstrap.js 调用这些函数串起整个插件。
 *
 * Plugin lifecycle hooks. bootstrap.js calls these to drive the plugin.
 */

import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { registerMenus } from "./modules/metarefresh/ui";

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
  // ztoolkit 与菜单都是全局的,启动时建一次即可,无需每窗口重复。
  // ztoolkit and menus are global; create/register once at startup.
  addon.data.ztoolkit = createZToolkit();
  registerPrefs();
  registerMenus();

  addon.data.initialized = true;
}

/** 每个主窗口加载时:菜单已全局注册,这里无需重复操作。 */

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
  // no-op: menus/ztoolkit registered globally in onStartup.
}

/** 主窗口卸载时:仅关闭可能开着的对话框,不在此注销全局菜单。 */

async function onMainWindowUnload(_win: Window): Promise<void> {
  addon.data.dialog?.window?.close();
}

/** 插件关闭:在此统一注销 / unregister everything on shutdown only. */
function onShutdown(): void {
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
