import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { UxEventBatchOut, UxEventIn, UxSummaryOut } from './ux-metrics.models';

/** Max events per batch accepted by the backend. */
export const UX_MAX_BATCH = 200;

/**
 * Org-level click-source counters. Writes are quiet: a failed counter batch is
 * never worth an error toast (server errors still reach monitoring).
 */
@Injectable({ providedIn: 'root' })
export class UxMetricsApi {
  private readonly api = inject(ApiService);

  record(orgId: string, events: readonly UxEventIn[]): Observable<UxEventBatchOut> {
    return this.api.post<UxEventBatchOut>(
      `v1/orgs/${encodeURIComponent(orgId)}/ux-events`,
      { events },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Counters for the last `days` days (1-366) with the `limit` (1-500) top paths. */
  summary(orgId: string, days = 30, limit = 50): Observable<UxSummaryOut> {
    return this.api.get<UxSummaryOut>(`v1/orgs/${encodeURIComponent(orgId)}/ux-events/summary`, {
      params: { days, limit },
    });
  }
}
