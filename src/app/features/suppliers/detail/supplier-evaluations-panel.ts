import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { decisionBadge, evaluationStatusBadge, scoreParams } from '../data/supplier-display';
import { EvaluationListItem, SupplierDetail } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from './start-evaluation-dialog';

export { defaultKind, questionnaireLang } from './start-evaluation-dialog';

/**
 * A supplier's evaluations (all kinds): title, kind, evaluator, the score against its
 * pass mark ("64 / 100 (grense 70)"), the decision or status and the due date of open
 * ones. Starting one is the page's primary action; the empty state asks for it
 * (`startRequested`).
 */
@Component({
  selector: 'app-supplier-evaluations-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Card,
    EmptyState,
    ErrorState,
    LoadingState,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <h2 class="px-5 pt-4 pb-2 font-display text-card font-bold text-fg">
        {{ 'suppliers.evaluations.title' | transloco }}
      </h2>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length === 0) {
            <app-empty-state
              [compact]="true"
              icon="checkcircle"
              titleKey="suppliers.evaluations.noneTitle"
              bodyKey="suppliers.evaluations.none"
              [ctaKey]="canWrite() ? 'suppliers.evaluations.start' : null"
              (cta)="startRequested.emit()"
            />
          } @else {
            <ul class="divide-y divide-border border-t border-border" data-testid="evaluation-rows">
              @for (e of items(); track e.id) {
                <li class="flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div class="min-w-0 flex-1">
                    <a
                      [routerLink]="['/suppliers', supplier().id, 'evaluations', e.id]"
                      class="block truncate text-body font-semibold text-fg hover:underline"
                    >
                      {{ e.title }}
                    </a>
                    <span class="text-meta text-fg-subtle">
                      {{ 'suppliers.evaluationKind.' + e.kind | transloco }}
                      @if (e.evaluator?.name; as name) {
                        · {{ name }}
                      }
                    </span>
                  </div>
                  <span class="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
                    @if (score(e); as sc) {
                      <span class="whitespace-nowrap" data-testid="evaluation-score">
                        {{
                          (sc.pass === null ? 'suppliers.score.of100' : 'suppliers.score.withPass')
                            | transloco: sc
                        }}
                      </span>
                    }
                    @if (e.decision) {
                      @let d = decision(e.decision);
                      <app-status-badge
                        [meaning]="d.meaning"
                        [value]="d.value"
                        [labelKey]="'suppliers.decision.' + e.decision"
                      />
                    } @else {
                      @let st = status(e.status);
                      <app-status-badge
                        [meaning]="st.meaning"
                        [value]="st.value"
                        [labelKey]="'suppliers.evaluationStatus.' + e.status"
                      />
                    }
                    @if (e.due_at && (e.status === 'draft' || e.status === 'submitted')) {
                      <span
                        class="whitespace-nowrap"
                        [class.text-warn-ink]="e.overdue"
                        [class.font-semibold]="e.overdue"
                      >
                        {{
                          (e.overdue
                            ? 'suppliers.evaluations.overdueSince'
                            : 'suppliers.evaluations.due'
                          ) | transloco: { date: (e.due_at | localDay) }
                        }}
                      </span>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        }
      }
    </app-card>
  `,
})
export class SupplierEvaluationsPanel {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly supplier = input.required<SupplierDetail>();
  readonly canWrite = input(false);
  /** "Start vurdering" from the empty state (the page owns the dialog). */
  readonly startRequested = output<void>();

  protected readonly decision = decisionBadge;
  protected readonly status = evaluationStatusBadge;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly EvaluationListItem[]>([]);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      // Tracks the whole record, so the list reloads when the supplier refreshes.
      const id = this.supplier().id;
      const lang = questionnaireLang(this.language.active());
      untracked(() => this.load(orgId, id, lang));
    });
  }

  protected score(e: EvaluationListItem) {
    return scoreParams(e.score, e.pass_score, this.language.locale());
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      this.supplier().id,
      questionnaireLang(this.language.active()),
    );
  }

  private load(orgId: string | null, supplierId: string, lang: 'en' | 'nb'): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api
      .listSupplierEvaluations(orgId, supplierId, { limit: 50 }, lang)
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }
}
