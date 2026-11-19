import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';

/** A record the organisation is missing (offered when a new form opens). */
export interface FormSuggestOffer {
  /** e.g. `information_security`, `acceptable_use`. */
  readonly key: string;
  /** Form values to start from (backend field names), e.g. `{ kind: 'privacy' }`. */
  readonly values: Readonly<Record<string, unknown>>;
  /** What makes it required: a framework key (`iso27001`) or `ai_act`. */
  readonly reason: string;
}

export interface FormSuggestOptions {
  readonly offers: readonly FormSuggestOffer[];
  /** Empty profile facts that would make suggestions more precise. */
  readonly missing_facts: readonly string[];
  readonly ai_enabled: boolean;
}

export interface SuggestedField {
  readonly name: string;
  readonly value: unknown;
  readonly rationale: string | null;
  /** The value differs from the current form value. */
  readonly changed: boolean;
  /** The label of a picked record (`ref`) or records (`refs`). */
  readonly display: string | readonly string[] | null;
}

export interface FormSuggestResult {
  readonly fields: readonly SuggestedField[];
  /** Profile facts the suggestion needed but the organisation has not filled in. */
  readonly missing_facts: readonly string[];
}

export interface FormSuggestRequest {
  /** Current form values, by backend field name. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Where the form was opened from (`{ from: 'context', offer: 'privacy' }`). */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly mode?: 'create' | 'improve';
  /** Only these fields ("Skriv om" on one field). */
  readonly fields?: readonly string[];
  readonly lang?: string;
}

/**
 * Whole-form AI suggestions (`v1/orgs/{org}/ai/form-suggest/{key}`): `options` lists
 * missing records and empty profile facts (no model call); `suggest` proposes every
 * field with a short rationale. Nothing is saved. The UI language is sent as `lang`.
 */
@Injectable({ providedIn: 'root' })
export class FormSuggestApi {
  private readonly api = inject(ApiService);
  private readonly language = inject(LanguageService);

  options(orgId: string, key: string): Observable<FormSuggestOptions> {
    return this.api.get<FormSuggestOptions>(this.path(orgId, key), {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  suggest(orgId: string, key: string, body: FormSuggestRequest): Observable<FormSuggestResult> {
    return this.api.post<FormSuggestResult>(
      this.path(orgId, key),
      {
        ...body,
        lang: body.lang ?? this.language.active(),
      },
      // The form shows its own calm message; no global error toast.
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  private path(orgId: string, key: string): string {
    return `v1/orgs/${encodeURIComponent(orgId)}/ai/form-suggest/${encodeURIComponent(key)}`;
  }
}
