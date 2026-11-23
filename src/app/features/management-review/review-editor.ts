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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { StandardSummary } from '../../core/standards/standards.models';
import { AskAbout } from '../../shared/ask/ask-about';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { UserSelect, userIdOf } from './components/user-select';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import {
  CreateReviewRequest,
  FRAMEWORKS,
  Framework,
  Planning,
  ReviewDetail,
  UpdateReviewRequest,
} from './data/management-review.models';
import {
  MR_MODULE,
  MR_SCOPE,
  MR_SETTINGS_LINK,
  dayOf,
  frameworkKey,
  fromLocalInput,
  minutesOrNull,
  mrCrumbs,
  nextDay,
  textOrNull,
  todayIso,
} from './management-review-display';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FieldHelp } from '../../shared/guidance/field-help';

/** The standard agenda of a management review (ISO 9.3.2), as i18n keys. */
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

/** The ISO frameworks the organisation has switched on (the ones a review can cover). */
export function adoptedFrameworks(standards: readonly StandardSummary[]): Framework[] {
  const on = new Set(standards.filter((s) => s.enabled).map((s) => s.framework ?? ''));
  return FRAMEWORKS.filter((f) => on.has(f));
}

/**
 * The default period of a new review: from the day after the last signed review
 * was held (else signed) to today; without one, the review interval back from today.
 */
export function defaultPeriod(
  planning: Planning | null,
  today = todayIso(),
): { start: string; end: string } {
  const last = planning?.last_signed;
  const lastDay = dayOf(last?.held_at || last?.signed_at || null);
  if (lastDay && lastDay < today) {
    return { start: nextDay(lastDay), end: today };
  }
  const months = planning?.interval_months ?? 12;
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 - months, d));
  return { start: start.toISOString().slice(0, 10), end: today };
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
 * `/management-review/reviews/new` and `.../:id/edit`. A new review starts
 * filled in: the standards the organisation has switched on, the period since
 * the last signed review, the owner and chair (you), and the meeting with the
 * standard agenda; its inputs are fetched on creation. Editing changes the
 * title, standards, period and owner, with a reason.
 */
@Component({
  selector: 'app-mr-review-editor',
  imports: [
    TranslocoPipe,
    AskAbout,
    WhyItMatters,
    Alert,
    Button,
    ErrorState,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    UserSelect,
    FormSection,
    FormActions,
    DateInput,
    FieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'managementReview.form.editTitle' : 'managementReview.form.newTitle'"
        descriptionKey="managementReview.form.description"
        [breadcrumbs]="crumbs()"
        [settingsLink]="settingsLink"
      />
      <app-help-strip [scope]="scope" page="form" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="5" />
      } @else if (state() === 'error') {
        <app-error-state (retry)="reload()" />
      } @else if (existing()?.can_edit === false) {
        <app-alert tone="info">{{ 'managementReview.detail.readOnly' | transloco }}</app-alert>
      } @else {
        <form
          class="mt-5 flex flex-col gap-5"
          novalidate
          (submit)="$event.preventDefault(); save()"
        >
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }

          <app-form-section
            [title]="'managementReview.form.basicsHeading' | transloco"
            [description]="'managementReview.form.basicsHint' | transloco"
          >
            <app-form-field
              span="full"
              [label]="'managementReview.fields.title' | transloco"
              [inputId]="fid('title')"
              [required]="true"
              [error]="titleMissing() ? ('managementReview.errors.title_required' | transloco) : ''"
            >
              <app-field-help
                label-suffix
                [scope]="scope"
                page="form"
                field="title"
                [label]="'managementReview.fields.title' | transloco"
              />
              <input
                [id]="fid('title')"
                type="text"
                maxlength="255"
                required
                autocomplete="off"
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
              />
            </app-form-field>

            <fieldset class="min-w-0 sm:col-span-2">
              <legend class="flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted">
                {{ 'managementReview.fields.frameworks' | transloco }}
                <app-field-help
                  [scope]="scope"
                  page="form"
                  field="frameworks"
                  [label]="'managementReview.fields.frameworks' | transloco"
                />
                <app-ask-about
                  field="frameworks"
                  [fieldLabel]="'managementReview.fields.frameworks' | transloco"
                  [prompt]="'managementReview.ai.prompts.askFrameworks' | transloco"
                  labelKey="managementReview.ai.askField"
                />
              </legend>
              <div class="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                @for (f of frameworks(); track f) {
                  <label
                    class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      type="checkbox"
                      [checked]="form().frameworks.includes(f)"
                      (change)="toggleFramework(f, $any($event.target).checked)"
                      [attr.data-testid]="'framework-' + f"
                    />
                    <span class="truncate">{{ frameworkKey(f) | transloco }}</span>
                  </label>
                }
              </div>
              @if (limited()) {
                <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
                  {{ 'managementReview.form.frameworksAdopted' | transloco }}
                </p>
              }
            </fieldset>

            <app-form-field
              [label]="'managementReview.fields.periodStart' | transloco"
              [inputId]="fid('ps')"
            >
              <app-field-help
                label-suffix
                [scope]="scope"
                page="form"
                field="period"
                [label]="'managementReview.fields.period' | transloco"
              />
              <span label-suffix class="inline-flex h-6 items-center">
                <app-ask-about
                  field="period"
                  [fieldLabel]="'managementReview.fields.period' | transloco"
                  [prompt]="'managementReview.ai.prompts.askPeriod' | transloco"
                  labelKey="managementReview.ai.askField"
                />
              </span>
              <app-date-input
                [inputId]="fid('ps')"
                [value]="form().period_start"
                (valueChange)="set('period_start', $event ?? '')"
              />
            </app-form-field>
            <app-form-field
              [label]="'managementReview.fields.periodEnd' | transloco"
              [inputId]="fid('pe')"
            >
              <app-date-input
                [inputId]="fid('pe')"
                [value]="form().period_end"
                (valueChange)="set('period_end', $event ?? '')"
              />
            </app-form-field>
            <app-form-field
              [label]="'managementReview.fields.owner' | transloco"
              [inputId]="fid('owner')"
            >
              <app-field-help
                label-suffix
                [scope]="scope"
                page="form"
                field="owner"
                [label]="'managementReview.fields.owner' | transloco"
              />
              <app-mr-user-select
                [inputId]="fid('owner')"
                [value]="form().owner_user_id"
                [currentName]="existing()?.owner?.name ?? null"
                (valueChange)="set('owner_user_id', $event)"
              />
            </app-form-field>
          </app-form-section>

          @if (!id()) {
            <app-form-section
              [title]="'managementReview.form.meetingHeading' | transloco"
              [description]="'managementReview.form.meetingIntro' | transloco"
            >
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
              <app-form-field
                [label]="'managementReview.fields.chair' | transloco"
                [inputId]="fid('chair')"
              >
                <app-field-help
                  label-suffix
                  [scope]="scope"
                  page="form"
                  field="chair"
                  [label]="'managementReview.fields.chair' | transloco"
                />
                <app-mr-user-select
                  [inputId]="fid('chair')"
                  [value]="form().chair_user_id"
                  (valueChange)="set('chair_user_id', $event)"
                />
              </app-form-field>

              <app-form-field
                span="full"
                [label]="'managementReview.fields.attendees' | transloco"
                [inputId]="fid('att')"
                [hint]="'managementReview.form.topManagementHint' | transloco"
              >
                <app-field-help
                  label-suffix
                  [scope]="scope"
                  page="form"
                  field="attendees"
                  [label]="'managementReview.fields.attendees' | transloco"
                />
                <ul class="flex flex-wrap gap-1.5 empty:hidden" data-testid="new-attendees">
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
                  }
                </ul>
                <app-mr-user-select
                  [inputId]="fid('att')"
                  noneKey="managementReview.attendees.addPerson"
                  [value]="null"
                  [exclude]="form().attendee_ids"
                  (valueChange)="addAttendee($event)"
                />
              </app-form-field>

              <div class="flex flex-col gap-2 sm:col-span-2">
                <label
                  class="flex items-start gap-2.5 rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg"
                >
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [checked]="form().standard_agenda"
                    (change)="set('standard_agenda', $any($event.target).checked)"
                  />
                  <span>
                    <span class="font-medium">{{
                      'managementReview.form.standardAgenda' | transloco
                    }}</span>
                    <span class="block text-meta text-fg-muted">{{
                      'managementReview.form.standardAgendaHint' | transloco
                    }}</span>
                  </span>
                </label>
                <label
                  class="flex items-start gap-2.5 rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg"
                >
                  <input
                    type="checkbox"
                    class="mt-0.5"
                    [checked]="form().compile_inputs"
                    (change)="set('compile_inputs', $any($event.target).checked)"
                  />
                  <span>
                    <span class="font-medium">{{
                      'managementReview.form.compileInputs' | transloco
                    }}</span>
                    <span class="block text-meta text-fg-muted">{{
                      'managementReview.form.compileInputsHint' | transloco
                    }}</span>
                  </span>
                </label>
              </div>
            </app-form-section>
          } @else {
            <app-form-section [columns]="1">
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
            </app-form-section>
          }

          <app-form-actions>
            <app-button variant="secondary" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()" data-testid="mr-save-review">
              {{
                (id() ? 'managementReview.form.save' : 'managementReview.form.create') | transloco
              }}
            </app-button>
          </app-form-actions>
        </form>
        <div class="mt-8"><app-why-it-matters [scope]="scope" page="form" /></div>
      }
    </div>
  `,
})
export class ReviewEditor {
  private readonly api = inject(ManagementReviewApi);
  private readonly standards = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);
  private readonly auth = inject(AuthService);

  /** Route param (edit mode). */
  readonly id = input<string | undefined>(undefined);

  protected readonly scope = MR_SCOPE;
  protected readonly settingsLink = MR_SETTINGS_LINK;
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
  /** The ISO standards the organisation has switched on (null until known / unknown). */
  private readonly adopted = signal<readonly Framework[] | null>(null);

  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());
  /** The standards offered: the adopted ones, plus any the review already covers. */
  protected readonly frameworks = computed<readonly Framework[]>(() => {
    const adopted = this.adopted();
    if (!adopted || adopted.length === 0) {
      return FRAMEWORKS;
    }
    const chosen = this.form().frameworks;
    return FRAMEWORKS.filter((f) => adopted.includes(f) || chosen.includes(f));
  });
  protected readonly limited = computed(() => this.frameworks().length < FRAMEWORKS.length);
  protected readonly crumbs = computed(() =>
    mrCrumbs(
      { labelKey: 'managementReview.nav.reviews', link: '/management-review/reviews' },
      ...(this.existing()
        ? [{ label: this.existing()!.code, link: ['/management-review/reviews', this.id()] }]
        : []),
      {
        labelKey: this.id() ? 'managementReview.form.editTitle' : 'managementReview.form.newTitle',
      },
    ),
  );

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
    if (!orgId) {
      return;
    }
    // The adopted standards (needs `standards:read`; without it all five are offered).
    const standards$ = this.standards.list(orgId).pipe(catchError(() => of(null)));
    if (!id) {
      this.existing.set(null);
      this.titleTouched = false;
      const title = this.defaultTitle();
      this.form.set(
        emptyReviewForm(title === DEFAULT_TITLE_KEY ? '' : title, this.auth.user()?.id ?? null),
      );
      this.state.set('ready');
      const planning$ = this.api.planning(orgId).pipe(catchError(() => of(null)));
      this.request = forkJoin([standards$, planning$]).subscribe(([standards, planning]) => {
        const adopted = standards ? adoptedFrameworks(standards) : null;
        this.adopted.set(adopted);
        const period = defaultPeriod(planning);
        // Fill the defaults only where the user has not typed yet.
        this.form.update((f) => ({
          ...f,
          frameworks: f.frameworks.length ? f.frameworks : (adopted ?? []),
          period_start: f.period_start || period.start,
          period_end: f.period_end || period.end,
        }));
      });
      return;
    }
    this.state.set('loading');
    this.request = forkJoin([this.api.getReview(orgId, id), standards$]).subscribe({
      next: ([r, standards]) => {
        this.existing.set(r);
        this.adopted.set(standards ? adoptedFrameworks(standards) : null);
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
