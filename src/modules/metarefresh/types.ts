/**
 * 元数据刷新的共享类型定义。
 *
 * Shared type definitions for the metadata-refresh engine.
 */

/** 数据源标识 / Data-source identifiers. */
export type SourceId = "crossref" | "openalex" | "semanticscholar" | "dblp";

/**
 * 统一的作者表示。``fieldMode === 1`` 表示机构等单字段名(不拆 first/last)。
 *
 * Unified author representation. ``fieldMode === 1`` marks a single-field
 * (e.g. institutional) name that must not be split into first/last.
 */
export interface SourceAuthor {
  firstName: string;
  lastName: string;
  fieldMode?: 0 | 1;
}

/**
 * 各数据源归一化后的记录。
 *
 * A metadata record normalised across every data source.
 */
export interface SourceRecord {
  source: SourceId;
  title: string;
  authors: SourceAuthor[];
  publicationTitle: string;
  /** YYYY 或 YYYY-MM 或 YYYY-MM-DD / a year or full ISO-ish date. */
  date: string;
  volume: string;
  issue: string;
  pages: string;
  DOI: string;
  abstractNote: string;
  type: string;
}

/**
 * HTTP 取数结果(判别联合)。区分命中、未命中(404)、传输错误。
 *
 * Discriminated HTTP result — distinguishes hit, miss (404) and transport
 * error so callers can react to rate limiting instead of mislabelling it.
 */
export type HttpResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: "miss" | "rate_limited" | "network" | "timeout" | "parse";
      status: number;
    };

/**
 * 传输层错误(429 / 5xx / 网络 / 超时)。用于让限流与"未找到"区分开。
 *
 * Transport-level failure (429 / 5xx / network / timeout). Lets rate limiting
 * be told apart from a genuine "not found".
 */
export class TransportError extends Error {
  kind: "rate_limited" | "network" | "timeout";
  status: number;
  constructor(
    kind: "rate_limited" | "network" | "timeout",
    status: number,
    message?: string,
  ) {
    super(message || `${kind} (${status})`);
    this.name = "TransportError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * 运行配置,从偏好读取一次后传递给整轮处理。
 *
 * Run configuration, read once from prefs and passed through one run.
 */
export interface RunConfig {
  updateAuthors: boolean;
  upgradePreprints: boolean;
  skipChinese: boolean;
  backupToExtra: boolean;
  titleSimilarityThreshold: number;
  delayMs: number;
  contactEmail: string;
  s2ApiKey: string;
  /** 整库/集合范围的安全上限 / safety cap for library/collection scope. */
  maxItems: number;
  sources: {
    crossref: boolean;
    openalex: boolean;
    s2: boolean;
    dblp: boolean;
  };
  /** 字段白名单(Zotero 字段名)/ Field whitelist (Zotero field names). */
  fields: string[];
}

/** 单个字段的变更计划 / A single field change. */
export interface FieldPlan {
  field: string;
  oldVal: string;
  newVal: string;
}

/** 作者变更计划 / Author change. */
export interface AuthorPlan {
  oldC: string;
  newC: string;
  list: SourceAuthor[];
}

export type PlanStatus =
  | "would_update"
  | "nochange"
  | "not_found"
  | "skipped"
  | "rate_limited"
  | "error";

/**
 * 单条条目的处理计划(干跑产物;应用阶段据此写回)。
 *
 * The plan for one item (produced during the dry run; applied later).
 */
export interface ItemPlan {
  item: Zotero.Item;
  title: string;
  status: PlanStatus;
  reason?: string;
  source?: SourceId;
  fields: FieldPlan[];
  authors: AuthorPlan | null;
  queryLog: string[];
  /** 预览里逐条勾选状态 / per-item include toggle in the preview. */
  selected?: boolean;
}
