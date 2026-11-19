import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { locationName } from '../../shared/locale/countries';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { CountryPicker } from '../../shared/ui/country-picker/country-picker';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  CustomerChip,
  CustomerPicker,
  CustomerRef,
  CustomersAvailability,
} from '../../shared/customers';
import { DpiaRisk, LiaDraft } from './data/privacy.models';
import { ISO_COUNTRY_CODES } from './data/privacy-countries';
import { classifyCountry, countryStatusKey, suggestedMechanism } from './data/privacy-display';
import { PrivacyErrorMessage } from './data/privacy-errors';
import {
  FormMode,
  REASON_ERROR_FIELD,
  changedReasonFields,
  fieldsFor,
  isVisible,
  mergeLiaDraft,
  validate,
} from './data/privacy-form-model';
import { PrivacyRefsService } from './data/privacy-refs.service';
import { FieldDef, FormValues, RegisterDef, fieldLabelKey } from './data/privacy-registers';
import { AcceptedSuggestion, FormSuggest } from '../../shared/ask/form-suggest';
import {
  privacySuggestFields,
  privacySuggestKey,
  privacySuggestPatch,
  privacySuggestValues,
} from './privacy-suggest';
import { RecordPicker } from './fields/record-picker';
import { RisksField } from './fields/risks-field';
import { ScreeningField } from './fields/screening-field';
import { TagInput } from './fields/tag-input';

export interface PrivacyFormSubmit {
  readonly values: FormValues;
  readonly changeReason: string;
}

interface Section {
  readonly key: string;
  readonly fields: readonly FieldDef[];
}

/** Fields whose meaning is easier to grasp with the assistant (an "Ask about this" button). */
const ASK_FIELDS = new Set([
  'legal_basis',
  'special_category_condition',
  'mechanism',
  'balancing_test',
  'subjects_exemption',
  'risk_level',
  'automated_decisions',
  'necessity_assessment',
  'dpa_status',
  'disposal_method',
]);

/** The three fields of "Registrer raskt": enough to start the 72-hour clock. */
const QUICK_BREACH_FIELDS = new Set(['title', 'aware_at', 'description']);

/**
 * The create / edit form of any privacy register, rendered from the register
 * descriptor (`data/privacy-registers.ts`): sections, field kinds, conditional
 * fields, inline field help and required checks. Links to other records are picked
 * from their registers, countries from the ISO list (with their chapter V status).
 * AI helpers: "Foreslå" at the top fills a whole ROPA entry or DPIA (reviewed field
 * by field), check a ROPA entry's Art. 30 completeness, draft a breach assessment, a legitimate-interest
 * assessment and a transfer assessment. A new breach starts in "Registrer raskt" (three
 * fields) so the clock starts at once.
 */
@Component({
  selector: 'app-privacy-register-form',
  imports: [
    TranslocoPipe,
    MarkdownPipe,
    AiAssistButton,
    FormSuggest,
    AskAbout,
    FieldHelp,
    Alert,
    Button,
    Card,
    CountryPicker,
    FormField,
    Icon,
    StatusBadge,
    RecordPicker,
    RisksField,
    ScreeningField,
    TagInput,
    CustomerPicker,
    CustomerChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      @if (quickMode()) {
        <app-alert tone="info" data-testid="breach-quick">
          {{ 'privacy.form.quickIntro' | transloco }}
          <button
            type="button"
            class="ml-1 font-semibold text-accent underline"
            (click)="quick.set(false)"
            data-testid="breach-quick-off"
          >
            {{ 'privacy.form.quickAll' | transloco }}
          </button>
        </app-alert>
      }

      @if (suggestKey(); as key) {
        <app-form-suggest
          [suggestKey]="key"
          [labelKey]="'ask.formSuggest.labels.' + register().key"
          [fields]="suggestFields()"
          [values]="suggestValues()"
          [context]="{ from: 'privacy', register: register().key }"
          [editing]="mode() === 'edit'"
          [titleOnly]="suggestTitleOnly()"
          (applied)="applySuggestion($event)"
        />
      }

      @if (register().key === 'ropa' && mode() === 'edit' && entityId()) {
        <app-card>
          <h2 class="mb-1 flex items-center gap-2 font-display text-card font-bold text-fg">
            <app-icon name="spark" [size]="16" />
            {{ 'privacy.ai.checkRopaTitle' | transloco }}
          </h2>
          <p class="mb-3 text-ui text-fg-muted">{{ 'privacy.ai.checkRopaHint' | transloco }}</p>
          <app-ai-assist-button
            assist="privacy.check_ropa"
            entityType="ropa_entry"
            [entityId]="entityId()"
            labelKey="privacy.ai.checkRopa"
            (text)="ropaCheck.set($event)"
          />
          @if (ropaCheck(); as text) {
            <div
              class="mt-3 max-h-[360px] overflow-y-auto rounded-tile bg-surface-2 p-3 text-ui text-fg"
              [innerHTML]="text | appMarkdown"
              aria-live="polite"
              data-testid="ropa-check"
            ></div>
          }
        </app-card>
      }

      @for (section of sections(); track section.key) {
        <app-card [attr.data-section]="section.key">
          <h2 class="mb-4 font-display text-section font-bold text-fg">
            {{ 'privacy.form.sections.' + section.key | transloco }}
          </h2>
          @if (section.key === 'authority' || section.key === 'subjects') {
            <p class="-mt-2 mb-4 text-ui text-fg-muted">
              {{ 'privacy.breach.decisionHint.' + section.key | transloco }}
            </p>
          }
          @if (section.key === 'tests' && register().key === 'lba' && isLia()) {
            <div class="-mt-1 mb-4 flex flex-wrap items-center gap-2">
              <app-ai-assist-button
                assist="privacy.draft_lia"
                [input]="liaInput()"
                [entityType]="entityId() ? 'legal_basis_assessment' : null"
                [entityId]="entityId()"
                labelKey="privacy.ai.draftLia"
                (result)="applyLiaDraft($event)"
              />
              @if (liaApplied()) {
                <span class="text-meta text-fg-muted" role="status">
                  {{ 'privacy.ai.applied' | transloco }}
                </span>
              }
            </div>
          }
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            @for (f of section.fields; track f.key) {
              <div [class.sm:col-span-2]="f.wide" [attr.data-field]="f.key">
                @switch (f.kind) {
                  @case ('screening') {
                    <app-privacy-screening-field
                      [value]="screeningValue()"
                      [rationale]="rationale()"
                      (valueChange)="set('screening', $event)"
                    />
                  }
                  @case ('risks') {
                    <app-privacy-risks-field
                      [value]="risksValue()"
                      (valueChange)="set('risks', $event)"
                    />
                    <app-field-help scope="privacy" [page]="register().key" field="risks" />
                  }
                  @case ('boolean') {
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                      <label class="flex items-center gap-2 text-body text-fg">
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [id]="fid(f)"
                          [checked]="form()[f.key] === true"
                          (change)="set(f.key, $any($event.target).checked)"
                          [attr.data-testid]="'field-' + f.key"
                        />
                        {{ label(f) | transloco }}
                      </label>
                      <app-field-help scope="privacy" [page]="register().key" [field]="f.key" />
                      @if (askable(f.key)) {
                        <app-ask-about
                          [field]="f.key"
                          [fieldLabel]="labelText(f)"
                          labelKey="privacy.ask.fieldTooltip"
                          [prompt]="'privacy.ask.field' | transloco: { field: labelText(f) }"
                        />
                      }
                    </div>
                  }
                  @case ('multi') {
                    <fieldset>
                      <legend
                        class="mb-1.5 flex items-center gap-2 text-ui font-semibold text-fg-muted"
                      >
                        {{ label(f) | transloco }}
                        <app-field-help scope="privacy" [page]="register().key" [field]="f.key" />
                      </legend>
                      <div class="flex flex-wrap gap-3">
                        @for (o of f.options ?? []; track o) {
                          <label class="flex items-center gap-2 text-body text-fg">
                            <input
                              type="checkbox"
                              class="h-4 w-4 accent-[var(--accent)]"
                              [checked]="listValue(f.key).includes(o)"
                              (change)="toggleOption(f.key, o, $any($event.target).checked)"
                            />
                            {{ 'privacy.options.' + f.optionSet + '.' + o | transloco }}
                          </label>
                        }
                      </div>
                    </fieldset>
                  }
                  @default {
                    <app-form-field [inputId]="fid(f)">
                      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <label [for]="fid(f)" class="text-ui font-semibold text-fg-muted">
                          {{ labelText(f) }}
                        </label>
                        @if (askable(f.key)) {
                          <app-ask-about
                            [field]="f.key"
                            [fieldLabel]="labelText(f)"
                            labelKey="privacy.ask.fieldTooltip"
                            [prompt]="'privacy.ask.field' | transloco: { field: labelText(f) }"
                          />
                        }
                        <app-field-help scope="privacy" [page]="register().key" [field]="f.key" />
                      </div>
                      @switch (f.kind) {
                        @case ('textarea') {
                          <textarea
                            [id]="fid(f)"
                            rows="3"
                            [attr.maxlength]="f.maxLength ?? null"
                            [value]="text(f.key)"
                            (input)="set(f.key, $any($event.target).value)"
                            [attr.aria-invalid]="!!shownErrors()[f.key]"
                            [attr.aria-describedby]="shownErrors()[f.key] ? fid(f) + '-err' : null"
                            [attr.data-testid]="'field-' + f.key"
                          ></textarea>
                        }
                        @case ('select') {
                          <select
                            [id]="fid(f)"
                            (change)="set(f.key, $any($event.target).value)"
                            [attr.aria-invalid]="!!shownErrors()[f.key]"
                            [attr.data-testid]="'field-' + f.key"
                          >
                            <option value="" [selected]="!form()[f.key]">
                              {{ 'privacy.common.notSet' | transloco }}
                            </option>
                            @for (o of f.options ?? []; track o) {
                              <option [value]="o" [selected]="form()[f.key] === o">
                                {{ 'privacy.options.' + f.optionSet + '.' + o | transloco }}
                              </option>
                            }
                          </select>
                        }
                        @case ('tristate') {
                          <select
                            [id]="fid(f)"
                            (change)="setTristate(f.key, $any($event.target).value)"
                            [attr.data-testid]="'field-' + f.key"
                          >
                            <option value="" [selected]="form()[f.key] === null">
                              {{ 'privacy.common.undecided' | transloco }}
                            </option>
                            <option value="yes" [selected]="form()[f.key] === true">
                              {{ 'privacy.common.yes' | transloco }}
                            </option>
                            <option value="no" [selected]="form()[f.key] === false">
                              {{ 'privacy.common.no' | transloco }}
                            </option>
                          </select>
                        }
                        @case ('tags') {
                          <app-privacy-tag-input
                            [inputId]="fid(f)"
                            [value]="listValue(f.key)"
                            (valueChange)="set(f.key, $event)"
                          />
                        }
                        @case ('country') {
                          <app-country-picker
                            [inputId]="fid(f)"
                            [multiple]="false"
                            [options]="countryCodes"
                            [value]="text(f.key) ? [text(f.key)] : []"
                            [invalid]="!!shownErrors()[f.key]"
                            [attr.data-testid]="'field-' + f.key"
                            (valueChange)="set(f.key, $event[0] ?? '')"
                          />
                          @if (countryHint(f.key); as hint) {
                            <p
                              class="mt-1 flex flex-wrap items-center gap-2 text-meta text-fg-muted"
                              [attr.data-testid]="'country-hint-' + f.key"
                            >
                              <app-status-badge
                                [meaning]="
                                  hint.status === 'third_country' ? 'lifecycle' : 'compliance'
                                "
                                [value]="hint.status === 'third_country' ? 'due' : 'met'"
                                [labelKey]="countryStatusKey(hint.status)"
                              />
                              @if (hint.mechanism) {
                                {{
                                  'privacy.form.mechanismHint'
                                    | transloco
                                      : {
                                          mechanism:
                                            ('privacy.options.mechanism.' + hint.mechanism
                                            | transloco),
                                        }
                                }}
                              }
                            </p>
                          }
                        }
                        @case ('countries') {
                          <app-country-picker
                            [inputId]="fid(f)"
                            [options]="countryCodes"
                            [value]="listValue(f.key)"
                            [label]="labelText(f)"
                            [flagged]="thirdCountries(f.key)"
                            [attr.data-testid]="'field-' + f.key"
                            (valueChange)="set(f.key, $event)"
                          />
                        }
                        @case ('refs') {
                          <app-privacy-record-picker
                            [inputId]="fid(f)"
                            [testId]="'field-' + f.key"
                            [label]="labelText(f)"
                            [options]="refOptions(f)"
                            [value]="listValue(f.key)"
                            (valueChange)="set(f.key, $event)"
                          />
                        }
                        @case ('entities') {
                          <app-privacy-record-picker
                            [inputId]="fid(f)"
                            [testId]="'field-' + f.key"
                            [label]="labelText(f)"
                            [options]="entityOptions(f)"
                            [value]="listValue(f.key)"
                            (valueChange)="set(f.key, $event)"
                          />
                        }
                        @case ('owner') {
                          <select [id]="fid(f)" (change)="set(f.key, $any($event.target).value)">
                            @if (mode() === 'create') {
                              <option value="" [selected]="!form()[f.key]">
                                {{ 'privacy.form.ownerMe' | transloco }}
                              </option>
                            }
                            @if (orphan(f.key, users())) {
                              <option [value]="form()[f.key]" selected>
                                {{ 'privacy.form.currentOwner' | transloco }}
                              </option>
                            }
                            @for (u of users(); track u.id) {
                              <option [value]="u.id" [selected]="form()[f.key] === u.id">
                                {{ u.label }}
                              </option>
                            }
                          </select>
                        }
                        @case ('department') {
                          <select [id]="fid(f)" (change)="set(f.key, $any($event.target).value)">
                            <option value="" [selected]="!form()[f.key]">
                              {{ 'privacy.common.notSet' | transloco }}
                            </option>
                            @if (orphan(f.key, departments())) {
                              <option [value]="form()[f.key]" selected>
                                {{ 'privacy.form.currentValue' | transloco }}
                              </option>
                            }
                            @for (d of departments(); track d.id) {
                              <option [value]="d.id" [selected]="form()[f.key] === d.id">
                                {{ d.label }}
                              </option>
                            }
                          </select>
                        }
                        @case ('ref') {
                          <select
                            [id]="fid(f)"
                            (change)="set(f.key, $any($event.target).value)"
                            [attr.data-testid]="'field-' + f.key"
                          >
                            <option value="" [selected]="!form()[f.key]">
                              {{ 'privacy.common.notSet' | transloco }}
                            </option>
                            @if (orphan(f.key, refOptions(f))) {
                              <option [value]="form()[f.key]" selected>
                                {{ 'privacy.form.currentValue' | transloco }}
                              </option>
                            }
                            @for (o of refOptions(f); track o.id) {
                              <option [value]="o.id" [selected]="form()[f.key] === o.id">
                                {{ o.label }}
                              </option>
                            }
                          </select>
                        }
                        @case ('customer') {
                          <app-customer-picker
                            [inputId]="fid(f)"
                            [value]="text(f.key) || null"
                            [current]="customerRef(text(f.key))"
                            (valueChange)="set(f.key, $event ?? '')"
                            (refChange)="rememberCustomer($event)"
                            [attr.data-testid]="'field-' + f.key"
                          />
                        }
                        @case ('customers') {
                          <div class="flex flex-col gap-2" [attr.data-testid]="'field-' + f.key">
                            @if (listValue(f.key).length) {
                              <ul class="flex flex-wrap gap-2">
                                @for (cid of listValue(f.key); track cid) {
                                  <li
                                    class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-ui"
                                  >
                                    <app-customer-chip [ref]="customerRef(cid)" />
                                    <button
                                      type="button"
                                      class="text-fg-muted hover:text-fg"
                                      [attr.aria-label]="'privacy.form.removeCustomer' | transloco"
                                      (click)="removeCustomer(f.key, cid)"
                                    >
                                      <span aria-hidden="true">✕</span>
                                    </button>
                                  </li>
                                }
                              </ul>
                            }
                            <app-customer-picker
                              [inputId]="fid(f)"
                              [value]="null"
                              (valueChange)="addCustomer(f.key, $event)"
                              (refChange)="rememberCustomer($event)"
                            />
                          </div>
                        }
                        @case ('entity') {
                          <select
                            [id]="fid(f)"
                            (change)="set(f.key, $any($event.target).value)"
                            [attr.aria-invalid]="!!shownErrors()[f.key]"
                            [attr.data-testid]="'field-' + f.key"
                          >
                            <option value="" [selected]="!form()[f.key]">
                              {{ 'privacy.common.notSet' | transloco }}
                            </option>
                            @if (orphan(f.key, entityOptions(f))) {
                              <option [value]="form()[f.key]" selected>
                                {{ 'privacy.form.currentValue' | transloco }}
                              </option>
                            }
                            @for (o of entityOptions(f); track o.id) {
                              <option [value]="o.id" [selected]="form()[f.key] === o.id">
                                {{ o.label }}
                              </option>
                            }
                          </select>
                        }
                        @default {
                          <input
                            [id]="fid(f)"
                            [type]="inputType(f)"
                            [attr.maxlength]="f.maxLength ?? null"
                            [attr.min]="f.kind === 'number' ? 0 : null"
                            [attr.required]="f.required ? '' : null"
                            [value]="text(f.key)"
                            (input)="set(f.key, $any($event.target).value)"
                            [attr.aria-invalid]="!!shownErrors()[f.key]"
                            [attr.aria-describedby]="shownErrors()[f.key] ? fid(f) + '-err' : null"
                            [attr.data-testid]="'field-' + f.key"
                          />
                        }
                      }
                    </app-form-field>
                    @if (mode() === 'edit' && f.editHintKey) {
                      <p
                        class="mt-1 text-meta text-fg-subtle"
                        [attr.data-testid]="'edit-hint-' + f.key"
                      >
                        {{ f.editHintKey | transloco }}
                      </p>
                    }
                    @if (shownErrors()[f.key]; as key) {
                      <p [id]="fid(f) + '-err'" class="mt-1 text-meta text-fail">
                        {{ key | transloco }}
                      </p>
                    }
                  }
                }
              </div>
            }
          </div>
          @if (register().key === 'breach' && section.key === 'impact') {
            <div class="mt-4">
              <app-ai-assist-button
                assist="privacy.draft_breach_assessment"
                [input]="{ description: breachText() }"
                [entityType]="entityId() ? 'data_breach' : null"
                [entityId]="entityId()"
                labelKey="privacy.ai.draftBreach"
                [disabled]="!entityId() && !breachText().trim()"
                (text)="breachDraft.set($event)"
              />
              @if (breachDraft(); as draft) {
                <div
                  class="mt-3 max-h-[360px] overflow-y-auto rounded-tile bg-surface-2 p-3 text-ui text-fg"
                  [innerHTML]="draft | appMarkdown"
                  aria-live="polite"
                  data-testid="breach-draft"
                ></div>
                <div class="mt-2">
                  <app-button variant="secondary" size="sm" (click)="useBreachDraft()">
                    {{ 'privacy.ai.useAsConsequences' | transloco }}
                  </app-button>
                </div>
              }
            </div>
          }
          @if (register().key === 'transfer' && section.key === 'tia') {
            <div class="mt-4">
              <app-ai-assist-button
                assist="privacy.draft_tia"
                [input]="tiaInput()"
                [entityType]="entityId() ? 'transfer_assessment' : null"
                [entityId]="entityId()"
                labelKey="privacy.ai.draftTia"
                [disabled]="!entityId() && !text('destination_country')"
                (text)="tiaDraft.set($event)"
              />
              @if (tiaDraft(); as draft) {
                <div
                  class="mt-3 max-h-[360px] overflow-y-auto rounded-tile bg-surface-2 p-3 text-ui text-fg"
                  [innerHTML]="draft | appMarkdown"
                  aria-live="polite"
                  data-testid="tia-draft"
                ></div>
                <div class="mt-2">
                  <app-button variant="secondary" size="sm" (click)="useTiaDraft()">
                    {{ 'privacy.ai.useAsTiaSummary' | transloco }}
                  </app-button>
                </div>
              }
            </div>
          }
        </app-card>
      }

      @if (mode() === 'edit' && register().revisions) {
        <app-card>
          <app-form-field
            [label]="
              (reasonRequired() ? 'privacy.form.changeReasonRequired' : 'privacy.form.changeReason')
                | transloco
            "
            inputId="cf-pf-reason"
          >
            <input
              id="cf-pf-reason"
              type="text"
              maxlength="500"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
              [attr.required]="reasonRequired() ? '' : null"
              [attr.aria-invalid]="!!shownErrors()[reasonField]"
              [attr.aria-describedby]="shownErrors()[reasonField] ? 'cf-pf-reason-err' : null"
              data-testid="change-reason"
            />
          </app-form-field>
          <p class="mt-1 text-meta text-fg-subtle">
            {{ 'privacy.form.changeReasonHint' | transloco }}
          </p>
          @if (shownErrors()[reasonField]; as key) {
            <p id="cf-pf-reason-err" class="mt-1 text-meta text-fail">
              {{ key | transloco }}
            </p>
          }
        </app-card>
      }

      @if (error(); as e) {
        <app-alert tone="error" data-testid="form-error">
          {{ e.key | transloco: { fields: fieldList(e.fields) } }}
        </app-alert>
      }

      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'privacy.common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" data-testid="privacy-save">
          {{ saveLabel() | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class PrivacyRegisterForm {
  private readonly refs = inject(PrivacyRefsService);
  private readonly i18n = inject(LanguageService);

  readonly register = input.required<RegisterDef>();
  readonly mode = input<FormMode>('create');
  readonly value = input.required<FormValues>();
  /** The record id in edit mode (lets the assistants read the stored record). */
  readonly entityId = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input<PrivacyErrorMessage | null>(null);
  /** The caller's permissions (fields with `editPermission` are shown only to holders). */
  readonly permissions = input<ReadonlySet<string>>(new Set());
  /** Start a new breach in "Registrer raskt" (three fields). */
  readonly quickStart = input(false);
  /** Names of the customers the record links to (the Kunde fields). */
  readonly customerRefs = input<readonly CustomerRef[]>([]);
  private readonly customersOn = inject(CustomersAvailability);
  /** Customers chosen in this form (their names, until the record is saved). */
  private readonly chosenCustomers = signal<Readonly<Record<string, CustomerRef>>>({});

  readonly submitted = output<PrivacyFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  private readonly attempted = signal(false);
  protected readonly quick = linkedSignal(
    () => this.quickStart() && this.register().key === 'breach' && this.mode() === 'create',
  );
  protected readonly quickMode = computed(() => this.quick());

  protected readonly liaApplied = signal(false);
  protected readonly rationale = signal<Readonly<Record<string, string>>>({});
  protected readonly breachDraft = signal<string | null>(null);
  protected readonly tiaDraft = signal<string | null>(null);
  protected readonly ropaCheck = signal<string | null>(null);

  protected readonly users = this.refs.users;
  protected readonly departments = this.refs.departments;
  protected readonly countryCodes = ISO_COUNTRY_CODES;
  protected readonly countryStatusKey = countryStatusKey;

  protected readonly sections = computed<readonly Section[]>(() => {
    const values = this.form();
    const quick = this.quick();
    const order: string[] = [];
    const grouped = new Map<string, FieldDef[]>();
    for (const f of fieldsFor(this.register(), this.mode(), this.can())) {
      if (!isVisible(f, values) || (quick && !QUICK_BREACH_FIELDS.has(f.key))) {
        continue;
      }
      if ((f.kind === 'customer' || f.kind === 'customers') && !this.customersOn.enabled()) {
        continue;
      }
      if (!grouped.has(f.section)) {
        grouped.set(f.section, []);
        order.push(f.section);
      }
      grouped.get(f.section)!.push(f);
    }
    return order.map((key) => ({ key, fields: grouped.get(key)! }));
  });

  protected readonly reasonField = REASON_ERROR_FIELD;
  private readonly can = computed(() => {
    const perms = this.permissions();
    return (permission: string) => perms.has(permission);
  });
  /** A changed field needs a reason (e.g. a corrected breach awareness time). */
  protected readonly reasonRequired = computed(
    () =>
      this.mode() === 'edit' &&
      changedReasonFields(this.register(), this.value(), this.form()).length > 0,
  );
  protected readonly errors = computed(() =>
    validate(this.register(), this.form(), this.mode(), {
      original: this.mode() === 'edit' ? this.value() : undefined,
      changeReason: this.changeReason(),
      can: this.can(),
    }),
  );
  protected readonly shownErrors = computed(() => (this.attempted() ? this.errors() : {}));

  protected readonly saveLabel = computed(() => {
    if (this.mode() === 'edit') {
      return 'privacy.form.save';
    }
    return this.quick() ? 'privacy.form.quickSave' : 'privacy.form.create';
  });

  protected readonly isLia = computed(() => this.form()['legal_basis'] === 'legitimate_interests');
  protected readonly liaInput = computed(() => ({
    ropa_entry_id: this.text('ropa_entry_id') || undefined,
    description: [this.form()['title'], this.form()['description'], this.form()['justification']]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
  }));
  protected readonly tiaInput = computed(() => ({
    destination_country: this.text('destination_country') || undefined,
    mechanism: this.text('mechanism') || undefined,
    description: [this.form()['title'], this.form()['description']]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
  }));

  protected readonly screeningValue = computed(
    () => (this.form()['screening'] as Readonly<Record<string, boolean>>) ?? {},
  );
  protected readonly risksValue = computed(
    () => (this.form()['risks'] as readonly DpiaRisk[]) ?? [],
  );
  protected readonly breachText = computed(() =>
    [this.form()['title'], this.form()['description'], this.form()['consequences']]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
  );

  constructor() {
    this.refs.ensureMembers();
  }

  protected fid(f: FieldDef): string {
    return `cf-pf-${f.key}`;
  }

  protected label(f: FieldDef): string {
    return fieldLabelKey(f);
  }

  protected labelText(f: FieldDef): string {
    return this.translate(fieldLabelKey(f)) + (f.required ? ' *' : '');
  }

  private translate(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  protected inputType(f: FieldDef): string {
    switch (f.kind) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'datetime':
        return 'datetime-local';
      default:
        return 'text';
    }
  }

  protected text(key: string): string {
    const v = this.form()[key];
    return v === null || v === undefined ? '' : String(v);
  }

  /** The customer ref of an id (from the record or chosen here); a placeholder otherwise. */
  protected customerRef(id: string): CustomerRef | null {
    if (!id) {
      return null;
    }
    const chosen = this.chosenCustomers()[id];
    if (chosen) {
      return chosen;
    }
    return this.customerRefs().find((r) => r.id === id) ?? null;
  }

  protected rememberCustomer(ref: CustomerRef | null): void {
    if (ref) {
      this.chosenCustomers.update((m) => ({ ...m, [ref.id]: ref }));
    }
  }

  protected addCustomer(key: string, id: string | null): void {
    const list = this.listValue(key);
    if (id && !list.includes(id)) {
      this.set(key, [...list, id]);
    }
  }

  protected removeCustomer(key: string, id: string): void {
    this.set(
      key,
      this.listValue(key).filter((v) => v !== id),
    );
  }

  protected listValue(key: string): readonly string[] {
    const v = this.form()[key];
    return Array.isArray(v) ? (v as string[]) : [];
  }

  protected refOptions(f: FieldDef) {
    return f.ref ? this.refs.options(f.ref) : [];
  }

  protected entityOptions(f: FieldDef) {
    return f.entity ? this.refs.entityOptions(f.entity) : [];
  }

  /** Where the picked country stands (EEA / adequacy / third country) and the usual tool. */
  protected countryHint(key: string) {
    const code = this.text(key);
    if (!code) {
      return null;
    }
    const status = classifyCountry(code, this.refs.countries());
    if (status === 'unknown') {
      return null;
    }
    return {
      status,
      name: locationName(code, this.i18n),
      mechanism: this.register().key === 'transfer' ? suggestedMechanism(status) : null,
    };
  }

  /** Countries outside the EEA without an adequacy decision (flagged in the picker). */
  protected thirdCountries(key: string): readonly string[] {
    const lists = this.refs.countries();
    return this.listValue(key).filter((c) => classifyCountry(c, lists) === 'third_country');
  }

  protected orphan(key: string, options: readonly { id: string }[]): boolean {
    const v = this.form()[key];
    return typeof v === 'string' && !!v && !options.some((o) => o.id === v);
  }

  protected askable(key: string): boolean {
    return ASK_FIELDS.has(key);
  }

  protected fieldList(fields: readonly string[]): string {
    return fields.map((f) => this.translate(`privacy.fields.${f}`)).join(', ');
  }

  protected set(key: string, value: unknown): void {
    this.form.update((v) => ({ ...v, [key]: value }));
  }

  protected setTristate(key: string, value: string): void {
    this.set(key, value === 'yes' ? true : value === 'no' ? false : null);
  }

  protected toggleOption(key: string, option: string, checked: boolean): void {
    const current = this.listValue(key).filter((o) => o !== option);
    this.set(key, checked ? [...current, option] : current);
  }

  // --- whole-form suggestion (ROPA, DPIA) ------------------------------------------

  protected readonly suggestKey = computed(() => privacySuggestKey(this.register()));
  protected readonly suggestFields = computed(() =>
    privacySuggestFields(this.register(), (key, params) => this.i18n.translate(key, params)),
  );
  protected readonly suggestValues = computed(() =>
    privacySuggestValues(this.register(), this.form()),
  );
  protected readonly suggestTitleOnly = computed(() => {
    const values = this.form();
    const filled = (key: string) => String(values[key] ?? '').trim().length > 0;
    return filled('title') && !filled('purposes') && !filled('necessity_assessment');
  });

  /** Accepted suggestions fill the form; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const change = privacySuggestPatch(this.register(), accepted);
    this.form.update((v) => ({ ...v, ...change }));
  }

  protected applyLiaDraft(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    this.form.update((v) => mergeLiaDraft(v, result as LiaDraft));
    this.liaApplied.set(true);
  }

  protected useBreachDraft(): void {
    const draft = this.breachDraft();
    if (draft) {
      this.set('consequences', draft.slice(0, 10000));
    }
  }

  protected useTiaDraft(): void {
    const draft = this.tiaDraft();
    if (draft) {
      this.set('tia_summary', draft.slice(0, 10000));
    }
  }

  protected submit(): void {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length) {
      const first = Object.keys(this.errors())[0];
      queueMicrotask(() => document.getElementById(`cf-pf-${first}`)?.focus());
      return;
    }
    this.submitted.emit({ values: this.form(), changeReason: this.changeReason() });
  }
}
