# Zotero Metadata Refresh / 元数据刷新

批量刷新 Zotero 条目元数据的插件,数据源:**CrossRef + OpenAlex + Semantic Scholar + DBLP**,带「预览 → 确认」流程、字段白名单、预印本升级、旧值备份。

A Zotero plugin that batch-refreshes item metadata from CrossRef, OpenAlex,
Semantic Scholar and DBLP, with a preview-then-confirm flow, a field
whitelist, preprint upgrade and old-value backup.

> 由原「Run JavaScript 控制台脚本」改造而来,核心刷新逻辑保持一致。
> Rebuilt from the original "Run JavaScript" console script; the core
> refresh logic is unchanged. Built on
> [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).

兼容 **Zotero 7 – 9**(`strict_min_version 7.0`,`strict_max_version 9.*`)。

---

## 安装 / Install

打包好的插件在:**`dist/zotero-metadata-refresh.xpi`**(每次 `npm run build` 后自动更新)

1. Zotero → 菜单 `工具 (Tools)` → `插件 (Plugins)`。
2. 右上角齿轮 ⚙ → `Install Plugin From File…`。
3. 选择上面的 `.xpi`。装好后无需重启即生效。

## 用法 / Usage

1. 在条目列表里**选中**要刷新的条目(可多选)。
2. **右键** → `刷新元数据(预览)… / Refresh metadata (preview)…`。
3. 插件按白名单与多源 fallback **查询**(底部进度条),全部查完后弹出**预览对话框**:
   逐条列出 `字段: 旧值 → 新值` 与作者变更,并汇总「将更新 / 无变化 / 未找到 / 跳过」。
4. 核对无误后点 **`应用更新 / Apply`** 才真正写回;点 `取消` 则什么都不改。

> 不再需要原脚本里「先 `dryRun:true` 跑、再改 `false` 重跑」那一套 —— 预览即干跑,确认即应用。
> No more "set dryRun:true, then flip to false and rerun" — the preview *is* the dry run.

## 设置 / Settings

`工具 → 插件 → Zotero Metadata Refresh`(或设置窗口左侧「元数据刷新」面板):

- **运行行为**:更新作者 / 预印本升级 / 跳过中文 / 备份旧值到 Extra
- **匹配与限流**:标题相似度阈值(0–1,默认 0.85)、请求间隔(ms,默认 1200)
- **数据源**:CrossRef / OpenAlex / Semantic Scholar / DBLP 各自可开关
- **凭据**:联系邮箱(CrossRef/OpenAlex 礼貌池)、Semantic Scholar API key(可空)
- **字段白名单**:只有勾选的字段才可能被修改,未勾选的字段**绝不**改动

> 真跑前仍建议备份 `~/Zotero/zotero.sqlite`。被覆盖字段的旧值会写入条目 Extra,可回溯。

---

## 开发 / Development

```bash
npm install                 # 依赖(见下方网络注意事项)
npm run build               # 构建 + 类型检查,产物 .xpi 在 .scaffold/build/
npm start                   # 开发热重载(需本地 Zotero beta + .env,见 .env.example)
npm run lint:fix            # prettier + eslint
```

源码结构 / Source layout:

| 路径 | 作用 |
| --- | --- |
| `src/hooks.ts` | 生命周期:注册偏好面板、注册右键菜单 |
| `src/modules/metarefresh/types.ts` | 共享类型 |
| `src/modules/metarefresh/utils.ts` | 相似度 / arXiv 提取 / `Zotero.HTTP` JSON |
| `src/modules/metarefresh/sources.ts` | 四个数据源的查询与归一化 |
| `src/modules/metarefresh/engine.ts` | 读配置、取条目、`computePlan`(干跑)、`applyPlan`(写回) |
| `src/modules/metarefresh/ui.ts` | 右键入口、查询进度、预览对话框、确认后应用 |
| `src/modules/preferenceScript.ts` | 偏好面板脚本(控件靠 `preference=` 自动同步) |
| `addon/prefs.js` | 默认偏好(构建时自动加前缀 `extensions.zotero.metarefresh.*`) |
| `addon/content/preferences.xhtml` | 偏好面板 UI |
| `addon/locale/*/` | Fluent 本地化(en-US / zh-CN) |

> 控制台脚本里的 `fetch()` 已替换为 **`Zotero.HTTP.request()`** —— 插件沙箱里跨域 `fetch`
> 可能被 CSP/CORS 拦截,而 `Zotero.HTTP` 是官方特权跨域通道。

### 网络注意 / Network note

本机 npm 默认走 `mirrors.huaweicloud.com`,安装时该镜像会重置连接(ECONNRESET)导致 npm 崩溃。
解决:用 npmmirror 一次性安装,并把 GitHub 的 git 依赖从 ssh 改走 https(`zotero-types` 间接依赖
`zotero/epub.js` 是 git 依赖):

```bash
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"
npm install --registry https://registry.npmmirror.com/
```
