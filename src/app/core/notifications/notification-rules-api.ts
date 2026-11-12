import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  DepartmentLead,
  NotificationRule,
  NotificationRuleUpdate,
  NotificationSettings,
} from './activity.models';

/** Mutations message failures in place (see `activityErrorKey`). */
const skipToast = (): HttpContext => new HttpContext().set(SKIP_ERROR_TOAST, true);

/**
 * Org-level notification administration (all endpoints need `org:manage`):
 * rules per event kind, reminder / escalation settings and department leads.
 */
@Injectable({ providedIn: 'root' })
export class NotificationRulesApi {
  private readonly api = inject(ApiService);

  listRules(orgId: string): Observable<NotificationRule[]> {
    return this.api.get<NotificationRule[]>(`${this.org(orgId)}/notification-rules`);
  }

  setRule(
    orgId: string,
    eventKind: string,
    body: NotificationRuleUpdate,
  ): Observable<NotificationRule> {
    return this.api.put<NotificationRule>(
      `${this.org(orgId)}/notification-rules/${encodeURIComponent(eventKind)}`,
      body,
      { context: skipToast() },
    );
  }

  /** Restore the kind's default rule (204). */
  resetRule(orgId: string, eventKind: string): Observable<void> {
    return this.api.delete<void>(
      `${this.org(orgId)}/notification-rules/${encodeURIComponent(eventKind)}`,
      { context: skipToast() },
    );
  }

  getSettings(orgId: string): Observable<NotificationSettings> {
    return this.api.get<NotificationSettings>(`${this.org(orgId)}/notification-settings`);
  }

  updateSettings(orgId: string, body: NotificationSettings): Observable<NotificationSettings> {
    return this.api.put<NotificationSettings>(`${this.org(orgId)}/notification-settings`, body, {
      context: skipToast(),
    });
  }

  listDepartmentLeads(orgId: string): Observable<DepartmentLead[]> {
    return this.api.get<DepartmentLead[]>(`${this.org(orgId)}/department-leads`);
  }

  setDepartmentLead(
    orgId: string,
    departmentId: string,
    userId: string | null,
  ): Observable<DepartmentLead> {
    return this.api.put<DepartmentLead>(
      `${this.org(orgId)}/departments/${encodeURIComponent(departmentId)}/lead`,
      { user_id: userId },
      { context: skipToast() },
    );
  }

  private org(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}`;
  }
}
