import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  DeviationFilters,
  DeviationListItem,
  DeviationStatus,
  DeviationType,
  Severity,
  Source,
  Standard,
} from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STANDARD_OPTIONS,
  STATUS_OPTIONS,
  isOverdue,
  severityLabelKey,
  severityTone,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
  statusTone,
} from './deviation-enums';

const PAGE_SIZE = 25;

/** A sortable column option for the list. */
interface SortOption {
  readonly value: string;
  readonly labelKey: string;
}

/**
 * Deviations list, scoped to the currently selected org. A filterable, sortable,
 * paginated table over the org's deviations, with a New deviation action (gated
 * on `deviations:write`). Filters, the search box, sort and pagination all feed
 * the list endpoint's query params. Reloads on org switch.
 */
@Component({
  selector: 'app-deviations-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-8 pt-7 pb-12">
      <div class="mb-[18px] flex items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'deviations.title' | transloco }}
          </h1>
          <div class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'deviations.subtitle' | transloco }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/deviations/stats">
            <app-button variant="secondary">
              <app-icon name="reports" [size]="15" />
              {{ 'deviations.stats.link' | transloco }}
            </app-button>
          </a>
          <a *appHasPermission="'deviations:admin'" routerLink="/deviations/types">
            <app-button variant="secondary">
              <app-icon name="sliders" [size]="15" />
              {{ 'deviations.types.link' | transloco }}
            </app-button>
          </a>
          <a *appHasPermission="'deviations:write'" routerLink="/deviations/new">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'deviations.new' | transloco }}
            </app-button>
          </a>
        </div>
      </div>

      <div class="mb-3 flex flex-wrap items-center gap-2.5">
        <div
          class="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-bg px-3"
        >
          <span class="flex text-fg-subtle"><app-icon name="search" [size]="17" /></span>
          <input
            type="search"
            [ngModel]="query()"
            (ngModelChange)="onQueryChange($event)"
            [placeholder]="'deviations.searchPlaceholder' | transloco"
            [attr.aria-label]="'deviations.searchPlaceholder' | transloco"
            class="h-full flex-1 bg-transparent text-[13.5px] text-fg outline-none"
          />
        </div>
        <div class="cf-select">
          <select
            [ngModel]="sort()"
            (ngModelChange)="onSortChange($event)"
            [attr.aria-label]="'deviations.filters.sort' | transloco"
          >
            @for (option of sortOptions; track option.value) {
              <option [value]="option.value">{{ option.labelKey | transloco }}</option>
            }
          </select>
        </div>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <div class="cf-select">
          <select
            [ngModel]="status()"
            (ngModelChange)="onFilterChange('status', $event)"
            [attr.aria-label]="'deviations.filters.status' | transloco"
          >
            <option value="">{{ 'deviations.filters.allStatuses' | transloco }}</option>
            @for (option of statusOptions; track option) {
              <option [value]="option">{{ statusLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="typeId()"
            (ngModelChange)="onFilterChange('typeId', $event)"
            [attr.aria-label]="'deviations.filters.type' | transloco"
          >
            <option value="">{{ 'deviations.filters.allTypes' | transloco }}</option>
            @for (type of types(); track type.id) {
              <option [value]="type.id">{{ type.name }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="standard()"
            (ngModelChange)="onFilterChange('standard', $event)"
            [attr.aria-label]="'deviations.filters.standard' | transloco"
          >
            <option value="">{{ 'deviations.filters.allStandards' | transloco }}</option>
            @for (option of standardOptions; track option) {
              <option [value]="option">{{ standardLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="severity()"
            (ngModelChange)="onFilterChange('severity', $event)"
            [attr.aria-label]="'deviations.filters.severity' | transloco"
          >
            <option value="">{{ 'deviations.filters.allSeverities' | transloco }}</option>
            @for (option of severityOptions; track option) {
              <option [value]="option">{{ severityLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="source()"
            (ngModelChange)="onFilterChange('source', $event)"
            [attr.aria-label]="'deviations.filters.source' | transloco"
          >
            <option value="">{{ 'deviations.filters.allSources' | transloco }}</option>
            @for (option of sourceOptions; track option) {
              <option [value]="option">{{ sourceLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="ownerId()"
            (ngModelChange)="onFilterChange('owner', $event)"
            [attr.aria-label]="'deviations.filters.owner' | transloco"
          >
            <option value="">{{ 'deviations.filters.allOwners' | transloco }}</option>
            @for (user of users(); track user.id) {
              <option [value]="user.id">{{ user.name }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="departmentId()"
            (ngModelChange)="onFilterChange('department', $event)"
            [attr.aria-label]="'deviations.filters.department' | transloco"
          >
            <option value="">{{ 'deviations.filters.allDepartments' | transloco }}</option>
            @for (dept of departments(); track dept.id) {
              <option [value]="dept.id">{{ dept.name }}</option>
            }
          </select>
        </div>
        <input
          type="text"
          [ngModel]="tag()"
          (ngModelChange)="onTagChange($event)"
          [placeholder]="'deviations.filters.tag' | transloco"
          [attr.aria-label]="'deviations.filters.tag' | transloco"
          autocomplete="off"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <input
          type="date"
          [ngModel]="dueAfter()"
          (ngModelChange)="onFilterChange('dueAfter', $event)"
          [attr.aria-label]="'deviations.filters.dueAfter' | transloco"
          [title]="'deviations.filters.dueAfter' | transloco"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <input
          type="date"
          [ngModel]="dueBefore()"
          (ngModelChange)="onFilterChange('dueBefore', $event)"
          [attr.aria-label]="'deviations.filters.dueBefore' | transloco"
          [title]="'deviations.filters.dueBefore' | transloco"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        @if (hasActiveFilters()) {
          <button
            type="button"
            (click)="clearFilters()"
            class="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <app-icon name="x" [size]="15" />
            {{ 'deviations.filters.clear' | transloco }}
          </button>
        }
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (items().length === 0) {
          <div class="px-4 py-12 text-center">
            <p class="text-[14px] text-fg-muted">{{ 'deviations.empty' | transloco }}</p>
          </div>
        } @else {
          <ul>
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a [routerLink]="['/deviations', row.id]" class="flex items-center gap-3 px-4 py-3">
                  <span class="w-[96px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ row.title }}</span>
                    @if (row.type_name) {
                      <span class="block truncate text-[12.5px] text-fg-muted">{{
                        row.type_name
                      }}</span>
                    }
                  </span>
                  <span class="hidden flex-none gap-1 lg:flex">
                    @for (std of row.standards; track std) {
                      <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                    }
                  </span>
                  <app-badge [tone]="severityTone(row.severity)">{{
                    severityLabelKey(row.severity) | transloco
                  }}</app-badge>
                  <app-badge [tone]="statusTone(row.status)">{{
                    statusLabelKey(row.status) | transloco
                  }}</app-badge>
                  <span
                    class="hidden w-[120px] flex-none truncate text-right text-[12.5px] text-fg-subtle sm:block"
                  >
                    {{ row.owner_name ?? '' }}
                  </span>
                  <span class="w-[96px] flex-none text-right text-[12.5px]">
                    @if (row.due_at) {
                      <span
                        [class.text-fail]="overdue(row)"
                        [class.font-semibold]="overdue(row)"
                        [class.text-fg-subtle]="!overdue(row)"
                      >
                        {{ row.due_at | date: 'mediumDate' }}
                      </span>
                    } @else {
                      <span class="text-fg-subtle">—</span>
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>

      @if (!loading() && total() > pageSize) {
        <div class="mt-4 flex items-center justify-between gap-4">
          <span class="text-[13px] text-fg-subtle">
            {{
              'deviations.pagination.range'
                | transloco: { from: rangeFrom(), to: rangeTo(), total: total() }
            }}
          </span>
          <div class="flex items-center gap-2">
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="offset() === 0"
              (click)="prevPage()"
            >
              {{ 'deviations.pagination.prev' | transloco }}
            </app-button>
            <app-button
              variant="secondary"
              size="sm"
              [disabled]="rangeTo() >= total()"
              (click)="nextPage()"
            >
              {{ 'deviations.pagination.next' | transloco }}
            </app-button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationsList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly route = inject(ActivatedRoute);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly standardOptions = STANDARD_OPTIONS;
  protected readonly statusTone = statusTone;
  protected readonly severityTone = severityTone;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly sortOptions: readonly SortOption[] = [
    { value: '-raised_at', labelKey: 'deviations.sort.newest' },
    { value: 'raised_at', labelKey: 'deviations.sort.oldest' },
    { value: 'due_at', labelKey: 'deviations.sort.dueSoonest' },
    { value: '-severity', labelKey: 'deviations.sort.severity' },
    { value: 'code', labelKey: 'deviations.sort.code' },
  ];

  protected readonly query = signal('');
  protected readonly status = signal<DeviationStatus | ''>('');
  protected readonly typeId = signal('');
  protected readonly standard = signal<Standard | ''>('');
  protected readonly severity = signal<Severity | ''>('');
  protected readonly source = signal<Source | ''>('');
  protected readonly tag = signal('');
  protected readonly clause = signal('');
  protected readonly ownerId = signal('');
  protected readonly departmentId = signal('');
  protected readonly dueBefore = signal('');
  protected readonly dueAfter = signal('');
  protected readonly sort = signal('-raised_at');
  protected readonly offset = signal(0);

  protected readonly items = signal<readonly DeviationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly users = signal<readonly { id: string; name: string }[]>([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  protected readonly rangeFrom = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  protected readonly rangeTo = computed(() =>
    Math.min(this.offset() + this.items().length, this.total()),
  );

  protected readonly hasActiveFilters = computed(
    () =>
      this.query() !== '' ||
      this.status() !== '' ||
      this.typeId() !== '' ||
      this.standard() !== '' ||
      this.severity() !== '' ||
      this.source() !== '' ||
      this.tag() !== '' ||
      this.clause() !== '' ||
      this.ownerId() !== '' ||
      this.departmentId() !== '' ||
      this.dueBefore() !== '' ||
      this.dueAfter() !== '',
  );

  private readonly reload$ = new Subject<void>();

  constructor() {
    this.reload$.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => this.load());

    effect(() => {
      const orgId = this.orgId();
      this.resetFilters();
      this.applyQueryParams();
      this.items.set([]);
      this.total.set(0);
      this.types.set([]);
      this.users.set([]);
      this.departments.set([]);
      if (orgId) {
        this.loadReferences(orgId);
        this.load();
      }
    });
  }

  /** Seeds filters from drill-down query params (e.g. from the stats dashboard). */
  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    const typeId = params.get('type_id');
    const standard = params.get('standard');
    const severity = params.get('severity');
    const source = params.get('source');
    const department = params.get('department_id');
    const owner = params.get('owner_user_id');
    const clause = params.get('clause');
    const tag = params.get('tag');
    const sort = params.get('sort');
    if (status) {
      this.status.set(status as DeviationStatus);
    }
    if (typeId) {
      this.typeId.set(typeId);
    }
    if (standard) {
      this.standard.set(standard as Standard);
    }
    if (severity) {
      this.severity.set(severity as Severity);
    }
    if (source) {
      this.source.set(source as Source);
    }
    if (department) {
      this.departmentId.set(department);
    }
    if (owner) {
      this.ownerId.set(owner);
    }
    if (clause) {
      this.clause.set(clause);
    }
    if (tag) {
      this.tag.set(tag);
    }
    if (sort && this.sortOptions.some((option) => option.value === sort)) {
      this.sort.set(sort);
    }
  }

  protected overdue(row: DeviationListItem): boolean {
    return isOverdue(row.due_at, row.status);
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.offset.set(0);
    this.reload$.next();
  }

  protected onTagChange(value: string): void {
    this.tag.set(value);
    this.offset.set(0);
    this.reload$.next();
  }

  protected onSortChange(value: string): void {
    this.sort.set(value);
    this.offset.set(0);
    this.load();
  }

  protected onFilterChange(
    key:
      | 'status'
      | 'typeId'
      | 'standard'
      | 'severity'
      | 'source'
      | 'owner'
      | 'department'
      | 'dueBefore'
      | 'dueAfter',
    value: string,
  ): void {
    switch (key) {
      case 'status':
        this.status.set(value as DeviationStatus | '');
        break;
      case 'typeId':
        this.typeId.set(value);
        break;
      case 'standard':
        this.standard.set(value as Standard | '');
        break;
      case 'severity':
        this.severity.set(value as Severity | '');
        break;
      case 'source':
        this.source.set(value as Source | '');
        break;
      case 'owner':
        this.ownerId.set(value);
        break;
      case 'department':
        this.departmentId.set(value);
        break;
      case 'dueBefore':
        this.dueBefore.set(value);
        break;
      case 'dueAfter':
        this.dueAfter.set(value);
        break;
    }
    this.offset.set(0);
    this.load();
  }

  protected clearFilters(): void {
    this.resetFilters();
    this.load();
  }

  protected prevPage(): void {
    this.offset.set(Math.max(0, this.offset() - this.pageSize));
    this.load();
  }

  protected nextPage(): void {
    this.offset.set(this.offset() + this.pageSize);
    this.load();
  }

  private resetFilters(): void {
    this.query.set('');
    this.status.set('');
    this.typeId.set('');
    this.standard.set('');
    this.severity.set('');
    this.source.set('');
    this.tag.set('');
    this.clause.set('');
    this.ownerId.set('');
    this.departmentId.set('');
    this.dueBefore.set('');
    this.dueAfter.set('');
    this.sort.set('-raised_at');
    this.offset.set(0);
  }

  private load(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.api.listDeviations(orgId, this.buildFilters()).subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private buildFilters(): DeviationFilters {
    return {
      q: this.query().trim() || undefined,
      status: this.status() || undefined,
      type_id: this.typeId() || undefined,
      standard: this.standard() || undefined,
      severity: this.severity() || undefined,
      source: this.source() || undefined,
      tag: this.tag().trim() || undefined,
      clause: this.clause().trim() || undefined,
      owner_user_id: this.ownerId() || undefined,
      department_id: this.departmentId() || undefined,
      due_before: this.dueBefore() || undefined,
      due_after: this.dueAfter() || undefined,
      sort: this.sort(),
      limit: this.pageSize,
      offset: this.offset(),
    };
  }

  private loadReferences(orgId: string): void {
    this.api.listTypes(orgId).subscribe({ next: (types) => this.types.set(types) });
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) => {
        this.users.set(subjects.users.map((u) => ({ id: u.id, name: u.name })));
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name })));
      },
    });
  }
}
