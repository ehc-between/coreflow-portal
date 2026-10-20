import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

/** Primitive query-param values, plus arrays of them. */
export type QueryParamValue = string | number | boolean;
export type QueryParams = Readonly<
  Record<string, QueryParamValue | readonly QueryParamValue[] | null | undefined>
>;

export interface RequestOptions {
  readonly params?: QueryParams;
  readonly context?: HttpContext;
}

/** DELETE options: a DELETE may also carry a JSON body (e.g. a recorded reason). */
export interface DeleteOptions extends RequestOptions {
  readonly body?: unknown;
}

/**
 * Thin, typed wrapper around HttpClient that prefixes every request with the
 * configured backend base URL. Feature data services should depend on this
 * rather than HttpClient directly, so the base URL, auth and error handling
 * (added via interceptors) stay in one place.
 *
 *   @Injectable({ providedIn: 'root' })
 *   export class UsersApi {
 *     private readonly api = inject(ApiService);
 *     list(): Observable<User[]> { return this.api.get<User[]>('users'); }
 *   }
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl.replace(/\/+$/, '');

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path), this.toHttpOptions(options));
  }

  post<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body, this.toHttpOptions(options));
  }

  put<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.put<T>(this.url(path), body, this.toHttpOptions(options));
  }

  patch<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.patch<T>(this.url(path), body, this.toHttpOptions(options));
  }

  delete<T>(path: string, options: DeleteOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path), {
      ...this.toHttpOptions(options),
      body: options.body,
    });
  }

  /** GET the response as a binary Blob (e.g. a file export), through the same
   *  base URL and interceptors so the auth bearer is attached. */
  getBlob(path: string, options: RequestOptions = {}): Observable<Blob> {
    return this.http.get(this.url(path), {
      params: this.toParams(options.params),
      context: options.context,
      responseType: 'blob',
    });
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private toHttpOptions(options: RequestOptions) {
    return { params: this.toParams(options.params), context: options.context };
  }

  private toParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (!params) {
      return httpParams;
    }
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          httpParams = httpParams.append(key, String(item));
        }
      } else {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }
}
