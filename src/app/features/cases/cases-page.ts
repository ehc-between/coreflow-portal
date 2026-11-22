import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { hasAnyPermission } from '../../core/auth/permission';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SpeakUpApi } from '../speak-up/data/speak-up.api';
import {
  CASE_TABS,
  CASE_TYPES,
  CaseItem,
  CaseList,
  CaseTab,
  CaseTone,
  CaseType,
} from '../speak-up/data/speak-up.models';
import { DueCell, dueCell } from '../speak-up/speak-up-logic';

const PAGE = 50;
const TONES: Record<CaseTone, BadgeTone> = {
  bad: 'fail',
  warn: 'warn',
  info: 'accent',
  ok: 'pass',
  plain: 'neutral',
};

/** `?tab=` / `?type=` values, defaulting anything unknown. */
export function parseTab(raw: string | null): CaseTab {
  return (CASE_TABS as readonly string[]).includes(raw ?? '') ? (raw as CaseTab) : 'open';
}

export function parseType(raw: string | null): CaseType | null {
  return (CASE_TYPES as readonly string[]).includes(raw ?? '') ? (raw as CaseType) : null;
}

/**
 * Saker (IA v2 §5.2, prototype `saker`): every reported case — deviations, incidents,
 * personal data breaches, complaints, ideas and (with the intake permission) anonymous
 * reports — with tabs Åpne / Mine / Lukket, a type filter and search, one row per case
 * (Sak · Hvor i bedriften · Status · Frist). A row opens the record (its URL is
 * unchanged). Links to the deviation module's own pages sit under the list.
 */
@Component({
  selector: 'app-cases-page',
  imports: [RouterLink, TranslocoPipe, Badge, Button, EmptyState, ErrorState, Icon, LoadingState],
  viewProviders: [provideSharedScope('speakup')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 py-7 sm:px-6" data-testid="cases-page">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="font-display text-page font-bold text-fg">
            {{ 'speakup.cases.title' | transloco }}
          </h1>
          <p class="mt-1.5 max-w-[62ch] text-body text-fg-muted">
            {{ 'speakup.cases.intro' | transloco }}
          </p>
        </div>
        <a routerLink="/speak-up" tabindex="-1" data-testid="report"
          ><app-button>{{ 'speakup.cases.report' | transloco }}</app-button></a
        >
      </header>

      <div
        class="mb-4 flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        [attr.aria-label]="'speakup.cases.tabs.label' | transloco"
      >
        @for (t of tabs; track t) {
          <button
            type="button"
            role="tab"
            class="-mb-px border-b-2 px-3.5 py-2.5 text-body font-semibold whitespace-nowrap"
            [class]="
              tab() === t
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            "
            [attr.aria-selected]="tab() === t"
            [attr.data-testid]="'tab-' + t"
            (click)="go({ tab: t === 'open' ? null : t })"
          >
            {{ 'speakup.cases.tabs.' + t | transloco: { count: count(t) } }}
          </button>
        }
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div
          class="flex flex-wrap gap-1.5"
          role="group"
          [attr.aria-label]="'speakup.cases.filterLabel' | transloco"
        >
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-ui"
            [class]="chipClass(type() === null)"
            [attr.aria-pressed]="type() === null"
            (click)="go({ type: null })"
          >
            {{ 'speakup.cases.all' | transloco }}
          </button>
          @for (t of typeChips(); track t) {
            <button
              type="button"
              class="rounded-full border px-3 py-1 text-ui"
              [class]="chipClass(type() === t)"
              [attr.aria-pressed]="type() === t"
              [attr.data-testid]="'type-' + t"
              (click)="go({ type: t })"
            >
              {{ 'speakup.types.' + t + '.label' | transloco }}
            </button>
          }
        </div>
        <label class="relative ml-auto w-full sm:w-64">
          <span class="sr-only">{{ 'speakup.cases.search' | transloco }}</span>
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
            ><app-icon name="search" [size]="15"
          /></span>
          <input
            type="search"
            data-testid="cases-search"
            class="h-9 w-full rounded-tile border border-border bg-bg pr-3 pl-9 text-ui text-fg outline-none focus:border-accent"
            [placeholder]="'speakup.cases.searchPlaceholder' | transloco"
            [value]="q()"
            (change)="go({ q: $any($event.target).value || null })"
          />
        </label>
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (data() === null) {
        <app-loading-state [rows]="5" />
      } @else if (items().length === 0) {
        <app-empty-state
          icon="inbox"
          [kind]="filtered() ? 'filtered' : 'cleared'"
          [titleKey]="filtered() ? 'speakup.cases.empty.filtered' : 'speakup.cases.empty.' + tab()"
          [bodyKey]="
            filtered()
              ? 'speakup.cases.empty.filteredBody'
              : 'speakup.cases.empty.' + tab() + 'Body'
          "
          [ctaKey]="tab() === 'closed' || filtered() ? null : 'speakup.cases.report'"
          ctaLink="/speak-up"
        />
      } @else {
        <!-- Desktop / tablet: the prototype's table. -->
        <div class="hidden overflow-hidden rounded-card border border-border bg-surface sm:block">
          <table class="w-full border-collapse text-left" data-testid="cases-table">
            <thead>
              <tr class="border-b border-border">
                @for (c of columns; track c) {
                  <th
                    scope="col"
                    class="px-4 py-3 text-meta font-semibold tracking-[0.06em] text-fg-subtle uppercase"
                  >
                    {{ 'speakup.cases.columns.' + c | transloco }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.entity_type + item.id) {
                @let due = dueOf(item);
                <tr
                  class="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2"
                  data-testid="case-row"
                  (click)="open(item)"
                >
                  <td class="px-4 py-3.5 align-middle">
                    <a
                      [routerLink]="item.url"
                      class="font-semibold text-fg hover:underline"
                      (click)="$event.stopPropagation()"
                      >{{ item.title }}</a
                    >
                    <span class="block text-ui text-fg-muted">{{ sub(item) }}</span>
                  </td>
                  <td class="px-4 py-3.5 align-middle text-body text-fg">
                    {{ item.where.label || '–' }}
                  </td>
                  <td class="px-4 py-3.5 align-middle">
                    <app-badge [tone]="badgeTone(item.tone)">{{ item.status_label }}</app-badge>
                  </td>
                  <td class="px-4 py-3.5 align-middle whitespace-nowrap">
                    @if (due; as d) {
                      @if (d.tone) {
                        <app-badge [tone]="d.tone === 'bad' ? 'fail' : 'warn'">{{
                          d.text
                        }}</app-badge>
                      } @else {
                        <span class="text-body text-fg-muted">{{ d.text }}</span>
                      }
                    } @else {
                      <span class="text-body text-fg-subtle">{{
                        'speakup.cases.noDue' | transloco
                      }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Phones: one card per case. -->
        <ul class="flex flex-col gap-2 sm:hidden" data-testid="cases-list">
          @for (item of items(); track item.entity_type + item.id) {
            @let due = dueOf(item);
            <li>
              <a
                [routerLink]="item.url"
                class="block rounded-tile border border-border bg-surface px-4 py-3 hover:bg-surface-2"
              >
                <span class="block font-semibold text-fg">{{ item.title }}</span>
                <span class="block text-ui text-fg-muted">{{ sub(item) }}</span>
                @if (item.where.label) {
                  <span class="mt-0.5 block text-ui text-fg-muted">{{ item.where.label }}</span>
                }
                <span class="mt-2 flex flex-wrap items-center gap-1.5">
                  <app-badge [tone]="badgeTone(item.tone)">{{ item.status_label }}</app-badge>
                  @if (due; as d) {
                    <app-badge
                      [tone]="d.tone === 'bad' ? 'fail' : d.tone === 'warn' ? 'warn' : 'neutral'"
                      >{{ d.text }}</app-badge
                    >
                  }
                </span>
              </a>
            </li>
          }
        </ul>

        @if (data(); as d) {
          @if (d.total > items().length) {
            <div class="mt-3 flex items-center justify-between gap-3">
              <span class="text-ui text-fg-muted">{{
                'speakup.cases.shown' | transloco: { shown: items().length, total: d.total }
              }}</span>
              <app-button
                variant="secondary"
                size="sm"
                data-testid="more"
                [loading]="loadingMore()"
                (click)="more()"
              >
                {{ 'speakup.cases.more' | transloco }}
              </app-button>
            </div>
          }
        }
      }

      @if (moduleLinks(); as links) {
        @if (links.length) {
          <nav
            class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-ui"
            [attr.aria-label]="'speakup.cases.links.label' | transloco"
          >
            @for (l of links; track l.path) {
              <a [routerLink]="l.path" class="font-semibold text-accent hover:underline">{{
                l.key | transloco: { count: l.count }
              }}</a>
            }
          </nav>
        }
      }
    </div>
  `,
})
export class CasesPage {
  private readonly api = inject(SpeakUpApi);
  private readonly org = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs = CASE_TABS;
  protected readonly columns = ['case', 'where', 'status', 'due'] as const;

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly tab = computed(() => parseTab(this.query().get('tab')));
  protected readonly type = computed(() => parseType(this.query().get('type')));
  protected readonly q = computed(() => this.query().get('q') ?? '');
  protected readonly filtered = computed(() => this.type() !== null || this.q() !== '');

  protected readonly loadingMore = signal(false);
  protected readonly data = signal<CaseList | null>(null);
  protected readonly error = signal(false);
  protected readonly items = computed(() => this.data()?.items ?? []);

  private readonly permissions = computed(() => this.org.currentOrg()?.permissions ?? []);

  protected readonly typeChips = computed<CaseType[]>(() => {
    const perms = this.permissions();
    return CASE_TYPES.filter((t) => {
      if (t === 'intake') {
        return hasAnyPermission(perms, 'deviations:intake');
      }
      if (t === 'feedback') {
        return this.modules.isEnabled('feedback') && hasAnyPermission(perms, 'feedback:read');
      }
      return true;
    });
  });

  protected readonly moduleLinks = computed(() => {
    const perms = this.permissions();
    if (!this.modules.isEnabled('deviations') || !hasAnyPermission(perms, 'deviations:read')) {
      return [];
    }
    const intakeOpen = this.data()?.intake_open ?? null;
    const links: { path: string; key: string; count: number | null }[] = [
      { path: '/deviations/actions', key: 'speakup.cases.links.actions', count: null },
      { path: '/deviations/stats', key: 'speakup.cases.links.stats', count: null },
    ];
    if (hasAnyPermission(perms, 'deviations:intake')) {
      links.push({
        path: '/deviations/intake',
        key: intakeOpen ? 'speakup.cases.links.intakeCount' : 'speakup.cases.links.intake',
        count: intakeOpen,
      });
    }
    links.push({ path: '/deviations/all', key: 'speakup.cases.links.advanced', count: null });
    return links;
  });

  constructor() {
    effect(() => {
      const orgId = this.org.currentOrgId();
      const query = this.currentQuery();
      if (orgId) {
        untracked(() => this.load(orgId, query));
      }
    });
  }

  private currentQuery(offset = 0): Parameters<SpeakUpApi['cases']>[1] {
    return {
      tab: this.tab(),
      type: this.type(),
      q: this.q() || null,
      limit: PAGE,
      offset,
      lang: this.language.active(),
    };
  }

  private load(orgId: string, query: Parameters<SpeakUpApi['cases']>[1]): void {
    this.error.set(false);
    this.api.cases(orgId, query).subscribe({
      next: (list) => this.data.set(list),
      error: () => this.error.set(true),
    });
  }

  protected reload(): void {
    this.data.set(null);
    const orgId = this.org.currentOrgId();
    if (orgId) {
      this.load(orgId, this.currentQuery());
    }
  }

  protected go(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** "Vis flere": append the next page (the API caps `limit`, so page by `offset`). */
  protected more(): void {
    const orgId = this.org.currentOrgId();
    const current = this.data();
    if (!orgId || !current || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.api.cases(orgId, this.currentQuery(current.items.length)).subscribe({
      next: (next) => {
        this.loadingMore.set(false);
        this.data.set({ ...next, items: [...current.items, ...next.items] });
      },
      error: () => {
        this.loadingMore.set(false);
        this.error.set(true);
      },
    });
  }

  protected count(tab: CaseTab): number {
    return this.data()?.counts[tab] ?? 0;
  }

  protected chipClass(on: boolean): string {
    return on
      ? 'border-accent bg-accent-soft text-accent'
      : 'border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg';
  }

  protected badgeTone(tone: CaseTone): BadgeTone {
    return TONES[tone] ?? 'neutral';
  }

  protected sub(item: CaseItem): string {
    return [item.code, item.type_label, item.reporter_name].filter(Boolean).join(' · ');
  }

  protected dueOf(item: CaseItem): DueCell | null {
    return dueCell(item, this.language.locale());
  }

  protected open(item: CaseItem): void {
    void this.router.navigateByUrl(item.url);
  }
}
