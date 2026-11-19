import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { customersPath } from '../../../shared/customers/customer-ref-api';
import {
  ContactIn,
  CustomerContact,
  CustomerDetail,
  CustomerFields,
  CustomerOverview,
  CustomerPage,
  CustomerQuery,
  CustomerSummary,
  MatchAction,
  MatchGroup,
  RegistryLookup,
  ScanResult,
} from './customer.models';

/** `GET /matches` body: `{groups, total}` (an array or `{items}` is also accepted). */
interface MatchGroupsBody {
  readonly groups?: readonly MatchGroup[];
  readonly items?: readonly MatchGroup[];
}

/** Errors the page shows in place (no global toast). */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** The supplier fields `/customers/new?from_supplier=<id>` prefills from. */
export interface SupplierPrefill {
  readonly name: string;
  readonly legal_name?: string | null;
  readonly registration_number?: string | null;
  readonly country?: string | null;
  readonly website?: string | null;
}

/** The customer register API (docs/customer-register-design.md §2.4). */
@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly api = inject(ApiService);

  list(orgId: string, query: CustomerQuery = {}): Observable<CustomerPage> {
    return this.api.get<CustomerPage>(customersPath(orgId), {
      params: {
        q: query.q || undefined,
        status: query.status?.length ? query.status.join(',') : undefined,
        segment: query.segment || undefined,
        owner_user_id: query.owner_user_id || undefined,
        has_open_claims: query.has_open_claims || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  summary(orgId: string): Observable<CustomerSummary> {
    return this.api.get<CustomerSummary>(`${customersPath(orgId)}/summary`, IN_PLACE);
  }

  segments(orgId: string): Observable<readonly string[]> {
    return this.api
      .get<
        readonly string[] | { readonly items: readonly string[] }
      >(`${customersPath(orgId)}/segments`, IN_PLACE)
      .pipe(map((res) => (Array.isArray(res) ? res : ((res as { items?: string[] }).items ?? []))));
  }

  /** Brønnøysund lookup; 404 / 422 / 503 are handled by the form (no toast). */
  registry(orgId: string, orgnr: string): Observable<RegistryLookup> {
    return this.api.get<RegistryLookup>(
      `${customersPath(orgId)}/registry/${encodeURIComponent(orgnr)}`,
      IN_PLACE,
    );
  }

  get(orgId: string, id: string): Observable<CustomerDetail> {
    return this.api.get<CustomerDetail>(`${customersPath(orgId)}/${id}`, IN_PLACE);
  }

  create(orgId: string, fields: CustomerFields): Observable<CustomerDetail> {
    return this.api.post<CustomerDetail>(customersPath(orgId), fields, IN_PLACE);
  }

  update(orgId: string, id: string, fields: Partial<CustomerFields>): Observable<CustomerDetail> {
    return this.api.patch<CustomerDetail>(`${customersPath(orgId)}/${id}`, fields, IN_PLACE);
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${customersPath(orgId)}/${id}`);
  }

  merge(orgId: string, id: string, intoId: string): Observable<CustomerDetail> {
    return this.api.post<CustomerDetail>(`${customersPath(orgId)}/${id}/merge`, {
      into_id: intoId,
    });
  }

  overview(orgId: string, id: string): Observable<CustomerOverview> {
    return this.api.get<CustomerOverview>(`${customersPath(orgId)}/${id}/overview`, IN_PLACE);
  }

  addContact(orgId: string, id: string, body: ContactIn): Observable<CustomerContact> {
    return this.api.post<CustomerContact>(`${customersPath(orgId)}/${id}/contacts`, body);
  }

  updateContact(
    orgId: string,
    id: string,
    contactId: string,
    body: Partial<ContactIn>,
  ): Observable<CustomerContact> {
    return this.api.patch<CustomerContact>(
      `${customersPath(orgId)}/${id}/contacts/${contactId}`,
      body,
    );
  }

  deleteContact(orgId: string, id: string, contactId: string): Observable<void> {
    return this.api.delete<void>(`${customersPath(orgId)}/${id}/contacts/${contactId}`);
  }

  /** Pending matches grouped per proposed customer. The API returns `{groups, total}`. */
  matches(orgId: string): Observable<readonly MatchGroup[]> {
    return this.api
      .get<
        readonly MatchGroup[] | MatchGroupsBody
      >(`${customersPath(orgId)}/matches`, { params: { status: 'pending' } })
      .pipe(
        map((res) =>
          Array.isArray(res)
            ? res
            : ((res as MatchGroupsBody).groups ?? (res as MatchGroupsBody).items ?? []),
        ),
      );
  }

  scan(orgId: string): Observable<ScanResult> {
    return this.api.post<ScanResult>(`${customersPath(orgId)}/matches/scan`, {});
  }

  accept(orgId: string, matchId: string, customerId?: string | null): Observable<unknown> {
    return this.api.post(
      `${customersPath(orgId)}/matches/${matchId}/accept`,
      customerId ? { customer_id: customerId } : {},
    );
  }

  createFromMatch(orgId: string, matchId: string, name?: string | null): Observable<unknown> {
    return this.api.post(`${customersPath(orgId)}/matches/${matchId}/create`, name ? { name } : {});
  }

  dismiss(orgId: string, matchId: string): Observable<unknown> {
    return this.api.post(`${customersPath(orgId)}/matches/${matchId}/dismiss`, {});
  }

  bulk(orgId: string, ids: readonly string[], action: MatchAction): Observable<unknown> {
    return this.api.post(`${customersPath(orgId)}/matches/bulk`, { ids, action });
  }

  /** The supplier `/customers/new?from_supplier=<id>` copies name and org. number from. */
  supplier(orgId: string, supplierId: string): Observable<SupplierPrefill> {
    return this.api.get<SupplierPrefill>(`v1/orgs/${orgId}/suppliers/${supplierId}`, IN_PLACE);
  }
}
