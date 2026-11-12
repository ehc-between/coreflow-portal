import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, parseIntOrNull } from '../data/continuity-display';
import {
  BiaListItem,
  PLAN_TEXT_FIELDS,
  PLAN_TYPES,
  PlanDetail,
  PlanDraftResult,
  PlanFields,
  PlanStep,
  PlanTextField,
  PlanType,
  STEP_PHASES,
  StepPhase,
} from '../data/continuity.models';
import { ContinuityDuration, ContinuityDurationInput } from '../shared/duration';
import { ContinuityDepartmentSelect, ContinuityUserSelect } from '../shared/user-select';

export interface StepDraft {
  phase: StepPhase;
  title: string;
  description: string;
  owner_role: string;
  target_minutes: number | null;
}

export interface PlanDraft {
  title: string;
  plan_type: PlanType;
  location: string;
  texts: Record<PlanTextField, string>;
  owner_user_id: string;
  department_id: string;
  review_interval_months: string;
  steps: StepDraft[];
  bia_ids: string[];
}

export function planDraft(p: PlanDetail | null, biaIds: readonly string[] = []): PlanDraft {
  return {
    title: p?.title ?? '',
    plan_type: p?.plan_type ?? 'business_continuity',
    location: p?.location ?? '',
    texts: Object.fromEntries(PLAN_TEXT_FIELDS.map((f) => [f, p?.[f] ?? ''])) as Record<
      PlanTextField,
      string
    >,
    owner_user_id: p?.owner?.id ?? '',
    department_id: p?.department_id ?? '',
    review_interval_months: p ? String(p.review_interval_months) : '12',
    steps: (p?.steps ?? []).map((s) => ({
      phase: s.phase,
      title: s.title,
      description: s.description ?? '',
      owner_role: s.owner_role ?? '',
      target_minutes: s.target_minutes,
    })),
    bia_ids: p ? p.bias.map((b) => b.id) : [...biaIds],
  };
}

export function planFields(d: PlanDraft): PlanFields {
  const interval = parseIntOrNull(d.review_interval_months);
  const texts = Object.fromEntries(
    PLAN_TEXT_FIELDS.map((f) => [f, blankToNull(d.texts[f])]),
  ) as Record<PlanTextField, string | null>;
  return {
    title: d.title.trim(),
    plan_type: d.plan_type,
    location: blankToNull(d.location),
    ...texts,
    owner_user_id: d.owner_user_id || null,
    department_id: d.department_id || null,
    review_interval_months: interval !== null && Number.isFinite(interval) ? interval : null,
    steps: d.steps.map(
      (s): PlanStep => ({
        phase: s.phase,
        title: s.title.trim(),
        description: blankToNull(s.description),
        owner_role: blankToNull(s.owner_role),
        target_minutes: s.target_minutes,
      }),
    ),
    bia_ids: [...d.bia_ids].sort(),
  };
}

export function planProblems(d: PlanDraft): string[] {
  const problems: string[] = [];
  if (!d.title.trim()) {
    problems.push('titleRequired');
  }
  const interval = parseIntOrNull(d.review_interval_months);
  if (interval !== null && (!Number.isFinite(interval) || interval < 1 || interval > 120)) {
    problems.push('interval');
  }
  if (d.steps.some((s) => !s.title.trim())) {
    problems.push('stepTitle');
  }
  return problems;
}

/** Fill a draft from the assistant's plan draft: empty fields only, steps appended. */
export function applyPlanDraft(d: PlanDraft, r: PlanDraftResult): PlanDraft {
  const texts = { ...d.texts };
  for (const f of PLAN_TEXT_FIELDS) {
    const v = r[f];
    if (typeof v === 'string' && v.trim() && !texts[f].trim()) {
      texts[f] = v;
    }
  }
  const steps = (r.steps ?? [])
    .filter((s) => !!s.title?.trim())
    .map(
      (s): StepDraft => ({
        phase: (STEP_PHASES as readonly string[]).includes(s.phase ?? '')
          ? (s.phase as StepPhase)
          : 'response',
        title: s.title!.trim(),
        description: s.description ?? '',
        owner_role: s.owner_role ?? '',
        target_minutes:
          typeof s.target_minutes === 'number' && s.target_minutes >= 0
            ? Math.round(s.target_minutes)
            : null,
      }),
    );
  return {
    ...d,
    title: d.title.trim() ? d.title : (r.title ?? '').trim(),
    plan_type:
      r.plan_type && (PLAN_TYPES as readonly string[]).includes(r.plan_type)
        ? r.plan_type
        : d.plan_type,
    texts,
    steps: [...d.steps, ...steps].slice(0, 100),
  };
}

export interface PlanFormValue {
  readonly fields: PlanFields;
  readonly changeReason: string | null;
}

/**
 * Create / edit form of a continuity plan: what it covers (type, location, the BIAs
 * whose recovery targets it must meet), the plan sections (scope, objectives,
 * activation criteria, roles, recovery strategy, communication, resources) and the
 * phased steps. The assistant drafts the sections and steps from the chosen BIAs.
 */
@Component({
  selector: 'app-plan-form',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    Alert,
    AskAbout,
    Button,
    Card,
    ContinuityDepartmentSelect,
    ContinuityDuration,
    ContinuityDurationInput,
    ContinuityUserSelect,
    FieldHelp,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
          {{ 'continuity.form.sections.plan' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'continuity.fields.title' | transloco" inputId="plan-title">
              <input
                id="plan-title"
                type="text"
                maxlength="255"
                required
                [attr.aria-invalid]="showErrors() && !d().title.trim()"
                [value]="d().title"
                (input)="set('title', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && !d().title.trim()) {
              <p class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'continuity.form.errors.titleRequired' | transloco }}
              </p>
            }
          </div>
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="continuity" page="planForm" field="plan_type" />
            </div>
            <app-form-field [label]="'continuity.fields.planType' | transloco" inputId="plan-type">
              <select id="plan-type" (change)="set('plan_type', $any($event.target).value)">
                @for (t of types; track t) {
                  <option [value]="t" [selected]="d().plan_type === t">
                    {{ 'continuity.planType.' + t | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field [label]="'continuity.fields.location' | transloco" inputId="plan-loc">
            <input
              id="plan-loc"
              type="text"
              maxlength="255"
              [value]="d().location"
              (input)="set('location', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.fields.owner' | transloco" inputId="plan-owner">
            <app-continuity-user-select
              inputId="plan-owner"
              [value]="d().owner_user_id"
              [currentName]="value()?.owner?.name ?? null"
              (valueChange)="set('owner_user_id', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.fields.department' | transloco" inputId="plan-dept">
            <app-continuity-department-select
              inputId="plan-dept"
              [value]="d().department_id"
              (valueChange)="set('department_id', $event)"
            />
          </app-form-field>
          <div>
            <app-form-field
              [label]="'continuity.fields.reviewInterval' | transloco"
              inputId="plan-interval"
            >
              <input
                id="plan-interval"
                type="number"
                min="1"
                max="120"
                [value]="d().review_interval_months"
                (input)="set('review_interval_months', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && problems().includes('interval')) {
              <p class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'continuity.form.errors.interval' | transloco }}
              </p>
            }
          </div>
        </div>
      </app-card>

      <app-card>
        <div class="mb-1 flex items-center gap-1">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'continuity.form.sections.coverage' | transloco }}
          </h2>
          <app-field-help scope="continuity" page="planForm" field="bia_ids" />
        </div>
        <p class="mb-3 text-[12.5px] text-fg-subtle">
          {{ 'continuity.form.coverageHint' | transloco }}
        </p>
        @if (bias().length === 0) {
          <p class="text-[13px] text-fg-muted">{{ 'continuity.form.noBias' | transloco }}</p>
        } @else {
          <fieldset>
            <legend class="sr-only">{{ 'continuity.form.sections.coverage' | transloco }}</legend>
            <ul class="grid max-h-[300px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              @for (b of bias(); track b.id) {
                <li>
                  <label
                    class="flex cursor-pointer items-start gap-2 rounded-tile border border-border px-3 py-2 text-[13px] hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5 h-4 w-4"
                      [checked]="d().bia_ids.includes(b.id)"
                      (change)="toggleBia(b.id, $any($event.target).checked)"
                    />
                    <span class="min-w-0">
                      <span class="block text-fg">
                        <span class="font-mono text-[12px] text-fg-muted">{{ b.code }}</span>
                        {{ b.title }}
                      </span>
                      <span class="block text-[12px] text-fg-subtle">
                        {{ 'continuity.fields.rtoShort' | transloco }}:
                        <app-continuity-duration [minutes]="b.rto_minutes" />
                        · {{ 'continuity.status.' + b.status | transloco }}
                      </span>
                    </span>
                  </label>
                </li>
              }
            </ul>
          </fieldset>
        }
      </app-card>

      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'continuity.form.sections.content' | transloco }}
          </h2>
          <app-ai-assist-button
            assist="continuity.draft_plan"
            labelKey="continuity.ai.draftPlan"
            [input]="{
              bia_ids: d().bia_ids,
              plan_type: d().plan_type,
              notes: d().title || null,
            }"
            [entityType]="value() ? 'continuity_plan' : null"
            [entityId]="value()?.id ?? null"
            [disabled]="!value() && d().bia_ids.length === 0"
            (result)="applyDraft($event)"
          />
        </div>
        @if (!value() && d().bia_ids.length === 0) {
          <p class="mb-3 text-[12.5px] text-fg-subtle">
            {{ 'continuity.ai.draftNeedsBia' | transloco }}
          </p>
        }
        @if (assumptions().length) {
          <div class="mb-3">
            <app-alert tone="info">
              <span class="font-semibold">{{ 'continuity.ai.assumptions' | transloco }}</span>
              <ul class="mt-1 list-disc pl-5">
                @for (a of assumptions(); track $index) {
                  <li>{{ a }}</li>
                }
              </ul>
              @if (contactRoles().length) {
                <p class="mt-2">
                  {{
                    'continuity.ai.contactRoles' | transloco: { roles: contactRoles().join(', ') }
                  }}
                </p>
              }
            </app-alert>
          </div>
        }
        <div class="flex flex-col gap-4">
          @for (f of textFields; track f) {
            <div>
              <div class="flex items-center gap-1">
                <app-field-help scope="continuity" page="planForm" [field]="f" />
                @if (f === 'activation_criteria') {
                  <app-ask-about
                    [prompt]="'continuity.ai.prompts.activation' | transloco"
                    field="activation_criteria"
                  />
                }
              </div>
              <app-form-field
                [label]="'continuity.planText.' + f | transloco"
                [inputId]="'plan-' + f"
              >
                <textarea
                  [id]="'plan-' + f"
                  rows="4"
                  maxlength="20000"
                  [value]="d().texts[f]"
                  (input)="setText(f, $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          }
        </div>
      </app-card>

      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            <h2 class="font-display text-[15px] font-bold text-fg">
              {{ 'continuity.form.sections.steps' | transloco }}
            </h2>
            <app-field-help scope="continuity" page="planForm" field="steps" />
          </div>
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="d().steps.length >= 100"
            (click)="addStep()"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.form.addStep' | transloco }}
          </app-button>
        </div>
        @if (d().steps.length === 0) {
          <p class="text-[13px] text-fg-muted">{{ 'continuity.form.noSteps' | transloco }}</p>
        }
        <ol class="flex flex-col gap-3">
          @for (
            s of d().steps;
            track $index;
            let i = $index;
            let first = $first;
            let last = $last
          ) {
            <li class="rounded-tile border border-border p-3">
              <fieldset class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <legend class="mb-1 text-[12.5px] font-semibold text-fg-muted">
                  {{ 'continuity.form.stepN' | transloco: { n: i + 1 } }}
                </legend>
                <app-form-field
                  [label]="'continuity.fields.phase' | transloco"
                  [inputId]="'plan-step-phase-' + i"
                >
                  <select
                    [id]="'plan-step-phase-' + i"
                    (change)="setStep(i, 'phase', $any($event.target).value)"
                  >
                    @for (p of phases; track p) {
                      <option [value]="p" [selected]="s.phase === p">
                        {{ 'continuity.phase.' + p | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-form-field
                  [label]="'continuity.fields.stepTitle' | transloco"
                  [inputId]="'plan-step-title-' + i"
                >
                  <input
                    [id]="'plan-step-title-' + i"
                    type="text"
                    maxlength="255"
                    [attr.aria-invalid]="showErrors() && !s.title.trim()"
                    [value]="s.title"
                    (input)="setStep(i, 'title', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'continuity.fields.ownerRole' | transloco"
                  [inputId]="'plan-step-role-' + i"
                >
                  <input
                    [id]="'plan-step-role-' + i"
                    type="text"
                    maxlength="255"
                    [value]="s.owner_role"
                    (input)="setStep(i, 'owner_role', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'continuity.fields.targetTime' | transloco"
                  [inputId]="'plan-step-target-' + i"
                >
                  <app-continuity-duration-input
                    [inputId]="'plan-step-target-' + i"
                    [value]="s.target_minutes"
                    (valueChange)="setStep(i, 'target_minutes', $event)"
                  />
                </app-form-field>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'continuity.fields.stepDescription' | transloco"
                    [inputId]="'plan-step-desc-' + i"
                  >
                    <textarea
                      [id]="'plan-step-desc-' + i"
                      rows="2"
                      maxlength="5000"
                      [value]="s.description"
                      (input)="setStep(i, 'description', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div class="flex flex-wrap gap-1.5 sm:col-span-2">
                  <app-button
                    size="sm"
                    variant="ghost"
                    [disabled]="first"
                    (click)="moveStep(i, -1)"
                  >
                    {{ 'continuity.form.moveUp' | transloco }}
                  </app-button>
                  <app-button size="sm" variant="ghost" [disabled]="last" (click)="moveStep(i, 1)">
                    {{ 'continuity.form.moveDown' | transloco }}
                  </app-button>
                  <app-button size="sm" variant="ghost" (click)="removeStep(i)">
                    <app-icon name="trash" [size]="14" />
                    {{ 'continuity.form.removeStep' | transloco }}
                  </app-button>
                </div>
              </fieldset>
            </li>
          }
        </ol>
        @if (showErrors() && problems().includes('stepTitle')) {
          <p class="mt-2 text-[12px] text-fail" role="alert">
            {{ 'continuity.form.errors.stepTitle' | transloco }}
          </p>
        }
      </app-card>

      @if (value()) {
        <app-card>
          <app-form-field
            [label]="'continuity.form.changeReason' | transloco"
            inputId="plan-reason"
          >
            <textarea
              id="plan-reason"
              rows="2"
              maxlength="2000"
              aria-describedby="plan-reason-hint"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <p id="plan-reason-hint" class="mt-1 text-[12px] text-fg-subtle">
            {{ 'continuity.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      <div class="flex flex-wrap items-center justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (value() ? 'continuity.form.save' : 'continuity.plans.create') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class PlanForm {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The plan being edited (null = a new plan). */
  readonly value = input<PlanDetail | null>(null);
  /** BIAs preselected on a new plan (e.g. "create a plan for this BIA"). */
  readonly initialBiaIds = input<readonly string[]>([]);
  readonly busy = input(false);
  readonly submitted = output<PlanFormValue>();
  readonly cancelled = output<void>();

  protected readonly types = PLAN_TYPES;
  protected readonly phases = STEP_PHASES;
  protected readonly textFields = PLAN_TEXT_FIELDS;

  protected readonly d = signal<PlanDraft>(planDraft(null));
  protected readonly reason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly problems = computed(() => planProblems(this.d()));
  protected readonly bias = signal<readonly BiaListItem[]>([]);
  protected readonly assumptions = signal<readonly string[]>([]);
  protected readonly contactRoles = signal<readonly string[]>([]);

  private biaRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.biaRequest.unsubscribe());
    effect(() => {
      const value = this.value();
      const initial = this.initialBiaIds();
      untracked(() => this.d.set(planDraft(value, initial)));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.biaRequest.unsubscribe();
        if (!orgId) {
          return;
        }
        this.biaRequest = this.api
          .listBias(orgId, { status: ['draft', 'in_review', 'approved'], limit: 200, sort: 'code' })
          .subscribe({
            next: (page) => this.bias.set(page.items),
            error: () => this.bias.set([]),
          });
      });
    });
  }

  protected set<K extends keyof PlanDraft>(key: K, value: PlanDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected setText(field: PlanTextField, value: string): void {
    this.d.update((d) => ({ ...d, texts: { ...d.texts, [field]: value } }));
  }

  protected toggleBia(id: string, checked: boolean): void {
    this.d.update((d) => ({
      ...d,
      bia_ids: checked
        ? [...new Set([...d.bia_ids, id])]
        : d.bia_ids.filter((existing) => existing !== id),
    }));
  }

  protected addStep(): void {
    this.d.update((d) => ({
      ...d,
      steps: [
        ...d.steps,
        { phase: 'response', title: '', description: '', owner_role: '', target_minutes: null },
      ],
    }));
  }

  protected setStep<K extends keyof StepDraft>(index: number, key: K, value: StepDraft[K]): void {
    this.d.update((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    }));
  }

  protected moveStep(index: number, delta: -1 | 1): void {
    this.d.update((d) => {
      const steps = [...d.steps];
      const target = index + delta;
      if (target < 0 || target >= steps.length) {
        return d;
      }
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...d, steps };
    });
  }

  protected removeStep(index: number): void {
    this.d.update((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  }

  protected applyDraft(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const draft = result as PlanDraftResult;
    this.d.update((d) => applyPlanDraft(d, draft));
    this.assumptions.set((draft.assumptions ?? []).filter((a) => typeof a === 'string'));
    this.contactRoles.set((draft.contact_roles ?? []).filter((a) => typeof a === 'string'));
  }

  protected submit(): void {
    if (this.problems().length) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({
      fields: planFields(this.d()),
      changeReason: blankToNull(this.reason()),
    });
  }
}
