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
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { OutputsPanel } from '../../shared/outputs';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../ask/ask-panel.service';
import { PeopleApi } from './data/people-api';
import { employeeStatusLook, hasPerm, sameTitle } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import {
  COMPLIANCE_KEYS,
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
import { ComplianceFix, EmployeeComplianceCard, complianceFix } from './ui/employee-compliance';
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

/** The status sentence of a person: their status and whether the people controls are in order. */
export function employeeStatusLine(
  e: Employee,
  compliance: EmployeeCompliance | null,
): { key: string; tone: StatusLineTone; count: number } {
  const base = 'people.employeeDetail.status.';
  if (e.status === 'former') {
    return { key: base + 'former', tone: 'neutral', count: 0 };
  }
  if (!compliance) {
    return { key: base + 'plain', tone: 'neutral', count: 0 };
  }
  const open = compliance.open;
  if (open === 0) {
    return { key: base + 'inOrder', tone: 'pass', count: 0 };
  }
  return { key: base + (open === 1 ? 'openOne' : 'open'), tone: 'warn', count: open };
}

/**
 * What a person still needs ("Oppfølging", docs/ux-guide.md §2.7): the people
 * controls that are not in order (each with the same fix as in "Krav for denne
 * personen"), a position and a manager, expiring competence and an open checklist.
 */
export function employeeMissing(
  e: Employee,
  compliance: EmployeeCompliance | null,
  editLink: readonly unknown[],
  fix: (target: ComplianceFix) => void,
  scrollTo: (section: string) => void,
): RecordMissingItem[] {
  const base = 'people.employeeDetail.missing.';
  const known = new Set<string>(COMPLIANCE_KEYS);
  const out: RecordMissingItem[] = [];
  for (const item of compliance?.items ?? []) {
    if (item.status === 'ok' || item.status === 'not_required' || !known.has(item.key)) {
      continue;
    }
    const target = complianceFix(item);
    out.push({
      key: item.key,
      labelKey: base + item.key,
      params: { count: item.gaps ?? 0 },
      action: () => fix(target),
    });
  }
  if (e.status !== 'former') {
    if (!e.position) {
      out.push({ key: 'position', labelKey: base + 'position', link: editLink });
    }
    if (!e.manager) {
      out.push({ key: 'manager', labelKey: base + 'manager', link: editLink });
    }
  }
  if (e.expiring_count) {
    out.push({
      key: 'expiring',
      labelKey: base + (e.expiring_count === 1 ? 'expiringOne' : 'expiring'),
      params: { count: e.expiring_count },
      action: () => scrollTo('competences'),
    });
  }
  if (e.open_checklists > 0) {
    out.push({
      key: 'checklists',
      labelKey: base + (e.open_checklists === 1 ? 'checklistsOne' : 'checklists'),
      params: { count: e.open_checklists },
      action: () => scrollTo('checklists'),
    });
  }
  return out;
}

/**
 * A person (`/people/employees/:id`), built on the detail-page anatomy
 * (docs/ux-guide.md §2.7). "Hovedinformasjon": a status sentence (are the
 * people controls in order?), their position (linked, with its security risk),
 * manager (linked), department and start date. Details tab: employment and
 * contact details, what the standards require for them ("Krav for denne
 * personen"), competence against the position (with actions on gaps), training
 * from M11, awareness (policies read, linked to the document version),
 * joiner/leaver checklists, equipment and access when they leave, and
 * (restricted) disciplinary cases. The "Oppfølging" card lists what is missing,
 * the requirements it documents, its connections and the account / last change.
 */
@Component({
  selector: 'app-people-employee-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WhyItMatters,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    Alert,
    Button,
    Card,
    OutputsPanel,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    HelpStrip,
    Icon,
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
            [anatomy]="true"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono" data-testid="employee-code">{{ e.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'people.employeeDetail.type' | transloco }}</span>
              <span aria-hidden="true">·</span>
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
                    <a [routerLink]="editLink()" data-testid="employee-edit">
                      <app-button>{{ 'people.common.edit' | transloco }}</app-button>
                    </a>
                  }
                }
              </ng-container>
            }

            @if (e.can_edit && primary()?.kind !== 'edit') {
              <a secondary [routerLink]="editLink()" data-testid="employee-edit">
                <app-button variant="secondary">{{ 'people.common.edit' | transloco }}</app-button>
              </a>
            }

            <button appMenuItem ask type="button" (click)="summarise()" data-testid="summarise">
              <app-icon name="spark" [size]="15" />
              {{ 'people.detail.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askTerms()">
              <app-icon name="spark" [size]="15" />
              {{ 'people.employeeDetail.askTerms' | transloco }}
            </button>

            <ng-container ngProjectAs="[overflow]">
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

            <app-record-lead record-lead [fillLink]="e.can_edit ? editLink() : null">
              @if (statusLine(); as line) {
                <app-record-status-line status [tone]="line.tone">
                  {{
                    line.key
                      | transloco
                        : {
                            status: ('people.status.' + e.status | transloco),
                            count: line.count,
                          }
                  }}
                </app-record-status-line>
              }
              <app-field-item size="lead" labelKey="people.employeeDetail.lead.position">
                @if (e.position; as p) {
                  <span class="flex flex-col gap-1">
                    <a
                      [routerLink]="['/people/positions', p.id]"
                      class="font-semibold text-accent hover:underline"
                      data-testid="lead-position"
                      >{{ p.name }}</a
                    >
                    @if (!sameTitle(e.job_title, p.name)) {
                      <span class="text-ui text-fg-muted">{{
                        'people.employeeDetail.ownTitle' | transloco: { title: e.job_title }
                      }}</span>
                    }
                    @if (e.position_risk_level; as risk) {
                      <span class="text-ui text-fg-muted">{{
                        'people.riskLevels.' + risk | transloco
                      }}</span>
                    }
                  </span>
                } @else if (e.job_title) {
                  {{ e.job_title }}
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="people.employeeDetail.lead.manager">
                @if (e.manager; as m) {
                  <a
                    [routerLink]="['/people/employees', m.id]"
                    class="font-semibold text-accent hover:underline"
                    >{{ m.name }}</a
                  >
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="people.employeeDetail.lead.department"
                [value]="e.department?.name"
              />
              <app-field-item size="lead" labelKey="people.employeeDetail.lead.started">
                @if (e.start_date) {
                  {{ e.start_date | localDay }}
                  @if (e.end_date) {
                    <span class="block text-ui text-fg-muted">{{
                      'people.employeeDetail.lastDay' | transloco: { date: (e.end_date | localDay) }
                    }}</span>
                  }
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-6">
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

              <app-record-details [columns]="3" [fillLink]="e.can_edit ? editLink() : null">
                <app-field-item
                  labelKey="people.fields.employmentType"
                  [value]="'people.employmentTypes.' + e.employment_type | transloco"
                />
                <app-field-item labelKey="people.fields.email" [value]="e.email" />
                @if (e.phone) {
                  <app-field-item labelKey="people.fields.phone" [value]="e.phone" />
                }
                <app-field-item labelKey="people.fields.location" [value]="e.location" />
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
              </app-record-details>

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

            <div follow-up-connections class="mt-3 flex flex-col gap-1.5 text-meta">
              <a
                [routerLink]="['/people/employees', e.id, 'competence-record']"
                class="font-semibold text-accent hover:underline"
                data-testid="competence-record"
                >{{ 'people.record.open' | transloco }} →</a
              >
              <a routerLink="/people/matrix" class="font-semibold text-accent hover:underline"
                >{{ 'people.detail.openMatrix' | transloco }} →</a
              >
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="people.employeeDetail.account"
                [value]="e.user?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="people.employeeDetail.updated"
                [value]="e.updated_at | localDate"
              />
            </app-record-meta>

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
  /** The people controls (from "Krav for denne personen"). */
  private readonly compliance = signal<EmployeeCompliance | null>(null);

  protected readonly editLink = computed(() => ['/people/employees', this.id(), 'edit']);

  protected readonly statusLine = computed(() => {
    const e = this.employee();
    return e ? employeeStatusLine(e, this.compliance()) : null;
  });

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const e = this.employee();
    if (!e || !e.can_edit) {
      return [];
    }
    return employeeMissing(
      e,
      this.compliance(),
      this.editLink(),
      (target) => this.fix(target),
      (section) => this.scrollTo(section),
    );
  });

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
    this.compliance.set(data);
    this.documented.set(
      data.items.filter((i) => i.status === 'ok').flatMap((i) => [...i.clause_refs]),
    );
  }

  protected summarise(): void {
    this.ask.askAbout(this.language.translate('people.ask.summariseEmployee'));
  }

  protected askTerms(): void {
    this.ask.askAbout(this.language.translate('people.ask.securityTerms'), {
      field: this.language.translate('people.compliance.title'),
    });
  }

  protected startChecklist(kind: ChecklistKind): void {
    this.checklists()?.openStart(kind);
  }

  /** "Registrer" / "Fiks" in the compliance card and the "Oppfølging" card. */
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
