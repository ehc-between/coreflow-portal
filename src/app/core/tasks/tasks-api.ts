import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  ChecklistItem,
  CreateRecurrenceRequest,
  CreateTaskRequest,
  MyWorkQuery,
  MyWorkResponse,
  Recurrence,
  RecurrenceCreated,
  RecurrenceList,
  RecurrenceListQuery,
  TaskDetail,
  TaskList,
  TaskListQuery,
  UpdateRecurrenceRequest,
  UpdateTaskRequest,
} from './task.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Platform tasks (F2): tasks on any record, their checklist, recurring series and
 * the aggregated My Work feed. Goes through ApiService (base URL, bearer, errors).
 *
 * Permissions: `tasks:read` to list / read, `tasks:write` to create and to edit
 * tasks you created or are assigned to, `tasks:manage` for any task in the org.
 * `GET /my-work` only needs org membership.
 */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly api = inject(ApiService);

  // --- tasks -------------------------------------------------------------------

  list(orgId: string, query: TaskListQuery = {}): Observable<TaskList> {
    return this.api.get<TaskList>(`v1/orgs/${orgId}/tasks`, {
      params: {
        entity_type: query.entity_type,
        entity_id: query.entity_id,
        assignee: query.assignee,
        status: query.status?.length ? query.status.join(',') : undefined,
        kind: query.kind,
        module: query.module,
        recurrence_id: query.recurrence_id,
        due_before: query.due_before,
        due_after: query.due_after,
        q: query.q || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  create(orgId: string, body: CreateTaskRequest): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(`v1/orgs/${orgId}/tasks`, body, skipToast());
  }

  get(orgId: string, taskId: string): Observable<TaskDetail> {
    return this.api.get<TaskDetail>(`v1/orgs/${orgId}/tasks/${taskId}`);
  }

  update(orgId: string, taskId: string, body: UpdateTaskRequest): Observable<TaskDetail> {
    return this.api.patch<TaskDetail>(`v1/orgs/${orgId}/tasks/${taskId}`, body, skipToast());
  }

  complete(orgId: string, taskId: string): Observable<TaskDetail> {
    return this.transition(orgId, taskId, 'complete');
  }

  reopen(orgId: string, taskId: string): Observable<TaskDetail> {
    return this.transition(orgId, taskId, 'reopen');
  }

  cancel(orgId: string, taskId: string): Observable<TaskDetail> {
    return this.transition(orgId, taskId, 'cancel');
  }

  delete(orgId: string, taskId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/tasks/${taskId}`, skipToast());
  }

  // --- checklist ---------------------------------------------------------------

  addChecklistItem(orgId: string, taskId: string, text: string): Observable<ChecklistItem> {
    return this.api.post<ChecklistItem>(
      `v1/orgs/${orgId}/tasks/${taskId}/checklist`,
      { text },
      skipToast(),
    );
  }

  updateChecklistItem(
    orgId: string,
    taskId: string,
    itemId: string,
    body: { readonly text?: string; readonly done?: boolean },
  ): Observable<ChecklistItem> {
    return this.api.patch<ChecklistItem>(
      `v1/orgs/${orgId}/tasks/${taskId}/checklist/${itemId}`,
      body,
      skipToast(),
    );
  }

  deleteChecklistItem(orgId: string, taskId: string, itemId: string): Observable<void> {
    return this.api.delete<void>(
      `v1/orgs/${orgId}/tasks/${taskId}/checklist/${itemId}`,
      skipToast(),
    );
  }

  // --- recurring series --------------------------------------------------------

  listRecurrences(orgId: string, query: RecurrenceListQuery = {}): Observable<RecurrenceList> {
    return this.api.get<RecurrenceList>(`v1/orgs/${orgId}/task-recurrences`, {
      params: {
        entity_type: query.entity_type,
        entity_id: query.entity_id,
        active: query.active,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  createRecurrence(orgId: string, body: CreateRecurrenceRequest): Observable<RecurrenceCreated> {
    return this.api.post<RecurrenceCreated>(`v1/orgs/${orgId}/task-recurrences`, body, skipToast());
  }

  updateRecurrence(
    orgId: string,
    recurrenceId: string,
    body: UpdateRecurrenceRequest,
  ): Observable<Recurrence> {
    return this.api.patch<Recurrence>(
      `v1/orgs/${orgId}/task-recurrences/${recurrenceId}`,
      body,
      skipToast(),
    );
  }

  deleteRecurrence(orgId: string, recurrenceId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/task-recurrences/${recurrenceId}`, skipToast());
  }

  // --- My Work -----------------------------------------------------------------

  myWork(orgId: string, query: MyWorkQuery = {}): Observable<MyWorkResponse> {
    return this.api.get<MyWorkResponse>(`v1/orgs/${orgId}/my-work`, {
      params: {
        from: query.from,
        to: query.to,
        include: query.include?.length ? query.include.join(',') : undefined,
      },
    });
  }

  private transition(
    orgId: string,
    taskId: string,
    action: 'complete' | 'reopen' | 'cancel',
  ): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `v1/orgs/${orgId}/tasks/${taskId}/${action}`,
      null,
      skipToast(),
    );
  }
}
