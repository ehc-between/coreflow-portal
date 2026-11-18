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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { KitApi } from '../../core/kit/kit-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { FieldLabel } from './components/field-label';
import { RecordPicker } from './components/record-picker';
import { UserSelect, userIdOf } from './components/user-select';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import {
  CREATABLE_MEETING_KINDS,
  CreateMeetingRequest,
  MEETING_KINDS,
  MeetingDetail,
  MeetingKind,
  RelatedRef,
  UpdateMeetingRequest,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  fromLocalInput,
  meetingKindKey,
  minutesOrNull,
  mrCrumbs,
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
  readonly related: readonly RelatedRef[];
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
    related: [],
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

/** The create payload (agenda: one item per non-empty line; related: what it concerns). */
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
    ...(f.related.length
      ? {
          related: f.related.map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id })),
        }
      : {}),
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

/** `?related=<entity_type>:<id>` of a meeting started from another record. */
export function relatedParam(value: string | null): { type: string; id: string } | null {
  const match = /^([a-z_]{2,32}):([0-9a-f-]{36})$/i.exec(value ?? '');
  return match ? { type: match[1], id: match[2] } : null;
}

/** `?kind=` of a meeting started from another module (e.g. `safety` from HSE). */
export function kindParam(value: string | null): MeetingKind | null {
  return value && (CREATABLE_MEETING_KINDS as readonly string[]).includes(value)
    ? (value as MeetingKind)
    : null;
}

let nextId = 0;

/**
 * `/management-review/meetings/new` and `.../:id/edit`: a meeting's title, type,
 * what it concerns ("Gjelder": an audit, a project, a deviation…), purpose, time
 * and place, chair and secretary; a new meeting can also invite people and start
 * with an agenda. Opened from another record (`?related=<type>:<id>`, optional
 * `?kind=`), that record is filled in. Agenda, attendees, minutes and decisions
 * are managed on the meeting page.
 */
@Component({
  selector: 'app-mr-meeting-editor',
  imports: [
    TranslocoPipe,
    WhyItMatters,
    EntityChip,
    Alert,
    Button,
    Card,
    ErrorState,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    FieldLabel,
    RecordPicker,
    UserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="
          id() ? 'managementReview.meetingForm.editTitle' : 'managementReview.meetingForm.newTitle'
        "
        descriptionKey="managementReview.meetingForm.description"
        [breadcrumbs]="crumbs()"
        [settingsLink]="settingsLink"
      />
      <app-help-strip [scope]="scope" page="meetingForm" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="5" />
      } @else if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (existing()?.can_edit === false) {
        <app-alert tone="info">{{ 'managementReview.meeting.readOnly' | transloco }}</app-alert>
      } @else {
        <form novalidate (submit)="$event.preventDefault(); save()">
          <app-card>
            <div class="flex flex-col gap-5">
              @if (errorKey(); as key) {
                <app-alert tone="error">{{ key | transloco }}</app-alert>
              }
              <div>
                <app-mr-field-label
                  [controlId]="fid('title')"
                  [label]="'managementReview.fields.title' | transloco"
                />
                <app-form-field [inputId]="fid('title')">
                  <input
                    [id]="fid('title')"
                    type="text"
                    maxlength="255"
                    required
                    autocomplete="off"
                    [attr.aria-invalid]="titleMissing() || null"
                    [attr.aria-describedby]="titleMissing() ? fid('title-err') : null"
                    [value]="form().title"
                    (input)="set('title', $any($event.target).value)"
                    data-testid="mr-meeting-title"
                  />
                </app-form-field>
                @if (titleMissing()) {
                  <p [id]="fid('title-err')" class="mt-1 text-meta text-fail-ink" role="alert">
                    {{ 'managementReview.errors.title_required' | transloco }}
                  </p>
                }
              </div>
              <div>
                <app-mr-field-label
                  [controlId]="fid('kind')"
                  [label]="'managementReview.fields.kind' | transloco"
                  page="meetingForm"
                  field="kind"
                />
                <app-form-field [inputId]="fid('kind')">
                  <select
                    [id]="fid('kind')"
                    [disabled]="isReviewMeeting()"
                    (change)="set('kind', $any($event.target).value)"
                  >
                    @for (k of kindOptions(); track k) {
                      <option [value]="k" [selected]="form().kind === k">
                        {{ kindKey(k) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                @if (form().kind === 'safety') {
                  <p class="mt-1.5 text-meta text-fg-muted" data-testid="amu-hint">
                    {{ 'managementReview.meeting.amuHint' | transloco }}
                  </p>
                }
              </div>

              <div>
                <app-mr-field-label
                  [label]="'managementReview.fields.related' | transloco"
                  page="meetingForm"
                  field="related"
                />
                @if (id()) {
                  @if (existing()?.related?.length) {
                    <ul class="mb-1.5 flex flex-wrap gap-1.5">
                      @for (r of existing()?.related ?? []; track r.link_id) {
                        <li><app-entity-chip [ref]="r" /></li>
                      }
                    </ul>
                  }
                  <p class="text-meta text-fg-subtle">
                    {{ 'managementReview.meetingForm.relatedOnPage' | transloco }}
                  </p>
                } @else {
                  <app-mr-record-picker
                    [value]="form().related"
                    [label]="'managementReview.fields.related' | transloco"
                    (valueChange)="set('related', $event)"
                  />
                }
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <app-mr-field-label
                    [controlId]="fid('when')"
                    [label]="'managementReview.fields.scheduledAt' | transloco"
                  />
                  <app-form-field [inputId]="fid('when')">
                    <input
                      [id]="fid('when')"
                      type="datetime-local"
                      [value]="form().scheduled_at"
                      (input)="set('scheduled_at', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-mr-field-label
                    [controlId]="fid('dur')"
                    [label]="'managementReview.fields.duration' | transloco"
                  />
                  <app-form-field [inputId]="fid('dur')">
                    <input
                      [id]="fid('dur')"
                      type="number"
                      min="1"
                      max="1440"
                      [value]="form().duration"
                      (input)="set('duration', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div class="sm:col-span-2">
                  <app-mr-field-label
                    [controlId]="fid('loc')"
                    [label]="'managementReview.fields.location' | transloco"
                  />
                  <app-form-field [inputId]="fid('loc')">
                    <input
                      [id]="fid('loc')"
                      type="text"
                      maxlength="255"
                      [value]="form().location"
                      (input)="set('location', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-mr-field-label
                    [controlId]="fid('chair')"
                    [label]="'managementReview.fields.chair' | transloco"
                    page="meetingForm"
                    field="chair"
                  />
                  <app-form-field [inputId]="fid('chair')">
                    <app-mr-user-select
                      [inputId]="fid('chair')"
                      [value]="form().chair_user_id"
                      [currentName]="existing()?.chair?.name ?? null"
                      (valueChange)="set('chair_user_id', $event)"
                    />
                  </app-form-field>
                </div>
                <div>
                  <app-mr-field-label
                    [controlId]="fid('sec')"
                    [label]="'managementReview.fields.secretary' | transloco"
                    page="meetingForm"
                    field="secretary"
                  />
                  <app-form-field [inputId]="fid('sec')">
                    <app-mr-user-select
                      [inputId]="fid('sec')"
                      [value]="form().secretary_user_id"
                      [currentName]="existing()?.secretary?.name ?? null"
                      (valueChange)="set('secretary_user_id', $event)"
                    />
                  </app-form-field>
                </div>
              </div>
              <div>
                <app-mr-field-label
                  [controlId]="fid('purpose')"
                  [label]="'managementReview.fields.purpose' | transloco"
                  page="meetingForm"
                  field="purpose"
                />
                <app-form-field [inputId]="fid('purpose')">
                  <textarea
                    [id]="fid('purpose')"
                    rows="3"
                    maxlength="50000"
                    [value]="form().purpose"
                    (input)="set('purpose', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>

              @if (!id()) {
                <div>
                  <app-mr-field-label
                    [controlId]="fid('att')"
                    [label]="'managementReview.fields.attendees' | transloco"
                  />
                  <ul class="mb-2 flex flex-wrap gap-1.5">
                    @for (uid of form().attendee_ids; track uid) {
                      <li
                        class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-meta text-fg"
                      >
                        {{ userName(uid) }}
                        <button
                          type="button"
                          class="flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:text-fail"
                          [attr.aria-label]="
                            'managementReview.attendees.remove' | transloco: { name: userName(uid) }
                          "
                          (click)="removeAttendee(uid)"
                        >
                          <app-icon name="x" [size]="12" />
                        </button>
                      </li>
                    } @empty {
                      <li class="text-meta text-fg-subtle">
                        {{ 'managementReview.attendees.noneYet' | transloco }}
                      </li>
                    }
                  </ul>
                  <app-mr-user-select
                    [inputId]="fid('att')"
                    selectClass="h-10 w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg sm:w-[320px]"
                    noneKey="managementReview.attendees.addPerson"
                    [value]="null"
                    [exclude]="form().attendee_ids"
                    (valueChange)="addAttendee($event)"
                  />
                </div>
                <div>
                  <app-mr-field-label
                    [controlId]="fid('agenda')"
                    [label]="'managementReview.meetingForm.agenda' | transloco"
                    page="meetingForm"
                    field="agenda"
                  />
                  <app-form-field [inputId]="fid('agenda')">
                    <textarea
                      [id]="fid('agenda')"
                      rows="5"
                      [placeholder]="'managementReview.meetingForm.agendaPlaceholder' | transloco"
                      [value]="form().agenda_text"
                      (input)="set('agenda_text', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
              } @else {
                <div>
                  <app-mr-field-label
                    [controlId]="fid('reason')"
                    [label]="'managementReview.fields.changeReason' | transloco"
                  />
                  <app-form-field [inputId]="fid('reason')">
                    <input
                      [id]="fid('reason')"
                      type="text"
                      maxlength="2000"
                      [value]="form().change_reason"
                      (input)="set('change_reason', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              }
            </div>
          </app-card>

          <div
            class="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
          >
            <app-button variant="secondary" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" data-testid="mr-save-meeting">
              {{
                (id() ? 'managementReview.form.save' : 'managementReview.meetingForm.create')
                  | transloco
              }}
            </app-button>
          </div>
        </form>
        <div class="mt-8"><app-why-it-matters [scope]="scope" page="meetingForm" /></div>
      }
    </div>
  `,
})
export class MeetingEditor {
  private readonly api = inject(ManagementReviewApi);
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly options = inject(AssigneeOptionsService);
  private readonly auth = inject(AuthService);

  readonly id = input<string | undefined>(undefined);

  protected readonly scope = MR_SCOPE;
  protected readonly settingsLink = MR_SETTINGS_LINK;
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
  protected readonly kindOptions = computed<readonly MeetingKind[]>(() =>
    this.isReviewMeeting() ? MEETING_KINDS : CREATABLE_MEETING_KINDS,
  );
  protected readonly crumbs = computed(() =>
    mrCrumbs(
      { labelKey: 'managementReview.nav.meetings', link: '/management-review/meetings' },
      ...(this.existing()
        ? [{ label: this.existing()!.code, link: ['/management-review/meetings', this.id()] }]
        : []),
      {
        labelKey: this.id()
          ? 'managementReview.meetingForm.editTitle'
          : 'managementReview.meetingForm.newTitle',
      },
    ),
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

  protected reload(): void {
    this.init(this.selectedOrg.currentOrgId(), this.id());
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
      const query = this.route.snapshot.queryParamMap;
      const kind = kindParam(query.get('kind'));
      this.form.set({
        ...emptyMeetingForm(this.auth.user()?.id ?? null),
        ...(kind ? { kind } : {}),
      });
      this.state.set('ready');
      const related = relatedParam(query.get('related'));
      if (orgId && related) {
        // Started from another record: fill in what the meeting concerns.
        this.request = this.kit.entity(orgId, related.type, related.id).subscribe({
          next: (ref) => this.set('related', [ref]),
          error: () => undefined,
        });
      }
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
