import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { UserSelect, userIdOf } from './components/user-select';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import {
  CREATABLE_MEETING_KINDS,
  CreateMeetingRequest,
  MeetingDetail,
  MeetingKind,
  UpdateMeetingRequest,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_SCOPE,
  fromLocalInput,
  meetingKindKey,
  minutesOrNull,
  textOrNull,
  toLocalInput,
} from './management-review-display';

export interface MeetingFormValue {
  readonly title: string;
  readonly kind: MeetingKind;
  readonly purpose: string;
  readonly location: string;
  readonly scheduled_at: string;
  readonly duration: string;
  readonly chair_user_id: string | null;
  readonly secretary_user_id: string | null;
  readonly attendee_ids: readonly string[];
  readonly agenda_text: string;
  readonly change_reason: string;
}

export function emptyMeetingForm(chairId: string | null): MeetingFormValue {
  return {
    title: '',
    kind: 'general',
    purpose: '',
    location: '',
    scheduled_at: '',
    duration: '60',
    chair_user_id: chairId,
    secretary_user_id: null,
    attendee_ids: [],
    agenda_text: '',
    change_reason: '',
  };
}

export function meetingToForm(m: MeetingDetail): MeetingFormValue {
  return {
    ...emptyMeetingForm(m.chair?.id ?? null),
    title: m.title,
    kind: m.kind,
    purpose: m.purpose ?? '',
    location: m.location ?? '',
    scheduled_at: toLocalInput(m.scheduled_at),
    duration: m.duration_minutes ? String(m.duration_minutes) : '',
    secretary_user_id: m.secretary?.id ?? null,
  };
}

/** The create payload (agenda: one item per non-empty line). */
export function createMeetingPayload(f: MeetingFormValue): CreateMeetingRequest {
  return {
    title: f.title.trim(),
    kind: f.kind,
    purpose: textOrNull(f.purpose),
    location: textOrNull(f.location),
    scheduled_at: fromLocalInput(f.scheduled_at),
    duration_minutes: minutesOrNull(f.duration),
    chair_user_id: f.chair_user_id,
    secretary_user_id: f.secretary_user_id,
    attendees: f.attendee_ids.map((user_id) => ({ user_id })),
    agenda: f.agenda_text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((title) => ({ title })),
  };
}

/** The update payload: only fields that changed, plus the change reason. */
export function updateMeetingPayload(
  before: MeetingDetail,
  f: MeetingFormValue,
): UpdateMeetingRequest {
  const after = createMeetingPayload(f);
  const out: Record<string, unknown> = {};
  if (after.title !== before.title) out['title'] = after.title;
  if (before.kind !== 'management_review' && after.kind !== before.kind) out['kind'] = after.kind;
  if (after.purpose !== (before.purpose ?? null)) out['purpose'] = after.purpose;
  if (after.location !== (before.location ?? null)) out['location'] = after.location;
  if (f.scheduled_at !== toLocalInput(before.scheduled_at))
    out['scheduled_at'] = after.scheduled_at;
  if (after.duration_minutes !== (before.duration_minutes ?? null)) {
    out['duration_minutes'] = after.duration_minutes;
  }
  if (after.chair_user_id !== (before.chair?.id ?? null))
    out['chair_user_id'] = after.chair_user_id;
  if (after.secretary_user_id !== (before.secretary?.id ?? null)) {
    out['secretary_user_id'] = after.secretary_user_id;
  }
  if (Object.keys(out).length) out['change_reason'] = textOrNull(f.change_reason);
  return out as UpdateMeetingRequest;
}

let nextId = 0;

/**
 * `/management-review/meetings/new` and `.../:id/edit`: a meeting's title, kind,
 * purpose, time and place, chair and secretary; a new meeting can also invite
 * people and start with an agenda. Agenda, attendees, minutes and decisions are
 * then managed on the meeting page.
 */
@Component({
  selector: 'app-mr-meeting-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    UserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="
          id() ? ['/management-review/meetings', id()] : ['/management-review/meetings']
        "
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{
          (id()
            ? 'managementReview.common.backToMeeting'
            : 'managementReview.common.backToMeetings'
          ) | transloco
        }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          (id()
            ? 'managementReview.meetingForm.editTitle'
            : 'managementReview.meetingForm.newTitle'
          ) | transloco
        }}
      </h1>

      <div class="mb-4"><app-guide-intro [scope]="scope" page="meetingForm" /></div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'managementReview.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'managementReview.common.loadFailed' | transloco }}</app-alert>
      } @else if (existing()?.can_edit === false) {
        <app-alert tone="info">{{ 'managementReview.meeting.readOnly' | transloco }}</app-alert>
      } @else {
        <app-card>
          <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
            @if (errorKey(); as key) {
              <app-alert tone="error">{{ key | transloco }}</app-alert>
            }
            <div>
              <app-form-field
                [label]="'managementReview.fields.title' | transloco"
                [inputId]="fid('title')"
              >
                <input
                  [id]="fid('title')"
                  type="text"
                  maxlength="255"
                  required
                  autocomplete="off"
                  [attr.aria-invalid]="titleMissing() || null"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-form-field>
              @if (titleMissing()) {
                <p class="mt-1 text-[12.5px] text-fail">
                  {{ 'managementReview.errors.title_required' | transloco }}
                </p>
              }
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'managementReview.fields.kind' | transloco"
                  [inputId]="fid('kind')"
                >
                  <select
                    [id]="fid('kind')"
                    [disabled]="isReviewMeeting()"
                    (change)="set('kind', $any($event.target).value)"
                  >
                    @if (isReviewMeeting()) {
                      <option value="management_review" selected>
                        {{ kindKey('management_review') | transloco }}
                      </option>
                    }
                    @for (k of kinds; track k) {
                      <option [value]="k" [selected]="form().kind === k">
                        {{ kindKey(k) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help [scope]="scope" page="meetingForm" field="kind" />
              </div>
              <app-form-field
                [label]="'managementReview.fields.scheduledAt' | transloco"
                [inputId]="fid('when')"
              >
                <input
                  [id]="fid('when')"
                  type="datetime-local"
                  [value]="form().scheduled_at"
                  (input)="set('scheduled_at', $any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'managementReview.fields.duration' | transloco"
                [inputId]="fid('dur')"
              >
                <input
                  [id]="fid('dur')"
                  type="number"
                  min="1"
                  max="1440"
                  [value]="form().duration"
                  (input)="set('duration', $any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'managementReview.fields.location' | transloco"
                [inputId]="fid('loc')"
              >
                <input
                  [id]="fid('loc')"
                  type="text"
                  maxlength="255"
                  [value]="form().location"
                  (input)="set('location', $any($event.target).value)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'managementReview.fields.chair' | transloco"
                  [inputId]="fid('chair')"
                >
                  <app-mr-user-select
                    [inputId]="fid('chair')"
                    [value]="form().chair_user_id"
                    [currentName]="existing()?.chair?.name ?? null"
                    (valueChange)="set('chair_user_id', $event)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="meetingForm" field="chair" />
              </div>
              <div>
                <app-form-field
                  [label]="'managementReview.fields.secretary' | transloco"
                  [inputId]="fid('sec')"
                >
                  <app-mr-user-select
                    [inputId]="fid('sec')"
                    [value]="form().secretary_user_id"
                    [currentName]="existing()?.secretary?.name ?? null"
                    (valueChange)="set('secretary_user_id', $event)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="meetingForm" field="secretary" />
              </div>
            </div>
            <div>
              <app-form-field
                [label]="'managementReview.fields.purpose' | transloco"
                [inputId]="fid('purpose')"
              >
                <textarea
                  [id]="fid('purpose')"
                  rows="3"
                  maxlength="50000"
                  [value]="form().purpose"
                  (input)="set('purpose', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-field-help [scope]="scope" page="meetingForm" field="purpose" />
            </div>

            @if (!id()) {
              <div>
                <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                  {{ 'managementReview.fields.attendees' | transloco }}
                </p>
                <ul class="mb-2 flex flex-wrap gap-1.5">
                  @for (uid of form().attendee_ids; track uid) {
                    <li
                      class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
                    >
                      {{ userName(uid) }}
                      <button
                        type="button"
                        class="flex rounded-full p-0.5 text-fg-subtle hover:text-fail"
                        [attr.aria-label]="
                          'managementReview.attendees.remove' | transloco: { name: userName(uid) }
                        "
                        (click)="removeAttendee(uid)"
                      >
                        <app-icon name="x" [size]="12" />
                      </button>
                    </li>
                  } @empty {
                    <li class="text-[12.5px] text-fg-subtle">
                      {{ 'managementReview.attendees.noneYet' | transloco }}
                    </li>
                  }
                </ul>
                <app-mr-user-select
                  selectClass="h-10 w-full rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg sm:w-[320px]"
                  [ariaLabel]="'managementReview.attendees.addPerson' | transloco"
                  noneKey="managementReview.attendees.addPerson"
                  [value]="null"
                  [exclude]="form().attendee_ids"
                  (valueChange)="addAttendee($event)"
                />
              </div>
              <div>
                <app-form-field
                  [label]="'managementReview.meetingForm.agenda' | transloco"
                  [inputId]="fid('agenda')"
                >
                  <textarea
                    [id]="fid('agenda')"
                    rows="5"
                    [placeholder]="'managementReview.meetingForm.agendaPlaceholder' | transloco"
                    [value]="form().agenda_text"
                    (input)="set('agenda_text', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help [scope]="scope" page="meetingForm" field="agenda" />
              </div>
            } @else {
              <app-form-field
                [label]="'managementReview.fields.changeReason' | transloco"
                [inputId]="fid('reason')"
              >
                <input
                  [id]="fid('reason')"
                  type="text"
                  maxlength="2000"
                  [value]="form().change_reason"
                  (input)="set('change_reason', $any($event.target).value)"
                />
              </app-form-field>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="secondary" (click)="cancel()">{{
                'common.cancel' | transloco
              }}</app-button>
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{
                  (id() ? 'managementReview.form.save' : 'managementReview.meetingForm.create')
                    | transloco
                }}
              </app-button>
            </div>
          </form>
        </app-card>
        <div class="mt-4"><app-why-it-matters [scope]="scope" page="meetingForm" /></div>
      }
    </div>
  `,
})
export class MeetingEditor {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  private readonly auth = inject(AuthService);

  readonly id = input<string | undefined>(undefined);

  protected readonly scope = MR_SCOPE;
  protected readonly kinds = CREATABLE_MEETING_KINDS;
  protected readonly kindKey = meetingKindKey;

  private readonly uid = ++nextId;
  protected fid(name: string): string {
    return `mr-mtgf-${this.uid}-${name}`;
  }

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly existing = signal<MeetingDetail | null>(null);
  protected readonly form = signal<MeetingFormValue>(emptyMeetingForm(null));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());
  protected readonly isReviewMeeting = computed(
    () => this.existing()?.kind === 'management_review',
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'meeting',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.existing()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.init(orgId, id));
    });
  }

  protected set<K extends keyof MeetingFormValue>(key: K, value: MeetingFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected addAttendee(userId: string | null): void {
    if (userId && !this.form().attendee_ids.includes(userId)) {
      this.set('attendee_ids', [...this.form().attendee_ids, userId]);
    }
  }

  protected removeAttendee(userId: string): void {
    this.set(
      'attendee_ids',
      this.form().attendee_ids.filter((id) => id !== userId),
    );
  }

  protected userName(userId: string): string {
    return this.options.options().users.find((u) => userIdOf(u.value) === userId)?.label ?? userId;
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(
      id ? ['/management-review/meetings', id] : ['/management-review/meetings'],
    );
  }

  protected save(): void {
    this.submitted.set(true);
    this.errorKey.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.form();
    if (!orgId || !f.title.trim() || this.saving()) {
      return;
    }
    const before = this.existing();
    const call = before
      ? this.api.updateMeeting(orgId, before.id, updateMeetingPayload(before, f))
      : this.api.createMeeting(orgId, createMeetingPayload(f));
    this.saving.set(true);
    call.subscribe({
      next: (m) => {
        this.saving.set(false);
        this.notifications.success(
          before
            ? 'managementReview.notices.meetingSaved'
            : 'managementReview.notices.meetingCreated',
        );
        void this.router.navigate(['/management-review/meetings', m.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(mrErrorKey(error));
      },
    });
  }

  private init(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    this.submitted.set(false);
    this.errorKey.set(null);
    if (!id) {
      this.existing.set(null);
      this.form.set(emptyMeetingForm(this.auth.user()?.id ?? null));
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getMeeting(orgId, id).subscribe({
      next: (m) => {
        this.existing.set(m);
        this.form.set(meetingToForm(m));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
