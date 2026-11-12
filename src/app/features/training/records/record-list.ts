import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage as KitListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, TrainingAccess, recordValidityTone } from '../data/training-display';
import { RecordQuery, RecordSort, TrainingRecord } from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { TrainingNav } from '../training-nav';
import { RecordForm } from './record-form';

const PAGE_SIZE = 50;
const SORTS: readonly RecordSort[] = ['-completed_at', 'completed_at', 'expires_at'];
export const VALIDITY_FILTERS = ['', 'valid', 'expiring', 'expired', 'failed'] as const;
export type ValidityFilter = (typeof VALIDITY_FILTERS)[number];

/** API filters for a validity filter value. */
export function validityQuery(filter: ValidityFilter): Partial<RecordQuery> {
  switch (filter) {
    case 'valid':
      return { passed: true, expired: false };
    case 'expiring':
      return { passed: true, expiring_within_days: 30 };
    case 'expired':
      return { expired: true };
    case 'failed':
      return { passed: false };
    default:
      return {};
  }
}

export function matchesRecord(r: TrainingRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    r.course.title.toLowerCase().includes(needle) ||
    r.course.code.toLowerCase().includes(needle) ||
    r.user.name.toLowerCase().includes(needle) ||
    (r.certificate_no ?? '').toLowerCase().includes(needle)
  );
}

/**
 * `/training/records`: completion records and certificates (the evidence of
 * competence). Training managers record external or classroom training.
 */
@Component({
  selector: 'app-record-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Icon,
    Pager,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    KitListPage,
    FilterSelect,
    RecordForm,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <app-record-list-page
      titleKey="training.records.title"
      scope="training"
      page="records"
      searchPlaceholderKey="training.records.search"
      [query]="q()"
      [filters]="filters()"
      [empty]="loaded() && items().length === 0 && !hasFilters()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="training" page="records" />
        <app-why-it-matters scope="training" page="records" />
      </div>
      @if (access.canManage()) {
        <app-button toolbar (click)="formOpen.set(true)" data-testid="record-new">
          <app-icon name="plus" [size]="15" />
          {{ 'training.records.new' | transloco }}
        </app-button>
      }

      @if (access.canOversee()) {
        <app-training-filter
          filters
          [label]="'training.filters.scope' | transloco"
          [value]="scope()"
          [options]="scopeOptions()"
          (valueChange)="setScope($event)"
        />
      }
      <app-training-filter
        filters
        [label]="'training.filters.validity' | transloco"
        [value]="validity()"
        [options]="validityOptions()"
        testId="filter-validity"
        (valueChange)="setValidity($event)"
      />
      <app-training-filter
        filters
        [label]="'training.filters.sort' | transloco"
        [value]="sort()"
        [options]="sortOptions()"
        (valueChange)="setSort($event)"
      />

      @if (failed()) {
        <p class="text-[13.5px] text-fail" role="alert">
          {{ 'training.errors.loadFailed' | transloco }}
        </p>
      } @else if (loaded() && visible().length === 0) {
        <p class="py-8 text-center text-[13.5px] text-fg-muted">
          {{ 'training.records.noMatch' | transloco }}
        </p>
      } @else {
        <div class="overflow-x-auto rounded-card border border-border bg-surface">
          <table class="w-full min-w-[720px] text-left text-[13px]" data-testid="record-table">
            <caption class="sr-only">
              {{
                'training.records.title' | transloco
              }}
            </caption>
            <thead class="border-b border-border text-[12px] text-fg-muted">
              <tr>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.course' | transloco }}
                </th>
                @if (scope() === 'all') {
                  <th scope="col" class="px-4 py-2.5 font-semibold">
                    {{ 'training.fields.person' | transloco }}
                  </th>
                }
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.completed' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.method' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.validity' | transloco }}
                </th>
                <th scope="col" class="px-4 py-2.5 font-semibold">
                  {{ 'training.fields.certificate' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (r of visible(); track r.id) {
                <tr class="border-b border-border last:border-0 hover:bg-surface-2">
                  <td class="px-4 py-2.5">
                    <a
                      [routerLink]="['/training/records', r.id]"
                      class="font-semibold text-fg hover:text-accent"
                    >
                      <span class="font-mono text-[12px] text-fg-muted">{{ r.course.code }}</span>
                      {{ r.course.title }}
                    </a>
                  </td>
                  @if (scope() === 'all') {
                    <td class="px-4 py-2.5">{{ r.user.name }}</td>
                  }
                  <td class="px-4 py-2.5 text-fg-muted">{{ r.completed_at | localDay }}</td>
                  <td class="px-4 py-2.5 text-fg-muted">
                    {{ 'training.method.' + r.method | transloco }}
                  </td>
                  <td class="px-4 py-2.5">
                    <app-badge [tone]="tone(r)">
                      @if (!r.passed) {
                        {{ 'training.records.notPassed' | transloco }}
                      } @else if (r.expired) {
                        {{ 'training.records.expired' | transloco }}
                      } @else if (r.expires_at) {
                        {{
                          'training.records.until' | transloco: { date: (r.expires_at | localDay) }
                        }}
                      } @else {
                        {{ 'training.records.noExpiry' | transloco }}
                      }
                    </app-badge>
                  </td>
                  <td class="px-4 py-2.5 font-mono text-[12px] text-fg-muted">
                    {{ r.certificate_no ?? '' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pager
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-teaching-empty
        empty
        scope="training"
        page="records"
        (action)="router.navigate(['/training'])"
      />
    </app-record-list-page>

    <app-training-record-form
      [open]="formOpen()"
      (closed)="formOpen.set(false)"
      (created)="onCreated($event)"
    />
  `,
})
export class RecordListPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(TrainingAccess);
  protected readonly router = inject(Router);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly scope = linkedSignal<'mine' | 'all'>(() =>
    this.access.canOversee() ? 'all' : 'mine',
  );
  protected readonly validity = signal<ValidityFilter>('');
  protected readonly sort = signal<RecordSort>('-completed_at');
  protected readonly q = signal('');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly TrainingRecord[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly formOpen = signal(false);

  protected readonly visible = computed(() =>
    this.items().filter((r) => matchesRecord(r, this.q())),
  );
  protected readonly filters = computed(() => ({
    scope: this.scope(),
    validity: this.validity(),
    sort: this.sort(),
  }));
  protected readonly hasFilters = computed(() => !!this.q() || !!this.validity());

  protected readonly scopeOptions = computed<FilterOption[]>(() => [
    { value: 'mine', label: this.language.translate('training.filters.mine') },
    { value: 'all', label: this.language.translate('training.filters.everyone') },
  ]);
  protected readonly validityOptions = computed<FilterOption[]>(() =>
    VALIDITY_FILTERS.map((v) => ({
      value: v,
      label: this.language.translate(`training.validity.${v || 'all'}`),
    })),
  );
  protected readonly sortOptions = computed<FilterOption[]>(() =>
    SORTS.map((s) => ({ value: s, label: this.language.translate(`training.sort.${s}`) })),
  );

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_record',
      view: 'list',
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: RecordQuery = {
        ...validityQuery(this.validity()),
        mine: this.scope() === 'mine',
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.listRecords(orgId, query).subscribe({
          next: (res) => {
            this.items.set(res.items);
            this.total.set(res.total);
            this.loaded.set(true);
          },
          error: () => {
            this.failed.set(true);
            this.loaded.set(true);
          },
        });
      });
    });
  }

  protected tone(r: TrainingRecord) {
    return recordValidityTone(r);
  }

  protected setScope(value: string): void {
    this.scope.set(value === 'all' ? 'all' : 'mine');
    this.offset.set(0);
  }

  protected setValidity(value: string): void {
    this.validity.set(
      (VALIDITY_FILTERS as readonly string[]).includes(value) ? (value as ValidityFilter) : '',
    );
    this.offset.set(0);
  }

  protected setSort(value: string): void {
    this.sort.set(
      (SORTS as readonly string[]).includes(value) ? (value as RecordSort) : '-completed_at',
    );
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    if (view.filters['scope']) {
      this.setScope(view.filters['scope']);
    }
    this.setValidity(view.filters['validity'] ?? '');
    this.setSort(view.filters['sort'] ?? '-completed_at');
  }

  protected onCreated(record: TrainingRecord): void {
    this.formOpen.set(false);
    void this.router.navigate(['/training/records', record.id]);
  }
}
