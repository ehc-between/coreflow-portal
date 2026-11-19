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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { KitApi } from '../../../core/kit/kit-api';
import { ModuleService } from '../../../core/modules/module.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ConnectionsStore } from '../../../shared/kit/connections-store';
import { LinkPicker } from '../../../shared/kit/link-picker';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { InterestedParty, PartyCategory } from '../data/context.models';

/** The register a group of interested parties lives in, per category. */
export interface PartyRegister {
  /** Module key (the register is offered only when the module is on). */
  readonly module: string;
  readonly link: string;
  /** Entity types whose connections count as "linked to the register". */
  readonly types: readonly string[];
}

const REGISTERS: Readonly<Partial<Record<PartyCategory, PartyRegister>>> = {
  supplier: { module: 'suppliers', link: '/suppliers', types: ['supplier', 'contract'] },
  customer: { module: 'feedback', link: '/feedback', types: ['customer_feedback', 'contract'] },
  employee: { module: 'people', link: '/people', types: ['employee', 'position'] },
  regulator: {
    module: 'obligations',
    link: '/obligations',
    types: ['compliance_obligation'],
  },
  owner: { module: 'contracts', link: '/contracts', types: ['contract'] },
  partner: { module: 'contracts', link: '/contracts', types: ['contract'] },
};

/** The register a party of this category belongs to, if any. */
export function registerFor(category: PartyCategory | string): PartyRegister | null {
  return REGISTERS[category as PartyCategory] ?? null;
}

/**
 * "Koblet til registrene" on an interested party: who the group really is in
 * CoreFlow (suppliers, contracts, customer feedback, employees, legal
 * obligations), with counts from the record's connections, a link to the
 * register and "Koble til en post". A party marked as a compliance obligation
 * (ISO 14001 / 45001 6.1.3) offers "Registrer som forpliktelse".
 */
@Component({
  selector: 'app-context-party-registers',
  imports: [RouterLink, TranslocoPipe, LinkPicker, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'inline') {
      <!-- Inside the "Oppfølging" card (docs/ux-guide.md §2.7): the card has "Koble til…". -->
      <div class="mt-3 flex flex-col items-start gap-2 empty:hidden" data-testid="party-registers">
        @if (register(); as reg) {
          <a
            [routerLink]="reg.link"
            class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
          >
            {{ 'context.party.registers.open.' + party().category | transloco }}
            <span aria-hidden="true">→</span>
          </a>
        }
        @if (party().is_compliance_obligation && obligationFlow()) {
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="flows.starting() !== null"
            (click)="createObligation()"
            data-testid="party-obligation"
          >
            <app-icon name="scale" [size]="14" />
            {{ 'context.party.createObligation' | transloco }}
          </app-button>
        }
      </div>
    } @else {
      <section
        class="rounded-card border border-border bg-surface p-4"
        aria-labelledby="party-reg-title"
        data-testid="party-registers"
      >
        <h3 id="party-reg-title" class="font-display text-card font-bold text-fg">
          {{ 'context.party.registers.title' | transloco }}
        </h3>
        <p class="mt-0.5 text-meta text-fg-muted">
          {{ 'context.party.registers.hint.' + party().category | transloco }}
        </p>
        @if (counts().length) {
          <ul class="mt-2 flex flex-wrap gap-1.5" data-testid="party-register-counts">
            @for (c of counts(); track c.type) {
              <li
                class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-meta font-semibold text-fg"
              >
                {{ c.label }} · {{ c.count }}
              </li>
            }
          </ul>
        } @else {
          <p class="mt-2 text-ui text-fg-muted">{{ 'context.party.registers.none' | transloco }}</p>
        }
        <div class="mt-3 flex flex-wrap gap-2">
          @if (canEdit()) {
            <app-button size="sm" variant="secondary" (click)="pickerOpen.set(true)">
              <app-icon name="link" [size]="14" />
              {{ 'context.party.registers.link' | transloco }}
            </app-button>
          }
          @if (register(); as reg) {
            <a
              [routerLink]="reg.link"
              class="inline-flex h-8 items-center gap-1 px-2 text-ui font-semibold text-accent hover:underline"
            >
              {{ 'context.party.registers.open.' + party().category | transloco }}
            </a>
          }
        </div>
        @if (party().is_compliance_obligation) {
          <div class="mt-4 border-t border-border pt-3" data-testid="party-obligation">
            <p class="text-ui text-fg">{{ 'context.party.obligationHint' | transloco }}</p>
            @if (obligationFlow()) {
              <app-button
                class="mt-2"
                size="sm"
                variant="secondary"
                [disabled]="flows.starting() !== null"
                (click)="createObligation()"
              >
                <app-icon name="scale" [size]="14" />
                {{ 'context.party.createObligation' | transloco }}
              </app-button>
            }
          </div>
        }
      </section>
    }
    @if (canEdit() && variant() === 'card') {
      <app-link-picker
        [open]="pickerOpen()"
        sourceType="interested_party"
        [sourceId]="party().id"
        (linked)="onLinked()"
        (closed)="pickerOpen.set(false)"
      />
    }
  `,
})
export class PartyRegisters {
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly notifications = inject(NotificationService);
  /** The detail layout's store (provided to its content), so counts stay in step. */
  private readonly connections = inject(ConnectionsStore, { optional: true });
  protected readonly flows = inject(CreateFlowService);

  readonly party = input.required<InterestedParty>();
  readonly canEdit = input(false);
  /** `card` (own section) or `inline` (the register link and obligation action only). */
  readonly variant = input<'card' | 'inline'>('card');

  protected readonly pickerOpen = signal(false);
  protected readonly obligationFlow = signal(false);

  protected readonly register = computed(() => {
    const reg = registerFor(this.party().category);
    return reg && this.modules.enabledKeys().has(reg.module) ? reg : null;
  });

  /** Connected records per register type ("Leverandør · 3"). */
  protected readonly counts = computed(() => {
    const groups = this.connections?.groups() ?? [];
    const wanted = new Set([
      ...(registerFor(this.party().category)?.types ?? []),
      'compliance_obligation',
    ]);
    return groups
      .filter((group) => wanted.has(group.entity_type) && group.count > 0)
      .map((group) => ({
        type: group.entity_type,
        count: group.count,
        label: this.entityTypes.label(group.entity_type, group.label_key),
      }));
  });

  private sub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const party = this.party();
      untracked(() => this.loadFlows(orgId, party));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected onLinked(): void {
    this.pickerOpen.set(false);
    this.connections?.linked();
    this.notifications.success('context.party.registers.linked');
  }

  protected createObligation(): void {
    void this.flows.start('interested_party.to_obligation', 'interested_party', this.party().id);
  }

  private loadFlows(orgId: string | null, party: InterestedParty): void {
    this.sub?.unsubscribe();
    this.obligationFlow.set(false);
    if (!orgId || !party.is_compliance_obligation) {
      return;
    }
    this.sub = this.kit.createFlows(orgId, 'interested_party', { entityId: party.id }).subscribe({
      next: (list) =>
        this.obligationFlow.set(
          (list?.items ?? []).some(
            (flow) => flow.key === 'interested_party.to_obligation' && flow.enabled,
          ),
        ),
      error: () => this.obligationFlow.set(false),
    });
  }
}
