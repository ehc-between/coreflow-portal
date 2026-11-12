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
import { LanguageService } from '../../core/i18n/language.service';
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
  CreateReviewRequest,
  FRAMEWORKS,
  Framework,
  ReviewDetail,
  UpdateReviewRequest,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_SCOPE,
  frameworkKey,
  fromLocalInput,
  minutesOrNull,
  textOrNull,
} from './management-review-display';

/** The standard agenda of a management review (ISO HS 9.3.2), as i18n keys. */
export const STANDARD_AGENDA = [
  'previousActions',
  'changes',
  'performance',
  'resources',
  'risks',
  'improvement',
  'outputs',
] as const;

export interface ReviewFormValue {
  readonly title: string;
  readonly frameworks: readonly Framework[];
  readonly period_start: string;
  readonly period_end: string;
  readonly owner_user_id: string | null;
  readonly scheduled_at: string;
  readonly location: string;
  readonly duration: string;
  readonly chair_user_id: string | null;
  readonly attendee_ids: readonly string[];
  readonly standard_agenda: boolean;
  readonly compile_inputs: boolean;
  readonly change_reason: string;
}

export function emptyReviewForm(title: string, ownerId: string | null): ReviewFormValue {
  return {
    title,
    frameworks: [],
    period_start: '',
    period_end: '',
    owner_user_id: ownerId,
    scheduled_at: '',
    location: '',
    duration: '120',
    chair_user_id: ownerId,
    attendee_ids: [],
    standard_agenda: true,
    compile_inputs: true,
    change_reason: '',
  };
}

/** The create payload of a form value (frameworks omitted when none are picked). */
export function createReviewPayload(
  f: ReviewFormValue,
  agendaTitles: readonly string[],
): CreateReviewRequest {
  return {
    title: f.title.trim(),
    ...(f.frameworks.length ? { frameworks: f.frameworks } : {}),
    period_start: f.period_start || null,
    period_end: f.period_end || null,
    owner_user_id: f.owner_user_id,
    scheduled_at: fromLocalInput(f.scheduled_at),
    location: textOrNull(f.location),
    duration_minutes: minutesOrNull(f.duration),
    chair_user_id: f.chair_user_id,
    attendees: f.attendee_ids.map((user_id) => ({ user_id, role: 'participant' as const })),
    agenda: f.standard_agenda ? agendaTitles.map((title) => ({ title })) : [],
    compile_inputs: f.compile_inputs,
  };
}

/** The update payload: only fields that changed, plus the change reason. */
export function updateReviewPayload(before: ReviewDetail, f: ReviewFormValue): UpdateReviewRequest {
  const out: Record<string, unknown> = {};
  const title = f.title.trim();
  if (title !== before.title) out['title'] = title;
  if ([...f.frameworks].sort().join(',') !== [...before.frameworks].sort().join(',')) {
    out['frameworks'] = f.frameworks;
  }
  if ((f.period_start || null) !== before.period_start)
    out['period_start'] = f.period_start || null;
  if ((f.period_end || null) !== before.period_end) out['period_end'] = f.period_end || null;
  if (f.owner_user_id !== (before.owner?.id ?? null)) out['owner_user_id'] = f.owner_user_id;
  if (Object.keys(out).length) out['change_reason'] = textOrNull(f.change_reason);
  return out as UpdateReviewRequest;
}

const DEFAULT_TITLE_KEY = 'managementReview.form.defaultTitle';

let nextId = 0;

/**
 * `/management-review/reviews/new` and `.../:id/edit`. A new review gets a title,
 * the standards it covers, the review period, an owner and its meeting (time,
 * place, chair, attendees, the standard agenda); the inputs are compiled on
 * creation. Editing changes the title, standards, period and owner with a reason.
 */
@Component({
  selector: 'app-mr-review-editor',
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
        [routerLink]="id() ? ['/management-review/reviews', id()] : ['/management-review/reviews']"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{
          (id() ? 'managementReview.common.backToReview' : 'managementReview.common.backToList')
            | transloco
        }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          (id() ? 'managementReview.form.editTitle' : 'managementReview.form.newTitle') | transloco
        }}
      </h1>

      <div class="mb-4"><app-guide-intro [scope]="scope" page="form" /></div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'managementReview.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'managementReview.common.loadFailed' | transloco }}</app-alert>
      } @else if (existing()?.can_edit === false) {
        <app-alert tone="info">{{ 'managementReview.detail.readOnly' | transloco }}</app-alert>
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
              <app-field-help [scope]="scope" page="form" field="title" />
              @if (titleMissing()) {
                <p class="mt-1 text-[12.5px] text-fail">
                  {{ 'managementReview.errors.title_required' | transloco }}
                </p>
              }
            </div>

            <fieldset>
              <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                {{ 'managementReview.fields.frameworks' | transloco }}
              </legend>
              <div class="flex flex-wrap gap-2">
                @for (f of frameworks; track f) {
                  <label
                    class="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg"
                  >
                    <input
                      type="checkbox"
                      [checked]="form().frameworks.includes(f)"
                      (change)="toggleFramework(f, $any($event.target).checked)"
                    />
                    {{ frameworkKey(f) | transloco }}
                  </label>
                }
              </div>
              <app-field-help [scope]="scope" page="form" field="frameworks" />
            </fieldset>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'managementReview.fields.periodStart' | transloco"
                  [inputId]="fid('ps')"
                >
                  <input
                    [id]="fid('ps')"
                    type="date"
                    [value]="form().period_start"
                    (input)="set('period_start', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="period" />
              </div>
              <app-form-field
                [label]="'managementReview.fields.periodEnd' | transloco"
                [inputId]="fid('pe')"
              >
                <input
                  [id]="fid('pe')"
                  type="date"
                  [value]="form().period_end"
                  (input)="set('period_end', $any($event.target).value)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'managementReview.fields.owner' | transloco"
                  [inputId]="fid('owner')"
                >
                  <app-mr-user-select
                    [inputId]="fid('owner')"
                    [value]="form().owner_user_id"
                    [currentName]="existing()?.owner?.name ?? null"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="owner" />
              </div>
            </div>

            @if (!id()) {
              <h2 class="mt-2 font-display text-[15px] font-bold text-fg">
                {{ 'managementReview.form.meetingHeading' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      (valueChange)="set('chair_user_id', $event)"
                    />
                  </app-form-field>
                  <app-field-help [scope]="scope" page="form" field="chair" />
                </div>
              </div>

              <div>
                <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                  {{ 'managementReview.fields.attendees' | transloco }}
                </p>
                <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="new-attendees">
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
                <app-field-help [scope]="scope" page="form" field="attendees" />
              </div>

              <label class="inline-flex items-start gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  class="mt-0.5"
                  [checked]="form().standard_agenda"
                  (change)="set('standard_agenda', $any($event.target).checked)"
                />
                <span>
                  {{ 'managementReview.form.standardAgenda' | transloco }}
                  <span class="block text-[12px] text-fg-muted">{{
                    'managementReview.form.standardAgendaHint' | transloco
                  }}</span>
                </span>
              </label>
              <label class="inline-flex items-start gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  class="mt-0.5"
                  [checked]="form().compile_inputs"
                  (change)="set('compile_inputs', $any($event.target).checked)"
                />
                <span>
                  {{ 'managementReview.form.compileInputs' | transloco }}
                  <span class="block text-[12px] text-fg-muted">{{
                    'managementReview.form.compileInputsHint' | transloco
                  }}</span>
                </span>
              </label>
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
                  (id() ? 'managementReview.form.save' : 'managementReview.form.create') | transloco
                }}
              </app-button>
            </div>
          </form>
        </app-card>
        <div class="mt-4"><app-why-it-matters [scope]="scope" page="form" /></div>
      }
    </div>
  `,
})
export class ReviewEditor {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  private readonly auth = inject(AuthService);

  /** Route param (edit mode). */
  readonly id = input<string | undefined>(undefined);

  protected readonly scope = MR_SCOPE;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly frameworkKey = frameworkKey;

  private readonly uid = ++nextId;
  protected fid(name: string): string {
    return `mr-rev-${this.uid}-${name}`;
  }

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly existing = signal<ReviewDetail | null>(null);
  protected readonly form = signal<ReviewFormValue>(emptyReviewForm('', null));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());

  private request = new Subscription();
  private titleTouched = false;
  private readonly defaultTitle = computed(() =>
    this.language.translate(DEFAULT_TITLE_KEY, { year: new Date().getFullYear() }),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.existing()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.init(orgId, id));
    });
    // The default title of a new review follows the language file once it loads.
    effect(() => {
      const title = this.defaultTitle();
      if (!this.id() && !this.titleTouched && title !== DEFAULT_TITLE_KEY) {
        untracked(() => this.form.update((f) => ({ ...f, title })));
      }
    });
  }

  protected set<K extends keyof ReviewFormValue>(key: K, value: ReviewFormValue[K]): void {
    if (key === 'title') {
      this.titleTouched = true;
    }
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleFramework(f: Framework, on: boolean): void {
    this.form.update((v) => ({
      ...v,
      frameworks: on
        ? [...v.frameworks.filter((x) => x !== f), f]
        : v.frameworks.filter((x) => x !== f),
    }));
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
      id ? ['/management-review/reviews', id] : ['/management-review/reviews'],
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
    if (f.period_start && f.period_end && f.period_end < f.period_start) {
      this.errorKey.set('managementReview.errors.invalid_period');
      return;
    }
    const before = this.existing();
    const call = before
      ? this.api.updateReview(orgId, before.id, updateReviewPayload(before, f))
      : this.api.createReview(
          orgId,
          createReviewPayload(
            f,
            STANDARD_AGENDA.map((k) =>
              this.language.translate(`managementReview.standardAgenda.${k}`),
            ),
          ),
        );
    this.saving.set(true);
    call.subscribe({
      next: (review) => {
        this.saving.set(false);
        this.notifications.success(
          before
            ? 'managementReview.notices.reviewSaved'
            : 'managementReview.notices.reviewCreated',
        );
        void this.router.navigate(['/management-review/reviews', review.id]);
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
      this.titleTouched = false;
      const title = this.defaultTitle();
      this.form.set(
        emptyReviewForm(title === DEFAULT_TITLE_KEY ? '' : title, this.auth.user()?.id ?? null),
      );
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getReview(orgId, id).subscribe({
      next: (r) => {
        this.existing.set(r);
        this.form.set({
          ...emptyReviewForm(r.title, r.owner?.id ?? null),
          frameworks: r.frameworks,
          period_start: r.period_start ?? '',
          period_end: r.period_end ?? '',
        });
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
