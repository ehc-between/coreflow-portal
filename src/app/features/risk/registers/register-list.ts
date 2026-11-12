import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import { Matrix, Register } from '../data/risk.models';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';
import { RegisterFormPanel } from './register-form-panel';

/**
 * Risk registers: one per category (enterprise, information security, privacy, AI,
 * HSE, environmental, project, quality …), each assessed on one matrix with its own
 * review interval. Managers create and edit them here.
 */
@Component({
  selector: 'app-register-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    TeachingEmpty,
    Badge,
    Button,
    Card,
    Icon,
    RiskPageGuide,
    RegisterFormPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'risk.registers.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'risk.registers.subtitle' | transloco }}
          </p>
        </div>
        @if (perms.canManage()) {
          <app-button size="sm" (click)="openNew()">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.registers.new' | transloco }}
          </app-button>
        }
      </header>
      <app-risk-page-guide class="mb-5" page="registers" />

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'risk.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-10 text-center text-[14px] text-fail" role="alert">
            {{ 'risk.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (registers().length === 0) {
            <app-card>
              <app-teaching-empty
                scope="risk"
                page="registers"
                [showAction]="perms.canManage()"
                (action)="setup()"
              />
            </app-card>
          } @else {
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              @for (r of registers(); track r.id) {
                <app-card>
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <a
                        [routerLink]="['/risk/registers', r.id]"
                        class="font-display text-[16px] font-bold text-fg hover:underline"
                        >{{ r.name }}</a
                      >
                      <p class="text-[12.5px] text-fg-muted">
                        {{ 'risk.categories.' + r.category | transloco }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      @if (r.is_default) {
                        <app-badge tone="accent">{{
                          'risk.registers.default' | transloco
                        }}</app-badge>
                      }
                      @if (r.status === 'archived') {
                        <app-badge>{{ 'risk.registers.archivedBadge' | transloco }}</app-badge>
                      }
                    </div>
                  </div>
                  <dl class="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                    <div>
                      <dt class="text-fg-muted">{{ 'risk.registers.matrix' | transloco }}</dt>
                      <dd class="text-fg">
                        <a [routerLink]="['/risk/matrices', r.matrix_id]" class="hover:underline">{{
                          r.matrix_name ?? '—'
                        }}</a>
                      </dd>
                    </div>
                    <div>
                      <dt class="text-fg-muted">{{ 'risk.fields.owner' | transloco }}</dt>
                      <dd class="text-fg">
                        {{ r.owner?.name ?? ('risk.common.unassigned' | transloco) }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-fg-muted">{{ 'risk.registers.risks' | transloco }}</dt>
                      <dd class="text-fg">
                        <a
                          routerLink="/risk/risks"
                          [queryParams]="{ register: r.id }"
                          class="hover:underline"
                        >
                          {{
                            'risk.registers.riskCounts'
                              | transloco: { open: r.open_risk_count, total: r.risk_count }
                          }}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt class="text-fg-muted">{{ 'risk.fields.reviewInterval' | transloco }}</dt>
                      <dd class="text-fg">
                        {{
                          'risk.registers.months' | transloco: { count: r.review_interval_months }
                        }}
                      </dd>
                    </div>
                  </dl>
                  @if (perms.canManage()) {
                    <div class="mt-3 flex justify-end">
                      <app-button size="sm" variant="ghost" (click)="openEdit(r)">
                        {{ 'risk.common.edit' | transloco }}
                      </app-button>
                    </div>
                  }
                </app-card>
              }
            </div>
          }
        }
      }
    </div>

    <app-register-form-panel
      [open]="panelOpen()"
      [register]="editing()"
      [matrices]="matrices()"
      (saved)="onSaved()"
      (closed)="panelOpen.set(false)"
    />
  `,
})
export class RegisterListPage {
  private readonly api = inject(RiskApi);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly matrices = signal<readonly Matrix[]>([]);
  protected readonly panelOpen = signal(false);
  protected readonly editing = signal<Register | null>(null);
  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk_register',
      view: 'list',
      title: this.language.translate('risk.registers.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = forkJoin({
      registers: this.api.listRegisters(orgId),
      matrices: this.api.listMatrices(orgId),
    }).subscribe({
      next: ({ registers, matrices }) => {
        this.registers.set(registers.items);
        this.matrices.set(matrices.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected openNew(): void {
    this.editing.set(null);
    this.panelOpen.set(true);
  }

  protected openEdit(r: Register): void {
    this.editing.set(r);
    this.panelOpen.set(true);
  }

  protected onSaved(): void {
    this.panelOpen.set(false);
    this.load(this.perms.orgId());
  }

  protected setup(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.api.setup(orgId).subscribe({
      next: () => {
        this.toasts.success('risk.setup.done');
        this.load(orgId);
      },
      error: (e: unknown) => this.toasts.error(riskErrorKey(e)),
    });
  }
}
