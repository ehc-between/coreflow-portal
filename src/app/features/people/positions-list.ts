import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, countKey, hasPerm } from './data/people-display';
import {
  PERM_MANAGE,
  Position,
  PositionQuery,
  RECORD_STATUSES,
  RISK_LEVELS,
  RecordStatus,
  RiskLevel,
} from './data/people.models';
import { OrgChart } from './ui/org-chart';
import { PEOPLE_NAV, PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

const PAGE_SIZE = 50;

/**
 * Positions (`/people/positions`): what each role is responsible for, its security
 * risk (high requires a background check), its competence requirements and when it
 * is next reviewed; as a list or as an organisation chart built from "reports to".
 */
@Component({
  selector: 'app-people-positions-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    OrgChart,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="people.positions.title"
      descriptionKey="people.positions.subtitle"
      [breadcrumbs]="[root, { labelKey: 'people.positions.title' }]"
      [settingsLink]="settingsLink"
      scope="people"
      page="positions"
      searchPlaceholderKey="people.positions.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [moreFiltersActive]="risk() ? 1 : 0"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      @if (canManage()) {
        <app-button primary (click)="newPosition()" data-testid="new-position">
          <app-icon name="plus" [size]="15" />
          {{ 'people.positions.new' | transloco }}
        </app-button>
      }

      <app-module-nav nav [items]="nav" labelKey="people.sections.label" />
      <app-help-strip help scope="people" page="positions" lesson="roles-and-responsibilities" />

      <div
        filters
        class="inline-flex rounded-tile border border-border bg-bg p-0.5"
        role="group"
        [attr.aria-label]="'people.orgChart.viewLabel' | transloco"
      >
        @for (v of views; track v) {
          <button
            type="button"
            class="h-9 rounded-lg px-3 text-ui font-semibold"
            [class]="view() === v ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'"
            [attr.aria-pressed]="view() === v"
            (click)="view.set(v)"
            [attr.data-testid]="'positions-view-' + v"
          >
            {{ 'people.orgChart.views.' + v | transloco }}
          </button>
        }
      </div>
      <label filters class="sr-only" for="cf-pos-status">
        {{ 'people.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-pos-status"
        [class]="selectClass"
        (change)="setStatus($any($event.target).value)"
        data-testid="filter-status"
      >
        <option value="" [selected]="!status()">
          {{ 'people.filters.statusOptions.all' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'people.recordStatus.' + s | transloco }}
          </option>
        }
      </select>
      <div more-filters class="flex flex-col gap-1">
        <label for="cf-pos-risk" class="text-meta font-semibold text-fg-muted">
          {{ 'people.filters.risk' | transloco }}
        </label>
        <select
          id="cf-pos-risk"
          [class]="selectClass"
          (change)="setRisk($any($event.target).value)"
        >
          <option value="" [selected]="!risk()">{{ 'people.filters.anyRisk' | transloco }}</option>
          @for (r of risks; track r) {
            <option [value]="r" [selected]="risk() === r">
              {{ 'people.riskLevels.' + r | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @if (view() === 'chart') {
          <app-people-org-chart />
        } @else {
          @switch (state()) {
            @case ('loading') {
              <app-loading-state [rows]="5" />
            }
            @case ('error') {
              <app-error-state (retry)="reload()" />
            }
            @default {
              @if (rows().length === 0) {
                <p class="px-4 py-10 text-center text-body text-fg-muted" data-testid="no-match">
                  {{ 'people.positions.noMatch' | transloco }}
                </p>
              } @else {
                <div role="list" data-testid="position-rows">
                  <app-record-row-header titleKey="people.fields.positionTitle" dateKind="next" />
                  @for (p of rows(); track p.id) {
                    <app-record-row
                      [code]="p.code"
                      [title]="p.title"
                      [subtitle]="subtitle(p)"
                      [link]="['/people/positions', p.id]"
                      [owner]="p.owner?.name"
                      [date]="p.next_review_on"
                      dateKind="next"
                      [overdue]="!!p.review_due"
                    >
                      <app-coverage-chip coverage entityType="position" [entityId]="p.id" />
                      <ng-container ngProjectAs="[badges]">
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
                      </ng-container>
                    </app-record-row>
                  }
                </div>
                <div class="border-t border-border px-4 py-2.5">
                  <app-pager
                    [offset]="offset()"
                    [pageSize]="pageSize"
                    [count]="rows().length"
                    [total]="total()"
                    (pageChange)="offset.set($event)"
                  />
                </div>
              }
            }
          }
        }
      </app-card>

      <app-why-it-matters below scope="people" page="positions" />

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="people"
            page="positions"
            [showAction]="canManage()"
            (action)="newPosition()"
          />
        </app-card>
        <app-why-it-matters scope="people" page="positions" />
      </div>
    </app-record-list-page>
  `,
})
export class PositionsList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly risks = RISK_LEVELS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly countKey = countKey;
  protected readonly nav = PEOPLE_NAV;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly views = ['list', 'chart'] as const;
  protected readonly view = signal<'list' | 'chart'>('list');

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );

  protected readonly q = signal('');
  protected readonly status = signal<RecordStatus | ''>('active');
  protected readonly risk = signal<RiskLevel | ''>('');
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Position[]>([]);
  protected readonly total = signal(0);

  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.q() &&
      this.status() === 'active' &&
      !this.risk(),
  );
  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    risk: this.risk(),
  }));

  private lastQuery: PositionQuery = {};
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'position',
      view: 'list',
      title: this.language.translate('people.positions.title'),
      requirements: ['hs:5.3'],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: PositionQuery = {
        q: this.q() || undefined,
        status: this.status() || undefined,
        risk_level: this.risk() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (RECORD_STATUSES as readonly string[]).includes(value) ? (value as RecordStatus) : '',
    );
  }

  protected setRisk(value: string): void {
    this.offset.set(0);
    this.risk.set((RISK_LEVELS as readonly string[]).includes(value) ? (value as RiskLevel) : '');
  }

  protected applyView(view: SavedView): void {
    this.setStatus(view.filters['status'] ?? 'active');
    this.setRisk(view.filters['risk'] ?? '');
  }

  protected newPosition(): void {
    void this.router.navigate(['/people/positions/new']);
  }

  protected subtitle(p: Position): string {
    const parts: string[] = [];
    if (p.department?.name) {
      parts.push(p.department.name);
    }
    parts.push(
      this.language.translate(countKey('people.positions.holders', p.employee_count), {
        count: p.employee_count,
      }),
    );
    parts.push(
      this.language.translate(countKey('people.positions.requirements', p.requirement_count), {
        count: p.requirement_count,
      }),
    );
    return parts.join(' · ');
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.lastQuery);
  }

  private load(orgId: string | null, query: PositionQuery): void {
    this.request.unsubscribe();
    this.lastQuery = query;
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listPositions(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
