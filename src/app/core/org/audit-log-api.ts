import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';

/** Who did it: a person, the assistant on a person's behalf, or the system. */
export type AuditActorKind = 'user' | 'ai' | 'system';

/** The record a row describes, present only when the caller may read that record. */
export interface AuditEntityLink {
  readonly code: string | null;
  readonly title: string;
  /** Portal route, e.g. `/risk/risks/<id>`. */
  readonly url: string | null;
}

/** One row of `GET v1/orgs/{org}/audit-events` (audit:read). */
export interface AuditEvent {
  readonly id: string;
  readonly org_id: string;
  readonly actor_user_id: string | null;
  readonly actor_name: string | null;
  readonly actor_kind: AuditActorKind | string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  /** Global i18n key of the type name (e.g. `modules.entities.risk`); null when unknown. */
  readonly entity_label_key?: string | null;
  readonly entity?: AuditEntityLink | null;
  /** Dotted action, e.g. `risk.updated`. */
  readonly action: string;
  readonly summary: string;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly request_id: string | null;
  readonly created_at: string;
}

export interface AuditEventPage {
  readonly items: readonly AuditEvent[];
  readonly total: number;
}

/** `GET v1/orgs/{org}/audit-events/facets`: values present in the log, with counts. */
export interface AuditFacets {
  readonly entity_types: readonly {
    readonly entity_type: string;
    readonly label_key: string | null;
    readonly count: number;
  }[];
  readonly actors: readonly {
    readonly user_id: string;
    readonly name: string;
    readonly count: number;
  }[];
  /** `prefix` ends in "." and is passed as `action`. */
  readonly action_groups: readonly { readonly prefix: string; readonly count: number }[];
  readonly actor_kinds: readonly { readonly actor_kind: string; readonly count: number }[];
}

/** Filters shared by the list and the CSV export. Empty values are omitted. */
export interface AuditFilters {
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly actor_user_id?: string | null;
  readonly actor_kind?: string | null;
  /** Exact action, or a prefix ending in "." (e.g. `risk.`). */
  readonly action?: string | null;
  readonly q?: string | null;
  /** ISO dates (`YYYY-MM-DD`). */
  readonly from?: string | null;
  readonly to?: string | null;
}

/** Most rows the API returns per page. */
export const AUDIT_PAGE_MAX = 200;

/** Query params for `filters` (blank values dropped). */
export function auditParams(
  filters: AuditFilters,
  extra: Readonly<Record<string, string | number>> = {},
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' && value.trim() !== '') {
      out[key] = value.trim();
    }
  }
  return { ...out, ...extra };
}

/**
 * The organisation's audit log (ISO 27001 A.8.15): who changed what and when.
 * Read-only; needs `audit:read` in the org.
 */
@Injectable({ providedIn: 'root' })
export class AuditLogApi {
  private readonly api = inject(ApiService);

  list(
    orgId: string,
    filters: AuditFilters,
    limit: number,
    offset: number,
  ): Observable<AuditEventPage> {
    return this.api.get<AuditEventPage>(`v1/orgs/${orgId}/audit-events`, {
      params: auditParams(filters, { limit: Math.min(limit, AUDIT_PAGE_MAX), offset }),
    });
  }

  facets(orgId: string): Observable<AuditFacets> {
    return this.api.get<AuditFacets>(`v1/orgs/${orgId}/audit-events/facets`);
  }

  /** CSV of the filtered rows (at most 10,000). */
  exportCsv(orgId: string, filters: AuditFilters): Observable<Blob> {
    return this.api.getBlob(`v1/orgs/${orgId}/audit-events/export`, {
      params: auditParams(filters),
    });
  }
}
