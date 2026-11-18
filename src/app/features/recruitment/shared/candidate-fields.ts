import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull } from '../data/recruitment-display';
import {
  CandidateCreate,
  CandidateDetail,
  CandidateSource,
  RecruitmentSettings,
  SOURCES,
} from '../data/recruitment.models';
import { RecruitmentField } from './recruitment-field';

export interface CandidateDraft {
  readonly full_name: string;
  readonly email: string;
  readonly phone: string;
  readonly location: string;
  readonly profile_url: string;
  readonly source: CandidateSource;
  readonly notes: string;
  readonly privacy_notice_given: boolean;
  readonly talent_pool_consent: boolean;
}

export function emptyCandidateDraft(): CandidateDraft {
  return {
    full_name: '',
    email: '',
    phone: '',
    location: '',
    profile_url: '',
    source: 'direct',
    notes: '',
    privacy_notice_given: false,
    talent_pool_consent: false,
  };
}

export function draftFromCandidate(c: CandidateDetail): CandidateDraft {
  return {
    full_name: c.full_name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    location: c.location ?? '',
    profile_url: c.profile_url ?? '',
    source: c.source,
    notes: c.notes ?? '',
    privacy_notice_given: c.privacy_notice_given_at !== null,
    talent_pool_consent: c.talent_pool_consent,
  };
}

export function candidatePayload(d: CandidateDraft): CandidateCreate {
  return {
    full_name: d.full_name.trim(),
    email: blankToNull(d.email),
    phone: blankToNull(d.phone),
    location: blankToNull(d.location),
    profile_url: blankToNull(d.profile_url),
    source: d.source,
    notes: blankToNull(d.notes),
    privacy_notice_given: d.privacy_notice_given,
    talent_pool_consent: d.talent_pool_consent,
  };
}

let nextId = 0;

/**
 * Candidate personal-data fields (data minimisation: only what recruitment needs),
 * plus, when creating, the privacy notice (GDPR art. 13/14) and the optional
 * talent-pool consent. The notice shown is the organisation's approved notice in
 * Documents when one is linked (the exact revision is recorded on the candidate).
 * Shared by the candidate form and "add candidate".
 */
@Component({
  selector: 'app-candidate-fields',
  imports: [TranslocoPipe, FieldHelp, EntityChip, RecruitmentField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <app-recruitment-field
        class="sm:col-span-2"
        labelKey="recruitment.fields.fullName"
        [inputId]="uid + '-name'"
        page="candidateForm"
        [required]="true"
        [error]="nameError()"
      >
        <input
          [id]="uid + '-name'"
          required
          maxlength="200"
          autocomplete="off"
          [value]="draft().full_name"
          (input)="set('full_name', $any($event.target).value)"
          [attr.aria-invalid]="!!nameError()"
          data-testid="cand-name"
        />
      </app-recruitment-field>
      <app-recruitment-field labelKey="recruitment.fields.email" [inputId]="uid + '-email'">
        <input
          [id]="uid + '-email'"
          type="email"
          maxlength="320"
          autocomplete="off"
          [value]="draft().email"
          (input)="set('email', $any($event.target).value)"
        />
      </app-recruitment-field>
      <app-recruitment-field labelKey="recruitment.fields.phone" [inputId]="uid + '-phone'">
        <input
          [id]="uid + '-phone'"
          type="tel"
          maxlength="50"
          autocomplete="off"
          [value]="draft().phone"
          (input)="set('phone', $any($event.target).value)"
        />
      </app-recruitment-field>
      <app-recruitment-field labelKey="recruitment.fields.location" [inputId]="uid + '-location'">
        <input
          [id]="uid + '-location'"
          maxlength="200"
          [value]="draft().location"
          (input)="set('location', $any($event.target).value)"
        />
      </app-recruitment-field>
      <app-recruitment-field
        labelKey="recruitment.fields.source"
        [inputId]="uid + '-source'"
        [required]="true"
      >
        <select [id]="uid + '-source'" (change)="set('source', $any($event.target).value)">
          @for (s of sources; track s) {
            <option [value]="s" [selected]="s === draft().source">
              {{ 'recruitment.source.' + s | transloco }}
            </option>
          }
        </select>
      </app-recruitment-field>
      <app-recruitment-field
        class="sm:col-span-2"
        labelKey="recruitment.fields.profileUrl"
        [inputId]="uid + '-url'"
      >
        <input
          [id]="uid + '-url'"
          type="url"
          maxlength="500"
          [value]="draft().profile_url"
          (input)="set('profile_url', $any($event.target).value)"
        />
      </app-recruitment-field>
      <app-recruitment-field
        class="sm:col-span-2"
        labelKey="recruitment.fields.notes"
        [inputId]="uid + '-notes'"
        page="candidateForm"
        help="notes"
      >
        <textarea
          [id]="uid + '-notes'"
          rows="4"
          maxlength="10000"
          [value]="draft().notes"
          (input)="set('notes', $any($event.target).value)"
        ></textarea>
      </app-recruitment-field>
    </div>

    @if (withConsent()) {
      <fieldset class="mt-5 rounded-tile border border-border p-4">
        <legend class="px-1 text-ui font-semibold text-fg">
          {{ 'recruitment.privacy.title' | transloco }}
        </legend>
        @if (settings(); as s) {
          @if (s.privacy_notice_document; as doc) {
            <div class="mb-3 text-ui" data-testid="cand-notice-doc">
              <p class="mb-1 text-fg-muted">
                {{
                  'recruitment.privacy.noticeFromDocument'
                    | transloco: { version: doc.version ?? doc.approved_revision ?? '—' }
                }}
              </p>
              <app-entity-chip
                [ref]="{
                  entity_type: 'document',
                  entity_id: doc.id,
                  title: doc.title,
                  code: doc.code,
                  url: doc.url,
                  status: doc.status,
                }"
                [showType]="false"
              />
            </div>
          } @else if (s.privacy_notice) {
            <details class="mb-3 text-ui">
              <summary class="cursor-pointer font-semibold text-accent">
                {{
                  'recruitment.privacy.showNotice'
                    | transloco: { version: s.privacy_notice_version ?? '—' }
                }}
              </summary>
              <p class="mt-2 whitespace-pre-wrap text-fg-muted">{{ s.privacy_notice }}</p>
            </details>
          } @else {
            <p class="mb-3 text-meta text-warn-ink">
              {{ 'recruitment.privacy.noNotice' | transloco }}
            </p>
          }
        }
        <label class="flex items-start gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().privacy_notice_given"
            (change)="set('privacy_notice_given', $any($event.target).checked)"
            data-testid="privacy-given"
          />
          <span>{{ 'recruitment.privacy.noticeGiven' | transloco }}</span>
          <app-field-help scope="recruitment" page="candidateForm" field="privacy_notice_given" />
        </label>
        <label class="mt-3 flex items-start gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().talent_pool_consent"
            (change)="set('talent_pool_consent', $any($event.target).checked)"
          />
          <span>{{ 'recruitment.privacy.poolConsent' | transloco }}</span>
          <app-field-help scope="recruitment" page="candidateForm" field="talent_pool_consent" />
        </label>
      </fieldset>
    }
  `,
})
export class CandidateFields {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  readonly draft = model<CandidateDraft>(emptyCandidateDraft());
  /** Show the privacy notice and consent checkboxes (creating only). */
  readonly withConsent = input(true);
  /** i18n key of the name error (shown after a save attempt). */
  readonly nameError = input<string | null>(null);

  protected readonly sources = SOURCES;
  protected readonly uid = `cf-cand-${++nextId}`;
  protected readonly settings = signal<RecruitmentSettings | null>(null);

  constructor() {
    effect((onCleanup) => {
      const orgId = this.orgId();
      if (!orgId || !this.withConsent()) {
        return;
      }
      const sub = this.api.getSettings(orgId).subscribe({
        next: (s) => this.settings.set(s),
        error: () => this.settings.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected set<K extends keyof CandidateDraft>(key: K, value: CandidateDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }
}
