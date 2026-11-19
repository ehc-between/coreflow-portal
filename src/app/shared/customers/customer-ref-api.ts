import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../core/http/error.interceptor';
import { CustomerOption, CustomerRef } from './customer.models';

const QUIET = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Base path of the customers API of an org. */
export function customersPath(orgId: string): string {
  return `v1/orgs/${orgId}/customers`;
}

/**
 * The small part of the customers API the shared picker, chip and filter use:
 * the typeahead options and a quick "create from this name". The full API is
 * `features/customers/data/customers-api.ts`.
 */
@Injectable({ providedIn: 'root' })
export class CustomerRefApi {
  private readonly api = inject(ApiService);

  /** `GET /customers/options`: live customers matching `q`; `includeId` keeps a current value. */
  options(
    orgId: string,
    q: string,
    includeId?: string | null,
    limit = 20,
  ): Observable<readonly CustomerOption[]> {
    return this.api
      .get<
        readonly CustomerOption[] | { readonly items: readonly CustomerOption[] }
      >(`${customersPath(orgId)}/options`, { ...QUIET, params: { q: q.trim() || undefined, include_id: includeId || undefined, limit } })
      .pipe(
        map((res) =>
          Array.isArray(res) ? res : ((res as { items?: CustomerOption[] }).items ?? []),
        ),
      );
  }

  /** `POST /customers` with just a name (status `active`); returns the new customer as a ref. */
  quickCreate(orgId: string, name: string): Observable<CustomerRef> {
    return this.api
      .post<CustomerRef & { readonly deleted?: boolean }>(customersPath(orgId), {
        name: name.trim(),
        status: 'active',
      })
      .pipe(
        map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          status: c.status,
          deleted: !!c.deleted,
        })),
      );
  }
}
