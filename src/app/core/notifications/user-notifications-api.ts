import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  MarkAllReadResponse,
  NotificationPreferencesResponse,
  UnreadCountResponse,
  UpdateNotificationPreferenceRequest,
  UserNotification,
  UserNotificationList,
  UserNotificationListQuery,
} from './user-notification.models';

/**
 * Suppresses the generic error toast. These callers either run in the background
 * (the unread-count poll must not toast every minute while offline) or show their
 * own in-place error / toast. Server and network errors are still reported.
 */
const skipToast = (): HttpContext => new HttpContext().set(SKIP_ERROR_TOAST, true);

/**
 * HTTP client for the signed-in user's notification inbox and email-digest
 * preferences. Distinct from `NotificationService`, which holds UI toasts.
 */
@Injectable({ providedIn: 'root' })
export class UserNotificationsApi {
  private readonly api = inject(ApiService);

  list(query: UserNotificationListQuery = {}): Observable<UserNotificationList> {
    return this.api.get<UserNotificationList>('v1/me/notifications', {
      params: {
        org_id: query.org_id,
        unread_only: query.unread_only,
        limit: query.limit,
        offset: query.offset,
      },
      context: skipToast(),
    });
  }

  unreadCount(orgId?: string | null): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>('v1/me/notifications/unread-count', {
      params: { org_id: orgId },
      context: skipToast(),
    });
  }

  markRead(id: string): Observable<UserNotification> {
    return this.api.post<UserNotification>(
      `v1/me/notifications/${encodeURIComponent(id)}/read`,
      {},
    );
  }

  markAllRead(orgId?: string | null): Observable<MarkAllReadResponse> {
    return this.api.post<MarkAllReadResponse>(
      'v1/me/notifications/read-all',
      {},
      {
        params: { org_id: orgId },
        context: skipToast(),
      },
    );
  }

  getPreferences(): Observable<NotificationPreferencesResponse> {
    return this.api.get<NotificationPreferencesResponse>('v1/me/notification-preferences', {
      context: skipToast(),
    });
  }

  updatePreference(
    body: UpdateNotificationPreferenceRequest,
  ): Observable<NotificationPreferencesResponse> {
    return this.api.put<NotificationPreferencesResponse>('v1/me/notification-preferences', body, {
      context: skipToast(),
    });
  }
}
