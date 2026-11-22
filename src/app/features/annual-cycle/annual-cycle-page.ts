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
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { internalLink } from '../../core/search/internal-link';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { pluralKey } from '../../shared/i18n/plural';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { saveBlob } from '../reports/data/report-errors';
import { ReportsApi } from '../reports/data/reports-api';
import { AnnualCycleApi } from './data/annual-cycle-api';
import {
  DotTone,
  ROWS_PER_MONTH,
  STATUS_TONE,
  groupByMonth,
  monthAnchor,
  monthDots,
  monthHeading,
  monthTotal,
  proposalYear,
  shortMonth,
  statusLabel,
} from './data/annual-cycle.logic';
import { AREA_FILTERS, AreaFilter, YearItem, YearResponse } from './data/annual-cycle.models';
import { ProposeDialog } from './propose-dialog';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly value: YearResponse };

const DOT_CLASS: Readonly<Record<DotTone, string>> = {
  bad: 'bg-fail',
  warn: 'bg-warn',
  info: 'bg-accent',
  ok: 'bg-pass',
};

const CHIP =
  'inline-flex min-h-9 items-center rounded-full border px-3.5 text-ui whitespace-nowrap transition-colors';
const CHIP_OFF = 'border-border bg-surface text-fg hover:bg-surface-2';
const CHIP_ON = 'border-accent bg-accent-soft text-accent';
const ACTION_BASE =
  'inline-flex h-8 items-center justify-center gap-2 rounded-tile border px-3 text-ui font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';
const ACTION = `${ACTION_BASE} border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2`;
const PLAN = `${ACTION_BASE} border-transparent bg-accent text-white hover:bg-accent-2`;

/**
 * Årshjul `/annual-cycle` (IA v2 §5.3, prototype `arshjul`): a 12-month strip with a
 * dot per item (coloured by status) and the year list grouped by month, every row with
 * one action (open, remind the owner, or plan a missing duty). "Foreslå årshjul"
 * opens the rule-based proposal. Filters in the URL: `?area=`, `?mine=1`.
 */
@Component({
  selector: 'app-annual-cycle-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    ErrorState,
    LoadingState,
    PageHeader,
    ProposeDialog,
    ReqPills,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 py-7 sm:px-6">
      <app-page-header titleKey="annual.title" descriptionKey="annual.intro">
        @if (canSubscribe()) {
          <app-button
            secondary
            variant="secondary"
            [loading]="exporting()"
            (click)="subscribe()"
            data-testid="annual-subscribe"
          >
            {{ 'annual.subscribe' | transloco }}
          </app-button>
        }
        @if (canPropose()) {
          <app-button primary (click)="openProposal(null)" data-testid="annual-propose">
            @if (nextYear(); as year) {
              {{ 'annual.proposeFor' | transloco: { year } }}
            } @else {
              {{ 'annual.propose' | transloco }}
            }
          </app-button>
        }
      </app-page-header>

      <div
        class="mb-5 flex flex-wrap items-center gap-2"
        role="group"
        [attr.aria-label]="'annual.filters.label' | transloco"
      >
        <button
          type="button"
          [class]="chip(area() === null)"
          [attr.aria-pressed]="area() === null"
          (click)="setArea(null)"
        >
          {{ 'annual.filters.all' | transloco }}
        </button>
        @for (a of areas; track a) {
          <button
            type="button"
            [class]="chip(area() === a)"
            [attr.aria-pressed]="area() === a"
            (click)="setArea(a)"
            [attr.data-testid]="'annual-area-' + a"
          >
            {{ 'annual.areas.' + a | transloco }}
          </button>
        }
        <span class="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true"></span>
        <button
          type="button"
          [class]="chip(mine())"
          [attr.aria-pressed]="mine()"
          (click)="setMine(!mine())"
          data-testid="annual-mine"
        >
          {{ 'annual.filters.mine' | transloco }}
        </button>
      </div>

      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="load()" />
        }
        @case ('ready') {
          @if (data(); as d) {
            <nav
              class="mb-6 grid grid-cols-6 gap-1.5 min-[700px]:grid-cols-12"
              [attr.aria-label]="'annual.strip.label' | transloco"
              data-testid="annual-strip"
            >
              @for (m of d.months; track m.month; let first = $first) {
                <button
                  type="button"
                  class="min-h-[78px] rounded-[10px] border bg-surface px-1 py-2.5 text-center hover:bg-surface-2"
                  [class.border-accent]="first && isNow(m.month)"
                  [class.shadow-[inset_0_0_0_1px_var(--color-accent)]]="first && isNow(m.month)"
                  [class.border-border]="!(first && isNow(m.month))"
                  [attr.aria-current]="isNow(m.month) ? 'date' : null"
                  [attr.aria-label]="
                    pluralKey('annual.strip.month', total(m))
                      | transloco: { month: heading(m.month), count: total(m) }
                  "
                  (click)="scrollTo(m.month)"
                >
                  <span
                    class="block text-[12px] font-semibold tracking-[.06em] text-fg-subtle uppercase"
                    >{{ short(m.month) }}</span
                  >
                  <span class="mt-2 flex flex-wrap justify-center gap-1" aria-hidden="true">
                    @for (dot of dots(m); track $index) {
                      <i class="block size-2 rounded-full" [class]="dotClass(dot)"></i>
                    }
                  </span>
                </button>
              }
            </nav>

            @if (d.truncated) {
              <p class="mb-3 text-meta text-fg-muted">{{ 'annual.truncated' | transloco }}</p>
            }

            @if (groups().length === 0) {
              <div class="rounded-card border border-border bg-surface p-6 text-center">
                @if (area() || mine()) {
                  <p class="text-body text-fg-muted">{{ 'annual.empty.filtered' | transloco }}</p>
                } @else {
                  <h2 class="font-display text-section font-bold text-fg">
                    {{ 'annual.empty.title' | transloco }}
                  </h2>
                  <p class="mt-1 text-body text-fg-muted">{{ 'annual.empty.body' | transloco }}</p>
                }
              </div>
            }

            <div data-testid="annual-yearlist">
              @for (g of groups(); track g.month) {
                <section [id]="anchor(g.month)" class="scroll-mt-24">
                  <h3 class="mt-6 mb-2 font-display text-section font-bold text-fg">
                    {{ heading(g.month) }}
                  </h3>
                  @for (item of visible(g.month, g.items); track item.id) {
                    <div
                      class="mb-2 grid grid-cols-1 items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                      data-testid="annual-row"
                    >
                      <div class="min-w-0">
                        <b class="block font-semibold [overflow-wrap:anywhere] text-fg">{{
                          item.title
                        }}</b>
                        <span class="block text-meta text-fg-muted">{{ subtitle(item) }}</span>
                        <app-req-pills [refs]="item.requirement_refs" />
                      </div>
                      <div class="flex items-center justify-between gap-3 sm:contents">
                        <div>
                          <app-badge [tone]="tone(item)">
                            {{ status(item).key | transloco: status(item).params }}
                          </app-badge>
                        </div>
                        <div>
                          @switch (item.action.kind) {
                            @case ('remind') {
                              <button
                                type="button"
                                [class]="actionClass"
                                [disabled]="reminded().has(item.id) || reminding() === item.id"
                                (click)="remind(item)"
                              >
                                {{
                                  (reminded().has(item.id)
                                    ? 'annual.actions.reminded'
                                    : item.action.label_key
                                  ) | transloco
                                }}
                              </button>
                            }
                            @case ('plan') {
                              <button
                                type="button"
                                [class]="planClass"
                                (click)="openProposal(item)"
                                [disabled]="!d.can_propose"
                              >
                                {{ item.action.label_key | transloco }}
                              </button>
                            }
                            @default {
                              @if (link(item); as l) {
                                <a
                                  [class]="actionClass"
                                  [routerLink]="l.path"
                                  [queryParams]="l.queryParams"
                                  >{{ item.action.label_key | transloco }}</a
                                >
                              }
                            }
                          }
                        </div>
                      </div>
                    </div>
                  }
                  @if (g.items.length > rowsPerMonth) {
                    <button
                      type="button"
                      class="mt-1 text-ui font-semibold text-accent hover:underline"
                      (click)="toggleMonth(g.month)"
                      [attr.aria-expanded]="expanded().has(g.month)"
                    >
                      @if (expanded().has(g.month)) {
                        {{ 'annual.list.showLess' | transloco }}
                      } @else {
                        {{ 'annual.list.showAll' | transloco: { count: g.items.length } }}
                      }
                    </button>
                  }
                </section>
              }
            </div>
          }
        }
      }
    </div>

    <app-annual-propose-dialog
      [open]="proposing()"
      [year]="nextYear()"
      [onlyKey]="onlyKey()"
      (closed)="proposing.set(false)"
      (accepted)="onAccepted()"
    />
  `,
})
export class AnnualCyclePage {
  private readonly api = inject(AnnualCycleApi);
  private readonly reports = inject(ReportsApi);
  private readonly org = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly areas = AREA_FILTERS;
  protected readonly rowsPerMonth = ROWS_PER_MONTH;
  protected readonly actionClass = ACTION;
  protected readonly planClass = PLAN;
  protected readonly pluralKey = pluralKey;

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly area = signal<AreaFilter | null>(this.initialArea());
  protected readonly mine = signal(this.route.snapshot.queryParamMap.get('mine') === '1');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly reminded = signal<ReadonlySet<string>>(new Set());
  protected readonly reminding = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly proposing = signal(false);
  protected readonly onlyKey = signal<string | null>(null);

  private readonly today = new Date();
  protected readonly nextYear = signal(proposalYear(this.today));
  private readonly locale = computed(() => bcp47ForLang(this.language.active()));
  private loadSub: Subscription | null = null;

  protected readonly data = computed(() => {
    const s = this.state();
    return s.status === 'ready' ? s.value : null;
  });
  protected readonly groups = computed(() => {
    const d = this.data();
    return d ? groupByMonth(d.months, d.items) : [];
  });
  protected readonly canPropose = computed(() => this.data()?.can_propose ?? false);
  protected readonly canSubscribe = computed(
    () => this.org.currentOrg()?.permissions.includes('reports:read') ?? false,
  );

  constructor() {
    effect(() => {
      const orgId = this.org.currentOrgId();
      this.area();
      this.mine();
      this.language.active();
      if (orgId) {
        untracked(() => this.load());
      }
    });
    this.destroyRef.onDestroy(() => this.loadSub?.unsubscribe());
  }

  load(): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.loadSub?.unsubscribe();
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    this.loadSub = this.api.year(orgId, { area: this.area(), mine: this.mine() }).subscribe({
      next: (value) => this.state.set({ status: 'ready', value }),
      error: () => this.state.set({ status: 'error' }),
    });
  }

  protected chip(on: boolean): string {
    return `${CHIP} ${on ? CHIP_ON : CHIP_OFF}`;
  }

  protected setArea(area: AreaFilter | null): void {
    this.area.set(area);
    this.syncUrl();
  }

  protected setMine(mine: boolean): void {
    this.mine.set(mine);
    this.syncUrl();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { area: this.area(), mine: this.mine() ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private initialArea(): AreaFilter | null {
    const raw = this.route.snapshot.queryParamMap.get('area');
    return (AREA_FILTERS as readonly string[]).includes(raw ?? '') ? (raw as AreaFilter) : null;
  }

  protected isNow(month: string): boolean {
    const t = this.today;
    return month === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  }

  protected short(month: string): string {
    return shortMonth(month, this.locale());
  }

  protected heading(month: string): string {
    return monthHeading(month, this.locale(), this.today.getFullYear());
  }

  protected dots = monthDots;
  protected total = monthTotal;

  protected dotClass(tone: DotTone): string {
    return DOT_CLASS[tone];
  }

  protected anchor(month: string): string {
    return monthAnchor(month);
  }

  protected scrollTo(month: string): void {
    this.document.getElementById(monthAnchor(month))?.scrollIntoView({ behavior: 'smooth' });
  }

  protected visible(month: string, items: readonly YearItem[]): readonly YearItem[] {
    return this.expanded().has(month) ? items : items.slice(0, ROWS_PER_MONTH);
  }

  protected toggleMonth(month: string): void {
    const next = new Set(this.expanded());
    if (next.has(month)) {
      next.delete(month);
    } else {
      next.add(month);
    }
    this.expanded.set(next);
  }

  protected tone(item: YearItem) {
    return STATUS_TONE[item.status];
  }

  protected status(item: YearItem) {
    return statusLabel(item);
  }

  /** The grey line: "Folk · Opplæring", "Hvert år · Ansvarlig: Erik", or the reason. */
  protected subtitle(item: YearItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts: string[] = [];
    if (item.source === 'gap') {
      parts.push(t(`annual.recurrence.${item.recurrence ?? 'yearly'}`));
      if (item.detail) {
        parts.push(item.detail);
      }
    } else if (item.source === 'recurrence') {
      parts.push(t(`annual.recurrence.${item.recurrence ?? 'yearly'}`));
    } else {
      parts.push(t(`annual.areas.${item.area}`), t(`modules.names.${item.module}`));
    }
    if (item.owner_name && item.source !== 'gap') {
      parts.push(t('annual.owner', { name: item.owner_name }));
    }
    return parts.filter(Boolean).join(' · ');
  }

  protected link(item: YearItem) {
    return internalLink(item.action.url);
  }

  protected remind(item: YearItem): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.reminding.set(item.id);
    this.api.remind(orgId, item.id).subscribe({
      next: (result) => {
        this.reminding.set(null);
        this.reminded.set(new Set([...this.reminded(), item.id]));
        const name = result.recipient_name;
        if (result.already) {
          this.notifications.info('annual.remind.already', { name: name ?? '' });
        } else if (name) {
          this.notifications.success('annual.remind.sent', { name });
        } else {
          this.notifications.success('annual.remind.sentNoName');
        }
      },
      error: (error: { status?: number; error?: { detail?: { code?: string } } }) => {
        this.reminding.set(null);
        const code = error?.error?.detail?.code;
        this.notifications.error(
          code === 'no_owner' ? 'annual.remind.noOwner' : 'annual.remind.failed',
        );
      },
    });
  }

  protected openProposal(item: YearItem | null): void {
    this.onlyKey.set(item?.id.startsWith('gap:') ? item.id.slice(4) : null);
    this.proposing.set(true);
  }

  protected onAccepted(): void {
    this.proposing.set(false);
    this.load();
  }

  protected subscribe(): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.exporting.set(true);
    this.reports.calendarIcs(orgId).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, 'arshjul.ics');
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('annual.subscribeFailed');
      },
    });
  }
}
