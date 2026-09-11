/**
 * 插件用到的 toolkit 子集。
 *
 * zotero-plugin-toolkit 5.2 起不再从包根导出全家桶 `ZoteroToolkit`,并删掉了
 * 自带的 MenuTool —— 菜单改用 Zotero 原生的 `Zotero.MenuManager`(见
 * `modules/metarefresh/ui.ts`)。这里只挑本插件真正用到的四件套组装,顺带把
 * 打包体积从整包降到按需。
 *
 * The subset of the toolkit this plugin actually uses.
 *
 * Since zotero-plugin-toolkit 5.2 the all-in-one `ZoteroToolkit` is no longer
 * exported from the package root, and its bundled MenuTool is gone — menus now
 * go through Zotero's native `Zotero.MenuManager` (see
 * `modules/metarefresh/ui.ts`). We assemble only the four helpers we need,
 * which also keeps the bundle small.
 */

import {
  BasicTool,
  DialogHelper,
  ProgressWindowHelper,
  UITool,
  unregister,
} from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export { createZToolkit };

/** 本插件的 toolkit / this plugin's toolkit. */
class MetaRefreshToolkit extends BasicTool {
  UI: UITool;
  Dialog: typeof DialogHelper;
  ProgressWindow: typeof ProgressWindowHelper;

  constructor() {
    super();
    this.UI = new UITool(this);
    this.Dialog = DialogHelper;
    this.ProgressWindow = ProgressWindowHelper;
  }

  /** 注销 toolkit 各 manager 建出来的东西 / undo everything the managers made. */
  unregisterAll(): void {
    unregister(this);
  }
}

function createZToolkit() {
  const _ztoolkit = new MetaRefreshToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: MetaRefreshToolkit) {
  const env = __env__;
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = env === "production";
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = env === "development";
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = env === "development";
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`,
  );
}
