import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { ConnectionsPanel } from '../../../shared/kit/connections-panel';
import { ConnectionsStore } from '../../../shared/kit/connections-store';
import { CreateFromHere } from '../../../shared/kit/create-from-here';
import { provideKitScope } from '../../../shared/kit/kit-scope';
import { RecordPageContext } from '../../../shared/kit/record-page-context';
import { RecordLead, RecordMeta, RecordStatusLine } from '../../../shared/kit/record-sections';
import { Timeline } from '../../../shared/kit/timeline';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClauseRefs } from '../components/clause-refs';
import { DeviationLink } from '../components/deviation-link';
import { RefSelect } from '../components/ref-select';
import { findingMissing, findingStatusSentence } from '../data/inspection-anatomy';
import {
  dateInputToIso,
  findingStatusKey,
  isSerious,
  isoToDateInput,
  severityKey,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_SUGGEST_ACTIONS,
  FINDING_ENTITY_TYPE,
  Finding,
  FindingAssignee,
  InspectionPermissions,
  Question,
  SEVERITIES,
  Severity,
  Signature,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { TextAssist } from '../data/text-assist';
import { DateInput } from '../../../shared/ui/date-input/date-input';

interface FindingEdit {
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly ownerId: string;
  readonly dueDate: string;
  readonly immediateCorrection: string;
  readonly rootCause: string;
}

/** The close form: what was done (required) and whether it was checked to work. */
export interface CloseDraft {
  readonly closureNote: string;
  readonly immediateCorrection: string;
  readonly rootCause: string;
  readonly effective: boolean;
  readonly effectivenessNote: string;
}

/** `user:<id>` / `role:<key>` / `department:<id>` -> the API's assignee (null when empty). */
export function parseAssignee(encoded: string): FindingAssignee | null {
  const match = /^(user|role|department):(.+)$/.exec(encoded);
  return match ? { type: match[1] as FindingAssignee['type'], value: match[2] } : null;
}

/** The question text differs from the finding title (else "Fra spørsmål" only repeats it). */
export function showsQuestion(f: Pick<Finding, 'title' | 'question_text'>): boolean {
  const q = f.question_text?.trim().toLowerCase();
  return !!q && q !== f.title.trim().toLowerCase();
}

/**
 * One finding, in a side panel of its inspection, on the detail-page anatomy
 * (docs/ux-guide.md §2.7) and laid out as the follow-up an auditor expects
 * (ISO 9001 / 45001 10.2). The top says what it is (type · severity · status), its
 * title and the next step (serious findings without a deviation: "Opprett avvik";
 * open: close it; closed: confirm the fix works), with the assistant in "Spør KI"
 * and "Lag ny fra denne" / delete under "Mer". "Hovedinformasjon" starts with a
 * status sentence and shows what was found (with the failed answer, its note and
 * the clauses it concerns), what was done at once, the cause, how it was closed and
 * the deviation it became. One "Oppfølging" card lists what is still missing, the
 * follow-up tasks, the requirements, the connections and the metadata; the
 * activity is last. People with edit rights edit, close, reopen and add tasks;
 * managers delete it.
 */
@Component({
  selector: 'app-finding-panel',
  imports: [
    DateInput,
    TranslocoPipe,
    FieldHelp,
    ConnectionsPanel,
    CreateFromHere,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    Timeline,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    SupportsRequirements,
    AssigneeSelect,
    EntityTasks,
    Alert,
    Button,
    ConfirmDialog,
    FieldItem,
    FormField,
    Icon,
    MenuItem,
    OverflowMenu,
    StatusBadge,
    ClauseRefs,
    DeviationLink,
    RefSelect,
  ],
  // Its own record context: the requirements and connections render as the compact
  // parts of an "Oppfølging" card (the panel sits outside the inspection's layout).
  providers: [ConnectionsStore, RecordPageContext, TextAssist],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = finding();
    <div class="flex flex-col gap-5" data-testid="finding-panel">
      <header class="flex flex-col gap-2">
        <p class="flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
          <span>{{ 'inspections.findings.typeLabel' | transloco }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="severity"
            [value]="f.severity"
            [labelKey]="severityKey(f.severity)"
          />
          <app-status-badge
            meaning="lifecycle"
            [value]="f.status"
            [labelKey]="statusKey(f.status)"
          />
          @if (f.is_overdue) {
            <app-status-badge meaning="lifecycle" value="overdue" />
          }
        </p>
        <h3 class="text-section font-bold text-fg" data-testid="finding-title">{{ f.title }}</h3>

        @if (!editing() && !closing() && !checkingEffect()) {
          <div class="flex flex-wrap items-center gap-2" data-testid="finding-actions">
            @if (canEdit()) {
              @if (f.status === 'open') {
                @if (escalateFirst()) {
                  <app-button
                    size="sm"
                    [loading]="busy()"
                    (click)="escalate()"
                    data-testid="escalate"
                  >
                    <app-icon name="alert" [size]="14" />
                    {{ 'inspections.findings.escalate' | transloco }}
                  </app-button>
                  <app-button
                    variant="secondary"
                    size="sm"
                    (click)="startClose()"
                    data-testid="close-finding"
                  >
                    {{ 'inspections.findings.close' | transloco }}
                  </app-button>
                } @else {
                  <app-button size="sm" (click)="startClose()" data-testid="close-finding">
                    {{ 'inspections.findings.close' | transloco }}
                  </app-button>
                  @if (!f.deviation && canEscalate()) {
                    <app-button
                      variant="secondary"
                      size="sm"
                      [loading]="busy()"
                      (click)="escalate()"
                      data-testid="escalate"
                    >
                      <app-icon name="alert" [size]="14" />
                      {{ 'inspections.findings.escalate' | transloco }}
                    </app-button>
                  }
                }
              } @else {
                @if (!f.effectiveness_checked_at) {
                  <app-button
                    size="sm"
                    (click)="checkingEffect.set(true)"
                    data-testid="check-effect"
                  >
                    <app-icon name="checkcircle" [size]="14" />
                    {{ 'inspections.findings.checkEffect' | transloco }}
                  </app-button>
                }
                <app-button
                  variant="secondary"
                  size="sm"
                  [loading]="busy()"
                  (click)="reopen()"
                  data-testid="reopen"
                >
                  {{ 'inspections.findings.reopen' | transloco }}
                </app-button>
              }
              <app-button
                variant="secondary"
                size="sm"
                (click)="startEdit()"
                data-testid="edit-finding"
              >
                {{ 'inspections.actions.edit' | transloco }}
              </app-button>
            }
            @if (aiAvailable()) {
              <app-overflow-menu
                icon="spark"
                [label]="'kit.detail.ask.label' | transloco"
                triggerTestId="finding-ask-menu"
              >
                <button
                  appMenuItem
                  type="button"
                  [disabled]="assist.running()"
                  (click)="suggestActions()"
                  data-testid="suggest-actions"
                >
                  <app-icon name="spark" [size]="15" />
                  {{ 'inspections.ai.suggestActions' | transloco }}
                </button>
                <button appMenuItem type="button" (click)="askCause()" data-testid="ask-cause">
                  <app-icon name="spark" [size]="15" />
                  {{ 'inspections.findings.askCauseLabel' | transloco }}
                </button>
              </app-overflow-menu>
            }
            @if (canEdit() || permissions().can_manage) {
              <app-overflow-menu triggerTestId="finding-more">
                @if (canEdit()) {
                  <app-create-from-here
                    variant="items"
                    [entityType]="entityType"
                    [entityId]="f.id"
                  />
                }
                @if (permissions().can_manage) {
                  <button
                    appMenuItem
                    type="button"
                    [danger]="true"
                    (click)="confirmDelete.set(true)"
                    data-testid="delete-finding"
                  >
                    {{ 'inspections.findings.delete' | transloco }}
                  </button>
                }
              </app-overflow-menu>
            }
          </div>
          @if (canEdit() && escalateFirst()) {
            <p class="text-meta text-fg-muted">
              {{ 'inspections.findings.escalateHint' | transloco }}
            </p>
          }
        }
      </header>

      @if (editing()) {
        <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); saveEdit()">
          <app-form-field [label]="'inspections.fields.title' | transloco" inputId="fp-title">
            <input
              id="fp-title"
              required
              maxlength="255"
              [value]="edit().title"
              (input)="patchEdit({ title: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'inspections.findings.lead.what' | transloco" inputId="fp-desc">
            <textarea
              id="fp-desc"
              rows="3"
              maxlength="20000"
              [value]="edit().description"
              (input)="patchEdit({ description: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <app-form-field [label]="'inspections.fields.severity' | transloco" inputId="fp-sev">
              <select id="fp-sev" (change)="patchEdit({ severity: $any($event.target).value })">
                @for (s of severities; track s) {
                  <option [value]="s" [selected]="s === edit().severity">
                    {{ severityKey(s) | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              [label]="'inspections.findings.lead.owner' | transloco"
              inputId="fp-owner"
            >
              <app-ref-select
                inputId="fp-owner"
                [options]="references.users()"
                [value]="edit().ownerId"
                [currentName]="f.owner?.name ?? null"
                [noneLabel]="'inspections.form.noOwner' | transloco"
                (valueChange)="patchEdit({ ownerId: $event })"
              />
            </app-form-field>
            <app-form-field [label]="'inspections.fields.dueAt' | transloco" inputId="fp-due">
              <app-date-input
                inputId="fp-due"
                [value]="edit().dueDate"
                (valueChange)="patchEdit({ dueDate: $event ?? '' })"
              />
            </app-form-field>
          </div>
          <app-form-field
            [label]="'inspections.findings.immediateCorrection' | transloco"
            inputId="fp-correction"
          >
            <textarea
              id="fp-correction"
              rows="2"
              maxlength="20000"
              [placeholder]="'inspections.findings.immediateCorrectionPlaceholder' | transloco"
              [value]="edit().immediateCorrection"
              (input)="patchEdit({ immediateCorrection: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <app-form-field [label]="'inspections.findings.rootCause' | transloco" inputId="fp-cause">
            <textarea
              id="fp-cause"
              rows="2"
              maxlength="20000"
              [placeholder]="'inspections.findings.rootCausePlaceholder' | transloco"
              [value]="edit().rootCause"
              (input)="patchEdit({ rootCause: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" size="sm" (click)="editing.set(false)">
              {{ 'inspections.actions.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [loading]="busy()"
              [disabled]="!edit().title.trim()"
            >
              {{ 'inspections.actions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (closing()) {
        <form
          class="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          (submit)="$event.preventDefault(); close()"
          data-testid="close-form"
        >
          <h3 class="text-card font-bold text-fg">
            {{ 'inspections.findings.closeTitle' | transloco }}
          </h3>
          @if ((f.open_action_count ?? 0) > 0) {
            <app-alert tone="info">{{
              'inspections.findings.openTasksWarning' | transloco: { count: f.open_action_count }
            }}</app-alert>
          }
          @if (escalateFirst()) {
            <app-alert tone="info">{{
              'inspections.findings.seriousWarning' | transloco
            }}</app-alert>
          }
          <app-form-field
            [label]="'inspections.findings.closureNote' | transloco"
            inputId="fp-closure"
          >
            <textarea
              id="fp-closure"
              rows="3"
              maxlength="20000"
              required
              [attr.aria-invalid]="closeAttempted() && !closeDraft().closureNote.trim()"
              [attr.aria-describedby]="'fp-closure-hint'"
              [placeholder]="'inspections.findings.closureNotePlaceholder' | transloco"
              [value]="closeDraft().closureNote"
              (input)="patchClose({ closureNote: $any($event.target).value })"
              data-testid="closure-note"
            ></textarea>
          </app-form-field>
          <p
            id="fp-closure-hint"
            class="-mt-2 text-meta"
            [class.text-fail]="closeAttempted() && !closeDraft().closureNote.trim()"
            [class.text-fg-muted]="!(closeAttempted() && !closeDraft().closureNote.trim())"
          >
            {{ 'inspections.findings.closureNoteHint' | transloco }}
          </p>
          <app-form-field
            [label]="'inspections.findings.immediateCorrection' | transloco"
            inputId="fp-close-correction"
          >
            <textarea
              id="fp-close-correction"
              rows="2"
              maxlength="20000"
              [value]="closeDraft().immediateCorrection"
              (input)="patchClose({ immediateCorrection: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <app-form-field
            [label]="'inspections.findings.rootCause' | transloco"
            inputId="fp-close-cause"
          >
            <textarea
              id="fp-close-cause"
              rows="2"
              maxlength="20000"
              [value]="closeDraft().rootCause"
              (input)="patchClose({ rootCause: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <label class="inline-flex min-h-8 items-start gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              [checked]="closeDraft().effective"
              (change)="patchClose({ effective: $any($event.target).checked })"
              data-testid="effective"
            />
            <span>
              {{ 'inspections.findings.effectiveNow' | transloco }}
              <span class="block text-meta text-fg-muted">{{
                'inspections.findings.effectiveHint' | transloco
              }}</span>
            </span>
          </label>
          @if (closeDraft().effective) {
            <app-form-field
              [label]="'inspections.findings.effectivenessNote' | transloco"
              inputId="fp-close-effect"
            >
              <textarea
                id="fp-close-effect"
                rows="2"
                maxlength="20000"
                [value]="closeDraft().effectivenessNote"
                (input)="patchClose({ effectivenessNote: $any($event.target).value })"
              ></textarea>
            </app-form-field>
          }
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" size="sm" (click)="closing.set(false)">
              {{ 'inspections.actions.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [loading]="busy()" data-testid="confirm-close">
              {{ 'inspections.findings.close' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (checkingEffect()) {
        <form
          class="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          (submit)="$event.preventDefault(); checkEffect()"
        >
          <h3 class="text-card font-bold text-fg">
            {{ 'inspections.findings.checkEffectTitle' | transloco }}
          </h3>
          <p class="text-ui text-fg-muted">
            {{ 'inspections.findings.effectiveHint' | transloco }}
          </p>
          <app-form-field
            [label]="'inspections.findings.effectivenessNote' | transloco"
            inputId="fp-effect-note"
          >
            <textarea
              id="fp-effect-note"
              rows="2"
              maxlength="20000"
              [value]="effectNote()"
              (input)="effectNote.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" size="sm" (click)="checkingEffect.set(false)">
              {{ 'inspections.actions.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [loading]="busy()" data-testid="confirm-effect">
              {{ 'inspections.findings.checkEffectConfirm' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (!editing()) {
        <app-record-lead [fillAction]="canEdit() ? editFn : null">
          @let line = statusLine();
          <app-record-status-line status [tone]="line.tone" data-testid="finding-status-line">
            {{ line.key | transloco: line.params }}
          </app-record-status-line>
          <app-field-item size="lead" labelKey="inspections.findings.lead.what" [wide]="true">
            @if (f.description) {
              <span class="block whitespace-pre-line">{{ f.description }}</span>
            }
            @if (f.answer; as a) {
              <span
                class="mt-2 block rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui"
                data-testid="finding-answer"
              >
                @if (showQuestion()) {
                  <span class="block text-meta text-fg-muted">
                    {{
                      'inspections.findings.fromQuestion' | transloco: { question: f.question_text }
                    }}
                  </span>
                }
                <span class="block font-semibold text-fg">
                  {{ 'inspections.findings.answerWas' | transloco: { answer: answerText() } }}
                </span>
                @if (a.note && a.note.trim() !== (f.description ?? '').trim()) {
                  <span class="mt-1 block whitespace-pre-line text-fg-muted">{{ a.note }}</span>
                }
                @if (a.attachment_ids.length) {
                  <span class="mt-1 block text-meta text-fg-muted">
                    {{
                      'inspections.detail.photos' | transloco: { count: a.attachment_ids.length }
                    }}
                  </span>
                }
              </span>
            }
            @if (f.question_clause_refs?.length) {
              <span class="mt-2 flex flex-wrap items-center gap-1 text-ui">
                <app-clause-refs
                  [refs]="f.question_clause_refs ?? []"
                  labelKey="inspections.findings.concerns"
                />
              </span>
            }
          </app-field-item>
          <app-field-item
            size="lead"
            labelKey="inspections.findings.immediateCorrection"
            [value]="f.immediate_correction"
            [multiline]="true"
          />
          <app-field-item
            size="lead"
            labelKey="inspections.findings.rootCause"
            [value]="f.root_cause"
            [multiline]="true"
          />
          @if (f.status === 'closed') {
            <app-field-item
              size="lead"
              labelKey="inspections.findings.lead.howClosed"
              [value]="f.closure_note"
              [wide]="true"
              [multiline]="true"
            />
            @if (f.effectiveness_checked_at) {
              <app-field-item
                size="lead"
                labelKey="inspections.findings.effectiveness"
                [wide]="true"
              >
                <span class="text-pass-ink">{{
                  'inspections.findings.effectChecked'
                    | transloco
                      : {
                          date: (f.effectiveness_checked_at | localDate),
                          name: f.effectiveness_checked_by?.name ?? '',
                        }
                }}</span>
                @if (f.effectiveness_note) {
                  <span class="mt-0.5 block text-ui whitespace-pre-line text-fg-muted">{{
                    f.effectiveness_note
                  }}</span>
                }
              </app-field-item>
            }
          }
          @if (f.deviation; as dev) {
            <app-field-item
              size="lead"
              labelKey="inspections.findings.lead.deviation"
              [wide]="true"
            >
              <app-deviation-link [deviation]="dev" />
            </app-field-item>
          }
        </app-record-lead>
        @if (f.status === 'open' && !f.deviation) {
          <div class="-mt-2 flex items-start gap-1.5">
            <p class="text-meta text-fg-muted">
              {{ 'inspections.findings.vsDeviation' | transloco }}
            </p>
            <app-field-help scope="inspections" page="detail" field="finding" />
          </div>
        }
      }

      @if (assist.text() || assist.running()) {
        <div
          class="rounded-card border border-accent-border bg-accent-soft p-3 text-ui text-fg"
          data-testid="suggestion"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <p class="flex items-center gap-1.5 font-semibold">
              <app-icon name="spark" [size]="14" />
              {{ 'inspections.ai.suggestTitle' | transloco }}
            </p>
            <app-button variant="ghost" size="sm" (click)="assist.clear()">
              {{ 'inspections.actions.close' | transloco }}
            </app-button>
          </div>
          @if (assist.text()) {
            <div [innerHTML]="assist.text() | appMarkdown"></div>
          } @else {
            <p class="text-fg-muted">{{ 'inspections.ai.running' | transloco }}</p>
          }
        </div>
      }

      <section
        class="flex flex-col rounded-card border border-border bg-surface shadow-card"
        aria-labelledby="fp-follow-up"
        data-testid="finding-follow-up"
      >
        <h2 id="fp-follow-up" class="px-4 pt-4 pb-1 font-display text-card font-bold text-fg">
          {{ 'kit.detail.followUp.title' | transloco }}
        </h2>
        @if (missing().length > 0) {
          <ul class="flex flex-col gap-2 px-4 pt-2 pb-4" data-testid="finding-missing">
            @for (item of missing(); track item.key) {
              <li class="flex gap-2">
                <span
                  aria-hidden="true"
                  class="mt-1.5 h-2 w-2 flex-none rounded-full bg-warn"
                ></span>
                <button
                  type="button"
                  class="inline-flex min-h-6 items-start gap-1 text-left text-ui font-semibold text-fg hover:text-accent hover:underline"
                  (click)="item.action?.()"
                >
                  {{ item.labelKey | transloco: item.params }}
                  <span aria-hidden="true" class="text-accent">→</span>
                </button>
              </li>
            }
          </ul>
        }

        <div class="border-t border-border px-4 py-4">
          @for (rev of [tasksRev()]; track rev) {
            <app-entity-tasks
              [entityType]="entityType"
              [entityId]="f.id"
              [canCreate]="false"
              [entityLabel]="f.code + ' ' + f.title"
            />
          }
          @if (canEdit() && f.status === 'open') {
            @if (addingAction()) {
              <form
                class="mt-3 flex flex-col gap-2 rounded-card border border-border p-3"
                (submit)="$event.preventDefault(); addAction()"
              >
                <app-form-field
                  [label]="'inspections.findings.actionTitle' | transloco"
                  inputId="fp-action"
                >
                  <input
                    id="fp-action"
                    maxlength="255"
                    [value]="actionTitle()"
                    [placeholder]="'inspections.findings.actionPlaceholder' | transloco"
                    (input)="actionTitle.set($any($event.target).value)"
                    data-testid="action-title"
                  />
                </app-form-field>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <app-form-field
                    [label]="'inspections.findings.actionAssignee' | transloco"
                    inputId="fp-assignee"
                  >
                    <app-assignee-select
                      inputId="fp-assignee"
                      [value]="actionAssignee()"
                      (valueChange)="actionAssignee.set($event)"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'inspections.fields.dueAt' | transloco"
                    inputId="fp-action-due"
                  >
                    <app-date-input
                      inputId="fp-action-due"
                      [value]="actionDue()"
                      (valueChange)="actionDue.set($event ?? '')"
                    />
                  </app-form-field>
                </div>
                <div class="flex justify-end gap-2">
                  <app-button variant="secondary" size="sm" (click)="addingAction.set(false)">
                    {{ 'inspections.actions.cancel' | transloco }}
                  </app-button>
                  <app-button
                    type="submit"
                    size="sm"
                    [loading]="busy()"
                    [disabled]="!actionTitle().trim()"
                  >
                    {{ 'inspections.findings.addAction' | transloco }}
                  </app-button>
                </div>
              </form>
            } @else {
              <button
                type="button"
                class="mt-2 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                (click)="addingAction.set(true)"
                data-testid="add-action"
              >
                <app-icon name="plus" [size]="13" />
                {{ 'inspections.findings.addAction' | transloco }}
              </button>
            }
          }
        </div>

        <div
          class="border-t border-border px-4 py-4 empty:hidden [&_h2]:font-display [&_h2]:text-ui"
          data-testid="finding-requirements"
        >
          <app-supports-requirements
            [entityType]="entityType"
            [entityId]="f.id"
            [canEdit]="canEdit()"
          />
          @if (pendingRequirements(); as reqs) {
            <button
              type="button"
              class="mt-2 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
              (click)="reqs.review()"
            >
              {{
                (reqs.pending === 1
                  ? 'kit.detail.followUp.confirmOne'
                  : 'kit.detail.followUp.confirm'
                ) | transloco: { count: reqs.pending }
              }}
              <span aria-hidden="true">→</span>
            </button>
          }
        </div>

        <div class="border-t border-border px-4 py-4">
          <app-connections-panel
            [entityType]="entityType"
            [entityId]="f.id"
            [canEdit]="canEdit()"
            [relatedTab]="false"
            [compact]="true"
            variant="section"
          />
        </div>

        <app-record-meta
          class="rounded-b-card border-t border-border bg-surface-2/50 px-4 py-3"
          data-testid="finding-meta"
        >
          <app-field-item
            layout="inline"
            labelKey="inspections.findings.lead.owner"
            [value]="f.owner?.name"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.fields.dueAt"
            [value]="f.due_at ? (f.due_at | localDay) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.findings.lead.source"
            [value]="'inspections.findings.source.' + f.source | transloco"
          />
          <app-field-item
            layout="inline"
            labelKey="inspections.findings.lead.registered"
            [value]="
              f.created_by?.name
                ? ('inspections.detail.completedBy'
                  | transloco: { date: (f.created_at | localDay), name: f.created_by?.name })
                : (f.created_at | localDay)
            "
          />
          @if (f.closed_at) {
            <app-field-item
              layout="inline"
              labelKey="inspections.findings.closedAt"
              [value]="
                f.closed_by?.name
                  ? ('inspections.detail.completedBy'
                    | transloco: { date: (f.closed_at | localDay), name: f.closed_by?.name })
                  : (f.closed_at | localDay)
              "
            />
          }
        </app-record-meta>
      </section>

      <section class="border-t border-border pt-4">
        <app-timeline [entityType]="entityType" [entityId]="f.id" />
      </section>
    </div>

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'inspections.findings.deleteTitle' | transloco"
      [message]="'inspections.findings.deleteMessage' | transloco: { code: f.code }"
      [confirmLabel]="'inspections.actions.delete' | transloco"
      [cancelLabel]="'inspections.actions.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(false)"
    />
  `,
})
export class FindingPanel {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly references = inject(InspectionReferences);
  private readonly ai = inject(AiAvailability);
  private readonly askPanel = inject(AskPanelService);
  private readonly page = inject(RecordPageContext);
  protected readonly assist = inject(TextAssist);

  readonly finding = input.required<Finding>();
  /** Rights on the finding's inspection. */
  readonly permissions = input.required<InspectionPermissions>();
  /** The failed question (to show the failing answer in its own words). */
  readonly question = input<Question | null>(null);

  readonly changed = output<Finding>();
  readonly deleted = output<string>();

  protected readonly entityType = FINDING_ENTITY_TYPE;
  protected readonly severities = SEVERITIES;
  protected readonly severityKey = severityKey;
  protected readonly statusKey = findingStatusKey;

  protected readonly editing = signal(false);
  protected readonly edit = signal<FindingEdit>({
    title: '',
    description: '',
    severity: 'medium',
    ownerId: '',
    dueDate: '',
    immediateCorrection: '',
    rootCause: '',
  });
  protected readonly closing = signal(false);
  protected readonly closeAttempted = signal(false);
  protected readonly closeDraft = signal<CloseDraft>({
    closureNote: '',
    immediateCorrection: '',
    rootCause: '',
    effective: false,
    effectivenessNote: '',
  });
  protected readonly checkingEffect = signal(false);
  protected readonly effectNote = signal('');
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly addingAction = signal(false);
  protected readonly actionTitle = signal('');
  protected readonly actionAssignee = signal('');
  protected readonly actionDue = signal('');
  protected readonly tasksRev = signal(0);

  private readonly orgPermissions = computed(
    () => this.selectedOrg.currentOrg()?.permissions ?? [],
  );

  /** Mirrors the server's finding edit rights (it decides; buttons only hide). */
  private readonly auth = inject(AuthService);

  /** The caller owns or created the finding. */
  private readonly ownsFinding = computed(() => {
    const me = this.auth.user()?.id;
    const f = this.finding();
    return !!me && (f.owner?.id === me || f.created_by?.id === me);
  });

  protected readonly canEdit = computed(() => {
    const p = this.permissions();
    return (
      p.can_manage ||
      (this.orgPermissions().includes('inspections:write') &&
        (p.can_perform || p.can_edit || this.ownsFinding()))
    );
  });

  protected readonly canEscalate = computed(() =>
    this.orgPermissions().includes('deviations:write'),
  );

  /** A serious, open finding without a deviation: creating one comes first. */
  protected readonly escalateFirst = computed(() => {
    const f = this.finding();
    return f.status === 'open' && !f.deviation && isSerious(f.severity) && this.canEscalate();
  });

  protected readonly showQuestion = computed(() => showsQuestion(this.finding()));

  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  /** "Fyll ut" in Hovedinformasjon: the inline editor. */
  protected readonly editFn = () => this.startEdit();

  /** "Åpent – må følges opp innen 26. nov." / "Lukket – tiltaket er kontrollert …". */
  protected readonly statusLine = computed(() => {
    const locale = this.language.locale();
    return findingStatusSentence(this.finding(), {
      day: (v) => formatLocalDay(v, 'mediumDate', locale),
    });
  });

  /** The "Oppfølging" card's to-dos. */
  protected readonly missing = computed(() =>
    findingMissing(this.finding(), {
      canEdit: this.canEdit(),
      canEscalate: this.canEscalate(),
      edit: () => this.startEdit(),
      escalate: () => this.escalate(),
      checkEffect: () => this.checkingEffect.set(true),
    }),
  );

  /** Suggested requirements waiting for a decision ("Bekreft 2 forslag"). */
  protected readonly pendingRequirements = computed(() => {
    const reqs = this.page.requirements();
    return reqs && reqs.pending > 0 && !reqs.expanded ? reqs : null;
  });

  /** "Nei" / "3 av 5" / "12 stk": the failed answer in words. */
  protected readonly answerText = computed(() => {
    const a = this.finding().answer;
    const q = this.question();
    if (!a) {
      return '';
    }
    if (a.is_na) {
      return this.language.translate('inspections.answers.na');
    }
    const v = a.value;
    if (v === 'yes' || v === 'no') {
      return this.language.translate(`inspections.answers.${v}`);
    }
    if (typeof v === 'number') {
      const n = new Intl.NumberFormat(this.language.locale()).format(v);
      if (q?.type === 'score') {
        return `${n} / ${q.scale_max}`;
      }
      return q?.unit ? `${n} ${q.unit}` : n;
    }
    if (v && typeof v === 'object') {
      return (v as Signature).name ?? '';
    }
    return v === null || v === undefined ? '' : String(v);
  });

  protected readonly tasksText = computed(() => {
    const f = this.finding();
    const all = f.action_count ?? 0;
    return all === 0
      ? this.language.translate('inspections.findings.noTasks')
      : this.language.translate('inspections.findings.tasksCount', {
          open: f.open_action_count ?? 0,
          count: all,
        });
  });

  constructor() {
    this.references.ensurePeople();
  }

  /** "Spør KI" → "Foreslå tiltak": the answer shows under Hovedinformasjon. */
  protected suggestActions(): void {
    const f = this.finding();
    this.assist.run(ASSIST_SUGGEST_ACTIONS, { finding_id: f.id }, this.entityType, f.id);
  }

  /** "Spør KI" → "Spør om årsaken". */
  protected askCause(): void {
    const f = this.finding();
    this.askPanel.askAbout(
      this.language.translate('inspections.findings.askCause', { code: f.code }),
      { field: this.language.translate('inspections.findings.rootCause') },
      { requirements: f.question_clause_refs ?? [] },
    );
  }

  protected startEdit(): void {
    const f = this.finding();
    this.edit.set({
      title: f.title,
      description: f.description ?? '',
      severity: f.severity,
      ownerId: f.owner?.id ?? '',
      dueDate: isoToDateInput(f.due_at),
      immediateCorrection: f.immediate_correction ?? '',
      rootCause: f.root_cause ?? '',
    });
    this.closing.set(false);
    this.editing.set(true);
  }

  protected patchEdit(change: Partial<FindingEdit>): void {
    this.edit.update((e) => ({ ...e, ...change }));
  }

  protected startClose(): void {
    const f = this.finding();
    this.closeDraft.set({
      closureNote: f.closure_note ?? '',
      immediateCorrection: f.immediate_correction ?? '',
      rootCause: f.root_cause ?? '',
      effective: false,
      effectivenessNote: '',
    });
    this.closeAttempted.set(false);
    this.closing.set(true);
  }

  protected patchClose(change: Partial<CloseDraft>): void {
    this.closeDraft.update((d) => ({ ...d, ...change }));
  }

  private orgId(): string | null {
    return this.selectedOrg.currentOrgId();
  }

  protected saveEdit(): void {
    const orgId = this.orgId();
    const e = this.edit();
    if (!orgId || !e.title.trim()) {
      return;
    }
    this.busy.set(true);
    this.api
      .updateFinding(orgId, this.finding().id, {
        title: e.title.trim(),
        description: e.description.trim() || null,
        severity: e.severity,
        owner_user_id: e.ownerId || null,
        due_at: dateInputToIso(e.dueDate),
        immediate_correction: e.immediateCorrection.trim() || null,
        root_cause: e.rootCause.trim() || null,
      })
      .subscribe({
        next: (f) =>
          this.done(f, 'inspections.notices.findingSaved', () => this.editing.set(false)),
        error: (err: unknown) => this.fail(err),
      });
  }

  protected close(): void {
    this.closeAttempted.set(true);
    const orgId = this.orgId();
    const d = this.closeDraft();
    if (!orgId || !d.closureNote.trim()) {
      document.getElementById('fp-closure')?.focus();
      return;
    }
    this.busy.set(true);
    this.api
      .closeFinding(orgId, this.finding().id, {
        closure_note: d.closureNote.trim(),
        immediate_correction: d.immediateCorrection.trim() || null,
        root_cause: d.rootCause.trim() || null,
        effectiveness_checked: d.effective,
        effectiveness_note: d.effective ? d.effectivenessNote.trim() || null : null,
      })
      .subscribe({
        next: (f) =>
          this.done(f, 'inspections.notices.findingClosed', () => this.closing.set(false)),
        error: (err: unknown) => this.fail(err),
      });
  }

  protected reopen(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.reopenFinding(orgId, this.finding().id).subscribe({
      next: (f) => this.done(f, 'inspections.notices.findingReopened'),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected checkEffect(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.checkEffectiveness(orgId, this.finding().id, this.effectNote()).subscribe({
      next: (f) =>
        this.done(f, 'inspections.notices.effectChecked', () => {
          this.checkingEffect.set(false);
          this.effectNote.set('');
        }),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected escalate(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.escalateFinding(orgId, this.finding().id).subscribe({
      next: (f) => this.done(f, 'inspections.notices.escalated'),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected addAction(): void {
    const orgId = this.orgId();
    const title = this.actionTitle().trim();
    if (!orgId || !title) {
      return;
    }
    this.busy.set(true);
    this.api
      .addFindingAction(orgId, this.finding().id, {
        title,
        assignee: parseAssignee(this.actionAssignee()),
        due_at: dateInputToIso(this.actionDue()),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.addingAction.set(false);
          this.actionTitle.set('');
          this.actionAssignee.set('');
          this.actionDue.set('');
          this.tasksRev.update((n) => n + 1);
          this.notifications.success('inspections.notices.actionAdded');
          this.changed.emit(this.finding());
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  protected remove(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    const id = this.finding().id;
    this.api.deleteFinding(orgId, id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('inspections.notices.findingDeleted');
        this.deleted.emit(id);
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  private done(f: Finding, notice: string, after?: () => void): void {
    this.busy.set(false);
    after?.();
    this.notifications.success(notice, { code: f.code });
    this.changed.emit(f);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(inspectionErrorKey(error));
  }
}
