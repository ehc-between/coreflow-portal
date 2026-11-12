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
import { AskPanelService } from '../ask/ask-panel.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../shared/ui/pager/pager';
import {
  calibrationTone,
  classificationTone,
  levelTone,
  lifecycleTone,
} from './data/asset-display';
import {
  ASSET_SORTS,
  ASSET_TYPES,
  Asset,
  AssetListQuery,
  AssetSort,
  AssetType,
  CLASSIFICATIONS,
  Classification,
  LIFECYCLE_STATUSES,
  LifecycleStatus,
} from './data/asset.models';
import { AssetsApi } from './data/assets-api';
import { AssetsNav } from './shared/assets-nav';

const PAGE_SIZE = 25;

export const ASSET_FLAGS = ['requires_calibration', 'contains_personal_data'] as const;
export type AssetFlag = (typeof ASSET_FLAGS)[number];

/** The list filters kept in a saved view (all strings; '' = any). */
export interface AssetFilters {
  readonly type: AssetType | '';
  readonly classification: Classification | '';
  readonly lifecycle: LifecycleStatus | '';
  readonly flag: AssetFlag | '';
  readonly owner: 'me' | '';
  readonly sort: AssetSort;
}

export const DEFAULT_ASSET_FILTERS: AssetFilters = {
  type: '',
  classification: '',
  lifecycle: '',
  flag: '',
  owner: '',
  sort: 'code',
};

/** Restore filters from a saved view, ignoring unknown values. */
export function assetFiltersFromView(values: Readonly<Record<string, string>>): AssetFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
  return {
    type: pick(values['type'], ASSET_TYPES),
    classification: pick(values['classification'], CLASSIFICATIONS),
    lifecycle: pick(values['lifecycle'], LIFECYCLE_STATUSES),
    flag: pick(values['flag'], ASSET_FLAGS),
    owner: values['owner'] === 'me' ? 'me' : '',
    sort: pick(values['sort'], ASSET_SORTS) || 'code',
  };
}

/** The API query for a search text, filters and page offset. */
export function assetQuery(q: string, f: AssetFilters, offset: number): AssetListQuery {
  return {
    q: q || undefined,
    type: f.type ? [f.type] : undefined,
    classification: f.classification ? [f.classification] : undefined,
    lifecycle: f.lifecycle ? [f.lifecycle] : undefined,
    owner: f.owner || undefined,
    ...(f.flag ? { [f.flag]: true } : {}),
    sort: f.sort,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * The asset inventory (`/assets`): search, filters on type, classification,
 * lifecycle, calibration / personal-data flags and owner, saved views, sorting and
 * paging. Each row shows the classification, criticality, lifecycle and, for
 * measuring equipment, the calibration status.
 */
@Component({
  selector: 'app-assets-list',
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
    KpiTile,
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
      titleKey="assets.list.title"
      scope="assets"
      searchPlaceholderKey="assets.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'assets.list.subtitle' | transloco }}</p>
        <app-assets-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="assets" tour="list" />
        <app-button variant="ghost" size="sm" (click)="askOverview()">
          <app-icon name="spark" [size]="14" />
          {{ 'assets.ai.overview' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="assets-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.list.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="assets-filters">
          <label class="sr-only" for="ast-f-type">{{
            'assets.fields.assetType' | transloco
          }}</label>
          <select
            id="ast-f-type"
            [class]="selectClass"
            (change)="setFilter('type', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().type">
              {{ 'assets.filters.anyType' | transloco }}
            </option>
            @for (t of types; track t) {
              <option [value]="t" [selected]="filters().type === t">
                {{ 'assets.assetType.' + t | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ast-f-class">
            {{ 'assets.fields.classification' | transloco }}
          </label>
          <select
            id="ast-f-class"
            [class]="selectClass"
            (change)="setFilter('classification', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().classification">
              {{ 'assets.filters.anyClassification' | transloco }}
            </option>
            @for (c of classifications; track c) {
              <option [value]="c" [selected]="filters().classification === c">
                {{ 'assets.classification.' + c | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ast-f-life">{{
            'assets.fields.lifecycle' | transloco
          }}</label>
          <select
            id="ast-f-life"
            [class]="selectClass"
            (change)="setFilter('lifecycle', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().lifecycle">
              {{ 'assets.filters.anyLifecycle' | transloco }}
            </option>
            @for (l of lifecycles; track l) {
              <option [value]="l" [selected]="filters().lifecycle === l">
                {{ 'assets.lifecycle.' + l | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ast-f-flag">{{ 'assets.filters.flag' | transloco }}</label>
          <select
            id="ast-f-flag"
            [class]="selectClass"
            (change)="setFilter('flag', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().flag">
              {{ 'assets.filters.anyFlag' | transloco }}
            </option>
            @for (f of flags; track f) {
              <option [value]="f" [selected]="filters().flag === f">
                {{ 'assets.filters.flags.' + f | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ast-f-owner">{{ 'assets.fields.owner' | transloco }}</label>
          <select
            id="ast-f-owner"
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
          <label class="sr-only" for="ast-f-sort">{{ 'assets.filters.sort' | transloco }}</label>
          <select
            id="ast-f-sort"
            [class]="selectClass"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="filters().sort === s">
                {{ 'assets.filters.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="assets" page="list" />
        <div><app-lesson scope="assets" lesson="asset-inventory" /></div>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3" appTourStep="assets-summary">
        <app-kpi-tile [label]="'assets.summary.total' | transloco" [value]="total()" />
        <a routerLink="/assets/calibration" class="block rounded-tile focus-visible:outline-2">
          <app-kpi-tile
            [label]="'assets.summary.calibrationOverdue' | transloco"
            [value]="calibrationOverdue()"
            [tone]="calibrationOverdue() ? 'fail' : 'neutral'"
          />
        </a>
        <a routerLink="/assets/calibration" class="block rounded-tile focus-visible:outline-2">
          <app-kpi-tile
            [label]="'assets.summary.calibrationDueSoon' | transloco"
            [value]="calibrationDueSoon()"
            [tone]="calibrationDueSoon() ? 'warn' : 'neutral'"
          />
        </a>
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
              <ul class="divide-y divide-border" data-testid="asset-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/assets', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.name }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ 'assets.assetType.' + row.asset_type | transloco }}</span>
                        @if (row.location) {
                          <span>{{ row.location }}</span>
                        }
                        @if (row.owner?.name; as owner) {
                          <span>{{ 'assets.list.ownedBy' | transloco: { name: owner } }}</span>
                        }
                        @if (row.contains_personal_data) {
                          <span
                            class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted"
                          >
                            {{ 'assets.list.personalData' | transloco }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="classTone(row.classification)">
                        {{ 'assets.classification.' + row.classification | transloco }}
                      </app-badge>
                      @if (row.criticality) {
                        <app-badge [tone]="critTone(row.criticality)">
                          {{ 'assets.criticality.' + row.criticality | transloco }}
                        </app-badge>
                      }
                      <app-badge [tone]="lifeTone(row.lifecycle_status)">
                        {{ 'assets.lifecycle.' + row.lifecycle_status | transloco }}
                      </app-badge>
                      @if (row.requires_calibration && row.calibration_status) {
                        <app-badge [tone]="calTone(row.calibration_status)">
                          @if (row.next_calibration_due) {
                            {{
                              'assets.list.calibrationDue'
                                | transloco
                                  : {
                                      status:
                                        ('assets.calibrationStatus.' + row.calibration_status
                                        | transloco),
                                      date: (row.next_calibration_due | localDay),
                                    }
                            }}
                          } @else {
                            {{ 'assets.calibrationStatus.' + row.calibration_status | transloco }}
                          }
                        </app-badge>
                      }
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

      <div class="mt-6">
        <app-why-it-matters scope="assets" page="list" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="assets" page="list" />
        <app-teaching-empty
          scope="assets"
          page="list"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="assets" page="list" />
      </div>
    </app-record-list-page>
  `,
})
export class AssetsList {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly selectClass =
    'h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg';
  protected readonly types = ASSET_TYPES;
  protected readonly classifications = CLASSIFICATIONS;
  protected readonly lifecycles = LIFECYCLE_STATUSES;
  protected readonly flags = ASSET_FLAGS;
  protected readonly sorts = ASSET_SORTS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly classTone = classificationTone;
  protected readonly critTone = levelTone;
  protected readonly lifeTone = lifecycleTone;
  protected readonly calTone = calibrationTone;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('assets:write'));

  protected readonly q = signal('');
  protected readonly filters = signal<AssetFilters>(DEFAULT_ASSET_FILTERS);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Asset[]>([]);
  protected readonly total = signal(0);
  private readonly due = signal<readonly Asset[]>([]);
  protected readonly calibrationOverdue = computed(
    () => this.due().filter((a) => a.calibration_status === 'overdue').length,
  );
  protected readonly calibrationDueSoon = computed(
    () => this.due().filter((a) => a.calibration_status === 'due_soon').length,
  );

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(() => {
    const f = this.filters();
    return !!this.q() || Object.entries(f).some(([k, v]) => k !== 'sort' && !!v);
  });
  /** The teaching empty state: only for an org with no assets at all. */
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();
  private dueRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.dueRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'assets',
      entityType: 'asset',
      view: 'list',
      title: this.language.translate('assets.list.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = assetQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.loadDue(orgId));
    });
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof AssetFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => assetFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(assetFiltersFromView(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/assets/new']);
  }

  protected askOverview(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.overview'));
  }

  private load(orgId: string | null, query: AssetListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private loadDue(orgId: string | null): void {
    this.dueRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.dueRequest = this.api.calibrationsDue(orgId, 30).subscribe({
      next: (res) => this.due.set(res.items),
      error: () => this.due.set([]),
    });
  }
}
