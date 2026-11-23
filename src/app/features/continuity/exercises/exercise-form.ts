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
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
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
import { ContinuityMemberPicker, ContinuityUserSelect } from '../shared/user-select';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';

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
  participant_user_ids: string[];
  target_recovery_minutes: number | null;
  success_criteria: string;
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
    participant_user_ids: [...(e?.participant_user_ids ?? [])],
    target_recovery_minutes: e?.target_recovery_minutes ?? null,
    success_criteria: e?.success_criteria ?? '',
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
    participant_user_ids: [...d.participant_user_ids],
    target_recovery_minutes: d.target_recovery_minutes,
    success_criteria: blankToNull(d.success_criteria),
  };
}

/** The fields editable once completed: the texts, who took part and the results. */
export function exerciseResults(d: ExerciseDraft): ExerciseUpdate {
  return {
    title: d.title.trim(),
    scenario: blankToNull(d.scenario),
    objectives: blankToNull(d.objectives),
    participants: blankToNull(d.participants),
    participant_user_ids: [...d.participant_user_ids],
    success_criteria: blankToNull(d.success_criteria),
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
  const objectives = (r.objectives ?? '').trim();
  const criteria = lines(r.success_criteria).join('\n');
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
    success_criteria: d.success_criteria.trim() ? d.success_criteria : criteria,
    participants: d.participants.trim() ? d.participants : participants,
  };
}

export interface ExerciseFormValue {
  readonly draft: ExerciseDraft;
}

/**
 * Create / edit form of an exercise or test. While planned: what is exercised (a
 * plan and/or an ICT service), the type, owner, date, the participants (org members,
 * plus others in free text), the target recovery time, the success criteria, the
 * scenario and objectives; the assistant can write a scenario with injects for the
 * chosen plan. Once completed, the planning fields are locked and the results (date
 * held, outcome, achieved recovery time, results, lessons learned) become editable;
 * participants and success criteria stay editable.
 */
@Component({
  selector: 'app-exercise-form',
  imports: [
    FormActions,
    FormSection,
    DateInput,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    Button,
    ContinuityDurationInput,
    ContinuityMemberPicker,
    ContinuityUserSelect,
    FieldHelp,
    FormField,
    LocalDayPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'continuity.form.sections.exercise' | transloco"
        [description]="'continuity.form.sections.exerciseHint' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'continuity.fields.title' | transloco"
          inputId="ex-title"
          [required]="true"
          [error]="
            showErrors() && !d().title.trim()
              ? ('continuity.form.errors.titleRequired' | transloco)
              : ''
          "
        >
          <input
            id="ex-title"
            type="text"
            maxlength="255"
            required
            [value]="d().title"
            (input)="set('title', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'continuity.fields.exerciseType' | transloco" inputId="ex-type">
          <app-field-help
            label-suffix
            scope="continuity"
            page="exerciseForm"
            field="exercise_type"
            [label]="'continuity.fields.exerciseType' | transloco"
          />
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
        <app-form-field
          [label]="'continuity.fields.scheduledOn' | transloco"
          inputId="ex-date"
          [hint]="d().scheduled_on ? (d().scheduled_on | localDay: 'longDate') : ''"
        >
          <app-date-input
            inputId="ex-date"
            [disabled]="completed()"
            [value]="d().scheduled_on"
            (valueChange)="set('scheduled_on', $event ?? '')"
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
        <app-form-field [label]="'continuity.fields.ictSystem' | transloco" inputId="ex-ict">
          <app-field-help
            label-suffix
            scope="continuity"
            page="exerciseForm"
            field="ict_system_id"
            [label]="'continuity.fields.ictSystem' | transloco"
          />
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
        <app-form-field [label]="'continuity.fields.owner' | transloco" inputId="ex-owner">
          <app-continuity-user-select
            inputId="ex-owner"
            [disabled]="completed()"
            [value]="d().owner_user_id"
            [currentName]="value()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
        </app-form-field>
        @if (!completed()) {
          <app-form-field
            [label]="'continuity.fields.targetRecovery' | transloco"
            inputId="ex-target"
            [hint]="'continuity.form.targetHint' | transloco"
          >
            <app-field-help
              label-suffix
              scope="continuity"
              page="exerciseForm"
              field="target_recovery_minutes"
              [label]="'continuity.fields.targetRecovery' | transloco"
            />
            <app-continuity-duration-input
              inputId="ex-target"
              [value]="d().target_recovery_minutes"
              describedBy="ex-target-hint"
              (valueChange)="set('target_recovery_minutes', $event)"
            />
          </app-form-field>
        }
      </app-form-section>

      <app-form-section
        [title]="'continuity.form.sections.scenario' | transloco"
        [description]="'continuity.form.sections.scenarioHint' | transloco"
      >
        @if (!completed()) {
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border border-accent-border bg-accent-soft px-3 py-2 sm:col-span-2"
          >
            <p class="min-w-0 flex-1 text-ui text-fg-muted" data-testid="scenario-hint">
              {{
                (d().plan_id
                  ? 'continuity.form.sections.scenarioAssist'
                  : 'continuity.ai.scenarioNeedsPlan'
                ) | transloco
              }}
            </p>
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
          </div>
        }
        <app-form-field
          span="full"
          [label]="'continuity.fields.scenario' | transloco"
          inputId="ex-scenario"
        >
          <app-field-help
            label-suffix
            scope="continuity"
            page="exerciseForm"
            field="scenario"
            [label]="'continuity.fields.scenario' | transloco"
          />
          <textarea
            id="ex-scenario"
            rows="5"
            maxlength="20000"
            [value]="d().scenario"
            (input)="set('scenario', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
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
        <app-form-field
          span="full"
          [label]="'continuity.fields.successCriteria' | transloco"
          inputId="ex-criteria"
        >
          <app-field-help
            label-suffix
            scope="continuity"
            page="exerciseForm"
            field="success_criteria"
            [label]="'continuity.fields.successCriteria' | transloco"
          />
          <app-ask-about
            label-suffix
            [prompt]="'continuity.ai.prompts.successCriteria' | transloco"
            field="success_criteria"
          />
          <textarea
            id="ex-criteria"
            rows="3"
            maxlength="20000"
            [value]="d().success_criteria"
            (input)="set('success_criteria', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.participantMembers' | transloco"
          inputId="ex-members"
          [hint]="'continuity.form.membersHint' | transloco"
        >
          <app-continuity-member-picker
            inputId="ex-members"
            [value]="d().participant_user_ids"
            [known]="value()?.participant_members ?? []"
            describedBy="ex-members-hint"
            (valueChange)="set('participant_user_ids', $event)"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.participantsOther' | transloco"
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
      </app-form-section>

      @if (completed()) {
        <app-form-section
          [title]="'continuity.exercises.results' | transloco"
          [description]="'continuity.form.sections.resultsHint' | transloco"
        >
          <app-form-field
            [label]="'continuity.fields.conductedOn' | transloco"
            inputId="ex-conducted"
            [hint]="d().conducted_on ? (d().conducted_on | localDay: 'longDate') : ''"
          >
            <app-date-input
              inputId="ex-conducted"
              [max]="today"
              [value]="d().conducted_on"
              (valueChange)="set('conducted_on', $event ?? '')"
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
          <app-form-field
            span="full"
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
          <app-form-field
            span="full"
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
        </app-form-section>
      }

      <app-form-actions>
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (value() ? 'continuity.form.save' : 'continuity.exercises.create') | transloco }}
        </app-button>
      </app-form-actions>
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
