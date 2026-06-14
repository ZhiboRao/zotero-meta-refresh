/**
 * 元数据刷新的共享类型定义。
 *
 * Shared type definitions for the metadata-refresh engine.
 */

/** 统一的作者表示 / Unified author representation. */
export interface SourceAuthor {
  firstName: string;
  lastName: string;
}

/**
 * 各数据源归一化后的记录。
 *
 * A metadata record normalised across every data source.
 */
export interface SourceRecord {
  source: string;
  title: string;
  authors: SourceAuthor[];
  publicationTitle: string;
  date: string;
  volume: string;
  issue: string;
  pages: string;
  DOI: string;
  abstractNote: string;
  type: string;
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
  source?: string;
  fields: FieldPlan[];
  authors: AuthorPlan | null;
  queryLog: string[];
}
