/**
 * Polymorphic record references, mirroring coreflow-core's
 * `app/platform/kit/schemas.py` (platform contracts 1.2 and 11.3).
 *
 * An *entity type* is the snake_case name of a record kind (`document`,
 * `deviation`, `risk`, …). Any record the caller may read can be described by an
 * {@link EntityRefDto}.
 */

/** `GET v1/orgs/{org}/entities/{entity_type}/{entity_id}`: a resolved, access-checked record. */
export interface EntityRefDto {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  /** Portal path of the record's detail page (e.g. `/deviations/<id>`), if it has one. */
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  /** Global i18n key of the type name (e.g. `modules.entities.deviation`). */
  readonly label_key: string | null;
}

/** One registered entity type and what the record kit can do with it. */
export interface EntityTypeInfo {
  readonly entity_type: string;
  readonly module: string;
  readonly label_key: string | null;
  readonly linkable: boolean;
  readonly commentable: boolean;
  readonly attachable: boolean;
  readonly revisioned: boolean;
  readonly searchable: boolean;
}

/** `GET v1/orgs/{org}/entity-types`. */
export interface EntityTypeList {
  readonly items: readonly EntityTypeInfo[];
  readonly link_types: readonly string[];
}

/** A user as the record kit shows it (`name` is the full name, else the email). */
export interface UserRef {
  readonly id: string;
  readonly name: string | null;
}
