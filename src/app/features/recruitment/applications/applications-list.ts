import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { RequirementCoverageService } from '../../../shared/requirement-links/requirement-coverage.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import { stageToneValue } from '../data/recruitment-display';
import {
  Application,
  ApplicationQuery,
  ENTITY_APPLICATION,
  MODULE_KEY,
  Requisition,
  STAGES,
  Stage,
} from '../data/recruitment.models';
import { ApplicationIndicators } from '../shared/application-indicators';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { RecruitmentRowHeader } from '../shared/recruitment-row-header';

const PAGE_SIZE = 25;
const ACTIVE: readonly Stage[] = [
  'applied',
  'screening',
  'interview',
  'assessment',
  'reference_check',
  'offer',
];

/** The "needs follow-up" filter (the overview counters link here with these). */
export const ATTENTION_FILTERS = [
  'screening_incomplete',
  'checks_open',
  'checks_overdue',
  'stalled',
] as const;
export type AttentionFilter = '' | (typeof ATTENTION_FILTERS)[number];

/** `?stage=a,b` → one stage, `active` (all active stages) or '' (any). */
export function parseStageParam(value: string | null): '' | 'active' | Stage {
  if (!value) {
    return '';
  }
  if (value === 'active') {
    return 'active';
  }
  const list = value.split(',').filter((s) => (STAGES as readonly string[]).includes(s));
  if (list.length === 1) {
    return list[0] as Stage;
  }
  return list.length > 1 ? 'active' : '';
}

/** The overview link params (`screening=incomplete`, `checks=open|overdue`, `stalled=true`). */
export function parseAttention(params: { get(name: string): string | null }): AttentionFilter {
  if (params.get('screening') === 'incomplete') {
    return 'screening_incomplete';
  }
  const checks = params.get('checks');
  if (checks === 'open' || checks === 'overdue') {
    return checks === 'open' ? 'checks_open' : 'checks_overdue';
  }
  return params.get('stalled') === 'true' ? 'stalled' : '';
}

/** The list query part of a follow-up filter. */
export function attentionQuery(filter: AttentionFilter): Partial<ApplicationQuery> {
  switch (filter) {
    case 'screening_incomplete':
      return { screening: 'incomplete' };
    case 'checks_open':
      return { checks: 'open' };
    case 'checks_overdue':
      return { checks: 'overdue' };
    case 'stalled':
      return { stalled: true };
    default:
      return {};
  }
}

/**
 * Applications across the requisitions the caller works on (team-filtered by the
 * API): stage, requisition and follow-up filters (also set by the overview links),
 * progress markers per row, and "Legg til kandidat".
 */
@Component({
  selector: 'app-applications-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    WhyItMatters,
    TeachingEmpty,
    CoverageChip,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    StatusBadge,
    ApplicationIndicators,
    RecruitmentRowHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="recruitment.applications.title"
      descriptionKey="recruitment.applications.description"
      [breadcrumbs]="breadcrumbs"
      [settingsLink]="settingsLink()"
      scope="recruitment"
      page="applications"
      searchPlaceholderKey="recruitment.applications.search"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="attention() ? 1 : 0"
      [empty]="!loading() && !errorKey() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      @if (perms().write) {
        <a
          primary
          routerLink="/recruitment/applications/new"
          [queryParams]="requisitionId() ? { requisition_id: requisitionId() } : {}"
          data-testid="app-new"
        >
          <app-button size="sm">
            <app-icon name="userplus" [size]="15" />
            {{ 'recruitment.applications.new' | transloco }}
          </app-button>
        </a>
      }
      <app-module-nav nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip help scope="recruitment" page="applications" lesson="fair-screening" />

      <ng-container filters>
        <label class="sr-only" for="app-stage">{{ 'recruitment.filters.stage' | transloco }}</label>
        <select
          id="app-stage"
          class="cf-filter"
          (change)="setStage($any($event.target).value)"
          data-testid="app-stage-filter"
        >
          <option value="" [selected]="stage() === ''">
            {{ 'recruitment.filters.allStages' | transloco }}
          </option>
          <option value="active" [selected]="stage() === 'active'">
            {{ 'recruitment.filters.activeStages' | transloco }}
          </option>
          @for (s of stages; track s) {
            <option [value]="s" [selected]="stage() === s">
              {{ 'recruitment.stage.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="app-req">{{
          'recruitment.filters.requisition' | transloco
        }}</label>
        <select
          id="app-req"
          class="cf-filter max-w-[260px]"
          (change)="setRequisition($any($event.target).value)"
          data-testid="app-req-filter"
        >
          <option value="" [selected]="!requisitionId()">
            {{ 'recruitment.filters.allRequisitions' | transloco }}
          </option>
          @for (r of requisitions(); track r.id) {
            <option [value]="r.id" [selected]="r.id === requisitionId()">
              {{ r.code }} · {{ r.title }}
            </option>
          }
        </select>
      </ng-container>
      <div more-filters>
        <label class="mb-1 block text-ui font-semibold text-fg-muted" for="app-attention">{{
          'recruitment.filters.attention' | transloco
        }}</label>
        <select
          id="app-attention"
          class="cf-filter w-full"
          (change)="setAttention($any($event.target).value)"
          data-testid="app-attention-filter"
        >
          <option value="" [selected]="attention() === ''">
            {{ 'recruitment.filters.anyAttention' | transloco }}
          </option>
          @for (a of attentionFilters; track a) {
            <option [value]="a" [selected]="attention() === a">
              {{ 'recruitment.filters.attentionValues.' + a | transloco }}
            </option>
          }
        </select>
      </div>

      @if (attention(); as a) {
        <p class="mb-3 text-ui text-fg-muted" data-testid="app-attention-active">
          {{
            'recruitment.applications.filteredBy'
              | transloco: { filter: ('recruitment.filters.attentionValues.' + a | transloco) }
          }}
          <button type="button" class="ml-1 font-semibold text-accent" (click)="setAttention('')">
            {{ 'ui.empty.clearFilters' | transloco }}
          </button>
        </p>
      }

      @if (errorKey(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (loading() && items().length === 0) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="ui.empty.noResults"
          bodyKey="ui.empty.noResultsBody"
          ctaKey="ui.empty.clearFilters"
          ctaVariant="secondary"
          (cta)="clearFilters()"
        />
      } @else {
        <app-card [padded]="false">
          <div role="list" [attr.aria-label]="'recruitment.applications.title' | transloco">
            <app-recruitment-row-header
              titleKey="recruitment.applications.candidateColumn"
              dateKey="recruitment.applications.updatedColumn"
            />
            @for (row of items(); track row.id) {
              <app-record-row
                [code]="row.code"
                [title]="row.candidate_name"
                [subtitle]="row.requisition_code + ' · ' + row.requisition_title"
                [link]="['/recruitment/applications', row.id]"
                [date]="row.updated_at"
                dateKind="updated"
              >
                <app-coverage-chip coverage [entityType]="entityType" [entityId]="row.id" />
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="stageValue(row.stage)"
                  [labelKey]="'recruitment.stage.' + row.stage"
                />
                @if (row.offer_status !== 'none') {
                  <app-status-badge
                    badges
                    meaning="lifecycle"
                    [value]="row.offer_status === 'declined' ? 'withdrawn' : 'pending'"
                    [labelKey]="'recruitment.offerStatus.' + row.offer_status"
                  />
                }
                <app-application-indicators badges class="w-full" [app]="row" />
              </app-record-row>
            }
          </div>
        </app-card>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-card empty>
        <app-teaching-empty
          scope="recruitment"
          page="applications"
          [showAction]="perms().write"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="recruitment" page="applications" />
    </app-record-list-page>
  `,
  styles: [
    `
      .cf-filter {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 12px;
        outline: none;
        max-width: 100%;
      }
      .cf-filter:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ApplicationsList {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly coverage = inject(RequirementCoverageService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav();
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly breadcrumbs = [
    RECRUITMENT_CRUMB,
    { labelKey: 'recruitment.nav.applications' },
  ];

  protected readonly entityType = ENTITY_APPLICATION;
  protected readonly stages = STAGES;
  protected readonly attentionFilters = ATTENTION_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stageValue = stageToneValue;

  protected readonly q = signal('');
  protected readonly stage = signal<'' | 'active' | Stage>(
    parseStageParam(this.params.get('stage')),
  );
  protected readonly requisitionId = signal(this.params.get('requisition_id') ?? '');
  protected readonly attention = signal<AttentionFilter>(parseAttention(this.params));
  protected readonly offset = signal(0);
  private readonly version = signal(0);

  protected readonly items = signal<readonly Application[]>([]);
  protected readonly requisitions = signal<readonly Requisition[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly filtered = computed(
    () =>
      this.q() !== '' ||
      this.stage() !== '' ||
      this.requisitionId() !== '' ||
      this.attention() !== '',
  );
  protected readonly viewFilters = computed(() => ({
    stage: this.stage(),
    requisition: this.requisitionId(),
    attention: this.attention(),
  }));

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_APPLICATION,
      view: 'list',
      title: this.language.translate('recruitment.applications.title'),
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      if (!orgId) {
        return;
      }
      const sub = this.api.listRequisitions(orgId, { limit: 200, sort: 'title' }).subscribe({
        next: (res) => this.requisitions.set(res.items),
        error: () => this.requisitions.set([]),
      });
      onCleanup(() => sub.unsubscribe());
    });
    effect((onCleanup) => {
      const orgId = this.orgId();
      this.version();
      const s = this.stage();
      const query: ApplicationQuery = {
        q: this.q(),
        stage: s === 'active' ? ACTIVE : s ? [s] : undefined,
        requisition_id: this.requisitionId() || undefined,
        ...attentionQuery(this.attention()),
        sort: '-updated_at',
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      this.errorKey.set(null);
      const sub = this.api.listApplications(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
          this.coverage
            .load(
              ENTITY_APPLICATION,
              res.items.map((a) => a.id),
            )
            .subscribe();
        },
        error: () => {
          this.loading.set(false);
          this.errorKey.set('recruitment.common.loadFailed');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected onSearch(text: string): void {
    this.q.set(text.trim());
    this.offset.set(0);
  }

  protected setStage(value: string): void {
    this.stage.set(parseStageParam(value));
    this.offset.set(0);
  }

  protected setRequisition(value: string): void {
    this.requisitionId.set(value);
    this.offset.set(0);
  }

  protected setAttention(value: string): void {
    this.attention.set(
      (ATTENTION_FILTERS as readonly string[]).includes(value) ? (value as AttentionFilter) : '',
    );
    this.offset.set(0);
  }

  protected clearFilters(): void {
    this.stage.set('');
    this.requisitionId.set('');
    this.attention.set('');
    this.q.set('');
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.setStage(view.filters['stage'] ?? '');
    this.setRequisition(view.filters['requisition'] ?? '');
    this.setAttention(view.filters['attention'] ?? '');
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected create(): void {
    void this.router.navigate(['/recruitment/applications/new']);
  }
}
