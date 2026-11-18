import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  Branding,
  BrandingUpdate,
  GenerateRequest,
  GeneratedList,
  GeneratedOutput,
  GeneratedQuery,
  Output,
  OutputList,
  OutputQuery,
  PreflightRequest,
  PreflightResult,
  SourceCheck,
} from './outputs.models';

/** Every caller shows its own inline error (and the coded 409s are normal flow). */
const INLINE = new HttpContext().set(SKIP_ERROR_TOAST, true);

/**
 * Org-scoped output platform API (U11), through ApiService (base URL, bearer,
 * error handling). Reads need org membership; each output's own permission is
 * checked by the backend (the catalogue only lists what the caller may make).
 * Branding changes need `org:manage`.
 */
@Injectable({ providedIn: 'root' })
export class OutputsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}`;
  }

  list(orgId: string, query: OutputQuery = {}): Observable<OutputList> {
    return this.api.get<OutputList>(`${this.base(orgId)}/outputs`, {
      params: { ...query },
      context: INLINE,
    });
  }

  get(orgId: string, key: string, query: OutputQuery = {}): Observable<Output> {
    return this.api.get<Output>(`${this.base(orgId)}/outputs/${encodeURIComponent(key)}`, {
      params: { ...query },
      context: INLINE,
    });
  }

  preflight(orgId: string, key: string, body: PreflightRequest): Observable<PreflightResult> {
    return this.api.post<PreflightResult>(
      `${this.base(orgId)}/outputs/${encodeURIComponent(key)}/preflight`,
      body,
      { context: INLINE },
    );
  }

  /** 201 with the stored file; 409 `preflight_incomplete` when required data is missing. */
  generate(orgId: string, key: string, body: GenerateRequest): Observable<GeneratedOutput> {
    return this.api.post<GeneratedOutput>(
      `${this.base(orgId)}/outputs/${encodeURIComponent(key)}/generate`,
      body,
      { context: INLINE },
    );
  }

  generated(orgId: string, query: GeneratedQuery = {}): Observable<GeneratedList> {
    return this.api.get<GeneratedList>(`${this.base(orgId)}/generated-outputs`, {
      params: { ...query },
      context: INLINE,
    });
  }

  generatedOne(orgId: string, id: string): Observable<GeneratedOutput> {
    return this.api.get<GeneratedOutput>(`${this.base(orgId)}/generated-outputs/${id}`, {
      context: INLINE,
    });
  }

  /** The stored bytes (the download is audited by the backend). */
  download(orgId: string, id: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/generated-outputs/${id}/download`, {
      context: INLINE,
    });
  }

  sourceCheck(orgId: string, id: string): Observable<SourceCheck> {
    return this.api.get<SourceCheck>(`${this.base(orgId)}/generated-outputs/${id}/source-check`, {
      context: INLINE,
    });
  }

  branding(orgId: string): Observable<Branding> {
    return this.api.get<Branding>(`${this.base(orgId)}/settings/branding`, { context: INLINE });
  }

  updateBranding(orgId: string, body: BrandingUpdate): Observable<Branding> {
    return this.api.patch<Branding>(`${this.base(orgId)}/settings/branding`, body, {
      context: INLINE,
    });
  }

  logo(orgId: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/settings/branding/logo`, { context: INLINE });
  }

  /** The raw PNG / JPEG bytes as the request body (not multipart). */
  uploadLogo(orgId: string, file: Blob): Observable<Branding> {
    return this.api.put<Branding>(`${this.base(orgId)}/settings/branding/logo`, file, {
      context: INLINE,
    });
  }

  deleteLogo(orgId: string): Observable<Branding> {
    return this.api.delete<Branding>(`${this.base(orgId)}/settings/branding/logo`, {
      context: INLINE,
    });
  }
}
