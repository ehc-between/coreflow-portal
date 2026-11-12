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
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { DpiaRisk, RopaDraft, ScreeningSuggestion } from './data/privacy.models';
import { PrivacyErrorMessage } from './data/privacy-errors';
import {
  FormMode,
  fieldsFor,
  isVisible,
  mergeRopaDraft,
  validate,
} from './data/privacy-form-model';
import { PrivacyRefsService } from './data/privacy-refs.service';
import { FieldDef, FormValues, RegisterDef, fieldLabelKey } from './data/privacy-registers';
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
]);

/**
 * The create / edit form of any privacy register, rendered from the register
 * descriptor (`data/privacy-registers.ts`): sections, field kinds, conditional
 * fields, field help and required checks. AI helpers: draft a ROPA entry from a
 * description, screen the DPIA need, and draft a breach assessment.
 */
@Component({
  selector: 'app-privacy-register-form',
  imports: [
    TranslocoPipe,
    MarkdownPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    RisksField,
    ScreeningField,
    TagInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      @if (register().key === 'ropa') {
        <app-card>
          <h2 class="mb-1 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
            <app-icon name="spark" [size]="16" />
            {{ 'privacy.ai.ropaTitle' | transloco }}
          </h2>
          <p class="mb-3 text-[13px] text-fg-muted">{{ 'privacy.ai.ropaHint' | transloco }}</p>
          <label class="sr-only" for="cf-pf-ai-description">
            {{ 'privacy.ai.describeLabel' | transloco }}
          </label>
          <textarea
            id="cf-pf-ai-description"
            rows="3"
            maxlength="6000"
            class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
            [placeholder]="'privacy.ai.ropaPlaceholder' | transloco"
            [value]="aiDescription()"
            (input)="aiDescription.set($any($event.target).value)"
            data-testid="ropa-ai-description"
          ></textarea>
          <div class="mt-2">
            <app-ai-assist-button
              assist="privacy.draft_ropa"
              [input]="{ description: aiDescription() }"
              labelKey="privacy.ai.draftRopa"
              [disabled]="!aiDescription().trim()"
              (result)="applyRopaDraft($event)"
            />
          </div>
          @if (aiNotes(); as notes) {
            <app-alert tone="info" class="mt-3 block">
              {{ 'privacy.ai.notes' | transloco: { notes } }}
            </app-alert>
          }
          @if (aiApplied()) {
            <p class="mt-2 text-[12.5px] text-fg-muted" role="status">
              {{ 'privacy.ai.applied' | transloco }}
            </p>
          }
        </app-card>
      }

      @for (section of sections(); track section.key) {
        <app-card>
          <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
            {{ 'privacy.form.sections.' + section.key | transloco }}
          </h2>
          @if (section.key === 'authority' || section.key === 'subjects') {
            <p class="-mt-2 mb-4 text-[13px] text-fg-muted">
              {{ 'privacy.breach.decisionHint.' + section.key | transloco }}
            </p>
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
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <app-ai-assist-button
                        assist="privacy.screen_dpia"
                        [input]="{ description: screeningText() }"
                        labelKey="privacy.ai.screenDpia"
                        [disabled]="!screeningText().trim()"
                        (result)="applyScreening($event)"
                      />
                      @if (screeningSummary(); as summary) {
                        <p class="text-[12.5px] text-fg-muted" role="status">{{ summary }}</p>
                      }
                    </div>
                  }
                  @case ('risks') {
                    <app-privacy-risks-field
                      [value]="risksValue()"
                      (valueChange)="set('risks', $event)"
                    />
                    <app-field-help scope="privacy" [page]="register().key" field="risks" />
                  }
                  @case ('boolean') {
                    <label class="flex items-center gap-2 pt-1 text-[13.5px] text-fg">
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
                  }
                  @case ('multi') {
                    <fieldset>
                      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                        {{ label(f) | transloco }}
                      </legend>
                      <div class="flex flex-wrap gap-3">
                        @for (o of f.options ?? []; track o) {
                          <label class="flex items-center gap-2 text-[13.5px] text-fg">
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
                    <app-field-help scope="privacy" [page]="register().key" [field]="f.key" />
                  }
                  @default {
                    <app-form-field [label]="labelText(f)" [inputId]="fid(f)">
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
                    <div class="mt-1 flex items-start gap-2">
                      <app-field-help scope="privacy" [page]="register().key" [field]="f.key" />
                      @if (askable(f.key)) {
                        <app-ask-about
                          [field]="f.key"
                          [prompt]="'privacy.ask.field' | transloco: { field: labelText(f) }"
                        />
                      }
                    </div>
                    @if (shownErrors()[f.key]; as key) {
                      <p [id]="fid(f) + '-err'" class="mt-1 text-[12px] text-fail">
                        {{ key | transloco }}
                      </p>
                    }
                  }
                }
              </div>
            }
          </div>
          @if (register().key === 'breach' && section.key === 'impact') {
            <div class="mt-4 rounded-tile border border-border p-3">
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
                  class="prose-sm mt-3 max-h-[360px] overflow-y-auto text-[13px] text-fg"
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
        </app-card>
      }

      @if (mode() === 'edit' && register().revisions) {
        <app-card>
          <app-form-field [label]="'privacy.form.changeReason' | transloco" inputId="cf-pf-reason">
            <input
              id="cf-pf-reason"
              type="text"
              maxlength="500"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
              data-testid="change-reason"
            />
          </app-form-field>
          <p class="mt-1 text-[12px] text-fg-subtle">
            {{ 'privacy.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      @if (error(); as e) {
        <app-alert tone="error" data-testid="form-error">
          {{ e.key | transloco: { fields: fieldList(e.fields) } }}
        </app-alert>
      }

      <div class="flex flex-wrap justify-end gap-2">
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'privacy.common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" data-testid="privacy-save">
          {{ (mode() === 'create' ? 'privacy.form.create' : 'privacy.form.save') | transloco }}
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
  /** The record id in edit mode (lets the breach assistant read the stored record). */
  readonly entityId = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input<PrivacyErrorMessage | null>(null);

  readonly submitted = output<PrivacyFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  private readonly attempted = signal(false);

  protected readonly aiDescription = signal('');
  protected readonly aiNotes = signal<string | null>(null);
  protected readonly aiApplied = signal(false);
  protected readonly rationale = signal<Readonly<Record<string, string>>>({});
  protected readonly screeningSummary = signal<string | null>(null);
  protected readonly breachDraft = signal<string | null>(null);

  protected readonly users = this.refs.users;
  protected readonly departments = this.refs.departments;

  protected readonly sections = computed<readonly Section[]>(() => {
    const values = this.form();
    const order: string[] = [];
    const grouped = new Map<string, FieldDef[]>();
    for (const f of fieldsFor(this.register(), this.mode())) {
      if (!isVisible(f, values)) {
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

  protected readonly errors = computed(() => validate(this.register(), this.form(), this.mode()));
  protected readonly shownErrors = computed(() => (this.attempted() ? this.errors() : {}));

  protected readonly screeningValue = computed(
    () => (this.form()['screening'] as Readonly<Record<string, boolean>>) ?? {},
  );
  protected readonly risksValue = computed(
    () => (this.form()['risks'] as readonly DpiaRisk[]) ?? [],
  );
  protected readonly screeningText = computed(() =>
    [this.form()['title'], this.form()['description'], this.form()['necessity_assessment']]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
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

  private translate(key: string): string {
    return this.i18n.translate(key);
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

  protected listValue(key: string): readonly string[] {
    const v = this.form()[key];
    return Array.isArray(v) ? (v as string[]) : [];
  }

  protected refOptions(f: FieldDef) {
    return f.ref ? this.refs.options(f.ref) : [];
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

  protected applyRopaDraft(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const draft = result as RopaDraft;
    this.form.update((v) => mergeRopaDraft(v, draft));
    this.aiNotes.set(typeof draft.notes === 'string' && draft.notes.trim() ? draft.notes : null);
    this.aiApplied.set(true);
  }

  protected applyScreening(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const s = result as ScreeningSuggestion;
    if (s.screening && typeof s.screening === 'object') {
      this.set('screening', { ...s.screening });
    }
    this.rationale.set(s.rationale ?? {});
    this.screeningSummary.set(s.summary ?? null);
  }

  protected useBreachDraft(): void {
    const draft = this.breachDraft();
    if (draft) {
      this.set('consequences', draft.slice(0, 10000));
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
