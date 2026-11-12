import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  CompleteSetupRequest,
  CompleteSetupResponse,
  ModuleErrorDetail,
  OrgModule,
  OrgProfile,
  OrgProfileUpdate,
  RecommendationsRequest,
  RecommendationsResponse,
  SetupState,
  Terminology,
  TermOverrides,
} from './module.models';

/** Suppresses the generic error toast so the caller can message in place. */
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Org module registry, profile, terminology and setup wizard API
 * (`v1/orgs/{orgId}/...`). Reads need org membership; writes need `org:manage`.
 * Writes skip the generic error toast: callers translate the coded errors.
 */
@Injectable({ providedIn: 'root' })
export class ModulesApi {
  private readonly api = inject(ApiService);

  list(orgId: string): Observable<OrgModule[]> {
    return this.api.get<OrgModule[]>(`v1/orgs/${orgId}/modules`, quiet());
  }

  setEnabled(orgId: string, key: string, enabled: boolean): Observable<OrgModule> {
    return this.api.put<OrgModule>(
      `v1/orgs/${orgId}/modules/${encodeURIComponent(key)}`,
      { enabled },
      quiet(),
    );
  }

  getProfile(orgId: string): Observable<OrgProfile> {
    return this.api.get<OrgProfile>(`v1/orgs/${orgId}/profile`);
  }

  updateProfile(orgId: string, profile: OrgProfileUpdate): Observable<OrgProfile> {
    return this.api.put<OrgProfile>(`v1/orgs/${orgId}/profile`, profile, quiet());
  }

  getTerminology(orgId: string): Observable<Terminology> {
    return this.api.get<Terminology>(`v1/orgs/${orgId}/terminology`, quiet());
  }

  /** Replaces every override; `{}` resets them. */
  updateTerminology(orgId: string, terms: TermOverrides): Observable<Terminology> {
    return this.api.put<Terminology>(`v1/orgs/${orgId}/terminology`, { terms }, quiet());
  }

  setup(orgId: string): Observable<SetupState> {
    return this.api.get<SetupState>(`v1/orgs/${orgId}/setup`, quiet());
  }

  setSetupStep(orgId: string, step: string): Observable<SetupState> {
    return this.api.put<SetupState>(`v1/orgs/${orgId}/setup/step`, { step }, quiet());
  }

  /** Deterministic recommendations; writes nothing. */
  recommendations(
    orgId: string,
    body: RecommendationsRequest,
  ): Observable<RecommendationsResponse> {
    return this.api.post<RecommendationsResponse>(
      `v1/orgs/${orgId}/setup/recommendations`,
      body,
      quiet(),
    );
  }

  /** Turns the modules (and their dependencies) on and marks the setup complete. */
  completeSetup(orgId: string, body: CompleteSetupRequest): Observable<CompleteSetupResponse> {
    return this.api.post<CompleteSetupResponse>(`v1/orgs/${orgId}/setup/complete`, body, quiet());
  }
}

/** The coded `detail` of a module endpoint error, or null. */
export function moduleErrorDetail(error: unknown): ModuleErrorDetail | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const detail = (error.error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && 'code' in detail) {
    return detail as ModuleErrorDetail;
  }
  return null;
}
