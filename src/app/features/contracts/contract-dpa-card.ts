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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ContractsApi } from './data/contracts-api';
import { Contract, DpaCandidate } from './data/contract.models';
import {
  contractStatusKey,
  dpaComplianceValue,
  personalDataRoleKey,
  transferBasisKey,
} from './data/contract-display';
import { contractErrorKey } from './data/contract-errors';

/**
 * The data processing agreement card in the contract's aside (GDPR Art. 28).
 *
 * - Not needed (no personal data, or an NDA): one quiet line.
 * - On a DPA: which contracts it covers ("Covers: CT-0001"), its sub-processors and
 *   the transfer basis outside the EU/EEA.
 * - Needed but missing or incomplete: the reasons, the DPA contracts that match the
 *   counterparty (supplier record, organisation number or name) with one-click
 *   "Link", and "Create a data processing agreement" prefilled from this contract.
 */
@Component({
  selector: 'app-contract-dpa-card',
  imports: [RouterLink, TranslocoPipe, Button, Card, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = contract();
    @if (!c.dpa.required && !isDpa()) {
      <p
        class="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-meta text-fg-muted"
        data-testid="dpa-not-required"
      >
        <app-icon name="shield" [size]="14" />
        {{ 'contracts.dpa.notRequiredLine' | transloco }}
      </p>
    } @else {
      <app-card>
        <h2
          class="mb-2 flex flex-wrap items-center justify-between gap-2 text-ui font-semibold text-fg-subtle"
        >
          {{ (isDpa() ? 'contracts.dpa.thisIsDpa' : 'contracts.dpa.title') | transloco }}
          @if (!isDpa()) {
            <app-status-badge
              meaning="compliance"
              [value]="complianceValue(c.dpa.status)"
              [labelKey]="'contracts.dpa.status.' + c.dpa.status"
              data-testid="dpa-status"
            />
          }
        </h2>

        @if (role() !== 'none') {
          <p class="mb-2 text-meta text-fg-muted" data-testid="dpa-role">
            {{ roleKey(role()) | transloco }}
          </p>
        }

        @if (isDpa()) {
          <p class="text-meta font-semibold text-fg">{{ 'contracts.dpa.covers' | transloco }}</p>
          @if (c.dpa.covers?.length) {
            <ul class="mt-1 flex flex-col gap-1" data-testid="dpa-covers">
              @for (b of c.dpa.covers; track b.id) {
                <li class="text-ui">
                  <a
                    [routerLink]="['/contracts', b.id]"
                    class="font-semibold text-accent hover:underline"
                  >
                    <span class="font-mono">{{ b.code }}</span> {{ b.title }}
                  </a>
                  <span class="text-meta text-fg-subtle">
                    · {{ statusKey(b.status) | transloco }}</span
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="mt-1 text-meta text-fg-muted">{{ 'contracts.dpa.coversNone' | transloco }}</p>
          }
        } @else {
          <p class="text-meta text-fg-muted">
            {{ 'contracts.dpa.explain.' + c.dpa.status | transloco }}
          </p>
          @if (c.dpa.status === 'incomplete' && c.dpa.reasons?.length) {
            <ul class="mt-2 list-disc space-y-0.5 pl-5 text-meta text-fg" data-testid="dpa-reasons">
              @for (reason of c.dpa.reasons; track reason) {
                <li>
                  {{
                    'contracts.dpa.reasons.' + reason
                      | transloco
                        : {
                            missing: c.dpa.missing_clauses?.length ?? 0,
                            unconfirmed: c.dpa.unconfirmed_clauses?.length ?? 0,
                          }
                  }}
                </li>
              }
            </ul>
          }
          @if (linked().length) {
            <p class="mt-3 text-meta font-semibold text-fg">
              {{ 'contracts.dpa.linkedTitle' | transloco }}
            </p>
            <ul class="mt-1 flex flex-col gap-1" data-testid="dpa-linked">
              @for (d of linked(); track d.id) {
                <li class="text-ui">
                  <a
                    [routerLink]="['/contracts', d.id]"
                    class="font-semibold text-accent hover:underline"
                  >
                    <span class="font-mono">{{ d.code }}</span> {{ d.title }}
                  </a>
                </li>
              }
            </ul>
          }
        }

        @if (subProcessors().length) {
          <p class="mt-3 text-meta font-semibold text-fg">
            {{ 'contracts.dpa.subProcessors' | transloco }}
          </p>
          <p class="text-meta text-fg-muted" data-testid="dpa-sub-processors">
            {{ subProcessors().join(', ') }}
          </p>
        }
        @if (c.transfer_basis && c.transfer_basis !== 'none') {
          <p class="mt-3 text-meta text-fg-muted" data-testid="dpa-transfer">
            <span class="font-semibold text-fg">{{ 'contracts.dpa.transfer' | transloco }}</span>
            {{ basisKey(c.transfer_basis) | transloco }}
            @if (c.transfer_countries) {
              · {{ c.transfer_countries }}
            }
          </p>
        }

        @if (needsAgreement() && c.can_edit) {
          <div class="mt-3 border-t border-border pt-3" data-testid="dpa-candidates">
            @if (open().length) {
              <p class="mb-1.5 text-meta font-semibold text-fg">
                {{ 'contracts.dpa.candidatesTitle' | transloco }}
              </p>
              <ul class="flex flex-col gap-1.5">
                @for (d of open(); track d.id) {
                  <li class="flex items-start gap-2 rounded-tile bg-surface-2 px-2.5 py-2">
                    <span class="min-w-0 flex-1 text-ui">
                      <a
                        [routerLink]="['/contracts', d.id]"
                        class="block font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
                      >
                        <span class="font-mono">{{ d.code }}</span> {{ d.title }}
                      </a>
                      @if (d.match) {
                        <span class="block text-meta text-pass-ink">
                          {{ 'contracts.dpa.match.' + d.match | transloco }}
                        </span>
                      }
                    </span>
                    <app-button
                      size="sm"
                      [variant]="d.match ? 'primary' : 'secondary'"
                      [disabled]="busy()"
                      (click)="link(d)"
                      [attr.data-testid]="'dpa-link-' + d.code"
                    >
                      {{ 'contracts.dpa.link' | transloco }}
                    </app-button>
                  </li>
                }
              </ul>
            }
            <app-button
              class="mt-2"
              size="sm"
              [variant]="open().length ? 'ghost' : 'secondary'"
              [disabled]="flows.starting() !== null"
              (click)="createDpa()"
              data-testid="dpa-create"
            >
              <app-icon name="plus" [size]="13" />
              {{ 'contracts.dpa.create' | transloco }}
            </app-button>
          </div>
        }
      </app-card>
    }
  `,
})
export class ContractDpaCard {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly flows = inject(CreateFlowService);

  readonly contract = input.required<Contract>();
  readonly changed = output<Contract>();

  protected readonly statusKey = contractStatusKey;
  protected readonly roleKey = personalDataRoleKey;
  protected readonly basisKey = transferBasisKey;
  protected readonly complianceValue = dpaComplianceValue;

  protected readonly candidates = signal<readonly DpaCandidate[]>([]);
  protected readonly busy = signal(false);

  protected readonly isDpa = computed(() => this.contract().contract_type === 'dpa');
  protected readonly role = computed(
    () => this.contract().dpa.role ?? this.contract().personal_data_role ?? 'none',
  );
  protected readonly needsAgreement = computed(() => {
    const c = this.contract();
    return !this.isDpa() && c.dpa.required && c.dpa.status !== 'covered';
  });
  protected readonly linked = computed(() => this.candidates().filter((d) => d.linked));
  protected readonly open = computed(() =>
    this.candidates()
      .filter((d) => !d.linked)
      .slice(0, 4),
  );
  protected readonly subProcessors = computed(() =>
    this.contract()
      .parties.filter((p) => p.role === 'sub_processor')
      .map((p) => p.name),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const c = this.contract();
      const orgId = this.selectedOrg.currentOrgId();
      const wanted = !this.isDpa() && c.dpa.required;
      const key = `${c.id}|${c.dpa.linked_dpa_ids.join(',')}`;
      untracked(() => this.load(orgId, c.id, wanted, key));
    });
  }

  protected link(d: DpaCandidate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.linkDpa(orgId, this.contract().id, d.id).subscribe({
      next: (contract) => {
        this.busy.set(false);
        this.notifications.success('contracts.notices.dpaLinked', { code: d.code });
        this.changed.emit(contract);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  protected createDpa(): void {
    void this.flows.start('contract.to_dpa', 'contract', this.contract().id);
  }

  private lastKey: string | null = null;

  private load(orgId: string | null, id: string, wanted: boolean, key: string): void {
    if (!orgId || !wanted) {
      this.candidates.set([]);
      this.lastKey = null;
      return;
    }
    if (key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    this.request.unsubscribe();
    this.request = this.api.dpaCandidates(orgId, id).subscribe({
      next: (items) => this.candidates.set(items),
      error: () => this.candidates.set([]),
    });
  }
}
