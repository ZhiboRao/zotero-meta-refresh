# 使用说明 / Usage Guide

Zotero Metadata Refresh —— 批量刷新条目元数据的完整使用说明与常见问题。
Zotero Metadata Refresh — full walkthrough and FAQ.

兼容 Zotero 7 – 9。/ Compatible with Zotero 7 – 9.

---

## 1. 它能做什么 / What it does

对选中的条目,依次向 **CrossRef、OpenAlex、Semantic Scholar、DBLP** 查询,挑出标题
相似度达标的最佳匹配,然后**只覆盖你允许的字段**(白名单),并把旧值备份到条目的
Extra 字段,便于回溯。整个过程先**预览**、确认后才写回。

For the selected items it queries **CrossRef, OpenAlex, Semantic Scholar and
DBLP** in turn, picks the best title-similar match, then overwrites **only the
fields you allow** (a whitelist), backing up old values to the item's Extra
field. Nothing is written until you confirm a **preview**.

---

## 2. 一次刷新的完整流程 / A full refresh, step by step

1. **选中条目** / Select items — 在中间的条目列表里选一条或多条(常规条目;附件、
   笔记会被自动忽略)。
2. **右键 → 刷新元数据(预览)…** / Right-click → _Refresh metadata (preview)…_
3. **查询** / Query — 弹出一个带进度的小窗口 `查询中 i/N`,上面有**「取消」按钮**:
   选多了或想中止时随时可停(正在处理中的少数条目会跑完,之后整轮中止)。网络较慢,
   每条之间按 host 节流,几十条可能要一会儿。
   A small dialog shows `Querying i/N` with a **Cancel** button — stop anytime.
4. **预览对话框** / Preview dialog — 列出每条将要发生的变化:
   - 顶部汇总:`将更新 / 无变化 / 未找到 / 跳过(中文)`。
   - 每条:`字段: 旧值 → 新值`(红色删除线是旧值,绿色是新值),以及作者变更。
   - 底部可展开「未更新的 N 条」查看被跳过/未命中的条目。
5. **应用或取消** / Apply or Cancel —
   - 点 **`应用更新 / Apply`**:逐条写回,完成后弹出结果(已更新 X 条)。
   - 点 **`取消 / Cancel`**:**什么都不改**。

> 预览即「干跑(dry run)」,只有点了 Apply 才真正改库。
> The preview is the dry run; only **Apply** mutates your library.

**范围 / Scopes**:右键条目 = 处理**选中**;右键**集合或保存的检索** = 刷新其全部条目;
**工具菜单** =「刷新整个文献库…」。后几者会先弹确认(显示条数与预计耗时),并受设置里
`maxItems` 上限保护。保存的检索很适合做"未发表的 arXiv 预印本"这类动态集合,建一次反复刷。
Right-click items = **selected**; right-click a **collection or saved search** =
all its items; **Tools menu** = whole library. Saved searches are great for
dynamic sets like "unpublished arXiv preprints" — build once, refresh repeatedly.

**置信度 / Confidence**:预览里每条带 高/中/低 徽章(精确 DOI/arXiv 命中=高;标题搜索看
相似度与作者重叠)。**低置信项默认不勾选**,避免误把配错的论文写进去 —— 想要就手动勾上。
Each preview row shows a high/medium/low confidence badge; **low-confidence rows
start unchecked** so a possibly-wrong match isn't written unless you tick it.

---

## 3. 设置项详解 / Settings reference

入口:`工具 → 插件 → Zotero Metadata Refresh`,或设置窗口左侧的「元数据刷新」面板。
Open via `Tools → Plugins → Zotero Metadata Refresh`, or the _Metadata Refresh_
pane in Settings.

### 运行行为 / Behaviour

| 选项 / Option                         | 说明 / Meaning                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| 更新作者列表 / Update authors         | 用数据源的作者列表替换条目作者。                                              |
| 升级 arXiv 预印本 / Upgrade preprints | 对 arXiv 条目优先取正式发表版的 venue/年份/卷页。                             |
| 跳过中文文献 / Skip Chinese           | 标题含中日韩汉字的条目直接跳过(这些源覆盖中文较差)。                          |
| 备份旧值到 Extra / Back up to Extra   | 写回前把旧值追加到 Extra,形如 `[MetaRefresh 2026-06-14] title=… \| …`。       |
| 只填空字段 / Fill empty fields only   | **默认关**。开启后只写当前为空的字段,绝不覆盖已有值 —— 不想动已整理数据时用。 |
| 集合含子集合 / Include subcollections | 集合刷新时是否递归处理子集合的条目。                                          |

### 匹配与限流 / Matching & rate limit

- **标题相似度阈值 / Title similarity threshold**(0–1,默认 0.85):匹配结果标题与原
  标题的相似度需 ≥ 该值才采用。调高更严格、更少误配;调低更宽松。
- **请求间隔 / Delay (ms)**(默认 1200):同一数据源(host)两次请求的最小间隔。
  Semantic Scholar 无 key 时限流约 1 RPS,不建议调太低。
- **并发处理条数 / Concurrent items**(默认 3,1–8):同时处理多少条。由于"请求间隔"
  是按 host 节流的,提高并发只会重叠网络等待、不会突破各源限流。条目多时可适当调高。

### 数据源 / Data sources

CrossRef / OpenAlex / Semantic Scholar / DBLP 各自可单独开关。命中顺序:有正式 DOI 时
CrossRef→OpenAlex→S2;arXiv 预印本时 S2 优先;否则按标题查询全部源。

### 凭据 / Credentials

- **联系邮箱 / Contact email**(默认空):CrossRef 与 OpenAlex 的「礼貌池」邮箱 —— 带上
  它能拿到更稳定/更快的服务,出问题时对方也能联系到你。**建议填你自己的邮箱。**
  若启用了这两个源却没填,运行刷新时会弹出提醒。
- **Semantic Scholar API key**(可空):有 key 可提高 S2 限流额度。

### 字段白名单 / Field whitelist

只有勾选的字段才可能被改;未勾选的字段**绝不**改动。即使某字段勾了,但对该条目类型
无效(例如期刊文章没有 `会议名称`),也会自动跳过。
Only ticked fields can change; unticked fields are **never** touched. A ticked
field invalid for the item's type is skipped automatically.

---

## 4. 出错了怎么撤销 / How to undo

刷新坏了不要紧:选中那些条目 → **右键「从 MetaRefresh 备份恢复…」** → 预览要恢复的
字段/作者 → 确认即可。这会按 **LIFO**(后进先出)恢复**最近一次**刷新,并移除对应的
备份行;再点一次可继续往前撤销上一次。前提是当时开着「备份旧值到 Extra」。

If a refresh went wrong: select those items → right-click **"Restore from
MetaRefresh backup…"** → preview → confirm. It restores the **latest** refresh
(LIFO) from the JSON backup lines in Extra and removes that line; repeat to undo
earlier runs. Requires "Back up to Extra" to have been on.

> 备份以 JSON 行存在 Extra:`[MetaRefresh <时间>] {"fields":{…},"creators":[…]}`。
> 也仍建议**真跑前先备份** `~/Zotero/zotero.sqlite`。
> Backups are JSON lines in Extra. Still, backing up `~/Zotero/zotero.sqlite`
> before a big run is the safest net.

---

## 4.5 更多功能 / More features

- **查找已发表的预印本**(`工具菜单 → 查找已发表的预印本`):扫全库,挑出仍是 arXiv
  预印本的条目,查是否已有正式发表版,**只把已"毕业"的**列入预览。最适合定期清理"等着
  见刊"的那批 arXiv。Tools menu → finds arXiv preprints that now have a published
  version.
- **拉取引用数**(右键条目 → `拉取引用数`):从 Semantic Scholar / OpenAlex 取引用数,
  存到 Extra。Right-click → fetch citation counts (S2 / OpenAlex), stored in Extra.
- **两个列**(在条目列表表头右键 → 勾选):`Published?`(preprint / published)、
  `Citations`(引用数)。Add the `Published?` and `Citations` columns via the column
  picker (right-click the list header).
- **item-pane 体检区**:选中条目时,右侧栏的「元数据刷新」区显示 预印本状态 / 缺字段 /
  引用数 / 上次刷新,并有「刷新」「撤销」按钮。An item-pane section shows health +
  quick Refresh/Restore buttons.

## 5. 常见问题 / FAQ

**Q: 安装时报「could not be installed / 不兼容」?**
A: 确认下载的是 Releases 里的 `.xpi`(不是源码 zip),且 Zotero 版本在 7–9 之间。
本插件 manifest 已带必需的 `update_url` 字段。

**Q: 很多条目「未找到」?**
A: 多为标题相似度不达阈值,或这些源没收录(尤其中文、书籍、报告)。可适当**调低阈值**
或补全条目的 DOI 后重试。

**Q: 会不会乱改我的数据?**
A: 不会主动改。所有改动先在预览里逐字段展示,点 Apply 才写;且只动白名单内、确有变化、
新值非空的字段。

**Q: 刷新很慢?**
A: 受 API 限流与「请求间隔」影响。条目多时请耐心;填了联系邮箱/ S2 key 会更顺。

**Q: 一堆条目显示"限流 / rate_limited"?**
A: 多为 Semantic Scholar 无 key 时被限流。插件已自动退避重试;仍频繁的话,在设置里填
S2 API key,或调大「请求间隔」,稍后再试。这与"未找到"已分开标注。

**Q: 想自动更新插件?**
A: 插件 `update_url` 指向本仓库,发布新 Release 后 Zotero 会自动提示更新。

---

更多问题或建议,欢迎在仓库提 Issue。/ Questions or ideas — open an issue on the repo.
