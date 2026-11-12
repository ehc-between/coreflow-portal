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
import { RiskPageGuide } from '../shared/risk-page-guide';
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
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'risk.matrices.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'risk.matrices.subtitle' | transloco }}</p>
        </div>
        @if (perms.canManage()) {
          <app-button size="sm" (click)="newMatrix()">
            <app-icon name="plus" [size]="14" />
            {{ 'risk.matrices.new' | transloco }}
          </app-button>
        }
      </header>
      <app-risk-page-guide class="mb-5" page="matrices" lesson="risk-matrix" />

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
                        [routerLink]="['/risk/matrices', m.id]"
                        class="font-display text-[16px] font-bold text-fg hover:underline"
                        >{{ m.name }}</a
                      >
                      <p class="text-[12.5px] text-fg-muted">
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
                  <p class="mt-2 text-[12.5px] text-fg-muted">
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
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.sub = this.api.listMatrices(orgId).subscribe({
          next: (res) => {
            this.matrices.set(res.items);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected newMatrix(): void {
    void this.router.navigate(['/risk/matrices/new']);
  }
}
