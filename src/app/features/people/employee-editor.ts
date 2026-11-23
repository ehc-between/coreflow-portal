import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
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
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  EmployeeFormValue,
  emptyEmployeeForm,
  formFromEmployee,
  toEmployeeCreate,
  toEmployeeUpdate,
  validateEmployeeForm,
} from './data/employee-form-model';
import { PeopleApi } from './data/people-api';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  Employee,
  SCREENING_SCOPES,
  SCREENING_STATUSES,
  ScreeningScope,
} from './data/people.models';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';
import { PeopleField } from './ui/people-field';

/** Fields whose errors are shown at once (a missing name only after submitting). */
const LIVE_ERRORS = new Set(['email', 'end_date', 'screening_legal_basis', 'screening_recheck_on']);

/**
 * Create (`/people/employees/new`) or edit (`/people/employees/:id/edit`) a person:
 * who they are and their user account, role (position, own title, department,
 * manager), employment, and the security terms of employment — confidentiality
 * (A.6.6), security terms (A.6.2), the background check with its scope, legal basis
 * and re-check date (A.6.1) and the post-employment acknowledgement (A.6.5).
 */
@Component({
  selector: 'app-people-employee-editor',
  imports: [
    TranslocoPipe,
    AskAbout,
    WhyItMatters,
    Alert,
    Button,
    DateInput,
    EmptyState,
    FormActions,
    FormSection,
    HelpStrip,
    LoadingState,
    PageHeader,
    PeopleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [title]="
          id() ? ('people.form.editTitle' | transloco: { name: original()?.full_name ?? '' }) : null
        "
        [titleKey]="id() ? null : 'people.form.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink"
      />
      <app-help-strip scope="people" page="form" lesson="joiners-and-leavers" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            ctaKey="people.common.backToList"
            ctaLink="/people/employees"
          />
        }
        @default {
          @if (original() && !original()!.can_edit) {
            <app-alert tone="info">{{ 'people.form.readOnly' | transloco }}</app-alert>
          } @else {
            <form
              class="flex flex-col gap-5"
              (submit)="$event.preventDefault(); submit()"
              novalidate
            >
              <app-form-section
                [title]="'people.form.sections.identity' | transloco"
                [description]="'people.form.sections.identityHint' | transloco"
              >
                <app-people-field
                  span="full"
                  labelKey="people.fields.fullName"
                  inputId="cf-e-name"
                  [required]="true"
                  [error]="shown()['full_name']"
                >
                  <input
                    id="cf-e-name"
                    type="text"
                    maxlength="200"
                    required
                    autocomplete="off"
                    [value]="form().full_name"
                    (input)="set('full_name', $any($event.target).value)"
                    data-testid="employee-name"
                  />
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.email"
                  inputId="cf-e-email"
                  [error]="shown()['email']"
                >
                  <input
                    id="cf-e-email"
                    type="email"
                    maxlength="320"
                    autocomplete="off"
                    [value]="form().email"
                    (input)="set('email', $any($event.target).value)"
                  />
                </app-people-field>
                <app-people-field labelKey="people.fields.phone" inputId="cf-e-phone">
                  <input
                    id="cf-e-phone"
                    type="tel"
                    maxlength="64"
                    autocomplete="off"
                    [value]="form().phone"
                    (input)="set('phone', $any($event.target).value)"
                  />
                </app-people-field>
                <app-people-field labelKey="people.fields.user" inputId="cf-e-user" help="user_id">
                  <select id="cf-e-user" (change)="set('user_id', $any($event.target).value)">
                    <option value="" [selected]="!form().user_id">
                      {{ 'people.form.noUser' | transloco }}
                    </option>
                    @if (userOrphan()) {
                      <option [value]="form().user_id" selected>
                        {{ original()?.user?.name ?? ('people.form.currentUser' | transloco) }}
                      </option>
                    }
                    @for (u of lookups.users(); track u.id) {
                      <option [value]="u.id" [selected]="form().user_id === u.id">
                        {{ u.label }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.employeeNumber"
                  inputId="cf-e-number"
                  hintKey="people.form.employeeNumberHint"
                >
                  <input
                    id="cf-e-number"
                    type="text"
                    maxlength="64"
                    [value]="form().employee_number"
                    (input)="set('employee_number', $any($event.target).value)"
                  />
                </app-people-field>
              </app-form-section>

              <app-form-section
                [title]="'people.form.sections.role' | transloco"
                [description]="'people.form.sections.roleHint' | transloco"
              >
                <app-people-field
                  labelKey="people.fields.position"
                  inputId="cf-e-position"
                  help="position_id"
                  [hintKey]="screeningRequired() ? 'people.form.positionNeedsScreening' : null"
                >
                  <select
                    id="cf-e-position"
                    (change)="set('position_id', $any($event.target).value)"
                    data-testid="employee-position"
                  >
                    <option value="" [selected]="!form().position_id">
                      {{ 'people.form.noPosition' | transloco }}
                    </option>
                    @if (positionOrphan()) {
                      <option [value]="form().position_id" selected>
                        {{ original()?.position?.name ?? '' }}
                      </option>
                    }
                    @for (p of activePositions(); track p.id) {
                      <option [value]="p.id" [selected]="form().position_id === p.id">
                        {{ p.title }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.ownTitle"
                  inputId="cf-e-title"
                  hintKey="people.form.ownTitleHint"
                >
                  <input
                    id="cf-e-title"
                    type="text"
                    maxlength="200"
                    [value]="form().job_title"
                    (input)="set('job_title', $any($event.target).value)"
                  />
                </app-people-field>
                <app-people-field labelKey="people.fields.department" inputId="cf-e-dept">
                  <select id="cf-e-dept" (change)="set('department_id', $any($event.target).value)">
                    <option value="" [selected]="!form().department_id">
                      {{ 'people.form.noDepartment' | transloco }}
                    </option>
                    @if (departmentOrphan()) {
                      <option [value]="form().department_id" selected>
                        {{ original()?.department?.name ?? '' }}
                      </option>
                    }
                    @for (d of lookups.departments(); track d.id) {
                      <option [value]="d.id" [selected]="form().department_id === d.id">
                        {{ d.label }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field labelKey="people.fields.manager" inputId="cf-e-manager">
                  <select id="cf-e-manager" (change)="set('manager_id', $any($event.target).value)">
                    <option value="" [selected]="!form().manager_id">
                      {{ 'people.form.noManager' | transloco }}
                    </option>
                    @if (managerOrphan()) {
                      <option [value]="form().manager_id" selected>
                        {{ original()?.manager?.name ?? '' }}
                      </option>
                    }
                    @for (m of managers(); track m.id) {
                      <option [value]="m.id" [selected]="form().manager_id === m.id">
                        {{ m.full_name }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field labelKey="people.fields.location" inputId="cf-e-location">
                  <input
                    id="cf-e-location"
                    type="text"
                    maxlength="200"
                    [value]="form().location"
                    (input)="set('location', $any($event.target).value)"
                  />
                </app-people-field>
              </app-form-section>

              <app-form-section
                [title]="'people.form.sections.employment' | transloco"
                [description]="'people.form.sections.employmentHint' | transloco"
              >
                <app-people-field labelKey="people.fields.employmentType" inputId="cf-e-type">
                  <select
                    id="cf-e-type"
                    (change)="set('employment_type', $any($event.target).value)"
                  >
                    @for (t of types; track t) {
                      <option [value]="t" [selected]="form().employment_type === t">
                        {{ 'people.employmentTypes.' + t | transloco }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.status"
                  inputId="cf-e-status"
                  help="status"
                >
                  <select id="cf-e-status" (change)="set('status', $any($event.target).value)">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="form().status === s">
                        {{ 'people.status.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field labelKey="people.fields.startDate" inputId="cf-e-start">
                  <app-date-input
                    inputId="cf-e-start"
                    [value]="form().start_date"
                    (valueChange)="set('start_date', $event ?? '')"
                  />
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.endDate"
                  inputId="cf-e-end"
                  [error]="shown()['end_date']"
                >
                  <app-date-input
                    inputId="cf-e-end"
                    [value]="form().end_date"
                    [invalid]="!!shown()['end_date']"
                    (valueChange)="set('end_date', $event ?? '')"
                  />
                </app-people-field>
                @if (!id()) {
                  <label
                    class="flex min-h-10 items-center gap-2.5 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg sm:col-span-2"
                  >
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="startOnboarding()"
                      (change)="startOnboarding.set($any($event.target).checked)"
                      data-testid="start-onboarding"
                    />
                    {{ 'people.form.startOnboarding' | transloco }}
                  </label>
                }
              </app-form-section>

              <app-form-section
                id="security"
                [title]="'people.form.sections.security' | transloco"
                [description]="'people.form.securityHint' | transloco"
              >
                <app-ask-about
                  title-suffix
                  [prompt]="'people.ask.securityTerms' | transloco"
                  field="security_terms"
                  [fieldLabel]="'people.form.sections.security' | transloco"
                  [requirements]="securityRefs"
                />
                <app-people-field
                  labelKey="people.fields.confidentialitySignedOn"
                  inputId="cf-e-conf"
                  help="confidentiality_signed_on"
                >
                  <app-date-input
                    inputId="cf-e-conf"
                    [value]="form().confidentiality_signed_on"
                    (valueChange)="set('confidentiality_signed_on', $event ?? '')"
                  />
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.securityTermsAcceptedOn"
                  inputId="cf-e-terms"
                  help="security_terms_accepted_on"
                >
                  <app-date-input
                    inputId="cf-e-terms"
                    [value]="form().security_terms_accepted_on"
                    (valueChange)="set('security_terms_accepted_on', $event ?? '')"
                  />
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.postEmploymentAckOn"
                  inputId="cf-e-post"
                  help="post_employment_ack_on"
                >
                  <app-date-input
                    inputId="cf-e-post"
                    [value]="form().post_employment_ack_on"
                    (valueChange)="set('post_employment_ack_on', $event ?? '')"
                  />
                </app-people-field>
              </app-form-section>

              <app-form-section
                [title]="'people.form.screeningTitle' | transloco"
                [description]="'people.form.sections.screeningHint' | transloco"
              >
                @if (screeningRequired()) {
                  <p
                    class="rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink sm:col-span-2"
                    data-testid="screening-required"
                  >
                    {{ 'people.form.screeningRequired' | transloco }}
                  </p>
                }
                <app-people-field
                  labelKey="people.fields.screeningStatus"
                  inputId="cf-e-screen"
                  help="screening_status"
                >
                  <select
                    id="cf-e-screen"
                    (change)="set('screening_status', $any($event.target).value)"
                  >
                    @for (s of screenings; track s) {
                      <option [value]="s" [selected]="form().screening_status === s">
                        {{ 'people.screening.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.screeningCompletedOn"
                  inputId="cf-e-screen-on"
                >
                  <app-date-input
                    inputId="cf-e-screen-on"
                    [value]="form().screening_completed_on"
                    (valueChange)="set('screening_completed_on', $event ?? '')"
                  />
                </app-people-field>
                <fieldset class="min-w-0 sm:col-span-2">
                  <legend
                    class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted"
                  >
                    {{ 'people.fields.screeningScope' | transloco }}
                  </legend>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    @for (s of scopes; track s) {
                      <label
                        class="flex min-h-10 items-center gap-2.5 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg"
                      >
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [checked]="form().screening_scope.includes(s)"
                          (change)="toggleScope(s, $any($event.target).checked)"
                          [attr.data-testid]="'scope-' + s"
                        />
                        {{ 'people.screeningScopes.' + s | transloco }}
                      </label>
                    }
                  </div>
                </fieldset>
                <app-people-field
                  span="full"
                  labelKey="people.fields.screeningLegalBasis"
                  inputId="cf-e-basis"
                  help="screening_legal_basis"
                  [required]="form().screening_scope.includes('criminal_record')"
                  [error]="shown()['screening_legal_basis']"
                  hintKey="people.form.legalBasisHint"
                >
                  <input
                    id="cf-e-basis"
                    type="text"
                    maxlength="500"
                    [value]="form().screening_legal_basis"
                    (input)="set('screening_legal_basis', $any($event.target).value)"
                  />
                </app-people-field>
                <app-people-field
                  labelKey="people.fields.screeningRecheckOn"
                  inputId="cf-e-recheck"
                  [error]="shown()['screening_recheck_on']"
                  [hintKey]="screeningRequired() ? 'people.form.recheckHint' : null"
                >
                  <app-date-input
                    inputId="cf-e-recheck"
                    [value]="form().screening_recheck_on"
                    [invalid]="!!shown()['screening_recheck_on']"
                    (valueChange)="set('screening_recheck_on', $event ?? '')"
                  />
                </app-people-field>
              </app-form-section>

              <app-form-section
                [title]="'people.fields.notes' | transloco"
                [description]="'people.form.privateHint' | transloco"
                [columns]="1"
              >
                <app-people-field labelKey="people.fields.notes" inputId="cf-e-notes">
                  <textarea
                    id="cf-e-notes"
                    rows="3"
                    maxlength="20000"
                    [value]="form().notes"
                    (input)="set('notes', $any($event.target).value)"
                  ></textarea>
                </app-people-field>
                @if (id()) {
                  <app-people-field labelKey="people.form.changeReason" inputId="cf-e-reason">
                    <input
                      id="cf-e-reason"
                      type="text"
                      maxlength="1000"
                      [placeholder]="'people.form.changeReasonPlaceholder' | transloco"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-people-field>
                }
              </app-form-section>

              <app-form-actions
                [message]="attempted() && hasErrors() ? ('people.form.fixErrors' | transloco) : ''"
              >
                <app-button variant="secondary" (click)="cancel()">
                  {{ 'common.cancel' | transloco }}
                </app-button>
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving()"
                  data-testid="employee-save"
                >
                  {{ (id() ? 'common.save' : 'people.form.create') | transloco }}
                </app-button>
              </app-form-actions>
            </form>
          }
        }
      }

      <div class="mt-8"><app-why-it-matters scope="people" page="form" /></div>
    </div>
  `,
})
export class EmployeeEditor {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  protected readonly lookups = inject(PeopleLookups);

  /** Route param; unset on `/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly statuses = EMPLOYEE_STATUSES;
  protected readonly screenings = SCREENING_STATUSES;
  protected readonly scopes = SCREENING_SCOPES;
  protected readonly securityRefs = ['iso27001:A.6.1', 'iso27001:A.6.2', 'iso27001:A.6.6'];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly original = signal<Employee | null>(null);
  protected readonly seed = signal<EmployeeFormValue>(emptyEmployeeForm());
  protected readonly form = signal<EmployeeFormValue>(emptyEmployeeForm());
  protected readonly changeReason = signal('');
  protected readonly startOnboarding = signal(true);
  protected readonly saving = signal(false);
  protected readonly managers = signal<readonly Employee[]>([]);
  protected readonly attempted = signal(false);

  protected readonly breadcrumbs = computed(() => {
    const e = this.original();
    const id = this.id();
    return [
      PEOPLE_ROOT,
      ...(id && e ? [{ label: e.full_name, link: ['/people/employees', id] }] : []),
      { labelKey: id ? 'people.common.edit' : 'people.form.newTitle' },
    ];
  });

  protected readonly errors = computed(() => validateEmployeeForm(this.form()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly shown = computed(() => {
    const errors = this.errors();
    if (this.attempted()) {
      return errors;
    }
    return Object.fromEntries(Object.entries(errors).filter(([k]) => LIVE_ERRORS.has(k)));
  });

  protected readonly activePositions = computed(() =>
    this.lookups.positions().filter((p) => p.status === 'active'),
  );
  /** The chosen position's security risk requires a background check (A.6.1). */
  protected readonly screeningRequired = computed(() => {
    const id = this.form().position_id;
    const p = this.lookups.positions().find((x) => x.id === id);
    return !!p && (p.screening_required ?? p.risk_level === 'high');
  });
  protected readonly userOrphan = computed(() => {
    const id = this.form().user_id;
    return !!id && !this.lookups.users().some((u) => u.id === id);
  });
  protected readonly positionOrphan = computed(() => {
    const id = this.form().position_id;
    return !!id && !this.activePositions().some((p) => p.id === id);
  });
  protected readonly departmentOrphan = computed(() => {
    const id = this.form().department_id;
    return !!id && !this.lookups.departments().some((d) => d.id === id);
  });
  protected readonly managerOrphan = computed(() => {
    const id = this.form().manager_id;
    return !!id && !this.managers().some((m) => m.id === id);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'employee',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.full_name ?? this.language.translate('people.form.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.lookups.ensureLoaded();
        this.loadManagers(orgId, id);
        if (id) {
          this.load(orgId, id);
        }
      });
    });
  }

  protected set<K extends keyof EmployeeFormValue>(key: K, value: EmployeeFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleScope(scope: ScreeningScope, on: boolean): void {
    const current = this.form().screening_scope.filter((s) => s !== scope);
    this.set('screening_scope', on ? [...current, scope] : current);
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || Object.keys(this.errors()).length > 0) {
      return;
    }
    const id = this.id();
    if (id) {
      const body = toEmployeeUpdate(this.seed(), this.form(), this.changeReason());
      if (Object.keys(body).filter((k) => k !== 'change_reason').length === 0) {
        this.notifications.info('people.notices.noChanges');
        this.cancel();
        return;
      }
      this.saving.set(true);
      this.api.updateEmployee(orgId, id, body).subscribe({
        next: () => {
          this.saving.set(false);
          this.notifications.success('people.notices.saved');
          void this.router.navigate(['/people/employees', id]);
        },
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.saving.set(true);
    this.api
      .createEmployee(orgId, toEmployeeCreate(this.form(), this.startOnboarding()))
      .subscribe({
        next: (employee) => {
          this.saving.set(false);
          this.notifications.success('people.notices.employeeCreated', {
            name: employee.full_name,
          });
          void this.router.navigate(['/people/employees', employee.id]);
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/people/employees', id] : ['/people/employees']);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(peopleErrorKey(error));
  }

  private loadManagers(orgId: string | null, selfId: string | undefined): void {
    if (!orgId) {
      return;
    }
    this.api
      .listEmployees(orgId, {
        status: ['onboarding', 'active', 'on_leave', 'offboarding'],
        sort: 'name',
        limit: 200,
      })
      .subscribe({
        next: (page) => this.managers.set(page.items.filter((e) => e.id !== selfId)),
        error: () => this.managers.set([]),
      });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getEmployee(orgId, id).subscribe({
      next: (employee) => {
        const value = formFromEmployee(employee);
        this.original.set(employee);
        this.seed.set(value);
        this.form.set(value);
        this.state.set('ready');
        if (this.route.snapshot.fragment === 'security') {
          afterNextRender(
            () => document.getElementById('security')?.scrollIntoView?.({ block: 'start' }),
            { injector: this.injector },
          );
        }
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
