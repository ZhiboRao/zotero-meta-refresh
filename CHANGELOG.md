# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。
Format based on Keep a Changelog; this project adheres to Semantic Versioning.

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
