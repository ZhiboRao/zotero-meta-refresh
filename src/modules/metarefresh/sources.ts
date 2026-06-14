/**
 * 数据源适配层:CrossRef / OpenAlex / Semantic Scholar / DBLP。
 * 每个源都把结果归一化成 ``SourceRecord``。命中按相似度取最佳;限流/网络错误
 * 由 ``httpJSON`` 抛 ``TransportError`` 向上传播。
 *
 * Data-source adapters. Each normalises into a ``SourceRecord``; best match by
 * title similarity; rate-limit/network errors propagate as ``TransportError``.
 */

import { RunConfig, SourceAuthor, SourceRecord } from "./types";
import { httpJSON, pickBestByTitle, splitDisplayName } from "./utils";

/** 把 httpJSON 的 host 节流间隔接到运行配置 / per-host throttle from config. */
function http<T = any>(
  config: RunConfig,
  url: string,
  headers?: Record<string, string>,
): Promise<T | null> {
  return httpJSON<T>(url, { headers, delayMs: config.delayMs });
}

// ============================================================
// CrossRef
// ============================================================

interface CrossRefAuthor {
  given?: string;
  family?: string;
  name?: string;
}
interface CrossRefWork {
  author?: CrossRefAuthor[];
  title?: string | string[];
  "container-title"?: string | string[];
  issued?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  abstract?: string;
  type?: string;
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] || "" : v || "";
}

function crossRefDate(issued: CrossRefWork["issued"]): string {
  const dp = issued && issued["date-parts"] && issued["date-parts"][0];
  if (!dp || !dp[0]) return "";
  const y = String(dp[0]);
  const mm = dp[1] ? String(dp[1]).padStart(2, "0") : "";
  const dd = dp[2] ? String(dp[2]).padStart(2, "0") : "";
  return dd ? `${y}-${mm}-${dd}` : mm ? `${y}-${mm}` : y;
}

function parseCrossRef(
  w: CrossRefWork | null | undefined,
): SourceRecord | null {
  if (!w) return null;
  const authors: SourceAuthor[] = (w.author || []).map((a) => {
    // 仅有 name(无 given/family)通常是机构 → 单字段名。
    // A bare `name` (no given/family) is usually institutional → single-field.
    if (!a.given && !a.family && a.name) {
      return { firstName: "", lastName: a.name, fieldMode: 1 };
    }
    return { firstName: a.given || "", lastName: a.family || a.name || "" };
  });
  return {
    source: "crossref",
    title: first(w.title),
    authors,
    publicationTitle: first(w["container-title"]),
    date: crossRefDate(w.issued),
    volume: w.volume || "",
    issue: w.issue || "",
    pages: w.page || "",
    DOI: w.DOI || "",
    abstractNote: (w.abstract || "").replace(/<[^>]+>/g, "").trim(),
    type: w.type || "",
  };
}

export async function queryCrossRef(
  config: RunConfig,
  doi: string,
): Promise<SourceRecord | null> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(
    doi,
  )}?mailto=${encodeURIComponent(config.contactEmail)}`;
  const data = await http<{ message?: CrossRefWork }>(config, url);
  return data && data.message ? parseCrossRef(data.message) : null;
}

export async function queryCrossRefByTitle(
  config: RunConfig,
  title: string,
): Promise<SourceRecord | null> {
  const url =
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}` +
    `&rows=3&select=DOI,title,container-title,author,issued,volume,issue,page,abstract,type` +
    `&mailto=${encodeURIComponent(config.contactEmail)}`;
  const data = await http<{ message?: { items?: CrossRefWork[] } }>(
    config,
    url,
  );
  const items = (data && data.message && data.message.items) || [];
  return pickBestByTitle(title, items, parseCrossRef);
}

// ============================================================
// OpenAlex
// ============================================================

interface OpenAlexWork {
  id?: string;
  title?: string;
  display_name?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } };
  biblio?: {
    volume?: string;
    issue?: string;
    first_page?: string;
    last_page?: string;
  };
  publication_year?: number;
  publication_date?: string;
  doi?: string;
  abstract_inverted_index?: Record<string, number[]>;
  type?: string;
}

export function reconstructAbstract(
  inv: Record<string, number[]> | null | undefined,
): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(inv)) {
    for (const p of positions) words[p] = w;
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}

function parseOpenAlex(
  w: OpenAlexWork | null | undefined,
): SourceRecord | null {
  if (!w || !w.id) return null;
  const authors: SourceAuthor[] = (w.authorships || []).map((a) =>
    splitDisplayName((a.author && a.author.display_name) || ""),
  );
  const host = w.primary_location && w.primary_location.source;
  const b = w.biblio || {};
  const pages = b.first_page
    ? b.last_page
      ? `${b.first_page}-${b.last_page}`
      : b.first_page
    : "";
  return {
    source: "openalex",
    title: w.title || w.display_name || "",
    authors,
    publicationTitle: (host && host.display_name) || "",
    date:
      w.publication_date ||
      (w.publication_year ? String(w.publication_year) : ""),
    volume: b.volume || "",
    issue: b.issue || "",
    pages,
    DOI: (w.doi || "").replace(/^https?:\/\/doi\.org\//i, ""),
    abstractNote: reconstructAbstract(w.abstract_inverted_index),
    type: w.type || "",
  };
}

export async function queryOpenAlex(
  config: RunConfig,
  idOrTitle: string,
  mode: "doi" | "title",
): Promise<SourceRecord | null> {
  const mail = `mailto=${encodeURIComponent(config.contactEmail)}`;
  if (mode === "doi") {
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(idOrTitle)}?${mail}`;
    return parseOpenAlex(await http<OpenAlexWork>(config, url));
  }
  const url = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(
    idOrTitle,
  )}&per_page=3&${mail}`;
  const data = await http<{ results?: OpenAlexWork[] }>(config, url);
  return pickBestByTitle(
    idOrTitle,
    (data && data.results) || [],
    parseOpenAlex,
  );
}

// ============================================================
// Semantic Scholar
// ============================================================

interface S2Paper {
  title?: string;
  authors?: { name?: string }[];
  publicationVenue?: { name?: string };
  venue?: string;
  journal?: { name?: string; volume?: string; pages?: string };
  year?: number;
  publicationDate?: string;
  externalIds?: { DOI?: string };
  abstract?: string;
}

const S2_FIELDS =
  "title,abstract,year,publicationDate,venue,publicationVenue,externalIds,authors,journal";

function parseS2(p: S2Paper | null | undefined): SourceRecord | null {
  if (!p || !p.title) return null;
  const authors: SourceAuthor[] = (p.authors || []).map((a) =>
    splitDisplayName(a.name || ""),
  );
  const j = p.journal || {};
  return {
    source: "semanticscholar",
    title: p.title || "",
    authors,
    publicationTitle:
      (p.publicationVenue && p.publicationVenue.name) ||
      p.venue ||
      j.name ||
      "",
    date: p.publicationDate || (p.year ? String(p.year) : ""),
    volume: j.volume || "",
    issue: "",
    pages: j.pages || "",
    DOI: (p.externalIds && p.externalIds.DOI) || "",
    abstractNote: p.abstract || "",
    type: "",
  };
}

export async function queryS2(
  config: RunConfig,
  id: string,
  mode: "arxiv" | "doi" | "title",
): Promise<SourceRecord | null> {
  const headers = config.s2ApiKey
    ? { "x-api-key": config.s2ApiKey }
    : undefined;
  if (mode === "arxiv" || mode === "doi") {
    const key = mode === "arxiv" ? `arXiv:${id}` : `DOI:${id}`;
    const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(
      key,
    )}?fields=${S2_FIELDS}`;
    return parseS2(await http<S2Paper>(config, url, headers));
  }
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    id,
  )}&limit=3&fields=${S2_FIELDS}`;
  const data = await http<{ data?: S2Paper[] }>(config, url, headers);
  return pickBestByTitle(id, (data && data.data) || [], parseS2);
}

// ============================================================
// DBLP
// ============================================================

interface DBLPInfo {
  authors?: { author?: unknown };
  title?: string;
  venue?: string;
  year?: string;
  volume?: string;
  pages?: string;
  doi?: string;
  type?: string;
}

function parseDBLP(info: DBLPInfo): SourceRecord {
  const a = info.authors && info.authors.author;
  const authorList = Array.isArray(a) ? a : a ? [a] : [];
  return {
    source: "dblp",
    title: (info.title || "").replace(/\.$/, ""),
    authors: authorList.map((entry: any) => {
      const name = typeof entry === "string" ? entry : entry?.text || "";
      // 去掉 DBLP 同名后缀 "0001" 再拆名 / strip homonym suffix then split.
      return splitDisplayName(name.replace(/\s+\d{4}$/, ""));
    }),
    publicationTitle: info.venue || "",
    date: info.year || "",
    volume: info.volume || "",
    issue: "",
    pages: info.pages || "",
    DOI: info.doi || "",
    abstractNote: "",
    type: info.type || "",
  };
}

export async function queryDBLP(
  config: RunConfig,
  title: string,
): Promise<SourceRecord | null> {
  const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(
    title,
  )}&format=json&h=5`;
  const data = await http<{
    result?: { hits?: { hit?: { info?: DBLPInfo }[] } };
  }>(config, url);
  const hits = data && data.result && data.result.hits && data.result.hits.hit;
  if (!hits || !hits.length) return null;
  return pickBestByTitle(
    title,
    hits.map((h) => h.info || {}),
    (info) => parseDBLP(info),
  );
}
