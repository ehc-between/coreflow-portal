import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { TaskDetail, TaskList } from '../../../core/tasks/task.models';
import {
  Contract,
  ContractAction,
  ContractActionBody,
  ContractCreate,
  ContractList,
  ContractListQuery,
  ContractSettings,
  ContractUpdate,
  ContractVersion,
  Deadline,
  DpaCandidate,
  DpaClauseIn,
  KeyDate,
  KeyDateIn,
  KeyDateUpdate,
  ObligationCreate,
  Party,
  PartyIn,
  PartyUpdate,
  VersionIn,
  VersionUpdate,
} from './contract.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** The query parameters of `GET contracts` (csv lists, unset values dropped). */
export function contractListParams(query: ContractListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: query.status?.length ? query.status.join(',') : undefined,
    type: query.type?.length ? query.type.join(',') : undefined,
    owner: query.owner || undefined,
    expiring_within_days: query.expiring_within_days,
    processes_personal_data: query.processes_personal_data,
    personal_data_role: query.personal_data_role?.length
      ? query.personal_data_role.join(',')
      : undefined,
    supplier_id: query.supplier_id || undefined,
    warning: query.warning?.length ? query.warning.join(',') : undefined,
    dpa_missing: query.dpa_missing || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Contract register API (M12): `v1/orgs/{org}/contracts/...`. */
@Injectable({ providedIn: 'root' })
export class ContractsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/contracts`;
  }

  list(orgId: string, query: ContractListQuery = {}): Observable<ContractList> {
    return this.api.get<ContractList>(this.base(orgId), {
      ...IN_PLACE,
      params: contractListParams(query),
    });
  }

  /** The register as CSV (same filters as the list; headers and labels in `lang`). */
  exportCsv(orgId: string, query: ContractListQuery, lang: string): Observable<Blob> {
    const params = contractListParams({ ...query, limit: undefined, offset: undefined });
    return this.api.getBlob(`${this.base(orgId)}/export`, {
      ...IN_PLACE,
      params: { ...params, lang },
    });
  }

  /** `owner`: `me` (the "Mine" filter) or a user id. */
  deadlines(
    orgId: string,
    withinDays = 90,
    includeOverdue = true,
    owner?: string,
  ): Observable<readonly Deadline[]> {
    return this.api
      .get<{ items: readonly Deadline[] }>(`${this.base(orgId)}/deadlines`, {
        ...IN_PLACE,
        params: {
          within_days: withinDays,
          include_overdue: includeOverdue,
          owner: owner || undefined,
        },
      })
      .pipe(map((r) => r.items));
  }

  /** The deadlines as an iCalendar file (all-day events) for Outlook or Google Calendar. */
  deadlinesIcs(orgId: string, withinDays: number, lang: string, owner?: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/deadlines/export.ics`, {
      ...IN_PLACE,
      params: { within_days: withinDays, lang, owner: owner || undefined },
    });
  }

  settings(orgId: string): Observable<ContractSettings> {
    return this.api.get<ContractSettings>(`${this.base(orgId)}/settings`, IN_PLACE);
  }

  updateSettings(orgId: string, body: Partial<ContractSettings>): Observable<ContractSettings> {
    return this.api.put<ContractSettings>(`${this.base(orgId)}/settings`, body, IN_PLACE);
  }

  /** DPA contracts that could cover this contract, best counterparty match first. */
  dpaCandidates(orgId: string, id: string): Observable<readonly DpaCandidate[]> {
    return this.api
      .get<{ items: readonly DpaCandidate[] }>(`${this.base(orgId)}/${id}/dpa-candidates`, IN_PLACE)
      .pipe(map((r) => r.items));
  }

  /** Link a DPA contract to this contract (422 `not_a_dpa`, 409 `link_exists`). */
  linkDpa(orgId: string, id: string, dpaId: string): Observable<Contract> {
    return this.api.post<Contract>(
      `${this.base(orgId)}/${id}/dpa-links`,
      { dpa_id: dpaId },
      IN_PLACE,
    );
  }

  get(orgId: string, id: string): Observable<Contract> {
    return this.api.get<Contract>(`${this.base(orgId)}/${id}`, IN_PLACE);
  }

  create(orgId: string, body: ContractCreate): Observable<Contract> {
    return this.api.post<Contract>(this.base(orgId), body, IN_PLACE);
  }

  update(orgId: string, id: string, body: ContractUpdate): Observable<Contract> {
    return this.api.patch<Contract>(`${this.base(orgId)}/${id}`, body, IN_PLACE);
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, IN_PLACE);
  }

  action(
    orgId: string,
    id: string,
    action: ContractAction,
    body: ContractActionBody = {},
  ): Observable<Contract> {
    return this.api.post<Contract>(`${this.base(orgId)}/${id}/${action}`, body, IN_PLACE);
  }

  /** Upsert GDPR Art. 28(3) checklist entries (merged by key); returns the contract. */
  updateDpaClauses(
    orgId: string,
    id: string,
    clauses: readonly DpaClauseIn[],
  ): Observable<Contract> {
    return this.api.put<Contract>(`${this.base(orgId)}/${id}/dpa-clauses`, { clauses }, IN_PLACE);
  }

  // --- parties ----------------------------------------------------------------------

  addParty(orgId: string, id: string, body: PartyIn): Observable<Party> {
    return this.api.post<Party>(`${this.base(orgId)}/${id}/parties`, body, IN_PLACE);
  }

  updateParty(orgId: string, id: string, partyId: string, body: PartyUpdate): Observable<Party> {
    return this.api.patch<Party>(`${this.base(orgId)}/${id}/parties/${partyId}`, body, IN_PLACE);
  }

  removeParty(orgId: string, id: string, partyId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}/parties/${partyId}`, IN_PLACE);
  }

  // --- key dates --------------------------------------------------------------------

  addKeyDate(orgId: string, id: string, body: KeyDateIn): Observable<KeyDate> {
    return this.api.post<KeyDate>(`${this.base(orgId)}/${id}/key-dates`, body, IN_PLACE);
  }

  updateKeyDate(
    orgId: string,
    id: string,
    keyDateId: string,
    body: KeyDateUpdate,
  ): Observable<KeyDate> {
    return this.api.patch<KeyDate>(
      `${this.base(orgId)}/${id}/key-dates/${keyDateId}`,
      body,
      IN_PLACE,
    );
  }

  removeKeyDate(orgId: string, id: string, keyDateId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}/key-dates/${keyDateId}`, IN_PLACE);
  }

  // --- versions ---------------------------------------------------------------------

  addVersion(orgId: string, id: string, body: VersionIn): Observable<ContractVersion> {
    return this.api.post<ContractVersion>(`${this.base(orgId)}/${id}/versions`, body, IN_PLACE);
  }

  updateVersion(
    orgId: string,
    id: string,
    versionId: string,
    body: VersionUpdate,
  ): Observable<ContractVersion> {
    return this.api.patch<ContractVersion>(
      `${this.base(orgId)}/${id}/versions/${versionId}`,
      body,
      IN_PLACE,
    );
  }

  // --- obligations (platform tasks of kind contract_obligation) ---------------------

  obligations(orgId: string, id: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/${id}/obligations`, IN_PLACE);
  }

  addObligation(orgId: string, id: string, body: ObligationCreate): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(`${this.base(orgId)}/${id}/obligations`, body, IN_PLACE);
  }
}
