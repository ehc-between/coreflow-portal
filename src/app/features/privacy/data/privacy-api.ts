import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  ContractOption,
  DataSubjectRequest,
  DpaCoverageOut,
  DecisionBody,
  DsrStepKey,
  DsrSystemsOut,
  ExportFormat,
  ExportKind,
  PrivacyBody,
  PrivacyCountries,
  PrivacyGapList,
  PrivacyList,
  PrivacyListQuery,
  PrivacyOverview,
  PrivacyRecord,
  PrivacySettings,
  PrivacySettingsBody,
  RetentionExecution,
  RetentionExecutionBody,
  RetentionExecutionList,
  ScreeningOutcome,
} from './privacy.models';
import { LinkedEntity, RegisterDef } from './privacy-registers';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** A record of another module offered by a link picker. */
export interface ExternalOption {
  readonly id: string;
  readonly label: string;
  /** Portal route of the record (`/suppliers/<id>`). */
  readonly url: string;
}

interface EntitySource {
  readonly path: string;
  readonly limit?: number;
  readonly params?: Readonly<Record<string, string>>;
  readonly option: (row: Record<string, unknown>) => ExternalOption;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const coded = (code: unknown, title: unknown): string =>
  [text(code), text(title)].filter(Boolean).join(' · ');

/** Where the link pickers read the other modules' records (first 200). */
const ENTITY_SOURCES: Readonly<Record<LinkedEntity, EntitySource>> = {
  supplier: {
    path: 'suppliers',
    option: (r) => ({
      id: text(r['id']),
      label: coded(r['code'], r['name']),
      url: `/suppliers/${text(r['id'])}`,
    }),
  },
  contract: {
    path: 'contracts',
    params: { sort: 'code' },
    option: (r) => ({
      id: text(r['id']),
      label: coded(r['code'], r['title']),
      url: `/contracts/${text(r['id'])}`,
    }),
  },
  document: {
    path: 'documents',
    option: (r) => ({
      id: text(r['id']),
      label: coded(r['doc_code'], r['title']),
      url: `/documents/${text(r['id'])}`,
    }),
  },
  asset: {
    path: 'assets',
    option: (r) => ({
      id: text(r['id']),
      label: coded(r['code'], r['name']),
      url: `/assets/${text(r['id'])}`,
    }),
  },
  employee: {
    path: 'people/employees',
    option: (r) => ({
      id: text(r['id']),
      label: coded(r['code'], r['full_name']),
      url: `/people/employees/${text(r['id'])}`,
    }),
  },
};

/** The query parameters of `GET /<segment>` (csv status, unset values dropped). */
export function privacyListParams(query: PrivacyListQuery): QueryParams {
  const params: Record<string, string | number | boolean | undefined> = {
    q: query.q?.trim() || undefined,
    status: query.status?.length ? query.status.join(',') : undefined,
    owner: query.owner || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
    overdue: query.overdue,
  };
  for (const [key, value] of Object.entries(query.extra ?? {})) {
    if (value) {
      params[key] = value;
    }
  }
  return params;
}

/** GDPR and privacy API (M15): `v1/orgs/{org}/privacy/...`. */
@Injectable({ providedIn: 'root' })
export class PrivacyApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/privacy`;
  }

  private path(orgId: string, register: RegisterDef, id?: string): string {
    const root = `${this.base(orgId)}/${register.segment}`;
    return id ? `${root}/${id}` : root;
  }

  list<T extends PrivacyRecord = PrivacyRecord>(
    orgId: string,
    register: RegisterDef,
    query: PrivacyListQuery = {},
  ): Observable<PrivacyList<T>> {
    return this.api.get<PrivacyList<T>>(this.path(orgId, register), {
      ...IN_PLACE,
      params: privacyListParams(query),
    });
  }

  get<T extends PrivacyRecord = PrivacyRecord>(
    orgId: string,
    register: RegisterDef,
    id: string,
  ): Observable<T> {
    return this.api.get<T>(this.path(orgId, register, id), IN_PLACE);
  }

  create<T extends PrivacyRecord = PrivacyRecord>(
    orgId: string,
    register: RegisterDef,
    body: PrivacyBody,
  ): Observable<T> {
    return this.api.post<T>(this.path(orgId, register), body, IN_PLACE);
  }

  update<T extends PrivacyRecord = PrivacyRecord>(
    orgId: string,
    register: RegisterDef,
    id: string,
    body: PrivacyBody,
  ): Observable<T> {
    return this.api.patch<T>(this.path(orgId, register, id), body, IN_PLACE);
  }

  remove(orgId: string, register: RegisterDef, id: string): Observable<void> {
    return this.api.delete<void>(this.path(orgId, register, id), IN_PLACE);
  }

  /** `POST /data-subject-requests/{id}/extend` (once, by two months, with a reason). */
  extendRequest(orgId: string, id: string, reason: string): Observable<DataSubjectRequest> {
    return this.api.post<DataSubjectRequest>(
      `${this.base(orgId)}/data-subject-requests/${id}/extend`,
      { reason },
      IN_PLACE,
    );
  }

  /** `POST /dpias/{id}/decision` or `/legal-basis-assessments/{id}/decision` (privacy:approve). */
  decide<T extends PrivacyRecord = PrivacyRecord>(
    orgId: string,
    register: RegisterDef,
    id: string,
    body: DecisionBody,
  ): Observable<T> {
    return this.api.post<T>(`${this.path(orgId, register, id)}/decision`, body, IN_PLACE);
  }

  /** `GET /processors/{id}/dpa-coverage`: Art. 28(3) coverage from the linked contracts. */
  dpaCoverage(orgId: string, processorId: string): Observable<DpaCoverageOut> {
    return this.api.get<DpaCoverageOut>(
      `${this.base(orgId)}/processors/${processorId}/dpa-coverage`,
      IN_PLACE,
    );
  }

  /** Contracts a transfer can name as its safeguard (first 200 by code; needs contracts:read). */
  contractOptions(orgId: string): Observable<readonly ContractOption[]> {
    return this.api
      .get<{ items: readonly ContractOption[] }>(`v1/orgs/${orgId}/contracts`, {
        ...IN_PLACE,
        params: { sort: 'code', limit: 200 },
      })
      .pipe(map((r) => r.items));
  }

  /** `GET /gaps`: missing links between the registers, each with a prefilled fix. */
  gaps(
    orgId: string,
    filter: { kind?: string; entityId?: string } = {},
  ): Observable<PrivacyGapList> {
    return this.api.get<PrivacyGapList>(`${this.base(orgId)}/gaps`, {
      ...IN_PLACE,
      params: { kind: filter.kind || undefined, entity_id: filter.entityId || undefined },
    });
  }

  settings(orgId: string): Observable<PrivacySettings> {
    return this.api.get<PrivacySettings>(`${this.base(orgId)}/settings`, IN_PLACE);
  }

  /** `PUT /settings` (privacy:manage). */
  saveSettings(orgId: string, body: PrivacySettingsBody): Observable<PrivacySettings> {
    return this.api.put<PrivacySettings>(`${this.base(orgId)}/settings`, body, IN_PLACE);
  }

  /** `GET /countries`: EEA, adequacy and partial-adequacy codes. */
  countries(orgId: string): Observable<PrivacyCountries> {
    return this.api.get<PrivacyCountries>(`${this.base(orgId)}/countries`, IN_PLACE);
  }

  /** `GET /exports/{kind}`: the Art. 30 record, breach log, request log or processor list. */
  exportFile(
    orgId: string,
    kind: ExportKind,
    format: ExportFormat,
    lang: string,
  ): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/exports/${kind}`, {
      ...IN_PLACE,
      params: { format, lang: lang === 'en' ? 'en' : 'nb' },
    });
  }

  /** `POST /data-subject-requests/{id}/steps/{step}`: tick or untick a handling step. */
  setRequestStep(
    orgId: string,
    id: string,
    step: DsrStepKey,
    done: boolean,
  ): Observable<DataSubjectRequest> {
    return this.api.post<DataSubjectRequest>(
      `${this.base(orgId)}/data-subject-requests/${id}/steps/${step}`,
      { done },
      IN_PLACE,
    );
  }

  /** `GET /data-subject-requests/{id}/systems`: the active processing activities to search. */
  requestSystems(orgId: string, id: string): Observable<DsrSystemsOut> {
    return this.api.get<DsrSystemsOut>(
      `${this.base(orgId)}/data-subject-requests/${id}/systems`,
      IN_PLACE,
    );
  }

  /** `GET /retention-schedules/{id}/executions`: the deletion log. */
  executions(orgId: string, id: string): Observable<RetentionExecutionList> {
    return this.api.get<RetentionExecutionList>(
      `${this.base(orgId)}/retention-schedules/${id}/executions`,
      IN_PLACE,
    );
  }

  /** `POST /retention-schedules/{id}/executions` (privacy:write): log a deletion run. */
  logExecution(
    orgId: string,
    id: string,
    body: RetentionExecutionBody,
  ): Observable<RetentionExecution> {
    return this.api.post<RetentionExecution>(
      `${this.base(orgId)}/retention-schedules/${id}/executions`,
      body,
      IN_PLACE,
    );
  }

  /**
   * First 200 records of another module for a link picker (`{id, label}`), sorted by
   * the list's default order. Empty when the caller cannot read the module.
   */
  entityOptions(orgId: string, entity: LinkedEntity): Observable<readonly ExternalOption[]> {
    const source = ENTITY_SOURCES[entity];
    return this.api
      .get<unknown>(`v1/orgs/${orgId}/${source.path}`, {
        ...IN_PLACE,
        params: { limit: source.limit ?? 200, ...(source.params ?? {}) },
      })
      .pipe(
        map((res) => {
          const items = Array.isArray(res)
            ? res
            : ((res as { items?: unknown[] } | null)?.items ?? []);
          return (items as Record<string, unknown>[]).map(source.option);
        }),
      );
  }

  overview(orgId: string): Observable<PrivacyOverview> {
    return this.api.get<PrivacyOverview>(`${this.base(orgId)}/overview`, IN_PLACE);
  }

  /** The server-side screening rule (the form computes the same rule locally). */
  screen(
    orgId: string,
    screening: Readonly<Record<string, boolean>>,
  ): Observable<ScreeningOutcome> {
    return this.api.post<ScreeningOutcome>(
      `${this.base(orgId)}/dpia-screening`,
      { screening },
      IN_PLACE,
    );
  }
}
