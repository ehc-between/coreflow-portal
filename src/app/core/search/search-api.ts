import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';
import { SEARCH_QUERY_MAX, SearchOptions, SearchResponse } from './search.models';

const EMPTY: SearchResponse = { items: [], counts: {} };

/**
 * Global search across every record type the caller may read (documents,
 * deviations, CAPA actions, standard requirements, and each module's records).
 * The server filters by permission, module enablement and record visibility.
 *
 * Used while typing (command palette, related-items picker), so failures stay
 * quiet: no generic error toast; callers show an inline state instead.
 */
@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly api = inject(ApiService);
  private readonly language = inject(LanguageService);

  search(orgId: string, q: string, options: SearchOptions = {}): Observable<SearchResponse> {
    const query = q.trim().slice(0, SEARCH_QUERY_MAX);
    if (!query) {
      // The endpoint rejects a blank query (422 query_blank); never send one.
      return of(EMPTY);
    }
    const limit =
      options.limit === undefined
        ? undefined
        : Math.min(50, Math.max(1, Math.round(options.limit)));
    return this.api.get<SearchResponse>(`v1/orgs/${encodeURIComponent(orgId)}/search`, {
      params: {
        q: query,
        types: options.types?.length ? options.types.join(',') : undefined,
        limit,
        lang: this.language.active(),
      },
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
