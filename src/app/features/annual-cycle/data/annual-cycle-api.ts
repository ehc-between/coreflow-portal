import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AcceptItem,
  AcceptResponse,
  Proposal,
  RemindResponse,
  YearQuery,
  YearResponse,
} from './annual-cycle.models';

const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/** Årshjul endpoints under `/orgs/{org}/annual-cycle` (docs/ia-v2.md 6.3). */
@Injectable({ providedIn: 'root' })
export class AnnualCycleApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/annual-cycle`;
  }

  year(orgId: string, query: YearQuery = {}): Observable<YearResponse> {
    return this.api.get<YearResponse>(this.base(orgId), {
      params: {
        from: query.from || undefined,
        months: query.months ?? undefined,
        area: query.area || undefined,
        mine: query.mine ? 'true' : undefined,
      },
    });
  }

  propose(orgId: string, year?: number): Observable<Proposal> {
    return this.api.post<Proposal>(`${this.base(orgId)}/propose`, year ? { year } : {});
  }

  accept(orgId: string, items: readonly AcceptItem[]): Observable<AcceptResponse> {
    return this.api.post<AcceptResponse>(`${this.base(orgId)}/accept`, { items });
  }

  remind(orgId: string, itemId: string): Observable<RemindResponse> {
    return this.api.post<RemindResponse>(
      `${this.base(orgId)}/remind`,
      { item_id: itemId },
      quiet(),
    );
  }
}
