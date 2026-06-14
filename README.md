# Zotero Metadata Refresh / 元数据刷新

批量刷新 Zotero 条目元数据的插件,数据源:**CrossRef + OpenAlex + Semantic Scholar + DBLP**,带「预览 → 确认」流程、字段白名单、预印本升级、旧值备份。

A Zotero plugin that batch-refreshes item metadata from CrossRef, OpenAlex,
Semantic Scholar and DBLP, with a preview-then-confirm flow, a field
whitelist, preprint upgrade and old-value backup.

> 详细使用说明见 **[doc/USAGE.md](doc/USAGE.md)**(中英文帮助文档)。
> For a full walkthrough and FAQ, see **[doc/USAGE.md](doc/USAGE.md)**.

兼容 **Zotero 7 – 9**(`strict_min_version 7.0`,`strict_max_version 9.*`)。

---

## 安装 / Install

**推荐 / Recommended** — 从 [Releases](../../releases/latest) 下载最新的
`zotero-metadata-refresh.xpi`:

1. 打开 [最新 Release](../../releases/latest),下载 `zotero-metadata-refresh.xpi`。
   Download `zotero-metadata-refresh.xpi` from the [latest Release](../../releases/latest).
2. Zotero → `工具 (Tools)` → `插件 (Plugins)` → 右上齿轮 ⚙ → `Install Plugin From File…`。
3. 选择该 `.xpi`,装好后无需重启即生效。
   Pick the `.xpi`; it takes effect without a restart.

> **自动更新 / Auto-update:** 插件的 `update_url` 指向本仓库,后续发布新版本后
> Zotero 会自动检查并提示更新。
> The plugin's `update_url` points at this repo, so Zotero will offer updates
> automatically once newer releases are published.

## 用法 / Usage

1. 在条目列表里**选中**要刷新的条目(可多选)。
   **Select** the items to refresh in the item list (multi-select OK).
2. **右键** → `刷新元数据(预览)… / Refresh metadata (preview)…`。
3. 插件按白名单与多源 fallback **查询**(底部进度条),全部查完后弹出**预览对话框**:
   逐条列出 `字段: 旧值 → 新值` 与作者变更,**每条前有复选框可单独取消**;汇总「将更新 /
   无变化 / 未找到 / 跳过 / 限流」。
4. 核对无误后点 **`应用更新 / Apply`** 才真正写回(只写勾选的);点 `取消` 则什么都不改。
   Click **Apply** to write the (checked) changes; **Cancel** changes nothing.

> 不再需要原脚本里「先 `dryRun:true` 跑、再改 `false` 重跑」那一套 —— 预览即干跑,确认即应用。
> No more "set dryRun:true, then flip to false and rerun" — the preview _is_ the dry run.

**范围 / Scopes:** 除了选中条目,还可在**集合右键**「刷新本集合…」、或**工具菜单**
「刷新整个文献库…」批量处理(带数量与耗时预估确认,受设置里的上限保护)。
Besides selected items, use the **collection** right-click or the **Tools menu**
to refresh a whole collection / library (with a count + time-estimate confirm and
an item cap).

**撤销 / Undo:** 选中条目 → 右键「从 MetaRefresh 备份恢复…」可回滚最近一次刷新
(从 Extra 备份按 LIFO 恢复字段与作者)。
Right-click selected items → "Restore from MetaRefresh backup…" to undo the latest
refresh (restores fields and creators from the Extra backup, LIFO).

> **联系邮箱提醒 / Contact-email reminder:** 默认不内置任何邮箱。若启用了 CrossRef /
> OpenAlex 又没在设置里填邮箱,运行刷新时会弹出提醒(可继续也可取消)。邮箱用于这两个
> 数据源的「礼貌池」,建议填自己的。
> No email is shipped by default. If CrossRef / OpenAlex is enabled but no
> contact email is set, a reminder appears when you run a refresh. The email is
> used for those APIs' "polite pool" — set your own in Settings.

## 设置 / Settings

`工具 → 插件 → Zotero Metadata Refresh`(或设置窗口左侧「元数据刷新」面板):

- **运行行为**:更新作者 / 预印本升级 / 跳过中文 / 备份旧值到 Extra
- **匹配与限流**:标题相似度阈值(0–1,默认 0.85)、请求间隔(ms,默认 1200)
- **数据源**:CrossRef / OpenAlex / Semantic Scholar / DBLP 各自可开关
- **凭据**:联系邮箱(CrossRef/OpenAlex 礼貌池,默认空)、Semantic Scholar API key(可空)
- **字段白名单**:只有勾选的字段才可能被修改,未勾选的字段**绝不**改动

> 真跑前仍建议备份 `~/Zotero/zotero.sqlite`。被覆盖字段的旧值会写入条目 Extra,可回溯。

界面与详细用法见 **[doc/USAGE.md](doc/USAGE.md)**;版本变化见 **[CHANGELOG.md](CHANGELOG.md)**。
See **[doc/USAGE.md](doc/USAGE.md)** for a full walkthrough and **[CHANGELOG.md](CHANGELOG.md)** for changes.

> 想加截图,可把图放进 `doc/images/` 并在 USAGE 里引用。
> To add screenshots, drop images into `doc/images/` and reference them in USAGE.

---

## 开发 / Development

```bash
npm install                 # 依赖(见下方网络注意事项 / see network note below)
npm run build               # 构建 + 类型检查 / build + type-check;xpi 输出到 dist/
npm start                   # 开发热重载 / hot-reload dev（需本地 Zotero beta + .env）
npm run lint:check          # prettier --check + eslint(CI 会跑这个 / CI runs this)
npm run lint:fix            # prettier --write + eslint --fix
```

源码结构 / Source layout:

| 路径                                 | 作用 / Role                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `src/hooks.ts`                       | 生命周期:注册偏好面板、注册右键菜单 / lifecycle: prefs pane + context menu |
| `src/modules/metarefresh/types.ts`   | 共享类型 / shared types                                                    |
| `src/modules/metarefresh/utils.ts`   | 相似度 / arXiv 提取 / `Zotero.HTTP` JSON                                   |
| `src/modules/metarefresh/sources.ts` | 四个数据源的查询与归一化 / source adapters                                 |
| `src/modules/metarefresh/engine.ts`  | 读配置、取条目、`computePlan`(干跑)、`applyPlan`(写回)                     |
| `src/modules/metarefresh/ui.ts`      | 右键入口、查询进度、预览对话框、确认后应用                                 |
| `src/modules/preferenceScript.ts`    | 偏好面板脚本(控件靠 `preference=` 自动同步)                                |
| `addon/prefs.js`                     | 默认偏好(构建时自动加前缀 `extensions.zotero.metarefresh.*`)               |
| `addon/content/preferences.xhtml`    | 偏好面板 UI                                                                |
| `addon/locale/*/`                    | Fluent 本地化(en-US / zh-CN)                                               |

> 控制台脚本里的 `fetch()` 已替换为 **`Zotero.HTTP.request()`** —— 插件沙箱里跨域 `fetch`
> 可能被 CSP/CORS 拦截,而 `Zotero.HTTP` 是官方特权跨域通道。
> The console script's `fetch()` was replaced with `Zotero.HTTP.request()`:
> cross-origin `fetch` is CSP/CORS-blocked inside the plugin sandbox.

### 发布新版本 / Releasing a new version

1. 改 `package.json` 的 `version`,`npm run build`。
2. 用 `zotero-metadata-refresh.xpi` 建一个 GitHub Release(tag = `vX.Y.Z`)。
3. 更新 `release` tag 上的 `update.json`(指向新版 xpi),Zotero 即可推送更新。
   或直接 `npm run release` 让 scaffold 自动完成第 2–3 步。

### 安装注意 / Install note

`zotero-types` 间接依赖 `zotero/epub.js`(声明为 git+ssh)。若你的环境无法用 ssh 访问
GitHub,先把它改走 https 再安装:
`zotero-types` pulls `zotero/epub.js` as a git+ssh dependency. If your environment
can't reach GitHub over ssh, rewrite it to https before installing:

```bash
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
npm install
```

---

## 许可证 / License

[AGPL-3.0-or-later](LICENSE) — 与所基于的
[windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)
及 `zotero-plugin-toolkit` 保持一致。

Built on [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).
