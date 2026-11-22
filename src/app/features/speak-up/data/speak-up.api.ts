import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  CaseList,
  CaseQuery,
  Proposal,
  ProposeRequest,
  SpeakUpRequest,
  SpeakUpResult,
} from './speak-up.models';

/** Errors are shown in place on the Meld fra page, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** IA v2 Meld fra (propose + file) and Saker (the case list). */
@Injectable({ providedIn: 'root' })
export class SpeakUpApi {
  private readonly api = inject(ApiService);

  /** 503 when suggestions are off, 502 when the answer could not be used. */
  propose(orgId: string, body: ProposeRequest): Observable<Proposal> {
    return this.api.post<Proposal>(`v1/orgs/${orgId}/speak-up/propose`, body, IN_PLACE);
  }

  create(orgId: string, body: SpeakUpRequest): Observable<SpeakUpResult> {
    return this.api.post<SpeakUpResult>(`v1/orgs/${orgId}/speak-up`, body, IN_PLACE);
  }

  cases(orgId: string, query: CaseQuery): Observable<CaseList> {
    const params: Record<string, string | number> = { tab: query.tab, limit: query.limit };
    if (query.offset) {
      params['offset'] = query.offset;
    }
    if (query.type) {
      params['type'] = query.type;
    }
    if (query.q) {
      params['q'] = query.q;
    }
    if (query.lang === 'nb' || query.lang === 'en') {
      params['lang'] = query.lang;
    }
    return this.api.get<CaseList>(`v1/orgs/${orgId}/cases`, { params });
  }
}
