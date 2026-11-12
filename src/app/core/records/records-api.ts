import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, RequestOptions } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  CreateRecordTypeRequest,
  CreateWorkflowRequest,
  DecisionRequest,
  DecisionResult,
  InstallTemplateRequest,
  InstallTemplateResponse,
  PendingApprovals,
  PublishRecordTypeVersionRequest,
  RecordTemplate,
  RecordType,
  RecordTypeVersion,
  RecordTypeVersionSummary,
  TransitionRequest,
  TransitionResult,
  UpdateRecordTypeRequest,
  UpdateWorkflowRequest,
  ValidateDataRequest,
  ValidateDataResponse,
  Workflow,
  WorkflowAiDraft,
  WorkflowAiDraftRequest,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowVersion,
  WorkflowVersionSummary,
} from './record.models';

/** Writes report their own (coded) errors in place, so the generic toast is skipped. */
const quiet = (): RequestOptions => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Record types, workflow definitions, templates, workflow instances and
 * approvals (platform contracts 7.6). Every path is under `v1/orgs/{orgId}`.
 * Design-time reads need `records:read`, design-time writes `records:admin`;
 * instance and approval calls are checked against the record itself.
 */
@Injectable({ providedIn: 'root' })
export class RecordsApi {
  private readonly api = inject(ApiService);

  // --- record types -------------------------------------------------------------------

  listRecordTypes(
    orgId: string,
    filter: { module?: string | null; includeInactive?: boolean } = {},
  ): Observable<RecordType[]> {
    return this.api.get<RecordType[]>(`v1/orgs/${orgId}/record-types`, {
      params: { module: filter.module || null, include_inactive: filter.includeInactive ?? true },
    });
  }

  getRecordType(orgId: string, id: string): Observable<RecordType> {
    return this.api.get<RecordType>(`v1/orgs/${orgId}/record-types/${id}`);
  }

  createRecordType(orgId: string, body: CreateRecordTypeRequest): Observable<RecordType> {
    return this.api.post<RecordType>(`v1/orgs/${orgId}/record-types`, body, quiet());
  }

  updateRecordType(
    orgId: string,
    id: string,
    body: UpdateRecordTypeRequest,
  ): Observable<RecordType> {
    return this.api.patch<RecordType>(`v1/orgs/${orgId}/record-types/${id}`, body, quiet());
  }

  deleteRecordType(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/record-types/${id}`, quiet());
  }

  listRecordTypeVersions(orgId: string, id: string): Observable<RecordTypeVersionSummary[]> {
    return this.api.get<RecordTypeVersionSummary[]>(`v1/orgs/${orgId}/record-types/${id}/versions`);
  }

  getRecordTypeVersion(orgId: string, id: string, version: number): Observable<RecordTypeVersion> {
    return this.api.get<RecordTypeVersion>(
      `v1/orgs/${orgId}/record-types/${id}/versions/${version}`,
    );
  }

  publishRecordTypeVersion(
    orgId: string,
    id: string,
    body: PublishRecordTypeVersionRequest,
  ): Observable<RecordTypeVersion> {
    return this.api.post<RecordTypeVersion>(
      `v1/orgs/${orgId}/record-types/${id}/versions`,
      body,
      quiet(),
    );
  }

  validateRecordData(
    orgId: string,
    id: string,
    body: ValidateDataRequest,
  ): Observable<ValidateDataResponse> {
    return this.api.post<ValidateDataResponse>(
      `v1/orgs/${orgId}/record-types/${id}/validate`,
      body,
      quiet(),
    );
  }

  // --- workflows ----------------------------------------------------------------------

  listWorkflows(orgId: string, module?: string | null): Observable<Workflow[]> {
    return this.api.get<Workflow[]>(`v1/orgs/${orgId}/workflows`, {
      params: { module: module || null },
    });
  }

  getWorkflow(orgId: string, id: string): Observable<Workflow> {
    return this.api.get<Workflow>(`v1/orgs/${orgId}/workflows/${id}`);
  }

  createWorkflow(orgId: string, body: CreateWorkflowRequest): Observable<Workflow> {
    return this.api.post<Workflow>(`v1/orgs/${orgId}/workflows`, body, quiet());
  }

  updateWorkflow(orgId: string, id: string, body: UpdateWorkflowRequest): Observable<Workflow> {
    return this.api.patch<Workflow>(`v1/orgs/${orgId}/workflows/${id}`, body, quiet());
  }

  deleteWorkflow(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/workflows/${id}`, quiet());
  }

  listWorkflowVersions(orgId: string, id: string): Observable<WorkflowVersionSummary[]> {
    return this.api.get<WorkflowVersionSummary[]>(`v1/orgs/${orgId}/workflows/${id}/versions`);
  }

  getWorkflowVersion(orgId: string, id: string, version: number): Observable<WorkflowVersion> {
    return this.api.get<WorkflowVersion>(`v1/orgs/${orgId}/workflows/${id}/versions/${version}`);
  }

  publishWorkflowVersion(
    orgId: string,
    id: string,
    definition: WorkflowDefinition,
    changeNote?: string | null,
  ): Observable<WorkflowVersion> {
    return this.api.post<WorkflowVersion>(
      `v1/orgs/${orgId}/workflows/${id}/versions`,
      { definition, change_note: changeNote || null },
      quiet(),
    );
  }

  /** Designs (never persists) a record type and workflow from plain language. */
  aiDraft(orgId: string, body: WorkflowAiDraftRequest): Observable<WorkflowAiDraft> {
    return this.api.post<WorkflowAiDraft>(`v1/orgs/${orgId}/workflows/ai-draft`, body, quiet());
  }

  // --- templates ----------------------------------------------------------------------

  listTemplates(orgId: string, module?: string | null): Observable<RecordTemplate[]> {
    return this.api.get<RecordTemplate[]>(`v1/orgs/${orgId}/record-templates`, {
      params: { module: module || null },
    });
  }

  installTemplate(
    orgId: string,
    key: string,
    body: InstallTemplateRequest = {},
  ): Observable<InstallTemplateResponse> {
    return this.api.post<InstallTemplateResponse>(
      `v1/orgs/${orgId}/record-templates/${key}/install`,
      body,
      quiet(),
    );
  }

  // --- instances + approvals ----------------------------------------------------------

  /** The workflow state of one record; quiet, since "not started" (404) is normal. */
  getInstance(orgId: string, entityType: string, entityId: string): Observable<WorkflowInstance> {
    return this.api.get<WorkflowInstance>(
      `v1/orgs/${orgId}/workflow-instances/${entityType}/${entityId}`,
      quiet(),
    );
  }

  transition(
    orgId: string,
    entityType: string,
    entityId: string,
    key: string,
    body: TransitionRequest,
  ): Observable<TransitionResult> {
    return this.api.post<TransitionResult>(
      `v1/orgs/${orgId}/workflow-instances/${entityType}/${entityId}/transitions/${key}`,
      body,
      quiet(),
    );
  }

  listMyApprovals(orgId: string): Observable<PendingApprovals> {
    return this.api.get<PendingApprovals>(`v1/orgs/${orgId}/workflow-approvals`, quiet());
  }

  decide(orgId: string, approvalId: string, body: DecisionRequest): Observable<DecisionResult> {
    return this.api.post<DecisionResult>(
      `v1/orgs/${orgId}/workflow-approvals/${approvalId}/decision`,
      body,
      quiet(),
    );
  }

  withdraw(orgId: string, approvalId: string): Observable<void> {
    return this.api.post<void>(
      `v1/orgs/${orgId}/workflow-approvals/${approvalId}/withdraw`,
      {},
      quiet(),
    );
  }
}
