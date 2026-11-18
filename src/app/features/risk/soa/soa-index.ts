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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskApi } from '../data/risk-api';
import { standardDisplayName } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import { SoaStandard } from '../data/risk.models';
import { RiskNav } from '../shared/risk-nav';
import { RiskPermissions } from '../shared/risk-permissions';
import { SoaProgress } from '../shared/soa-progress';

/**
 * The Statements of Applicability the organisation can keep: one per standard with
 * Annex A controls (ISO/IEC 27001, ISO/IEC 42001). Each card shows how many
 * controls have a justified decision, how many are implemented and the latest
 * approved version. Generating creates one entry per control (idempotent, so it
 * also adds controls new to the catalogue).
 */
@Component({
  selector: 'app-soa-index',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    RiskNav,
    SoaProgress,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="risk.soa.title"
        descriptionKey="risk.soa.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.soa.title' },
        ]"
      />
      <app-risk-nav />
      <app-help-strip scope="risk" page="soa" lesson="statement-of-applicability" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            @for (s of standards(); track s.standard_key) {
              <app-card [attr.data-testid]="'soa-card-' + s.standard_key">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <h2 class="min-w-0 font-display text-section font-bold text-fg">
                    {{ name(s) }}
                  </h2>
                  @if (s.standard_enabled) {
                    <app-badge tone="pass">{{ 'risk.soa.enabled' | transloco }}</app-badge>
                  } @else {
                    <app-badge>{{ 'risk.soa.notEnabled' | transloco }}</app-badge>
                  }
                </div>
                <p class="mt-1 text-meta text-fg-muted">
                  @if (s.latest_version; as v) {
                    {{
                      'risk.soa.version.latest'
                        | transloco
                          : {
                              version: v.version_no,
                              date: (v.approved_at | localDay),
                              name: v.approved_by?.name ?? ('risk.common.unknown' | transloco),
                            }
                    }}
                  } @else if (s.entry_count > 0) {
                    {{ 'risk.soa.version.none' | transloco }}
                  } @else {
                    {{ 'risk.soa.notGeneratedShort' | transloco }}
                  }
                </p>
                @if (s.entry_count > 0) {
                  @if (s.implemented !== undefined) {
                    <app-soa-progress
                      class="mt-3"
                      [total]="s.entry_count"
                      [justified]="s.justified ?? null"
                      [applicable]="s.applicable ?? s.entry_count"
                      [implemented]="s.implemented"
                    />
                  } @else {
                    <p class="mt-3 text-ui text-fg-muted">
                      {{
                        'risk.soa.coverage'
                          | transloco: { entries: s.entry_count, controls: s.control_count }
                      }}
                    </p>
                  }
                  @if (s.entry_count < s.control_count) {
                    <p class="mt-2 text-meta text-warn-ink">
                      {{
                        'risk.soa.missingControls'
                          | transloco: { count: s.control_count - s.entry_count }
                      }}
                    </p>
                  }
                }
                <div class="mt-4 flex flex-wrap gap-2">
                  @if (s.entry_count > 0) {
                    <a
                      [routerLink]="['/risk/soa', s.standard_key]"
                      class="inline-flex h-8 items-center rounded-tile bg-accent px-3 text-ui font-semibold text-white hover:opacity-90"
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
                  <p class="mt-3 text-meta text-fg-muted">
                    {{ 'risk.soa.askManager' | transloco }}
                  </p>
                }
              </app-card>
            } @empty {
              <app-card class="md:col-span-2">
                <app-empty-state icon="shield" titleKey="risk.soa.noStandards" [compact]="true" />
              </app-card>
            }
          </div>
          <app-why-it-matters class="mt-8 block" scope="risk" page="soa" />
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

  protected name(s: SoaStandard): string {
    return standardDisplayName(
      s.standard_label,
      s.standard_key,
      s.standard_name,
      this.language.active(),
      (k, p) => this.language.translate(k, p),
    );
  }

  protected reload(): void {
    this.load(this.perms.orgId());
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
