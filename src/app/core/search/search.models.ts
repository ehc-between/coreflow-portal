/** One global-search hit (`GET v1/orgs/{org}/search`, platform contracts 8.1). */
export interface SearchItem {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  /** Plain text (highlight tags are removed server-side). */
  readonly snippet: string | null;
  /** Portal path of the record, e.g. `/documents/<id>` or `/standards/iso9001?req=...`. */
  readonly url: string | null;
  readonly rank: number;
  readonly updated_at: string | null;
  /** Owning module key. */
  readonly module: string;
  /** i18n key of the record type's label (global `modules.entities.<type>` by default). */
  readonly label_key: string;
}

/** Search response: hits merged by rank, plus hit counts per type (types with hits only). */
export interface SearchResponse {
  readonly items: readonly SearchItem[];
  readonly counts: Readonly<Record<string, number>>;
}

export interface SearchOptions {
  /** Restrict to these entity types. */
  readonly types?: readonly string[];
  /** 1..50, server default 20. */
  readonly limit?: number;
}

/** Max query length accepted by the endpoint. */
export const SEARCH_QUERY_MAX = 200;
