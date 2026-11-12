import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  GuidanceLevel,
  LearningProgressList,
  LearningProgressItem,
  LearningSummaryList,
  OrgGuidanceDto,
  PreferencesDto,
  RecordProgressRequest,
} from './guidance.models';

/** Background reads/writes (level, progress) fail quietly: callers decide what to show. */
const QUIET = (): HttpContext => new HttpContext().set(SKIP_ERROR_TOAST, true);

/** HTTP client for the F6 guidance endpoints (contract: platform-contracts 9.1). */
@Injectable({ providedIn: 'root' })
export class GuidanceApi {
  private readonly api = inject(ApiService);

  /** The caller's level; with `orgId` the org default and effective level resolve for it. */
  getPreferences(orgId?: string | null): Observable<PreferencesDto> {
    return this.api.get<PreferencesDto>('v1/me/preferences', {
      params: { org_id: orgId },
      context: QUIET(),
    });
  }

  /** Set (or with `null` clear) the caller's personal level. */
  updatePreferences(
    level: GuidanceLevel | null,
    orgId?: string | null,
  ): Observable<PreferencesDto> {
    return this.api.put<PreferencesDto>(
      'v1/me/preferences',
      { guidance_level: level },
      { params: { org_id: orgId } },
    );
  }

  getOrgGuidance(orgId: string): Observable<OrgGuidanceDto> {
    return this.api.get<OrgGuidanceDto>(`v1/orgs/${orgId}/guidance`);
  }

  /** Needs `org:manage`. */
  updateOrgGuidance(orgId: string, level: GuidanceLevel): Observable<OrgGuidanceDto> {
    return this.api.put<OrgGuidanceDto>(`v1/orgs/${orgId}/guidance`, { default_level: level });
  }

  /** The caller's progress, or (with `learning:read`) another member's via `userId`. */
  listProgress(
    orgId: string,
    filter: { readonly module?: string | null; readonly userId?: string | null } = {},
  ): Observable<LearningProgressList> {
    return this.api.get<LearningProgressList>(`v1/orgs/${orgId}/learning/progress`, {
      params: { module: filter.module, user_id: filter.userId },
      context: QUIET(),
    });
  }

  recordProgress(orgId: string, body: RecordProgressRequest): Observable<LearningProgressItem> {
    return this.api.post<LearningProgressItem>(`v1/orgs/${orgId}/learning/progress`, body, {
      context: QUIET(),
    });
  }

  /** Per-member progress counts; needs `learning:read`. */
  summary(orgId: string, module?: string | null): Observable<LearningSummaryList> {
    return this.api.get<LearningSummaryList>(`v1/orgs/${orgId}/learning/summary`, {
      params: { module },
    });
  }
}
