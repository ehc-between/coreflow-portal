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
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { OutputsPanel } from '../../shared/outputs';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../ask/ask-panel.service';
import { PeopleApi } from './data/people-api';
import { countKey, employeeStatusLook, hasPerm, sameTitle } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import {
  ChecklistKind,
  Employee,
  EmployeeCompliance,
  PERM_DISCIPLINARY,
  PERM_MANAGE,
} from './data/people.models';
import { EmployeeAwarenessSection } from './employee-awareness';
import { EmployeeChecklistsSection } from './employee-checklists';
import { EmployeeCompetencesSection } from './employee-competences';
import { EmployeeDisciplinarySection } from './employee-disciplinary';
import { EmployeeAccount } from './ui/employee-account';
import { ComplianceFix, EmployeeComplianceCard } from './ui/employee-compliance';
import { EmployeeHandoverSection, EmployeeTrainingSection } from './ui/employee-training';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Sections of the details tab that `?section=` / `?tab=` links scroll to. */
const SECTION_ANCHORS = new Set([
  'compliance',
  'competences',
  'training',
  'checklists',
  'awareness',
  'handover',
  'disciplinary',
]);

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const EMPLOYEE_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'people.fields.code',
  job_title: 'people.fields.jobTitle',
  position_id: 'people.fields.position',
  department_id: 'people.fields.department',
  manager_id: 'people.fields.manager',
  user_id: 'people.fields.user',
  employment_type: 'people.fields.employmentType',
  status: 'people.fields.status',
  start_date: 'people.fields.startDate',
  end_date: 'people.fields.endDate',
  confidentiality_signed_on: 'people.fields.confidentialitySignedOn',
  security_terms_accepted_on: 'people.fields.securityTermsAcceptedOn',
  screening_status: 'people.fields.screeningStatus',
  screening_completed_on: 'people.fields.screeningCompletedOn',
  screening_scope: 'people.fields.screeningScope',
  screening_legal_basis: 'people.fields.screeningLegalBasis',
  screening_recheck_on: 'people.fields.screeningRecheckOn',
  post_employment_ack_on: 'people.fields.postEmploymentAckOn',
};

/** The one main action of the page header for this person, if any. */
export type PrimaryAction =
  | { readonly kind: 'openChecklist'; readonly checklist: ChecklistKind; readonly id: string }
  | { readonly kind: 'start'; readonly checklist: ChecklistKind }
  | { readonly kind: 'edit' };

export function primaryActionFor(e: Employee): PrimaryAction | null {
  if (!e.can_edit) {
    return null;
  }
  if (e.open_offboarding_id) {
    return { kind: 'openChecklist', checklist: 'offboarding', id: e.open_offboarding_id };
  }
  if (e.open_onboarding_id) {
    return { kind: 'openChecklist', checklist: 'onboarding', id: e.open_onboarding_id };
  }
  if (e.status === 'onboarding') {
    return { kind: 'start', checklist: 'onboarding' };
  }
  return { kind: 'edit' };
}

/**
 * A person (`/people/employees/:id`): what the standards require for them
 * ("Krav for denne personen"), role and employment, competence against the
 * position (with actions on gaps), training from M11, awareness (policies read,
 * linked to the document version), joiner/leaver checklists, equipment and access
 * when they leave, and (restricted) disciplinary cases; plus the record kit.
 */
@Component({
  selector: 'app-people-employee-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
    WhyItMatters,
    RecordDetailLayout,
    Alert,
    Button,
    Card,
    OutputsPanel,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    MenuItem,
    StatusBadge,
    EmployeeAccount,
    EmployeeAwarenessSection,
    EmployeeChecklistsSection,
    EmployeeCompetencesSection,
    EmployeeComplianceCard,
    EmployeeDisciplinarySection,
    EmployeeHandoverSection,
    EmployeeTrainingSection,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            bodyKey="people.detail.notFoundBody"
            ctaKey="people.common.backToList"
            ctaLink="/people/employees"
          />
        </div>
      }
      @default {
        @if (employee(); as e) {
          <app-record-detail-layout
            entityType="employee"
            [entityId]="e.id"
            [title]="e.full_name"
            [breadcrumbs]="[root, { label: e.full_name }]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="e.can_edit"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono" data-testid="employee-code">{{ e.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'people.employmentTypes.' + e.employment_type | transloco }}</span>
              @if (e.position?.name ?? e.job_title; as role) {
                <span aria-hidden="true">·</span>
                <span>{{ role }}</span>
              }
              <app-status-badge
                [meaning]="statusLook(e.status).meaning"
                [value]="statusLook(e.status).value"
                [labelKey]="'people.status.' + e.status"
                data-testid="employee-status"
              />
              <span class="sr-only" data-testid="employee-heading">{{ e.full_name }}</span>
            </ng-container>

            @if (primary(); as action) {
              <ng-container ngProjectAs="[primary]">
                @switch (action.kind) {
                  @case ('openChecklist') {
                    @if (action.kind === 'openChecklist') {
                      <a
                        [routerLink]="['/people/checklists', action.id]"
                        data-testid="open-checklist"
                      >
                        <app-button>{{
                          'people.detail.openChecklist.' + action.checklist | transloco
                        }}</app-button>
                      </a>
                    }
                  }
                  @case ('start') {
                    @if (action.kind === 'start') {
                      <app-button
                        (click)="startChecklist(action.checklist)"
                        [attr.data-testid]="'start-' + action.checklist"
                      >
                        {{ 'people.checklists.start.' + action.checklist | transloco }}
                      </app-button>
                    }
                  }
                  @default {
                    <a
                      [routerLink]="['/people/employees', e.id, 'edit']"
                      data-testid="employee-edit"
                    >
                      <app-button>{{ 'people.common.edit' | transloco }}</app-button>
                    </a>
                  }
                }
              </ng-container>
            }

            <ng-container ngProjectAs="[secondary]">
              @if (e.can_edit && primary()?.kind !== 'edit') {
                <a [routerLink]="['/people/employees', e.id, 'edit']" data-testid="employee-edit">
                  <app-button variant="secondary">{{
                    'people.common.edit' | transloco
                  }}</app-button>
                </a>
              }
              <app-watch-button entityType="employee" [entityId]="e.id" />
            </ng-container>

            <ng-container ngProjectAs="[overflow]">
              <button appMenuItem type="button" (click)="summarise()" data-testid="summarise">
                {{ 'people.detail.summarise' | transloco }}
              </button>
              <a
                appMenuItem
                [routerLink]="['/people/employees', e.id, 'competence-record']"
                data-testid="competence-record"
              >
                {{ 'people.record.open' | transloco }}
              </a>
              @if (e.can_edit) {
                @if (
                  !e.open_onboarding_id && primary()?.kind !== 'start' && e.status !== 'former'
                ) {
                  <button
                    appMenuItem
                    type="button"
                    (click)="startChecklist('onboarding')"
                    data-testid="start-onboarding"
                  >
                    {{ 'people.checklists.start.onboarding' | transloco }}
                  </button>
                }
                @if (!e.open_offboarding_id && e.status !== 'former') {
                  <button
                    appMenuItem
                    type="button"
                    (click)="startChecklist('offboarding')"
                    data-testid="start-offboarding"
                  >
                    {{ 'people.checklists.start.offboarding' | transloco }}
                  </button>
                }
              }
              @if (canRevoke()) {
                <button
                  appMenuItem
                  type="button"
                  (click)="revoking.set(true)"
                  data-testid="employee-revoke-access"
                >
                  {{ 'people.detail.revokeAccess' | transloco }}
                </button>
              }
              @if (canManage()) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="deleting.set(true)"
                  data-testid="employee-delete"
                >
                  {{ 'people.common.delete' | transloco }}
                </button>
              }
            </ng-container>

            <app-help-strip help scope="people" page="detail" lesson="competence-basics" />

            <div class="flex flex-col gap-5">
              @if (e.status === 'former') {
                <app-alert tone="info">{{ 'people.detail.formerNotice' | transloco }}</app-alert>
              }
              @if (e.access_revoked_at) {
                <app-alert tone="info" data-testid="access-state">{{
                  'people.detail.accessRevokedOn'
                    | transloco: { date: (e.access_revoked_at | localDate) }
                }}</app-alert>
              } @else if (e.status === 'offboarding' && e.end_date) {
                <app-alert tone="info" data-testid="access-state">{{
                  'people.detail.accessRevokesOn' | transloco: { date: (e.end_date | localDay) }
                }}</app-alert>
              }
              @if (!e.user && e.status !== 'former') {
                <app-people-employee-account
                  [employee]="e"
                  [canEdit]="e.can_edit"
                  (linked)="onUpdated($event)"
                />
              }

              <app-card>
                <app-people-employee-compliance
                  [employee]="e"
                  [canEdit]="e.can_edit"
                  [refresh]="refreshCount()"
                  (fix)="fix($event)"
                  (loaded)="onCompliance($event)"
                />
              </app-card>

              <app-card>
                <h2 class="mb-3 text-card font-bold text-fg">
                  {{ 'people.detail.summary' | transloco }}
                </h2>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="people.fields.position" empty="none">
                    @if (e.position; as p) {
                      <a
                        [routerLink]="['/people/positions', p.id]"
                        class="font-semibold text-accent hover:underline"
                        >{{ p.name }}</a
                      >
                      @if (e.position_risk_level; as risk) {
                        <span class="ml-1 text-meta text-fg-muted">{{
                          'people.riskLevels.' + risk | transloco
                        }}</span>
                      }
                    }
                  </app-field-item>
                  @if (!sameTitle(e.job_title, e.position?.name)) {
                    <app-field-item labelKey="people.fields.ownTitle" [value]="e.job_title" />
                  }
                  <app-field-item
                    labelKey="people.fields.department"
                    [value]="e.department?.name"
                  />
                  <app-field-item labelKey="people.fields.manager" empty="none">
                    @if (e.manager; as m) {
                      <a
                        [routerLink]="['/people/employees', m.id]"
                        class="font-semibold text-accent hover:underline"
                        >{{ m.name }}</a
                      >
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="people.fields.user"
                    empty="none"
                    [value]="e.user?.name"
                  />
                  <app-field-item labelKey="people.fields.email" [value]="e.email" />
                  @if (e.phone) {
                    <app-field-item labelKey="people.fields.phone" [value]="e.phone" />
                  }
                  <app-field-item labelKey="people.fields.location" [value]="e.location" />
                  <app-field-item labelKey="people.fields.startDate">
                    @if (e.start_date) {
                      {{ e.start_date | localDay }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="people.fields.endDate">
                    @if (e.end_date) {
                      {{ e.end_date | localDay }}
                    }
                  </app-field-item>
                  @if (e.employee_number) {
                    <app-field-item
                      labelKey="people.fields.employeeNumber"
                      [value]="e.employee_number"
                    />
                  }
                  @if (e.source_application; as app) {
                    <app-field-item labelKey="people.fields.sourceApplication">
                      <a [routerLink]="app.url" class="font-semibold text-accent hover:underline">{{
                        'people.detail.hiredThrough' | transloco: { code: app.requisition.code }
                      }}</a>
                    </app-field-item>
                  }
                  @if (e.notes) {
                    <app-field-item
                      labelKey="people.fields.notes"
                      [value]="e.notes"
                      [wide]="true"
                      [multiline]="true"
                    />
                  }
                </app-field-list>
              </app-card>

              <app-card>
                <app-people-employee-competences
                  [employeeId]="e.id"
                  [employeeName]="e.full_name"
                  [hasUser]="!!e.user"
                  [canEdit]="e.can_edit"
                  [refresh]="refreshCount()"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-people-employee-training [employeeId]="e.id" />
              </app-card>

              <app-card>
                <app-people-employee-awareness
                  [employeeId]="e.id"
                  [canEdit]="e.can_edit"
                  (changed)="reload()"
                />
              </app-card>

              <app-card>
                <app-people-employee-checklists
                  [employeeId]="e.id"
                  [canEdit]="e.can_edit"
                  [endDate]="e.end_date"
                  [refresh]="refreshCount()"
                  (changed)="reload()"
                />
              </app-card>

              @if (showHandover()) {
                <app-card>
                  <app-people-employee-handover [employeeId]="e.id" [refresh]="refreshCount()" />
                </app-card>
              }

              @if (canDisciplinary()) {
                <app-card>
                  <app-people-employee-disciplinary [employeeId]="e.id" />
                </app-card>
              }

              <app-outputs-panel
                entityType="employee"
                [entityId]="e.id"
                data-testid="employee-outputs"
              />
            </div>

            <ng-container ngProjectAs="[aside]">
              <app-card>
                <h2 class="mb-2 text-ui font-semibold text-fg-subtle">
                  {{ 'people.detail.atAGlance' | transloco }}
                </h2>
                <ul class="flex flex-col gap-1.5 text-ui">
                  <!-- U35: every number is a door: each count scrolls to the list it counts. -->
                  <li [class.text-warn-ink]="e.gap_count > 0">
                    <button
                      type="button"
                      class="text-left hover:underline"
                      (click)="scrollTo('competences')"
                      data-testid="glance-gaps"
                    >
                      {{
                        countKey('people.employees.gapCount', e.gap_count)
                          | transloco: { count: e.gap_count }
                      }}
                    </button>
                  </li>
                  @if (e.expiring_count) {
                    <li class="text-warn-ink">
                      <button
                        type="button"
                        class="text-left hover:underline"
                        (click)="scrollTo('competences')"
                        data-testid="glance-expiring"
                      >
                        {{
                          countKey('people.employees.expiringCount', e.expiring_count)
                            | transloco: { count: e.expiring_count }
                        }}
                      </button>
                    </li>
                  }
                  <li>
                    <button
                      type="button"
                      class="text-left hover:underline"
                      (click)="scrollTo('checklists')"
                      data-testid="glance-checklists"
                    >
                      {{
                        countKey('people.employees.openChecklists', e.open_checklists)
                          | transloco: { count: e.open_checklists }
                      }}
                    </button>
                  </li>
                </ul>
                <a
                  routerLink="/people/matrix"
                  class="mt-3 inline-block text-meta font-semibold text-accent hover:underline"
                >
                  {{ 'people.detail.openMatrix' | transloco }}
                </a>
              </app-card>
            </ng-container>
            <ng-container ngProjectAs="[aside-learn]">
              <app-why-it-matters scope="people" page="detail" />
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

          <app-confirm-dialog
            [open]="revoking()"
            [title]="'people.detail.revokeTitle' | transloco"
            [message]="'people.detail.revokeMessage' | transloco: { name: e.full_name }"
            [confirmLabel]="'people.detail.revokeConfirm' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="revokeAccess()"
            (cancelled)="revoking.set(false)"
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
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  readonly id = input.required<string>();

  private readonly checklists = viewChild(EmployeeChecklistsSection);
  private readonly competences = viewChild(EmployeeCompetencesSection);
  private readonly awareness = viewChild(EmployeeAwarenessSection);

  protected readonly tabs = TABS;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly fieldLabels = EMPLOYEE_FIELD_LABELS;
  protected readonly statusLook = employeeStatusLook;
  protected readonly countKey = countKey;
  protected readonly sameTitle = sameTitle;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly employee = signal<Employee | null>(null);
  protected readonly deleting = signal(false);
  protected readonly revoking = signal(false);
  protected readonly busy = signal(false);
  /** Bumped after changes so the sections that depend on the record reload. */
  protected readonly refreshCount = signal(0);
  /** The clauses the person's controls document (sent to the assistant). */
  private readonly documented = signal<readonly string[]>([]);

  protected readonly primary = computed(() => {
    const e = this.employee();
    return e ? primaryActionFor(e) : null;
  });

  protected readonly showHandover = computed(() => {
    const e = this.employee();
    return !!e && (e.status === 'offboarding' || e.status === 'former' || !!e.open_offboarding_id);
  });

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions);
  protected readonly canManage = computed(() => hasPerm(this.permissions(), PERM_MANAGE));
  /**
   * "Remove access now" (summary dismissal): `people:manage`, access not yet revoked,
   * and never on your own record (the backend refuses that with `cannot_revoke_self`).
   */
  protected readonly canRevoke = computed(() => {
    const e = this.employee();
    if (!e || e.access_revoked_at || !this.canManage()) {
      return false;
    }
    const me = this.auth.user()?.id;
    return !(me && e.user?.id === me);
  });
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
        requirements: this.documented(),
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

  protected onUpdated(employee: Employee): void {
    this.employee.set(employee);
    this.refreshCount.update((n) => n + 1);
  }

  protected onCompliance(data: EmployeeCompliance): void {
    this.documented.set(
      data.items.filter((i) => i.status === 'ok').flatMap((i) => [...i.clause_refs]),
    );
  }

  protected summarise(): void {
    this.ask.askAbout(this.language.translate('people.ask.summariseEmployee'));
  }

  protected startChecklist(kind: ChecklistKind): void {
    this.checklists()?.openStart(kind);
  }

  /** "Registrer" / "Fiks" in the compliance card. */
  protected fix(target: ComplianceFix): void {
    const e = this.employee();
    if (!e) {
      return;
    }
    switch (target) {
      case 'edit':
        void this.router.navigate(['/people/employees', e.id, 'edit'], {
          fragment: 'security',
        });
        return;
      case 'competences':
        this.scrollTo('competences');
        this.competences()?.openAssess(null);
        return;
      case 'awareness':
        this.scrollTo('awareness');
        this.awareness()?.open(null);
        return;
      case 'offboarding':
        if (e.open_offboarding_id) {
          void this.router.navigate(['/people/checklists', e.open_offboarding_id]);
        } else {
          this.startChecklist('offboarding');
        }
        return;
    }
  }

  protected revokeAccess(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const e = this.employee();
    if (!orgId || !e || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.revokeAccess(orgId, e.id).subscribe({
      next: (employee) => {
        this.busy.set(false);
        this.revoking.set(false);
        this.onUpdated(employee);
        this.notifications.success('people.notices.accessRevoked', { name: employee.full_name });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.revoking.set(false);
        this.notifications.error(peopleErrorKey(error));
        this.reload();
      },
    });
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

  protected scrollTo(section: string): void {
    afterNextRender(() => document.getElementById(section)?.scrollIntoView?.({ block: 'start' }), {
      injector: this.injector,
    });
  }

  /** `?section=awareness` (or the older `?tab=awareness`) scrolls to that section once. */
  private scrollToSection(): void {
    const params = this.route.snapshot.queryParamMap;
    const section = params.get('section') ?? params.get('tab');
    if (this.scrolled || !section || !SECTION_ANCHORS.has(section)) {
      return;
    }
    this.scrolled = true;
    this.scrollTo(section);
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
        if (!initial) {
          this.refreshCount.update((n) => n + 1);
        }
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
