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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import { Matrix, Register } from '../data/risk.models';
import { RiskNav } from '../shared/risk-nav';
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
    RiskNav,
    WhyItMatters,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    PageHeader,
    RegisterFormPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="risk.registers.title"
        descriptionKey="risk.registers.subtitle"
        settingsLink="/risk/matrices"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.registers.title' },
        ]"
      >
        @if (perms.canManage()) {
          <app-button primary size="sm" (click)="openNew()">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.registers.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-risk-nav />
      <app-help-strip scope="risk" page="registers" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
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
                        class="font-display text-section font-bold text-fg hover:underline"
                        >{{ r.name }}</a
                      >
                      <p class="text-meta text-fg-muted">
                        {{ 'risk.categories.' + r.category | transloco }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      @if (r.is_default) {
                        <app-badge
                          tone="accent"
                          [attr.title]="'risk.registers.defaultHint' | transloco"
                          >{{ 'risk.registers.default' | transloco }}</app-badge
                        >
                      }
                      @if (r.status === 'archived') {
                        <app-badge>{{ 'risk.registers.archivedBadge' | transloco }}</app-badge>
                      }
                    </div>
                  </div>
                  <app-field-list class="mt-3" [columns]="2">
                    <app-field-item labelKey="risk.registers.matrix">
                      <a [routerLink]="['/risk/matrices', r.matrix_id]" class="hover:underline">{{
                        r.matrix_name ?? ('common.empty.notSet' | transloco)
                      }}</a>
                    </app-field-item>
                    <app-field-item
                      labelKey="risk.fields.owner"
                      [value]="r.owner?.name"
                      empty="none"
                    />
                    <app-field-item labelKey="risk.registers.risks">
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
                    </app-field-item>
                    <app-field-item
                      labelKey="risk.registers.reviewEvery"
                      [value]="
                        'risk.registers.months' | transloco: { count: r.review_interval_months }
                      "
                    />
                  </app-field-list>
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
          <app-why-it-matters class="mt-8 block" scope="risk" page="registers" />
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

  protected reload(): void {
    this.load(this.perms.orgId());
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
