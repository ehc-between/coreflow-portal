import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { CreateFromHere } from '../../../shared/kit/create-from-here';
import { Timeline } from '../../../shared/kit/timeline';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClauseRefs } from '../components/clause-refs';
import { RefSelect } from '../components/ref-select';
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
 * One finding, in a side panel of its inspection, laid out as the follow-up an auditor
 * expects (ISO 9001 / 45001 10.2): what was found (with the failed answer, its note,
 * photos and the clauses it concerns), what was done at once, the cause, follow-up
 * tasks, the deviation, closing with a note on what was done, and a later check that
 * the correction works. Serious findings (high, critical) without a deviation make
 * "Opprett avvik" the primary action. "Lag ny fra denne" creates a risk, task,
 * training need or document change from it, linked back. People with edit rights edit,
 * close, reopen and add tasks; managers delete it.
 */
@Component({
  selector: 'app-finding-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    CreateFromHere,
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
    FieldList,
    FormField,
    Icon,
    StatusBadge,
    ClauseRefs,
    RefSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = finding();
    <div class="flex flex-col gap-5" data-testid="finding-panel">
      <div class="flex flex-wrap items-center gap-1.5">
        <app-status-badge
          meaning="severity"
          [value]="f.severity"
          [labelKey]="severityKey(f.severity)"
        />
        <app-status-badge meaning="lifecycle" [value]="f.status" [labelKey]="statusKey(f.status)" />
        @if (f.is_overdue) {
          <app-status-badge meaning="lifecycle" value="overdue" />
        }
        <span class="text-meta text-fg-subtle">{{
          'inspections.findings.source.' + f.source | transloco
        }}</span>
      </div>

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
          <app-form-field [label]="'inspections.fields.description' | transloco" inputId="fp-desc">
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
            <app-form-field [label]="'inspections.fields.owner' | transloco" inputId="fp-owner">
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
              <input
                id="fp-due"
                type="date"
                [value]="edit().dueDate"
                (input)="patchEdit({ dueDate: $any($event.target).value })"
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
      } @else {
        <section
          class="flex flex-col gap-2"
          [attr.aria-label]="'inspections.findings.what' | transloco"
        >
          <h3 class="text-section font-bold text-fg" data-testid="finding-title">{{ f.title }}</h3>
          @if (showQuestion()) {
            <p class="text-meta text-fg-muted">
              {{ 'inspections.findings.fromQuestion' | transloco: { question: f.question_text } }}
            </p>
          }
          @if (f.description) {
            <p class="text-body whitespace-pre-line text-fg">{{ f.description }}</p>
          }
          @if (f.answer; as a) {
            <div
              class="rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui"
              data-testid="finding-answer"
            >
              <p class="font-semibold text-fg">
                {{ 'inspections.findings.answerWas' | transloco: { answer: answerText() } }}
              </p>
              @if (a.note && a.note.trim() !== (f.description ?? '').trim()) {
                <p class="mt-1 whitespace-pre-line text-fg-muted">{{ a.note }}</p>
              }
              @if (a.attachment_ids.length) {
                <p class="mt-1 text-meta text-fg-muted">
                  {{ 'inspections.detail.photos' | transloco: { count: a.attachment_ids.length } }}
                </p>
              }
            </div>
          }
          <app-clause-refs
            [refs]="f.question_clause_refs"
            labelKey="inspections.findings.concerns"
          />
        </section>

        @if (canEdit() && !closing()) {
          <div class="flex flex-wrap gap-2" data-testid="finding-actions">
            @if (f.status === 'open') {
              @if (escalateFirst()) {
                <app-button
                  size="sm"
                  [loading]="busy()"
                  (click)="escalate()"
                  data-testid="escalate"
                >
                  <app-icon name="flag" [size]="14" />
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
                    <app-icon name="flag" [size]="14" />
                    {{ 'inspections.findings.escalate' | transloco }}
                  </app-button>
                }
              }
            } @else {
              @if (!f.effectiveness_checked_at) {
                <app-button size="sm" (click)="checkingEffect.set(true)" data-testid="check-effect">
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
            <app-button variant="secondary" size="sm" (click)="startEdit()">
              {{ 'inspections.actions.edit' | transloco }}
            </app-button>
            <app-create-from-here [entityType]="entityType" [entityId]="f.id" />
          </div>
          @if (escalateFirst()) {
            <p class="-mt-3 text-meta text-fg-muted">
              {{ 'inspections.findings.escalateHint' | transloco }}
            </p>
          }
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

        <section [attr.aria-label]="'inspections.findings.followUp' | transloco">
          <app-field-list [columns]="2">
            <app-field-item
              labelKey="inspections.fields.owner"
              [value]="f.owner?.name ?? ('inspections.findings.noOwner' | transloco)"
            />
            <app-field-item
              labelKey="inspections.fields.dueAt"
              [value]="f.due_at ? (f.due_at | localDay) : null"
            />
            <app-field-item labelKey="inspections.findings.deviation" empty="none">
              @if (f.deviation; as dev) {
                <a [routerLink]="dev.url" class="font-semibold text-accent hover:underline">{{
                  dev.code
                }}</a>
                <app-status-badge class="ml-1.5" meaning="lifecycle" [value]="dev.status" />
              }
            </app-field-item>
            <app-field-item labelKey="inspections.findings.tasks" [value]="tasksText()" />
            <app-field-item
              labelKey="inspections.findings.immediateCorrection"
              [value]="f.immediate_correction"
              [wide]="true"
              [multiline]="true"
            />
            <app-field-item
              labelKey="inspections.findings.rootCause"
              [value]="f.root_cause"
              [wide]="true"
              [multiline]="true"
            />
            @if (f.status === 'closed' || f.closure_note) {
              <app-field-item
                labelKey="inspections.findings.closureNote"
                [value]="f.closure_note"
                [wide]="true"
                [multiline]="true"
              />
              @if (f.closed_at) {
                <app-field-item
                  labelKey="inspections.findings.closedAt"
                  [value]="
                    f.closed_by?.name
                      ? ('inspections.detail.completedBy'
                        | transloco: { date: (f.closed_at | localDate), name: f.closed_by?.name })
                      : (f.closed_at | localDate)
                  "
                />
              }
              <app-field-item labelKey="inspections.findings.effectiveness">
                @if (f.effectiveness_checked_at) {
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
                } @else {
                  <span class="text-warn-ink">{{
                    'inspections.findings.effectNotChecked' | transloco
                  }}</span>
                }
              </app-field-item>
            }
          </app-field-list>
          <div class="mt-3 flex items-start gap-1.5">
            <p class="text-meta text-fg-muted">
              {{ 'inspections.findings.vsDeviation' | transloco }}
            </p>
            <app-field-help scope="inspections" page="detail" field="finding" />
          </div>
        </section>

        @if (permissions().can_manage) {
          <div>
            <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'inspections.findings.delete' | transloco }}
            </app-button>
          </div>
        }
      }

      <app-supports-requirements
        [entityType]="entityType"
        [entityId]="f.id"
        [canEdit]="canEdit()"
      />

      <section class="border-t border-border pt-4">
        <div class="mb-1 flex justify-end gap-1.5">
          <app-ai-assist-button
            [assist]="suggestAssist"
            labelKey="inspections.ai.suggestActions"
            [input]="{ finding_id: f.id }"
            [entityType]="entityType"
            [entityId]="f.id"
            (text)="suggestion.set($event)"
          />
          <app-ask-about
            [prompt]="'inspections.findings.askCause' | transloco: { code: f.code }"
            field="root_cause"
            [fieldLabel]="'inspections.findings.rootCause' | transloco"
            [requirements]="f.question_clause_refs ?? []"
          />
        </div>
        @if (suggestion()) {
          <div
            class="mb-3 rounded-card border border-accent-border bg-accent-soft p-3 text-ui text-fg"
            data-testid="suggestion"
            [innerHTML]="suggestion() | appMarkdown"
          ></div>
        }
        @for (rev of [tasksRev()]; track rev) {
          <app-entity-tasks
            [entityType]="entityType"
            [entityId]="f.id"
            [canCreate]="false"
            [entityLabel]="f.code + ' ' + f.title"
          />
        }
        @if (canEdit() && f.status === 'open') {
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
                <input
                  id="fp-action-due"
                  type="date"
                  [value]="actionDue()"
                  (input)="actionDue.set($any($event.target).value)"
                />
              </app-form-field>
            </div>
            <div class="flex justify-end">
              <app-button
                type="submit"
                size="sm"
                variant="secondary"
                [loading]="busy()"
                [disabled]="!actionTitle().trim()"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'inspections.findings.addAction' | transloco }}
              </app-button>
            </div>
          </form>
        }
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

  readonly finding = input.required<Finding>();
  /** Rights on the finding's inspection. */
  readonly permissions = input.required<InspectionPermissions>();
  /** The failed question (to show the failing answer in its own words). */
  readonly question = input<Question | null>(null);

  readonly changed = output<Finding>();
  readonly deleted = output<string>();

  protected readonly entityType = FINDING_ENTITY_TYPE;
  protected readonly suggestAssist = ASSIST_SUGGEST_ACTIONS;
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
  protected readonly suggestion = signal('');
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
