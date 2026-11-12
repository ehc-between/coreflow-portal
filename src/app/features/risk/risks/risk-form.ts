import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { fromDateInput, parseControlRefs, toDateInput } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  CIA_PROPERTIES,
  CiaProperty,
  Matrix,
  Register,
  Risk,
  RiskCreate,
  RiskUpdate,
  SOURCE_TYPES,
  STRATEGIES,
  SourceType,
  Strategy,
  ThreatSuggestion,
} from '../data/risk.models';
import { PersonSelect } from '../shared/person-select';
import { RatingPicker, RatingValue } from '../shared/rating-picker';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

/** The editable fields of a risk, as the form holds them. */
export interface RiskFormValue {
  readonly register_id: string;
  readonly title: string;
  readonly description: string;
  readonly source_type: SourceType | '';
  readonly source_ref: string;
  readonly threat: string;
  readonly vulnerability: string;
  readonly consequence_text: string;
  readonly affected_properties: readonly CiaProperty[];
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly inherent: RatingValue;
  readonly treatment_strategy: Strategy | '';
  readonly treatment_notes: string;
  readonly residual: RatingValue;
  readonly control_refs: string;
  readonly review_interval_months: string;
  readonly next_review_at: string;
}

const EMPTY_RATING: RatingValue = { likelihood: null, consequence: null };

export function emptyRiskForm(registerId = ''): RiskFormValue {
  return {
    register_id: registerId,
    title: '',
    description: '',
    source_type: '',
    source_ref: '',
    threat: '',
    vulnerability: '',
    consequence_text: '',
    affected_properties: [],
    owner_user_id: '',
    department_id: '',
    inherent: EMPTY_RATING,
    treatment_strategy: '',
    treatment_notes: '',
    residual: EMPTY_RATING,
    control_refs: '',
    review_interval_months: '',
    next_review_at: '',
  };
}

export function riskToForm(risk: Risk): RiskFormValue {
  return {
    register_id: risk.register.id,
    title: risk.title,
    description: risk.description ?? '',
    source_type: risk.source_type ?? '',
    source_ref: risk.source_ref ?? '',
    threat: risk.threat ?? '',
    vulnerability: risk.vulnerability ?? '',
    consequence_text: risk.consequence_text ?? '',
    affected_properties: risk.affected_properties,
    owner_user_id: risk.owner?.id ?? '',
    department_id: risk.department?.id ?? '',
    inherent: risk.inherent
      ? { likelihood: risk.inherent.likelihood, consequence: risk.inherent.consequence }
      : EMPTY_RATING,
    treatment_strategy: risk.treatment_strategy ?? '',
    treatment_notes: risk.treatment_notes ?? '',
    residual: risk.residual
      ? { likelihood: risk.residual.likelihood, consequence: risk.residual.consequence }
      : EMPTY_RATING,
    control_refs: risk.control_refs.join(', '),
    review_interval_months:
      risk.review_interval_months !== null ? String(risk.review_interval_months) : '',
    next_review_at: toDateInput(risk.next_review_at),
  };
}

const text = (value: string): string | null => value.trim() || null;

/** The create body for a form value. */
export function toRiskCreate(v: RiskFormValue): RiskCreate {
  return {
    register_id: v.register_id || null,
    title: v.title.trim(),
    description: text(v.description),
    source_type: v.source_type || null,
    source_ref: text(v.source_ref),
    threat: text(v.threat),
    vulnerability: text(v.vulnerability),
    consequence_text: text(v.consequence_text),
    affected_properties: v.affected_properties,
    owner_user_id: v.owner_user_id || null,
    department_id: v.department_id || null,
    inherent_likelihood: v.inherent.likelihood,
    inherent_consequence: v.inherent.consequence,
    treatment_strategy: v.treatment_strategy || null,
    treatment_notes: text(v.treatment_notes),
    residual_likelihood: v.residual.likelihood,
    residual_consequence: v.residual.consequence,
    control_refs: parseControlRefs(v.control_refs),
    review_interval_months: v.review_interval_months ? Number(v.review_interval_months) : null,
    next_review_at: fromDateInput(v.next_review_at),
  };
}

/**
 * The PATCH body for an edit: only the fields that differ from the original, so an
 * unchanged rating never revokes an acceptance and the audit trail shows real changes.
 */
export function toRiskUpdate(
  original: RiskFormValue,
  next: RiskFormValue,
  changeReason: string,
): RiskUpdate {
  const before: Record<string, unknown> = { ...toRiskCreate(original) };
  const after: Record<string, unknown> = { ...toRiskCreate(next) };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key] = after[key];
    }
  }
  // A rating is sent as a pair so the backend never sees half a rating.
  for (const [l, c] of [
    ['inherent_likelihood', 'inherent_consequence'],
    ['residual_likelihood', 'residual_consequence'],
  ]) {
    if (l in out || c in out) {
      out[l] = after[l];
      out[c] = after[c];
    }
  }
  if (Object.keys(out).length && changeReason.trim()) {
    out['change_reason'] = changeReason.trim();
  }
  return out as RiskUpdate;
}

/**
 * Create or edit a risk: context (what is at risk and how), the inherent rating on
 * the register's matrix, the treatment decision and the residual rating, owner and
 * review cycle. "Suggest threats" fills threat, vulnerability and consequence from
 * an AI suggestion the user picks.
 */
@Component({
  selector: 'app-risk-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    PersonSelect,
    RatingPicker,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/risk/risks', id()] : '/risk/risks'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'risk.common.backToRisk' : 'risk.common.backToRisks') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'risk.form.editTitle' : 'risk.form.newTitle') | transloco }}
      </h1>
      <app-risk-page-guide class="mb-5" page="form" lesson="first-risk-assessment" />

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'risk.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'risk.common.loadFailed' | transloco }}
        </p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.form.sections.basics' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4">
              <app-form-field [label]="'risk.fields.title' | transloco" inputId="risk-title">
                <input
                  id="risk-title"
                  required
                  maxlength="255"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                  [attr.aria-invalid]="titleMissing() || null"
                />
                <app-field-help scope="risk" page="form" field="title" />
              </app-form-field>
              @if (registers().length > 0) {
                <app-form-field
                  [label]="'risk.fields.register' | transloco"
                  inputId="risk-register"
                >
                  <select id="risk-register" (change)="setRegister($any($event.target).value)">
                    @for (r of activeRegisters(); track r.id) {
                      <option [value]="r.id" [selected]="r.id === form().register_id">
                        {{ r.name }} ({{ 'risk.categories.' + r.category | transloco }})
                      </option>
                    }
                  </select>
                  <app-field-help scope="risk" page="form" field="register" />
                </app-form-field>
              }
              <app-form-field
                [label]="'risk.fields.description' | transloco"
                inputId="risk-description"
              >
                <textarea
                  id="risk-description"
                  rows="3"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'risk.form.sections.context' | transloco }}
              </h2>
              <app-ai-assist-button
                assist="risk.suggest_threats"
                labelKey="risk.ai.suggestThreats"
                [input]="threatInput()"
                [disabled]="!form().title.trim()"
                entityType="risk"
                [entityId]="id() ?? null"
                (result)="onThreats($event)"
              />
            </div>
            @if (threats().length) {
              <section
                class="mb-4 rounded-card border border-accent/30 bg-accent-soft p-3"
                aria-live="polite"
                [attr.aria-label]="'risk.ai.threatsTitle' | transloco"
              >
                <div class="mb-2 flex items-center justify-between">
                  <h3 class="text-[13px] font-semibold text-fg">
                    {{ 'risk.ai.threatsTitle' | transloco }}
                  </h3>
                  <button
                    type="button"
                    class="text-[12.5px] font-semibold text-fg-muted hover:text-fg"
                    (click)="threats.set([])"
                  >
                    {{ 'risk.common.dismiss' | transloco }}
                  </button>
                </div>
                <ul class="flex flex-col gap-2">
                  @for (t of threats(); track $index) {
                    <li
                      class="flex flex-col gap-1 rounded-tile bg-surface p-2.5 text-[13px] sm:flex-row sm:items-start"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold text-fg">{{ t.threat }}</p>
                        @if (t.vulnerability) {
                          <p class="text-fg-muted">
                            {{ 'risk.fields.vulnerability' | transloco }}: {{ t.vulnerability }}
                          </p>
                        }
                        @if (t.consequence) {
                          <p class="text-fg-muted">
                            {{ 'risk.fields.consequence' | transloco }}: {{ t.consequence }}
                          </p>
                        }
                      </div>
                      <app-button size="sm" variant="secondary" (click)="useThreat(t)">
                        {{ 'risk.ai.use' | transloco }}
                      </app-button>
                    </li>
                  }
                </ul>
              </section>
            }
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field
                [label]="'risk.fields.sourceType' | transloco"
                inputId="risk-source-type"
              >
                <select
                  id="risk-source-type"
                  (change)="set('source_type', $any($event.target).value)"
                >
                  <option value="" [selected]="!form().source_type">
                    {{ 'risk.common.notSet' | transloco }}
                  </option>
                  @for (s of sourceTypes; track s) {
                    <option [value]="s" [selected]="s === form().source_type">
                      {{ 'risk.sourceTypes.' + s | transloco }}
                    </option>
                  }
                </select>
                <app-field-help scope="risk" page="form" field="source" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.sourceRef' | transloco"
                inputId="risk-source-ref"
              >
                <input
                  id="risk-source-ref"
                  maxlength="255"
                  [value]="form().source_ref"
                  (input)="set('source_ref', $any($event.target).value)"
                />
              </app-form-field>
            </div>
            <div class="mt-4 grid grid-cols-1 gap-4">
              <app-form-field [label]="'risk.fields.threat' | transloco" inputId="risk-threat">
                <textarea
                  id="risk-threat"
                  rows="2"
                  [value]="form().threat"
                  (input)="set('threat', $any($event.target).value)"
                ></textarea>
                <app-field-help scope="risk" page="form" field="threat" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.vulnerability' | transloco"
                inputId="risk-vulnerability"
              >
                <textarea
                  id="risk-vulnerability"
                  rows="2"
                  [value]="form().vulnerability"
                  (input)="set('vulnerability', $any($event.target).value)"
                ></textarea>
                <app-field-help scope="risk" page="form" field="vulnerability" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.consequence' | transloco"
                inputId="risk-consequence"
              >
                <textarea
                  id="risk-consequence"
                  rows="2"
                  [value]="form().consequence_text"
                  (input)="set('consequence_text', $any($event.target).value)"
                ></textarea>
                <app-field-help scope="risk" page="form" field="consequence" />
              </app-form-field>
              <fieldset>
                <legend
                  class="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted"
                >
                  {{ 'risk.fields.affectedProperties' | transloco }}
                  <app-field-help scope="risk" page="form" field="cia" />
                </legend>
                <div class="flex flex-wrap gap-4">
                  @for (p of properties; track p) {
                    <label class="inline-flex items-center gap-1.5 text-[13px] text-fg">
                      <input
                        type="checkbox"
                        [checked]="form().affected_properties.includes(p)"
                        (change)="toggleProperty(p, $any($event.target).checked)"
                      />
                      {{ 'risk.properties.' + p | transloco }}
                    </label>
                  }
                </div>
              </fieldset>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
              {{ 'risk.form.sections.inherent' | transloco }}
              <app-ask-about [prompt]="'risk.ask.inherent' | transloco" field="inherent" />
            </h2>
            <app-field-help class="mb-3" scope="risk" page="form" field="inherent" />
            @if (matrix(); as m) {
              <app-rating-picker
                [matrix]="m"
                [legend]="'risk.form.inherentLegend' | transloco"
                [value]="form().inherent"
                (changed)="set('inherent', $event)"
              />
            } @else {
              <p class="text-[13px] text-fg-muted">{{ 'risk.form.noMatrix' | transloco }}</p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.form.sections.treatment' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4">
              <app-form-field [label]="'risk.fields.strategy' | transloco" inputId="risk-strategy">
                <select
                  id="risk-strategy"
                  (change)="set('treatment_strategy', $any($event.target).value)"
                >
                  <option value="" [selected]="!form().treatment_strategy">
                    {{ 'risk.common.notDecided' | transloco }}
                  </option>
                  @for (s of strategies; track s) {
                    <option [value]="s" [selected]="s === form().treatment_strategy">
                      {{ 'risk.strategies.' + s | transloco }}
                    </option>
                  }
                </select>
                <app-field-help scope="risk" page="form" field="strategy" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.treatmentNotes' | transloco"
                inputId="risk-treatment-notes"
              >
                <textarea
                  id="risk-treatment-notes"
                  rows="2"
                  [value]="form().treatment_notes"
                  (input)="set('treatment_notes', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.controlRefs' | transloco"
                inputId="risk-controls"
              >
                <input
                  id="risk-controls"
                  [value]="form().control_refs"
                  [placeholder]="'risk.form.controlRefsPlaceholder' | transloco"
                  (input)="set('control_refs', $any($event.target).value)"
                />
                <app-field-help scope="risk" page="form" field="controls" />
              </app-form-field>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.form.sections.residual' | transloco }}
            </h2>
            <app-field-help class="mb-3" scope="risk" page="form" field="residual" />
            @if (matrix(); as m) {
              <app-rating-picker
                [matrix]="m"
                [legend]="'risk.form.residualLegend' | transloco"
                [value]="form().residual"
                [secondary]="inherentCell()"
                (changed)="set('residual', $event)"
              />
              @if (inherentCell()) {
                <p class="mt-2 text-[12px] text-fg-subtle">
                  {{ 'risk.form.inherentMarker' | transloco }}
                </p>
              }
            } @else {
              <p class="text-[13px] text-fg-muted">{{ 'risk.form.noMatrix' | transloco }}</p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'risk.form.sections.ownership' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field [label]="'risk.fields.owner' | transloco" inputId="risk-owner">
                <app-person-select
                  inputId="risk-owner"
                  [value]="form().owner_user_id"
                  [currentName]="original()?.owner?.name ?? null"
                  (valueChange)="set('owner_user_id', $event)"
                />
                <app-field-help scope="risk" page="form" field="owner" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.department' | transloco"
                inputId="risk-department"
              >
                <app-person-select
                  kind="department"
                  inputId="risk-department"
                  [value]="form().department_id"
                  [currentName]="original()?.department?.name ?? null"
                  (valueChange)="set('department_id', $event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.reviewInterval' | transloco"
                inputId="risk-interval"
              >
                <input
                  id="risk-interval"
                  type="number"
                  min="1"
                  max="60"
                  [value]="form().review_interval_months"
                  [placeholder]="'risk.form.intervalPlaceholder' | transloco"
                  (input)="set('review_interval_months', $any($event.target).value)"
                />
                <app-field-help scope="risk" page="form" field="review" />
              </app-form-field>
              <app-form-field
                [label]="'risk.fields.nextReview' | transloco"
                inputId="risk-next-review"
              >
                <input
                  id="risk-next-review"
                  type="date"
                  [value]="form().next_review_at"
                  (input)="set('next_review_at', $any($event.target).value)"
                />
              </app-form-field>
            </div>
            @if (id()) {
              <div class="mt-4">
                <app-form-field
                  [label]="'risk.fields.changeReason' | transloco"
                  inputId="risk-change-reason"
                >
                  <input
                    id="risk-change-reason"
                    maxlength="2000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                @if (original()?.acceptance) {
                  <p class="mt-2 text-[12.5px] text-warn">
                    {{ 'risk.form.acceptanceWarning' | transloco }}
                  </p>
                }
              </div>
            }
          </app-card>

          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" (click)="cancel()">{{
              'risk.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'risk.common.save' : 'risk.form.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class RiskFormPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly perms = inject(RiskPermissions);

  /** Route param (edit mode); absent on `risks/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly sourceTypes = SOURCE_TYPES;
  protected readonly strategies = STRATEGIES;
  protected readonly properties = CIA_PROPERTIES;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly matrices = signal<readonly Matrix[]>([]);
  protected readonly original = signal<Risk | null>(null);
  private originalForm: RiskFormValue = emptyRiskForm();
  protected readonly form = signal<RiskFormValue>(emptyRiskForm());
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly threats = signal<readonly ThreatSuggestion[]>([]);
  private sub: Subscription | null = null;

  protected readonly activeRegisters = computed(() =>
    this.registers().filter((r) => r.status === 'active' || r.id === this.form().register_id),
  );

  /** The matrix of the chosen register (else the org default). */
  protected readonly matrix = computed<Matrix | null>(() => {
    const register = this.registers().find((r) => r.id === this.form().register_id);
    const matrices = this.matrices();
    const id = register?.matrix_id ?? this.original()?.matrix_id;
    return (
      matrices.find((m) => m.id === id) ??
      (register ? null : (matrices.find((m) => m.is_default) ?? null))
    );
  });

  protected readonly inherentCell = computed(() => {
    const { likelihood, consequence } = this.form().inherent;
    return likelihood !== null && consequence !== null ? { likelihood, consequence } : null;
  });

  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());

  protected readonly threatInput = computed(() => {
    const f = this.form();
    const register = this.registers().find((r) => r.id === f.register_id);
    return {
      title: f.title,
      description: f.description,
      source_type: f.source_type,
      source_ref: f.source_ref,
      category: register?.category ?? '',
    };
  });

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? this.language.translate('risk.form.newTitle'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = forkJoin({
      registers: this.api.listRegisters(orgId),
      matrices: this.api.listMatrices(orgId),
      risk: id ? this.api.getRisk(orgId, id) : of(null),
    }).subscribe({
      next: ({ registers, matrices, risk }) => {
        this.registers.set(registers.items);
        this.matrices.set(matrices.items);
        this.original.set(risk);
        const defaultRegister =
          registers.items.find((r) => r.is_default && r.status === 'active') ??
          registers.items.find((r) => r.status === 'active');
        this.originalForm = risk ? riskToForm(risk) : emptyRiskForm(defaultRegister?.id ?? '');
        this.form.set(this.originalForm);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected set<K extends keyof RiskFormValue>(key: K, value: RiskFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setRegister(id: string): void {
    const before = this.matrix();
    this.set('register_id', id);
    if (before?.id !== this.matrix()?.id) {
      // Ratings belong to a matrix; a different scale means re-rating.
      this.form.update((f) => ({ ...f, inherent: EMPTY_RATING, residual: EMPTY_RATING }));
    }
  }

  protected toggleProperty(property: CiaProperty, checked: boolean): void {
    this.form.update((f) => ({
      ...f,
      affected_properties: checked
        ? [...new Set([...f.affected_properties, property])]
        : f.affected_properties.filter((p) => p !== property),
    }));
  }

  protected onThreats(result: unknown): void {
    const threats = (result as { threats?: ThreatSuggestion[] } | null)?.threats ?? [];
    this.threats.set(threats.filter((t) => t && typeof t.threat === 'string'));
  }

  protected useThreat(t: ThreatSuggestion): void {
    this.form.update((f) => ({
      ...f,
      threat: t.threat,
      vulnerability: t.vulnerability ?? f.vulnerability,
      consequence_text: t.consequence ?? f.consequence_text,
    }));
    this.threats.set([]);
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/risk/risks', id] : ['/risk/risks']);
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.perms.orgId();
    const value = this.form();
    if (!orgId || !value.title.trim()) {
      this.errorKey.set(value.title.trim() ? null : 'risk.errors.title_required');
      return;
    }
    const id = this.id();
    this.saving.set(true);
    this.errorKey.set(null);
    const request = id
      ? this.api.updateRisk(orgId, id, toRiskUpdate(this.originalForm, value, this.changeReason()))
      : this.api.createRisk(orgId, toRiskCreate(value));
    request.subscribe({
      next: (risk) => {
        this.saving.set(false);
        this.toasts.success(id ? 'risk.notices.saved' : 'risk.notices.created', {
          code: risk.code,
        });
        void this.router.navigate(['/risk/risks', risk.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }
}
