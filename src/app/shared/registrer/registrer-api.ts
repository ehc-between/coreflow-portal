import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../core/http/error.interceptor';
import { QuickCreateRequest, QuickCreateResponse, QuickTypeList } from './registrer.models';

/** The person options of the owner field (`GET /access-subjects`, `documents:read`). */
export interface QuickPeople {
  readonly users: readonly { readonly id: string; readonly name: string }[];
}

/** U05 quick create: the quick types for the caller, and one-call registration. */
@Injectable({ providedIn: 'root' })
export class RegistrerApi {
  private readonly api = inject(ApiService);

  listTypes(orgId: string): Observable<QuickTypeList> {
    return this.api.get<QuickTypeList>(`v1/orgs/${orgId}/quick-create/types`);
  }

  /** Errors are shown in the dialog itself, so the generic toast is skipped. */
  create(orgId: string, body: QuickCreateRequest): Observable<QuickCreateResponse> {
    return this.api.post<QuickCreateResponse>(`v1/orgs/${orgId}/quick-create`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Who can own the record; the dialog falls back to "me" when this is not allowed. */
  listPeople(orgId: string): Observable<QuickPeople> {
    return this.api.get<QuickPeople>(`v1/orgs/${orgId}/access-subjects`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
