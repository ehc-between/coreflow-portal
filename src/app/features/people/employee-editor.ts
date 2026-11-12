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
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
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
  SCREENING_STATUSES,
} from './data/people.models';
import { PeopleLessonLink } from './people-section-nav';

/**
 * Create (`/people/employees/new`) or edit (`/people/employees/:id/edit`) an employee:
 * identity and link to a user account, role (position, department, manager),
 * employment, and the security terms of employment (confidentiality, security terms,
 * screening). Editing asks for a change reason, which the revision history records.
 */
@Component({
  selector: 'app-people-employee-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    PeopleLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/people/employees', id()] : '/people/employees'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'people.common.backToEmployee' : 'people.common.backToList') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          id()
            ? ('people.form.editTitle' | transloco: { code: original()?.code ?? '' })
            : ('people.form.newTitle' | transloco)
        }}
      </h1>
      <div class="mb-5"><app-guide-intro scope="people" page="form" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'people.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
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
              <app-card>
                <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                  {{ 'people.form.sections.identity' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'people.fields.fullName' | transloco"
                      inputId="cf-e-name"
                    >
                      <input
                        id="cf-e-name"
                        type="text"
                        maxlength="200"
                        required
                        autocomplete="off"
                        [value]="form().full_name"
                        (input)="set('full_name', $any($event.target).value)"
                        [attr.aria-invalid]="!!shown()['full_name']"
                        [attr.aria-describedby]="shown()['full_name'] ? 'cf-e-name-err' : null"
                        data-testid="employee-name"
                      />
                    </app-form-field>
                    @if (shown()['full_name']; as key) {
                      <p id="cf-e-name-err" class="mt-1 text-[12px] text-fail">
                        {{ key | transloco }}
                      </p>
                    }
                  </div>
                  <div>
                    <app-form-field [label]="'people.fields.user' | transloco" inputId="cf-e-user">
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
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="user_id" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.employeeNumber' | transloco"
                      inputId="cf-e-number"
                    >
                      <input
                        id="cf-e-number"
                        type="text"
                        maxlength="64"
                        [value]="form().employee_number"
                        (input)="set('employee_number', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.email' | transloco"
                      inputId="cf-e-email"
                    >
                      <input
                        id="cf-e-email"
                        type="email"
                        maxlength="320"
                        autocomplete="off"
                        [value]="form().email"
                        (input)="set('email', $any($event.target).value)"
                        [attr.aria-invalid]="!!shown()['email']"
                      />
                    </app-form-field>
                    @if (shown()['email']; as key) {
                      <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
                    }
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.phone' | transloco"
                      inputId="cf-e-phone"
                    >
                      <input
                        id="cf-e-phone"
                        type="tel"
                        maxlength="64"
                        autocomplete="off"
                        [value]="form().phone"
                        (input)="set('phone', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                  {{ 'people.form.sections.role' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <app-form-field
                      [label]="'people.fields.position' | transloco"
                      inputId="cf-e-position"
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
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="position_id" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.jobTitle' | transloco"
                      inputId="cf-e-title"
                    >
                      <input
                        id="cf-e-title"
                        type="text"
                        maxlength="200"
                        [value]="form().job_title"
                        (input)="set('job_title', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.department' | transloco"
                      inputId="cf-e-dept"
                    >
                      <select
                        id="cf-e-dept"
                        (change)="set('department_id', $any($event.target).value)"
                      >
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
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.manager' | transloco"
                      inputId="cf-e-manager"
                    >
                      <select
                        id="cf-e-manager"
                        (change)="set('manager_id', $any($event.target).value)"
                      >
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
                            {{ m.full_name }} ({{ m.code }})
                          </option>
                        }
                      </select>
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.location' | transloco"
                      inputId="cf-e-location"
                    >
                      <input
                        id="cf-e-location"
                        type="text"
                        maxlength="200"
                        [value]="form().location"
                        (input)="set('location', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
                  {{ 'people.form.sections.employment' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <app-form-field
                      [label]="'people.fields.employmentType' | transloco"
                      inputId="cf-e-type"
                    >
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
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.status' | transloco"
                      inputId="cf-e-status"
                    >
                      <select id="cf-e-status" (change)="set('status', $any($event.target).value)">
                        @for (s of statuses; track s) {
                          <option [value]="s" [selected]="form().status === s">
                            {{ 'people.status.' + s | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="status" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.startDate' | transloco"
                      inputId="cf-e-start"
                    >
                      <input
                        id="cf-e-start"
                        type="date"
                        [value]="form().start_date"
                        (change)="set('start_date', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.endDate' | transloco"
                      inputId="cf-e-end"
                    >
                      <input
                        id="cf-e-end"
                        type="date"
                        [value]="form().end_date"
                        (change)="set('end_date', $any($event.target).value)"
                        [attr.aria-invalid]="!!shown()['end_date']"
                      />
                    </app-form-field>
                    @if (shown()['end_date']; as key) {
                      <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
                    }
                  </div>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-1 flex items-center gap-2 font-display text-[16px] font-bold text-fg">
                  {{ 'people.form.sections.security' | transloco }}
                  <app-ask-about
                    [prompt]="'people.ask.securityTerms' | transloco"
                    field="security_terms"
                  />
                </h2>
                <p class="mb-4 text-[13px] text-fg-muted">
                  {{ 'people.form.securityHint' | transloco }}
                </p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <app-form-field
                      [label]="'people.fields.confidentialitySignedOn' | transloco"
                      inputId="cf-e-conf"
                    >
                      <input
                        id="cf-e-conf"
                        type="date"
                        [value]="form().confidentiality_signed_on"
                        (change)="set('confidentiality_signed_on', $any($event.target).value)"
                      />
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="confidentiality_signed_on" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.securityTermsAcceptedOn' | transloco"
                      inputId="cf-e-terms"
                    >
                      <input
                        id="cf-e-terms"
                        type="date"
                        [value]="form().security_terms_accepted_on"
                        (change)="set('security_terms_accepted_on', $any($event.target).value)"
                      />
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="security_terms_accepted_on" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.screeningStatus' | transloco"
                      inputId="cf-e-screen"
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
                    </app-form-field>
                    <app-field-help scope="people" page="form" field="screening_status" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'people.fields.screeningCompletedOn' | transloco"
                      inputId="cf-e-screen-on"
                    >
                      <input
                        id="cf-e-screen-on"
                        type="date"
                        [value]="form().screening_completed_on"
                        (change)="set('screening_completed_on', $any($event.target).value)"
                      />
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'people.fields.notes' | transloco"
                      inputId="cf-e-notes"
                    >
                      <textarea
                        id="cf-e-notes"
                        rows="3"
                        maxlength="20000"
                        [value]="form().notes"
                        (input)="set('notes', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                    <p class="mt-1 text-[12px] text-fg-subtle">
                      {{ 'people.form.privateHint' | transloco }}
                    </p>
                  </div>
                </div>
              </app-card>

              @if (id()) {
                <app-card>
                  <app-form-field
                    [label]="'people.form.changeReason' | transloco"
                    inputId="cf-e-reason"
                  >
                    <input
                      id="cf-e-reason"
                      type="text"
                      maxlength="1000"
                      [placeholder]="'people.form.changeReasonPlaceholder' | transloco"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-form-field>
                </app-card>
              } @else {
                <label class="flex items-center gap-2 text-[13.5px] text-fg">
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

              <div class="flex flex-wrap justify-end gap-2">
                <app-button variant="ghost" (click)="cancel()">
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
              </div>
            </form>
          }
        }
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="form" />
        <app-people-lesson-link lesson="joiners-and-leavers" />
      </div>
    </div>
  `,
})
export class EmployeeEditor {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly lookups = inject(PeopleLookups);

  /** Route param; unset on `/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly statuses = EMPLOYEE_STATUSES;
  protected readonly screenings = SCREENING_STATUSES;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly original = signal<Employee | null>(null);
  protected readonly seed = signal<EmployeeFormValue>(emptyEmployeeForm());
  protected readonly form = signal<EmployeeFormValue>(emptyEmployeeForm());
  protected readonly changeReason = signal('');
  protected readonly startOnboarding = signal(true);
  protected readonly saving = signal(false);
  protected readonly managers = signal<readonly Employee[]>([]);
  private readonly attempted = signal(false);

  protected readonly errors = computed(() => validateEmployeeForm(this.form()));
  protected readonly shown = computed(() => {
    const errors = this.errors();
    if (this.attempted()) {
      return errors;
    }
    // Format problems show at once; a missing name only after submitting.
    return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'full_name'));
  });

  protected readonly activePositions = computed(() =>
    this.lookups.positions().filter((p) => p.status === 'active'),
  );
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
          this.notifications.success('people.notices.employeeCreated', { code: employee.code });
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
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
