# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。
Format based on Keep a Changelog; this project adheres to Semantic Versioning.

## [0.5.0] - 2026-09-11

适配 Zotero 10。Zotero 10 把插件菜单收进了官方 API,同时 zotero-plugin-toolkit 5.2
删掉了自带的 MenuTool —— 这一版跟着迁移过去,并换掉了一直沿用插件模板的图标。
Zotero 10 support. Zotero 10 moved plugin menus into an official API and
zotero-plugin-toolkit 5.2 dropped its own MenuTool; this release follows that
migration and replaces the icon still inherited from the plugin template.

### Changed / 变更

- **兼容区间改为 Zotero 10**(`strict_min_version 10.0`,`strict_max_version 10.*`)。
  旧的 `strict_max_version 9.*` 是插件在 Zotero 10.0.2 上「装不上/被停用」的直接原因。
  **不再支持 Zotero 7 – 9**,旧版本用户请停留在 v0.4.1。
  **Compatibility range is now Zotero 10.** The old `strict_max_version 9.*` was
  the direct reason the plugin refused to load on Zotero 10.0.2. Zotero 7 – 9 are
  no longer supported; stay on v0.4.1 for those.
- **菜单改用原生 `Zotero.MenuManager`**:条目右键、集合右键、工具菜单三处按 target
  全局注册一次,由 Zotero 负责铺到每个窗口。菜单标签只能走 Fluent,所以 `menu-*`
  文案从 `addon.ftl` 移到了随窗口注入的 `mainWindow.ftl`。
  **Menus now use the native `Zotero.MenuManager`**: the item, collection and
  Tools menus each register once per target and Zotero propagates them to every
  window. Native menu labels are Fluent-only, so the `menu-*` strings moved from
  `addon.ftl` to the per-window `mainWindow.ftl`.
- **依赖升级**:zotero-plugin-toolkit 5.2.0、zotero-types 4.1.3、
  zotero-plugin-scaffold 0.9.2。toolkit 5.2 不再从包根导出全家桶 `ZoteroToolkit`,
  改为只组装本插件用到的 `BasicTool` / `UI` / `Dialog` / `ProgressWindow`,打包体积
  从 54 KB 降到 38 KB。esbuild target 同步升到 `firefox140`(Zotero 10 的 Gecko 版本)。
  **Dependencies upgraded** to zotero-plugin-toolkit 5.2.0, zotero-types 4.1.3 and
  zotero-plugin-scaffold 0.9.2. toolkit 5.2 no longer exports the all-in-one
  `ZoteroToolkit` from the package root, so we assemble just the helpers this
  plugin uses — the xpi drops from 54 KB to 38 KB. The esbuild target moves to
  `firefox140`, matching Zotero 10's Gecko.
- **换了图标**:原来用的是插件模板自带的蓝色「翻译」图标,与本插件无关;现在是
  Zotero 品牌红的「刷新环 + 元数据横条」,透明底,深浅色主题下都清晰。几何由
  `tools/make_icons.py` 计算生成,可复现。
  **New icon.** The old one was the blue _translate_ glyph inherited from the
  plugin template and had nothing to do with this plugin. It is now a refresh
  ring around two metadata bars in Zotero's brand red, on a transparent ground so
  it reads on both light and dark themes. Generated reproducibly by
  `tools/make_icons.py`.

### Fixed / 修复

- **图标尺寸与 manifest 声明不符**:`manifest.json` 声明 48 / 96,实际文件却是
  16 / 32,插件管理器里一直是放大后的糊图。现已按声明输出 48 × 48 与 96 × 96。
  **Icon sizes did not match the manifest**: it declared 48 / 96 while the files
  were 16 / 32, so the Add-ons manager showed an upscaled blur. They are now
  genuinely 48 × 48 and 96 × 96.
- **右键菜单偶发缺失**(v0.4.1 只是绕开)现在从机制上消失:原生菜单由 Zotero 在每次
  popupshowing 时构建到当前窗口,不再依赖插件自己往某个 document 插 DOM 节点,因此
  从 macOS Dock 重开的新窗口也必然带上菜单。逐窗口注册的那套代码已删除。
  **The intermittently-missing context menu** (only worked around in v0.4.1) is now
  structurally impossible: Zotero builds native menus into whichever window opens
  the popup, instead of the plugin inserting DOM nodes into one document, so a
  window reopened from the macOS dock always has them. The per-window
  registration code is gone.

## [0.4.1] - 2026-06-19

### Fixed / 修复

- **右键/工具菜单"有时候不出现"**:菜单原本只在启动时注册一次,被插进了"当时那个
  主窗口"的弹出菜单里。在 macOS 上关掉所有窗口后(Zotero 仍在 Dock)再从 Dock 重新
  打开,会得到一个全新窗口,它的右键里就没有本插件入口。现改为**逐窗口注册**
  (`onMainWindowLoad`),并向各窗口传入具体的弹出菜单元素,加了幂等守卫避免重复插入。
  **Context/Tools menus sometimes missing**: menus were registered once at
  startup into a single window's popup. After closing all windows on macOS (with
  Zotero still running) and reopening from the dock, the new window's right-click
  menu lacked our entries. Now registered **per main window** in
  `onMainWindowLoad`, targeting each window's own popup elements, with an
  id-existence guard against double insertion.

## [0.4.0] - 2026-06-14

来自创意 workflow 的功能批次(3/4;多源 venue 冲突选择器留作下一轮核心改造)。
Feature batch from the ideation workflow (3 of 4; the multi-source venue
conflict picker is deferred to its own round as a core-engine change).

### Added / 新增

- **查找已发表的预印本**(工具菜单,整库):筛出仍是 arXiv 预印本的条目,查是否已有
  正式发表版,**只把"已毕业"的**列入预览并应用。配套 **`Published?` 列**(preprint /
  published)用于一眼分诊。
  **Find published preprints** (Tools menu): filters arXiv-only preprints, checks
  for a published version, previews/applies only the graduated ones. Plus a
  **`Published?`** item-tree column.
- **引用数**:右键条目「拉取引用数」从 Semantic Scholar / OpenAlex 取引用数,写入
  Extra;配套可排序的 **`Citations` 列**。
  **Citation counts**: right-click "Fetch citation counts" (S2 / OpenAlex),
  stored in Extra and shown by a **`Citations`** column.
- **item-pane「元数据体检」区**:选中条目时,右侧栏显示 预印本状态 / 缺哪些字段 /
  引用数 / 上次刷新,并带「刷新此条」「撤销」按钮。
  An item-pane **"health" section**: preprint status, missing fields, citations,
  last-refreshed, with Refresh / Restore buttons.

> 新增的列/面板都用 Zotero 原生 API 注册并包了 try/catch —— 即便某版本不支持也不会
> 影响插件其余功能。/ The columns/section are registered defensively.

## [0.3.0] - 2026-06-14

### Added / 新增

- **匹配置信度徽章**:预览里每条标 高/中/低(由 精确ID命中 + 标题相似度 + 作者姓氏
  重叠 算出);**低置信项默认不勾选**,需主动确认才会写入 —— 隔离最可能配错的匹配。
  Per-item **confidence badge** in the preview; low-confidence matches start
  **unchecked** so risky (possibly wrong-paper) matches need a deliberate click.
- **保存的检索(Saved Search)范围**:在保存的检索上右键即可刷新其命中的全部条目
  (例如"未发表的 arXiv 预印本"这种动态集合)。集合刷新可选**递归子集合**(设置开关)。
  **Saved-search scope** (right-click a saved search) + optional recursive
  subcollections on collection refresh (a setting).
- **「只填空字段」安全模式**(设置开关,默认关):只写当前为空的字段,绝不覆盖已有值;
  适合在不想动已整理数据时做全库补全。
  **"Fill empty fields only"** safe mode (a setting, default off): only writes
  empty fields, never overwrites existing values.

## [0.2.2] - 2026-06-14

### Added / 新增

- 查询阶段新增**「取消」按钮**(无模态进度对话框):选多了、或想中止时随时可停;
  正在处理中的少数条目会跑完,之后整轮中止。
  A **Cancel** button during the query phase (modeless dialog): stop a run
  anytime (e.g. when too many items were selected). In-flight items finish; no
  new items are picked up and the run aborts.

## [0.2.1] - 2026-06-14

### Added / 新增

- **有界并发**处理条目(新设置 `concurrency`,默认 3,范围 1–8);按 host 节流仍
  生效,故并发不会突破各源限流。并发时同一查询会去重(只发一次)。
  Bounded-concurrency item processing (new `concurrency` setting, default 3);
  per-host throttling still caps rate, and identical concurrent queries dedupe.
- 未填邮箱的提醒升级为**三按钮**:继续 / 取消 / **打开设置**(直接跳到本插件面板)。
  The no-email reminder now offers **Open Settings** (jumps to this plugin's pane).

## [0.2.0] - 2026-06-14

来自一次多维度代码审计的改进批次(数据安全、匹配质量、健壮性、UX、质量、文档)。
A batch of improvements from a multi-dimension code audit.

### Added / 新增

- 预览对话框里**每条带复选框**,可单独取消;应用时只写勾选项。
  Per-item checkboxes in the preview; only checked items are applied.
- **集合**右键「刷新本集合…」与**工具菜单**「刷新整个文献库…」两个范围入口,
  带数量+耗时预估确认与 `maxItems` 上限保护。
  Collection and whole-library scopes, with a count+time-estimate confirm and a
  `maxItems` safety cap (new setting).
- **撤销命令**「从 MetaRefresh 备份恢复…」(LIFO,从 Extra 备份恢复字段与作者)。
  A "Restore from MetaRefresh backup" undo command (LIFO).
- 限流/网络错误带**退避重试**,并以独立的 `rate_limited` 状态区分于"未找到"。
  Rate-limit/network errors now retry with backoff and surface a distinct
  `rate_limited` status instead of being mislabelled "not found".
- 纯函数**单元测试**(相似度/姓名拆分/arXiv/摘要),CI 自动运行。
  Unit tests for the pure functions, run in CI.

### Changed / 改进

- 标题相似度改为 **Levenshtein + 词集 Jaccard + 包含加成**,大幅减少把正确结果
  误判为"未找到"(带副标题的匹配能越过阈值)。
  Smarter similarity → far fewer false negatives on subtitle-extended titles.
- **精确 DOI/arXiv 命中不再过标题相似度门**(条目标题为空也能用权威记录)。
  Exact DOI/arXiv matches are no longer gated by fuzzy title similarity.
- 作者更新改为**合并**:保留编辑/译者等非作者角色,机构名设 `fieldMode`,
  并在姓氏重叠过低时跳过覆盖,避免误配清空作者。
  Author update now merges (keeps editors/translators), sets institutional
  `fieldMode`, and is skipped on low surname overlap.
- **日期不再被降级**:不会把已有的精确日期覆盖成纯年份;并尽量抓取完整日期。
  Dates are no longer downgraded to a bare year; full dates are harvested.
- 姓名拆分支持 **van/von/de/…** 前缀与「Last, First」。
  Particle-aware name splitting and "Last, First".
- **按 host 节流 + 每轮查询缓存**(更快、对 API 更友好)。
  Per-host throttling and a per-run query cache.
- 应用阶段**写前复读**(冲突安全)、检查可编辑、失败回滚;备份改为 **JSON/LIFO** 行。
  Apply re-reads fields (conflict-safe), checks editability, rolls back on
  failure; Extra backup is now JSON/LIFO.
- 应用后**逐条列出失败与被跳过(冲突)**的条目。
  Failures and skipped (conflicting) items are itemised after apply.

### Fixed / 修复

- 收紧 arXiv id 识别,避免把普通 DOI/文本误当成 arXiv id。
  Tightened arXiv-id detection to avoid false positives from DOI-like tokens.

## [0.1.1] - 2026-06-14

- 默认联系邮箱改为**空**;启用 CrossRef/OpenAlex 又未填时,运行刷新会提醒。
  Default contact email is now empty; a reminder shows when it is unset.

## [0.1.0] - 2026-06-14

- 首个版本:从 Run-JavaScript 控制台脚本改造为 bootstrap 插件。
  Initial release; rebuilt from a Run-JavaScript console script.
