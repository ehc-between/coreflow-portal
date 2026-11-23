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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { ContractsApi } from '../contracts/data/contracts-api';
import { ContractListItem } from '../contracts/data/contract.models';
import { CustomersApi } from '../customers/data/customers-api';
import { ContactQuery, ContactsApi } from './data/contacts-api';
import {
  badgeTone,
  Phrase,
  formatOrgNumber,
  nextIsPill,
  nextPhrase,
  parseTab,
  roleOfTab,
  shortDate,
} from './data/contacts-format';
import {
  CONTACT_TABS,
  ContactCounts,
  ContactList,
  ContactRow,
  ContactTab,
} from './data/contacts.models';

type Load = 'loading' | 'ready' | 'error';

interface RegisterLink {
  readonly key: string;
  readonly link: string;
}

/** A create target of "+ Ny kontakt" (module + write permission). */
const CREATE = [
  { key: 'customer', link: '/customers/new', module: 'customers', perm: 'customers:write' },
  { key: 'supplier', link: '/suppliers/new', module: 'suppliers', perm: 'suppliers:write' },
  { key: 'processor', link: '/privacy/processors/new', module: 'privacy', perm: 'privacy:write' },
  { key: 'agreement', link: '/contracts/new', module: 'contracts', perm: 'contracts:write' },
] as const;

/** Tab -> count key of the API's `counts`. */
const COUNT_OF: Record<ContactTab, keyof ContactCounts> = {
  all: 'all',
  customers: 'customer',
  suppliers: 'supplier',
  processors: 'processor',
  agreements: 'agreements',
};

/**
 * Kontakter (`/contacts`, IA v2 §5.7 and the approved prototype): one list of the
 * companies across the customer, supplier and processor registers, with their roles
 * as chips, a status pill and the one next thing to do; tabs per role plus Avtaler (the
 * contracts). Each tab links to the full module register, which stays where it is.
 */
@Component({
  selector: 'app-contacts-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    EmptyState,
    ErrorState,
    LoadingState,
    MenuItem,
    OverflowMenu,
    PageHeader,
  ],
  viewProviders: [provideSharedScope('contacts')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7" data-testid="contacts-page">
      <app-page-header titleKey="contacts.title" descriptionKey="contacts.intro">
        @if (duplicates() > 0) {
          <a
            secondary
            routerLink="/customers/matches"
            data-testid="contacts-duplicates"
            class="inline-flex h-9 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2"
          >
            {{ 'contacts.duplicates' | transloco }} ({{ duplicates() }})
          </a>
        }
        @if (creates().length) {
          <div primary class="w-auto" data-testid="contacts-new">
            <app-overflow-menu
              variant="primary"
              [label]="'contacts.new.label' | transloco"
              icon="plus"
            >
              @for (c of creates(); track c.key) {
                <a appMenuItem [routerLink]="c.link" [attr.data-testid]="'contacts-new-' + c.key">
                  {{ 'contacts.new.' + c.key | transloco }}
                </a>
              }
            </app-overflow-menu>
          </div>
        }
      </app-page-header>

      <div
        class="mb-4 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
        role="tablist"
        [attr.aria-label]="'contacts.tabs.label' | transloco"
      >
        @for (t of tabs(); track t) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === t"
            [attr.data-testid]="'contacts-tab-' + t"
            (click)="setTab(t)"
            class="-mb-px border-b-2 px-3.5 py-2.5 text-ui font-semibold whitespace-nowrap transition-colors"
            [class]="
              tab() === t
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            "
          >
            {{ 'contacts.tabs.' + t | transloco }}
            @if (counts(); as c) {
              ({{ c[countOf[t]] }})
            }
          </button>
        }
      </div>

      <div class="mb-4 max-w-sm">
        <label class="sr-only" for="cf-contacts-q">{{ 'contacts.search.label' | transloco }}</label>
        <input
          id="cf-contacts-q"
          type="search"
          data-testid="contacts-search"
          [value]="qInput()"
          (input)="onSearch($any($event.target).value)"
          [placeholder]="'contacts.search.placeholder' | transloco"
          class="h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg placeholder:text-fg-placeholder focus:border-accent focus:outline-none"
        />
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state bodyKey="contacts.error" (retry)="reload()" />
        }
        @default {
          @if (tab() === 'agreements') {
            @if (contracts().length) {
              <div
                class="hidden overflow-x-auto rounded-card border border-border bg-surface sm:block"
              >
                <table class="w-full border-collapse" data-testid="contacts-agreements">
                  <thead>
                    <tr>
                      @for (h of agreementColumns; track h) {
                        <th
                          class="border-b border-border px-4 py-3 text-left text-micro font-semibold tracking-wider text-fg-subtle uppercase"
                        >
                          {{ 'contacts.columns.' + h | transloco }}
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of contracts(); track c.id) {
                      <tr
                        class="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2"
                        (click)="open('/contracts/' + c.id)"
                      >
                        <td class="px-4 py-3.5">
                          <a
                            [routerLink]="['/contracts', c.id]"
                            class="font-semibold text-fg hover:underline"
                            (click)="$event.stopPropagation()"
                            >{{ c.title }}</a
                          >
                          <span class="block text-meta text-fg-muted">{{ c.code }}</span>
                        </td>
                        <td class="px-4 py-3.5 text-ui text-fg">
                          {{
                            c.counterparties.join(', ') ||
                              ('contacts.agreements.counterpartyNone' | transloco)
                          }}
                        </td>
                        <td class="px-4 py-3.5 text-ui text-fg-muted">
                          {{ 'contacts.contractType.' + c.contract_type | transloco }}
                        </td>
                        <td class="px-4 py-3.5 text-ui">
                          @if (deadline(c); as d) {
                            @if (d.soon) {
                              <app-badge tone="warn">{{ d.key | transloco: d.params }}</app-badge>
                            } @else {
                              <span class="text-fg-muted">{{ d.key | transloco: d.params }}</span>
                            }
                          }
                        </td>
                        <td class="px-4 py-3.5">
                          <app-badge [tone]="contractTone(c)">{{
                            'contacts.contractStatus.' + c.status | transloco
                          }}</app-badge>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <ul class="flex flex-col gap-2 sm:hidden">
                @for (c of contracts(); track c.id) {
                  <li>
                    <a
                      [routerLink]="['/contracts', c.id]"
                      class="block rounded-tile border border-border bg-surface px-4 py-3 hover:bg-surface-2"
                    >
                      <span class="block font-semibold text-fg">{{ c.title }}</span>
                      <span class="block text-meta text-fg-muted">
                        {{ 'contacts.contractType.' + c.contract_type | transloco }}
                        @if (deadline(c); as d) {
                          · {{ d.key | transloco: d.params }}
                        }
                      </span>
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <app-empty-state
                [kind]="q() ? 'filtered' : 'first'"
                [titleKey]="q() ? 'contacts.empty.filtered' : 'contacts.agreements.empty'"
              />
            }
          } @else if (rows().length) {
            <div
              class="hidden overflow-x-auto rounded-card border border-border bg-surface sm:block"
            >
              <table class="w-full border-collapse" data-testid="contacts-table">
                <thead>
                  <tr>
                    @for (h of companyColumns; track h) {
                      <th
                        class="border-b border-border px-4 py-3 text-left text-micro font-semibold tracking-wider text-fg-subtle uppercase"
                      >
                        {{ 'contacts.columns.' + h | transloco }}
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.key) {
                    <tr
                      class="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2"
                      [attr.data-testid]="'contact-row-' + row.key"
                      (click)="open('/contacts/' + row.key)"
                    >
                      <td class="px-4 py-3.5">
                        <a
                          [routerLink]="['/contacts', row.key]"
                          class="font-semibold text-fg hover:underline"
                          (click)="$event.stopPropagation()"
                          >{{ row.name }}</a
                        >
                        @if (subLine(row); as s) {
                          <span class="block text-meta text-fg-muted">{{
                            s.key | transloco: s.params
                          }}</span>
                        }
                      </td>
                      <td class="px-4 py-3.5">
                        <div class="flex flex-wrap gap-1.5">
                          @for (r of row.roles; track r) {
                            <app-badge>{{ 'contacts.roles.' + r | transloco }}</app-badge>
                          }
                        </div>
                      </td>
                      <td class="px-4 py-3.5">
                        <app-badge [tone]="tone(row.status.tone)">{{
                          'contacts.status.' + row.status.key | transloco
                        }}</app-badge>
                      </td>
                      <td class="px-4 py-3.5 text-ui">
                        @if (next(row); as n) {
                          @if (pill(row)) {
                            <app-badge [tone]="tone(row.next?.tone)">{{
                              n.key | transloco: n.params
                            }}</app-badge>
                          } @else {
                            <span class="text-fg-muted">{{ n.key | transloco: n.params }}</span>
                          }
                        } @else {
                          <span class="text-fg-subtle">{{ 'contacts.next.none' | transloco }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ul class="flex flex-col gap-2 sm:hidden" data-testid="contacts-list-mobile">
              @for (row of rows(); track row.key) {
                <li>
                  <a
                    [routerLink]="['/contacts', row.key]"
                    class="block rounded-tile border border-border bg-surface px-4 py-3 hover:bg-surface-2"
                  >
                    <span class="flex items-start justify-between gap-2">
                      <span class="min-w-0 font-semibold text-fg [overflow-wrap:anywhere]">{{
                        row.name
                      }}</span>
                      <app-badge [tone]="tone(row.status.tone)">{{
                        'contacts.status.' + row.status.key | transloco
                      }}</app-badge>
                    </span>
                    @if (subLine(row); as s) {
                      <span class="block text-meta text-fg-muted">{{
                        s.key | transloco: s.params
                      }}</span>
                    }
                    <span class="mt-1.5 flex flex-wrap gap-1.5">
                      @for (r of row.roles; track r) {
                        <app-badge>{{ 'contacts.roles.' + r | transloco }}</app-badge>
                      }
                    </span>
                    @if (next(row); as n) {
                      <span
                        class="mt-1.5 block text-meta font-semibold"
                        [class]="pill(row) ? 'text-warn-ink' : 'text-fg-muted'"
                        >{{ n.key | transloco: n.params }}</span
                      >
                    }
                  </a>
                </li>
              }
            </ul>
          } @else if (noAccess()) {
            <app-empty-state kind="first" titleKey="contacts.empty.noAccess" />
          } @else if (q()) {
            <app-empty-state kind="filtered" titleKey="contacts.empty.filtered" />
          } @else {
            <app-empty-state
              kind="first"
              titleKey="contacts.empty.title"
              bodyKey="contacts.empty.body"
            />
          }
        }
      }

      @if (registerLinks().length) {
        <nav
          class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-ui"
          [attr.aria-label]="'contacts.registers.label' | transloco"
          data-testid="contacts-registers"
        >
          @for (l of registerLinks(); track l.key) {
            <a [routerLink]="l.link" class="font-semibold text-accent hover:underline"
              >{{ 'contacts.registers.' + l.key | transloco }} <span aria-hidden="true">→</span></a
            >
          }
        </nav>
      }
    </div>
  `,
})
export class ContactsPage {
  private readonly api = inject(ContactsApi);
  private readonly contractsApi = inject(ContractsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly org = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly countOf = COUNT_OF;
  protected readonly companyColumns = ['name', 'role', 'status', 'next'] as const;
  protected readonly agreementColumns = [
    'agreement',
    'party',
    'type',
    'deadline',
    'status',
  ] as const;

  protected readonly tab = toSignal(
    this.route.queryParamMap.pipe(map((p) => parseTab(p.get('tab')))),
    { initialValue: parseTab(this.route.snapshot.queryParamMap.get('tab')) },
  );
  protected readonly qInput = signal('');
  protected readonly q = signal('');
  protected readonly state = signal<Load>('loading');
  private readonly data = signal<ContactList | null>(null);
  protected readonly contracts = signal<readonly ContractListItem[]>([]);
  protected readonly duplicates = signal(0);

  protected readonly rows = computed(() => this.data()?.items ?? []);
  protected readonly counts = computed(() => this.data()?.counts ?? null);
  protected readonly noAccess = computed(() => {
    const d = this.data();
    return !!d && d.roles.length === 0;
  });
  /** Tabs of roles the caller can see (plus Alle; Avtaler when contracts are readable). */
  protected readonly tabs = computed<readonly ContactTab[]>(() => {
    const d = this.data();
    if (!d) {
      return CONTACT_TABS;
    }
    return CONTACT_TABS.filter((t) => {
      if (t === 'all') {
        return true;
      }
      if (t === 'agreements') {
        return d.agreements_enabled;
      }
      const role = roleOfTab(t);
      return role !== null && d.roles.includes(role);
    });
  });

  private readonly permissions = computed(() => this.org.currentOrg()?.permissions ?? []);
  protected readonly creates = computed(() => {
    const perms = this.permissions();
    return CREATE.filter((c) => perms.includes(c.perm) && this.modules.isEnabled(c.module));
  });

  protected readonly registerLinks = computed<readonly RegisterLink[]>(() => {
    const d = this.data();
    const roles = d?.roles ?? [];
    const out: RegisterLink[] = [];
    const tab = this.tab();
    const customers = roles.includes('customer');
    const suppliers = roles.includes('supplier');
    const processors = roles.includes('processor');
    if ((tab === 'all' || tab === 'customers') && customers) {
      out.push({ key: 'customers', link: '/customers' });
    }
    if (tab === 'customers' && this.modules.isEnabled('feedback')) {
      out.push({ key: 'surveys', link: '/feedback' });
    }
    if ((tab === 'all' || tab === 'suppliers') && suppliers) {
      out.push({ key: 'suppliers', link: '/suppliers' });
    }
    if (tab === 'suppliers' && suppliers) {
      out.push({ key: 'evaluations', link: '/suppliers/evaluations' });
    }
    if ((tab === 'all' || tab === 'processors') && processors) {
      out.push({ key: 'processors', link: '/privacy/processors' });
    }
    if (tab === 'agreements' && d?.agreements_enabled) {
      out.push(
        { key: 'contracts', link: '/contracts' },
        { key: 'deadlines', link: '/contracts/deadlines' },
      );
    }
    return out;
  });

  private sub?: Subscription;
  private contractsSub?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const orgId = this.org.currentOrgId();
      const tab = this.tab();
      const q = this.q();
      untracked(() => this.load(orgId, tab, q));
    });
    effect(() => {
      const orgId = this.org.currentOrgId();
      const canMerge = this.permissions().includes('customers:write');
      untracked(() => this.loadDuplicates(orgId, canMerge));
    });
    this.destroyRef.onDestroy(() => {
      this.sub?.unsubscribe();
      this.contractsSub?.unsubscribe();
      clearTimeout(this.searchTimer);
    });
  }

  protected reload(): void {
    this.load(this.org.currentOrgId(), this.tab(), this.q());
  }

  protected setTab(tab: ContactTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'all' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onSearch(value: string): void {
    this.qInput.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.q.set(value.trim()), 250);
  }

  protected open(link: string): void {
    void this.router.navigateByUrl(link);
  }

  protected tone = badgeTone;

  /** The grey line under the name: org number and/or place. */
  protected subLine(row: ContactRow): Phrase | null {
    const place = this.place(row);
    const number = row.org_number ? formatOrgNumber(row.org_number) : null;
    if (number && place) {
      return { key: 'contacts.orgNumberPlace', params: { number, place } };
    }
    if (number) {
      return { key: 'contacts.orgNumber', params: { number } };
    }
    return place ? { key: 'contacts.plain', params: { text: place } } : null;
  }

  /** The place (customer city), or the country when it is abroad and nothing else is known. */
  protected place(row: ContactRow): string | null {
    if (row.place) {
      return row.place;
    }
    return !row.org_number && row.country && row.country !== 'NO'
      ? this.countryName(row.country)
      : null;
  }

  protected next(row: ContactRow) {
    return nextPhrase(row.next, this.language.locale());
  }

  protected pill(row: ContactRow): boolean {
    return nextIsPill(row.next);
  }

  protected deadline(c: ContractListItem) {
    const locale = this.language.locale();
    if (c.notice_deadline && (c.notice_due_in_days ?? -1) >= 0) {
      return {
        key: 'contacts.agreements.notice',
        params: { date: shortDate(c.notice_deadline, locale) },
        soon: (c.notice_due_in_days ?? 999) <= 30,
      };
    }
    if (c.end_date) {
      return {
        key: 'contacts.agreements.renews',
        params: { date: shortDate(c.end_date, locale) },
        soon: false,
      };
    }
    return { key: 'contacts.agreements.noDate', params: {}, soon: false };
  }

  protected contractTone(c: ContractListItem) {
    switch (c.status) {
      case 'active':
      case 'approved':
        return 'pass' as const;
      case 'in_review':
      case 'draft':
        return 'warn' as const;
      case 'expired':
        return 'fail' as const;
      default:
        return 'neutral' as const;
    }
  }

  private countryName(code: string): string {
    try {
      return (
        new Intl.DisplayNames([this.language.locale()], { type: 'region' }).of(
          code.toUpperCase(),
        ) ?? code
      );
    } catch {
      return code;
    }
  }

  private load(orgId: string | null, tab: ContactTab, q: string): void {
    this.sub?.unsubscribe();
    this.contractsSub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    const role = roleOfTab(tab) ?? 'all';
    const companies: ContactQuery =
      tab === 'agreements' ? { role: 'all', limit: 1 } : { role, q, limit: 200 };
    this.sub = this.api.list(orgId, companies).subscribe({
      next: (list) => {
        this.data.set(list);
        if (tab !== 'agreements') {
          this.state.set('ready');
          return;
        }
        if (!list.agreements_enabled) {
          this.contracts.set([]);
          this.state.set('ready');
          return;
        }
        this.contractsSub = this.contractsApi
          .list(orgId, { q: q || undefined, limit: 200 })
          .subscribe({
            next: (page) => {
              this.contracts.set(page.items);
              this.state.set('ready');
            },
            error: () => this.state.set('error'),
          });
      },
      error: () => this.state.set('error'),
    });
  }

  private loadDuplicates(orgId: string | null, canMerge: boolean): void {
    this.duplicates.set(0);
    if (!orgId || !canMerge || !this.modules.isEnabled('customers')) {
      return;
    }
    this.customersApi.summary(orgId).subscribe({
      next: (s) => this.duplicates.set(s.pending_matches ?? 0),
      error: () => this.duplicates.set(0),
    });
  }
}
