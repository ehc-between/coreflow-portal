import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ContactCard, ContactList, ContactRole } from './contacts.models';

/** Errors the page shows in place (no global toast). */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

export interface ContactQuery {
  readonly role?: ContactRole | 'all';
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** Kontakter: companies across customers, suppliers and processors (IA v2 §6.5). */
@Injectable({ providedIn: 'root' })
export class ContactsApi {
  private readonly api = inject(ApiService);

  list(orgId: string, query: ContactQuery = {}): Observable<ContactList> {
    return this.api.get<ContactList>(`v1/orgs/${orgId}/contacts`, {
      ...IN_PLACE,
      params: {
        role: query.role && query.role !== 'all' ? query.role : undefined,
        q: query.q?.trim() || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  card(orgId: string, key: string): Observable<ContactCard> {
    return this.api.get<ContactCard>(
      `v1/orgs/${orgId}/contacts/${encodeURIComponent(key)}`,
      IN_PLACE,
    );
  }
}
