import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { blankToNull, dayOrNull, dayToTimestamp, toDay } from '../data/asset-display';
import {
  CHANGE_CATEGORIES,
  CHANGE_TYPES,
  ChangeAssessmentSuggestion,
  ChangeCategory,
  ChangeDetail,
  ChangeFields,
  ChangeType,
  REVIEW_OUTCOMES,
  RISK_LEVELS,
  ReviewOutcome,
  RiskLevel,
} from '../data/asset.models';
import { AssetMultiSelect } from '../shared/asset-select';
import { AssetDepartmentSelect, AssetUserSelect } from '../shared/people-select';

/** The change's own fields plus the implementation / review fields (edit only). */
export interface ChangeFormFields extends ChangeFields {
  readonly implemented_at: string | null;
  readonly review_outcome: ReviewOutcome | null;
  readonly review_notes: string | null;
}

export interface ChangeFormValue {
  readonly fields: ChangeFormFields;
  readonly assetIds: readonly string[];
  readonly changeReason: string | null;
}

export interface ChangeDraft {
  title: string;
  change_type: ChangeType;
  category: ChangeCategory;
  description: string;
  reason: string;
  impact_assessment: string;
  risk_level: RiskLevel | '';
  risk_assessment: string;
  implementation_plan: string;
  rollback_plan: string;
  planned_start: string;
  planned_end: string;
  owner_user_id: string;
  department_id: string;
  implemented_at: string;
  review_outcome: ReviewOutcome | '';
  review_notes: string;
}

export function changeDraftFrom(c: ChangeDetail | null): ChangeDraft {
  return {
    title: c?.title ?? '',
    change_type: c?.change_type ?? 'normal',
    category: c?.category ?? 'other',
    description: c?.description ?? '',
    reason: c?.reason ?? '',
    impact_assessment: c?.impact_assessment ?? '',
    risk_level: c?.risk_level ?? '',
    risk_assessment: c?.risk_assessment ?? '',
    implementation_plan: c?.implementation_plan ?? '',
    rollback_plan: c?.rollback_plan ?? '',
    planned_start: c?.planned_start ?? '',
    planned_end: c?.planned_end ?? '',
    owner_user_id: c?.owner_user_id ?? '',
    department_id: c?.department_id ?? '',
    implemented_at: toDay(c?.implemented_at),
    review_outcome: c?.review_outcome ?? '',
    review_notes: c?.review_notes ?? '',
  };
}

export function changeFieldsFrom(d: ChangeDraft): ChangeFormFields {
  return {
    title: d.title.trim(),
    change_type: d.change_type,
    category: d.category,
    description: blankToNull(d.description),
    reason: blankToNull(d.reason),
    impact_assessment: blankToNull(d.impact_assessment),
    risk_level: d.risk_level || null,
    risk_assessment: blankToNull(d.risk_assessment),
    implementation_plan: blankToNull(d.implementation_plan),
    rollback_plan: blankToNull(d.rollback_plan),
    planned_start: dayOrNull(d.planned_start),
    planned_end: dayOrNull(d.planned_end),
    owner_user_id: d.owner_user_id || null,
    department_id: d.department_id || null,
    implemented_at: dayToTimestamp(d.implemented_at),
    review_outcome: d.review_outcome || null,
    review_notes: blankToNull(d.review_notes),
  };
}

/** Apply an impact / risk assessment suggestion to the empty assessment fields of a draft. */
export function applyAssessment(d: ChangeDraft, s: ChangeAssessmentSuggestion): ChangeDraft {
  const fill = (current: string, next: string | null | undefined) =>
    current.trim() ? current : (next ?? '').trim() || current;
  const risk = (RISK_LEVELS as readonly string[]).includes(s.risk_level)
    ? s.risk_level
    : d.risk_level;
  return {
    ...d,
    risk_level: risk,
    impact_assessment: fill(d.impact_assessment, s.impact_assessment),
    risk_assessment: fill(d.risk_assessment, s.risk_assessment),
    rollback_plan: fill(d.rollback_plan, s.rollback_plan),
  };
}

/** States from which the implementation and review fields are shown. */
const LATE_STATES = ['implementing', 'review', 'closed'];

/**
 * Create / edit form of a change request: what and why, the impact and risk
 * assessment (with an assistant suggestion), the implementation and rollback plans
 * and, once it is being implemented, the implementation date and the review
 * outcome. Fields frozen after approval (`locked_fields`) are read-only.
 */
@Component({
  selector: 'app-change-form',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    AssetDepartmentSelect,
    AssetMultiSelect,
    AssetUserSelect,
    Button,
    Card,
    FieldHelp,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      @if (lockedCount()) {
        <p class="rounded-tile bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted" role="note">
          {{ 'assets.changeForm.lockedNote' | transloco }}
        </p>
      }
      <app-card>
        <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
          {{ 'assets.changeForm.sections.request' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'assets.fields.title' | transloco" inputId="chg-title">
              <input
                id="chg-title"
                type="text"
                maxlength="255"
                required
                [disabled]="locked('title')"
                [attr.aria-invalid]="showErrors() && !d().title.trim()"
                aria-describedby="chg-title-err"
                [value]="d().title"
                (input)="set('title', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && !d().title.trim()) {
              <p id="chg-title-err" class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'assets.changeForm.titleRequired' | transloco }}
              </p>
            }
          </div>
          <div>
            <app-field-help scope="assets" page="changeForm" field="change_type" />
            <app-form-field [label]="'assets.fields.changeType' | transloco" inputId="chg-type">
              <select
                id="chg-type"
                [disabled]="locked('change_type')"
                (change)="set('change_type', $any($event.target).value)"
              >
                @for (t of types; track t) {
                  <option [value]="t" [selected]="d().change_type === t">
                    {{ 'assets.changeType.' + t | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <app-form-field [label]="'assets.fields.changeCategory' | transloco" inputId="chg-cat">
            <select
              id="chg-cat"
              [disabled]="locked('category')"
              (change)="set('category', $any($event.target).value)"
            >
              @for (c of categories; track c) {
                <option [value]="c" [selected]="d().category === c">
                  {{ 'assets.changeCategory.' + c | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          @for (key of requestTexts; track key.field) {
            <div class="sm:col-span-2">
              <app-field-help scope="assets" page="changeForm" [field]="key.field" />
              <app-form-field
                [label]="'assets.fields.' + key.label | transloco"
                [inputId]="'chg-' + key.field"
              >
                <textarea
                  [id]="'chg-' + key.field"
                  rows="3"
                  maxlength="10000"
                  [disabled]="locked(key.field)"
                  [placeholder]="'assets.changeForm.placeholders.' + key.label | transloco"
                  [value]="d()[key.field]"
                  (input)="set(key.field, $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          }
          <app-form-field [label]="'assets.fields.owner' | transloco" inputId="chg-owner">
            <app-asset-user-select
              inputId="chg-owner"
              [value]="d().owner_user_id"
              [currentName]="value()?.owner?.name ?? null"
              (valueChange)="set('owner_user_id', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'assets.fields.department' | transloco" inputId="chg-dept">
            <app-asset-department-select
              inputId="chg-dept"
              [value]="d().department_id"
              (valueChange)="set('department_id', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'assets.fields.plannedStart' | transloco" inputId="chg-start">
            <input
              id="chg-start"
              type="date"
              [value]="d().planned_start"
              (input)="set('planned_start', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field [label]="'assets.fields.plannedEnd' | transloco" inputId="chg-end">
              <input
                id="chg-end"
                type="date"
                aria-describedby="chg-end-err"
                [attr.aria-invalid]="showErrors() && !datesValid()"
                [value]="d().planned_end"
                (input)="set('planned_end', $any($event.target).value)"
              />
            </app-form-field>
            @if (showErrors() && !datesValid()) {
              <p id="chg-end-err" class="mt-1 text-[12px] text-fail" role="alert">
                {{ 'assets.errors.invalid_dates' | transloco }}
              </p>
            }
          </div>
          @if (!editing()) {
            <div class="sm:col-span-2">
              <app-field-help scope="assets" page="changeForm" field="affected_assets" />
              <app-form-field
                [label]="'assets.fields.affectedAssets' | transloco"
                inputId="chg-assets"
              >
                <app-asset-multi-select
                  inputId="chg-assets"
                  [value]="assetIds()"
                  (valueChange)="assetIds.set($event)"
                />
              </app-form-field>
            </div>
          }
        </div>
      </app-card>

      <app-card>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'assets.changeForm.sections.assessment' | transloco }}
          </h2>
          @if (!locked('impact_assessment')) {
            <app-ai-assist-button
              assist="assets.assess_change"
              labelKey="assets.ai.assessChange"
              [input]="assistInput()"
              [entityType]="value() ? 'change_request' : null"
              [entityId]="value()?.id ?? null"
              [disabled]="!d().title.trim()"
              (result)="onAssessment($event)"
            />
          }
        </div>
        @if (assessment(); as s) {
          <div
            class="mb-4 rounded-tile border border-accent/30 bg-accent-soft px-3 py-2.5 text-[13px] text-fg"
            role="status"
          >
            <p class="font-semibold">{{ 'assets.changeForm.assessmentApplied' | transloco }}</p>
            @if (s.suggested_change_type && s.suggested_change_type !== d().change_type) {
              <p class="mt-1 text-fg-muted">
                {{
                  'assets.changeForm.suggestedType'
                    | transloco
                      : { type: ('assets.changeType.' + s.suggested_change_type | transloco) }
                }}
              </p>
            }
            @if (s.affected_areas?.length) {
              <p class="mt-1 text-fg-muted">
                {{
                  'assets.changeForm.affectedAreas'
                    | transloco: { areas: s.affected_areas!.join(', ') }
                }}
              </p>
            }
            @if (s.controls?.length) {
              <ul class="mt-1 flex flex-col gap-0.5">
                @for (c of s.controls; track c.ref) {
                  <li class="text-[12.5px]">
                    <span class="font-mono text-fg-muted">{{ c.ref }}</span> {{ c.title }}
                  </li>
                }
              </ul>
            }
          </div>
        }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div class="flex items-center gap-1">
              <app-field-help scope="assets" page="changeForm" field="risk_level" />
              <app-ask-about
                [prompt]="'assets.ai.prompts.riskLevel' | transloco"
                field="risk_level"
              />
            </div>
            <app-form-field [label]="'assets.fields.riskLevel' | transloco" inputId="chg-risk">
              <select
                id="chg-risk"
                [disabled]="locked('risk_level')"
                (change)="set('risk_level', $any($event.target).value)"
              >
                <option value="" [selected]="!d().risk_level">
                  {{ 'assets.common.notSet' | transloco }}
                </option>
                @for (r of risks; track r) {
                  <option [value]="r" [selected]="d().risk_level === r">
                    {{ 'assets.criticality.' + r | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div class="hidden sm:block"></div>
          @for (key of assessmentTexts; track key.field) {
            <div class="sm:col-span-2">
              <app-field-help scope="assets" page="changeForm" [field]="key.field" />
              <app-form-field
                [label]="'assets.fields.' + key.label | transloco"
                [inputId]="'chg-' + key.field"
              >
                <textarea
                  [id]="'chg-' + key.field"
                  rows="3"
                  maxlength="10000"
                  [disabled]="locked(key.field)"
                  [placeholder]="'assets.changeForm.placeholders.' + key.label | transloco"
                  [value]="d()[key.field]"
                  (input)="set(key.field, $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          }
        </div>
      </app-card>

      @if (showLate()) {
        <app-card>
          <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
            {{ 'assets.changeForm.sections.implementation' | transloco }}
          </h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <app-form-field [label]="'assets.fields.implementedAt' | transloco" inputId="chg-impl">
              <input
                id="chg-impl"
                type="date"
                [value]="d().implemented_at"
                (input)="set('implemented_at', $any($event.target).value)"
              />
            </app-form-field>
            <div>
              <app-field-help scope="assets" page="changeForm" field="review_outcome" />
              <app-form-field
                [label]="'assets.fields.reviewOutcome' | transloco"
                inputId="chg-outcome"
              >
                <select
                  id="chg-outcome"
                  (change)="set('review_outcome', $any($event.target).value)"
                >
                  <option value="" [selected]="!d().review_outcome">
                    {{ 'assets.common.notSet' | transloco }}
                  </option>
                  @for (o of outcomes; track o) {
                    <option [value]="o" [selected]="d().review_outcome === o">
                      {{ 'assets.reviewOutcome.' + o | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
            <div class="sm:col-span-2">
              <app-form-field
                [label]="'assets.fields.reviewNotes' | transloco"
                inputId="chg-review-notes"
              >
                <textarea
                  id="chg-review-notes"
                  rows="3"
                  maxlength="10000"
                  [placeholder]="'assets.changeForm.placeholders.reviewNotes' | transloco"
                  [value]="d().review_notes"
                  (input)="set('review_notes', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </div>
        </app-card>
      }

      @if (editing()) {
        <app-card>
          <app-form-field [label]="'assets.form.changeReason' | transloco" inputId="chg-reason">
            <textarea
              id="chg-reason"
              rows="2"
              maxlength="1000"
              aria-describedby="chg-reason-hint"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <p id="chg-reason-hint" class="mt-1 text-[12px] text-fg-subtle">
            {{ 'assets.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      <div class="flex flex-wrap items-center justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">{{
          'common.cancel' | transloco
        }}</app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (editing() ? 'assets.changeForm.save' : 'assets.changeForm.create') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class ChangeForm {
  /** The change being edited (null = a new change request). */
  readonly value = input<ChangeDetail | null>(null);
  /** Assets to preselect on a new change (e.g. raised from an asset page). */
  readonly initialAssets = input<readonly string[]>([]);
  readonly busy = input(false);
  readonly submitted = output<ChangeFormValue>();
  readonly cancelled = output<void>();

  protected readonly types = CHANGE_TYPES;
  protected readonly categories = CHANGE_CATEGORIES;
  protected readonly risks = RISK_LEVELS;
  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly requestTexts = [
    { field: 'description', label: 'description' },
    { field: 'reason', label: 'reason' },
  ] as const;
  protected readonly assessmentTexts = [
    { field: 'impact_assessment', label: 'impactAssessment' },
    { field: 'risk_assessment', label: 'riskAssessment' },
    { field: 'implementation_plan', label: 'implementationPlan' },
    { field: 'rollback_plan', label: 'rollbackPlan' },
  ] as const;

  protected readonly d = signal<ChangeDraft>(changeDraftFrom(null));
  protected readonly assetIds = signal<readonly string[]>([]);
  protected readonly changeReason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly assessment = signal<ChangeAssessmentSuggestion | null>(null);
  protected readonly editing = computed(() => this.value() !== null);
  protected readonly lockedCount = computed(() => this.value()?.locked_fields.length ?? 0);
  protected readonly showLate = computed(() => {
    const c = this.value();
    return !!c && (LATE_STATES.includes(c.status) || !!c.implemented_at || !!c.review_outcome);
  });
  protected readonly datesValid = computed(() => {
    const { planned_start, planned_end } = this.d();
    return !planned_start || !planned_end || planned_end >= planned_start;
  });
  protected readonly assistInput = computed(() => {
    const d = this.d();
    return { title: d.title.trim(), description: d.description.trim(), reason: d.reason.trim() };
  });

  constructor() {
    effect(() => {
      const value = this.value();
      untracked(() => this.d.set(changeDraftFrom(value)));
    });
    effect(() => {
      const initial = this.initialAssets();
      untracked(() => this.assetIds.set(initial));
    });
  }

  protected locked(field: string): boolean {
    return this.value()?.locked_fields.includes(field) ?? false;
  }

  protected set<K extends keyof ChangeDraft>(key: K, value: ChangeDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected onAssessment(data: unknown): void {
    if (!data || typeof data !== 'object') {
      return;
    }
    const s = data as ChangeAssessmentSuggestion;
    this.d.update((d) => applyAssessment(d, s));
    this.assessment.set(s);
  }

  protected submit(): void {
    if (!this.d().title.trim() || !this.datesValid()) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({
      fields: changeFieldsFrom(this.d()),
      assetIds: this.assetIds(),
      changeReason: blankToNull(this.changeReason()),
    });
  }
}
