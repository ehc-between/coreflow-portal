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
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, todayIso } from '../data/continuity-display';
import {
  EXERCISE_TYPES,
  ExerciseCreate,
  ExerciseDetail,
  ExerciseScenarioResult,
  ExerciseType,
  ExerciseUpdate,
  IctListItem,
  OUTCOMES,
  Outcome,
  PlanListItem,
} from '../data/continuity.models';
import { ContinuityDurationInput } from '../shared/duration';
import { ContinuityUserSelect } from '../shared/user-select';

export interface ExerciseDraft {
  title: string;
  exercise_type: ExerciseType;
  plan_id: string;
  ict_system_id: string;
  owner_user_id: string;
  scheduled_on: string;
  scenario: string;
  objectives: string;
  participants: string;
  conducted_on: string;
  outcome: Outcome | '';
  achieved_recovery_minutes: number | null;
  results: string;
  lessons_learned: string;
}

export function exerciseDraft(
  e: ExerciseDetail | null,
  preset: { planId?: string; ictId?: string } = {},
): ExerciseDraft {
  return {
    title: e?.title ?? '',
    exercise_type: e?.exercise_type ?? (preset.ictId ? 'ict_recovery' : 'tabletop'),
    plan_id: e ? (e.plan?.id ?? '') : (preset.planId ?? ''),
    ict_system_id: e ? (e.ict_system?.id ?? '') : (preset.ictId ?? ''),
    owner_user_id: e?.owner?.id ?? '',
    scheduled_on: e?.scheduled_on ?? '',
    scenario: e?.scenario ?? '',
    objectives: e?.objectives ?? '',
    participants: e?.participants ?? '',
    conducted_on: e?.conducted_on ?? '',
    outcome: e?.outcome ?? '',
    achieved_recovery_minutes: e?.achieved_recovery_minutes ?? null,
    results: e?.results ?? '',
    lessons_learned: e?.lessons_learned ?? '',
  };
}

/** The planning fields of a draft (create, and edit while planned). */
export function exercisePlanning(d: ExerciseDraft): ExerciseCreate {
  return {
    title: d.title.trim(),
    exercise_type: d.exercise_type,
    plan_id: d.plan_id || null,
    ict_system_id: d.ict_system_id || null,
    owner_user_id: d.owner_user_id || null,
    scheduled_on: d.scheduled_on || null,
    scenario: blankToNull(d.scenario),
    objectives: blankToNull(d.objectives),
    participants: blankToNull(d.participants),
  };
}

/** The fields editable once completed: the texts and the results. */
export function exerciseResults(d: ExerciseDraft): ExerciseUpdate {
  return {
    title: d.title.trim(),
    scenario: blankToNull(d.scenario),
    objectives: blankToNull(d.objectives),
    participants: blankToNull(d.participants),
    conducted_on: d.conducted_on || null,
    outcome: d.outcome || null,
    achieved_recovery_minutes: d.achieved_recovery_minutes,
    results: blankToNull(d.results),
    lessons_learned: blankToNull(d.lessons_learned),
  };
}

/** Fill a draft from a generated scenario (empty fields only). */
export function applyScenario(
  d: ExerciseDraft,
  r: ExerciseScenarioResult,
  labels: { injects: string; successCriteria: string; atMinutes: (n: number) => string },
): ExerciseDraft {
  const lines = (items: readonly string[] | undefined) =>
    (items ?? []).filter((s) => typeof s === 'string' && s.trim()).map((s) => `- ${s.trim()}`);
  let scenario = (r.scenario ?? '').trim();
  const injects = (r.injects ?? [])
    .filter((i) => i.description?.trim())
    .map((i) => `- ${labels.atMinutes(i.at_minutes ?? 0)}: ${i.description!.trim()}`);
  if (injects.length) {
    scenario = `${scenario}\n\n${labels.injects}\n${injects.join('\n')}`.trim();
  }
  let objectives = (r.objectives ?? '').trim();
  const criteria = lines(r.success_criteria);
  if (criteria.length) {
    objectives = `${objectives}\n\n${labels.successCriteria}\n${criteria.join('\n')}`.trim();
  }
  const participants = (r.participants ?? []).filter((p) => p?.trim()).join(', ');
  return {
    ...d,
    title: d.title.trim() ? d.title : (r.title ?? '').trim(),
    exercise_type:
      r.exercise_type && (EXERCISE_TYPES as readonly string[]).includes(r.exercise_type)
        ? r.exercise_type
        : d.exercise_type,
    scenario: d.scenario.trim() ? d.scenario : scenario,
    objectives: d.objectives.trim() ? d.objectives : objectives,
    participants: d.participants.trim() ? d.participants : participants,
  };
}

export interface ExerciseFormValue {
  readonly draft: ExerciseDraft;
}

/**
 * Create / edit form of an exercise or test. While planned: what is exercised (a
 * plan and/or an ICT service), the type, owner, date, scenario, objectives and
 * participants; the assistant can write a scenario with injects for the chosen
 * plan. Once completed, the planning fields are locked and the results (date held,
 * outcome, achieved recovery time, results, lessons learned) become editable.
 */
@Component({
  selector: 'app-exercise-form',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    Button,
    Card,
    ContinuityDurationInput,
    ContinuityUserSelect,
    FieldHelp,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'continuity.form.sections.exercise' | transloco }}
          </h2>
          @if (!completed()) {
            <app-ai-assist-button
              assist="continuity.exercise_scenario"
              labelKey="continuity.ai.draftScenario"
              [input]="{
                plan_id: d().plan_id || null,
                exercise_type: d().exercise_type,
                notes: d().title || null,
              }"
              [disabled]="!d().plan_id"
              (result)="applyResult($event)"
            />
          }
        </div>
        @if (!completed() && !d().plan_id) {
          <p class="mb-3 text-[12.5px] text-fg-subtle">
            {{ 'continuity.ai.scenarioNeedsPlan' | transloco }}
          </p>
        }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'continuity.fields.title' | transloco" inputId="ex-title">
              <input
                id="ex-title"
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
              <app-field-help scope="continuity" page="exerciseForm" field="exercise_type" />
            </div>
            <app-form-field
              [label]="'continuity.fields.exerciseType' | transloco"
              inputId="ex-type"
            >
              <select
                id="ex-type"
                [disabled]="completed()"
                (change)="set('exercise_type', $any($event.target).value)"
              >
                @for (t of types; track t) {
                  <option [value]="t" [selected]="d().exercise_type === t">
                    {{ 'continuity.exerciseType.' + t | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field [label]="'continuity.fields.scheduledOn' | transloco" inputId="ex-date">
            <input
              id="ex-date"
              type="date"
              [disabled]="completed()"
              [value]="d().scheduled_on"
              (input)="set('scheduled_on', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.fields.plan' | transloco" inputId="ex-plan">
            <select
              id="ex-plan"
              [disabled]="completed()"
              (change)="set('plan_id', $any($event.target).value)"
            >
              <option value="" [selected]="!d().plan_id">
                {{ 'continuity.form.noPlan' | transloco }}
              </option>
              @if (orphanPlan(); as p) {
                <option [value]="p.id" selected>{{ p.code }} {{ p.title }}</option>
              }
              @for (p of plans(); track p.id) {
                <option [value]="p.id" [selected]="d().plan_id === p.id">
                  {{ p.code }} {{ p.title }}
                </option>
              }
            </select>
          </app-form-field>
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="continuity" page="exerciseForm" field="ict_system_id" />
            </div>
            <app-form-field [label]="'continuity.fields.ictSystem' | transloco" inputId="ex-ict">
              <select
                id="ex-ict"
                [disabled]="completed()"
                (change)="set('ict_system_id', $any($event.target).value)"
              >
                <option value="" [selected]="!d().ict_system_id">
                  {{ 'continuity.form.noIctSystem' | transloco }}
                </option>
                @if (orphanIct(); as s) {
                  <option [value]="s.id" selected>{{ s.code }} {{ s.name }}</option>
                }
                @for (s of systems(); track s.id) {
                  <option [value]="s.id" [selected]="d().ict_system_id === s.id">
                    {{ s.code }} {{ s.name }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field [label]="'continuity.fields.owner' | transloco" inputId="ex-owner">
            <app-continuity-user-select
              inputId="ex-owner"
              [disabled]="completed()"
              [value]="d().owner_user_id"
              [currentName]="value()?.owner?.name ?? null"
              (valueChange)="set('owner_user_id', $event)"
            />
          </app-form-field>
          <app-form-field
            [label]="'continuity.fields.participants' | transloco"
            inputId="ex-participants"
          >
            <input
              id="ex-participants"
              type="text"
              maxlength="5000"
              [value]="d().participants"
              (input)="set('participants', $any($event.target).value)"
            />
          </app-form-field>
          <div class="sm:col-span-2">
            <div class="flex items-center gap-1">
              <app-field-help scope="continuity" page="exerciseForm" field="scenario" />
            </div>
            <app-form-field
              [label]="'continuity.fields.scenario' | transloco"
              inputId="ex-scenario"
            >
              <textarea
                id="ex-scenario"
                rows="5"
                maxlength="20000"
                [value]="d().scenario"
                (input)="set('scenario', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'continuity.fields.objectives' | transloco"
              inputId="ex-objectives"
            >
              <textarea
                id="ex-objectives"
                rows="4"
                maxlength="20000"
                [value]="d().objectives"
                (input)="set('objectives', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
        </div>
      </app-card>

      @if (completed()) {
        <app-card>
          <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
            {{ 'continuity.exercises.results' | transloco }}
          </h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <app-form-field
              [label]="'continuity.fields.conductedOn' | transloco"
              inputId="ex-conducted"
            >
              <input
                id="ex-conducted"
                type="date"
                [max]="today"
                [value]="d().conducted_on"
                (input)="set('conducted_on', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field [label]="'continuity.fields.outcome' | transloco" inputId="ex-outcome">
              <select id="ex-outcome" (change)="set('outcome', $any($event.target).value)">
                @for (o of outcomes; track o) {
                  <option [value]="o" [selected]="d().outcome === o">
                    {{ 'continuity.outcome.' + o | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              [label]="'continuity.fields.achievedRecovery' | transloco"
              inputId="ex-achieved"
            >
              <app-continuity-duration-input
                inputId="ex-achieved"
                [value]="d().achieved_recovery_minutes"
                (valueChange)="set('achieved_recovery_minutes', $event)"
              />
            </app-form-field>
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'continuity.fields.results' | transloco"
                inputId="ex-results"
              >
                <textarea
                  id="ex-results"
                  rows="4"
                  maxlength="20000"
                  [value]="d().results"
                  (input)="set('results', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'continuity.fields.lessonsLearned' | transloco"
                inputId="ex-lessons"
              >
                <textarea
                  id="ex-lessons"
                  rows="4"
                  maxlength="20000"
                  [value]="d().lessons_learned"
                  (input)="set('lessons_learned', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </div>
        </app-card>
      }

      <div class="flex flex-wrap items-center justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (value() ? 'continuity.form.save' : 'continuity.exercises.create') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class ExerciseForm {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly value = input<ExerciseDetail | null>(null);
  readonly presetPlanId = input<string | undefined>(undefined);
  readonly presetIctId = input<string | undefined>(undefined);
  readonly busy = input(false);
  readonly submitted = output<ExerciseFormValue>();
  readonly cancelled = output<void>();

  protected readonly types = EXERCISE_TYPES;
  protected readonly outcomes = OUTCOMES;
  protected readonly today = todayIso();

  protected readonly d = signal<ExerciseDraft>(exerciseDraft(null));
  protected readonly showErrors = signal(false);
  protected readonly completed = computed(() => this.value()?.status === 'completed');
  protected readonly plans = signal<readonly PlanListItem[]>([]);
  protected readonly systems = signal<readonly IctListItem[]>([]);

  /** The current plan / ICT service when it is not in the pick lists (e.g. retired). */
  protected readonly orphanPlan = computed(() => {
    const plan = this.value()?.plan;
    return plan && !this.plans().some((p) => p.id === plan.id) ? plan : null;
  });
  protected readonly orphanIct = computed(() => {
    const system = this.value()?.ict_system;
    return system && !this.systems().some((s) => s.id === system.id) ? system : null;
  });

  private requests = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.requests.unsubscribe());
    effect(() => {
      const value = this.value();
      const preset = { planId: this.presetPlanId(), ictId: this.presetIctId() };
      untracked(() => this.d.set(exerciseDraft(value, preset)));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.requests.unsubscribe();
        this.requests = new Subscription();
        if (!orgId) {
          return;
        }
        this.requests.add(
          this.api
            .listPlans(orgId, { status: ['draft', 'in_review', 'approved'], limit: 200 })
            .subscribe({
              next: (page) => this.plans.set(page.items),
              error: () => this.plans.set([]),
            }),
        );
        this.requests.add(
          this.api.listIct(orgId, { status: 'active', limit: 200 }).subscribe({
            next: (page) => this.systems.set(page.items),
            error: () => this.systems.set([]),
          }),
        );
      });
    });
  }

  protected set<K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected applyResult(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    this.d.update((d) =>
      applyScenario(d, result as ExerciseScenarioResult, {
        injects: t('continuity.ai.injects'),
        successCriteria: t('continuity.ai.successCriteria'),
        atMinutes: (n) => t('continuity.ai.atMinutes', { minutes: n }),
      }),
    );
  }

  protected submit(): void {
    if (!this.d().title.trim()) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({ draft: this.d() });
  }
}
