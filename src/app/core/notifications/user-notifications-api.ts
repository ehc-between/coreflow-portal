import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
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
    });
  }

  unreadCount(orgId?: string | null): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>('v1/me/notifications/unread-count', {
      params: { org_id: orgId },
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
      },
    );
  }

  getPreferences(): Observable<NotificationPreferencesResponse> {
    return this.api.get<NotificationPreferencesResponse>('v1/me/notification-preferences');
  }

  updatePreference(
    body: UpdateNotificationPreferenceRequest,
  ): Observable<NotificationPreferencesResponse> {
    return this.api.put<NotificationPreferencesResponse>('v1/me/notification-preferences', body);
  }
}
