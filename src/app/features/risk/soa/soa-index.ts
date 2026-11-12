import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import { SoaStandard } from '../data/risk.models';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

/**
 * The Statements of Applicability the org can keep: one per catalogue standard with
 * Annex A controls (ISO/IEC 27001, ISO/IEC 42001). Generating creates one entry per
 * control (idempotent, so it also adds controls new to the catalogue).
 */
@Component({
  selector: 'app-soa-index',
  imports: [RouterLink, TranslocoPipe, Badge, Button, Card, ProgressBar, RiskPageGuide],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'risk.soa.title' | transloco }}
      </h1>
      <p class="mt-1 mb-4 text-[13.5px] text-fg-muted">{{ 'risk.soa.subtitle' | transloco }}</p>
      <app-risk-page-guide class="mb-5" page="soa" lesson="statement-of-applicability" />

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
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            @for (s of standards(); track s.standard_key) {
              <app-card>
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h2 class="font-display text-[16px] font-bold text-fg">
                      {{ s.standard_name }}
                    </h2>
                    <p class="font-mono text-[12px] text-fg-subtle">{{ s.standard_key }}</p>
                  </div>
                  @if (s.standard_enabled) {
                    <app-badge tone="pass">{{ 'risk.soa.enabled' | transloco }}</app-badge>
                  } @else {
                    <app-badge>{{ 'risk.soa.notEnabled' | transloco }}</app-badge>
                  }
                </div>
                <p class="mt-3 text-[13px] text-fg-muted">
                  {{
                    'risk.soa.coverage'
                      | transloco: { entries: s.entry_count, controls: s.control_count }
                  }}
                </p>
                <app-progress-bar
                  class="mt-1.5"
                  [value]="s.control_count ? (s.entry_count / s.control_count) * 100 : 0"
                  [label]="'risk.soa.coverageLabel' | transloco"
                />
                <div class="mt-4 flex flex-wrap gap-2">
                  @if (s.entry_count > 0) {
                    <a
                      [routerLink]="['/risk/soa', s.standard_key]"
                      class="inline-flex h-8 items-center rounded-tile bg-accent px-3 text-[13px] font-semibold text-white hover:opacity-90"
                    >
                      {{ 'risk.soa.open' | transloco }}
                    </a>
                  }
                  @if (perms.canManage() && s.entry_count < s.control_count) {
                    <app-button
                      size="sm"
                      [variant]="s.entry_count > 0 ? 'secondary' : 'primary'"
                      [loading]="generating() === s.standard_key"
                      [disabled]="generating() !== null"
                      (click)="generate(s)"
                    >
                      {{
                        (s.entry_count > 0 ? 'risk.soa.addMissing' : 'risk.soa.generate')
                          | transloco
                      }}
                    </app-button>
                  }
                </div>
                @if (!perms.canManage() && s.entry_count === 0) {
                  <p class="mt-3 text-[12.5px] text-fg-muted">
                    {{ 'risk.soa.askManager' | transloco }}
                  </p>
                }
              </app-card>
            } @empty {
              <app-card>
                <p class="py-6 text-center text-[13.5px] text-fg-muted">
                  {{ 'risk.soa.noStandards' | transloco }}
                </p>
              </app-card>
            }
          </div>
        }
      }
    </div>
  `,
})
export class SoaIndexPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly standards = signal<readonly SoaStandard[]>([]);
  protected readonly generating = signal<string | null>(null);
  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'soa_entry',
      view: 'list',
      title: this.language.translate('risk.soa.title'),
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
    this.sub = this.api.listSoaStandards(orgId).subscribe({
      next: (items) => {
        this.standards.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected generate(s: SoaStandard): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.generating.set(s.standard_key);
    this.api.generateSoa(orgId, s.standard_key).subscribe({
      next: (res) => {
        this.generating.set(null);
        this.toasts.success('risk.soa.generated', { count: res.created });
        void this.router.navigate(['/risk/soa', s.standard_key]);
      },
      error: (e: unknown) => {
        this.generating.set(null);
        this.toasts.error(riskErrorKey(e));
      },
    });
  }
}
