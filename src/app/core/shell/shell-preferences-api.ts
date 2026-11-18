import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { ShellPreferencesDto, ShellPreferencesUpdate } from './shell-preferences.models';

/** Shell preferences are an enhancement: callers decide what to show on failure. */
const QUIET = (): HttpContext => new HttpContext().set(SKIP_ERROR_TOAST, true);

/** HTTP client for the caller's per-org shell preferences (U03). */
@Injectable({ providedIn: 'root' })
export class ShellPreferencesApi {
  private readonly api = inject(ApiService);

  get(orgId: string): Observable<ShellPreferencesDto> {
    return this.api.get<ShellPreferencesDto>(`v1/me/orgs/${orgId}/preferences`, {
      context: QUIET(),
    });
  }

  update(orgId: string, body: ShellPreferencesUpdate): Observable<ShellPreferencesDto> {
    return this.api.put<ShellPreferencesDto>(`v1/me/orgs/${orgId}/preferences`, body, {
      context: QUIET(),
    });
  }
}
