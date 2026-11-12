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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, hasPerm, recordStatusTone, riskTone } from './data/people-display';
import {
  PERM_MANAGE,
  Position,
  PositionQuery,
  RECORD_STATUSES,
  RISK_LEVELS,
  RecordStatus,
  RiskLevel,
} from './data/people.models';
import { PeopleLessonLink, PeopleSectionNav } from './people-section-nav';

const PAGE_SIZE = 50;

/** Positions and roles (`/people/positions`): search, status and risk filters, paging. */
@Component({
  selector: 'app-people-positions-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    PeopleLessonLink,
    PeopleSectionNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="people.positions.title"
      scope="people"
      page="positions"
      searchPlaceholderKey="people.positions.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <app-people-section-nav />
        <p class="text-[14px] text-fg-muted">{{ 'people.positions.subtitle' | transloco }}</p>
        <app-guide-intro scope="people" page="positions" />
      </div>

      @if (canManage()) {
        <app-button toolbar size="sm" (click)="newPosition()" data-testid="new-position">
          <app-icon name="plus" [size]="14" />
          {{ 'people.positions.new' | transloco }}
        </app-button>
      }

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
      <label filters class="sr-only" for="cf-pos-risk">
        {{ 'people.filters.risk' | transloco }}
      </label>
      <select
        filters
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

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'people.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'people.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'people.positions.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="position-rows">
                @for (p of rows(); track p.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/people/positions', p.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        @if (p.code) {
                          <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                            p.code
                          }}</span>
                        }
                        <span class="truncate">{{ p.title }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (p.department?.name; as dept) {
                          <span>{{ dept }}</span>
                        }
                        <span>{{
                          'people.positions.holders' | transloco: { count: p.employee_count }
                        }}</span>
                        <span>{{
                          'people.positions.requirements'
                            | transloco: { count: p.requirement_count }
                        }}</span>
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2">
                      <app-badge [tone]="riskTone(p.risk_level)">{{
                        'people.riskLevels.' + p.risk_level | transloco
                      }}</app-badge>
                      <app-badge [tone]="statusTone(p.status)">{{
                        'people.recordStatus.' + p.status | transloco
                      }}</app-badge>
                    </span>
                  </li>
                }
              </ul>
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
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="positions" />
        <app-people-lesson-link lesson="roles-and-responsibilities" />
      </div>

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
        <app-people-lesson-link lesson="roles-and-responsibilities" />
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
  protected readonly riskTone = riskTone;
  protected readonly statusTone = recordStatusTone;

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

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'position',
      view: 'list',
      title: this.language.translate('people.positions.title'),
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

  private load(orgId: string | null, query: PositionQuery): void {
    this.request.unsubscribe();
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
