import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { WatchersRead } from './activity.models';

const skipToast = (): HttpContext => new HttpContext().set(SKIP_ERROR_TOAST, true);

/**
 * Follow / unfollow any record (`v1/orgs/{org}/watchers`). PUT and DELETE act
 * for the current user and are idempotent; all three return the watcher state.
 * Read access to the record is required (422 unsupported type, 403, 404).
 */
@Injectable({ providedIn: 'root' })
export class WatchersApi {
  private readonly api = inject(ApiService);

  get(orgId: string, entityType: string, entityId: string): Observable<WatchersRead> {
    return this.api.get<WatchersRead>(this.path(orgId), {
      params: { entity_type: entityType, entity_id: entityId },
      context: skipToast(),
    });
  }

  watch(orgId: string, entityType: string, entityId: string): Observable<WatchersRead> {
    return this.api.put<WatchersRead>(
      this.path(orgId),
      {},
      { params: { entity_type: entityType, entity_id: entityId }, context: skipToast() },
    );
  }

  unwatch(orgId: string, entityType: string, entityId: string): Observable<WatchersRead> {
    return this.api.delete<WatchersRead>(this.path(orgId), {
      params: { entity_type: entityType, entity_id: entityId },
      context: skipToast(),
    });
  }

  private path(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/watchers`;
  }
}
