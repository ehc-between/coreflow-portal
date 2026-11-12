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
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AskAbout } from '../../shared/ask/ask-about';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractsApi } from './data/contracts-api';
import { Deadline } from './data/contract.models';
import {
  contractStatusKey,
  contractStatusTone,
  contractTypeKey,
  daysUntil,
  deadlineKindKey,
} from './data/contract-display';

export const DEADLINE_WINDOWS = [30, 60, 90, 180, 365] as const;

/**
 * Upcoming contract deadlines (`/contracts/deadlines`): notice deadlines, end and
 * review dates and open key dates across the register, soonest first, with the
 * overdue ones on top.
 */
@Component({
  selector: 'app-contract-deadlines',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AskAbout,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    Badge,
    Card,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/contracts"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'contracts.common.backToList' | transloco }}
      </a>
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'contracts.deadlines.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'contracts.deadlines.subtitle' | transloco }}
          </p>
        </div>
        <app-ask-about [prompt]="'contracts.ask.deadlines' | transloco" />
      </header>

      <div class="mb-4"><app-guide-intro scope="contracts" page="deadlines" /></div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-[13px] font-semibold text-fg-muted">
          {{ 'contracts.deadlines.window' | transloco }}
          <select
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
        <label class="inline-flex items-center gap-2 text-[13px] text-fg">
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
            <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
              {{ 'contracts.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'contracts.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (items().length === 0) {
              <app-teaching-empty scope="contracts" page="deadlines" [showAction]="false" />
            } @else {
              <ul class="divide-y divide-border" data-testid="deadline-rows">
                @for (d of items(); track d.contract_id + d.kind + (d.key_date_id ?? '')) {
                  <li
                    class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    [class.bg-fail-soft]="d.overdue"
                  >
                    <span
                      class="w-[130px] flex-none text-[13px] font-semibold"
                      [class.text-fail]="d.overdue"
                    >
                      @if (d.overdue) {
                        <app-icon name="alert" [size]="13" />
                        <span class="sr-only">{{ 'contracts.common.overdue' | transloco }}</span>
                      }
                      {{ d.due_date | localDay }}
                      <span class="block text-[11.5px] font-normal text-fg-subtle">
                        {{ relative(d) }}
                      </span>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-[13px] text-fg">
                        {{ kindKey(d.kind) | transloco }}
                        @if (d.label) {
                          · {{ d.label }}
                        }
                      </span>
                      <a
                        [routerLink]="['/contracts', d.contract_id]"
                        class="block truncate text-[12.5px] text-fg-muted hover:underline"
                      >
                        <span class="font-mono">{{ d.code }}</span> {{ d.title }}
                      </a>
                    </span>
                    <span class="flex items-center gap-2">
                      <span class="text-[12px] text-fg-subtle">{{
                        typeKey(d.contract_type) | transloco
                      }}</span>
                      <app-badge [tone]="statusTone(d.status)">{{
                        statusKey(d.status) | transloco
                      }}</app-badge>
                    </span>
                  </li>
                }
              </ul>
            }
          }
        }
      </app-card>

      <div class="mt-6"><app-why-it-matters scope="contracts" page="deadlines" /></div>
    </div>
  `,
})
export class ContractDeadlines {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly windows = DEADLINE_WINDOWS;
  protected readonly kindKey = deadlineKindKey;
  protected readonly typeKey = contractTypeKey;
  protected readonly statusKey = contractStatusKey;
  protected readonly statusTone = contractStatusTone;

  protected readonly withinDays = signal<number>(90);
  protected readonly includeOverdue = signal(true);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  private readonly rows = signal<readonly Deadline[]>([]);
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
      untracked(() => this.load(orgId, within, overdue));
    });
  }

  protected relative(d: Deadline): string {
    const days = daysUntil(d.due_date) ?? 0;
    if (days === 0) {
      return this.language.translate('contracts.deadlines.today');
    }
    return days < 0
      ? this.language.translate('contracts.deadlines.daysAgo', { days: -days })
      : this.language.translate('contracts.deadlines.inDays', { days });
  }

  private load(orgId: string | null, within: number, overdue: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.deadlines(orgId, within, overdue).subscribe({
      next: (items) => {
        this.rows.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
