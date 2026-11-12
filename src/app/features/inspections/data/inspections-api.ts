import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  ActionCreated,
  ActionRequest,
  AnswerInput,
  CompleteRequest,
  CreateFindingRequest,
  CreateInspectionRequest,
  CreateScheduleRequest,
  CreateTemplateRequest,
  Finding,
  FindingListQuery,
  Inspection,
  InspectionDetail,
  InspectionListQuery,
  InspectionStats,
  Lang,
  LibraryDetail,
  LibraryItem,
  Page,
  Schedule,
  ScheduleListQuery,
  Template,
  TemplateDetail,
  TemplateListQuery,
  UpdateFindingRequest,
  UpdateInspectionRequest,
  UpdateScheduleRequest,
  UpdateTemplateRequest,
} from './inspection.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values?: readonly string[]) => (values?.length ? values.join(',') : undefined);

/**
 * Inspections and checklists (M05): checklist templates and the template library,
 * inspections (plan, answer, complete, cancel), findings (with deviations and
 * follow-up actions) and recurring schedules. Goes through ApiService (base URL,
 * bearer, error handling).
 *
 * Permissions: `inspections:read` to read; `inspections:write` to plan, perform and
 * raise findings; `inspections:templates` to design templates; `inspections:manage`
 * for schedules and deletes. Escalating a finding also needs `deviations:write`.
 */
@Injectable({ providedIn: 'root' })
export class InspectionsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/inspections`;
  }

  // --- templates -------------------------------------------------------------------

  listTemplates(orgId: string, query: TemplateListQuery = {}): Observable<Page<Template>> {
    return this.api.get<Page<Template>>(`${this.base(orgId)}/templates`, {
      params: {
        q: query.q?.trim() || undefined,
        status: csv(query.status),
        category: query.category || undefined,
        framework: query.framework || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getTemplate(orgId: string, id: string): Observable<TemplateDetail> {
    return this.api.get<TemplateDetail>(`${this.base(orgId)}/templates/${id}`);
  }

  createTemplate(orgId: string, body: CreateTemplateRequest): Observable<TemplateDetail> {
    return this.api.post<TemplateDetail>(`${this.base(orgId)}/templates`, body, skipToast());
  }

  updateTemplate(
    orgId: string,
    id: string,
    body: UpdateTemplateRequest,
  ): Observable<TemplateDetail> {
    return this.api.patch<TemplateDetail>(`${this.base(orgId)}/templates/${id}`, body, skipToast());
  }

  publishTemplate(
    orgId: string,
    id: string,
    changeReason?: string | null,
  ): Observable<TemplateDetail> {
    return this.api.post<TemplateDetail>(
      `${this.base(orgId)}/templates/${id}/publish`,
      { change_reason: changeReason || null },
      skipToast(),
    );
  }

  archiveTemplate(
    orgId: string,
    id: string,
    changeReason?: string | null,
  ): Observable<TemplateDetail> {
    return this.api.post<TemplateDetail>(
      `${this.base(orgId)}/templates/${id}/archive`,
      { change_reason: changeReason || null },
      skipToast(),
    );
  }

  duplicateTemplate(orgId: string, id: string): Observable<TemplateDetail> {
    return this.api.post<TemplateDetail>(
      `${this.base(orgId)}/templates/${id}/duplicate`,
      {},
      skipToast(),
    );
  }

  deleteTemplate(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/templates/${id}`, skipToast());
  }

  // --- library ---------------------------------------------------------------------

  listLibrary(orgId: string, lang: Lang): Observable<LibraryItem[]> {
    return this.api.get<LibraryItem[]>(`${this.base(orgId)}/library`, { params: { lang } });
  }

  getLibraryTemplate(orgId: string, key: string, lang: Lang): Observable<LibraryDetail> {
    return this.api.get<LibraryDetail>(`${this.base(orgId)}/library/${key}`, {
      params: { lang },
    });
  }

  importLibraryTemplate(orgId: string, key: string, lang: Lang): Observable<TemplateDetail> {
    return this.api.post<TemplateDetail>(
      `${this.base(orgId)}/library/${key}/import`,
      { lang },
      skipToast(),
    );
  }

  // --- inspections -----------------------------------------------------------------

  list(orgId: string, query: InspectionListQuery = {}): Observable<Page<Inspection>> {
    return this.api.get<Page<Inspection>>(this.base(orgId), {
      params: {
        q: query.q?.trim() || undefined,
        status: csv(query.status),
        template_id: query.template_id,
        schedule_id: query.schedule_id,
        inspector: query.inspector,
        result: query.result,
        due_before: query.due_before,
        due_after: query.due_after,
        overdue: query.overdue,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  stats(orgId: string): Observable<InspectionStats> {
    return this.api.get<InspectionStats>(`${this.base(orgId)}/stats`);
  }

  create(orgId: string, body: CreateInspectionRequest): Observable<InspectionDetail> {
    return this.api.post<InspectionDetail>(this.base(orgId), body, skipToast());
  }

  get(orgId: string, id: string): Observable<InspectionDetail> {
    return this.api.get<InspectionDetail>(`${this.base(orgId)}/${id}`);
  }

  update(orgId: string, id: string, body: UpdateInspectionRequest): Observable<InspectionDetail> {
    return this.api.patch<InspectionDetail>(`${this.base(orgId)}/${id}`, body, skipToast());
  }

  start(orgId: string, id: string): Observable<InspectionDetail> {
    return this.api.post<InspectionDetail>(`${this.base(orgId)}/${id}/start`, {}, skipToast());
  }

  saveResponses(
    orgId: string,
    id: string,
    responses: readonly AnswerInput[],
  ): Observable<InspectionDetail> {
    return this.api.put<InspectionDetail>(
      `${this.base(orgId)}/${id}/responses`,
      { responses },
      skipToast(),
    );
  }

  complete(orgId: string, id: string, body: CompleteRequest): Observable<InspectionDetail> {
    return this.api.post<InspectionDetail>(`${this.base(orgId)}/${id}/complete`, body, skipToast());
  }

  cancel(orgId: string, id: string, reason?: string | null): Observable<InspectionDetail> {
    return this.api.post<InspectionDetail>(
      `${this.base(orgId)}/${id}/cancel`,
      { reason: reason || null },
      skipToast(),
    );
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, skipToast());
  }

  // --- findings --------------------------------------------------------------------

  listFindings(orgId: string, query: FindingListQuery = {}): Observable<Page<Finding>> {
    return this.api.get<Page<Finding>>(`${this.base(orgId)}/findings`, {
      params: {
        inspection_id: query.inspection_id,
        status: csv(query.status),
        severity: csv(query.severity),
        owner: query.owner,
        has_deviation: query.has_deviation,
        q: query.q?.trim() || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createFinding(
    orgId: string,
    inspectionId: string,
    body: CreateFindingRequest,
  ): Observable<Finding> {
    return this.api.post<Finding>(
      `${this.base(orgId)}/${inspectionId}/findings`,
      body,
      skipToast(),
    );
  }

  getFinding(orgId: string, id: string): Observable<Finding> {
    return this.api.get<Finding>(`${this.base(orgId)}/findings/${id}`);
  }

  updateFinding(orgId: string, id: string, body: UpdateFindingRequest): Observable<Finding> {
    return this.api.patch<Finding>(`${this.base(orgId)}/findings/${id}`, body, skipToast());
  }

  closeFinding(orgId: string, id: string): Observable<Finding> {
    return this.api.post<Finding>(`${this.base(orgId)}/findings/${id}/close`, {}, skipToast());
  }

  reopenFinding(orgId: string, id: string): Observable<Finding> {
    return this.api.post<Finding>(`${this.base(orgId)}/findings/${id}/reopen`, {}, skipToast());
  }

  escalateFinding(orgId: string, id: string, deviationTypeId?: string | null): Observable<Finding> {
    return this.api.post<Finding>(
      `${this.base(orgId)}/findings/${id}/deviation`,
      { deviation_type_id: deviationTypeId || null },
      skipToast(),
    );
  }

  addFindingAction(orgId: string, id: string, body: ActionRequest): Observable<ActionCreated> {
    return this.api.post<ActionCreated>(
      `${this.base(orgId)}/findings/${id}/actions`,
      body,
      skipToast(),
    );
  }

  deleteFinding(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/findings/${id}`, skipToast());
  }

  // --- schedules -------------------------------------------------------------------

  listSchedules(orgId: string, query: ScheduleListQuery = {}): Observable<Page<Schedule>> {
    return this.api.get<Page<Schedule>>(`${this.base(orgId)}/schedules`, {
      params: {
        template_id: query.template_id,
        active: query.active,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createSchedule(orgId: string, body: CreateScheduleRequest): Observable<Schedule> {
    return this.api.post<Schedule>(`${this.base(orgId)}/schedules`, body, skipToast());
  }

  updateSchedule(orgId: string, id: string, body: UpdateScheduleRequest): Observable<Schedule> {
    return this.api.patch<Schedule>(`${this.base(orgId)}/schedules/${id}`, body, skipToast());
  }

  deleteSchedule(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/schedules/${id}`, skipToast());
  }
}
