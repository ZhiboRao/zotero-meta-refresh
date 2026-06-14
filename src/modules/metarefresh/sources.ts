/**
 * 数据源适配层:CrossRef / OpenAlex / Semantic Scholar / DBLP。
 * 每个源都把结果归一化成 ``SourceRecord``。
 *
 * Data-source adapters: CrossRef / OpenAlex / Semantic Scholar / DBLP.
 * Each adapter normalises its response into a ``SourceRecord``.
 */

import { RunConfig, SourceRecord } from "./types";
import { httpJSON, similarity } from "./utils";

// ============================================================
// CrossRef
// ============================================================

function parseCrossRef(w: any): SourceRecord | null {
  if (!w) return null;
  const authors = (w.author || []).map((a: any) => ({
    firstName: a.given || "",
    lastName: a.family || a.name || "",
  }));
  const title = Array.isArray(w.title) ? w.title[0] || "" : w.title || "";
  const container = Array.isArray(w["container-title"])
    ? w["container-title"][0] || ""
    : w["container-title"] || "";
  const yp = w.issued && w.issued["date-parts"] && w.issued["date-parts"][0];
  const year = yp && yp[0] ? String(yp[0]) : "";
  return {
    source: "crossref",
    title,
    authors,
    publicationTitle: container,
    date: year,
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
  const data = await httpJSON(url);
  return data && data.message ? parseCrossRef(data.message) : null;
}

export async function queryCrossRefByTitle(
  config: RunConfig,
  title: string,
): Promise<SourceRecord | null> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
    title,
  )}&rows=3&mailto=${encodeURIComponent(config.contactEmail)}`;
  const data = await httpJSON(url);
  const items = (data && data.message && data.message.items) || [];
  let best: SourceRecord | null = null;
  let bestSim = 0;
  for (const it of items) {
    const p = parseCrossRef(it);
    if (!p) continue;
    const s = similarity(title, p.title);
    if (s > bestSim) {
      bestSim = s;
      best = p;
    }
  }
  return best;
}

// ============================================================
// OpenAlex
// ============================================================

function reconstructAbstract(inv: any): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(inv)) {
    for (const p of positions as number[]) words[p] = w;
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}

function parseOpenAlex(w: any): SourceRecord | null {
  if (!w || !w.id) return null;
  const authors = (w.authorships || []).map((a: any) => {
    const dn = (a.author && a.author.display_name) || "";
    const parts = dn.split(" ");
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts.slice(-1)[0] || "",
    };
  });
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
    date: w.publication_year ? String(w.publication_year) : "",
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
    const url = `https://api.openalex.org/works/doi:${encodeURIComponent(
      idOrTitle,
    )}?${mail}`;
    return parseOpenAlex(await httpJSON(url));
  }
  const url = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(
    idOrTitle,
  )}&per_page=3&${mail}`;
  const data = await httpJSON(url);
  const results = (data && data.results) || [];
  if (!results.length) return null;
  let best: SourceRecord | null = null;
  let bestSim = 0;
  for (const w of results) {
    const p = parseOpenAlex(w);
    if (!p) continue;
    const s = similarity(idOrTitle, p.title);
    if (s > bestSim) {
      bestSim = s;
      best = p;
    }
  }
  return best;
}

// ============================================================
// Semantic Scholar
// ============================================================

function parseS2(p: any): SourceRecord | null {
  if (!p || !p.title) return null;
  const authors = (p.authors || []).map((a: any) => {
    const parts = (a.name || "").split(" ");
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts.slice(-1)[0] || "",
    };
  });
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
    date: p.year ? String(p.year) : "",
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
  const fields =
    "title,abstract,year,venue,publicationVenue,externalIds,authors,journal";
  const headers = config.s2ApiKey
    ? { "x-api-key": config.s2ApiKey }
    : undefined;
  if (mode === "arxiv" || mode === "doi") {
    const key = mode === "arxiv" ? `arXiv:${id}` : `DOI:${id}`;
    const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(
      key,
    )}?fields=${fields}`;
    return parseS2(await httpJSON(url, headers));
  }
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    id,
  )}&limit=3&fields=${fields}`;
  const data = await httpJSON(url, headers);
  const arr = (data && data.data) || [];
  if (!arr.length) return null;
  let best: SourceRecord | null = null;
  let bestSim = 0;
  for (const p of arr) {
    const parsed = parseS2(p);
    if (!parsed) continue;
    const s = similarity(id, parsed.title);
    if (s > bestSim) {
      bestSim = s;
      best = parsed;
    }
  }
  return best;
}

// ============================================================
// DBLP
// ============================================================

function parseDBLP(info: any): SourceRecord {
  const authors = info.authors && info.authors.author;
  const authorList = Array.isArray(authors)
    ? authors
    : authors
      ? [authors]
      : [];
  return {
    source: "dblp",
    title: (info.title || "").replace(/\.$/, ""),
    authors: authorList.map((a: any) => {
      const name = typeof a === "string" ? a : a.text || "";
      // 去掉 DBLP 同名后缀 "0001" / strip DBLP homonym suffix "0001".
      const cleanName = name.replace(/\s+\d{4}$/, "");
      const parts = cleanName.split(" ");
      return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts.slice(-1)[0] || "",
      };
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
  _config: RunConfig,
  title: string,
): Promise<SourceRecord | null> {
  const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(
    title,
  )}&format=json&h=5`;
  const data = await httpJSON(url);
  const hits = data && data.result && data.result.hits && data.result.hits.hit;
  if (!hits || !hits.length) return null;
  let best: any = null;
  let bestSim = 0;
  for (const h of hits) {
    const info = h.info || {};
    const s = similarity(title, (info.title || "").replace(/\.$/, ""));
    if (s > bestSim) {
      bestSim = s;
      best = info;
    }
  }
  return best ? parseDBLP(best) : null;
}
