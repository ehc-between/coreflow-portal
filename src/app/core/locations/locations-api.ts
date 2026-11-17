import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  CreateOverrideRequest,
  EvaluateRequest,
  EvaluateResponse,
  LocationOverride,
  LocationRequirements,
  LocationRole,
  LocationRule,
  LocationVocabulary,
  RequirementLocations,
} from './locations.models';

/**
 * The reads are extra context on pages that work without them (the requirement
 * page, module lists), so their failures are handled inline, without a toast.
 */
const QUIET = new HttpContext().set(SKIP_ERROR_TOAST, true);

/**
 * Org-scoped requirement-locations API (docs/requirement-locations.md section 5),
 * through ApiService (base URL, bearer, error handling). Reads need
 * `standards:read` (the vocabulary and "Dette oppfyller" are open to members);
 * overrides need `standards:manage`. `lang` selects the language of the
 * rendered labels and texts.
 */
@Injectable({ providedIn: 'root' })
export class LocationsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}`;
  }

  /** Where one requirement is filled in, with live results. */
  forRequirement(orgId: string, ref: string, lang: string): Observable<RequirementLocations> {
    return this.api.get<RequirementLocations>(`${this.base(orgId)}/requirement-locations`, {
      params: { ref, lang },
      context: QUIET,
    });
  }

  /** Bulk status per requirement, or a live preview of a proposed override. */
  evaluate(orgId: string, body: EvaluateRequest, lang: string): Observable<EvaluateResponse> {
    return this.api.post<EvaluateResponse>(
      `${this.base(orgId)}/requirement-locations/evaluate`,
      body,
      { params: { lang }, context: QUIET },
    );
  }

  /** The location vocabulary of the org's enabled modules. */
  vocabulary(
    orgId: string,
    lang: string,
    filter: { readonly module?: string; readonly entity_type?: string } = {},
  ): Observable<LocationVocabulary[]> {
    return this.api.get<LocationVocabulary[]>(`${this.base(orgId)}/locations`, {
      params: { ...filter, lang },
      context: QUIET,
    });
  }

  /** The requirements a place fulfils ("Dette oppfyller"). */
  requirementsOf(orgId: string, key: string, lang: string): Observable<LocationRequirements> {
    return this.api.get<LocationRequirements>(
      `${this.base(orgId)}/locations/${encodeURIComponent(key)}/requirements`,
      { params: { lang }, context: QUIET },
    );
  }

  /** `{entity_type: [location key]}`. */
  byEntityType(orgId: string, types: readonly string[]): Observable<Record<string, string[]>> {
    return this.api.get<Record<string, string[]>>(
      `${this.base(orgId)}/locations/requirements-by-entity-type`,
      { params: { types: types.join(',') }, context: QUIET },
    );
  }

  createOverride(orgId: string, body: CreateOverrideRequest): Observable<LocationOverride> {
    return this.api.post<LocationOverride>(
      `${this.base(orgId)}/requirement-locations/overrides`,
      body,
    );
  }

  updateOverride(
    orgId: string,
    id: string,
    body: {
      readonly rules?: readonly LocationRule[] | null;
      readonly role?: LocationRole | null;
      readonly justification: string;
    },
  ): Observable<LocationOverride> {
    return this.api.patch<LocationOverride>(
      `${this.base(orgId)}/requirement-locations/overrides/${encodeURIComponent(id)}`,
      body,
    );
  }

  /** Retire an override (the seeded mapping counts again). */
  deleteOverride(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/requirement-locations/overrides/${encodeURIComponent(id)}`,
    );
  }
}
