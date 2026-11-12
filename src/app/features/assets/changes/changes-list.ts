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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { levelTone, localizedLabel, stateCategoryTone } from '../data/asset-display';
import {
  CHANGE_CATEGORIES,
  CHANGE_SORTS,
  CHANGE_STATES,
  CHANGE_TYPES,
  ChangeCategory,
  ChangeListQuery,
  ChangeRequest,
  ChangeSort,
  ChangeState,
  ChangeType,
  LocalizedLabel,
  RISK_LEVELS,
  RiskLevel,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { AssetsNav } from '../shared/assets-nav';

const PAGE_SIZE = 25;

export interface ChangeFilters {
  /** A workflow state, `open` (not closed) or '' (any). */
  readonly status: ChangeState | 'open' | '';
  readonly type: ChangeType | '';
  readonly category: ChangeCategory | '';
  readonly risk: RiskLevel | '';
  readonly owner: 'me' | '';
  readonly sort: ChangeSort;
}

export const DEFAULT_CHANGE_FILTERS: ChangeFilters = {
  status: 'open',
  type: '',
  category: '',
  risk: '',
  owner: '',
  sort: '-updated_at',
};

export function changeFiltersFromView(values: Readonly<Record<string, string>>): ChangeFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  return {
    status: values['status'] === 'open' ? 'open' : pick(values['status'], CHANGE_STATES),
    type: pick(values['type'], CHANGE_TYPES),
    category: pick(values['category'], CHANGE_CATEGORIES),
    risk: pick(values['risk'], RISK_LEVELS),
    owner: values['owner'] === 'me' ? 'me' : '',
    sort: pick(values['sort'], CHANGE_SORTS) || '-updated_at',
  };
}

export function changeQuery(q: string, f: ChangeFilters, offset: number): ChangeListQuery {
  return {
    q: q || undefined,
    open: f.status === 'open' ? true : undefined,
    status: f.status && f.status !== 'open' ? [f.status] : undefined,
    type: f.type || undefined,
    category: f.category ? [f.category] : undefined,
    risk_level: f.risk ? [f.risk] : undefined,
    owner: f.owner || undefined,
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * Change requests (`/assets/changes`): planned changes to systems, processes,
 * products or the organisation, each going through request, impact and risk
 * assessment, approval, implementation and review (ISO 27001 A.8.32, ISO 9001 6.3).
 */
@Component({
  selector: 'app-changes-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AssetsNav,
    Badge,
    Button,
    Card,
    GuideIntro,
    Icon,
    LessonView,
    Pager,
    RecordListPage,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="assets.changes.title"
      scope="assets"
      page="changes"
      searchPlaceholderKey="assets.changes.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'assets.changes.subtitle' | transloco }}</p>
        <app-assets-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="assets" tour="changes" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'assets.ai.changesOverview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="assets-change-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.changes.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="assets-change-filters">
          <label class="sr-only" for="chg-f-status">{{ 'assets.fields.status' | transloco }}</label>
          <select
            id="chg-f-status"
            [class]="selectClass"
            (change)="setFilter('status', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().status">
              {{ 'assets.filters.anyStatus' | transloco }}
            </option>
            <option value="open" [selected]="filters().status === 'open'">
              {{ 'assets.changes.openOnly' | transloco }}
            </option>
            @for (s of states; track s) {
              <option [value]="s" [selected]="filters().status === s">
                {{ 'assets.changeState.' + s | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="chg-f-type">{{
            'assets.fields.changeType' | transloco
          }}</label>
          <select
            id="chg-f-type"
            [class]="selectClass"
            (change)="setFilter('type', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().type">
              {{ 'assets.filters.anyChangeType' | transloco }}
            </option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="filters().type === t">
                {{ 'assets.changeType.' + t | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="chg-f-cat">{{
            'assets.fields.changeCategory' | transloco
          }}</label>
          <select
            id="chg-f-cat"
            [class]="selectClass"
            (change)="setFilter('category', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().category">
              {{ 'assets.filters.anyCategory' | transloco }}
            </option>
            @for (c of categories; track c) {
              <option [value]="c" [selected]="filters().category === c">
                {{ 'assets.changeCategory.' + c | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="chg-f-risk">{{
            'assets.fields.riskLevel' | transloco
          }}</label>
          <select
            id="chg-f-risk"
            [class]="selectClass"
            (change)="setFilter('risk', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().risk">
              {{ 'assets.filters.anyRisk' | transloco }}
            </option>
            @for (r of risks; track r) {
              <option [value]="r" [selected]="filters().risk === r">
                {{ 'assets.criticality.' + r | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="chg-f-owner">{{ 'assets.fields.owner' | transloco }}</label>
          <select
            id="chg-f-owner"
            [class]="selectClass"
            (change)="setFilter('owner', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().owner">
              {{ 'assets.filters.anyOwner' | transloco }}
            </option>
            <option value="me" [selected]="filters().owner === 'me'">
              {{ 'assets.filters.ownedByMe' | transloco }}
            </option>
          </select>
          <label class="sr-only" for="chg-f-sort">{{ 'assets.filters.sort' | transloco }}</label>
          <select
            id="chg-f-sort"
            [class]="selectClass"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'assets.filters.changeSorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="assets" page="changes" />
        <div><app-lesson scope="assets" lesson="change-management" /></div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'assets.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'assets.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'assets.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="change-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/assets/changes', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.title }}</span>
                      </a>
                      <span class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                        <span>{{ 'assets.changeCategory.' + row.category | transloco }}</span>
                        @if (row.owner?.name; as name) {
                          <span>{{ 'assets.list.ownedBy' | transloco: { name } }}</span>
                        }
                        @if (row.planned_start) {
                          <span>
                            {{
                              'assets.changes.plannedFor'
                                | transloco: { date: (row.planned_start | localDay) }
                            }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px]">
                      @if (row.change_type !== 'normal') {
                        <app-badge [tone]="row.change_type === 'emergency' ? 'fail' : 'neutral'">
                          {{ 'assets.changeType.' + row.change_type | transloco }}
                        </app-badge>
                      }
                      @if (row.risk_level) {
                        <app-badge [tone]="riskTone(row.risk_level)">
                          {{
                            'assets.changes.riskBadge'
                              | transloco
                                : { level: ('assets.criticality.' + row.risk_level | transloco) }
                          }}
                        </app-badge>
                      }
                      @if (row.pending_approval) {
                        <app-badge tone="accent">{{
                          'assets.changes.awaitingApproval' | transloco
                        }}</app-badge>
                      }
                      <app-badge [tone]="catTone(row.status_category)">{{
                        label(row.status_label)
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

      <div class="mt-6"><app-why-it-matters scope="assets" page="changes" /></div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="assets" page="changes" />
        <app-teaching-empty
          scope="assets"
          page="changes"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="assets" page="changes" />
      </div>
    </app-record-list-page>
  `,
})
export class ChangesList {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly selectClass =
    'h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg';
  protected readonly states = CHANGE_STATES;
  protected readonly types = CHANGE_TYPES;
  protected readonly categories = CHANGE_CATEGORIES;
  protected readonly risks = RISK_LEVELS;
  protected readonly sorts = CHANGE_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly riskTone = levelTone;
  protected readonly catTone = stateCategoryTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('assets:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<ChangeFilters>(DEFAULT_CHANGE_FILTERS);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly ChangeRequest[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return (
      !!this.q() ||
      !!f.type ||
      !!f.category ||
      !!f.risk ||
      !!f.owner ||
      (!!f.status && f.status !== 'open')
    );
  });
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'assets',
      entityType: 'change_request',
      view: 'list',
      title: this.language.translate('assets.changes.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = changeQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  protected label(value: LocalizedLabel): string {
    return localizedLabel(value, this.language.active());
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof ChangeFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => changeFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(changeFiltersFromView(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/assets/changes/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.changesOverview'));
  }

  private load(orgId: string | null, query: ChangeListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listChanges(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
