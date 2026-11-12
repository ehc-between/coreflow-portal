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
import { Observable } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull, fromLocalInput } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import { RecruitmentPeople } from '../data/recruitment-people';
import {
  INTERVIEW_KINDS,
  INTERVIEW_STATUSES,
  Interview,
  InterviewKind,
  InterviewStatus,
} from '../data/recruitment.models';

interface InterviewDraft {
  readonly kind: InterviewKind;
  readonly scheduled_at: string;
  readonly duration_minutes: number;
  readonly location: string;
  readonly interviewer_user_ids: readonly string[];
  readonly notes: string;
}

function emptyDraft(): InterviewDraft {
  return {
    kind: 'video',
    scheduled_at: '',
    duration_minutes: 60,
    location: '',
    interviewer_user_ids: [],
    notes: '',
  };
}

/**
 * Interviews of an application. Scheduling adds the interviewers to the hiring team
 * and gives each of them a "submit your scorecard" task (server side).
 */
@Component({
  selector: 'app-application-interviews',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'recruitment.interviews.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <app-button size="sm" variant="secondary" (click)="openForm()" data-testid="schedule">
            <app-icon name="calendar" [size]="15" />
            {{ 'recruitment.interviews.schedule' | transloco }}
          </app-button>
        }
      </div>
      <ul class="flex flex-col gap-2">
        @for (iv of interviews(); track iv.id) {
          <li class="rounded-tile border border-border p-3 text-[13px]">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-fg">{{
                'recruitment.interviewKind.' + iv.kind | transloco
              }}</span>
              <span class="text-fg-muted">{{ iv.scheduled_at | localDate: 'medium' }}</span>
              <span class="text-fg-subtle">{{
                'recruitment.interviews.minutes' | transloco: { count: iv.duration_minutes }
              }}</span>
              <app-badge
                [tone]="
                  iv.status === 'completed'
                    ? 'pass'
                    : iv.status === 'scheduled'
                      ? 'info'
                      : 'neutral'
                "
              >
                {{ 'recruitment.interviewStatus.' + iv.status | transloco }}
              </app-badge>
            </div>
            @if (iv.location) {
              <p class="mt-1 text-fg-muted">{{ iv.location }}</p>
            }
            <p class="mt-1 text-fg-muted">
              {{ 'recruitment.interviews.with' | transloco: { names: names(iv) } }}
            </p>
            @if (iv.notes) {
              <p class="mt-1 whitespace-pre-wrap text-fg">{{ iv.notes }}</p>
            }
            @if (canEdit()) {
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <label class="sr-only" [attr.for]="'iv-status-' + iv.id">{{
                  'recruitment.fields.status' | transloco
                }}</label>
                <select
                  [id]="'iv-status-' + iv.id"
                  class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[12.5px] text-fg outline-none focus:border-accent"
                  (change)="setStatus(iv, $any($event.target).value)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="s === iv.status">
                      {{ 'recruitment.interviewStatus.' + s | transloco }}
                    </option>
                  }
                </select>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12.5px] font-semibold text-fg-muted hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  (click)="deleting.set(iv)"
                >
                  <app-icon name="trash" [size]="13" />
                  {{ 'recruitment.common.delete' | transloco }}
                </button>
              </div>
            }
          </li>
        } @empty {
          <li class="text-[13px] text-fg-muted">{{ 'recruitment.interviews.none' | transloco }}</li>
        }
      </ul>
    </app-card>

    <app-slide-over
      [open]="formOpen()"
      [title]="'recruitment.interviews.schedule' | transloco"
      [closeLabel]="'recruitment.common.close' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
        <app-form-field [label]="'recruitment.fields.interviewKind' | transloco" inputId="iv-kind">
          <select id="iv-kind" (change)="set('kind', $any($event.target).value)">
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="k === draft().kind">
                {{ 'recruitment.interviewKind.' + k | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'recruitment.fields.scheduledAt' | transloco" inputId="iv-at">
          <input
            id="iv-at"
            type="datetime-local"
            required
            [value]="draft().scheduled_at"
            (input)="set('scheduled_at', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'recruitment.fields.duration' | transloco" inputId="iv-duration">
          <input
            id="iv-duration"
            type="number"
            min="5"
            max="600"
            step="5"
            [value]="draft().duration_minutes"
            (input)="set('duration_minutes', +$any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'recruitment.fields.interviewLocation' | transloco"
          inputId="iv-location"
        >
          <input
            id="iv-location"
            maxlength="300"
            [value]="draft().location"
            (input)="set('location', $any($event.target).value)"
          />
        </app-form-field>
        <fieldset>
          <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
            {{ 'recruitment.fields.interviewers' | transloco }}
          </legend>
          <div
            class="flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-tile border border-border p-2"
          >
            @for (u of people.users(); track u.id) {
              <label class="flex items-center gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="draft().interviewer_user_ids.includes(u.id)"
                  (change)="toggleInterviewer(u.id, $any($event.target).checked)"
                />
                {{ u.name }}
              </label>
            }
          </div>
          <app-field-help scope="recruitment" page="application" field="interviewers" />
        </fieldset>
        <app-form-field
          [label]="'recruitment.fields.interviewNotes' | transloco"
          inputId="iv-notes"
        >
          <textarea
            id="iv-notes"
            rows="3"
            maxlength="5000"
            [value]="draft().notes"
            (input)="set('notes', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div class="flex justify-end gap-2">
          <app-button variant="secondary" (click)="formOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="saving()" [disabled]="!valid()">
            {{ 'recruitment.interviews.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="deleting() !== null"
      [title]="'recruitment.interviews.deleteTitle' | transloco"
      [message]="'recruitment.interviews.deleteMessage' | transloco"
      [confirmLabel]="'recruitment.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class ApplicationInterviews {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);
  protected readonly people = inject(RecruitmentPeople);

  readonly applicationId = input.required<string>();
  readonly interviews = input<readonly Interview[]>([]);
  readonly canEdit = input(false);
  /** Something changed: the host reloads the application. */
  readonly changed = output<void>();

  protected readonly kinds = INTERVIEW_KINDS;
  protected readonly statuses = INTERVIEW_STATUSES;
  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly deleting = signal<Interview | null>(null);
  protected readonly draft = signal<InterviewDraft>(emptyDraft());
  protected readonly valid = computed(() => {
    const d = this.draft();
    return (
      !!fromLocalInput(d.scheduled_at) &&
      d.interviewer_user_ids.length > 0 &&
      d.interviewer_user_ids.length <= 10 &&
      d.duration_minutes >= 5 &&
      d.duration_minutes <= 600
    );
  });

  protected names(iv: Interview): string {
    return iv.interviewers.map((u) => u.name).join(', ');
  }

  protected openForm(): void {
    this.people.ensureLoaded();
    this.draft.set(emptyDraft());
    this.formOpen.set(true);
  }

  protected set<K extends keyof InterviewDraft>(key: K, value: InterviewDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected toggleInterviewer(id: string, on: boolean): void {
    const ids = this.draft().interviewer_user_ids.filter((x) => x !== id);
    this.set('interviewer_user_ids', on ? [...ids, id] : ids);
  }

  protected save(): void {
    const orgId = this.orgId();
    const d = this.draft();
    const at = fromLocalInput(d.scheduled_at);
    if (!orgId || !at || !this.valid()) {
      return;
    }
    this.run(
      this.api.scheduleInterview(orgId, this.applicationId(), {
        kind: d.kind,
        scheduled_at: at,
        duration_minutes: d.duration_minutes,
        location: blankToNull(d.location),
        interviewer_user_ids: d.interviewer_user_ids,
        notes: blankToNull(d.notes),
      }),
      'recruitment.interviews.scheduled',
      () => this.formOpen.set(false),
    );
  }

  protected setStatus(iv: Interview, status: string): void {
    const orgId = this.orgId();
    if (orgId && status !== iv.status) {
      this.run(
        this.api.updateInterview(orgId, iv.id, { status: status as InterviewStatus }),
        'recruitment.interviews.updated',
      );
    }
  }

  protected remove(): void {
    const orgId = this.orgId();
    const iv = this.deleting();
    if (orgId && iv) {
      this.run(this.api.deleteInterview(orgId, iv.id), 'recruitment.interviews.deleted', () =>
        this.deleting.set(null),
      );
    }
  }

  private run(call: Observable<unknown>, messageKey: string, after?: () => void): void {
    this.saving.set(true);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        after?.();
        this.toasts.success(messageKey);
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.toasts.error(recruitmentError(err).key);
        this.changed.emit();
      },
    });
  }
}
