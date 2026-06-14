/**
 * 偏好面板脚本。所有控件都用 ``preference="…"`` 与 Zotero.Prefs 自动双向绑定,
 * 因此这里几乎不需要逻辑;保留入口供 XHTML 的 onload 回调,并校验阈值。
 *
 * Preferences-pane script. Every control auto-syncs with Zotero.Prefs via its
 * ``preference="…"`` attribute, so almost no logic is needed here. We keep the
 * entry point for the XHTML onload callback and validate the threshold input.
 */

import { config } from "../../package.json";
import { setPref } from "../utils/prefs";

/**
 * 偏好面板打开时调用(见 preferences.xhtml 的 onload)。
 *
 * Called when the prefs pane opens (see preferences.xhtml onload).
 *
 * @param _window 偏好面板窗口 / the preferences window.
 */
export async function registerPrefsScripts(_window: Window): Promise<void> {
  addon.data.prefs = { window: _window };

  // 阈值输入失焦时做一次温和校验:夹到 [0,1]。
  // On blur, gently clamp the similarity threshold to [0, 1].
  const thresholdInput = _window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-threshold`,
  ) as HTMLInputElement | null;
  thresholdInput?.addEventListener("change", () => {
    let v = parseFloat(thresholdInput.value);
    if (!Number.isFinite(v)) v = 0.85;
    v = Math.min(1, Math.max(0, v));
    const clamped = String(v);
    thresholdInput.value = clamped;
    // 直接落库,避免与 preference 绑定的写入顺序竞争。
    // Persist directly to avoid racing the `preference=` binding's write.
    setPref("titleSimilarityThreshold", clamped);
  });
}
