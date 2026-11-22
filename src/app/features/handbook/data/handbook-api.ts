import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { HandbookBand, HandbookDocument, HandbookMap, HandbookPage } from './handbook.models';

/**
 * Håndbok (IA v2 §6.4): the process map, the process page, the band order and the
 * work procedures (documents of a Handbook type). `processes:read` reads; reordering
 * needs `processes:manage`.
 */
@Injectable({ providedIn: 'root' })
export class HandbookApi {
  private readonly api = inject(ApiService);

  map(orgId: string): Observable<HandbookMap> {
    return this.api.get<HandbookMap>(`v1/orgs/${orgId}/processes/handbook`);
  }

  page(orgId: string, processId: string): Observable<HandbookPage> {
    return this.api.get<HandbookPage>(`v1/orgs/${orgId}/processes/${processId}/handbook`);
  }

  setOrder(orgId: string, category: HandbookBand, ids: readonly string[]): Observable<void> {
    return this.api.put<void>(
      `v1/orgs/${orgId}/processes/handbook/order`,
      { category, ids },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** The readable work procedures (documents whose type shows in Håndbok). */
  procedures(orgId: string): Observable<HandbookDocument[]> {
    return this.api.get<HandbookDocument[]>(`v1/orgs/${orgId}/documents`, {
      params: { handbook: 'true' },
    });
  }
}
