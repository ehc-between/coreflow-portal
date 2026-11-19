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
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
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
import { Button } from '../../shared/ui/button/button';
import { OutputsPanel } from '../../shared/outputs';
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
import {
  addMonthsIso,
  countKey,
  employeeStatusLook,
  hasPerm,
  textOrNull,
  todayIso,
} from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import { DocumentRef, Employee, PERM_MANAGE, PositionDetail } from './data/people.models';
import { PositionRequirements } from './position-requirements';
import { PeopleField } from './ui/people-field';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const POSITION_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'people.fields.positionTitle',
  code: 'people.fields.code',
  description: 'people.fields.description',
  responsibilities: 'people.fields.responsibilities',
  authorities: 'people.fields.authorities',
  department_id: 'people.fields.department',
  reports_to_id: 'people.fields.reportsTo',
  risk_level: 'people.fields.riskLevel',
  status: 'people.fields.status',
  owner_user_id: 'people.fields.owner',
  requirements: 'people.requirements.title',
  next_review_on: 'people.fields.nextReviewOn',
  last_reviewed_on: 'people.fields.lastReviewedOn',
  job_description_document_id: 'people.fields.jobDescription',
};

/**
 * The status sentence of a position: retired, review overdue, incomplete (no
 * responsibilities, authorities or competence requirements) or in order.
 */
export function positionStatusLine(p: PositionDetail): { key: string; tone: StatusLineTone } {
  const base = 'people.positionDetail.status.';
  if (p.status === 'retired') {
    return { key: base + 'retired', tone: 'neutral' };
  }
  if (p.review_due) {
    return { key: base + 'reviewDue', tone: 'warn' };
  }
  if (!p.responsibilities || !p.authorities || p.requirements.length === 0) {
    return { key: base + 'incomplete', tone: 'warn' };
  }
  return { key: base + 'active', tone: 'pass' };
}

/**
 * What a position still needs ("Oppfølging", docs/ux-guide.md §2.7): an overdue
 * review, the role description fields, the competence requirements, an owner and
 * the job description, each a link to the edit page or an action.
 */
export function positionMissing(
  p: PositionDetail,
  editLink: readonly unknown[],
  review: () => void,
  requirements: () => void,
): RecordMissingItem[] {
  const base = 'people.positionDetail.missing.';
  const out: RecordMissingItem[] = [];
  if (p.status === 'retired') {
    return out;
  }
  if (p.review_due) {
    out.push({ key: 'review', labelKey: base + 'review', action: review });
  }
  if (!p.responsibilities) {
    out.push({ key: 'responsibilities', labelKey: base + 'responsibilities', link: editLink });
  }
  if (!p.authorities) {
    out.push({ key: 'authorities', labelKey: base + 'authorities', link: editLink });
  }
  if (p.requirements.length === 0) {
    out.push({ key: 'requirements', labelKey: base + 'requirements', action: requirements });
  }
  if (!p.owner) {
    out.push({ key: 'owner', labelKey: base + 'owner', link: editLink });
  }
  if (!p.job_description) {
    out.push({ key: 'jobDescription', labelKey: base + 'jobDescription', link: editLink });
  }
  return out;
}

/**
 * A position (`/people/positions/:id`), built on the detail-page anatomy
 * (docs/ux-guide.md §2.7). "Hovedinformasjon": a status sentence, what the role
 * is for, its responsibilities and authorities (HS 5.3) and its security risk
 * (high means a background check is required, A.6.1). Details: department,
 * reports to and the job description (linked), then the competence requirements
 * (HS 7.2). The "Oppfølging" card lists what is missing, the requirements it
 * documents, its connections with the people who hold it, and the review cycle.
 * "Merk som gjennomgått" records the yearly review and schedules the next one (it
 * feeds the management review).
 */
@Component({
  selector: 'app-people-position-detail',
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
    EntityChip,
    Button,
    OutputsPanel,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    PositionRequirements,
    PeopleField,
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
            ctaKey="people.common.backToPositions"
            ctaLink="/people/positions"
          />
        </div>
      }
      @default {
        @if (position(); as p) {
          <app-record-detail-layout
            entityType="position"
            [entityId]="p.id"
            [title]="p.title"
            [breadcrumbs]="[
              root,
              { labelKey: 'people.positions.title', link: '/people/positions' },
              { label: p.title },
            ]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="canManage()"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels"
            [anatomy]="true"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              @if (p.code) {
                <span
                  class="font-mono"
                  [title]="'people.positions.codeHint' | transloco"
                  data-testid="position-code"
                  >{{ p.code }}</span
                >
                <span aria-hidden="true">·</span>
              }
              <span>{{ 'people.positionDetail.type' | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="p.status === 'active' ? 'approved' : p.status"
                [labelKey]="'people.recordStatus.' + p.status"
              />
              @if (p.review_due) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="people.positions.reviewDue"
                  data-testid="position-review-due"
                />
              }
              <span class="sr-only" data-testid="position-heading">{{ p.title }}</span>
            </ng-container>

            @if (canManage()) {
              <app-button primary (click)="openReview()" data-testid="position-reviewed">
                {{ 'people.positions.markReviewed' | transloco }}
              </app-button>
            }
            @if (canManage()) {
              <a secondary [routerLink]="editLink()" data-testid="position-edit">
                <app-button variant="secondary">{{ 'people.common.edit' | transloco }}</app-button>
              </a>
            }
            @if (canManage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="position-delete"
              >
                {{ 'people.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="summarise()" data-testid="summarise">
              <app-icon name="spark" [size]="15" />
              {{ 'people.positions.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askRole()">
              <app-icon name="spark" [size]="15" />
              {{ 'people.positionDetail.askRole' | transloco }}
            </button>

            <app-help-strip
              help
              scope="people"
              page="positionDetail"
              lesson="roles-and-responsibilities"
            />

            <app-record-lead record-lead [fillLink]="canManage() ? editLink() : null">
              <app-record-status-line status [tone]="statusLine().tone">
                {{ statusLine().key | transloco }}
              </app-record-status-line>
              <app-field-item
                size="lead"
                labelKey="people.positionDetail.lead.purpose"
                [value]="p.description"
                [multiline]="true"
                [wide]="true"
              />
              <app-field-item
                size="lead"
                labelKey="people.positionDetail.lead.responsibilities"
                [value]="p.responsibilities"
                [multiline]="true"
              />
              <app-field-item
                size="lead"
                labelKey="people.positionDetail.lead.authorities"
                [value]="p.authorities"
                [multiline]="true"
              />
              <app-field-item size="lead" labelKey="people.positionDetail.lead.risk" [wide]="true">
                <span class="flex flex-wrap items-center gap-2">
                  <app-status-badge
                    meaning="severity"
                    [value]="p.risk_level"
                    [labelKey]="'people.riskLevels.' + p.risk_level"
                  />
                  <span class="text-ui text-fg-muted" data-testid="position-screening">{{
                    (screeningRequired()
                      ? 'people.positions.screeningRequired'
                      : 'people.positions.screeningNotRequired'
                    ) | transloco
                  }}</span>
                </span>
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-6">
              <app-record-details [columns]="3" [fillLink]="canManage() ? editLink() : null">
                <app-field-item labelKey="people.fields.department" [value]="p.department?.name" />
                <app-field-item labelKey="people.fields.reportsTo">
                  @if (p.reports_to; as r) {
                    <a
                      [routerLink]="['/people/positions', r.id]"
                      class="font-semibold text-accent hover:underline"
                      >{{ r.name }}</a
                    >
                  }
                </app-field-item>
                <app-field-item labelKey="people.fields.jobDescription">
                  @if (p.job_description; as doc) {
                    <app-entity-chip
                      [ref]="documentRef(doc)"
                      [showType]="false"
                      [statusText]="true"
                      data-testid="job-description"
                    />
                  }
                </app-field-item>
              </app-record-details>

              <section class="border-t border-border pt-5" id="requirements">
                <app-people-position-requirements
                  [position]="p"
                  [canManage]="canManage()"
                  (saved)="position.set($event)"
                />
              </section>

              <app-outputs-panel
                entityType="position"
                [entityId]="p.id"
                data-testid="position-outputs"
              />
            </div>

            <section follow-up-connections class="mt-4 block" aria-labelledby="cf-pos-holders-h">
              <h3 id="cf-pos-holders-h" class="mb-2 text-ui font-semibold text-fg">
                {{ 'people.positions.holdersTitle' | transloco }}
                @if (holders().length > 0) {
                  <span class="font-normal text-fg-muted">({{ holders().length }})</span>
                }
              </h3>
              @if (holders().length === 0) {
                <p class="text-meta text-fg-muted">
                  {{ 'people.positions.noHolders' | transloco }}
                </p>
              } @else {
                <ul class="flex flex-col gap-1.5" data-testid="position-holders">
                  @for (e of shownHolders(); track e.id) {
                    <li class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ui">
                      <a
                        [routerLink]="['/people/employees', e.id]"
                        class="min-w-0 truncate font-medium text-fg hover:text-accent hover:underline"
                        >{{ e.full_name }}</a
                      >
                      @if (e.gap_count > 0) {
                        <span class="text-micro font-semibold text-warn-ink">{{
                          countKey('people.employees.gapCount', e.gap_count)
                            | transloco: { count: e.gap_count }
                        }}</span>
                      } @else if ((e.flags ?? []).includes('screening_missing')) {
                        <span class="text-micro font-semibold text-warn-ink">{{
                          'people.flags.screening_missing' | transloco
                        }}</span>
                      }
                      @if (e.status !== 'active') {
                        <app-status-badge
                          [meaning]="employeeLook(e.status).meaning"
                          [value]="employeeLook(e.status).value"
                          [labelKey]="'people.status.' + e.status"
                        />
                      }
                    </li>
                  }
                </ul>
                @if (holders().length > holderLimit && !allHolders()) {
                  <button
                    type="button"
                    class="mt-2 text-meta font-semibold text-accent hover:underline"
                    (click)="allHolders.set(true)"
                  >
                    {{
                      'people.positionDetail.showAllHolders'
                        | transloco: { count: holders().length }
                    }}
                  </button>
                }
              }
            </section>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="people.fields.owner"
                [value]="p.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="people.fields.nextReviewOn"
                [keepEmpty]="true"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="canManage() ? editLink() : null"
              >
                @if (p.next_review_on) {
                  <span [class.text-warn-ink]="p.review_due">{{
                    p.next_review_on | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item layout="inline" labelKey="people.fields.lastReviewedOn">
                @if (p.last_reviewed_on) {
                  {{ p.last_reviewed_on | localDay }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="people.positionDetail.updated"
                [value]="p.updated_at | localDate"
              />
            </app-record-meta>

            <ng-container ngProjectAs="[aside-learn]">
              <app-why-it-matters scope="people" page="positionDetail" />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="reviewing()"
            [title]="'people.positions.reviewTitle' | transloco"
            [message]="'people.positions.reviewMessage' | transloco: { title: p.title }"
            [confirmLabel]="'people.positions.markReviewed' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="primary"
            [busy]="busy()"
            [confirmDisabled]="!nextReview() || nextReview() <= today"
            initialFocus="#cf-pos-next"
            (confirmed)="markReviewed()"
            (cancelled)="reviewing.set(false)"
          >
            <div class="mt-4 flex flex-col gap-3">
              <app-people-field
                labelKey="people.fields.nextReviewOn"
                inputId="cf-pos-next"
                [required]="true"
                hintKey="people.positions.nextReviewHint"
              >
                <input
                  id="cf-pos-next"
                  type="date"
                  [min]="today"
                  [value]="nextReview()"
                  (change)="nextReview.set($any($event.target).value)"
                />
              </app-people-field>
              <app-people-field labelKey="people.positions.reviewNote" inputId="cf-pos-note">
                <textarea
                  id="cf-pos-note"
                  rows="2"
                  maxlength="2000"
                  [placeholder]="'people.positions.reviewNotePlaceholder' | transloco"
                  [value]="reviewNote()"
                  (input)="reviewNote.set($any($event.target).value)"
                ></textarea>
              </app-people-field>
            </div>
          </app-confirm-dialog>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'people.positions.deleteTitle' | transloco"
            [message]="'people.positions.deleteMessage' | transloco: { title: p.title }"
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
export class PositionDetailPage {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly lookups = inject(PeopleLookups);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly fieldLabels = POSITION_FIELD_LABELS;
  protected readonly employeeLook = employeeStatusLook;
  protected readonly countKey = countKey;
  protected readonly today = todayIso();
  /** People shown in the "Oppfølging" card before "Vis alle". */
  protected readonly holderLimit = 5;
  protected readonly allHolders = signal(false);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly position = signal<PositionDetail | null>(null);
  protected readonly holders = signal<readonly Employee[]>([]);
  protected readonly deleting = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly nextReview = signal('');
  protected readonly reviewNote = signal('');
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );

  protected readonly editLink = computed(() => ['/people/positions', this.id(), 'edit']);

  protected readonly statusLine = computed(() => {
    const p = this.position();
    return p ? positionStatusLine(p) : { key: '', tone: 'neutral' as StatusLineTone };
  });

  protected readonly screeningRequired = computed(() => {
    const p = this.position();
    return !!p && (p.screening_required ?? p.risk_level === 'high');
  });

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const p = this.position();
    if (!p || !this.canManage()) {
      return [];
    }
    return positionMissing(
      p,
      this.editLink(),
      () => this.openReview(),
      () => this.scrollToRequirements(),
    );
  });

  protected readonly shownHolders = computed(() =>
    this.allHolders() ? this.holders() : this.holders().slice(0, this.holderLimit),
  );

  private request = new Subscription();
  private holdersRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.holdersRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'people',
      entityType: 'position',
      entityId: this.id(),
      view: 'detail',
      title: this.position()?.title ?? null,
      requirements: ['hs:5.3', 'hs:7.2'],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected summarise(): void {
    this.ask.askAbout(this.language.translate('people.ask.summarisePosition'));
  }

  protected askRole(): void {
    this.ask.askAbout(
      this.language.translate('people.ask.positionRole'),
      { field: this.language.translate('people.fields.responsibilities') },
      { requirements: ['hs:5.3'] },
    );
  }

  protected documentRef(doc: DocumentRef): EntityChipRef {
    return {
      entity_type: 'document',
      entity_id: doc.id,
      title: doc.title,
      code: doc.code,
      url: doc.url,
      status: doc.status,
      module: 'documents',
    };
  }

  private scrollToRequirements(): void {
    document.getElementById('requirements')?.scrollIntoView?.({ block: 'start' });
  }

  protected openReview(): void {
    this.nextReview.set(addMonthsIso(this.today, 12));
    this.reviewNote.set('');
    this.reviewing.set(true);
  }

  protected markReviewed(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.position();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .markPositionReviewed(orgId, p.id, {
        next_review_on: this.nextReview() || null,
        note: textOrNull(this.reviewNote()),
      })
      .subscribe({
        next: (position) => {
          this.busy.set(false);
          this.reviewing.set(false);
          this.position.set(position);
          this.notifications.success('people.notices.positionReviewed', { title: p.title });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(peopleErrorKey(error));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.position();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deletePosition(orgId, p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.lookups.invalidate();
        this.notifications.success('people.notices.positionDeleted', { title: p.title });
        void this.router.navigate(['/people/positions']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.deleting.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    this.holdersRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getPosition(orgId, id).subscribe({
      next: (position) => {
        this.position.set(position);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
    this.holdersRequest = this.api
      .listEmployees(orgId, {
        position_id: id,
        status: ['onboarding', 'active', 'on_leave', 'offboarding'],
        sort: 'name',
        limit: 200,
      })
      .subscribe({
        next: (page) => this.holders.set(page.items),
        error: () => this.holders.set([]),
      });
  }
}
