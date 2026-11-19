import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { CountryNamePipe } from '../../../shared/locale/countries';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { dpaBadge } from '../data/supplier-display';
import { SupplierAgreements, SupplierDetail } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';

/** A "create from here" action of the card, shown when the user may create the target. */
interface FlowAction {
  readonly key: string;
  readonly labelKey: string;
  readonly permission: string;
  readonly primary?: boolean;
}

/** The icon of each group of the hub (the module's icon, so a connection reads at a glance). */
export const GROUP_ICONS: Readonly<Record<string, string>> = {
  contracts: 'contract',
  processors: 'shield',
  transfers: 'send',
  ai_systems: 'spark',
  assets: 'devices',
  risks: 'risk',
  deviations: 'alert',
};

/** The simple record groups of the hub, in display order. */
const RECORD_GROUPS = ['ai_systems', 'assets', 'risks', 'deviations'] as const;
type RecordGroup = (typeof RECORD_GROUPS)[number];

/** Whether the hub has nothing linked at all. */
export function hubIsEmpty(a: SupplierAgreements): boolean {
  return (
    a.contracts.length +
      a.processors.length +
      a.transfer_assessments.length +
      RECORD_GROUPS.reduce((n, g) => n + a[g].length, 0) ===
    0
  );
}

/**
 * "Avtaler og databehandling": the supplier as the hub of what the organisation has
 * agreed with it. DPA coverage (red when the supplier processes personal data without a
 * data processing agreement) and the transfer check for data outside the EU/EEA, each
 * with the action that closes the gap; the linked contracts (expiry, DPA), processor
 * entries, transfer assessments, AI systems, assets, risks and deviations; and records
 * that carry the supplier's name but are not linked yet, to link or dismiss in one click.
 */
@Component({
  selector: 'app-supplier-agreements',
  imports: [
    TranslocoPipe,
    CountryNamePipe,
    LocalDayPipe,
    Button,
    Card,
    EntityChip,
    ErrorState,
    Icon,
    LoadingState,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { id: 'supplier-agreements', class: 'block scroll-mt-24' },
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'suppliers.agreements.title' | transloco }}
        </h2>
        @if (data(); as a) {
          @if (a.dpa.required) {
            @let b = dpa(a.dpa.status);
            <app-status-badge
              [meaning]="b.meaning"
              [value]="b.value"
              [labelKey]="'suppliers.agreements.dpaStatus.' + a.dpa.status"
              data-testid="dpa-status"
            />
          }
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (data(); as a) {
            @if (a.dpa.required && a.dpa.status !== 'covered') {
              <div
                class="mb-3 rounded-tile border px-3 py-2.5 text-ui"
                [class]="
                  a.dpa.status === 'missing'
                    ? 'border-fail bg-fail-soft text-fg'
                    : 'border-warn bg-warn-soft text-fg'
                "
                role="note"
                data-testid="dpa-gap"
              >
                <p class="font-semibold">
                  {{ 'suppliers.agreements.dpaGap.' + a.dpa.status + '.title' | transloco }}
                </p>
                <p class="mt-0.5 text-fg-muted">
                  {{ 'suppliers.agreements.dpaGap.' + a.dpa.status + '.body' | transloco }}
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  @for (f of dpaActions(); track f.key) {
                    <app-button
                      size="sm"
                      [variant]="f.primary ? 'primary' : 'secondary'"
                      [loading]="flows.starting() === f.key"
                      (click)="start(f.key)"
                    >
                      {{ f.labelKey | transloco }}
                    </app-button>
                  }
                </div>
              </div>
            }
            @if (a.transfer.required && !a.transfer.assessed) {
              <div
                class="mb-3 rounded-tile border border-warn bg-warn-soft px-3 py-2.5 text-ui text-fg"
                role="note"
                data-testid="transfer-gap"
              >
                <p class="font-semibold">{{ 'suppliers.detail.transferNeeded' | transloco }}</p>
                <p class="mt-0.5 text-fg-muted">
                  {{ 'suppliers.detail.transferNeededBody' | transloco }}
                </p>
                @if (can('privacy:write')) {
                  <div class="mt-2">
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="flows.starting() === 'supplier.to_transfer'"
                      (click)="start('supplier.to_transfer')"
                    >
                      {{ 'suppliers.agreements.actions.toTransfer' | transloco }}
                    </app-button>
                  </div>
                }
              </div>
            }

            @if (isEmpty()) {
              <p class="text-ui text-fg-muted" data-testid="agreements-empty">
                {{ 'suppliers.agreements.empty' | transloco }}
              </p>
            }

            @if (a.contracts.length) {
              <h3
                class="mt-1 mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-fg-muted"
              >
                <app-icon name="contract" [size]="13" />
                {{ 'suppliers.agreements.groups.contracts' | transloco }}
              </h3>
              <ul class="mb-3 flex flex-col gap-1.5" data-testid="hub-contracts">
                @for (c of a.contracts; track c.record.entity_id) {
                  <li class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <app-entity-chip [ref]="c.record" [showType]="false" [statusText]="true" />
                    @if (c.is_dpa) {
                      <span
                        class="rounded-full bg-accent-soft px-2 py-0.5 text-micro font-semibold text-accent"
                        >{{ 'suppliers.agreements.dpaTag' | transloco }}</span
                      >
                    }
                    <span
                      class="text-meta"
                      [class]="
                        c.expired || c.expiring ? 'font-semibold text-warn-ink' : 'text-fg-subtle'
                      "
                    >
                      @if (c.expired) {
                        {{ 'suppliers.agreements.expired' | transloco }}
                      } @else if (c.expiring && c.days_to_end !== null) {
                        {{ 'suppliers.agreements.expiresIn' | transloco: { days: c.days_to_end } }}
                      } @else if (c.end_date) {
                        {{
                          'suppliers.agreements.endsOn'
                            | transloco: { date: (c.end_date | localDay) }
                        }}
                      } @else {
                        {{ 'suppliers.agreements.noEndDate' | transloco }}
                      }
                    </span>
                  </li>
                }
              </ul>
            }

            @if (a.processors.length) {
              <h3
                class="mt-1 mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-fg-muted"
              >
                <app-icon name="shield" [size]="13" />
                {{ 'suppliers.agreements.groups.processors' | transloco }}
              </h3>
              <ul class="mb-3 flex flex-col gap-1.5">
                @for (p of a.processors; track p.record.entity_id) {
                  <li class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <app-entity-chip [ref]="p.record" [showType]="false" [statusText]="true" />
                    @if (p.dpa_status) {
                      <span class="text-meta text-fg-subtle">
                        {{ 'suppliers.agreements.processorDpa.' + p.dpa_status | transloco }}
                      </span>
                    }
                  </li>
                }
              </ul>
            }

            @if (a.transfer_assessments.length) {
              <h3
                class="mt-1 mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-fg-muted"
              >
                <app-icon name="send" [size]="13" />
                {{ 'suppliers.agreements.groups.transfers' | transloco }}
              </h3>
              <ul class="mb-3 flex flex-col gap-1.5">
                @for (t of a.transfer_assessments; track t.record.entity_id) {
                  <li class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <app-entity-chip [ref]="t.record" [showType]="false" [statusText]="true" />
                    @if (t.destination_country) {
                      <span class="text-meta text-fg-subtle">{{
                        t.destination_country | countryName
                      }}</span>
                    }
                  </li>
                }
              </ul>
            }

            @for (g of groups; track g) {
              @if (a[g].length) {
                <h3
                  class="mt-1 mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-fg-muted"
                >
                  <app-icon [name]="icons[g]" [size]="13" />
                  {{ 'suppliers.agreements.groups.' + g | transloco: { open: openCount(a, g) } }}
                </h3>
                <ul class="mb-3 flex flex-col gap-1.5" [attr.data-testid]="'hub-' + g">
                  @for (r of a[g]; track r.record.entity_id) {
                    <li>
                      <app-entity-chip [ref]="r.record" [showType]="false" [statusText]="true" />
                    </li>
                  }
                </ul>
              }
            }

            @if (a.suggestions.length && canEdit()) {
              <div class="mt-2 rounded-tile border border-dashed border-border-strong p-3">
                <p class="text-ui font-semibold text-fg">
                  {{ 'suppliers.agreements.suggestionsTitle' | transloco }}
                </p>
                <p class="mb-2 text-meta text-fg-muted">
                  {{
                    'suppliers.agreements.suggestionsHint' | transloco: { name: supplier().name }
                  }}
                </p>
                <ul class="flex flex-col gap-2" data-testid="hub-suggestions">
                  @for (s of a.suggestions; track s.id) {
                    <li class="flex flex-wrap items-center gap-2">
                      <app-entity-chip [ref]="s.record" />
                      <span class="ml-auto flex gap-1.5">
                        <app-button
                          size="sm"
                          variant="secondary"
                          [loading]="deciding() === s.id"
                          (click)="decide(s.id, true)"
                        >
                          {{ 'suppliers.agreements.link' | transloco }}
                        </app-button>
                        <app-button
                          size="sm"
                          variant="ghost"
                          [disabled]="deciding() === s.id"
                          (click)="decide(s.id, false)"
                        >
                          {{ 'suppliers.agreements.dismiss' | transloco }}
                        </app-button>
                      </span>
                    </li>
                  }
                </ul>
              </div>
            }

            @if (moreActions().length) {
              <div class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                @for (f of moreActions(); track f.key) {
                  <app-button
                    size="sm"
                    variant="ghost"
                    [loading]="flows.starting() === f.key"
                    (click)="start(f.key)"
                  >
                    <app-icon name="plus" [size]="13" />
                    {{ f.labelKey | transloco }}
                  </app-button>
                }
              </div>
            }
          }
        }
      }
    </app-card>
  `,
})
export class SupplierAgreementsCard {
  private readonly api = inject(SuppliersApi);
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly flows = inject(CreateFlowService);

  readonly supplier = input.required<SupplierDetail>();
  readonly canEdit = input(false);
  /** A suggestion was linked (the page refreshes its flags and connections). */
  readonly changed = output<void>();

  protected readonly groups = RECORD_GROUPS;
  protected readonly icons = GROUP_ICONS;
  protected readonly dpa = dpaBadge;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<SupplierAgreements | null>(null);
  protected readonly deciding = signal<string | null>(null);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly isEmpty = computed(() => {
    const a = this.data();
    return !!a && hubIsEmpty(a);
  });

  /** What closes a DPA gap: create the agreement; register the processor if missing. */
  protected readonly dpaActions = computed<readonly FlowAction[]>(() => {
    const a = this.data();
    const out: FlowAction[] = [];
    if (!a || !this.canEdit()) {
      return out;
    }
    if (this.can('contracts:write')) {
      out.push({
        key: 'supplier.to_dpa',
        labelKey: 'suppliers.agreements.actions.toDpa',
        permission: 'contracts:write',
        primary: true,
      });
    }
    if (a.processors.length === 0 && this.can('privacy:write')) {
      out.push({
        key: 'supplier.to_processor',
        labelKey: 'suppliers.agreements.actions.toProcessor',
        permission: 'privacy:write',
      });
    }
    return out;
  });

  /** The other records one creates from a supplier. */
  protected readonly moreActions = computed<readonly FlowAction[]>(() => {
    if (!this.canEdit()) {
      return [];
    }
    const s = this.supplier();
    const a = this.data();
    const all: FlowAction[] = [
      {
        key: 'supplier.to_contract',
        labelKey: 'suppliers.agreements.actions.toContract',
        permission: 'contracts:write',
      },
      {
        key: 'supplier.to_risk',
        labelKey: 'suppliers.agreements.actions.toRisk',
        permission: 'risk:write',
      },
      {
        key: 'supplier.to_deviation',
        labelKey: 'suppliers.agreements.actions.toDeviation',
        permission: 'deviations:write',
      },
    ];
    if (s.processes_personal_data && a && a.processors.length === 0 && a.dpa.status === 'covered') {
      all.push({
        key: 'supplier.to_processor',
        labelKey: 'suppliers.agreements.actions.toProcessor',
        permission: 'privacy:write',
      });
    }
    return all.filter((f) => this.can(f.permission));
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      // Tracks the whole record, so the hub reloads when the supplier refreshes.
      const id = this.supplier().id;
      untracked(() => this.load(orgId, id));
    });
  }

  protected can(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  protected openCount(a: SupplierAgreements, group: RecordGroup): number {
    return group === 'risks' ? a.open_risks : group === 'deviations' ? a.open_deviations : 0;
  }

  protected start(key: string): void {
    void this.flows.start(key, 'supplier', this.supplier().id);
  }

  protected decide(id: string, accept: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.deciding()) {
      return;
    }
    this.deciding.set(id);
    const call = accept
      ? this.kit.acceptSuggestion(orgId, id)
      : this.kit.dismissSuggestion(orgId, id);
    call.subscribe({
      next: () => {
        this.deciding.set(null);
        if (accept) {
          this.notifications.success('suppliers.agreements.linked');
          this.changed.emit();
        }
        this.reload();
      },
      error: () => {
        this.deciding.set(null);
        this.notifications.error('suppliers.errors.generic');
      },
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.supplier().id);
  }

  private load(orgId: string | null, supplierId: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.data()) {
      this.state.set('loading');
    }
    this.request = this.api.agreements(orgId, supplierId).subscribe({
      next: (a) => {
        this.data.set(a);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
