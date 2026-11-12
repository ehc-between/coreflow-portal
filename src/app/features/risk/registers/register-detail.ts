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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import { Heatmap, Matrix, Register } from '../data/risk.models';
import { MatrixGrid } from '../shared/matrix-grid';
import { RiskPermissions } from '../shared/risk-permissions';
import { RegisterFormPanel } from './register-form-panel';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/** One risk register: its settings, its heat map and a way into its risks. */
@Component({
  selector: 'app-register-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    RecordDetailLayout,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    MatrixGrid,
    RegisterFormPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (register(); as r) {
      <app-record-detail-layout
        entityType="risk_register"
        [entityId]="r.id"
        [tabs]="tabs"
        [canEdit]="perms.canManage()"
        [includeAudit]="perms.canReadAudit()"
        backLink="/risk/registers"
        backLabelKey="risk.registers.back"
      >
        <div header>
          <p class="mb-1 text-[12.5px] text-fg-subtle">
            {{ 'risk.categories.' + r.category | transloco }}
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ r.name }}
          </h1>
          <div class="mt-2 flex flex-wrap gap-2">
            @if (r.is_default) {
              <app-badge tone="accent">{{ 'risk.registers.default' | transloco }}</app-badge>
            }
            @if (r.status === 'archived') {
              <app-badge>{{ 'risk.registers.archivedBadge' | transloco }}</app-badge>
            }
          </div>
        </div>
        <ng-container actions>
          <app-watch-button entityType="risk_register" [entityId]="r.id" />
          @if (perms.canManage()) {
            <app-button size="sm" (click)="panelOpen.set(true)">{{
              'risk.common.edit' | transloco
            }}</app-button>
            <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              <span class="sr-only sm:not-sr-only">{{ 'risk.common.delete' | transloco }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <app-card>
            @if (r.description) {
              <p class="mb-3 text-[13.5px] whitespace-pre-line text-fg">{{ r.description }}</p>
            }
            <dl class="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.registers.matrix' | transloco }}
                </dt>
                <dd>
                  <a
                    [routerLink]="['/risk/matrices', r.matrix_id]"
                    class="text-accent hover:underline"
                    >{{ r.matrix_name ?? '—' }}</a
                  >
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.owner?.name ?? ('risk.common.unassigned' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.reviewInterval' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ 'risk.registers.months' | transloco: { count: r.review_interval_months } }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.registers.risks' | transloco }}
                </dt>
                <dd>
                  <a
                    routerLink="/risk/risks"
                    [queryParams]="{ register: r.id }"
                    class="text-accent hover:underline"
                  >
                    {{
                      'risk.registers.riskCounts'
                        | transloco: { open: r.open_risk_count, total: r.risk_count }
                    }}
                  </a>
                </dd>
              </div>
            </dl>
          </app-card>
          @if (heatmap(); as h) {
            <app-card>
              <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                {{ 'risk.heatmap.title' | transloco }}
              </h2>
              <app-matrix-grid
                mode="heatmap"
                [matrix]="h.matrix"
                [counts]="counts()"
                [ariaLabel]="'risk.heatmap.title' | transloco"
                (cellSelected)="openRisks()"
              />
            </app-card>
          }
        </div>
      </app-record-detail-layout>

      <app-register-form-panel
        [open]="panelOpen()"
        [register]="r"
        [matrices]="matrices()"
        (saved)="onSaved($event)"
        (closed)="panelOpen.set(false)"
      />
      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'risk.registers.deleteTitle' | transloco"
        [message]="'risk.registers.deleteMessage' | transloco: { name: r.name }"
        [confirmLabel]="'risk.common.delete' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
      </div>
    } @else {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'risk.common.loading' | transloco }}
      </p>
    }
  `,
})
export class RegisterDetailPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly register = signal<Register | null>(null);
  protected readonly matrices = signal<readonly Matrix[]>([]);
  protected readonly heatmap = signal<Heatmap | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly panelOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  private sub: Subscription | null = null;

  protected readonly counts = computed(() => {
    const out: Record<string, number> = {};
    for (const c of this.heatmap()?.cells ?? []) {
      out[`${c.likelihood}:${c.consequence}`] = c.count;
    }
    return out;
  });

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk_register',
      entityId: this.id(),
      view: 'detail',
      title: this.register()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, id: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = forkJoin({
      register: this.api.getRegister(orgId, id),
      matrices: this.api.listMatrices(orgId),
      heatmap: this.api.heatmap(orgId, { register_id: id }).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ register, matrices, heatmap }) => {
        this.register.set(register);
        this.matrices.set(matrices.items);
        this.heatmap.set(heatmap);
        this.state.set('ready');
      },
      error: (e: unknown) => {
        this.loadErrorKey.set(riskErrorKey(e));
        this.state.set('error');
      },
    });
  }

  protected openRisks(): void {
    void this.router.navigate(['/risk/risks'], { queryParams: { register: this.id() } });
  }

  protected onSaved(register: Register): void {
    this.panelOpen.set(false);
    this.register.set(register);
    this.load(this.perms.orgId(), this.id());
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const r = this.register();
    this.deleteOpen.set(false);
    if (!orgId || !r) {
      return;
    }
    this.api.deleteRegister(orgId, r.id).subscribe({
      next: () => {
        this.toasts.success('risk.notices.registerDeleted', { name: r.name });
        void this.router.navigate(['/risk/registers']);
      },
      error: (e: unknown) => this.errorKey.set(riskErrorKey(e)),
    });
  }
}
