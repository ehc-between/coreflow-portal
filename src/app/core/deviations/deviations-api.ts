import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  AccessGrant,
  AccessGrantInput,
  AccessSubjects,
  Action,
  ActionFilters,
  ActionInput,
  ActionListResponse,
  CreateDeviationRequest,
  DeviationAccess,
  DeviationDetail,
  DeviationFilters,
  DeviationListItem,
  DeviationListResponse,
  DeviationStats,
  DeviationStatus,
  DeviationType,
  DeviationTypeDraftResponse,
  DeviationTypeInput,
  Standard,
  UpdateDeviationRequest,
} from './deviation.models';

/**
 * Org-scoped Deviations API. Goes through ApiService, so requests carry the
 * in-memory bearer token (attached by the auth interceptor) and the configured
 * base URL. Callers pass the current org id and gate actions on the relevant
 * `deviations:*` permission for that org.
 *
 * This is the complete client for the deviations module — list/create are wired
 * now; detail, edit, actions, access and stats are reused by later surfaces.
 */
@Injectable({ providedIn: 'root' })
export class DeviationsApi {
  private readonly api = inject(ApiService);

  // --- Deviation types -------------------------------------------------------

  /** List the org's deviation types (used by the create form's type picker). */
  listTypes(orgId: string): Observable<DeviationType[]> {
    return this.api.get<DeviationType[]>(`v1/orgs/${orgId}/deviation-types`);
  }

  getType(orgId: string, typeId: string): Observable<DeviationType> {
    return this.api.get<DeviationType>(`v1/orgs/${orgId}/deviation-types/${typeId}`);
  }

  /** Create a deviation type (admin form-builder — built in a later dispatch). */
  createType(orgId: string, body: DeviationTypeInput): Observable<DeviationType> {
    return this.api.post<DeviationType>(`v1/orgs/${orgId}/deviation-types`, body);
  }

  updateType(
    orgId: string,
    typeId: string,
    body: Partial<DeviationTypeInput>,
  ): Observable<DeviationType> {
    return this.api.patch<DeviationType>(`v1/orgs/${orgId}/deviation-types/${typeId}`, body);
  }

  deleteType(orgId: string, typeId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/deviation-types/${typeId}`);
  }

  /**
   * Ask the AI to draft a full deviation type from a short description, to
   * populate the editor for review. Not org-prefixed in the path — the org is
   * passed in the body. 503 if AI isn't configured; 502 on a design failure.
   */
  draftType(
    orgId: string,
    description: string,
    standards?: readonly Standard[],
  ): Observable<DeviationTypeDraftResponse> {
    return this.api.post<DeviationTypeDraftResponse>('v1/ai/deviation-type-draft', {
      org_id: orgId,
      description,
      standards,
    });
  }

  // --- Deviations ------------------------------------------------------------

  /** Page of deviations matching the filters, plus the unpaged total. */
  listDeviations(orgId: string, filters: DeviationFilters = {}): Observable<DeviationListResponse> {
    return this.api.get<DeviationListResponse>(`v1/orgs/${orgId}/deviations`, {
      params: {
        status: filters.status,
        type_id: filters.type_id,
        standard: filters.standard,
        severity: filters.severity,
        tag: filters.tag,
        clause: filters.clause,
        owner_user_id: filters.owner_user_id,
        department_id: filters.department_id,
        source: filters.source,
        due_before: filters.due_before,
        due_after: filters.due_after,
        q: filters.q,
        active: filters.active || undefined,
        overdue: filters.overdue || undefined,
        sort: filters.sort,
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  }

  getDeviation(orgId: string, deviationId: string): Observable<DeviationDetail> {
    return this.api.get<DeviationDetail>(`v1/orgs/${orgId}/deviations/${deviationId}`);
  }

  createDeviation(orgId: string, body: CreateDeviationRequest): Observable<DeviationListItem> {
    return this.api.post<DeviationListItem>(`v1/orgs/${orgId}/deviations`, body);
  }

  updateDeviation(
    orgId: string,
    deviationId: string,
    patch: UpdateDeviationRequest,
  ): Observable<DeviationDetail> {
    return this.api.patch<DeviationDetail>(`v1/orgs/${orgId}/deviations/${deviationId}`, patch);
  }

  /**
   * Move a deviation to another workflow status (`PATCH {status, status_reason?}`).
   * The generic error toast is suppressed: a 409 carries a workflow code
   * (`invalid_transition`, `reason_required`, `open_actions`, …) the caller
   * explains in place, and the caller toasts any other failure itself.
   */
  changeStatus(
    orgId: string,
    deviationId: string,
    status: DeviationStatus,
    statusReason?: string,
  ): Observable<DeviationDetail> {
    const body: UpdateDeviationRequest = statusReason
      ? { status, status_reason: statusReason }
      : { status };
    return this.api.patch<DeviationDetail>(`v1/orgs/${orgId}/deviations/${deviationId}`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  deleteDeviation(orgId: string, deviationId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/deviations/${deviationId}`);
  }

  // --- Actions ---------------------------------------------------------------

  /**
   * CAPA actions across every deviation the caller may view (`deviations:read`).
   * Defaults to open + in-progress actions, soonest due first.
   */
  listActions(orgId: string, filters: ActionFilters = {}): Observable<ActionListResponse> {
    return this.api.get<ActionListResponse>(`v1/orgs/${orgId}/actions`, {
      params: {
        owner_user_id: filters.owner_user_id,
        status: filters.status,
        overdue: filters.overdue || undefined,
        due_before: filters.due_before,
        due_after: filters.due_after,
        sort: filters.sort,
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  }

  addAction(orgId: string, deviationId: string, body: ActionInput): Observable<Action> {
    return this.api.post<Action>(`v1/orgs/${orgId}/deviations/${deviationId}/actions`, body);
  }

  updateAction(
    orgId: string,
    deviationId: string,
    actionId: string,
    body: ActionInput,
  ): Observable<Action> {
    return this.api.patch<Action>(
      `v1/orgs/${orgId}/deviations/${deviationId}/actions/${actionId}`,
      body,
    );
  }

  deleteAction(orgId: string, deviationId: string, actionId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/deviations/${deviationId}/actions/${actionId}`);
  }

  // --- Access ----------------------------------------------------------------

  getAccess(orgId: string, deviationId: string): Observable<DeviationAccess> {
    return this.api.get<DeviationAccess>(`v1/orgs/${orgId}/deviations/${deviationId}/access`);
  }

  addGrant(orgId: string, deviationId: string, body: AccessGrantInput): Observable<AccessGrant> {
    return this.api.post<AccessGrant>(
      `v1/orgs/${orgId}/deviations/${deviationId}/access/grants`,
      body,
    );
  }

  removeGrant(orgId: string, deviationId: string, grantId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/deviations/${deviationId}/access/grants/${grantId}`,
    );
  }

  // --- Stats -----------------------------------------------------------------

  /** Aggregate metrics for the stats dashboard (same filters as the list). */
  getStats(orgId: string, filters: DeviationFilters = {}): Observable<DeviationStats> {
    return this.api.get<DeviationStats>(`v1/orgs/${orgId}/deviations/stats`, {
      params: {
        status: filters.status,
        type_id: filters.type_id,
        standard: filters.standard,
        severity: filters.severity,
        tag: filters.tag,
        clause: filters.clause,
        owner_user_id: filters.owner_user_id,
        department_id: filters.department_id,
        source: filters.source,
        due_before: filters.due_before,
        due_after: filters.due_after,
        q: filters.q,
      },
    });
  }

  // --- Subjects --------------------------------------------------------------

  /** Subjects (org users + departments) for the owner / department / access pickers. */
  listAccessSubjects(orgId: string): Observable<AccessSubjects> {
    return this.api.get<AccessSubjects>(`v1/orgs/${orgId}/access-subjects`);
  }
}
