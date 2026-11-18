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
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { Matrix } from '../data/risk.models';
import { MatrixGrid } from '../shared/matrix-grid';
import { ModuleConfigNav } from '../../../shared/ui/module-config-nav/module-config-nav';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskPermissions } from '../shared/risk-permissions';

/** The org's risk matrices (likelihood x consequence scales, bands, risk appetite). */
@Component({
  selector: 'app-matrix-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    TeachingEmpty,
    Badge,
    Button,
    Card,
    Icon,
    MatrixGrid,
    ModuleConfigNav,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="risk.matrices.title"
        descriptionKey="risk.matrices.subtitle"
        [breadcrumbs]="[
          { labelKey: 'nav.settings', link: '/settings' },
          { labelKey: 'modules.names.risk' },
          { labelKey: 'risk.matrices.title' },
        ]"
      >
        @if (perms.canManage()) {
          <app-button primary size="sm" (click)="newMatrix()">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.matrices.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-module-config-nav module="risk" />
      <app-help-strip scope="risk" page="matrices" lesson="risk-matrix" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (matrices().length === 0) {
            <app-card>
              <app-teaching-empty
                scope="risk"
                page="matrices"
                [showAction]="perms.canManage()"
                (action)="newMatrix()"
              />
            </app-card>
          } @else {
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              @for (m of matrices(); track m.id) {
                <app-card>
                  <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <a
                        [routerLink]="['/settings/modules/risk/matrices', m.id]"
                        class="font-display text-section font-bold text-fg hover:underline"
                        >{{ m.name }}</a
                      >
                      <p class="text-meta text-fg-muted">
                        {{
                          'risk.matrices.summary'
                            | transloco
                              : {
                                  l: m.likelihood_levels.length,
                                  c: m.consequence_levels.length,
                                  registers: m.register_count,
                                }
                        }}
                      </p>
                    </div>
                    @if (m.is_default) {
                      <app-badge tone="accent">{{ 'risk.matrices.default' | transloco }}</app-badge>
                    }
                  </div>
                  <app-matrix-grid [matrix]="m" [showAppetite]="true" [ariaLabel]="m.name" />
                  <p class="mt-2 text-meta text-fg-muted">
                    {{
                      m.acceptable_max_score !== null
                        ? ('risk.matrices.appetiteValue'
                          | transloco: { score: m.acceptable_max_score })
                        : ('risk.matrices.noAppetite' | transloco)
                    }}
                  </p>
                </app-card>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class MatrixListPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly matrices = signal<readonly Matrix[]>([]);
  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk_matrix',
      view: 'list',
      title: this.language.translate('risk.matrices.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.perms.orgId());
  }

  private load(orgId: string | null): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.listMatrices(orgId).subscribe({
      next: (res) => {
        this.matrices.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected newMatrix(): void {
    void this.router.navigate(['/settings/modules/risk/matrices/new']);
  }
}
