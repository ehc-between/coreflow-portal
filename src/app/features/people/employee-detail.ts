import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  Injector,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { employeeStatusTone, hasPerm, screeningTone } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { Employee, PERM_DISCIPLINARY, PERM_MANAGE } from './data/people.models';
import { EmployeeAwarenessSection } from './employee-awareness';
import { EmployeeChecklistsSection } from './employee-checklists';
import { EmployeeCompetencesSection } from './employee-competences';
import { EmployeeDisciplinarySection } from './employee-disciplinary';
import { PeopleLessonLink } from './people-section-nav';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Sections of the details tab that `?tab=` links (from the backend URLs) scroll to. */
const SECTION_ANCHORS = new Set(['competences', 'checklists', 'awareness', 'disciplinary']);

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const EMPLOYEE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'people.fields.code',
  job_title: 'people.fields.jobTitle',
  position_id: 'people.fields.position',
  department_id: 'people.fields.department',
  manager_id: 'people.fields.manager',
  employment_type: 'people.fields.employmentType',
  status: 'people.fields.status',
  start_date: 'people.fields.startDate',
  end_date: 'people.fields.endDate',
  confidentiality_signed_on: 'people.fields.confidentialitySignedOn',
  security_terms_accepted_on: 'people.fields.securityTermsAcceptedOn',
  screening_status: 'people.fields.screeningStatus',
  screening_completed_on: 'people.fields.screeningCompletedOn',
};

/**
 * An employee (`/people/employees/:id`): role and employment, the security terms of
 * employment, competences against the position's requirements, onboarding and
 * offboarding checklists, awareness records and (restricted) disciplinary records;
 * related records, activity, comments, attachments and revisions from the record kit.
 */
@Component({
  selector: 'app-people-employee-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    EmployeeAwarenessSection,
    EmployeeChecklistsSection,
    EmployeeCompetencesSection,
    EmployeeDisciplinarySection,
    PeopleLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'people.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/people/employees"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'people.common.backToList' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (employee(); as e) {
          <app-record-detail-layout
            entityType="employee"
            [entityId]="e.id"
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/people/employees"
            backLabelKey="people.common.backToList"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ e.code }}</span>
                @if (e.employee_number) {
                  <span>{{ 'people.detail.number' | transloco: { n: e.employee_number } }}</span>
                }
                <span>{{ 'people.employmentTypes.' + e.employment_type | transloco }}</span>
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="employee-heading"
              >
                {{ e.full_name }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(e.status)" data-testid="employee-status">{{
                  'people.status.' + e.status | transloco
                }}</app-badge>
                @if (e.position?.name ?? e.job_title; as role) {
                  <span class="text-[13px] text-fg-muted">{{ role }}</span>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="employee" [entityId]="e.id" />
              <app-ask-about [prompt]="'people.ask.summariseEmployee' | transloco" />
              @if (e.can_edit) {
                <a
                  [routerLink]="['/people/employees', e.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="employee-edit"
                >
                  {{ 'people.common.edit' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'people.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="people" page="detail" />

              @if (e.status === 'former') {
                <app-alert tone="info">{{ 'people.detail.formerNotice' | transloco }}</app-alert>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'people.detail.summary' | transloco }}
                </h2>
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.position' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (e.position; as p) {
                        <a
                          [routerLink]="['/people/positions', p.id]"
                          class="font-semibold text-accent hover:underline"
                          >{{ p.name }}</a
                        >
                      } @else {
                        {{ 'people.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.jobTitle' | transloco }}</dt>
                    <dd class="text-fg">{{ e.job_title ?? ('people.common.none' | transloco) }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.department' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ e.department?.name ?? ('people.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.manager' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (e.manager; as m) {
                        <a
                          [routerLink]="['/people/employees', m.id]"
                          class="font-semibold text-accent hover:underline"
                          >{{ m.name }}</a
                        >
                      } @else {
                        {{ 'people.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.user' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ e.user?.name ?? ('people.detail.noUser' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.location' | transloco }}</dt>
                    <dd class="text-fg">{{ e.location ?? ('people.common.none' | transloco) }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.email' | transloco }}</dt>
                    <dd class="break-all text-fg">
                      {{ e.email ?? ('people.common.none' | transloco) }}
                    </dd>
                  </div>
                  @if (e.phone) {
                    <div>
                      <dt class="text-fg-subtle">{{ 'people.fields.phone' | transloco }}</dt>
                      <dd class="text-fg">{{ e.phone }}</dd>
                    </div>
                  }
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.startDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        e.start_date
                          ? (e.start_date | localDay)
                          : ('people.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.endDate' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        e.end_date ? (e.end_date | localDay) : ('people.common.none' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
                @if (e.notes) {
                  <p class="mt-4 text-[13px] whitespace-pre-line text-fg-muted">
                    <span class="font-semibold text-fg"
                      >{{ 'people.fields.notes' | transloco }}:</span
                    >
                    {{ e.notes }}
                  </p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
                  {{ 'people.detail.securityTerms' | transloco }}
                  <app-ask-about
                    [prompt]="'people.ask.securityTerms' | transloco"
                    field="security_terms"
                  />
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'people.fields.confidentialitySignedOn' | transloco }}
                    </dt>
                    <dd data-testid="confidentiality">
                      @if (e.confidentiality_signed_on) {
                        <span class="text-pass">{{ e.confidentiality_signed_on | localDay }}</span>
                      } @else {
                        <span class="font-semibold text-warn">{{
                          'people.detail.notSigned' | transloco
                        }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'people.fields.securityTermsAcceptedOn' | transloco }}
                    </dt>
                    <dd>
                      @if (e.security_terms_accepted_on) {
                        <span class="text-pass">{{ e.security_terms_accepted_on | localDay }}</span>
                      } @else {
                        <span class="font-semibold text-warn">{{
                          'people.detail.notAccepted' | transloco
                        }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'people.fields.screeningStatus' | transloco }}
                    </dt>
                    <dd class="flex flex-wrap items-center gap-2">
                      <app-badge [tone]="screeningTone(e.screening_status)">{{
                        'people.screening.' + e.screening_status | transloco
                      }}</app-badge>
                      @if (e.screening_completed_on) {
                        <span class="text-fg-muted">{{ e.screening_completed_on | localDay }}</span>
                      }
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <app-people-employee-competences
                  [employeeId]="e.id"
                  [canEdit]="e.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-people-employee-checklists
                  [employeeId]="e.id"
                  [canEdit]="e.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-people-employee-awareness [employeeId]="e.id" [canEdit]="e.can_edit" />
              </app-card>

              @if (canDisciplinary()) {
                <app-card>
                  <app-people-employee-disciplinary [employeeId]="e.id" />
                </app-card>
              }
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 text-[13px] font-semibold text-fg-subtle">
                  {{ 'people.detail.atAGlance' | transloco }}
                </h2>
                <ul class="flex flex-col gap-1.5 text-[13px]">
                  <li [class.text-warn]="e.gap_count > 0" data-testid="glance-gaps">
                    {{ 'people.employees.gapCount' | transloco: { count: e.gap_count } }}
                  </li>
                  <li>
                    {{
                      'people.employees.openChecklists' | transloco: { count: e.open_checklists }
                    }}
                  </li>
                </ul>
                <a
                  routerLink="/people/matrix"
                  class="mt-3 inline-block text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {{ 'people.detail.openMatrix' | transloco }}
                </a>
              </app-card>
              <app-supports-requirements entityType="employee" [entityId]="e.id" />
              <app-why-it-matters scope="people" page="detail" />
              <div class="flex flex-col items-start gap-1">
                <app-people-lesson-link lesson="competence-basics" />
                <app-people-lesson-link lesson="joiners-and-leavers" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'people.detail.deleteTitle' | transloco"
            [message]="'people.detail.deleteMessage' | transloco: { code: e.code }"
            [confirmLabel]="'people.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class EmployeeDetail {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = EMPLOYEE_FIELD_LABELS;
  protected readonly statusTone = employeeStatusTone;
  protected readonly screeningTone = screeningTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly employee = signal<Employee | null>(null);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions);
  protected readonly canManage = computed(() => hasPerm(this.permissions(), PERM_MANAGE));
  protected readonly canDisciplinary = computed(() =>
    hasPerm(this.permissions(), PERM_DISCIPLINARY),
  );

  private request = new Subscription();
  private scrolled = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const e = this.employee();
      return {
        module: 'people',
        entityType: 'employee',
        entityId: this.id(),
        view: 'detail',
        title: e ? `${e.code} ${e.full_name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.employee();
    if (!orgId || !e || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteEmployee(orgId, e.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.notifications.success('people.notices.employeeDeleted', { code: e.code });
        void this.router.navigate(['/people/employees']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  /** `?tab=awareness` (and other section names) scrolls to that section once. */
  private scrollToSection(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (this.scrolled || !tab || !SECTION_ANCHORS.has(tab)) {
      return;
    }
    this.scrolled = true;
    afterNextRender(
      () => {
        const el = document.getElementById(tab);
        el?.scrollIntoView?.({ block: 'start' });
      },
      { injector: this.injector },
    );
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
      this.state.set('loading');
    }
    this.request = this.api.getEmployee(orgId, id).subscribe({
      next: (employee) => {
        this.employee.set(employee);
        this.state.set('ready');
        this.scrollToSection();
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(peopleErrorKey(error));
          this.state.set('error');
        } else {
          this.notifications.error(peopleErrorKey(error));
        }
      },
    });
  }
}
