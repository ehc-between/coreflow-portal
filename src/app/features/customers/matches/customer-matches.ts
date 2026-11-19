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
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { CustomerChip } from '../../../shared/customers/customer-chip';
import { CustomerPicker } from '../../../shared/customers/customer-picker';
import { CUSTOMERS_MANAGE } from '../../../shared/customers/customer.models';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { customerErrorKey, matchReasonKey } from '../data/customer-display';
import { MatchAction, MatchGroup, MatchOut, ScanResult } from '../data/customer.models';
import { CustomersApi } from '../data/customers-api';

/** Case- and space-folded text: mentions that read the same are decided together. */
export function foldText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ids of the pending matches whose text reads the same as `match` (itself included). */
export function sameTextIds(groups: readonly MatchGroup[], match: MatchOut): string[] {
  const key = foldText(match.source_text);
  return groups
    .flatMap((g) => g.items)
    .filter((m) => foldText(m.source_text) === key)
    .map((m) => m.id);
}

/**
 * "Gjennomgå kundetreff" (`/customers/matches`, docs/customer-register-design.md
 * §3.1, §6): customer names found in existing records that could not be linked
 * for certain, grouped per proposed customer. Each row says where the text was
 * found and why it was not linked, with **Koble til** · **Opprett ny kunde** ·
 * **Ikke en kunde** and "Koble til en annen kunde…". Rows can be selected for a
 * bulk decision; identical texts can be decided together. `customers:manage`
 * can run the scan again.
 */
@Component({
  selector: 'app-customer-matches',
  imports: [
    TranslocoPipe,
    CustomerChip,
    CustomerPicker,
    EntityChip,
    Alert,
    Button,
    Card,
    EmptyState,
    ErrorState,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="customers.matches.title"
        descriptionKey="customers.matches.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.customers', link: '/customers' },
          { labelKey: 'customers.matches.title' },
        ]"
        backLink="/customers"
        backLabelKey="customers.common.backToRegister"
      >
        @if (canManage()) {
          <app-button primary [loading]="scanning()" (click)="scan()" data-testid="matches-scan">
            {{ 'customers.scan.again' | transloco }}
          </app-button>
        }
      </app-page-header>

      @if (scanResult(); as r) {
        <div class="mb-4">
          <app-alert tone="success" data-testid="scan-result">{{
            'customers.scan.result'
              | transloco: { created: r.created, linked: r.linked, pending: r.pending }
          }}</app-alert>
        </div>
      }

      @if (selected().size > 0) {
        <div
          class="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-border bg-surface px-3 py-2 shadow-card"
          role="region"
          [attr.aria-label]="'customers.matches.bulk.label' | transloco"
          data-testid="bulk-bar"
        >
          <span class="text-ui font-semibold text-fg">{{
            'customers.matches.bulk.selected' | transloco: { count: selected().size }
          }}</span>
          <app-button
            size="sm"
            [disabled]="busy()"
            (click)="bulk('accept')"
            data-testid="bulk-accept"
          >
            {{ 'customers.matches.accept' | transloco }}
          </app-button>
          <app-button size="sm" variant="secondary" [disabled]="busy()" (click)="bulk('create')">
            {{ 'customers.matches.create' | transloco }}
          </app-button>
          <app-button size="sm" variant="secondary" [disabled]="busy()" (click)="bulk('dismiss')">
            {{ 'customers.matches.dismiss' | transloco }}
          </app-button>
          <button
            type="button"
            class="ml-auto text-meta font-semibold text-fg-muted hover:text-fg"
            (click)="clearSelection()"
          >
            {{ 'customers.matches.bulk.clear' | transloco }}
          </button>
        </div>
      }

      @switch (state()) {
        @case ('loading') {
          <app-card><app-loading-state [rows]="4" /></app-card>
        }
        @case ('error') {
          <app-card><app-error-state (retry)="reload()" /></app-card>
        }
        @default {
          @if (groups().length === 0) {
            <app-card>
              <app-empty-state
                icon="check"
                titleKey="customers.matches.emptyTitle"
                bodyKey="customers.matches.emptyBody"
                data-testid="matches-empty"
              />
            </app-card>
          } @else {
            <div class="flex flex-col gap-4" data-testid="match-groups">
              @for (group of groups(); track groupKey(group)) {
                <app-card [padded]="false">
                  <div class="flex flex-wrap items-baseline gap-2 border-b border-border px-4 py-3">
                    @if (group.proposed; as p) {
                      <span class="text-meta font-semibold text-fg-muted">{{
                        'customers.matches.proposed' | transloco
                      }}</span>
                      <app-customer-chip [ref]="p" />
                      <span class="font-mono text-meta text-fg-subtle">{{ p.code }}</span>
                    } @else {
                      <span class="text-meta font-semibold text-fg-muted">{{
                        'customers.matches.proposedNew' | transloco: { name: group.proposed_name }
                      }}</span>
                    }
                  </div>
                  <ul class="divide-y divide-border">
                    @for (m of group.items; track m.id) {
                      <li class="flex flex-col gap-2 px-4 py-3" data-testid="match-row">
                        <div class="flex flex-wrap items-start gap-3">
                          <input
                            type="checkbox"
                            class="mt-1"
                            [checked]="selected().has(m.id)"
                            (change)="toggle(m.id, $any($event.target).checked)"
                            [attr.aria-label]="
                              'customers.matches.select' | transloco: { text: m.source_text }
                            "
                          />
                          <div class="min-w-0 flex-1">
                            <p class="text-ui text-fg">
                              <span class="font-semibold">«{{ m.source_text }}»</span>
                              @if (m.source_org_number) {
                                <span class="ml-1 font-mono text-meta text-fg-subtle">{{
                                  m.source_org_number
                                }}</span>
                              }
                            </p>
                            <p
                              class="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-meta text-fg-muted"
                            >
                              <span>{{ 'customers.matches.foundIn' | transloco }}</span>
                              @if (m.entity; as e) {
                                <app-entity-chip [ref]="e" />
                              } @else {
                                <span>{{ 'customers.matches.hiddenRecord' | transloco }}</span>
                              }
                              <span aria-hidden="true">·</span>
                              <span data-testid="match-reason">{{
                                reasonKey(m.reason) | transloco
                              }}</span>
                            </p>
                          </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 pl-7">
                          @if (group.proposed) {
                            <app-button
                              size="sm"
                              [disabled]="busy()"
                              (click)="decide(m, 'accept')"
                              data-testid="match-accept"
                            >
                              {{ 'customers.matches.accept' | transloco }}
                            </app-button>
                          }
                          <app-button
                            size="sm"
                            variant="secondary"
                            [disabled]="busy()"
                            (click)="decide(m, 'create')"
                            data-testid="match-create"
                          >
                            {{ 'customers.matches.create' | transloco }}
                          </app-button>
                          <app-button
                            size="sm"
                            variant="secondary"
                            [disabled]="busy()"
                            (click)="decide(m, 'dismiss')"
                            data-testid="match-dismiss"
                          >
                            {{ 'customers.matches.dismiss' | transloco }}
                          </app-button>
                          <button
                            type="button"
                            class="text-meta font-semibold text-accent hover:underline"
                            [attr.aria-expanded]="otherFor() === m.id"
                            (click)="otherFor.set(otherFor() === m.id ? null : m.id)"
                            data-testid="match-other"
                          >
                            {{ 'customers.matches.other' | transloco }}
                          </button>
                          @if (sameCount(m); as n) {
                            @if (n > 1) {
                              <label class="flex items-center gap-1.5 text-meta text-fg-muted">
                                <input
                                  type="checkbox"
                                  [checked]="applySame()"
                                  (change)="applySame.set($any($event.target).checked)"
                                  data-testid="match-same"
                                />
                                {{ 'customers.matches.applySame' | transloco: { count: n } }}
                              </label>
                            }
                          }
                        </div>
                        @if (otherFor() === m.id) {
                          <div class="max-w-md pl-7" data-testid="match-other-picker">
                            <app-customer-picker
                              [required]="true"
                              [ariaLabel]="'customers.matches.other' | transloco"
                              (valueChange)="acceptOther(m, $event)"
                            />
                          </div>
                        }
                      </li>
                    }
                  </ul>
                </app-card>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class CustomerMatches {
  private readonly api = inject(CustomersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly reasonKey = matchReasonKey;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly groups = signal<readonly MatchGroup[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly scanning = signal(false);
  protected readonly scanResult = signal<ScanResult | null>(null);
  protected readonly otherFor = signal<string | null>(null);
  /** "Bruk samme valg for N like treff" (on by default). */
  protected readonly applySame = signal(true);
  private readonly reloads = signal(0);

  protected readonly canManage = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes(CUSTOMERS_MANAGE),
  );

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    providePageContext(() => ({
      module: 'customers',
      view: 'list',
      title: this.language.translate('customers.matches.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloads();
      untracked(() => this.load(orgId));
    });
  }

  protected groupKey(group: MatchGroup): string {
    return group.proposed?.id ?? `new:${group.proposed_name}`;
  }

  protected sameCount(m: MatchOut): number {
    return sameTextIds(this.groups(), m).length;
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected toggle(id: string, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selected.set(next);
  }

  protected decide(m: MatchOut, action: MatchAction): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const same = this.applySame() ? sameTextIds(this.groups(), m) : [m.id];
    // A new customer is created once; the other mentions then propose it (server side).
    if (action === 'create' || same.length <= 1) {
      const request =
        action === 'accept'
          ? this.api.accept(orgId, m.id)
          : action === 'create'
            ? this.api.createFromMatch(orgId, m.id)
            : this.api.dismiss(orgId, m.id);
      this.run(request, `customers.matches.done.${action}`, 1);
      return;
    }
    this.run(this.api.bulk(orgId, same, action), `customers.matches.done.${action}`, same.length);
  }

  protected acceptOther(m: MatchOut, customerId: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !customerId || this.busy()) {
      return;
    }
    this.otherFor.set(null);
    this.run(this.api.accept(orgId, m.id, customerId), 'customers.matches.done.accept', 1);
  }

  protected bulk(action: MatchAction): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ids = [...this.selected()];
    if (!orgId || !ids.length || this.busy()) {
      return;
    }
    this.run(this.api.bulk(orgId, ids, action), `customers.matches.done.${action}`, ids.length);
  }

  protected scan(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.scanning()) {
      return;
    }
    this.scanning.set(true);
    this.api.scan(orgId).subscribe({
      next: (r) => {
        this.scanning.set(false);
        this.scanResult.set({
          created: r.created ?? 0,
          linked: r.linked ?? 0,
          pending: r.pending ?? 0,
        });
        this.reload();
      },
      error: (err: unknown) => {
        this.scanning.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  private run(request: Observable<unknown>, successKey: string, count: number): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.selected.set(new Set());
        this.notifications.success(successKey, { count });
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }

  private load(orgId: string | null): void {
    this.sub.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.groups().length) {
      this.state.set('loading');
    }
    this.sub = this.api.matches(orgId).subscribe({
      next: (groups) => {
        this.groups.set(groups.filter((g) => g.items?.length));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
