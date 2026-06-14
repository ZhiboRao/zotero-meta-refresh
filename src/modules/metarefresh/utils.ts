/**
 * 通用工具:限流、中文检测、标题归一化与相似度、姓名拆分、arXiv 提取、HTTP JSON。
 * 纯函数(相似度/姓名/arXiv)单独导出,便于在 Node 里做单元测试。
 *
 * General helpers: throttle, Chinese detection, title normalisation & similarity,
 * name splitting, arXiv-id extraction and HTTP JSON fetching. Pure functions are
 * exported so they can be unit-tested in plain Node.
 */

import { SourceAuthor, SourceRecord, TransportError } from "./types";

/** 暂停若干毫秒 / Sleep for a number of milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 标题是否含中日韩汉字 / Does the string contain CJK characters. */
export const hasChinese = (s: string): boolean => /[一-鿿]/.test(s || "");

/** 归一化标题用于比较 / Normalise a title for comparison. */
export function normalizeTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Levenshtein 编辑距离(两行滚动数组)/ Levenshtein distance (rolling rows). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * 归一化后的标题相似度 (0-1)。综合三种信号取最大:字符级 Levenshtein 比例、
 * 词集 Jaccard(对词序不敏感)、以及"短标题被长标题包含"的副标题加成 —— 这样
 * 「BERT: …」对上「BERT: … for Language Understanding」能越过阈值,而不会把
 * 「Deep Learning」对上「Deep Learning for X」也放行。
 *
 * Normalised title similarity (0-1): the max of a char-level Levenshtein ratio,
 * a token-set Jaccard (order-insensitive), and a containment boost for
 * subtitle-extended matches — so a correct match that merely adds a subtitle
 * clears the threshold, without letting a 2-word title pass against a longer one.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;

  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);

  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = union ? inter / union : 0;

  let sim = Math.max(lev, jaccard);

  // 包含加成只在两边都有足够词数时启用,避免短标题误放行。
  // Containment boost only when both token sets are non-trivial.
  const minSize = Math.min(ta.size, tb.size);
  if (minSize >= 3) {
    const containment = inter / minSize;
    sim = Math.max(sim, 0.5 * jaccard + 0.5 * containment);
  }
  return sim;
}

// —— 姓名拆分 / Name splitting ——————————————————————————————

const NAME_PARTICLES = new Set([
  "van",
  "von",
  "de",
  "da",
  "del",
  "della",
  "der",
  "den",
  "du",
  "la",
  "le",
  "dos",
  "das",
  "di",
  "bin",
  "ibn",
  "al",
  "ter",
  "ten",
  "st",
  "san",
]);

/**
 * 把一个显示名拆成 first/last。支持「Last, First」逗号式,以及把
 * van/von/de/… 这类前缀并入姓氏,避免多词姓被截断。
 *
 * Split a display name into first/last. Handles "Last, First" and keeps
 * surname particles (van/von/de/…) with the last name.
 */
export function splitDisplayName(name: string): SourceAuthor {
  const clean = (name || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const comma = clean.indexOf(",");
  if (comma >= 0) {
    return {
      firstName: clean.slice(comma + 1).trim(),
      lastName: clean.slice(0, comma).trim(),
    };
  }

  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };

  let i = parts.length - 1;
  while (i > 1 && NAME_PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return {
    firstName: parts.slice(0, i).join(" "),
    lastName: parts.slice(i).join(" "),
  };
}

/**
 * 在候选里按与 query 的标题相似度取最佳。
 *
 * Pick the best candidate by title similarity to ``query``.
 */
export function pickBestByTitle<T>(
  query: string,
  candidates: T[],
  parse: (c: T) => SourceRecord | null,
): SourceRecord | null {
  let best: SourceRecord | null = null;
  let bestSim = -1;
  for (const c of candidates) {
    const p = parse(c);
    if (!p) continue;
    const s = similarity(query, p.title);
    if (s > bestSim) {
      bestSim = s;
      best = p;
    }
  }
  return best;
}

// —— arXiv 提取 / arXiv id extraction ————————————————————————

/** arXiv id 形如 YYMM.NNNNN;校验月份 01-12 / validate the MM part. */
function isPlausibleArxiv(id: string): boolean {
  const m = id.match(/^(\d{2})(\d{2})\.\d{4,5}$/);
  if (!m) return false;
  const mm = parseInt(m[2], 10);
  return mm >= 1 && mm <= 12;
}

/**
 * 从任意文本里抽 arXiv id(纯函数,便于测试)。带上下文(arxiv/abs/)的优先;
 * 裸 id 只在文本里出现 "arxiv" 且月份合理时才接受,避免误吃普通 DOI 串。
 *
 * Extract an arXiv id from text (pure). Context-anchored ids win; a bare id is
 * only accepted when "arxiv" appears and the month is plausible, so ordinary
 * DOI/free-text tokens are not mistaken for arXiv ids.
 */
export function extractArxivIdFromText(blob: string): string | null {
  const ctx = (blob || "").match(
    /(?:arxiv[:/]|abs\/|arxiv\.)\s*(\d{4}\.\d{4,5})(?:v\d+)?/i,
  );
  if (ctx && isPlausibleArxiv(ctx[1])) return ctx[1];
  if (/arxiv/i.test(blob || "")) {
    const bare = (blob || "").match(/\b(\d{4}\.\d{4,5})\b/);
    if (bare && isPlausibleArxiv(bare[1])) return bare[1];
  }
  return null;
}

/** 从条目字段里抽 arXiv id / Extract an arXiv id from an item. */
export function extractArxivId(item: Zotero.Item): string | null {
  const blob = [
    item.getField("DOI") || "",
    item.getField("url") || "",
    item.getField("extra") || "",
    item.getField("archive") || "",
    item.getField("archiveID") || "",
  ].join("  ");
  return extractArxivIdFromText(blob);
}

// —— HTTP / 限流 / 重试 ————————————————————————————————————

/** 每个 host 的上次请求时刻,用于按 host 节流 / per-host last-request clock. */
const HOST_LAST = new Map<string, number>();

async function throttleHost(url: string, minIntervalMs: number): Promise<void> {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw url as key */
  }
  // 同步预定下一个时槽,再 await —— 这样并发的同 host 请求会正确排队,
  // 而非同时读到旧的 last 一起发出。
  // Reserve the next slot synchronously *before* awaiting, so concurrent
  // same-host requests queue up instead of all firing on a stale `last`.
  const now = Date.now();
  const scheduled = Math.max(now, (HOST_LAST.get(host) || 0) + minIntervalMs);
  HOST_LAST.set(host, scheduled);
  const wait = scheduled - now;
  if (wait > 0) await sleep(wait);
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 1000 * Math.pow(2, attempt - 1));
}

function retryAfterMs(xhr: any): number | null {
  try {
    const h = xhr?.getResponseHeader?.("Retry-After");
    const s = h ? parseInt(h, 10) : NaN;
    if (Number.isFinite(s)) return Math.min(30000, s * 1000);
  } catch {
    /* ignore */
  }
  return null;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  /** 同一 host 两次请求的最小间隔 / per-host min interval (ms). */
  delayMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * 通过 Zotero 的特权 HTTP 通道取 JSON,带按 host 节流与限流重试。
 * 2xx → 解析返回;404/其它 4xx → null(明确未命中);
 * 429/5xx/网络/超时 → 退避重试,仍失败则抛 ``TransportError``(供上层区分限流)。
 *
 * Fetch JSON via Zotero's privileged HTTP channel, with per-host throttling and
 * rate-limit retry. 2xx → parsed; 404/other 4xx → null (a real miss);
 * 429/5xx/network/timeout → backoff-retry then throw ``TransportError`` so the
 * caller can tell rate limiting apart from "not found".
 */
export async function httpJSON<T = any>(
  url: string,
  opts: HttpOptions = {},
): Promise<T | null> {
  const { headers = {}, delayMs = 0, timeoutMs = 15000, maxRetries = 3 } = opts;
  let attempt = 0;

  for (;;) {
    if (delayMs > 0) await throttleHost(url, delayMs);
    let xhr: any;
    try {
      xhr = await Zotero.HTTP.request("GET", url, {
        headers,
        responseType: "json",
        timeout: timeoutMs,
        // 不因非 2xx 抛异常,自己按 status 分流。
        // Don't throw on non-2xx; branch on status ourselves.
        successCodes: false,
      } as any);
    } catch (e: any) {
      const isTimeout = /timeout/i.test(e?.message || "");
      if (attempt < maxRetries) {
        attempt++;
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new TransportError(
        isTimeout ? "timeout" : "network",
        e?.status || 0,
        e?.message,
      );
    }

    const status = xhr?.status ?? 0;
    if (status >= 200 && status < 300) {
      if (xhr.response != null) return xhr.response as T;
      if (xhr.responseText) {
        try {
          return JSON.parse(xhr.responseText) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
    if (status === 404) return null;
    if (status === 429 || status >= 500) {
      if (attempt < maxRetries) {
        attempt++;
        const ra = retryAfterMs(xhr);
        await sleep(ra != null ? ra : backoffMs(attempt));
        continue;
      }
      throw new TransportError("rate_limited", status);
    }
    // 其它 4xx 当作未命中 / other 4xx → miss.
    return null;
  }
}
