import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  DataSubjectRequest,
  DecisionBody,
  PrivacyBody,
  PrivacyList,
  PrivacyListQuery,
  PrivacyOverview,
  PrivacyRecord,
  ScreeningOutcome,
} from './privacy.models';
import { RegisterDef } from './privacy-registers';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

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
