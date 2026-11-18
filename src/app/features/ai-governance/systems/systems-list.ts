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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  AI_ACT_ROLES,
  AiSystemSummary,
  RISK_CLASSES,
  SYSTEM_SORTS,
  SYSTEM_STATUSES,
  SystemSort,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  AI_SYSTEM_ENTITY,
  obligationProgress,
  riskKey,
  riskValue,
  roleKey,
  statusKey,
  systemStatusValue,
} from '../data/ai-governance-display';
import { AI_GOV_ROOT } from '../ui/ai-gov-page';
import { AiNav } from '../ui/ai-nav';
import { FulfilsRequirements } from '../../../shared/requirement-locations/fulfils-requirements';

const PAGE_SIZE = 25;

/**
 * `/ai-governance/systems`: the AI system inventory, with search, filters
 * (status, risk class, AI Act role), sorting, saved views and paging. Each row
 * shows the risk class, status, how many obligations are met and the
 * requirements it documents. The overview deep-links here with
 * `?risk_class=` (or the older `?risk=`).
 */
@Component({
  selector: 'app-ai-systems-list',
  imports: [
    FulfilsRequirements,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    RecordListPage,
    CoverageChip,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    AiNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="aiGovernance.systems.title"
      descriptionKey="aiGovernance.systems.subtitle"
      [scope]="scope"
      page="systems"
      settingsLink="/ai-governance/settings"
      [breadcrumbs]="[root, { labelKey: 'aiGovernance.systems.title' }]"
      searchPlaceholderKey="aiGovernance.systems.searchPlaceholder"
      [query]="q()"
      [filters]="filters()"
      [moreFiltersActive]="role() ? 1 : 0"
      [empty]="state() === 'ready' && total() === 0 && !isFiltered()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-fulfils-requirements help locationKey="ai_governance.systems" />
      @if (store.canWrite()) {
        <app-button
          primary
          (click)="create()"
          appTourStep="ai-systems-new"
          data-testid="system-new"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'aiGovernance.systems.new' | transloco }}
        </app-button>
      }
      @if (store.canWrite()) {
        <button appMenuItem overflow (click)="registerPlatform()" data-testid="register-platform">
          {{ 'aiGovernance.systems.registerPlatform' | transloco }}
        </button>
      }

      <app-ai-nav nav />
      <app-help-strip
        help
        [scope]="scope"
        page="systems"
        tour="systems"
        lesson="ai-inventory-basics"
      />

      <ng-container filters>
        <label class="sr-only" for="ai-sys-risk">{{
          'aiGovernance.filters.risk' | transloco
        }}</label>
        <select
          id="ai-sys-risk"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          appTourStep="ai-systems-filters"
          (change)="setFilter('risk', $any($event.target).value)"
        >
          <option value="" [selected]="!riskFilter()">
            {{ 'aiGovernance.filters.anyRisk' | transloco }}
          </option>
          @for (r of risks; track r) {
            <option [value]="r" [selected]="riskFilter() === r">
              {{ riskKey(r) | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ai-sys-status">{{
          'aiGovernance.filters.status' | transloco
        }}</label>
        <select
          id="ai-sys-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setFilter('status', $any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'aiGovernance.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">{{ statusKey(s) | transloco }}</option>
          }
        </select>
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="ai-sys-role">{{
            'aiGovernance.filters.role' | transloco
          }}</label>
          <select
            id="ai-sys-role"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setFilter('role', $any($event.target).value)"
          >
            <option value="" [selected]="!role()">
              {{ 'aiGovernance.filters.anyRole' | transloco }}
            </option>
            @for (r of roles; track r) {
              <option [value]="r" [selected]="role() === r">{{ roleKey(r) | transloco }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-meta font-semibold text-fg-muted" for="ai-sys-sort">{{
            'aiGovernance.filters.sort' | transloco
          }}</label>
          <select
            id="ai-sys-sort"
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="setFilter('sort', $any($event.target).value)"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="sort() === s">
                {{ 'aiGovernance.systems.sorts.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload.update((n) => n + 1)" />
          }
          @default {
            @if (items().length === 0) {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                ctaKey="aiGovernance.filters.clear"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="clearFilters()"
              />
            } @else {
              <div
                role="list"
                [attr.aria-label]="'aiGovernance.systems.title' | transloco"
                data-testid="systems-table"
              >
                <app-record-row-header dateKind="next" />
                @for (s of items(); track s.id) {
                  <app-record-row
                    [code]="s.code"
                    [title]="s.name"
                    [subtitle]="subtitle(s)"
                    [link]="['/ai-governance/systems', s.id]"
                    [owner]="s.owner?.name ?? ('aiGovernance.common.noOwner' | transloco)"
                    [date]="s.next_review_at"
                    dateKind="next"
                    [overdue]="reviewOverdue(s)"
                  >
                    <app-coverage-chip
                      coverage
                      class="max-w-full [&_[data-testid=coverage-chip]]:flex-wrap [&_[data-testid=coverage-chip]]:whitespace-normal"
                      [entityType]="entity"
                      [entityId]="s.id"
                    />
                    <app-status-badge
                      badges
                      meaning="severity"
                      [value]="riskValue(s.risk_class)"
                      [labelKey]="riskKey(s.risk_class)"
                    />
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      [value]="statusValue(s.status)"
                      [labelKey]="statusKey(s.status)"
                    />
                    @if (s.is_builtin) {
                      <app-badge badges tone="neutral">{{
                        'aiGovernance.systems.builtin' | transloco
                      }}</app-badge>
                    }
                  </app-record-row>
                }
              </div>
              <div class="px-4 py-2">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="items().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <app-card empty>
        <app-teaching-empty
          [scope]="scope"
          page="systems"
          [showAction]="store.canWrite()"
          (action)="create()"
        />
        @if (store.canWrite()) {
          <div class="flex flex-col items-center gap-2 pb-6 text-center">
            <p class="max-w-[52ch] text-ui text-fg-muted">
              {{ 'aiGovernance.systems.registerPlatformHint' | transloco }}
            </p>
            <app-button
              variant="secondary"
              size="sm"
              [loading]="registering()"
              (click)="registerPlatform()"
            >
              <app-icon name="spark" [size]="14" />
              {{ 'aiGovernance.systems.registerPlatform' | transloco }}
            </app-button>
          </div>
        }
      </app-card>

      <app-why-it-matters below [scope]="scope" page="systems" />
    </app-record-list-page>
  `,
})
export class AiSystemsList {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly root = AI_GOV_ROOT;
  protected readonly entity = AI_SYSTEM_ENTITY;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statuses = SYSTEM_STATUSES;
  protected readonly risks = RISK_CLASSES;
  protected readonly roles = AI_ACT_ROLES;
  protected readonly sorts = SYSTEM_SORTS;
  protected readonly riskKey = riskKey;
  protected readonly riskValue = riskValue;
  protected readonly statusKey = statusKey;
  protected readonly statusValue = systemStatusValue;
  protected readonly roleKey = roleKey;

  /** Query params preset the filters (links from the overview). */
  readonly risk_class = input<string | undefined>(undefined);
  readonly risk = input<string | undefined>(undefined);

  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly riskFilter = signal('');
  protected readonly role = signal('');
  protected readonly sort = signal<SystemSort>('name');
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly AiSystemSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly registering = signal(false);
  protected readonly reload = signal(0);

  protected readonly filters = computed(() => ({
    status: this.status(),
    risk: this.riskFilter(),
    role: this.role(),
    sort: this.sort(),
  }));
  protected readonly isFiltered = computed(
    () => !!this.q() || !!this.status() || !!this.riskFilter() || !!this.role(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      view: 'list',
      title: this.language.translate('aiGovernance.systems.title'),
    }));
    effect(() => {
      const preset = this.risk_class() ?? this.risk();
      untracked(() => {
        if (preset && (RISK_CLASSES as readonly string[]).includes(preset)) {
          this.riskFilter.set(preset);
        }
      });
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reload();
      this.language.active();
      const query = {
        q: this.q() || undefined,
        status: this.status() || undefined,
        risk_class: this.riskFilter() || undefined,
        role: this.role() || undefined,
        sort: this.sort(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.listSystems(orgId, query).subscribe({
          next: (page) => {
            this.items.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  /** "Idriftsetter · 2 av 5 forpliktelser oppfylt" (role, then obligation progress). */
  protected subtitle(s: AiSystemSummary): string {
    const parts = [this.language.translate(roleKey(s.ai_act_role))];
    const progress = obligationProgress(s.obligations_summary);
    if (progress.total > 0) {
      parts.push(
        this.language.translate('aiGovernance.systems.obligationsMet', {
          met: progress.met,
          total: progress.total,
        }),
      );
    }
    if (s.provider_name) {
      parts.push(s.provider_name);
    }
    return parts.join(' · ');
  }

  protected reviewOverdue(s: AiSystemSummary): boolean {
    return !!s.next_review_at && new Date(s.next_review_at).getTime() < Date.now();
  }

  protected setQuery(q: string): void {
    this.offset.set(0);
    this.q.set(q.trim());
  }

  protected setFilter(key: 'status' | 'risk' | 'role' | 'sort', value: string): void {
    this.offset.set(0);
    if (key === 'sort') {
      this.sort.set(
        (SYSTEM_SORTS as readonly string[]).includes(value) ? (value as SystemSort) : 'name',
      );
    } else if (key === 'risk') {
      this.riskFilter.set(value);
    } else {
      this[key].set(value);
    }
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.q.set('');
    this.status.set('');
    this.riskFilter.set('');
    this.role.set('');
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.status.set(view.filters['status'] ?? '');
    this.riskFilter.set(view.filters['risk'] ?? '');
    this.role.set(view.filters['role'] ?? '');
    const sort = view.filters['sort'] ?? 'name';
    this.sort.set(
      (SYSTEM_SORTS as readonly string[]).includes(sort) ? (sort as SystemSort) : 'name',
    );
  }

  protected create(): void {
    void this.router.navigate(['/ai-governance/systems/new']);
  }

  protected registerPlatform(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.registering()) {
      return;
    }
    this.registering.set(true);
    this.api.registerPlatformFeatures(orgId, this.language.active()).subscribe({
      next: (result) => {
        this.registering.set(false);
        this.notifications.success(
          result.created === 0
            ? 'aiGovernance.systems.alreadyRegistered'
            : result.created === 1
              ? 'aiGovernance.systems.registeredOne'
              : 'aiGovernance.systems.registered',
          { count: result.created },
        );
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.registering.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
