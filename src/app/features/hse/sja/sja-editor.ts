import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  HazardSuggestion,
  PPE_CATEGORIES,
  PpeCategory,
  RISK_LEVELS,
  RelatedIn,
  RiskLevel,
  Sja,
  SjaFields,
  SjaStep,
} from '../data/hse.models';
import {
  linesToList,
  listToLines,
  localInputToWire,
  textOrNull,
  wireToLocalInput,
} from '../hse-format';
import { HSE_MODULE, HseDirectorySelect } from '../shared/hse-shared';

/** One editable step row (hazards / controls as one item per line). */
export interface StepDraft {
  readonly key: number;
  description: string;
  hazards: string;
  controls: string;
  responsible: string;
  risk_level: RiskLevel | '';
}

let nextStepKey = 0;

export function stepDraft(step?: Partial<SjaStep>): StepDraft {
  return {
    key: ++nextStepKey,
    description: step?.description ?? '',
    hazards: listToLines(step?.hazards),
    controls: listToLines(step?.controls),
    responsible: step?.responsible ?? '',
    risk_level: step?.risk_level ?? '',
  };
}

/** Editable rows -> wire steps (rows without a description are dropped). */
export function stepsFromDrafts(drafts: readonly StepDraft[]): SjaStep[] {
  return drafts
    .filter((d) => d.description.trim())
    .map((d) => ({
      description: d.description.trim(),
      hazards: linesToList(d.hazards),
      controls: linesToList(d.controls),
      responsible: textOrNull(d.responsible),
      risk_level: d.risk_level || null,
    }));
}

/**
 * Merge the assistant's hazard suggestions into the form: suggested steps are
 * appended (replacing a single blank row), suggested PPE is added to the selection.
 */
export function mergeSuggestions(
  drafts: readonly StepDraft[],
  ppe: readonly PpeCategory[],
  suggestion: HazardSuggestion,
): { steps: StepDraft[]; ppe: PpeCategory[] } {
  const kept = drafts.filter((d) => d.description.trim() || d.hazards.trim() || d.controls.trim());
  const added = (suggestion.steps ?? []).map((s) =>
    stepDraft({ ...s, risk_level: s.risk_level ?? null }),
  );
  const known = new Set<string>(PPE_CATEGORIES);
  const merged = [...ppe];
  for (const category of suggestion.required_ppe ?? []) {
    if (known.has(category) && !merged.includes(category)) {
      merged.push(category);
    }
  }
  return { steps: [...kept, ...added], ppe: merged };
}

/**
 * `/hse/sja/new` and `/hse/sja/:id/edit`: the safe job analysis form — the job,
 * period and people, the job steps with their hazards, controls and risk, the
 * required PPE and emergency measures. "Suggest hazards" asks the assistant to
 * break the task into steps with hazards and controls. Editing records a change
 * reason in the revision history. `?entity_type=&entity_id=` on "new" links the
 * new SJA to that record.
 */
@Component({
  selector: 'app-sja-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    FormField,
    Icon,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    AiAssistButton,
    AskAbout,
    HseDirectorySelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/hse/sja', id()] : '/hse/sja'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'hse.common.backToRecord' : 'hse.sja.list.back') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'hse.sja.edit.title' : 'hse.sja.edit.newTitle') | transloco }}
        @if (code()) {
          <span class="ml-2 font-mono text-[14px] font-semibold text-fg-subtle">{{ code() }}</span>
        }
      </h1>

      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <app-guide-intro scope="hse" page="sja-edit" />
        <app-why-it-matters scope="hse" page="sja-edit" />
      </div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
          {{ 'hse.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'hse.common.loadFailed' | transloco }}
        </p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          @if (related().length) {
            <p
              class="rounded-tile border border-accent-border bg-accent-soft/50 px-3 py-2 text-[13px] text-fg"
            >
              {{ 'hse.common.willLink' | transloco }}
            </p>
          }
          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'hse.sja.edit.jobSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field [label]="'hse.sja.fields.title' | transloco" inputId="sja-title">
                  <input
                    id="sja-title"
                    type="text"
                    required
                    maxlength="255"
                    autocomplete="off"
                    [value]="title()"
                    (input)="title.set($any($event.target).value)"
                    [attr.aria-invalid]="submitted() && !title().trim()"
                    aria-describedby="sja-title-error"
                  />
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="title" />
                @if (submitted() && !title().trim()) {
                  <p id="sja-title-error" class="mt-1 text-[12.5px] text-fail" role="alert">
                    {{ 'hse.errors.title_required' | transloco }}
                  </p>
                }
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'hse.sja.fields.job_description' | transloco"
                  inputId="sja-description"
                >
                  <textarea
                    id="sja-description"
                    rows="4"
                    [value]="jobDescription()"
                    (input)="jobDescription.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="job_description" />
              </div>
              <app-form-field
                [label]="'hse.sja.fields.location' | transloco"
                inputId="sja-location"
              >
                <input
                  id="sja-location"
                  type="text"
                  maxlength="200"
                  [value]="location()"
                  (input)="location.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field [label]="'hse.sja.fields.owner' | transloco" inputId="sja-owner">
                <app-hse-directory-select
                  inputId="sja-owner"
                  kind="user"
                  noneKey="hse.common.me"
                  [value]="ownerId()"
                  [currentName]="ownerName()"
                  (valueChange)="ownerId.set($event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.sja.fields.work_start_at' | transloco"
                inputId="sja-start"
              >
                <input
                  id="sja-start"
                  type="datetime-local"
                  [value]="workStart()"
                  (input)="workStart.set($any($event.target).value)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'hse.sja.fields.work_end_at' | transloco"
                  inputId="sja-end"
                >
                  <input
                    id="sja-end"
                    type="datetime-local"
                    [value]="workEnd()"
                    (input)="workEnd.set($any($event.target).value)"
                    [attr.aria-invalid]="periodInvalid()"
                  />
                </app-form-field>
                @if (periodInvalid()) {
                  <p class="mt-1 text-[12.5px] text-fail" role="alert">
                    {{ 'hse.errors.invalid_period' | transloco }}
                  </p>
                }
              </div>
              <app-form-field
                [label]="'hse.common.department' | transloco"
                inputId="sja-department"
              >
                <app-hse-directory-select
                  inputId="sja-department"
                  kind="department"
                  [value]="departmentId()"
                  (valueChange)="departmentId.set($event)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'hse.sja.fields.participants' | transloco"
                  inputId="sja-participants"
                >
                  <textarea
                    id="sja-participants"
                    rows="3"
                    [value]="participants()"
                    (input)="participants.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="participants" />
              </div>
            </div>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="flex items-center gap-2 font-display text-[16px] font-bold text-fg">
                {{ 'hse.sja.edit.stepsSection' | transloco }}
                <app-field-help scope="hse" page="sja-edit" field="steps" />
              </h2>
              <app-ai-assist-button
                assist="hse.suggest_hazards"
                labelKey="hse.sja.ai.suggest"
                [input]="assistInput()"
                [entityType]="id() ? 'sja' : null"
                [entityId]="id()"
                [disabled]="!title().trim() && !jobDescription().trim() && !id()"
                (result)="applySuggestions($event)"
              />
            </div>
            @if (aiNotes()) {
              <p
                class="mb-3 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted"
                role="status"
              >
                {{ aiNotes() }}
              </p>
            }
            <ol class="flex flex-col gap-3">
              @for (step of steps(); track step.key; let i = $index; let last = $last) {
                <li
                  class="rounded-tile border border-border p-3"
                  [attr.aria-label]="'hse.sja.edit.stepLabel' | transloco: { n: i + 1 }"
                >
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <span class="text-[12px] font-bold tracking-wide text-fg-subtle uppercase">
                      {{ 'hse.sja.edit.stepLabel' | transloco: { n: i + 1 } }}
                    </span>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                        [disabled]="i === 0"
                        [attr.aria-label]="'hse.sja.edit.moveUp' | transloco: { n: i + 1 }"
                        (click)="move(i, -1)"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        class="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                        [disabled]="last"
                        [attr.aria-label]="'hse.sja.edit.moveDown' | transloco: { n: i + 1 }"
                        (click)="move(i, 1)"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        class="rounded-[6px] p-1 text-fg-subtle hover:text-fail"
                        [attr.aria-label]="'hse.sja.edit.removeStep' | transloco: { n: i + 1 }"
                        (click)="removeStep(i)"
                      >
                        <app-icon name="trash" [size]="15" />
                      </button>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="sm:col-span-2">
                      <app-form-field
                        [label]="'hse.sja.fields.step_description' | transloco"
                        [inputId]="'step-desc-' + step.key"
                      >
                        <input
                          [id]="'step-desc-' + step.key"
                          type="text"
                          maxlength="1000"
                          [value]="step.description"
                          (input)="patchStep(i, 'description', $any($event.target).value)"
                        />
                      </app-form-field>
                    </div>
                    <div>
                      <app-form-field
                        [label]="'hse.sja.fields.hazards' | transloco"
                        [inputId]="'step-haz-' + step.key"
                      >
                        <textarea
                          [id]="'step-haz-' + step.key"
                          rows="3"
                          [value]="step.hazards"
                          (input)="patchStep(i, 'hazards', $any($event.target).value)"
                        ></textarea>
                      </app-form-field>
                      @if (i === 0) {
                        <app-field-help scope="hse" page="sja-edit" field="hazards" />
                      }
                    </div>
                    <div>
                      <app-form-field
                        [label]="'hse.sja.fields.controls' | transloco"
                        [inputId]="'step-ctl-' + step.key"
                      >
                        <textarea
                          [id]="'step-ctl-' + step.key"
                          rows="3"
                          [value]="step.controls"
                          (input)="patchStep(i, 'controls', $any($event.target).value)"
                        ></textarea>
                      </app-form-field>
                      @if (i === 0) {
                        <app-field-help scope="hse" page="sja-edit" field="controls" />
                      }
                    </div>
                    <app-form-field
                      [label]="'hse.sja.fields.responsible' | transloco"
                      [inputId]="'step-resp-' + step.key"
                    >
                      <input
                        [id]="'step-resp-' + step.key"
                        type="text"
                        maxlength="200"
                        [value]="step.responsible"
                        (input)="patchStep(i, 'responsible', $any($event.target).value)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'hse.sja.fields.step_risk' | transloco"
                      [inputId]="'step-risk-' + step.key"
                    >
                      <select
                        [id]="'step-risk-' + step.key"
                        [value]="step.risk_level"
                        (change)="patchStep(i, 'risk_level', $any($event.target).value)"
                      >
                        <option value="">{{ 'hse.risk.none' | transloco }}</option>
                        @for (level of riskLevels; track level) {
                          <option [value]="level" [selected]="level === step.risk_level">
                            {{ 'hse.risk.' + level | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                  </div>
                </li>
              }
            </ol>
            <div class="mt-3">
              <app-button variant="secondary" size="sm" (click)="addStep()">
                <app-icon name="plus" [size]="14" />
                {{ 'hse.sja.edit.addStep' | transloco }}
              </app-button>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'hse.sja.edit.riskSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'hse.sja.fields.risk_level' | transloco"
                  inputId="sja-risk"
                >
                  <select
                    id="sja-risk"
                    [value]="riskLevel()"
                    (change)="riskLevel.set($any($event.target).value)"
                  >
                    <option value="">{{ 'hse.risk.none' | transloco }}</option>
                    @for (level of riskLevels; track level) {
                      <option [value]="level" [selected]="level === riskLevel()">
                        {{ 'hse.risk.' + level | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="risk_level" />
              </div>
              <div>
                <app-form-field
                  [label]="'hse.sja.fields.residual_risk_level' | transloco"
                  inputId="sja-residual"
                >
                  <select
                    id="sja-residual"
                    [value]="residualRiskLevel()"
                    (change)="residualRiskLevel.set($any($event.target).value)"
                  >
                    <option value="">{{ 'hse.risk.none' | transloco }}</option>
                    @for (level of riskLevels; track level) {
                      <option [value]="level" [selected]="level === residualRiskLevel()">
                        {{ 'hse.risk.' + level | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="residual_risk_level" />
              </div>
              <fieldset class="sm:col-span-2">
                <legend
                  class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-fg-muted"
                >
                  {{ 'hse.sja.fields.required_ppe' | transloco }}
                  <app-field-help scope="hse" page="sja-edit" field="required_ppe" />
                </legend>
                <div class="flex flex-wrap gap-2">
                  @for (category of ppeCategories; track category) {
                    <label
                      class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold"
                      [class]="
                        ppe().includes(category)
                          ? 'border-accent-border bg-accent-soft text-accent'
                          : 'border-border text-fg-muted'
                      "
                    >
                      <input
                        type="checkbox"
                        class="h-3.5 w-3.5 accent-[var(--accent)]"
                        [checked]="ppe().includes(category)"
                        (change)="togglePpe(category)"
                      />
                      {{ 'hse.ppeCategory.' + category | transloco }}
                    </label>
                  }
                </div>
              </fieldset>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'hse.sja.fields.emergency_measures' | transloco"
                  inputId="sja-emergency"
                >
                  <textarea
                    id="sja-emergency"
                    rows="3"
                    [value]="emergency()"
                    (input)="emergency.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="hse" page="sja-edit" field="emergency_measures" />
              </div>
            </div>
          </app-card>

          @if (id()) {
            <app-card>
              <app-form-field [label]="'hse.common.changeReason' | transloco" inputId="sja-reason">
                <input
                  id="sja-reason"
                  type="text"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-form-field>
              <app-field-help scope="hse" page="sja-edit" field="change_reason" />
            </app-card>
          }

          <div class="flex flex-wrap items-center justify-end gap-2">
            <app-ask-about
              [prompt]="'hse.sja.ai.reviewPrompt' | transloco"
              labelKey="hse.sja.ai.review"
            />
            <a [routerLink]="id() ? ['/hse/sja', id()] : '/hse/sja'" tabindex="-1">
              <app-button variant="secondary">{{ 'hse.common.cancel' | transloco }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'hse.common.save' : 'hse.sja.edit.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class SjaEditor {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  protected readonly riskLevels = RISK_LEVELS;
  protected readonly ppeCategories = PPE_CATEGORIES;

  protected readonly id = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly state = signal<'loading' | 'ready' | 'error'>(this.id() ? 'loading' : 'ready');
  protected readonly code = signal('');

  protected readonly title = signal('');
  protected readonly jobDescription = signal('');
  protected readonly location = signal('');
  protected readonly workStart = signal('');
  protected readonly workEnd = signal('');
  protected readonly ownerId = signal('');
  protected readonly ownerName = signal<string | null>(null);
  protected readonly departmentId = signal('');
  protected readonly participants = signal('');
  protected readonly steps = signal<StepDraft[]>([stepDraft()]);
  protected readonly ppe = signal<PpeCategory[]>([]);
  protected readonly riskLevel = signal<RiskLevel | ''>('');
  protected readonly residualRiskLevel = signal<RiskLevel | ''>('');
  protected readonly emergency = signal('');
  protected readonly changeReason = signal('');
  protected readonly related = signal<RelatedIn[]>([]);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly aiNotes = signal<string | null>(null);

  protected readonly periodInvalid = computed(() => {
    const start = this.workStart();
    const end = this.workEnd();
    return !!start && !!end && end < start;
  });

  protected readonly assistInput = computed(() => ({
    task: [this.title().trim(), this.jobDescription().trim()].filter(Boolean).join('\n\n'),
    location: this.location().trim() || undefined,
  }));

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'sja',
      entityId: this.id(),
      view: this.id() ? 'edit' : 'new',
      title: this.title() || null,
    }));

    const params = this.route.snapshot.queryParamMap;
    const linkType = params.get('entity_type');
    const linkId = params.get('entity_id');
    if (!this.id() && linkType && linkId) {
      this.related.set([{ entity_type: linkType, entity_id: linkId, link_type: 'relates_to' }]);
    }

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.getSja(orgId, id).subscribe({
            next: (sja) => this.fill(sja),
            error: () => this.state.set('error'),
          }),
        );
      }
    });
  }

  private fill(sja: Sja): void {
    this.code.set(sja.code);
    this.title.set(sja.title);
    this.jobDescription.set(sja.job_description ?? '');
    this.location.set(sja.location ?? '');
    this.workStart.set(wireToLocalInput(sja.work_start_at));
    this.workEnd.set(wireToLocalInput(sja.work_end_at));
    this.ownerId.set(sja.owner?.id ?? '');
    this.ownerName.set(sja.owner?.name ?? null);
    this.departmentId.set(sja.department_id ?? '');
    this.participants.set(listToLines(sja.participants));
    this.steps.set(sja.steps.length ? sja.steps.map((s) => stepDraft(s)) : [stepDraft()]);
    this.ppe.set([...sja.required_ppe]);
    this.riskLevel.set(sja.risk_level ?? '');
    this.residualRiskLevel.set(sja.residual_risk_level ?? '');
    this.emergency.set(sja.emergency_measures ?? '');
    this.state.set('ready');
    if (!sja.can_edit || !['draft', 'in_review'].includes(sja.status)) {
      // Approved / closed SJAs are locked (409 `sja_locked`): back to the record.
      this.notifications.info('hse.errors.sja_locked');
      void this.router.navigate(['/hse/sja', sja.id]);
    }
  }

  protected addStep(): void {
    this.steps.update((steps) => [...steps, stepDraft()]);
  }

  protected removeStep(index: number): void {
    this.steps.update((steps) => {
      const next = steps.filter((_, i) => i !== index);
      return next.length ? next : [stepDraft()];
    });
  }

  protected move(index: number, delta: number): void {
    this.steps.update((steps) => {
      const target = index + delta;
      if (target < 0 || target >= steps.length) {
        return steps;
      }
      const next = [...steps];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  protected patchStep(index: number, field: keyof Omit<StepDraft, 'key'>, value: string): void {
    this.steps.update((steps) =>
      steps.map((step, i) => (i === index ? ({ ...step, [field]: value } as StepDraft) : step)),
    );
  }

  protected togglePpe(category: PpeCategory): void {
    this.ppe.update((list) =>
      list.includes(category) ? list.filter((c) => c !== category) : [...list, category],
    );
  }

  protected applySuggestions(data: unknown): void {
    const suggestion = data as HazardSuggestion | null;
    if (!suggestion || !Array.isArray(suggestion.steps)) {
      return;
    }
    const merged = mergeSuggestions(this.steps(), this.ppe(), suggestion);
    this.steps.set(merged.steps.length ? merged.steps : [stepDraft()]);
    this.ppe.set(merged.ppe);
    this.aiNotes.set(suggestion.notes || null);
    this.notifications.success('hse.sja.ai.applied', { count: suggestion.steps.length });
  }

  private fields(): SjaFields {
    return {
      title: this.title().trim(),
      job_description: textOrNull(this.jobDescription()),
      location: textOrNull(this.location()),
      work_start_at: localInputToWire(this.workStart()),
      work_end_at: localInputToWire(this.workEnd()),
      owner_user_id: this.ownerId() || null,
      department_id: this.departmentId() || null,
      participants: linesToList(this.participants()),
      steps: stepsFromDrafts(this.steps()),
      required_ppe: this.ppe(),
      risk_level: this.riskLevel() || null,
      residual_risk_level: this.residualRiskLevel() || null,
      emergency_measures: textOrNull(this.emergency()),
    };
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.periodInvalid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = this.id();
    const fields = this.fields();
    const request = id
      ? this.api.updateSja(orgId, id, {
          ...fields,
          // The caller stays the owner unless one is chosen.
          owner_user_id: fields.owner_user_id ?? undefined,
          change_reason: textOrNull(this.changeReason()),
        })
      : this.api.createSja(orgId, {
          ...fields,
          title: fields.title ?? '',
          owner_user_id: fields.owner_user_id ?? undefined,
          related: this.related().length ? this.related() : undefined,
        });
    request.subscribe({
      next: (sja) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.sja.created', {
          code: sja.code,
        });
        void this.router.navigate(['/hse/sja', sja.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
