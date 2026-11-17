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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { CONTRACTS_CRUMB, CONTRACTS_NAV, CONTRACTS_SETTINGS_LINK } from './contracts-nav';
import { ContractsApi } from './data/contracts-api';
import { Deadline, PERM_MANAGE } from './data/contract.models';
import {
  contractStatusKey,
  contractTypeKey,
  daysUntil,
  deadlineKindKey,
  saveBlob,
} from './data/contract-display';

export const DEADLINE_WINDOWS = [30, 60, 90, 180, 365] as const;

/** Task form link for following up a deadline (the task is filed on the contract). */
export function deadlineTaskParams(d: Deadline, label: string): Record<string, string> {
  return {
    entity_type: 'contract',
    entity_id: d.contract_id,
    title: `${label}: ${d.code} ${d.title}`.slice(0, 255),
    due: d.due_date,
  };
}

/**
 * Upcoming contract deadlines (`/contracts/deadlines`): notice deadlines, end and
 * review dates and open key dates across the register, soonest first, with the
 * overdue ones on top. Each row names the owner and the counterparty and offers
 * "Create task"; the list can be limited to the user's own contracts and exported
 * as a calendar file.
 */
@Component({
  selector: 'app-contract-deadlines',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    WhyItMatters,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="contracts.deadlines.title"
        descriptionKey="contracts.deadlines.subtitle"
        [breadcrumbs]="breadcrumbs"
        [settingsLink]="canManage() ? settingsLink : null"
      >
        <app-button
          secondary
          variant="secondary"
          size="sm"
          [loading]="exporting()"
          [disabled]="exporting()"
          (click)="exportIcs()"
          data-testid="deadlines-ics"
        >
          <app-icon name="calendar" [size]="14" />
          {{ 'contracts.deadlines.exportIcs' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav [items]="nav" />
      <app-help-strip class="mb-5 block" scope="contracts" page="deadlines" />

      <div class="mb-4 flex flex-wrap items-center gap-3" role="search">
        <label class="flex items-center gap-2 text-ui font-semibold text-fg-muted">
          {{ 'contracts.deadlines.window' | transloco }}
          <select
            class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            (change)="withinDays.set(+$any($event.target).value)"
            data-testid="deadline-window"
          >
            @for (w of windows; track w) {
              <option [value]="w" [selected]="withinDays() === w">
                {{ 'contracts.filters.expiringWithin' | transloco: { days: w } }}
              </option>
            }
          </select>
        </label>
        <label class="inline-flex h-10 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="mine()"
            (change)="mine.set($any($event.target).checked)"
            data-testid="deadline-mine"
          />
          {{ 'contracts.deadlines.mine' | transloco }}
        </label>
        <label class="inline-flex h-10 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="includeOverdue()"
            (change)="includeOverdue.set($any($event.target).checked)"
          />
          {{ 'contracts.deadlines.includeOverdue' | transloco }}
        </label>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (items().length === 0) {
              <app-teaching-empty scope="contracts" page="deadlines" [showAction]="false" />
            } @else {
              <ul class="divide-y divide-border" data-testid="deadline-rows">
                @for (d of items(); track d.contract_id + d.kind + (d.key_date_id ?? '')) {
                  <li
                    class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-4"
                    [class.bg-warn-soft]="d.overdue"
                  >
                    <span
                      class="flex-none text-ui font-semibold md:w-[130px]"
                      [class.text-warn-ink]="d.overdue"
                    >
                      @if (d.overdue) {
                        <app-icon name="alert" [size]="13" />
                      }
                      {{ d.due_date | localDay }}
                      <span class="block text-meta font-normal text-fg-subtle">
                        {{ relative(d) }}
                      </span>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-ui font-semibold text-fg">
                        {{ kindKey(d.kind) | transloco }}
                        @if (d.label) {
                          <span class="font-normal text-fg-muted"> · {{ d.label }}</span>
                        }
                      </span>
                      <a
                        [routerLink]="['/contracts', d.contract_id]"
                        class="block text-meta text-fg-muted [overflow-wrap:anywhere] hover:underline"
                      >
                        <span class="font-mono">{{ d.code }}</span> {{ d.title }}
                      </a>
                      <span
                        class="flex flex-wrap gap-x-3 text-meta text-fg-subtle"
                        data-testid="deadline-meta"
                      >
                        <span>{{ typeKey(d.contract_type) | transloco }}</span>
                        @if (d.counterparties?.length) {
                          <span>{{ d.counterparties!.join(', ') }}</span>
                        }
                        <span>
                          {{
                            'contracts.deadlines.owner'
                              | transloco
                                : {
                                    name:
                                      d.owner?.name ?? ('contracts.deadlines.noOwner' | transloco),
                                  }
                          }}
                        </span>
                      </span>
                    </span>
                    <span class="flex flex-wrap items-center gap-2">
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="d.status"
                        [labelKey]="statusKey(d.status)"
                      />
                      <a
                        routerLink="/tasks/new"
                        [queryParams]="taskParams(d)"
                        class="inline-flex h-8 items-center gap-1 rounded-tile px-2.5 text-ui font-semibold text-accent hover:bg-accent-soft"
                        [attr.aria-label]="
                          'contracts.deadlines.createTaskFor' | transloco: { code: d.code }
                        "
                        data-testid="deadline-task"
                      >
                        <app-icon name="plus" [size]="13" />
                        {{ 'contracts.deadlines.createTask' | transloco }}
                      </a>
                    </span>
                  </li>
                }
              </ul>
            }
          }
        }
      </app-card>

      <div class="mt-8"><app-why-it-matters scope="contracts" page="deadlines" /></div>
    </div>
  `,
})
export class ContractDeadlines {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly nav = CONTRACTS_NAV;
  protected readonly settingsLink = CONTRACTS_SETTINGS_LINK;
  protected readonly breadcrumbs: readonly Breadcrumb[] = [
    CONTRACTS_CRUMB,
    { labelKey: 'contracts.deadlines.title' },
  ];
  protected readonly windows = DEADLINE_WINDOWS;
  protected readonly kindKey = deadlineKindKey;
  protected readonly typeKey = contractTypeKey;
  protected readonly statusKey = contractStatusKey;

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );

  protected readonly withinDays = signal<number>(90);
  protected readonly includeOverdue = signal(true);
  protected readonly mine = signal(false);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly exporting = signal(false);
  private readonly rows = signal<readonly Deadline[]>([]);
  private readonly reloadTick = signal(0);
  protected readonly items = computed(() =>
    [...this.rows()].sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || a.due_date.localeCompare(b.due_date),
    ),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      view: 'calendar',
      title: this.language.translate('contracts.deadlines.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const within = this.withinDays();
      const overdue = this.includeOverdue();
      const owner = this.mine() ? 'me' : undefined;
      this.reloadTick();
      untracked(() => this.load(orgId, within, overdue, owner));
    });
  }

  protected relative(d: Deadline): string {
    const days = d.days_left ?? daysUntil(d.due_date) ?? 0;
    if (days === 0) {
      return this.language.translate('contracts.deadlines.today');
    }
    return days < 0
      ? this.language.translate('contracts.deadlines.daysAgo', { days: -days })
      : this.language.translate('contracts.deadlines.inDays', { days });
  }

  protected taskParams(d: Deadline): Record<string, string> {
    return deadlineTaskParams(d, this.language.translate(deadlineKindKey(d.kind)));
  }

  protected reload(): void {
    this.reloadTick.update((n) => n + 1);
  }

  /** All deadlines of the next year (the current "Mine" choice applies) as an .ics file. */
  protected exportIcs(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.api
      .deadlinesIcs(orgId, Math.max(this.withinDays(), 365), lang, this.mine() ? 'me' : undefined)
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          saveBlob(blob, `${this.language.translate('contracts.deadlines.icsFile')}.ics`);
        },
        error: () => {
          this.exporting.set(false);
          this.notifications.error('contracts.errors.exportFailed');
        },
      });
  }

  private load(orgId: string | null, within: number, overdue: boolean, owner?: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.deadlines(orgId, within, overdue, owner).subscribe({
      next: (items) => {
        this.rows.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
