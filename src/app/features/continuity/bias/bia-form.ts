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
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, parseIntOrNull } from '../data/continuity-display';
import {
  BiaDetail,
  BiaFields,
  BiaSuggestion,
  CRITICALITIES,
  Criticality,
  DEPENDENCY_KINDS,
  DEPENDENCY_LINK_TYPES,
  DependencyEntityType,
  DependencyKind,
  IMPACT_CATEGORIES,
  IMPACT_INTERVALS,
  IctListItem,
  ImpactCategory,
  ImpactInterval,
  ImpactTimeline,
  Impacts,
  LinkedRef,
} from '../data/continuity.models';
import { ContinuityDuration, ContinuityDurationInput } from '../shared/duration';
import { ContinuityRecordPicker } from '../shared/record-picker';
import { ContinuityDepartmentSelect, ContinuityUserSelect } from '../shared/user-select';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';

export interface DependencyDraft {
  kind: DependencyKind;
  name: string;
  notes: string;
  ict_system_id: string;
  /** The register record the dependency points at (supplier, asset, person, record…). */
  entity: LinkedRef | null;
}

export interface BiaDraft {
  title: string;
  description: string;
  process: LinkedRef | null;
  owner_user_id: string;
  department_id: string;
  criticality: Criticality | '';
  impacts: Record<ImpactCategory, number | null>;
  impact_timeline: Record<ImpactInterval, number | null>;
  impact_notes: string;
  mtpd_minutes: number | null;
  rto_minutes: number | null;
  rpo_minutes: number | null;
  mbco: string;
  peak_periods: string;
  workarounds: string;
  dependencies: DependencyDraft[];
  review_interval_months: string;
}

/** Values a "create from here" flow (process → BIA) fills in on a new BIA. */
export type BiaPrefill = Partial<
  Pick<BiaDraft, 'title' | 'description' | 'owner_user_id' | 'department_id' | 'process'>
>;

/** Minutes of each impact interval (for the MTPD suggestion). */
export const INTERVAL_MINUTES: Readonly<Record<ImpactInterval, number>> = {
  '4h': 240,
  '1d': 1440,
  '3d': 4320,
  '1w': 10080,
  '2w': 20160,
};

const emptyImpacts = (): Record<ImpactCategory, number | null> =>
  Object.fromEntries(IMPACT_CATEGORIES.map((c) => [c, null])) as Record<
    ImpactCategory,
    number | null
  >;

const emptyTimeline = (): Record<ImpactInterval, number | null> =>
  Object.fromEntries(IMPACT_INTERVALS.map((i) => [i, null])) as Record<
    ImpactInterval,
    number | null
  >;

function dependencyEntity(d: BiaDetail['dependencies'][number]): LinkedRef | null {
  if (d.entity) {
    return d.entity;
  }
  if (d.entity_type && d.entity_id) {
    return { entity_type: d.entity_type, entity_id: d.entity_id, title: d.name };
  }
  return null;
}

export function biaDraft(b: BiaDetail | null): BiaDraft {
  return {
    title: b?.title ?? '',
    description: b?.description ?? '',
    process:
      b?.process ??
      // A process the reader may not open: keep the link, show a neutral label.
      (b?.process_id ? { entity_type: 'process', entity_id: b.process_id, title: '—' } : null),
    owner_user_id: b?.owner?.id ?? '',
    department_id: b?.department_id ?? '',
    criticality: b?.criticality ?? '',
    impacts: { ...emptyImpacts(), ...(b?.impacts ?? {}) },
    impact_timeline: { ...emptyTimeline(), ...(b?.impact_timeline ?? {}) },
    impact_notes: b?.impact_notes ?? '',
    mtpd_minutes: b?.mtpd_minutes ?? null,
    rto_minutes: b?.rto_minutes ?? null,
    rpo_minutes: b?.rpo_minutes ?? null,
    mbco: b?.mbco ?? '',
    peak_periods: b?.peak_periods ?? '',
    workarounds: b?.workarounds ?? '',
    dependencies: (b?.dependencies ?? []).map((d) => ({
      kind: d.kind,
      name: d.name ?? '',
      notes: d.notes ?? '',
      ict_system_id: d.ict_system_id ?? '',
      entity: dependencyEntity(d),
    })),
    review_interval_months: b ? String(b.review_interval_months) : '12',
  };
}

/** Whether a dependency kind may link to a register record (not ICT, which has its own list). */
export function linkTypes(kind: DependencyKind): readonly DependencyEntityType[] {
  return DEPENDENCY_LINK_TYPES[kind] ?? [];
}

export function biaFields(d: BiaDraft): BiaFields {
  const interval = parseIntOrNull(d.review_interval_months);
  return {
    title: d.title.trim(),
    description: blankToNull(d.description),
    process_id: d.process?.entity_id ?? null,
    owner_user_id: d.owner_user_id || null,
    department_id: d.department_id || null,
    criticality: d.criticality || null,
    impacts: { ...d.impacts } as Impacts,
    impact_timeline: { ...d.impact_timeline } as ImpactTimeline,
    impact_notes: blankToNull(d.impact_notes),
    mtpd_minutes: d.mtpd_minutes,
    rto_minutes: d.rto_minutes,
    rpo_minutes: d.rpo_minutes,
    mbco: blankToNull(d.mbco),
    peak_periods: blankToNull(d.peak_periods),
    workarounds: blankToNull(d.workarounds),
    dependencies: d.dependencies.map((dep) => {
      const ict = dep.kind === 'ict' && dep.ict_system_id ? dep.ict_system_id : null;
      const entity =
        dep.kind !== 'ict' &&
        dep.entity &&
        linkTypes(dep.kind).includes(dep.entity.entity_type as DependencyEntityType)
          ? dep.entity
          : null;
      return {
        kind: dep.kind,
        name: blankToNull(dep.name) ?? entity?.title ?? null,
        notes: blankToNull(dep.notes),
        ict_system_id: ict,
        entity_type: (entity?.entity_type as DependencyEntityType | undefined) ?? null,
        entity_id: entity?.entity_id ?? null,
      };
    }),
    review_interval_months: interval !== null && Number.isFinite(interval) ? interval : null,
  };
}

/** Whether the impact over time never falls as the disruption goes on. */
export function timelineRises(t: Readonly<Record<ImpactInterval, number | null>>): boolean {
  let last = -1;
  for (const i of IMPACT_INTERVALS) {
    const v = t[i];
    if (v === null || v === undefined) {
      continue;
    }
    if (v < last) {
      return false;
    }
    last = v;
  }
  return true;
}

/** The MTPD the timeline points at: the first interval rated 4 (serious) or worse. */
export function suggestedMtpd(t: Readonly<Record<ImpactInterval, number | null>>): number | null {
  for (const i of IMPACT_INTERVALS) {
    const v = t[i];
    if (typeof v === 'number' && v >= 4) {
      return INTERVAL_MINUTES[i];
    }
  }
  return null;
}

/** The validation problems of a draft, as `continuity.form.errors.*` key suffixes. */
export function biaProblems(d: BiaDraft): string[] {
  const problems: string[] = [];
  if (!d.title.trim()) {
    problems.push('titleRequired');
  }
  if (d.rto_minutes !== null && d.mtpd_minutes !== null && d.rto_minutes > d.mtpd_minutes) {
    problems.push('rtoExceedsMtpd');
  }
  const interval = parseIntOrNull(d.review_interval_months);
  if (interval !== null && (!Number.isFinite(interval) || interval < 1 || interval > 120)) {
    problems.push('interval');
  }
  if (
    d.dependencies.some(
      (dep) => !dep.name.trim() && !(dep.kind === 'ict' && dep.ict_system_id) && !dep.entity,
    )
  ) {
    problems.push('dependencyName');
  }
  if (!timelineRises(d.impact_timeline)) {
    problems.push('timelineDecreasing');
  }
  return problems;
}

/** Apply an assistant suggestion to a draft: only the values it provides. */
export function applyBiaSuggestion(d: BiaDraft, s: BiaSuggestion): BiaDraft {
  const impacts = { ...d.impacts };
  for (const c of IMPACT_CATEGORIES) {
    const v = s.impacts?.[c];
    if (typeof v === 'number' && v >= 0 && v <= 5) {
      impacts[c] = Math.round(v);
    }
  }
  const num = (v: number | null | undefined, fallback: number | null) =>
    typeof v === 'number' && v >= 0 ? Math.round(v) : fallback;
  const deps = (s.dependencies ?? [])
    .filter((dep) => !!dep.name?.trim())
    .map(
      (dep): DependencyDraft => ({
        kind: (DEPENDENCY_KINDS as readonly string[]).includes(dep.kind ?? '')
          ? (dep.kind as DependencyKind)
          : 'other',
        name: dep.name!.trim(),
        notes: dep.notes ?? '',
        ict_system_id: '',
        entity: null,
      }),
    );
  return {
    ...d,
    criticality:
      s.criticality && (CRITICALITIES as readonly string[]).includes(s.criticality)
        ? s.criticality
        : d.criticality,
    impacts,
    impact_notes: s.impact_notes?.trim() ? s.impact_notes : d.impact_notes,
    mtpd_minutes: num(s.mtpd_minutes, d.mtpd_minutes),
    rto_minutes: num(s.rto_minutes, d.rto_minutes),
    rpo_minutes: num(s.rpo_minutes, d.rpo_minutes),
    mbco: s.mbco?.trim() ? s.mbco : d.mbco,
    dependencies: [...d.dependencies, ...deps].slice(0, 50),
  };
}

export interface BiaFormValue {
  readonly fields: BiaFields;
  readonly changeReason: string | null;
}

/**
 * Create / edit form of a business impact analysis: the process it analyses (the
 * recommended start, it names the activity), how bad an outage gets per area and over
 * time (with the MTPD the timeline suggests), the recovery targets (MTPD, RTO, RPO,
 * MBCO), peak periods, workarounds and the dependencies — each pointing at the ICT
 * service, supplier, asset, person or record it relies on — plus the review interval.
 * The assistant can suggest ratings and targets. Editing asks for the reason.
 */
@Component({
  selector: 'app-bia-form',
  imports: [
    FormActions,
    FormSection,
    TranslocoPipe,
    AiAssistButton,
    Alert,
    AskAbout,
    Button,
    ContinuityDepartmentSelect,
    ContinuityDuration,
    ContinuityDurationInput,
    ContinuityRecordPicker,
    ContinuityUserSelect,
    FieldHelp,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'continuity.form.sections.activity' | transloco"
        [description]="'continuity.form.sections.activityHint' | transloco"
      >
        <app-ai-assist-button
          section-actions
          assist="continuity.suggest_bia"
          labelKey="continuity.ai.suggestBia"
          [input]="{ title: d().title, description: d().description || null }"
          [entityType]="value() ? 'bia' : null"
          [entityId]="value()?.id ?? null"
          [disabled]="!d().title.trim()"
          (result)="applySuggestion($event)"
        />
        @if (rationale(); as text) {
          <div class="sm:col-span-2">
            <app-alert tone="info">
              <span class="font-semibold">{{ 'continuity.ai.suggestionApplied' | transloco }}</span>
              {{ text }}
            </app-alert>
          </div>
        }
        <app-form-field
          span="full"
          [label]="'continuity.fields.process' | transloco"
          inputId="bia-process"
          [hint]="'continuity.form.processHint' | transloco"
        >
          <app-continuity-record-picker
            inputId="bia-process"
            [types]="['process']"
            [value]="d().process"
            [placeholder]="'continuity.form.processPlaceholder' | transloco"
            describedBy="bia-process-hint"
            (picked)="pickProcess($event)"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.title' | transloco"
          inputId="bia-title"
          [required]="true"
          [error]="
            showErrors() && !d().title.trim()
              ? ('continuity.form.errors.titleRequired' | transloco)
              : ''
          "
        >
          <input
            id="bia-title"
            type="text"
            maxlength="255"
            required
            [value]="d().title"
            (input)="set('title', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.description' | transloco"
          inputId="bia-desc"
        >
          <textarea
            id="bia-desc"
            rows="3"
            maxlength="20000"
            [value]="d().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field [label]="'continuity.fields.owner' | transloco" inputId="bia-owner">
          <app-continuity-user-select
            inputId="bia-owner"
            [value]="d().owner_user_id"
            [currentName]="value()?.owner?.name ?? null"
            (valueChange)="set('owner_user_id', $event)"
          />
        </app-form-field>
        <app-form-field [label]="'continuity.fields.department' | transloco" inputId="bia-dept">
          <app-continuity-department-select
            inputId="bia-dept"
            [value]="d().department_id"
            (valueChange)="set('department_id', $event)"
          />
        </app-form-field>
        <app-form-field [label]="'continuity.fields.criticality' | transloco" inputId="bia-crit">
          <app-field-help
            label-suffix
            scope="continuity"
            page="biaForm"
            field="criticality"
            [label]="'continuity.fields.criticality' | transloco"
          />
          <select id="bia-crit" (change)="set('criticality', $any($event.target).value)">
            <option value="" [selected]="!d().criticality">
              {{ 'continuity.common.notSet' | transloco }}
            </option>
            @for (c of criticalities; track c) {
              <option [value]="c" [selected]="d().criticality === c">
                {{ 'continuity.criticality.' + c | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          [label]="'continuity.fields.reviewInterval' | transloco"
          inputId="bia-interval"
          [error]="
            showErrors() && problems().includes('interval')
              ? ('continuity.form.errors.interval' | transloco)
              : ''
          "
        >
          <input
            id="bia-interval"
            type="number"
            min="1"
            max="120"
            [value]="d().review_interval_months"
            (input)="set('review_interval_months', $any($event.target).value)"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'continuity.form.sections.impacts' | transloco"
        [description]="'continuity.form.impactScale' | transloco"
      >
        <app-field-help title-suffix scope="continuity" page="biaForm" field="impacts" />
        <app-ask-about
          section-actions
          [prompt]="'continuity.ai.prompts.impacts' | transloco"
          field="impacts"
        />
        @for (c of impactCategories; track c) {
          <app-form-field
            [label]="'continuity.impacts.' + c | transloco"
            [inputId]="'bia-imp-' + c"
          >
            <select [id]="'bia-imp-' + c" (change)="setImpact(c, $any($event.target).value)">
              <option value="" [selected]="d().impacts[c] === null">
                {{ 'continuity.common.notSet' | transloco }}
              </option>
              @for (n of ratings; track n) {
                <option [value]="n" [selected]="d().impacts[c] === n">
                  {{ 'continuity.impactLevel.' + n | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        }

        <fieldset class="flex flex-col gap-3 sm:col-span-2" data-testid="timeline-input">
          <legend class="flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted">
            {{ 'continuity.fields.impactTimeline' | transloco }}
            <app-field-help
              scope="continuity"
              page="biaForm"
              field="impact_timeline"
              [label]="'continuity.fields.impactTimeline' | transloco"
            />
          </legend>
          <p class="-mt-1.5 text-meta leading-snug text-fg-subtle">
            {{ 'continuity.form.timelineHint' | transloco }}
          </p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
            @for (i of intervals; track i) {
              <app-form-field
                [label]="'continuity.intervals.' + i | transloco"
                [inputId]="'bia-tl-' + i"
              >
                <select
                  [id]="'bia-tl-' + i"
                  [attr.aria-invalid]="problems().includes('timelineDecreasing') || null"
                  (change)="setTimeline(i, $any($event.target).value)"
                >
                  <option value="" [selected]="d().impact_timeline[i] === null">—</option>
                  @for (n of ratings; track n) {
                    <option [value]="n" [selected]="d().impact_timeline[i] === n">
                      {{ 'continuity.impactShort.' + n | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            }
          </div>
          @if (problems().includes('timelineDecreasing')) {
            <p class="text-meta font-medium text-fail-ink" role="alert">
              {{ 'continuity.errors.impact_timeline_decreasing' | transloco }}
            </p>
          }
          @if (suggestion(); as minutes) {
            <p
              class="flex flex-wrap items-center gap-2 rounded-tile bg-accent-soft px-3 py-2 text-ui text-fg-muted"
              data-testid="mtpd-suggestion"
            >
              {{ 'continuity.bias.suggestedMtpd' | transloco }}
              <span class="font-semibold text-fg"
                ><app-continuity-duration [minutes]="minutes"
              /></span>
              @if (d().mtpd_minutes !== minutes) {
                <app-button
                  class="ml-auto"
                  size="sm"
                  variant="secondary"
                  (click)="set('mtpd_minutes', minutes)"
                >
                  {{ 'continuity.form.useSuggestion' | transloco }}
                </app-button>
              }
            </p>
          }
        </fieldset>

        <app-form-field
          span="full"
          [label]="'continuity.fields.impactNotes' | transloco"
          inputId="bia-impnotes"
        >
          <textarea
            id="bia-impnotes"
            rows="3"
            maxlength="20000"
            [value]="d().impact_notes"
            (input)="set('impact_notes', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'continuity.form.sections.targets' | transloco"
        [description]="'continuity.form.sections.targetsHint' | transloco"
      >
        <app-ask-about
          section-actions
          [prompt]="'continuity.ai.prompts.targets' | transloco"
          field="rto_minutes"
        />
        <div class="contents">
          <app-form-field [label]="'continuity.fields.mtpd' | transloco" inputId="bia-mtpd">
            <app-field-help
              label-suffix
              scope="continuity"
              page="biaForm"
              field="mtpd_minutes"
              [label]="'continuity.fields.mtpd' | transloco"
            />
            <app-continuity-duration-input
              inputId="bia-mtpd"
              [value]="d().mtpd_minutes"
              (valueChange)="set('mtpd_minutes', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.fields.rto' | transloco" inputId="bia-rto">
            <app-field-help
              label-suffix
              scope="continuity"
              page="biaForm"
              field="rto_minutes"
              [label]="'continuity.fields.rto' | transloco"
            />
            <app-continuity-duration-input
              inputId="bia-rto"
              [value]="d().rto_minutes"
              [invalid]="problems().includes('rtoExceedsMtpd')"
              describedBy="bia-rto-err"
              (valueChange)="set('rto_minutes', $event)"
            />
          </app-form-field>
          <app-form-field [label]="'continuity.fields.rpo' | transloco" inputId="bia-rpo">
            <app-field-help
              label-suffix
              scope="continuity"
              page="biaForm"
              field="rpo_minutes"
              [label]="'continuity.fields.rpo' | transloco"
            />
            <app-continuity-duration-input
              inputId="bia-rpo"
              [value]="d().rpo_minutes"
              (valueChange)="set('rpo_minutes', $event)"
            />
          </app-form-field>
          @if (problems().includes('rtoExceedsMtpd')) {
            <p
              id="bia-rto-err"
              class="text-meta font-medium text-fail-ink sm:col-span-2"
              role="alert"
            >
              {{ 'continuity.errors.rto_exceeds_mtpd' | transloco }}
            </p>
          }
        </div>
        <app-form-field
          span="full"
          [label]="'continuity.fields.mbco' | transloco"
          inputId="bia-mbco"
        >
          <app-field-help
            label-suffix
            scope="continuity"
            page="biaForm"
            field="mbco"
            [label]="'continuity.fields.mbco' | transloco"
          />
          <textarea
            id="bia-mbco"
            rows="2"
            maxlength="20000"
            [value]="d().mbco"
            (input)="set('mbco', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.peakPeriods' | transloco"
          inputId="bia-peak"
        >
          <textarea
            id="bia-peak"
            rows="2"
            maxlength="5000"
            [value]="d().peak_periods"
            (input)="set('peak_periods', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'continuity.fields.workarounds' | transloco"
          inputId="bia-workarounds"
        >
          <textarea
            id="bia-workarounds"
            rows="3"
            maxlength="20000"
            [value]="d().workarounds"
            (input)="set('workarounds', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'continuity.form.sections.dependencies' | transloco"
        [description]="'continuity.form.sections.dependenciesHint' | transloco"
        [columns]="1"
      >
        <app-field-help title-suffix scope="continuity" page="biaForm" field="dependencies" />
        @if (d().dependencies.length === 0) {
          <p
            class="rounded-tile border border-dashed border-border px-3 py-2.5 text-ui text-fg-muted"
          >
            {{ 'continuity.form.noDependencies' | transloco }}
          </p>
        }
        @if (d().dependencies.length) {
          <ol class="flex flex-col gap-3">
            @for (dep of d().dependencies; track $index; let i = $index) {
              <li class="rounded-tile border border-border bg-bg p-3 sm:p-4">
                <fieldset class="flex flex-col gap-3">
                  <legend class="sr-only">
                    {{ 'continuity.form.dependencyN' | transloco: { n: i + 1 } }}
                  </legend>
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-2 px-1.5 text-micro font-semibold text-fg-muted"
                      aria-hidden="true"
                      >{{ i + 1 }}</span
                    >
                    <app-button
                      class="ml-auto"
                      size="sm"
                      variant="ghost"
                      (click)="removeDependency(i)"
                    >
                      <app-icon name="trash" [size]="14" />
                      <span class="sr-only">{{
                        'continuity.form.removeDependency' | transloco: { n: i + 1 }
                      }}</span>
                    </app-button>
                  </div>
                  <div class="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2">
                    <app-form-field
                      [label]="'continuity.fields.dependencyKind' | transloco"
                      [inputId]="'bia-dep-kind-' + i"
                    >
                      <select
                        [id]="'bia-dep-kind-' + i"
                        (change)="setKind(i, $any($event.target).value)"
                      >
                        @for (k of dependencyKinds; track k) {
                          <option [value]="k" [selected]="dep.kind === k">
                            {{ 'continuity.dependencyKind.' + k | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    @if (dep.kind === 'ict') {
                      <app-form-field
                        [label]="'continuity.fields.ictSystem' | transloco"
                        [inputId]="'bia-dep-ict-' + i"
                      >
                        <select
                          [id]="'bia-dep-ict-' + i"
                          (change)="setDependency(i, 'ict_system_id', $any($event.target).value)"
                        >
                          <option value="" [selected]="!dep.ict_system_id">
                            {{ 'continuity.form.noIctSystem' | transloco }}
                          </option>
                          @for (s of ictSystems(); track s.id) {
                            <option [value]="s.id" [selected]="dep.ict_system_id === s.id">
                              {{ s.code }} {{ s.name }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                      @if (!dep.ict_system_id) {
                        <app-form-field
                          [label]="'continuity.fields.dependencyName' | transloco"
                          [inputId]="'bia-dep-name-' + i"
                        >
                          <input
                            [id]="'bia-dep-name-' + i"
                            type="text"
                            maxlength="255"
                            [placeholder]="'continuity.form.ictNamePlaceholder' | transloco"
                            [value]="dep.name"
                            (input)="setDependency(i, 'name', $any($event.target).value)"
                          />
                        </app-form-field>
                      }
                    } @else {
                      @if (types(dep.kind).length) {
                        <app-form-field
                          [label]="'continuity.form.linkRecord.' + dep.kind | transloco"
                          [inputId]="'bia-dep-rec-' + i"
                        >
                          <app-continuity-record-picker
                            [inputId]="'bia-dep-rec-' + i"
                            [types]="types(dep.kind)"
                            [value]="dep.entity"
                            (picked)="setDependency(i, 'entity', $event)"
                          />
                        </app-form-field>
                      }
                      @if (!dep.entity) {
                        <app-form-field
                          [label]="'continuity.fields.dependencyName' | transloco"
                          [inputId]="'bia-dep-name-' + i"
                        >
                          <input
                            [id]="'bia-dep-name-' + i"
                            type="text"
                            maxlength="255"
                            [placeholder]="
                              types(dep.kind).length
                                ? ('continuity.form.nameIfNotListed' | transloco)
                                : ''
                            "
                            [value]="dep.name"
                            (input)="setDependency(i, 'name', $any($event.target).value)"
                          />
                        </app-form-field>
                      }
                    }
                    <app-form-field
                      span="full"
                      [label]="'continuity.fields.dependencyNotes' | transloco"
                      [inputId]="'bia-dep-notes-' + i"
                    >
                      <input
                        [id]="'bia-dep-notes-' + i"
                        type="text"
                        maxlength="1000"
                        [value]="dep.notes"
                        (input)="setDependency(i, 'notes', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                </fieldset>
              </li>
            }
          </ol>
        }
        @if (showErrors() && problems().includes('dependencyName')) {
          <p class="text-meta font-medium text-fail-ink" role="alert">
            {{ 'continuity.form.errors.dependencyName' | transloco }}
          </p>
        }
        <div>
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="d().dependencies.length >= 50"
            (click)="addDependency()"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.form.addDependency' | transloco }}
          </app-button>
        </div>
      </app-form-section>

      @if (value()) {
        <app-form-section [columns]="1">
          <app-form-field
            [label]="'continuity.form.changeReason' | transloco"
            inputId="bia-reason"
            [hint]="'continuity.form.changeReasonHint' | transloco"
          >
            <textarea
              id="bia-reason"
              rows="2"
              maxlength="2000"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions>
        <app-button variant="secondary" (click)="cancelled.emit()">{{
          'common.cancel' | transloco
        }}</app-button>
        <app-button type="submit" [loading]="busy()">
          {{ (value() ? 'continuity.form.save' : 'continuity.bias.create') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class BiaForm {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The BIA being edited (null = a new BIA). */
  readonly value = input<BiaDetail | null>(null);
  /** Values from a "create from here" flow, applied to a new BIA. */
  readonly prefill = input<BiaPrefill | null>(null);
  readonly busy = input(false);
  readonly submitted = output<BiaFormValue>();
  readonly cancelled = output<void>();

  protected readonly criticalities = CRITICALITIES;
  protected readonly impactCategories = IMPACT_CATEGORIES;
  protected readonly intervals = IMPACT_INTERVALS;
  protected readonly dependencyKinds = DEPENDENCY_KINDS;
  protected readonly ratings = [0, 1, 2, 3, 4, 5] as const;
  protected readonly types = linkTypes;

  protected readonly d = signal<BiaDraft>(biaDraft(null));
  protected readonly reason = signal('');
  protected readonly showErrors = signal(false);
  protected readonly rationale = signal<string | null>(null);
  protected readonly problems = computed(() => biaProblems(this.d()));
  protected readonly suggestion = computed(() => suggestedMtpd(this.d().impact_timeline));
  protected readonly ictSystems = signal<readonly IctListItem[]>([]);

  private ictRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.ictRequest.unsubscribe());
    effect(() => {
      const value = this.value();
      const prefill = this.prefill();
      untracked(() =>
        this.d.set(value ? biaDraft(value) : { ...biaDraft(null), ...(prefill ?? {}) }),
      );
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        this.ictRequest.unsubscribe();
        if (!orgId) {
          return;
        }
        this.ictRequest = this.api.listIct(orgId, { status: 'active', limit: 200 }).subscribe({
          next: (page) => this.ictSystems.set(page.items),
          error: () => this.ictSystems.set([]),
        });
      });
    });
  }

  protected set<K extends keyof BiaDraft>(key: K, value: BiaDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  /** The process names the activity when no title is written yet. */
  protected pickProcess(ref: LinkedRef | null): void {
    this.d.update((d) => ({
      ...d,
      process: ref,
      title: ref && !d.title.trim() ? ref.title : d.title,
    }));
  }

  protected setImpact(category: ImpactCategory, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    this.d.update((d) => ({ ...d, impacts: { ...d.impacts, [category]: value } }));
  }

  protected setTimeline(interval: ImpactInterval, raw: string): void {
    const value = raw === '' ? null : Number(raw);
    this.d.update((d) => ({ ...d, impact_timeline: { ...d.impact_timeline, [interval]: value } }));
  }

  protected addDependency(): void {
    this.d.update((d) => ({
      ...d,
      dependencies: [
        ...d.dependencies,
        { kind: 'other', name: '', notes: '', ict_system_id: '', entity: null },
      ],
    }));
  }

  /** A new kind keeps the name and drops links the kind cannot have. */
  protected setKind(index: number, kind: DependencyKind): void {
    this.d.update((d) => ({
      ...d,
      dependencies: d.dependencies.map((dep, i) =>
        i === index
          ? {
              ...dep,
              kind,
              ict_system_id: kind === 'ict' ? dep.ict_system_id : '',
              entity:
                dep.entity &&
                linkTypes(kind).includes(dep.entity.entity_type as DependencyEntityType)
                  ? dep.entity
                  : null,
            }
          : dep,
      ),
    }));
  }

  protected setDependency<K extends keyof DependencyDraft>(
    index: number,
    key: K,
    value: DependencyDraft[K],
  ): void {
    this.d.update((d) => ({
      ...d,
      dependencies: d.dependencies.map((dep, i) => (i === index ? { ...dep, [key]: value } : dep)),
    }));
  }

  protected removeDependency(index: number): void {
    this.d.update((d) => ({ ...d, dependencies: d.dependencies.filter((_, i) => i !== index) }));
  }

  protected applySuggestion(result: unknown): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    const suggestion = result as BiaSuggestion;
    this.d.update((d) => applyBiaSuggestion(d, suggestion));
    this.rationale.set(suggestion.rationale?.trim() || null);
  }

  protected submit(): void {
    if (this.problems().length) {
      this.showErrors.set(true);
      return;
    }
    this.submitted.emit({ fields: biaFields(this.d()), changeReason: blankToNull(this.reason()) });
  }
}
