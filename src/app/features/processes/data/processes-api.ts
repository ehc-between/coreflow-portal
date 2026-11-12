import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  CreateDescriptionDocumentRequest,
  CreateInteractionRequest,
  CreateProcessRequest,
  Interaction,
  InteractionMap,
  ProcessDetail,
  ProcessList,
  ProcessListQuery,
  ProcessMap,
  ProcessStatus,
  ReviewRequest,
  Turtle,
  UpdateProcessRequest,
} from './process.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Process management (M02): the process register, swimlane maps, turtle diagrams,
 * the interaction map, periodic reviews and the description document. Goes through
 * ApiService (base URL, bearer, error handling).
 *
 * Permissions: `processes:read` to read, `processes:write` to create and edit
 * (maps, interactions, reviews, description document), `processes:manage` to change
 * the status and delete. Creating a description document also needs `documents:draft`.
 */
@Injectable({ providedIn: 'root' })
export class ProcessesApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/processes`;
  }

  list(orgId: string, query: ProcessListQuery = {}): Observable<ProcessList> {
    return this.api.get<ProcessList>(this.base(orgId), {
      params: {
        q: query.q?.trim() || undefined,
        status: query.status?.length ? query.status.join(',') : undefined,
        category: query.category,
        owner: query.owner,
        department_id: query.department_id,
        parent_id: query.parent_id,
        review_due: query.review_due,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  create(orgId: string, body: CreateProcessRequest): Observable<ProcessDetail> {
    return this.api.post<ProcessDetail>(this.base(orgId), body, skipToast());
  }

  get(orgId: string, id: string): Observable<ProcessDetail> {
    return this.api.get<ProcessDetail>(`${this.base(orgId)}/${id}`);
  }

  update(orgId: string, id: string, body: UpdateProcessRequest): Observable<ProcessDetail> {
    return this.api.patch<ProcessDetail>(`${this.base(orgId)}/${id}`, body, skipToast());
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, skipToast());
  }

  saveMap(
    orgId: string,
    id: string,
    map: ProcessMap,
    changeReason?: string | null,
  ): Observable<ProcessDetail> {
    return this.api.put<ProcessDetail>(
      `${this.base(orgId)}/${id}/map`,
      { map, change_reason: changeReason || null },
      skipToast(),
    );
  }

  changeStatus(
    orgId: string,
    id: string,
    status: ProcessStatus,
    changeReason?: string | null,
  ): Observable<ProcessDetail> {
    return this.api.post<ProcessDetail>(
      `${this.base(orgId)}/${id}/status`,
      { status, change_reason: changeReason || null },
      skipToast(),
    );
  }

  recordReview(orgId: string, id: string, body: ReviewRequest): Observable<ProcessDetail> {
    return this.api.post<ProcessDetail>(`${this.base(orgId)}/${id}/reviews`, body, skipToast());
  }

  turtle(orgId: string, id: string): Observable<Turtle> {
    return this.api.get<Turtle>(`${this.base(orgId)}/${id}/turtle`);
  }

  interactionMap(orgId: string, includeRetired = false): Observable<InteractionMap> {
    return this.api.get<InteractionMap>(`${this.base(orgId)}/interaction-map`, {
      params: { include_retired: includeRetired },
    });
  }

  addInteraction(
    orgId: string,
    id: string,
    body: CreateInteractionRequest,
  ): Observable<Interaction> {
    return this.api.post<Interaction>(`${this.base(orgId)}/${id}/interactions`, body, skipToast());
  }

  removeInteraction(orgId: string, id: string, interactionId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/${id}/interactions/${interactionId}`,
      skipToast(),
    );
  }

  attachDescriptionDocument(
    orgId: string,
    id: string,
    documentId: string,
  ): Observable<ProcessDetail> {
    return this.api.put<ProcessDetail>(
      `${this.base(orgId)}/${id}/description-document`,
      { document_id: documentId },
      skipToast(),
    );
  }

  createDescriptionDocument(
    orgId: string,
    id: string,
    body: CreateDescriptionDocumentRequest = {},
  ): Observable<ProcessDetail> {
    return this.api.post<ProcessDetail>(
      `${this.base(orgId)}/${id}/description-document`,
      body,
      skipToast(),
    );
  }

  detachDescriptionDocument(orgId: string, id: string): Observable<ProcessDetail> {
    return this.api.delete<ProcessDetail>(
      `${this.base(orgId)}/${id}/description-document`,
      skipToast(),
    );
  }
}
