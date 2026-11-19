import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TaskDetail } from '../../../core/tasks/task.models';
import {
  HomeResponse,
  Journey,
  JourneyList,
  NextActionList,
  StepStatus,
  StepTaskRequest,
  WorkspaceKey,
  WorkspaceSettings,
} from './home.models';

/** Mutations skip the generic toast: the pages show a translated, specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * P5 home and guided journeys. Every text field comes back in `lang` (the active UI
 * language), so the caller passes it on every read.
 *
 * Permissions: `/home` and `/next-actions` are open to every member (sections the
 * caller may not see come back empty). Journey reads need `standards:read`, changes
 * `standards:manage` (a step task also `tasks:write`). Journey routes 404
 * `module_disabled` while the standards module is off.
 */
@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly api = inject(ApiService);

  /** The caller's home; `workspace` previews another template ("Vis alt"). */
  home(orgId: string, lang: string, workspace?: WorkspaceKey | null): Observable<HomeResponse> {
    const params: Record<string, string> = workspace ? { lang, workspace } : { lang };
    return this.api.get<HomeResponse>(`v1/orgs/${orgId}/home`, { params });
  }

  /** U07: the home template per RBAC role (`org:manage`). */
  workspaces(orgId: string): Observable<WorkspaceSettings> {
    return this.api.get<WorkspaceSettings>(`v1/orgs/${orgId}/home/workspaces`);
  }

  /** Set (or with `null` reset to the default) the template of the given roles. */
  setWorkspaces(
    orgId: string,
    mapping: Readonly<Record<string, WorkspaceKey | null>>,
  ): Observable<WorkspaceSettings> {
    return this.api.put<WorkspaceSettings>(
      `v1/orgs/${orgId}/home/workspaces`,
      { mapping },
      skipToast(),
    );
  }

  nextActions(orgId: string, lang: string, limit = 7): Observable<NextActionList> {
    return this.api.get<NextActionList>(`v1/orgs/${orgId}/next-actions`, {
      params: { lang, limit },
    });
  }

  /** Hide an action for `days`, or until its key changes when `days` is omitted. */
  dismiss(orgId: string, key: string, days?: number): Observable<void> {
    return this.api.post<void>(
      `v1/orgs/${orgId}/next-actions/${encodeURIComponent(key)}/dismiss`,
      days ? { days } : {},
      skipToast(),
    );
  }

  journeys(orgId: string, lang: string): Observable<JourneyList> {
    return this.api.get<JourneyList>(`v1/orgs/${orgId}/journeys`, { params: { lang } });
  }

  /** Start the journey of a framework (also switches the standard on). 409 when it exists. */
  start(orgId: string, framework: string, lang: string): Observable<Journey> {
    return this.api.post<Journey>(
      `v1/orgs/${orgId}/journeys`,
      { framework },
      { params: { lang }, ...skipToast() },
    );
  }

  journey(orgId: string, id: string, lang: string): Observable<Journey> {
    return this.api.get<Journey>(`v1/orgs/${orgId}/journeys/${id}`, { params: { lang } });
  }

  setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'archived',
    lang: string,
  ): Observable<Journey> {
    return this.api.patch<Journey>(
      `v1/orgs/${orgId}/journeys/${id}`,
      { status },
      { params: { lang }, ...skipToast() },
    );
  }

  setStep(
    orgId: string,
    id: string,
    step: string,
    status: StepStatus,
    lang: string,
  ): Observable<Journey> {
    return this.api.patch<Journey>(
      `v1/orgs/${orgId}/journeys/${id}/steps/${encodeURIComponent(step)}`,
      { status },
      { params: { lang }, ...skipToast() },
    );
  }

  /** Make the step a task (201), or return the open task already made from it (200). */
  stepTask(
    orgId: string,
    id: string,
    step: string,
    lang: string,
    body: StepTaskRequest = {},
  ): Observable<TaskDetail> {
    return this.api.post<TaskDetail>(
      `v1/orgs/${orgId}/journeys/${id}/steps/${encodeURIComponent(step)}/task`,
      body,
      { params: { lang }, ...skipToast() },
    );
  }
}
