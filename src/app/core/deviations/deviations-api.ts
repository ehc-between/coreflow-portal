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
  DeviationTemplateList,
  DeviationTransitionRequest,
  DeviationType,
  DeviationTypeDraftResponse,
  DeviationTypeInput,
  CreateRootCauseRequest,
  InstallDeviationTemplateRequest,
  RootCauseAnalysis,
  RootCauseAnalysisList,
  SimilarDeviationList,
  Standard,
  UpdateDeviationRequest,
  UpdateRootCauseRequest,
} from './deviation.models';

/**
 * Mutations whose failures the feature explains in place (coded 4xx details
 * mapped to translated messages via deviation-errors), so the interceptor's
 * generic toast is suppressed; callers toast every failure themselves.
 */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

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
    return this.api.post<DeviationType>(`v1/orgs/${orgId}/deviation-types`, body, IN_PLACE);
  }

  updateType(
    orgId: string,
    typeId: string,
    body: Partial<DeviationTypeInput>,
  ): Observable<DeviationType> {
    return this.api.patch<DeviationType>(
      `v1/orgs/${orgId}/deviation-types/${typeId}`,
      body,
      IN_PLACE,
    );
  }

  deleteType(orgId: string, typeId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/deviation-types/${typeId}`, IN_PLACE);
  }

  /**
   * Ask the AI to draft a full deviation type from a short description, to
   * populate the editor for review. Not org-prefixed in the path — the org is
   * passed in the body. `lang` is the UI language the names, labels, options,
   * help and section titles should be written in (the type is org data the
   * portal can't translate later). 503 if AI isn't configured; 502 on a design
   * failure.
   */
  draftType(
    orgId: string,
    description: string,
    standards?: readonly Standard[],
    lang?: string,
  ): Observable<DeviationTypeDraftResponse> {
    return this.api.post<DeviationTypeDraftResponse>('v1/ai/deviation-type-draft', {
      org_id: orgId,
      description,
      standards,
      lang,
    });
  }

  // --- Deviations ------------------------------------------------------------

  /** Page of deviations matching the filters, plus the unpaged total. */
  listDeviations(orgId: string, filters: DeviationFilters = {}): Observable<DeviationListResponse> {
    return this.api.get<DeviationListResponse>(`v1/orgs/${orgId}/deviations`, {
      params: {
        status: filters.status,
        category: filters.category,
        record_type_id: filters.record_type_id,
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
    return this.api.post<DeviationListItem>(`v1/orgs/${orgId}/deviations`, body, IN_PLACE);
  }

  updateDeviation(
    orgId: string,
    deviationId: string,
    patch: UpdateDeviationRequest,
  ): Observable<DeviationDetail> {
    return this.api.patch<DeviationDetail>(
      `v1/orgs/${orgId}/deviations/${deviationId}`,
      patch,
      IN_PLACE,
    );
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
    status: string,
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

  /**
   * Run an F4 workflow transition on a record-typed deviation (or request its
   * approval); returns the refreshed detail. Coded 409 / 422 errors
   * (`transition_not_allowed`, `required_fields`, `comment_required`, …) are
   * explained in place by the caller. Unlike the generic workflow endpoint this
   * one can also reopen a closed deviation.
   */
  transition(
    orgId: string,
    deviationId: string,
    key: string,
    body: DeviationTransitionRequest = {},
  ): Observable<DeviationDetail> {
    return this.api.post<DeviationDetail>(
      `v1/orgs/${orgId}/deviations/${deviationId}/transitions/${encodeURIComponent(key)}`,
      body,
      IN_PLACE,
    );
  }

  /** Similar past deviations (permission-filtered full-text search, no AI). */
  similar(orgId: string, deviationId: string, limit = 5): Observable<SimilarDeviationList> {
    return this.api.get<SimilarDeviationList>(
      `v1/orgs/${orgId}/deviations/${deviationId}/similar`,
      { params: { limit } },
    );
  }

  // --- Templates (M03) -------------------------------------------------------

  /** The built-in deviation record templates and whether each is installed. */
  listTemplates(orgId: string): Observable<DeviationTemplateList> {
    return this.api.get<DeviationTemplateList>(`v1/orgs/${orgId}/deviation-templates`);
  }

  /** Install a template as a record type + workflow + bound deviation type (`deviations:admin`). */
  installTemplate(
    orgId: string,
    key: string,
    body: InstallDeviationTemplateRequest = {},
  ): Observable<DeviationType> {
    return this.api.post<DeviationType>(
      `v1/orgs/${orgId}/deviation-templates/${encodeURIComponent(key)}/install`,
      body,
      IN_PLACE,
    );
  }

  // --- Root-cause analyses (M03) ---------------------------------------------

  listRootCauses(orgId: string, deviationId: string): Observable<RootCauseAnalysisList> {
    return this.api.get<RootCauseAnalysisList>(
      `v1/orgs/${orgId}/deviations/${deviationId}/root-causes`,
    );
  }

  createRootCause(
    orgId: string,
    deviationId: string,
    body: CreateRootCauseRequest,
  ): Observable<RootCauseAnalysis> {
    return this.api.post<RootCauseAnalysis>(
      `v1/orgs/${orgId}/deviations/${deviationId}/root-causes`,
      body,
      IN_PLACE,
    );
  }

  updateRootCause(
    orgId: string,
    deviationId: string,
    analysisId: string,
    body: UpdateRootCauseRequest,
  ): Observable<RootCauseAnalysis> {
    return this.api.patch<RootCauseAnalysis>(
      `v1/orgs/${orgId}/deviations/${deviationId}/root-causes/${analysisId}`,
      body,
      IN_PLACE,
    );
  }

  /** Copy the worksheet's conclusion into the deviation's root cause (422 `conclusion_required`). */
  applyRootCause(
    orgId: string,
    deviationId: string,
    analysisId: string,
  ): Observable<RootCauseAnalysis> {
    return this.api.post<RootCauseAnalysis>(
      `v1/orgs/${orgId}/deviations/${deviationId}/root-causes/${analysisId}/apply`,
      {},
      IN_PLACE,
    );
  }

  deleteRootCause(orgId: string, deviationId: string, analysisId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/deviations/${deviationId}/root-causes/${analysisId}`,
      IN_PLACE,
    );
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
    return this.api.post<Action>(
      `v1/orgs/${orgId}/deviations/${deviationId}/actions`,
      body,
      IN_PLACE,
    );
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
      IN_PLACE,
    );
  }

  deleteAction(orgId: string, deviationId: string, actionId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/deviations/${deviationId}/actions/${actionId}`,
      IN_PLACE,
    );
  }

  // --- Access ----------------------------------------------------------------

  getAccess(orgId: string, deviationId: string): Observable<DeviationAccess> {
    return this.api.get<DeviationAccess>(`v1/orgs/${orgId}/deviations/${deviationId}/access`);
  }

  addGrant(orgId: string, deviationId: string, body: AccessGrantInput): Observable<AccessGrant> {
    return this.api.post<AccessGrant>(
      `v1/orgs/${orgId}/deviations/${deviationId}/access/grants`,
      body,
      IN_PLACE,
    );
  }

  removeGrant(orgId: string, deviationId: string, grantId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/deviations/${deviationId}/access/grants/${grantId}`,
      IN_PLACE,
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
