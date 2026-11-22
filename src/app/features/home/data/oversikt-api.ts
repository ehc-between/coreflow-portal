import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { DeadlineItem } from './oversikt';

interface CalendarResponse {
  readonly items: readonly DeadlineItem[];
}

/**
 * The one read Oversikt makes beyond `HomeApi`: upcoming deadlines for "Snart frist"
 * from the existing calendar aggregation (`GET /reports/calendar`, needs the reports
 * module and `reports:read`). A failure only hides the card, so no error toast.
 */
@Injectable({ providedIn: 'root' })
export class OversiktApi {
  private readonly api = inject(ApiService);

  deadlines(orgId: string, from: string, to: string): Observable<CalendarResponse> {
    return this.api.get<CalendarResponse>(`v1/orgs/${orgId}/reports/calendar`, {
      params: { from, to },
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
