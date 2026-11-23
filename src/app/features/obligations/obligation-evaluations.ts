import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Attachment } from '../../core/attachments/attachment.models';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { SearchHit } from '../../core/kit/kit.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TASK_PRIORITIES, TaskPriority } from '../../core/tasks/task.models';
import { FieldHelp } from '../../shared/guidance/field-help';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { decodeAssignee, dueAtFromDay, taskPriorityKey } from '../../shared/tasks/task-display';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ObligationsApi } from './data/obligations-api';
import {
  DEFAULT_FOLLOW_UP_DAYS,
  Duty,
  DutyResult,
  ENTITY_TYPE,
  EVALUATION_RESULTS,
  Evaluation,
  EvaluationCreate,
  EvaluationResult,
  MAX_EVIDENCE_ATTACHMENTS,
  MAX_EVIDENCE_REFS,
  MAX_EVIDENCE_URLS,
  NON_COMPLIANT_RESULTS,
  Obligation,
} from './data/obligation.models';
import {
  addDaysIso,
  isFailing,
  resultKey,
  safeUrl,
  todayIso,
  urlHost,
} from './data/obligation-display';
import { obligationErrorKey } from './data/obligation-errors';
import { ObligationRecordPicker } from './obligation-record-picker';

/** Whether an evaluation result calls for findings and a follow-up. */
export function needsFollowUp(result: string): boolean {
  return (NON_COMPLIANT_RESULTS as readonly string[]).includes(result);
}

/**
 * The overall result of per-duty results (mirrors the backend): all compliant →
 * compliant, all non-compliant → non-compliant, a mix → partially compliant; not
 * applicable duties are ignored unless every duty is not applicable. Null without results.
 */
export function overallResult(
  results: readonly (string | null | undefined)[],
): EvaluationResult | null {
  const values = results.filter((r): r is EvaluationResult =>
    (EVALUATION_RESULTS as readonly string[]).includes(r ?? ''),
  );
  if (values.length === 0) {
    return null;
  }
  const relevant = values.filter((v) => v !== 'not_applicable');
  if (relevant.length === 0) {
    return 'not_applicable';
  }
  if (relevant.every((v) => v === 'compliant')) {
    return 'compliant';
  }
  if (relevant.every((v) => v === 'non_compliant')) {
    return 'non_compliant';
  }
  return 'partially_compliant';
}

/** How a gap is followed up (one is required for a partial / non-compliant result). */
export type Resolution = 'task' | 'deviation_new' | 'deviation_existing' | 'justification';
export const RESOLUTIONS: readonly Resolution[] = [
  'task',
  'deviation_new',
  'deviation_existing',
  'justification',
];

/** What a recorded evaluation is missing before it can be saved (i18n keys), in form order. */
export function evaluationProblems(input: {
  readonly result: EvaluationResult | null;
  readonly evaluatedOn: string;
  readonly today: string;
  readonly notes: string;
  readonly resolution: Resolution;
  readonly taskTitle: string;
  readonly deviation: SearchHit | null;
  readonly justification: string;
}): string[] {
  const out: string[] = [];
  if (!input.evaluatedOn || input.evaluatedOn > input.today) {
    out.push('obligations.evaluations.problems.date');
  }
  if (!input.result) {
    out.push('obligations.evaluations.problems.result');
    return out;
  }
  if (needsFollowUp(input.result)) {
    if (!input.notes.trim()) {
      out.push('obligations.evaluations.problems.findings');
    }
    if (
      (input.resolution === 'task' && !input.taskTitle.trim()) ||
      (input.resolution === 'deviation_existing' && !input.deviation) ||
      (input.resolution === 'justification' && !input.justification.trim())
    ) {
      out.push(`obligations.evaluations.problems.${input.resolution}`);
    }
  }
  return out;
}

/**
 * Compliance evaluations of an obligation: the history (overall result, the result
 * per duty, findings, evidence from other records, links and files, the follow-up
 * task or deviation) and the form to record a new one. A partial or non-compliant
 * result needs findings and one way forward: a follow-up task, a new deviation
 * (opened right after saving, linked both ways), an existing deviation or a written
 * justification. Recording completes the open evaluation task.
 */
@Component({
  selector: 'app-obligation-evaluations',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    EntityChip,
    LocalDayPipe,
    AssigneeSelect,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    StatusBadge,
    ObligationRecordPicker,
  ],
  viewProviders: [provideSharedScope('tasks', 'kit')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-ob-eval-h" id="obligation-evaluations">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="cf-ob-eval-h"
          class="flex items-center gap-1.5 font-display text-card font-bold text-fg"
        >
          {{ 'obligations.evaluations.title' | transloco }}
          @if (items().length) {
            <span class="rounded-full bg-surface-2 px-1.5 text-micro font-semibold text-fg-muted">{{
              items().length
            }}</span>
          }
          <app-field-help scope="obligations" page="detail" field="evaluations" />
        </h2>
        @if (canRecord() && !adding()) {
          <app-button variant="secondary" size="sm" (click)="open()" data-testid="evaluation-add">
            <app-icon name="checkcircle" [size]="14" />
            {{ 'obligations.evaluations.record' | transloco }}
          </app-button>
        }
      </div>
      @if (obligation().status === 'retired') {
        <p class="mt-1 text-meta text-fg-muted">
          {{ 'obligations.evaluations.retired' | transloco }}
        </p>
      }

      @if (adding()) {
        <form
          class="my-3 flex flex-col gap-4 rounded-tile border border-border p-3 sm:p-4"
          (submit)="$event.preventDefault(); save()"
          novalidate
          data-testid="evaluation-form"
        >
          <h3 class="text-card font-semibold text-fg">
            {{ 'obligations.evaluations.formTitle' | transloco }}
          </h3>
          <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            <app-form-field
              [label]="'obligations.evaluations.evaluatedOn' | transloco"
              inputId="cf-ev-date"
            >
              <app-date-input
                inputId="cf-ev-date"
                [max]="today"
                [value]="evaluatedOn()"
                (valueChange)="evaluatedOn.set($event ?? '')"
              />
            </app-form-field>
          </div>

          @if (duties().length) {
            <fieldset data-testid="evaluation-duties">
              <legend class="mb-1 text-ui font-semibold text-fg">
                {{ 'obligations.evaluations.dutiesTitle' | transloco }}
              </legend>
              <p class="mb-2 text-meta text-fg-muted">
                {{ 'obligations.evaluations.dutiesHelp' | transloco }}
              </p>
              <ol class="flex flex-col divide-y divide-border rounded-tile border border-border">
                @for (d of duties(); track d.id) {
                  <li class="flex flex-col gap-2 px-3 py-2.5">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p class="min-w-0 flex-1 text-ui text-fg">
                        <span class="font-mono text-meta text-fg-subtle">{{ d.code }}</span>
                        <span class="ml-1.5 break-words">{{ d.title }}</span>
                      </p>
                      <label class="sr-only" [for]="'cf-ev-duty-' + d.id">{{
                        'obligations.evaluations.dutyResult' | transloco: { code: d.code }
                      }}</label>
                      <select
                        [id]="'cf-ev-duty-' + d.id"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg sm:w-56"
                        (change)="setDutyResult(d.id, $any($event.target).value)"
                        [attr.data-testid]="'evaluation-duty-' + d.code"
                      >
                        <option value="" [selected]="!dutyResults()[d.id]">
                          {{ 'obligations.evaluations.dutyNotChecked' | transloco }}
                        </option>
                        @for (r of results; track r) {
                          <option [value]="r" [selected]="dutyResults()[d.id] === r">
                            {{ resultKey(r) | transloco }}
                          </option>
                        }
                      </select>
                    </div>
                    @if (failing(dutyResults()[d.id])) {
                      <label class="sr-only" [for]="'cf-ev-duty-note-' + d.id">{{
                        'obligations.evaluations.dutyNote' | transloco: { code: d.code }
                      }}</label>
                      <input
                        [id]="'cf-ev-duty-note-' + d.id"
                        type="text"
                        maxlength="2000"
                        class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                        [placeholder]="'obligations.evaluations.dutyNotePlaceholder' | transloco"
                        [value]="dutyNotes()[d.id] ?? ''"
                        (input)="setDutyNote(d.id, $any($event.target).value)"
                      />
                    }
                  </li>
                }
              </ol>
            </fieldset>
          }

          <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            <app-form-field
              [label]="'obligations.evaluations.result' | transloco"
              inputId="cf-ev-result"
            >
              <select
                id="cf-ev-result"
                (change)="setOverride($any($event.target).value)"
                data-testid="evaluation-result"
              >
                @if (duties().length) {
                  <option value="" [selected]="!override()">
                    @if (derived(); as d) {
                      {{
                        'obligations.evaluations.derived'
                          | transloco: { result: (resultKey(d) | transloco) }
                      }}
                    } @else {
                      {{ 'obligations.evaluations.derivedNone' | transloco }}
                    }
                  </option>
                } @else {
                  <option value="" disabled [selected]="!override()">
                    {{ 'obligations.evaluations.chooseResult' | transloco }}
                  </option>
                }
                @for (r of results; track r) {
                  <option [value]="r" [selected]="override() === r">
                    {{ resultKey(r) | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            @if (result(); as r) {
              <div class="flex items-end pb-2">
                <app-status-badge meaning="compliance" [value]="r" [labelKey]="resultKey(r)" />
              </div>
            }
          </div>

          <div>
            <app-form-field
              [label]="
                (followUpRelevant()
                  ? 'obligations.evaluations.notesRequired'
                  : 'obligations.evaluations.notes'
                ) | transloco
              "
              inputId="cf-ev-notes"
            >
              <textarea
                id="cf-ev-notes"
                rows="3"
                maxlength="20000"
                [placeholder]="'obligations.evaluations.notesPlaceholder' | transloco"
                [value]="notes()"
                (input)="notes.set($any($event.target).value)"
                data-testid="evaluation-notes"
              ></textarea>
            </app-form-field>
          </div>

          <fieldset class="flex flex-col gap-3">
            <legend class="mb-1 flex items-center gap-1.5 text-ui font-semibold text-fg">
              {{ 'obligations.evaluations.evidenceTitle' | transloco }}
              <app-field-help scope="obligations" page="detail" field="evidence" />
            </legend>
            <div>
              <p class="mb-1 text-meta font-semibold text-fg-muted">
                {{ 'obligations.evaluations.evidenceRecords' | transloco }}
              </p>
              @if (evidence().length) {
                <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="evaluation-evidence">
                  @for (e of evidence(); track e.entity_type + e.entity_id) {
                    <li class="inline-flex items-center gap-1">
                      <app-entity-chip [ref]="e" />
                      <button
                        type="button"
                        class="rounded-full p-1 text-fg-subtle hover:text-fail"
                        [attr.aria-label]="
                          'obligations.evaluations.removeEvidence' | transloco: { title: e.title }
                        "
                        (click)="removeEvidence(e)"
                      >
                        <app-icon name="x" [size]="12" />
                      </button>
                    </li>
                  }
                </ul>
              }
              @if (evidence().length < maxRefs) {
                <app-obligation-record-picker
                  [exclude]="evidenceKeys()"
                  placeholderKey="obligations.evaluations.evidencePlaceholder"
                  hintKey="obligations.evaluations.evidenceHint"
                  (picked)="addEvidence($event)"
                />
              }
            </div>
            <div>
              <label for="cf-ev-url" class="mb-1 block text-meta font-semibold text-fg-muted">{{
                'obligations.evaluations.evidenceLinks' | transloco
              }}</label>
              <div class="flex gap-2">
                <input
                  id="cf-ev-url"
                  type="url"
                  inputmode="url"
                  maxlength="1000"
                  placeholder="https://"
                  class="h-10 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                  [value]="urlDraft()"
                  (input)="urlDraft.set($any($event.target).value)"
                  (keydown.enter)="$event.preventDefault(); addUrl()"
                />
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="!urlValid() || urls().length >= maxUrls"
                  (click)="addUrl()"
                >
                  {{ 'obligations.evaluations.addLink' | transloco }}
                </app-button>
              </div>
              @if (urls().length) {
                <ul class="mt-2 flex flex-col gap-1">
                  @for (u of urls(); track u) {
                    <li class="flex items-center gap-2 text-ui">
                      <app-icon name="link" [size]="13" class="text-fg-subtle" />
                      <span class="min-w-0 flex-1 truncate text-fg">{{ u }}</span>
                      <button
                        type="button"
                        class="rounded-full p-1 text-fg-subtle hover:text-fail"
                        [attr.aria-label]="'obligations.evaluations.removeLink' | transloco"
                        (click)="removeUrl(u)"
                      >
                        <app-icon name="x" [size]="12" />
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
            <div>
              <p class="mb-1 text-meta font-semibold text-fg-muted">
                {{ 'obligations.evaluations.evidenceFiles' | transloco }}
              </p>
              @if (available().length === 0) {
                <p class="text-meta text-fg-muted">
                  {{ 'obligations.evaluations.noFiles' | transloco }}
                </p>
              } @else {
                <ul class="flex flex-col gap-1">
                  @for (a of available(); track a.id) {
                    <li>
                      <label class="flex items-center gap-2 text-ui text-fg">
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [checked]="files().has(a.id)"
                          [disabled]="!files().has(a.id) && files().size >= maxFiles"
                          (change)="toggleFile(a.id, $any($event.target).checked)"
                        />
                        <span class="truncate">{{ a.filename }}</span>
                      </label>
                    </li>
                  }
                </ul>
              }
            </div>
            <app-form-field
              [label]="'obligations.evaluations.evidenceSummary' | transloco"
              inputId="cf-ev-evidence"
            >
              <textarea
                id="cf-ev-evidence"
                rows="2"
                maxlength="20000"
                [placeholder]="'obligations.evaluations.evidenceSummaryPlaceholder' | transloco"
                [value]="evidenceSummary()"
                (input)="evidenceSummary.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </fieldset>

          @if (followUpRelevant()) {
            <fieldset
              class="flex flex-col gap-3 rounded-tile border border-warn/40 bg-warn-soft p-3"
              data-testid="evaluation-followup"
            >
              <legend class="px-1 text-ui font-semibold text-fg">
                {{ 'obligations.evaluations.followUpTitle' | transloco }}
              </legend>
              <p class="text-meta text-fg-muted">
                {{ 'obligations.evaluations.followUpHelp' | transloco }}
              </p>
              <div class="flex flex-col gap-1.5" role="radiogroup">
                @for (r of resolutions; track r) {
                  <label class="flex items-start gap-2 text-ui text-fg">
                    <input
                      type="radio"
                      name="cf-ev-resolution"
                      class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      [value]="r"
                      [checked]="resolution() === r"
                      (change)="resolution.set(r)"
                      [attr.data-testid]="'evaluation-resolution-' + r"
                    />
                    <span>
                      <span class="font-semibold">{{
                        'obligations.evaluations.resolutions.' + r | transloco
                      }}</span>
                      <span class="block text-meta text-fg-muted">{{
                        'obligations.evaluations.resolutionHelp.' + r | transloco
                      }}</span>
                    </span>
                  </label>
                }
              </div>

              @switch (resolution()) {
                @case ('task') {
                  <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
                    <div class="sm:col-span-2">
                      <app-form-field
                        [label]="'obligations.actions.titleLabel' | transloco"
                        inputId="cf-ev-fu-title"
                      >
                        <input
                          id="cf-ev-fu-title"
                          type="text"
                          maxlength="255"
                          [placeholder]="'obligations.evaluations.taskPlaceholder' | transloco"
                          [value]="fuTitle()"
                          (input)="fuTitle.set($any($event.target).value)"
                          data-testid="evaluation-followup-title"
                        />
                      </app-form-field>
                    </div>
                    <app-form-field
                      [label]="'obligations.actions.assignee' | transloco"
                      inputId="cf-ev-fu-assignee"
                    >
                      <app-assignee-select
                        inputId="cf-ev-fu-assignee"
                        [value]="fuAssignee()"
                        [currentName]="obligation().owner?.name ?? null"
                        (valueChange)="fuAssignee.set($event)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'obligations.actions.dueDate' | transloco"
                      inputId="cf-ev-fu-due"
                    >
                      <app-date-input
                        inputId="cf-ev-fu-due"
                        [value]="fuDue()"
                        (valueChange)="fuDue.set($event ?? '')"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'obligations.actions.priority' | transloco"
                      inputId="cf-ev-fu-priority"
                    >
                      <select
                        id="cf-ev-fu-priority"
                        (change)="fuPriority.set($any($event.target).value)"
                      >
                        @for (p of priorities; track p) {
                          <option [value]="p" [selected]="fuPriority() === p">
                            {{ priorityKey(p) | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                  </div>
                }
                @case ('deviation_new') {
                  <p class="text-meta text-fg-muted">
                    {{ 'obligations.evaluations.deviationNewNote' | transloco }}
                  </p>
                }
                @case ('deviation_existing') {
                  @if (deviation(); as dev) {
                    <div class="flex items-center gap-2">
                      <app-entity-chip [ref]="dev" />
                      <app-button variant="ghost" size="sm" (click)="deviation.set(null)">
                        {{ 'obligations.evaluations.changeDeviation' | transloco }}
                      </app-button>
                    </div>
                  } @else {
                    <app-obligation-record-picker
                      [types]="deviationTypes"
                      placeholderKey="obligations.evaluations.deviationPlaceholder"
                      hintKey="obligations.evaluations.deviationHint"
                      (picked)="deviation.set($event)"
                    />
                  }
                }
                @case ('justification') {
                  <app-form-field
                    [label]="'obligations.evaluations.justification' | transloco"
                    inputId="cf-ev-justification"
                  >
                    <textarea
                      id="cf-ev-justification"
                      rows="2"
                      maxlength="5000"
                      [placeholder]="'obligations.evaluations.justificationPlaceholder' | transloco"
                      [value]="justification()"
                      (input)="justification.set($any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                }
              }
            </fieldset>
          }

          @if (attempted() && problems().length) {
            <ul class="flex flex-col gap-1 text-meta text-fail-ink" role="alert">
              @for (p of problems(); track p) {
                <li>{{ p | transloco }}</li>
              }
            </ul>
          }

          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="busy()"
              [loading]="busy()"
              data-testid="evaluation-save"
            >
              {{
                (resolution() === 'deviation_new' && followUpRelevant()
                  ? 'obligations.evaluations.saveAndDeviation'
                  : 'obligations.evaluations.save'
                ) | transloco
              }}
            </app-button>
          </div>
        </form>
      }

      @switch (state()) {
        @case ('loading') {
          <p class="mt-2 text-ui text-fg-muted" role="status">
            {{ 'obligations.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="mt-2 text-ui text-fail-ink" role="alert">
            {{ 'obligations.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (items().length === 0) {
            <p class="mt-2 text-ui text-fg-muted" data-testid="evaluations-empty">
              {{ 'obligations.evaluations.none' | transloco }}
            </p>
          } @else {
            <ol class="mt-3 flex flex-col gap-3" data-testid="evaluation-rows">
              @for (e of items(); track e.id) {
                <li
                  class="rounded-tile border p-3 sm:p-4"
                  [class]="$first ? 'border-accent/40 bg-surface' : 'border-border'"
                  [attr.data-testid]="'evaluation-' + e.id"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <app-status-badge
                      meaning="compliance"
                      [value]="e.result"
                      [labelKey]="resultKey(e.result)"
                    />
                    <span class="text-ui font-semibold text-fg">{{
                      e.evaluated_on | localDay
                    }}</span>
                    @if (e.evaluated_by?.name; as name) {
                      <span class="text-meta text-fg-muted">
                        {{ 'obligations.evaluations.by' | transloco: { name } }}
                      </span>
                    }
                    @if ($first && items().length > 1) {
                      <span
                        class="rounded-full bg-accent-soft px-2 py-0.5 text-micro font-semibold text-accent"
                        >{{ 'obligations.evaluations.latest' | transloco }}</span
                      >
                    }
                    @if (canRemove()) {
                      <app-button
                        class="ml-auto"
                        variant="ghost"
                        size="sm"
                        [attr.aria-label]="'obligations.evaluations.remove' | transloco"
                        [attr.title]="'obligations.evaluations.remove' | transloco"
                        (click)="removing.set(e)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </app-button>
                    }
                  </div>
                  @if (e.notes) {
                    <div class="mt-3">
                      <p class="text-meta font-semibold text-fg-subtle">
                        {{ 'obligations.evaluations.findings' | transloco }}
                      </p>
                      <p class="mt-0.5 text-body whitespace-pre-line text-fg">{{ e.notes }}</p>
                    </div>
                  }
                  @if (e.justification) {
                    <div class="mt-3">
                      <p class="text-meta font-semibold text-fg-subtle">
                        {{ 'obligations.evaluations.justification' | transloco }}
                      </p>
                      <p class="mt-0.5 text-ui whitespace-pre-line text-fg">
                        {{ e.justification }}
                      </p>
                    </div>
                  }
                  @if (e.duty_results?.length) {
                    <div class="mt-3">
                      <p class="text-meta font-semibold text-fg-subtle">
                        {{ 'obligations.evaluations.dutiesTitle' | transloco }}
                      </p>
                      <ul class="mt-1 flex flex-col gap-1.5 text-ui">
                        @for (r of e.duty_results; track r.duty_id) {
                          @let duty = dutyOf(r.duty_id);
                          <li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <app-status-badge
                              class="self-center"
                              meaning="compliance"
                              [value]="r.result"
                              [labelKey]="resultKey(r.result)"
                            />
                            @if (duty) {
                              <span class="font-mono text-meta text-fg-muted">{{ duty.code }}</span>
                              <span class="min-w-0 text-fg">{{ duty.title }}</span>
                            } @else {
                              <span class="text-fg-muted">—</span>
                            }
                            @if (r.note) {
                              <span class="w-full text-meta text-fg-muted">{{ r.note }}</span>
                            }
                          </li>
                        }
                      </ul>
                    </div>
                  }
                  @if (e.evidence_summary) {
                    <div class="mt-3">
                      <p class="text-meta font-semibold text-fg-subtle">
                        {{ 'obligations.evaluations.checked' | transloco }}
                      </p>
                      <p class="mt-0.5 text-ui whitespace-pre-line text-fg">
                        {{ e.evidence_summary }}
                      </p>
                    </div>
                  }
                  @if (e.evidence?.length || e.evidence_urls?.length || e.attachment_ids.length) {
                    <div class="mt-3">
                      <p class="text-meta font-semibold text-fg-subtle">
                        {{ 'obligations.evaluations.evidenceTitle' | transloco }}
                      </p>
                      <ul class="mt-1 flex flex-col items-start gap-1.5 text-meta">
                        @for (ref of e.evidence ?? []; track ref.entity_type + ref.entity_id) {
                          <li><app-entity-chip [ref]="ref" /></li>
                        }
                        @for (u of e.evidence_urls ?? []; track u) {
                          <li>
                            @if (link(u); as href) {
                              <a
                                [href]="href"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-semibold text-accent hover:underline"
                              >
                                <app-icon name="link" [size]="12" />
                                {{ host(u) }}
                              </a>
                            }
                          </li>
                        }
                        @for (id of e.attachment_ids; track id) {
                          <li
                            class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-fg-muted"
                          >
                            <app-icon name="documents" [size]="12" />
                            {{ fileName(id) }}
                          </li>
                        }
                      </ul>
                    </div>
                  }
                  @if (failing(e.result)) {
                    <div
                      class="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-meta"
                    >
                      <span class="font-semibold text-fg-subtle">{{
                        'obligations.evaluations.followUp' | transloco
                      }}</span>
                      @if (e.deviation; as dev) {
                        <app-entity-chip [ref]="dev" data-testid="evaluation-deviation" />
                      } @else if (e.task_id) {
                        <a
                          [routerLink]="['/tasks', e.task_id]"
                          class="font-semibold text-accent hover:underline"
                        >
                          {{ 'obligations.evaluations.openTask' | transloco }}
                        </a>
                      } @else if (e.justification) {
                        <span class="text-fg-muted">{{
                          'obligations.evaluations.justified' | transloco
                        }}</span>
                      } @else {
                        <span class="font-semibold text-warn-ink">{{
                          'obligations.evaluations.noFollowUp' | transloco
                        }}</span>
                      }
                      @if (!e.deviation && canRecordDeviation()) {
                        <span class="ml-auto flex flex-wrap gap-1">
                          @if (e.id === latestFailingId()) {
                            <app-button
                              variant="secondary"
                              size="sm"
                              (click)="createDeviation()"
                              [attr.data-testid]="'evaluation-create-deviation-' + e.id"
                            >
                              {{ 'obligations.evaluations.createDeviation' | transloco }}
                            </app-button>
                          }
                          <app-button
                            variant="ghost"
                            size="sm"
                            (click)="linkingFor.set(linkingFor() === e.id ? null : e.id)"
                            [attr.aria-expanded]="linkingFor() === e.id"
                          >
                            {{ 'obligations.evaluations.linkDeviation' | transloco }}
                          </app-button>
                        </span>
                      }
                    </div>
                    @if (linkingFor() === e.id) {
                      <div class="mt-2 rounded-tile border border-border bg-surface-2 p-3">
                        <app-obligation-record-picker
                          [types]="deviationTypes"
                          [busy]="busy()"
                          placeholderKey="obligations.evaluations.deviationPlaceholder"
                          hintKey="obligations.evaluations.deviationHint"
                          actionKey="obligations.evaluations.linkAction"
                          (picked)="linkDeviation(e, $event)"
                        />
                      </div>
                    }
                  }
                </li>
              }
            </ol>
          }
        }
      }

      <app-confirm-dialog
        [open]="!!removing()"
        [title]="'obligations.evaluations.removeTitle' | transloco"
        [message]="'obligations.evaluations.removeMessage' | transloco"
        [confirmLabel]="'obligations.evaluations.remove' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="removing.set(null)"
      />
    </section>
  `,
})
export class ObligationEvaluations {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly flows = inject(CreateFlowService);
  private readonly hostEl: ElementRef<HTMLElement> = inject(ElementRef);

  readonly obligation = input.required<Obligation>();
  /** Files attached to the obligation (file evidence is chosen from these). */
  readonly attachments = input<readonly Attachment[]>([]);
  /** Bump to reload. */
  readonly refresh = input(0);
  /** The updated obligation after an evaluation was recorded or removed. */
  readonly changed = output<Obligation | null>();
  /** A follow-up action task was created. */
  readonly actionAdded = output<void>();

  protected readonly results = EVALUATION_RESULTS;
  protected readonly resolutions = RESOLUTIONS;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly resultKey = resultKey;
  protected readonly failing = isFailing;
  protected readonly maxFiles = MAX_EVIDENCE_ATTACHMENTS;
  protected readonly maxRefs = MAX_EVIDENCE_REFS;
  protected readonly maxUrls = MAX_EVIDENCE_URLS;
  protected readonly deviationTypes = ['deviation'];
  protected readonly today = todayIso();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Evaluation[]>([]);
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);
  protected readonly removing = signal<Evaluation | null>(null);
  protected readonly linkingFor = signal<string | null>(null);

  protected readonly evaluatedOn = signal(todayIso());
  protected readonly dutyResults = signal<Readonly<Record<string, EvaluationResult>>>({});
  protected readonly dutyNotes = signal<Readonly<Record<string, string>>>({});
  /** An explicit overall result (empty = derived from the duties). */
  protected readonly override = signal<EvaluationResult | ''>('');
  protected readonly notes = signal('');
  protected readonly evidenceSummary = signal('');
  protected readonly evidence = signal<readonly SearchHit[]>([]);
  protected readonly urls = signal<readonly string[]>([]);
  protected readonly urlDraft = signal('');
  protected readonly files = signal<ReadonlySet<string>>(new Set());
  protected readonly resolution = signal<Resolution>('task');
  protected readonly fuTitle = signal('');
  protected readonly fuAssignee = signal('');
  protected readonly fuDue = signal('');
  protected readonly fuPriority = signal<TaskPriority>('normal');
  protected readonly deviation = signal<SearchHit | null>(null);
  protected readonly justification = signal('');

  protected readonly duties = computed<readonly Duty[]>(() => this.obligation().duties ?? []);
  protected readonly canRecord = computed(
    () => this.obligation().can_evaluate && this.obligation().status !== 'retired',
  );
  protected readonly canRecordDeviation = computed(() => this.obligation().can_evaluate);
  protected readonly canRemove = computed(() => this.obligation().can_delete);
  protected readonly available = computed(() =>
    this.attachments().filter((a) => a.status === 'available'),
  );
  protected readonly derived = computed(() => overallResult(Object.values(this.dutyResults())));
  protected readonly result = computed<EvaluationResult | null>(
    () => this.override() || this.derived(),
  );
  protected readonly followUpRelevant = computed(() => needsFollowUp(this.result() ?? ''));
  protected readonly evidenceKeys = computed(() =>
    this.evidence().map((e) => `${e.entity_type}:${e.entity_id}`),
  );
  protected readonly urlValid = computed(() => !!safeUrl(this.urlDraft()));
  protected readonly problems = computed(() =>
    evaluationProblems({
      result: this.result(),
      evaluatedOn: this.evaluatedOn(),
      today: this.today,
      notes: this.notes(),
      resolution: this.resolution(),
      taskTitle: this.fuTitle(),
      deviation: this.deviation(),
      justification: this.justification(),
    }),
  );
  /** Only the newest failing evaluation without a deviation gets one from the flow. */
  protected readonly latestFailingId = computed(
    () => this.items().find((e) => isFailing(e.result))?.id ?? null,
  );

  /** The id alone, so a refreshed obligation object does not reload the history. */
  private readonly obligationId = computed(() => this.obligation().id);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.obligationId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
  }

  protected fileName(id: string): string {
    return this.attachments().find((a) => a.id === id)?.filename ?? id.slice(0, 8);
  }

  protected dutyOf(id: string) {
    return this.duties().find((x) => x.id === id) ?? null;
  }

  protected link(url: string): string | null {
    return safeUrl(url);
  }

  protected host(url: string): string {
    return urlHost(url);
  }

  /** Open the form (also called from the page header) and bring it into view. */
  open(): void {
    this.reset();
    const owner = this.obligation().owner?.id;
    this.fuAssignee.set(owner ? `user:${owner}` : '');
    this.fuDue.set(addDaysIso(DEFAULT_FOLLOW_UP_DAYS));
    this.adding.set(true);
    setTimeout(() => {
      const form = this.hostEl.nativeElement.querySelector<HTMLElement>('form');
      form?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      form?.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
    });
  }

  protected setDutyResult(dutyId: string, value: string): void {
    const next = { ...this.dutyResults() };
    if ((EVALUATION_RESULTS as readonly string[]).includes(value)) {
      next[dutyId] = value as EvaluationResult;
    } else {
      delete next[dutyId];
    }
    this.dutyResults.set(next);
    this.suggestTaskTitle();
  }

  protected setDutyNote(dutyId: string, value: string): void {
    this.dutyNotes.set({ ...this.dutyNotes(), [dutyId]: value });
  }

  protected setOverride(value: string): void {
    this.override.set(
      (EVALUATION_RESULTS as readonly string[]).includes(value) ? (value as EvaluationResult) : '',
    );
  }

  protected addEvidence(hit: SearchHit): void {
    if (
      this.evidence().length < MAX_EVIDENCE_REFS &&
      !this.evidenceKeys().includes(`${hit.entity_type}:${hit.entity_id}`)
    ) {
      this.evidence.set([...this.evidence(), hit]);
    }
  }

  protected removeEvidence(hit: SearchHit): void {
    this.evidence.set(
      this.evidence().filter(
        (e) => !(e.entity_type === hit.entity_type && e.entity_id === hit.entity_id),
      ),
    );
  }

  protected addUrl(): void {
    const url = safeUrl(this.urlDraft());
    if (url && !this.urls().includes(url) && this.urls().length < MAX_EVIDENCE_URLS) {
      this.urls.set([...this.urls(), url]);
      this.urlDraft.set('');
    }
  }

  protected removeUrl(url: string): void {
    this.urls.set(this.urls().filter((u) => u !== url));
  }

  protected toggleFile(id: string, on: boolean): void {
    const next = new Set(this.files());
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.files.set(next);
  }

  protected reset(): void {
    this.adding.set(false);
    this.attempted.set(false);
    this.evaluatedOn.set(todayIso());
    this.dutyResults.set({});
    this.dutyNotes.set({});
    this.override.set('');
    this.notes.set('');
    this.evidenceSummary.set('');
    this.evidence.set([]);
    this.urls.set([]);
    this.urlDraft.set('');
    this.files.set(new Set());
    this.resolution.set('task');
    this.fuTitle.set('');
    this.fuAssignee.set('');
    this.fuDue.set('');
    this.fuPriority.set('normal');
    this.deviation.set(null);
    this.justification.set('');
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.attempted.set(true);
    if (!orgId || this.problems().length > 0 || this.busy()) {
      return;
    }
    const failing = this.followUpRelevant();
    const resolution = this.resolution();
    const dutyResults: DutyResult[] = Object.entries(this.dutyResults()).map(
      ([duty_id, result]) => ({
        duty_id,
        result,
        note: this.dutyNotes()[duty_id]?.trim() || null,
      }),
    );
    const body: EvaluationCreate = {
      result: this.override() || (dutyResults.length ? null : this.result()),
      evaluated_on: this.evaluatedOn(),
      notes: this.notes().trim() || null,
      evidence_summary: this.evidenceSummary().trim() || null,
      attachment_ids: [...this.files()],
      evidence_refs: this.evidence().map((e) => ({
        entity_type: e.entity_type,
        entity_id: e.entity_id,
      })),
      evidence_urls: [...this.urls()],
      duty_results: dutyResults,
      follow_up:
        failing && resolution === 'task'
          ? {
              title: this.fuTitle().trim(),
              assignee: decodeAssignee(this.fuAssignee()),
              due_at: dueAtFromDay(this.fuDue()),
              priority: this.fuPriority(),
            }
          : null,
      deviation_id:
        failing && resolution === 'deviation_existing'
          ? (this.deviation()?.entity_id ?? null)
          : null,
      create_deviation: failing && resolution === 'deviation_new',
      justification: failing && resolution === 'justification' ? this.justification().trim() : null,
    };
    this.busy.set(true);
    this.api.evaluate(orgId, this.obligation().id, body).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.reset();
        this.notifications.success('obligations.notices.evaluated', {
          code: created.obligation.code,
        });
        this.items.set([created.evaluation, ...this.items()]);
        this.changed.emit(created.obligation);
        if (created.follow_up_task_id) {
          this.actionAdded.emit();
        }
        if (body.create_deviation) {
          this.createDeviation();
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  /** Open the deviation form pre-filled from the obligation; it is linked back on save. */
  protected createDeviation(): void {
    void this.flows.start('obligation.to_deviation', ENTITY_TYPE, this.obligation().id);
  }

  protected linkDeviation(evaluation: Evaluation, hit: SearchHit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .setEvaluationDeviation(orgId, this.obligation().id, evaluation.id, hit.entity_id)
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.linkingFor.set(null);
          this.items.set(this.items().map((e) => (e.id === updated.id ? updated : e)));
          this.notifications.success('obligations.notices.deviationLinked', {
            code: hit.code ?? hit.title,
          });
          this.changed.emit(null);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(obligationErrorKey(error));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.removing();
    if (!orgId || !target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeEvaluation(orgId, this.obligation().id, target.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.items.set(this.items().filter((e) => e.id !== target.id));
        this.notifications.success('obligations.notices.evaluationRemoved');
        this.changed.emit(null);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  /** "Lukk: <first failing duty>" while the user has not written a title. */
  private suggestTaskTitle(): void {
    const results = this.dutyResults();
    const failingDuty = this.duties().find((d) => isFailing(results[d.id]));
    const current = this.fuTitle().trim();
    if (!current || current === this.suggested) {
      this.suggested = failingDuty ? `${failingDuty.code}: ${failingDuty.title}`.slice(0, 255) : '';
      this.fuTitle.set(this.suggested);
    }
  }

  private suggested = '';

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.evaluations(orgId, id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
