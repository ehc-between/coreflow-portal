import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { ManagementReviewApi } from '../data/management-review-api';
import { mrErrorKey } from '../data/management-review-errors';
import {
  ASSIST_DRAFT_MINUTES,
  ATTENDANCES,
  ATTENDEE_ROLES,
  AgendaItemIn,
  Attendance,
  AttendeeRole,
  DECISION_CATEGORIES,
  Decision,
  DecisionCategory,
  DecisionIn,
  MeetingDetail,
  MeetingStatus,
} from '../data/management-review.models';
import {
  MR_SCOPE,
  attendanceKey,
  attendeeName,
  attendeeRoleKey,
  dayOf,
  decisionCategoryKey,
  dueFromDay,
  meetingStatusKey,
  meetingStatusTone,
  meetingTransitionKey,
  meetingTransitions,
  minutesOrNull,
  minutesStatusKey,
  textOrNull,
} from '../management-review-display';
import { UserSelect } from './user-select';

/** An agenda row while the agenda is being edited (numbers as input strings). */
export interface AgendaDraft {
  readonly title: string;
  readonly notes: string;
  readonly presenter_user_id: string | null;
  readonly presenter_name: string | null;
  readonly duration: string;
}

export interface DecisionDraft {
  readonly id: string | null;
  readonly text: string;
  readonly category: DecisionCategory;
  readonly owner_user_id: string | null;
  readonly owner_name: string | null;
  readonly due: string;
  readonly create_action: boolean;
  readonly action_title: string;
  readonly has_task: boolean;
}

const EMPTY_DECISION: DecisionDraft = {
  id: null,
  text: '',
  category: 'decision',
  owner_user_id: null,
  owner_name: null,
  due: '',
  create_action: false,
  action_title: '',
  has_task: false,
};

/** The agenda payload of a draft (rows without a title are dropped). */
export function agendaPayload(rows: readonly AgendaDraft[]): AgendaItemIn[] {
  return rows
    .filter((r) => r.title.trim())
    .map((r) => ({
      title: r.title.trim(),
      notes: textOrNull(r.notes),
      presenter_user_id: r.presenter_user_id,
      duration_minutes: minutesOrNull(r.duration),
    }));
}

/** The decision payload of a draft (`create_action` only when it adds a new task). */
export function decisionPayload(d: DecisionDraft): DecisionIn {
  const createAction = d.create_action && !d.has_task;
  return {
    text: d.text.trim(),
    category: d.category,
    owner_user_id: d.owner_user_id,
    due_at: dueFromDay(d.due),
    create_action: createAction,
    action_title: createAction ? textOrNull(d.action_title) : null,
  };
}

function decisionDraft(d: Decision): DecisionDraft {
  return {
    id: d.id,
    text: d.text,
    category: d.category,
    owner_user_id: d.owner?.id ?? null,
    owner_name: d.owner?.name ?? null,
    due: dayOf(d.due_at),
    create_action: false,
    action_title: '',
    has_task: !!d.task,
  };
}

let nextId = 0;

const SMALL_SELECT =
  'h-9 rounded-[8px] border border-border bg-bg px-2 text-[12.5px] text-fg outline-none focus:border-accent disabled:opacity-60';

/**
 * The working area of a meeting, shared by the meeting page and the management
 * review page: status changes, agenda, attendees and attendance, minutes (with
 * an AI draft and approval) and decisions with follow-up actions as tasks.
 * Every change is saved straight away and the updated meeting is emitted on
 * `changed`. The server flags (`can_edit`, `locked`, `can_approve_minutes`)
 * decide what is editable.
 */
@Component({
  selector: 'app-mr-meeting-workspace',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    AiAssistButton,
    FieldHelp,
    Alert,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    PromptDialog,
    UserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @let m = meeting();
    <app-card>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-display text-[15px] font-bold text-fg">
            {{ 'managementReview.meeting.statusHeading' | transloco }}
          </h2>
          <app-badge [tone]="statusTone(m.status)">{{ statusKey(m.status) | transloco }}</app-badge>
          <app-badge [tone]="m.minutes_status === 'approved' ? 'pass' : 'neutral'">
            {{ minutesKey(m.minutes_status) | transloco }}
          </app-badge>
          @if (m.held_at) {
            <span class="text-[12.5px] text-fg-muted">{{
              'managementReview.meeting.heldAt'
                | transloco: { date: (m.held_at | localDate: 'medium') }
            }}</span>
          }
        </div>
        @if (m.can_edit && transitions().length) {
          <div class="flex flex-wrap gap-2" data-testid="meeting-transitions">
            @for (to of transitions(); track to) {
              <app-button
                size="sm"
                [variant]="
                  to === 'cancelled' ? 'ghost' : to === 'completed' ? 'primary' : 'secondary'
                "
                [disabled]="busy()"
                (click)="setStatus(to)"
              >
                {{ transitionKey(m.status, to) | transloco }}
              </app-button>
            }
          </div>
        }
      </div>
      @if (m.locked) {
        <div class="mt-3">
          <app-alert tone="info">{{
            'managementReview.meeting.lockedNotice' | transloco
          }}</app-alert>
        </div>
      }
    </app-card>

    <!-- agenda -->
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'managementReview.agenda.heading' | transloco: { count: m.agenda.length } }}
        </h2>
        @if (m.can_edit && agendaDraft() === null) {
          <app-button size="sm" variant="secondary" (click)="editAgenda()">
            {{ 'managementReview.agenda.edit' | transloco }}
          </app-button>
        }
      </div>
      @if (agendaDraft(); as rows) {
        <div class="flex flex-col gap-3" data-testid="agenda-editor">
          @for (row of rows; track $index; let i = $index) {
            <fieldset class="rounded-[10px] border border-border p-3">
              <legend class="px-1 text-[12px] font-semibold text-fg-muted">
                {{ 'managementReview.agenda.item' | transloco: { n: i + 1 } }}
              </legend>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <app-form-field
                  [label]="'managementReview.agenda.title' | transloco"
                  [inputId]="fid('agenda-title-' + i)"
                >
                  <input
                    [id]="fid('agenda-title-' + i)"
                    type="text"
                    maxlength="255"
                    [value]="row.title"
                    (input)="setAgenda(i, 'title', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'managementReview.agenda.duration' | transloco"
                  [inputId]="fid('agenda-dur-' + i)"
                >
                  <input
                    [id]="fid('agenda-dur-' + i)"
                    type="number"
                    min="1"
                    max="1440"
                    [value]="row.duration"
                    (input)="setAgenda(i, 'duration', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <app-form-field
                  [label]="'managementReview.agenda.presenter' | transloco"
                  [inputId]="fid('agenda-presenter-' + i)"
                >
                  <app-mr-user-select
                    [inputId]="fid('agenda-presenter-' + i)"
                    [value]="row.presenter_user_id"
                    [currentName]="row.presenter_name"
                    (valueChange)="setAgenda(i, 'presenter_user_id', $event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'managementReview.agenda.notes' | transloco"
                  [inputId]="fid('agenda-notes-' + i)"
                >
                  <textarea
                    [id]="fid('agenda-notes-' + i)"
                    rows="2"
                    [value]="row.notes"
                    (input)="setAgenda(i, 'notes', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <app-button
                  size="sm"
                  variant="ghost"
                  [disabled]="i === 0"
                  (click)="moveAgenda(i, -1)"
                >
                  {{ 'managementReview.agenda.moveUp' | transloco }}
                </app-button>
                <app-button
                  size="sm"
                  variant="ghost"
                  [disabled]="i === rows.length - 1"
                  (click)="moveAgenda(i, 1)"
                >
                  {{ 'managementReview.agenda.moveDown' | transloco }}
                </app-button>
                <app-button size="sm" variant="ghost" (click)="removeAgenda(i)">
                  <app-icon name="trash" [size]="13" />
                  {{ 'managementReview.agenda.remove' | transloco }}
                </app-button>
              </div>
            </fieldset>
          }
          <div class="flex flex-wrap gap-2">
            <app-button size="sm" variant="secondary" (click)="addAgenda()">
              <app-icon name="plus" [size]="13" />
              {{ 'managementReview.agenda.add' | transloco }}
            </app-button>
            <span class="flex-1"></span>
            <app-button size="sm" variant="ghost" (click)="agendaDraft.set(null)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button size="sm" [loading]="busy()" (click)="saveAgenda()">
              {{ 'managementReview.agenda.save' | transloco }}
            </app-button>
          </div>
        </div>
      } @else if (m.agenda.length === 0) {
        <p class="text-[13.5px] text-fg-muted">{{ 'managementReview.agenda.empty' | transloco }}</p>
      } @else {
        <ol class="flex flex-col gap-2" data-testid="agenda-items">
          @for (item of m.agenda; track item.id; let i = $index) {
            <li class="flex gap-3 text-[13.5px]">
              <span class="w-6 flex-none text-right font-mono text-fg-subtle">{{ i + 1 }}.</span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-fg">{{ item.title }}</p>
                <p class="text-[12px] text-fg-muted">
                  @if (item.presenter) {
                    {{ item.presenter.name }}
                  }
                  @if (item.duration_minutes) {
                    ·
                    {{
                      'managementReview.common.minutes' | transloco: { n: item.duration_minutes }
                    }}
                  }
                </p>
                @if (item.notes) {
                  <p class="mt-0.5 text-[12.5px] whitespace-pre-line text-fg-muted">
                    {{ item.notes }}
                  </p>
                }
              </div>
            </li>
          }
        </ol>
      }
    </app-card>

    <!-- attendees -->
    <app-card>
      <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
        {{ 'managementReview.attendees.heading' | transloco: { count: m.attendees.length } }}
      </h2>
      <app-field-help [scope]="scope" page="meetingDetail" field="attendance" />
      @if (m.attendees.length === 0) {
        <p class="mt-2 text-[13.5px] text-fg-muted">
          {{ 'managementReview.attendees.empty' | transloco }}
        </p>
      } @else {
        <ul class="mt-2 divide-y divide-border" data-testid="attendees">
          @for (a of m.attendees; track a.id) {
            <li class="flex flex-wrap items-center gap-2 py-2">
              <span class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">
                {{ name(a) }}
                @if (a.external) {
                  <app-badge tone="neutral">{{
                    'managementReview.attendees.external' | transloco
                  }}</app-badge>
                }
              </span>
              @if (m.can_edit) {
                <select
                  [class]="smallSelect"
                  [attr.aria-label]="
                    'managementReview.attendees.roleFor' | transloco: { name: name(a) }
                  "
                  [disabled]="busy()"
                  (change)="updateAttendee(a.id, { role: $any($event.target).value })"
                >
                  @for (r of roles; track r) {
                    <option [value]="r" [selected]="a.role === r">
                      {{ roleKey(r) | transloco }}
                    </option>
                  }
                </select>
                <select
                  [class]="smallSelect"
                  [attr.aria-label]="
                    'managementReview.attendees.attendanceFor' | transloco: { name: name(a) }
                  "
                  [disabled]="busy()"
                  (change)="updateAttendee(a.id, { attendance: $any($event.target).value })"
                >
                  @for (s of attendances; track s) {
                    <option [value]="s" [selected]="a.attendance === s">
                      {{ attendanceKey(s) | transloco }}
                    </option>
                  }
                </select>
                <button
                  type="button"
                  class="flex rounded-[6px] p-1.5 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent"
                  [attr.aria-label]="
                    'managementReview.attendees.remove' | transloco: { name: name(a) }
                  "
                  [disabled]="busy()"
                  (click)="removeAttendee(a.id)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              } @else {
                <app-badge tone="neutral">{{ roleKey(a.role) | transloco }}</app-badge>
                <app-badge [tone]="a.attendance === 'present' ? 'pass' : 'neutral'">
                  {{ attendanceKey(a.attendance) | transloco }}
                </app-badge>
              }
            </li>
          }
        </ul>
      }
      @if (m.can_edit) {
        <form
          class="mt-3 flex flex-col gap-2 rounded-[10px] border border-dashed border-border p-3"
          (submit)="$event.preventDefault(); addAttendee()"
          data-testid="attendee-form"
        >
          <div class="flex flex-wrap items-center gap-3 text-[12.5px] text-fg">
            <label class="inline-flex items-center gap-1.5">
              <input
                type="radio"
                [name]="fid('att-kind')"
                [checked]="!addExternal()"
                (change)="addExternal.set(false)"
              />
              {{ 'managementReview.attendees.member' | transloco }}
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                type="radio"
                [name]="fid('att-kind')"
                [checked]="addExternal()"
                (change)="addExternal.set(true)"
              />
              {{ 'managementReview.attendees.externalGuest' | transloco }}
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            @if (addExternal()) {
              <label class="sr-only" [for]="fid('att-name')">{{
                'managementReview.attendees.name' | transloco
              }}</label>
              <input
                [id]="fid('att-name')"
                type="text"
                maxlength="200"
                class="h-9 min-w-[180px] flex-1 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent"
                [placeholder]="'managementReview.attendees.name' | transloco"
                [value]="newAttendeeName()"
                (input)="newAttendeeName.set($any($event.target).value)"
              />
            } @else {
              <app-mr-user-select
                [selectClass]="smallSelect + ' min-w-[180px] flex-1'"
                [ariaLabel]="'managementReview.attendees.person' | transloco"
                noneKey="managementReview.attendees.choosePerson"
                [value]="newAttendeeUser()"
                [exclude]="memberIds()"
                (valueChange)="newAttendeeUser.set($event)"
              />
            }
            <select
              [class]="smallSelect"
              [attr.aria-label]="'managementReview.attendees.role' | transloco"
              (change)="newAttendeeRole.set($any($event.target).value)"
            >
              @for (r of roles; track r) {
                <option [value]="r" [selected]="newAttendeeRole() === r">
                  {{ roleKey(r) | transloco }}
                </option>
              }
            </select>
            <app-button size="sm" type="submit" [disabled]="!canAddAttendee() || busy()">
              <app-icon name="userplus" [size]="13" />
              {{ 'managementReview.attendees.add' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>

    <!-- minutes -->
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'managementReview.minutes.heading' | transloco }}
        </h2>
        <div class="flex flex-wrap gap-2">
          @if (canApprove()) {
            <app-button
              size="sm"
              data-testid="approve-minutes"
              [disabled]="busy()"
              (click)="approveMinutes()"
            >
              <app-icon name="checkcircle" [size]="14" />
              {{ 'managementReview.minutes.approve' | transloco }}
            </app-button>
          }
          @if (canManage() && m.minutes_status === 'approved') {
            <app-button
              size="sm"
              variant="secondary"
              data-testid="reopen-minutes"
              [disabled]="busy()"
              (click)="reopenOpen.set(true)"
            >
              {{ 'managementReview.minutes.reopen' | transloco }}
            </app-button>
          }
        </div>
      </div>
      @if (m.minutes_status === 'approved') {
        <p class="mb-2 text-[12.5px] text-fg-muted">
          {{
            'managementReview.minutes.approvedBy'
              | transloco
                : {
                    name: m.minutes_approved_by?.name ?? '-',
                    date: (m.minutes_approved_at | localDate: 'medium'),
                  }
          }}
        </p>
      }
      @if (minutesEditable()) {
        <app-field-help [scope]="scope" page="meetingDetail" field="minutes" />
        <app-form-field
          [label]="'managementReview.minutes.label' | transloco"
          [inputId]="fid('minutes')"
        >
          <textarea
            [id]="fid('minutes')"
            rows="10"
            maxlength="50000"
            [value]="minutesDraft()"
            (input)="minutesDraft.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <app-ai-assist-button
            [assist]="draftMinutesAssist"
            labelKey="managementReview.ai.draftMinutes"
            entityType="meeting"
            [entityId]="m.id"
            [input]="{ meeting_id: m.id, notes: minutesDraft() }"
            (text)="minutesDraft.set($event)"
          />
          <span class="text-[12px] text-fg-subtle">{{
            'managementReview.ai.draftMinutesHint' | transloco
          }}</span>
          <span class="flex-1"></span>
          <app-button
            size="sm"
            [disabled]="!minutesDirty() || busy()"
            [loading]="busy()"
            (click)="saveMinutes()"
          >
            {{ 'managementReview.minutes.save' | transloco }}
          </app-button>
        </div>
        @if (m.status !== 'completed') {
          <p class="mt-2 text-[12px] text-fg-subtle">
            {{ 'managementReview.minutes.approveAfterCompleted' | transloco }}
          </p>
        }
      } @else if (m.minutes) {
        <div class="cf-prose text-[13.5px] text-fg" [innerHTML]="m.minutes | appMarkdown"></div>
      } @else {
        <p class="text-[13.5px] text-fg-muted">
          {{ 'managementReview.minutes.empty' | transloco }}
        </p>
      }
    </app-card>

    <!-- decisions -->
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'managementReview.decisions.heading' | transloco: { count: m.decisions.length } }}
        </h2>
        @if (m.can_edit && decisionDraft() === null) {
          <app-button size="sm" variant="secondary" (click)="newDecision()">
            <app-icon name="plus" [size]="13" />
            {{ 'managementReview.decisions.add' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help [scope]="scope" page="meetingDetail" field="decisions" />
      <ng-content select="[decisionsExtra]" />
      @if (m.decisions.length === 0 && decisionDraft() === null) {
        <p class="mt-2 text-[13.5px] text-fg-muted">
          {{ 'managementReview.decisions.empty' | transloco }}
        </p>
      } @else {
        <ul class="mt-2 divide-y divide-border" data-testid="decisions">
          @for (d of m.decisions; track d.id) {
            <li class="flex flex-col gap-1 py-2.5">
              <div class="flex flex-wrap items-start gap-2">
                <app-badge tone="info">{{ categoryKey(d.category) | transloco }}</app-badge>
                <p class="min-w-0 flex-1 text-[13.5px] whitespace-pre-line text-fg">{{ d.text }}</p>
                @if (m.can_edit) {
                  <span class="flex gap-1">
                    <button
                      type="button"
                      class="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-soft"
                      (click)="editDecision(d)"
                    >
                      {{ 'managementReview.decisions.edit' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="flex rounded-[6px] p-1.5 text-fg-subtle hover:text-fail"
                      [attr.aria-label]="'managementReview.decisions.remove' | transloco"
                      [disabled]="busy()"
                      (click)="removeDecision(d.id)"
                    >
                      <app-icon name="trash" [size]="13" />
                    </button>
                  </span>
                }
              </div>
              <p class="flex flex-wrap gap-x-3 text-[12px] text-fg-muted">
                <span>{{
                  d.owner?.name ?? ('managementReview.decisions.noOwner' | transloco)
                }}</span>
                @if (d.due_at) {
                  <span>{{
                    'managementReview.decisions.dueOn' | transloco: { date: (d.due_at | localDay) }
                  }}</span>
                }
                @if (d.task; as t) {
                  <a [routerLink]="t.url" class="font-semibold text-accent hover:underline">
                    {{ 'managementReview.decisions.task' | transloco: { title: t.title } }}
                  </a>
                }
              </p>
            </li>
          }
        </ul>
      }
      @if (decisionDraft(); as d) {
        <form
          class="mt-3 flex flex-col gap-3 rounded-[10px] border border-border p-3"
          (submit)="$event.preventDefault(); saveDecision()"
          data-testid="decision-form"
        >
          <app-form-field
            [label]="'managementReview.decisions.text' | transloco"
            [inputId]="fid('dec-text')"
          >
            <textarea
              [id]="fid('dec-text')"
              rows="3"
              maxlength="10000"
              required
              [value]="d.text"
              (input)="setDecision('text', $any($event.target).value)"
            ></textarea>
          </app-form-field>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <app-form-field
              [label]="'managementReview.decisions.category' | transloco"
              [inputId]="fid('dec-cat')"
            >
              <select
                [id]="fid('dec-cat')"
                (change)="setDecision('category', $any($event.target).value)"
              >
                @for (c of categories; track c) {
                  <option [value]="c" [selected]="d.category === c">
                    {{ categoryKey(c) | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              [label]="'managementReview.decisions.owner' | transloco"
              [inputId]="fid('dec-owner')"
            >
              <app-mr-user-select
                [inputId]="fid('dec-owner')"
                [value]="d.owner_user_id"
                [currentName]="d.owner_name"
                (valueChange)="setDecision('owner_user_id', $event)"
              />
            </app-form-field>
            <app-form-field
              [label]="'managementReview.decisions.due' | transloco"
              [inputId]="fid('dec-due')"
            >
              <input
                [id]="fid('dec-due')"
                type="date"
                [value]="d.due"
                (input)="setDecision('due', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          @if (!d.has_task) {
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                [checked]="d.create_action"
                (change)="setDecision('create_action', $any($event.target).checked)"
              />
              {{ 'managementReview.decisions.createAction' | transloco }}
            </label>
            @if (d.create_action) {
              <app-form-field
                [label]="'managementReview.decisions.actionTitle' | transloco"
                [inputId]="fid('dec-action')"
              >
                <input
                  [id]="fid('dec-action')"
                  type="text"
                  maxlength="255"
                  [placeholder]="'managementReview.decisions.actionTitlePlaceholder' | transloco"
                  [value]="d.action_title"
                  (input)="setDecision('action_title', $any($event.target).value)"
                />
              </app-form-field>
            }
          }
          <div class="flex justify-end gap-2">
            <app-button size="sm" variant="ghost" (click)="decisionDraft.set(null)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              size="sm"
              type="submit"
              [disabled]="!d.text.trim() || busy()"
              [loading]="busy()"
            >
              {{ 'managementReview.decisions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>

    <app-prompt-dialog
      [open]="reopenOpen()"
      [title]="'managementReview.minutes.reopenTitle' | transloco"
      [message]="'managementReview.minutes.reopenMessage' | transloco"
      [label]="'managementReview.common.reason' | transloco"
      [confirmLabel]="'managementReview.minutes.reopen' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="reopenMinutes($event)"
      (cancelled)="reopenOpen.set(false)"
    />
  `,
})
export class MeetingWorkspace {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly meeting = input.required<MeetingDetail>();
  /** Whether the user holds `management_review:manage` (reopen approved minutes). */
  readonly canManage = input(false);
  /** The updated meeting after each saved change. */
  readonly changed = output<MeetingDetail>();

  protected readonly scope = MR_SCOPE;
  protected readonly roles = ATTENDEE_ROLES;
  protected readonly attendances = ATTENDANCES;
  protected readonly categories = DECISION_CATEGORIES;
  protected readonly draftMinutesAssist = ASSIST_DRAFT_MINUTES;
  protected readonly smallSelect = SMALL_SELECT;
  protected readonly statusKey = meetingStatusKey;
  protected readonly statusTone = meetingStatusTone;
  protected readonly minutesKey = minutesStatusKey;
  protected readonly roleKey = attendeeRoleKey;
  protected readonly attendanceKey = attendanceKey;
  protected readonly categoryKey = decisionCategoryKey;
  protected readonly transitionKey = meetingTransitionKey;
  protected readonly name = attendeeName;

  private readonly uid = ++nextId;
  protected fid(name: string): string {
    return `mr-mtg-${this.uid}-${name}`;
  }

  protected readonly busy = signal(false);
  protected readonly agendaDraft = signal<AgendaDraft[] | null>(null);
  protected readonly decisionDraft = signal<DecisionDraft | null>(null);
  protected readonly addExternal = signal(false);
  protected readonly newAttendeeUser = signal<string | null>(null);
  protected readonly newAttendeeName = signal('');
  protected readonly newAttendeeRole = signal<AttendeeRole>('participant');
  protected readonly reopenOpen = signal(false);
  protected readonly minutesDraft = linkedSignal(() => this.meeting().minutes ?? '');

  protected readonly transitions = computed(() => meetingTransitions(this.meeting()));
  protected readonly memberIds = computed(() =>
    this.meeting()
      .attendees.map((a) => a.user?.id)
      .filter((id): id is string => !!id),
  );
  protected readonly canAddAttendee = computed(() =>
    this.addExternal() ? !!this.newAttendeeName().trim() : !!this.newAttendeeUser(),
  );
  protected readonly minutesEditable = computed(
    () => this.meeting().can_edit && this.meeting().minutes_status !== 'approved',
  );
  protected readonly minutesDirty = computed(
    () => (this.minutesDraft() ?? '') !== (this.meeting().minutes ?? ''),
  );
  protected readonly canApprove = computed(() => {
    const m = this.meeting();
    return (
      m.can_approve_minutes &&
      m.status === 'completed' &&
      m.minutes_status !== 'approved' &&
      !!(m.minutes ?? '').trim() &&
      !this.minutesDirty()
    );
  });

  // --- status ------------------------------------------------------------------------

  protected setStatus(status: MeetingStatus): void {
    this.run(
      (org, id) => this.api.updateMeeting(org, id, { status }),
      'managementReview.notices.statusChanged',
    );
  }

  // --- agenda ------------------------------------------------------------------------

  protected editAgenda(): void {
    this.agendaDraft.set(
      this.meeting().agenda.map((a) => ({
        title: a.title,
        notes: a.notes ?? '',
        presenter_user_id: a.presenter?.id ?? null,
        presenter_name: a.presenter?.name ?? null,
        duration: a.duration_minutes ? String(a.duration_minutes) : '',
      })),
    );
    if (this.meeting().agenda.length === 0) {
      this.addAgenda();
    }
  }

  protected addAgenda(): void {
    this.agendaDraft.update((rows) => [
      ...(rows ?? []),
      { title: '', notes: '', presenter_user_id: null, presenter_name: null, duration: '' },
    ]);
  }

  protected setAgenda(index: number, key: keyof AgendaDraft, value: string | null): void {
    this.agendaDraft.update((rows) =>
      (rows ?? []).map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    );
  }

  protected moveAgenda(index: number, delta: number): void {
    this.agendaDraft.update((rows) => {
      const list = [...(rows ?? [])];
      const target = index + delta;
      if (target < 0 || target >= list.length) {
        return list;
      }
      [list[index], list[target]] = [list[target], list[index]];
      return list;
    });
  }

  protected removeAgenda(index: number): void {
    this.agendaDraft.update((rows) => (rows ?? []).filter((_, i) => i !== index));
  }

  protected saveAgenda(): void {
    const rows = this.agendaDraft();
    if (!rows) {
      return;
    }
    this.run(
      (org, id) => this.api.replaceAgenda(org, id, agendaPayload(rows)),
      'managementReview.notices.agendaSaved',
      () => this.agendaDraft.set(null),
    );
  }

  // --- attendees ---------------------------------------------------------------------

  protected addAttendee(): void {
    if (!this.canAddAttendee()) {
      return;
    }
    const body = this.addExternal()
      ? { name: this.newAttendeeName().trim(), role: this.newAttendeeRole() }
      : { user_id: this.newAttendeeUser(), role: this.newAttendeeRole() };
    this.run(
      (org, id) => this.api.addAttendee(org, id, body),
      'managementReview.notices.attendeeAdded',
      () => {
        this.newAttendeeUser.set(null);
        this.newAttendeeName.set('');
        this.newAttendeeRole.set('participant');
      },
    );
  }

  protected updateAttendee(
    attendeeId: string,
    body: { role?: AttendeeRole; attendance?: Attendance },
  ): void {
    this.run((org, id) => this.api.updateAttendee(org, id, attendeeId, body), null);
  }

  protected removeAttendee(attendeeId: string): void {
    this.run(
      (org, id) => this.api.removeAttendee(org, id, attendeeId),
      'managementReview.notices.attendeeRemoved',
    );
  }

  // --- minutes -----------------------------------------------------------------------

  protected saveMinutes(): void {
    const minutes = textOrNull(this.minutesDraft());
    this.run(
      (org, id) => this.api.updateMeeting(org, id, { minutes }),
      'managementReview.notices.minutesSaved',
    );
  }

  protected approveMinutes(): void {
    this.run(
      (org, id) => this.api.approveMinutes(org, id),
      'managementReview.notices.minutesApproved',
    );
  }

  protected reopenMinutes(reason: string): void {
    this.run(
      (org, id) => this.api.reopenMinutes(org, id, textOrNull(reason)),
      'managementReview.notices.minutesReopened',
      () => this.reopenOpen.set(false),
    );
  }

  // --- decisions ---------------------------------------------------------------------

  protected newDecision(): void {
    this.decisionDraft.set({ ...EMPTY_DECISION });
  }

  /** Start a decision prefilled from a suggestion (used by the review page). */
  prefillDecision(category: DecisionCategory, text: string): void {
    this.decisionDraft.set({ ...EMPTY_DECISION, category, text });
  }

  protected editDecision(d: Decision): void {
    this.decisionDraft.set(decisionDraft(d));
  }

  protected setDecision(key: keyof DecisionDraft, value: string | boolean | null): void {
    this.decisionDraft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected saveDecision(): void {
    const draft = this.decisionDraft();
    if (!draft || !draft.text.trim()) {
      return;
    }
    const body = decisionPayload(draft);
    this.run(
      (org, id) =>
        draft.id
          ? this.api.updateDecision(org, id, draft.id, body)
          : this.api.addDecision(org, id, body),
      'managementReview.notices.decisionSaved',
      () => this.decisionDraft.set(null),
    );
  }

  protected removeDecision(decisionId: string): void {
    this.run(
      (org, id) => this.api.deleteDecision(org, id, decisionId),
      'managementReview.notices.decisionRemoved',
    );
  }

  // --- plumbing ----------------------------------------------------------------------

  private run(
    call: (orgId: string, meetingId: string) => Observable<MeetingDetail>,
    successKey: string | null,
    done?: () => void,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    call(orgId, this.meeting().id).subscribe({
      next: (meeting) => {
        this.busy.set(false);
        done?.();
        if (successKey) {
          this.notifications.success(successKey);
        }
        this.changed.emit(meeting);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(mrErrorKey(error));
      },
    });
  }
}
