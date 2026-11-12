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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { formatLocalDay } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { PrivacyApi } from './data/privacy-api';
import { PRIVACY_SORTS, PrivacyListQuery, PrivacyRecord } from './data/privacy.models';
import { RowFact, rowFacts, statusKey, statusTone } from './data/privacy-display';
import { PrivacyRefsService } from './data/privacy-refs.service';
import { REGISTERS, RegisterKey } from './data/privacy-registers';
import { PrivacyLessonLink, PrivacyNav, privacyPermissions } from './privacy-nav';

const PAGE_SIZE = 25;

/** The lesson offered on each register page. */
export const REGISTER_LESSONS: Readonly<Record<RegisterKey, string>> = {
  ropa: 'gdpr-principles',
  dpia: 'when-dpia',
  dsr: 'data-subject-rights',
  breach: 'breach-72-hours',
  processor: 'processors-and-transfers',
  transfer: 'processors-and-transfers',
  retention: 'gdpr-principles',
  consent: 'lawful-basis',
  lba: 'lawful-basis',
};

/** `open` = every status that is not closed; `all` = no status filter. */
export function statusesFor(register: RegisterKey, filter: string): readonly string[] {
  const def = REGISTERS[register];
  if (filter === 'open') {
    return def.statuses.filter((s) => !def.closedStatuses.includes(s));
  }
  return def.statuses.includes(filter) ? [filter] : [];
}

/**
 * A privacy register list (`/privacy/<segment>`), driven by the register
 * descriptor: search, status / owner / overdue / register-specific filters,
 * sorting, saved views, paging and the register's deadlines on each row.
 */
@Component({
  selector: 'app-privacy-register-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    PrivacyNav,
    PrivacyLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      [titleKey]="'privacy.registers.' + def().key + '.plural'"
      scope="privacy"
      [page]="def().key"
      searchPlaceholderKey="privacy.list.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <app-privacy-nav [active]="def().key" />
        <p class="text-[14px] text-fg-muted">
          {{ 'privacy.registers.' + def().key + '.description' | transloco }}
        </p>
        <app-guide-intro scope="privacy" [page]="def().key" />
      </div>

      @if (canWrite()) {
        <app-button
          toolbar
          size="sm"
          (click)="create()"
          appTourStep="privacy-new"
          data-testid="privacy-new"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'privacy.registers.' + def().key + '.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" [for]="id('status')">
        {{ 'privacy.list.status' | transloco }}
      </label>
      <select
        filters
        [id]="id('status')"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setStatus($any($event.target).value)"
        data-testid="filter-status"
      >
        <option value="open" [selected]="status() === 'open'">
          {{ 'privacy.list.statusOpen' | transloco }}
        </option>
        <option value="all" [selected]="status() === 'all'">
          {{ 'privacy.list.statusAll' | transloco }}
        </option>
        @for (s of def().statuses; track s) {
          <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
        }
      </select>

      @for (f of def().filters; track f.param) {
        <ng-container filters>
          <label class="sr-only" [for]="id(f.param)">
            {{ 'privacy.fields.' + f.param | transloco }}
          </label>
          <select
            [id]="id(f.param)"
            class="h-10 max-w-[220px] rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setExtra(f.param, $any($event.target).value)"
            [attr.data-testid]="'filter-' + f.param"
          >
            <option value="" [selected]="!extra()[f.param]">
              {{
                'privacy.list.anyValue'
                  | transloco: { field: ('privacy.fields.' + f.param | transloco) }
              }}
            </option>
            @for (o of f.options; track o) {
              <option [value]="o" [selected]="extra()[f.param] === o">
                {{ 'privacy.options.' + f.optionSet + '.' + o | transloco }}
              </option>
            }
          </select>
        </ng-container>
      }

      <label filters class="sr-only" [for]="id('owner')">
        {{ 'privacy.fields.owner_user_id' | transloco }}
      </label>
      <select
        filters
        [id]="id('owner')"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setOwner($any($event.target).value)"
      >
        <option value="" [selected]="!owner()">{{ 'privacy.list.anyOwner' | transloco }}</option>
        <option value="me" [selected]="owner() === 'me'">
          {{ 'privacy.list.mine' | transloco }}
        </option>
      </select>

      <label filters class="sr-only" [for]="id('sort')">{{
        'privacy.list.sort' | transloco
      }}</label>
      <select
        filters
        [id]="id('sort')"
        class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
        (change)="setSort($any($event.target).value)"
        data-testid="filter-sort"
      >
        @for (s of sorts(); track s) {
          <option [value]="s" [selected]="sort() === s">
            {{ 'privacy.sorts.' + sortKey(s) | transloco }}
          </option>
        }
      </select>

      @if (def().overdue) {
        <label
          filters
          class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
            data-testid="filter-overdue"
          />
          {{ 'privacy.list.overdue' | transloco }}
        </label>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'privacy.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'privacy.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                {{ 'privacy.list.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="privacy-rows">
                @for (r of rows(); track r.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/privacy', def().segment, r.id]"
                        class="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="flex-none font-mono text-[12px] text-fg-subtle">{{
                          r.code
                        }}</span>
                        <span class="truncate">{{ r.title }}</span>
                      </a>
                      @if (ownerName(r); as name) {
                        <span class="text-[12px] text-fg-subtle">
                          {{ 'privacy.list.owner' | transloco: { name } }}
                        </span>
                      }
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @for (f of facts(r); track f.key) {
                        @if (f.tone === 'plain') {
                          <span>{{ factText(f) }}</span>
                        } @else {
                          <app-badge [tone]="f.tone">{{ factText(f) }}</app-badge>
                        }
                      }
                      <app-badge [tone]="statusTone(r.status)">{{
                        statusKey(r.status) | transloco
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
        <app-why-it-matters scope="privacy" [page]="def().key" />
        <app-privacy-lesson-link [lesson]="lesson()" />
      </div>

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="privacy"
            [page]="def().key"
            [showAction]="canWrite()"
            (action)="create()"
          />
        </app-card>
        <app-why-it-matters scope="privacy" [page]="def().key" />
        <app-privacy-lesson-link [lesson]="lesson()" />
      </div>
    </app-record-list-page>
  `,
})
export class PrivacyRegisterList {
  private readonly api = inject(PrivacyApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly perms = privacyPermissions();

  /** Route data: which register this page lists. */
  readonly register = input.required<RegisterKey>();
  protected readonly def = computed(() => REGISTERS[this.register()]);
  protected readonly lesson = computed(() => REGISTER_LESSONS[this.register()]);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusKey = statusKey;
  protected readonly statusTone = statusTone;

  protected readonly canWrite = computed(() => this.perms().has(this.def().writePermission));
  protected readonly sorts = computed(() =>
    PRIVACY_SORTS.filter((s) => this.def().hasDue || !s.endsWith('due')),
  );

  protected readonly q = signal('');
  protected readonly status = signal('open');
  protected readonly owner = signal<'' | 'me'>('');
  protected readonly sort = signal<string>('-created_at');
  protected readonly overdue = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('overdue') === '1',
  );
  protected readonly extra = signal<Readonly<Record<string, string>>>({});
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly PrivacyRecord[]>([]);
  protected readonly total = signal(0);

  protected readonly isFiltered = computed(
    () =>
      !!this.q() ||
      this.status() !== 'open' ||
      !!this.owner() ||
      this.overdue() ||
      Object.values(this.extra()).some(Boolean),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    status: this.status(),
    owner: this.owner(),
    sort: this.sort(),
    overdue: this.overdue() ? '1' : '',
    ...this.extra(),
  }));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.refs.ensureMembers();
    providePageContext(() => ({
      module: 'privacy',
      entityType: this.def().entityType,
      view: 'list',
      title: this.language.translate(`privacy.registers.${this.def().key}.plural`),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const def = this.def();
      const query: PrivacyListQuery = {
        q: this.q() || undefined,
        status: statusesFor(def.key, this.status()),
        owner: this.owner() || undefined,
        sort: this.sort(),
        overdue: def.overdue && this.overdue() ? true : undefined,
        extra: this.extra(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected id(name: string): string {
    return `cf-privacy-${this.def().key}-${name}`;
  }

  protected sortKey(sort: string): string {
    return sort.startsWith('-') ? `${sort.slice(1)}Desc` : sort;
  }

  protected ownerName(r: PrivacyRecord): string | null {
    return this.refs.userName(r.owner_user_id);
  }

  protected facts(r: PrivacyRecord): readonly RowFact[] {
    return rowFacts(this.def(), r);
  }

  protected factText(f: RowFact): string {
    const params: Record<string, unknown> = { ...(f.params ?? {}) };
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v.startsWith('privacy.')) {
        params[k] = this.language.translate(v);
      }
    }
    if (f.date) {
      params['date'] = formatLocalDay(f.date, 'mediumDate', this.language.locale());
    }
    return this.language.translate(f.key, params);
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    const valid = value === 'open' || value === 'all' || this.def().statuses.includes(value);
    this.status.set(valid ? value : 'open');
  }

  protected setOwner(value: string): void {
    this.offset.set(0);
    this.owner.set(value === 'me' ? 'me' : '');
  }

  protected setSort(value: string): void {
    this.offset.set(0);
    this.sort.set((this.sorts() as readonly string[]).includes(value) ? value : '-created_at');
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected setExtra(param: string, value: string): void {
    const filter = this.def().filters.find((f) => f.param === param);
    if (!filter) {
      return;
    }
    this.offset.set(0);
    this.extra.update((e) => ({ ...e, [param]: filter.options.includes(value) ? value : '' }));
  }

  protected applyView(view: SavedView): void {
    const f = view.filters;
    this.setStatus(f['status'] ?? 'open');
    this.setOwner(f['owner'] ?? '');
    this.setSort(f['sort'] ?? '-created_at');
    this.setOverdue(f['overdue'] === '1');
    const extra: Record<string, string> = {};
    for (const filter of this.def().filters) {
      const v = f[filter.param] ?? '';
      extra[filter.param] = filter.options.includes(v) ? v : '';
    }
    this.extra.set(extra);
  }

  protected create(): void {
    void this.router.navigate(['/privacy', this.def().segment, 'new']);
  }

  private load(orgId: string | null, query: PrivacyListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.list(orgId, this.def(), query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
