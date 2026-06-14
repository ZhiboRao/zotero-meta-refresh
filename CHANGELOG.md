# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。
Format based on Keep a Changelog; this project adheres to Semantic Versioning.

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
