/**
 * 通用工具:限流、中文检测、标题归一化、相似度、arXiv 提取、HTTP JSON。
 *
 * General helpers: throttle, Chinese detection, title normalisation,
 * similarity, arXiv-id extraction and HTTP JSON fetching.
 */

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

/** Levenshtein 编辑距离 / Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/** 归一化后的标题相似度 (0-1) / Normalised title similarity (0-1). */
export function similarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * 从条目的 DOI / URL / Extra / archive 字段里抽取 arXiv id。
 *
 * Extract an arXiv id from an item's DOI / URL / Extra / archive fields.
 */
export function extractArxivId(item: Zotero.Item): string | null {
  const blob = [
    item.getField("DOI") || "",
    item.getField("url") || "",
    item.getField("extra") || "",
    item.getField("archive") || "",
    item.getField("archiveID") || "",
  ].join("  ");
  const m =
    blob.match(/(?:arxiv[:/]|abs\/|arxiv\.)\s*(\d{4}\.\d{4,5})(?:v\d+)?/i) ||
    blob.match(/\b(\d{4}\.\d{4,5})\b/);
  return m ? m[1] : null;
}

/**
 * 通过 Zotero 的特权 HTTP 通道取 JSON。
 *
 * Fetch JSON through Zotero's privileged HTTP channel. Using
 * ``Zotero.HTTP.request`` instead of ``fetch`` avoids the CORS/CSP
 * restrictions that bite cross-origin requests inside a plugin sandbox.
 * 用 ``Zotero.HTTP.request`` 而非 ``fetch``,绕开插件沙箱里跨域被
 * CSP/CORS 拦截的问题。失败一律返回 null。
 *
 * @param url 请求地址 / request URL.
 * @param headers 可选请求头 / optional request headers.
 * @returns 解析后的 JSON,失败为 null / parsed JSON, or null on failure.
 */
export async function httpJSON(
  url: string,
  headers?: Record<string, string>,
): Promise<any> {
  try {
    const xhr = await Zotero.HTTP.request("GET", url, {
      headers: headers || {},
      responseType: "json",
      timeout: 20000,
    });
    if (xhr.response != null) return xhr.response;
    if (xhr.responseText) {
      try {
        return JSON.parse(xhr.responseText);
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    // 4xx/5xx 由 Zotero.HTTP 抛异常,这里统一吞掉当作未命中。
    // Non-2xx throws from Zotero.HTTP; we swallow it as a miss.
    return null;
  }
}
