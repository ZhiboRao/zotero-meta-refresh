// 默认偏好值 / Default preferences.
// scaffold 构建时会自动给每个 key 加上 prefsPrefix
// (extensions.zotero.metarefresh.*),并据此生成 typings/prefs.d.ts。
// The scaffold prefixes each key with prefsPrefix at build time and
// regenerates typings/prefs.d.ts from this file.

// —— 运行行为开关 / Run-behaviour switches ——
pref("updateAuthors", true); // 是否更新作者列表 / refresh the author list
pref("upgradePreprints", true); // arXiv 预印本升级到正式发表版 / upgrade arXiv preprints
pref("skipChinese", true); // 跳过中文文献 / skip Chinese-titled items
pref("backupToExtra", true); // 旧值备份到 Extra 字段 / back up old values to Extra

// —— 匹配与限流 / Matching & rate-limit ——
// 标题相似度阈值 (0-1)。Mozilla 偏好无浮点类型,故以字符串存储。
// Title similarity threshold (0-1). Stored as string (no float pref type).
pref("titleSimilarityThreshold", "0.85");
// 请求间隔毫秒。同样以字符串存储,避免 int 偏好与输入框的类型耦合。
// Delay (ms). Stored as string too, to avoid int-pref/input coercion issues.
pref("delayMs", "1200");

// —— 数据源开关 / Data-source toggles ——
pref("useCrossref", true);
pref("useOpenAlex", true);
pref("useS2", true);
pref("useDBLP", true);

// —— 凭据 / Credentials ——
// CrossRef / OpenAlex 礼貌池邮箱。默认留空,由每个用户在设置里填自己的邮箱;
// 留空时运行刷新会弹出提醒(见 ui.ts)。
// CrossRef / OpenAlex polite-pool email. Empty by default so each user fills
// in their own; running a refresh while empty shows a reminder (see ui.ts).
pref("contactEmail", "");
pref("s2ApiKey", ""); // Semantic Scholar API key(可留空 / optional)

// —— 字段白名单 / Field whitelist —— 不在白名单内的字段绝不改动。
// Fields NOT enabled here are never touched.
pref("fieldTitle", true);
pref("fieldPublicationTitle", true);
pref("fieldDate", true);
pref("fieldVolume", true);
pref("fieldIssue", true);
pref("fieldPages", true);
pref("fieldDOI", true);
pref("fieldAbstractNote", true);
pref("fieldConferenceName", true);
pref("fieldProceedingsTitle", true);
