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
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import { PrivacyRecord, RopaCompleteness } from './data/privacy.models';
import { statusKey, statusToneValue } from './data/privacy-display';
import { REGISTERS, RegisterKey } from './data/privacy-registers';
import { privacyPermissions } from './privacy-nav';

/** The registers that point to a processing activity, with the flow that creates one. */
const LINKED: readonly { readonly register: RegisterKey; readonly flow: string }[] = [
  { register: 'lba', flow: 'ropa_entry.to_legal_basis' },
  { register: 'dpia', flow: 'ropa_entry.to_dpia' },
  { register: 'retention', flow: 'ropa_entry.to_retention' },
  { register: 'transfer', flow: 'ropa_entry.to_transfer' },
  { register: 'consent', flow: 'ropa_entry.to_consent' },
];

interface LinkedGroup {
  readonly register: RegisterKey;
  readonly flow: string;
  readonly items: readonly PrivacyRecord[];
  readonly canCreate: boolean;
}

/**
 * "Knyttet til denne behandlingen": the legal-basis assessments, DPIAs, retention
 * rules, transfers and consents that point to this processing activity, each group
 * with "+ Opprett" prefilled from it (create-from-here). This is the auditor's trace
 * from the record of processing to everything that supports it.
 */
@Component({
  selector: 'app-privacy-ropa-linked',
  imports: [RouterLink, TranslocoPipe, Card, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <h2 class="mb-1 font-display text-card font-bold text-fg">
        {{ 'privacy.ropa.linkedTitle' | transloco }}
      </h2>
      <p class="mb-3 text-ui text-fg-muted">{{ 'privacy.ropa.linkedIntro' | transloco }}</p>
      <div class="flex flex-col divide-y divide-border" data-testid="ropa-linked">
        @for (g of groups(); track g.register) {
          <section class="py-3 first:pt-0 last:pb-0" [attr.data-testid]="'linked-' + g.register">
            <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-ui font-semibold text-fg">
                {{ 'privacy.registers.' + g.register + '.plural' | transloco }}
                <span class="ml-1 text-meta font-normal text-fg-subtle">{{ g.items.length }}</span>
              </h3>
              @if (g.canCreate) {
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline disabled:opacity-60"
                  [disabled]="flows.starting() !== null"
                  (click)="create(g.flow)"
                  [attr.data-testid]="'linked-create-' + g.register"
                >
                  <app-icon name="plus" [size]="14" />
                  {{ 'privacy.registers.' + g.register + '.new' | transloco }}
                </button>
              }
            </div>
            @if (g.items.length === 0) {
              <p class="text-meta text-fg-subtle">
                {{ 'privacy.ropa.linkedNone.' + g.register | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-1">
                @for (item of g.items; track item.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2">
                    <a
                      [routerLink]="['/privacy', segment(g.register), item.id]"
                      class="min-w-0 truncate text-ui text-fg hover:underline"
                    >
                      <span class="font-mono text-meta text-fg-subtle">{{ item.code }}</span>
                      {{ item.title }}
                    </a>
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="toneValue(item.status)"
                      [labelKey]="statusKey(item.status)"
                    />
                  </li>
                }
              </ul>
            }
          </section>
        }
      </div>
    </app-card>
  `,
})
export class RopaLinked {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly perms = privacyPermissions();
  protected readonly flows = inject(CreateFlowService);

  readonly ropaId = input.required<string>();

  protected readonly statusKey = statusKey;
  protected readonly toneValue = statusToneValue;
  private readonly loaded = signal<Readonly<Record<string, readonly PrivacyRecord[]>>>({});

  protected readonly groups = computed<readonly LinkedGroup[]>(() =>
    LINKED.filter((l) => this.perms().has(REGISTERS[l.register].readPermission)).map((l) => ({
      ...l,
      items: this.loaded()[l.register] ?? [],
      canCreate: this.perms().has(REGISTERS[l.register].writePermission),
    })),
  );

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.ropaId();
      const perms = this.perms();
      untracked(() => this.load(orgId, id, perms));
    });
  }

  protected segment(register: RegisterKey): string {
    return REGISTERS[register].segment;
  }

  protected create(flow: string): void {
    void this.flows.start(flow, 'ropa_entry', this.ropaId());
  }

  private load(orgId: string | null, id: string, perms: ReadonlySet<string>): void {
    this.sub.unsubscribe();
    if (!orgId) {
      return;
    }
    const readable = LINKED.filter((l) => perms.has(REGISTERS[l.register].readPermission));
    const calls = Object.fromEntries(
      readable.map((l) => [
        l.register,
        this.api
          .list(orgId, REGISTERS[l.register], {
            extra: { ropa_entry_id: id },
            sort: 'code',
            limit: 20,
          })
          .pipe(catchError(() => of({ items: [], total: 0 }))),
      ]),
    );
    if (!readable.length) {
      return;
    }
    this.sub = forkJoin(calls).subscribe((pages) => {
      const out: Record<string, readonly PrivacyRecord[]> = {};
      for (const [key, page] of Object.entries(pages)) {
        out[key] = page.items;
      }
      this.loaded.set(out);
    });
  }
}

/**
 * "7 av 9 opplysninger etter artikkel 30": how complete the entry is, with a jump link
 * to each missing field (an entry cannot become active before it is complete).
 */
@Component({
  selector: 'app-privacy-ropa-completeness',
  imports: [TranslocoPipe, Card, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = completeness();
    <app-card>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'privacy.ropa.completenessTitle' | transloco }}
        </h2>
        <span class="text-ui font-semibold text-fg" data-testid="ropa-completeness">
          {{ 'privacy.ropa.completeness' | transloco: { filled: c.filled, total: c.total } }}
        </span>
      </div>
      <app-progress-bar
        class="mt-2 block"
        [value]="c.total ? (c.filled / c.total) * 100 : 100"
        [label]="'privacy.ropa.completeness' | transloco: { filled: c.filled, total: c.total }"
      />
      @if (c.missing.length) {
        <p class="mt-3 text-ui text-fg-muted">
          {{ 'privacy.ropa.completenessMissing' | transloco }}
        </p>
        <ul class="mt-1 flex flex-wrap gap-2">
          @for (field of c.missing; track field) {
            <li>
              <button
                type="button"
                class="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-meta font-semibold text-warn-ink hover:underline"
                (click)="jump(field)"
                [attr.data-testid]="'jump-' + field"
              >
                {{ 'privacy.fields.' + field | transloco }}
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="mt-3 text-ui text-fg-muted">{{ 'privacy.ropa.completenessDone' | transloco }}</p>
      }
    </app-card>
  `,
})
export class RopaCompletenessCard {
  readonly completeness = input.required<RopaCompleteness>();

  protected jump(field: string): void {
    const el = document.getElementById(`field-${field}`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el?.setAttribute('tabindex', '-1');
    el?.focus({ preventScroll: true });
  }
}
