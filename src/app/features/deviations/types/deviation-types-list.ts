import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { standardLabelKey } from '../deviation-enums';

/**
 * Admin list of the org's deviation types. Shows each type's name, key,
 * code prefix, standards, field count and active state, with create / edit /
 * delete. Toggling active patches `is_active`; delete handles the backend's
 * 409 (type in use) with a clear toast. Gated upstream on `deviations:admin`.
 * Reloads on org switch.
 */
@Component({
  selector: 'app-deviation-types-list',
  imports: [RouterLink, TranslocoPipe, Card, Badge, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>

      <div class="mb-[18px] flex items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'deviations.types.title' | transloco }}
          </h1>
          <div class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'deviations.types.subtitle' | transloco }}
          </div>
        </div>
        <a routerLink="/deviations/types/new">
          <app-button>
            <app-icon name="plus" [size]="15" />
            {{ 'deviations.types.new' | transloco }}
          </app-button>
        </a>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (types().length === 0) {
          <div class="px-4 py-12 text-center">
            <p class="text-[14px] text-fg-muted">{{ 'deviations.types.empty' | transloco }}</p>
          </div>
        } @else {
          <ul>
            @for (type of types(); track type.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <div class="flex items-center gap-3 px-4 py-3">
                  <a
                    [routerLink]="['/deviations/types', type.id]"
                    class="flex min-w-0 flex-1 gap-3"
                  >
                    <span class="w-[88px] flex-none font-mono text-[12px] text-fg-subtle">{{
                      type.code_prefix
                    }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-semibold text-fg">{{ type.name }}</span>
                      <span class="block truncate font-mono text-[12px] text-fg-subtle">{{
                        type.key
                      }}</span>
                    </span>
                  </a>
                  <span class="hidden flex-none gap-1 lg:flex">
                    @for (std of type.standards; track std) {
                      <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                    }
                  </span>
                  <span class="w-[84px] flex-none text-right text-[12.5px] text-fg-muted">
                    {{
                      (type.schema.length === 1
                        ? 'deviations.types.fieldCountOne'
                        : 'deviations.types.fieldCount'
                      ) | transloco: { count: type.schema.length }
                    }}
                  </span>
                  <button
                    type="button"
                    (click)="toggleActive(type)"
                    [disabled]="busyId() === type.id"
                    [attr.aria-pressed]="type.is_active"
                    class="flex w-[88px] flex-none justify-center"
                  >
                    <app-badge [tone]="type.is_active ? 'pass' : 'neutral'">
                      {{
                        (type.is_active ? 'deviations.types.active' : 'deviations.types.inactive')
                          | transloco
                      }}
                    </app-badge>
                  </button>
                  <button
                    type="button"
                    (click)="remove(type)"
                    [disabled]="busyId() === type.id"
                    [attr.aria-label]="'deviations.types.delete' | transloco"
                    class="flex flex-none rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-50"
                  >
                    <app-icon name="x" [size]="16" />
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      </app-card>
    </div>
  `,
})
export class DeviationTypesList {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly loading = signal(false);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      this.types.set([]);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected toggleActive(type: DeviationType): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(type.id);
    this.api.updateType(orgId, type.id, { is_active: !type.is_active }).subscribe({
      next: (updated) => {
        this.types.set(this.types().map((t) => (t.id === updated.id ? updated : t)));
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        notifyDeviationError(this.notifications, error);
      },
    });
  }

  protected remove(type: DeviationType): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(type.id);
    this.api.deleteType(orgId, type.id).subscribe({
      next: () => {
        this.types.set(this.types().filter((t) => t.id !== type.id));
        this.busyId.set(null);
        this.notifications.success('deviations.types.deletedToast');
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        // A legacy (uncoded) 409 on delete always meant "in use".
        notifyDeviationError(this.notifications, error, 'deviations.types.inUseToast');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.api.listTypes(orgId).subscribe({
      next: (types) => {
        this.types.set(types);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
