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
import { WatchButton } from '../../shared/activity/watch-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
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
import { Employee, PERM_MANAGE, PositionDetail } from './data/people.models';
import { PositionRequirements } from './position-requirements';
import { PeopleAsk } from './ui/people-ask';
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
 * A position (`/people/positions/:id`): what the role is for, its responsibilities
 * and authorities (HS 5.3), the job description document, its security risk (high
 * means a background check is required, A.6.1), the competence requirements (HS 7.2)
 * and who holds it. "Merk som gjennomgått" records the yearly review and schedules
 * the next one (it feeds the management review).
 */
@Component({
  selector: 'app-people-position-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    WatchButton,
    WhyItMatters,
    RecordDetailLayout,
    Badge,
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
    PositionRequirements,
    PeopleAsk,
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
              <span>{{
                countKey('people.positions.holders', p.employee_count)
                  | transloco: { count: p.employee_count }
              }}</span>
              @if (p.status !== 'active') {
                <app-status-badge
                  meaning="lifecycle"
                  [value]="p.status"
                  [labelKey]="'people.recordStatus.' + p.status"
                />
              }
              <app-status-badge
                meaning="severity"
                [value]="p.risk_level"
                [labelKey]="'people.riskLevels.' + p.risk_level"
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
              <ng-container ngProjectAs="[primary]">
                <app-button (click)="openReview()" data-testid="position-reviewed">
                  {{ 'people.positions.markReviewed' | transloco }}
                </app-button>
              </ng-container>
            }

            <ng-container ngProjectAs="[secondary]">
              @if (canManage()) {
                <a [routerLink]="['/people/positions', p.id, 'edit']" data-testid="position-edit">
                  <app-button variant="secondary">{{
                    'people.common.edit' | transloco
                  }}</app-button>
                </a>
              }
              <app-watch-button entityType="position" [entityId]="p.id" />
            </ng-container>

            <ng-container ngProjectAs="[overflow]">
              <button appMenuItem type="button" (click)="summarise()">
                {{ 'people.positions.summarise' | transloco }}
              </button>
              @if (canManage()) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="deleting.set(true)"
                  data-testid="position-delete"
                >
                  {{ 'people.common.delete' | transloco }}
                </button>
              }
            </ng-container>

            <app-help-strip
              help
              scope="people"
              page="positionDetail"
              lesson="roles-and-responsibilities"
            />

            <div class="flex flex-col gap-5">
              <app-card>
                <h2 class="mb-3 text-card font-bold text-fg">
                  {{ 'people.positions.about' | transloco }}
                </h2>
                @if (p.description) {
                  <p class="mb-4 text-body whitespace-pre-line text-fg">{{ p.description }}</p>
                }
                <app-field-list [columns]="2">
                  <app-field-item
                    labelKey="people.fields.department"
                    [value]="p.department?.name"
                  />
                  <app-field-item labelKey="people.fields.reportsTo" empty="none">
                    @if (p.reports_to; as r) {
                      <a
                        [routerLink]="['/people/positions', r.id]"
                        class="font-semibold text-accent hover:underline"
                        >{{ r.name }}</a
                      >
                    }
                  </app-field-item>
                  <app-field-item labelKey="people.fields.owner" [value]="p.owner?.name">
                    @if (p.owner?.name; as owner) {
                      {{ owner }}
                      <span class="block text-meta text-fg-muted">{{
                        'people.positions.ownerHint' | transloco
                      }}</span>
                    }
                  </app-field-item>
                  <app-field-item labelKey="people.fields.riskLevel">
                    {{ 'people.riskLevels.' + p.risk_level | transloco }}
                    <span class="block text-meta text-fg-muted" data-testid="position-screening">{{
                      ((p.screening_required ?? p.risk_level === 'high')
                        ? 'people.positions.screeningRequired'
                        : 'people.positions.screeningNotRequired'
                      ) | transloco
                    }}</span>
                  </app-field-item>
                  <app-field-item labelKey="people.fields.jobDescription" empty="none">
                    @if (p.job_description; as doc) {
                      <a
                        [routerLink]="doc.url"
                        class="font-semibold text-accent hover:underline"
                        data-testid="job-description"
                      >
                        @if (doc.code) {
                          <span class="font-mono text-meta">{{ doc.code }}</span>
                        }
                        {{ doc.title }}
                      </a>
                    }
                  </app-field-item>
                  <app-field-item labelKey="people.fields.nextReviewOn">
                    @if (p.next_review_on) {
                      <span
                        [class.font-semibold]="p.review_due"
                        [class.text-warn-ink]="p.review_due"
                        >{{ p.next_review_on | localDay }}</span
                      >
                      @if (p.last_reviewed_on) {
                        <span class="block text-meta text-fg-muted">{{
                          'people.positions.lastReviewed'
                            | transloco: { date: (p.last_reviewed_on | localDay) }
                        }}</span>
                      }
                    }
                  </app-field-item>
                </app-field-list>
              </app-card>

              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-card font-bold text-fg">
                    {{ 'people.fields.responsibilities' | transloco }}
                  </h2>
                  <app-people-ask
                    [prompt]="'people.ask.summarisePosition' | transloco"
                    [field]="'people.fields.responsibilities' | transloco"
                    [requirements]="['hs:5.3']"
                  />
                </div>
                <p class="text-body whitespace-pre-line text-fg">
                  {{ p.responsibilities ?? ('people.positions.noResponsibilities' | transloco) }}
                </p>
                <h2 class="mt-4 mb-2 text-card font-bold text-fg">
                  {{ 'people.fields.authorities' | transloco }}
                </h2>
                <p class="text-body whitespace-pre-line text-fg">
                  {{ p.authorities ?? ('people.positions.noAuthorities' | transloco) }}
                </p>
              </app-card>

              <app-card>
                <app-people-position-requirements
                  [position]="p"
                  [canManage]="canManage()"
                  (saved)="position.set($event)"
                />
              </app-card>

              <app-card>
                <h2 class="mb-2 text-card font-bold text-fg">
                  {{ 'people.positions.holdersTitle' | transloco }}
                </h2>
                @if (holders().length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'people.positions.noHolders' | transloco }}
                  </p>
                } @else {
                  <ul class="divide-y divide-border" data-testid="position-holders">
                    @for (e of holders(); track e.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                        <a
                          [routerLink]="['/people/employees', e.id]"
                          class="min-w-0 flex-1 font-semibold text-fg hover:underline"
                          >{{ e.full_name }}</a
                        >
                        @if (e.gap_count > 0) {
                          <app-badge tone="warn">{{
                            countKey('people.employees.gapCount', e.gap_count)
                              | transloco: { count: e.gap_count }
                          }}</app-badge>
                        }
                        @if ((e.flags ?? []).includes('screening_missing')) {
                          <app-badge tone="warn">{{
                            'people.flags.screening_missing' | transloco
                          }}</app-badge>
                        }
                        <app-status-badge
                          [meaning]="employeeLook(e.status).meaning"
                          [value]="employeeLook(e.status).value"
                          [labelKey]="'people.status.' + e.status"
                        />
                      </li>
                    }
                  </ul>
                }
              </app-card>
              <app-outputs-panel
                entityType="position"
                [entityId]="p.id"
                data-testid="position-outputs"
              />
            </div>

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
