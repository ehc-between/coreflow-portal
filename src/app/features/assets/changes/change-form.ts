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
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
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
  CHANGE_RELATED_TYPES,
  RISK_LEVELS,
  RelatedRecord,
  ReviewOutcome,
  RiskLevel,
} from '../data/asset.models';
import { SearchHit } from '../../../core/kit/kit.models';
import { AssetRelatedPicker } from '../shared/related-picker';
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
  /** Processes, documents, suppliers and risks the change affects (new changes only). */
  readonly related: readonly RelatedRecord[];
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

/** Apply create-from-here values (e.g. `asset.to_change`: category) to a new change draft. */
export function changeDraftFromPrefill(
  d: ChangeDraft,
  prefill: Readonly<Record<string, unknown>>,
): ChangeDraft {
  const text = (key: string) => (typeof prefill[key] === 'string' ? (prefill[key] as string) : '');
  const category = text('category');
  return {
    ...d,
    title: text('title') || d.title,
    description: text('description') || d.description,
    category: (CHANGE_CATEGORIES as readonly string[]).includes(category)
      ? (category as ChangeCategory)
      : d.category,
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
    AssetRelatedPicker,
    AssetUserSelect,
    Button,
    DateInput,
    FormActions,
    FormSection,
    FieldHelp,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      @if (lockedCount()) {
        <p class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted" role="note">
          {{ 'assets.changeForm.lockedNote' | transloco }}
        </p>
      }
      <app-form-section
        [title]="'assets.changeForm.sections.request' | transloco"
        [description]="'assets.changeForm.sectionHints.request' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'assets.fields.title' | transloco"
          inputId="chg-title"
          [required]="true"
          [error]="
            showErrors() && !d().title.trim() ? ('assets.changeForm.titleRequired' | transloco) : ''
          "
        >
          <input
            id="chg-title"
            type="text"
            maxlength="255"
            required
            aria-required="true"
            [disabled]="locked('title')"
            [value]="d().title"
            (input)="set('title', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'assets.fields.changeType' | transloco"
          inputId="chg-type"
          [required]="true"
          [hint]="'assets.changeTypeHint.' + d().change_type | transloco"
        >
          <app-field-help label-suffix scope="assets" page="changeForm" field="change_type" />
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
          <app-form-field
            span="full"
            [label]="'assets.fields.' + key.label | transloco"
            [inputId]="'chg-' + key.field"
          >
            <app-field-help label-suffix scope="assets" page="changeForm" [field]="key.field" />
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
          <app-date-input
            inputId="chg-start"
            [value]="d().planned_start"
            (valueChange)="set('planned_start', $event ?? '')"
          />
        </app-form-field>
        <app-form-field
          [label]="'assets.fields.plannedEnd' | transloco"
          inputId="chg-end"
          [error]="showErrors() && !datesValid() ? ('assets.errors.invalid_dates' | transloco) : ''"
        >
          <app-date-input
            inputId="chg-end"
            [invalid]="showErrors() && !datesValid()"
            [value]="d().planned_end"
            (valueChange)="set('planned_end', $event ?? '')"
          />
        </app-form-field>
        @if (!editing()) {
          <app-form-field
            span="full"
            [label]="'assets.fields.affectedAssets' | transloco"
            inputId="chg-assets"
          >
            <app-field-help label-suffix scope="assets" page="changeForm" field="affected_assets" />
            <app-asset-multi-select
              inputId="chg-assets"
              [value]="assetIds()"
              (valueChange)="assetIds.set($event)"
            />
          </app-form-field>
          <app-form-field
            span="full"
            [label]="'assets.fields.affectedRecords' | transloco"
            inputId="chg-related"
          >
            <app-field-help
              label-suffix
              scope="assets"
              page="changeForm"
              field="affected_records"
            />
            <app-asset-related-picker
              inputId="chg-related"
              describedBy="chg-related-hint"
              [types]="relatedTypes"
              [value]="related()"
              (valueChange)="related.set($event)"
            />
            <p hint id="chg-related-hint" class="text-meta leading-snug text-fg-subtle">
              {{ 'assets.changeForm.relatedHint' | transloco }}
            </p>
          </app-form-field>
        }
      </app-form-section>

      <app-form-section
        [title]="'assets.changeForm.sections.assessment' | transloco"
        [description]="'assets.changeForm.sectionHints.assessment' | transloco"
      >
        @if (!locked('impact_assessment')) {
          <app-ai-assist-button
            section-actions
            assist="assets.assess_change"
            labelKey="assets.ai.assessChange"
            [input]="assistInput()"
            [entityType]="value() ? 'change_request' : null"
            [entityId]="value()?.id ?? null"
            [disabled]="!d().title.trim()"
            (result)="onAssessment($event)"
          />
        }
        @if (assessment(); as s) {
          <div
            class="rounded-tile border border-accent/30 bg-accent-soft px-3 py-2.5 text-ui text-fg sm:col-span-2"
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
                  <li class="text-meta">
                    <span class="font-mono text-fg-muted">{{ c.ref }}</span> {{ c.title }}
                  </li>
                }
              </ul>
            }
          </div>
        }
        @for (key of assessmentTexts; track key.field) {
          <app-form-field
            span="full"
            [label]="'assets.fields.' + key.label | transloco"
            [inputId]="'chg-' + key.field"
          >
            <app-field-help label-suffix scope="assets" page="changeForm" [field]="key.field" />
            @if (key.field === 'impact_assessment') {
              <app-ask-about
                label-suffix
                [prompt]="'assets.ai.prompts.reviewAssessment' | transloco"
                field="impact_assessment"
                [fieldLabel]="'assets.fields.impactAssessment' | transloco"
                labelKey="assets.ai.askAssessment"
              />
            }
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
        }
        <app-form-field [label]="'assets.fields.riskLevel' | transloco" inputId="chg-risk">
          <app-field-help label-suffix scope="assets" page="changeForm" field="risk_level" />
          <app-ask-about
            label-suffix
            [prompt]="'assets.ai.prompts.riskLevel' | transloco"
            field="risk_level"
            [fieldLabel]="'assets.fields.riskLevel' | transloco"
            labelKey="assets.ai.askRiskLevel"
          />
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
      </app-form-section>

      @if (showLate()) {
        <app-form-section
          [title]="'assets.changeForm.sections.implementation' | transloco"
          [description]="'assets.changeForm.sectionHints.implementation' | transloco"
        >
          <app-form-field [label]="'assets.fields.implementedAt' | transloco" inputId="chg-impl">
            <app-date-input
              inputId="chg-impl"
              [value]="d().implemented_at"
              (valueChange)="set('implemented_at', $event ?? '')"
            />
          </app-form-field>
          <app-form-field [label]="'assets.fields.reviewOutcome' | transloco" inputId="chg-outcome">
            <app-field-help label-suffix scope="assets" page="changeForm" field="review_outcome" />
            <select id="chg-outcome" (change)="set('review_outcome', $any($event.target).value)">
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
          <app-form-field
            span="full"
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
        </app-form-section>
      }

      @if (editing()) {
        <app-form-section [columns]="1">
          <app-form-field
            [label]="'assets.form.changeReason' | transloco"
            inputId="chg-reason"
            [hint]="'assets.form.changeReasonHint' | transloco"
          >
            <textarea
              id="chg-reason"
              rows="2"
              maxlength="1000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="
          showErrors() && (!d().title.trim() || !datesValid())
            ? ('assets.form.fixFields' | transloco)
            : ''
        "
      >
        <app-button variant="secondary" (click)="cancelled.emit()">{{
          'common.cancel' | transloco
        }}</app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (editing() ? 'assets.changeForm.save' : 'assets.changeForm.create') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class ChangeForm {
  /** The change being edited (null = a new change request). */
  readonly value = input<ChangeDetail | null>(null);
  /** Assets to preselect on a new change (e.g. raised from an asset page). */
  readonly initialAssets = input<readonly string[]>([]);
  /** Create-from-here values for a new change (title, description, category). */
  readonly prefill = input<Readonly<Record<string, unknown>> | null>(null);
  readonly busy = input(false);
  readonly submitted = output<ChangeFormValue>();
  readonly cancelled = output<void>();

  protected readonly types = CHANGE_TYPES;
  protected readonly relatedTypes = CHANGE_RELATED_TYPES;
  protected readonly related = signal<readonly SearchHit[]>([]);
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
      const prefill = this.prefill();
      untracked(() => {
        const draft = changeDraftFrom(value);
        this.d.set(!value && prefill ? changeDraftFromPrefill(draft, prefill) : draft);
      });
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
      related: this.related().map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id })),
      changeReason: blankToNull(this.changeReason()),
    });
  }
}
