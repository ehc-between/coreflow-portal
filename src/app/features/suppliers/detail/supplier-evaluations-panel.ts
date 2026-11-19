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
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { decisionBadge, evaluationStatusBadge, scoreParams } from '../data/supplier-display';
import { EvaluationKind, EvaluationListItem, SupplierDetail } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from './start-evaluation-dialog';

export { defaultKind, questionnaireLang } from './start-evaluation-dialog';

/**
 * A supplier's evaluations: first the assessments its risk profile calls for
 * ("Påkrevde vurderinger: 1 av 3 gjort", each done, in progress or to start), then
 * every evaluation (all kinds): title, kind, evaluator, the score against its
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
    Button,
    Card,
    Icon,
    EmptyState,
    ErrorState,
    LoadingState,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <h2 class="flex items-center gap-2 px-5 pt-4 pb-2 font-display text-card font-bold text-fg">
        <app-icon name="checkcircle" [size]="16" class="text-fg-muted" />
        {{ 'suppliers.evaluations.title' | transloco }}
      </h2>
      @let s = supplier();
      @if (s.required_assessments?.length) {
        <div class="px-5 pb-4" data-testid="required-assessments">
          <h3 class="mb-2 text-ui font-semibold text-fg">
            {{
              'suppliers.required.title'
                | transloco: { done: s.required_done ?? 0, total: s.required_total ?? 0 }
            }}
          </h3>
          <ul class="flex flex-col divide-y divide-border rounded-tile border border-border">
            @for (r of s.required_assessments; track r.kind) {
              <li
                class="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                [attr.data-kind]="r.kind"
              >
                <span
                  class="flex h-5 w-5 flex-none items-center justify-center rounded-full"
                  [class]="r.done ? 'bg-pass-soft text-pass-ink' : 'bg-surface-2 text-fg-subtle'"
                  aria-hidden="true"
                >
                  <app-icon [name]="r.done ? 'check' : 'clock'" [size]="12" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-ui font-semibold text-fg">
                    {{ 'suppliers.evaluationKind.' + r.kind | transloco }}
                    <span class="sr-only">
                      ·
                      {{
                        (r.done ? 'suppliers.required.done' : 'suppliers.required.notDone')
                          | transloco
                      }}
                    </span>
                  </p>
                  <p class="text-meta text-fg-muted">
                    {{ 'suppliers.required.why.' + r.reason | transloco }}
                  </p>
                </div>
                <span class="flex flex-wrap items-center gap-2 text-meta">
                  @if (r.latest; as l) {
                    <a
                      [routerLink]="['/suppliers', s.id, 'evaluations', l.id]"
                      class="inline-flex items-center gap-2 hover:underline"
                    >
                      @if (l.decision) {
                        @let d = decision(l.decision);
                        <app-status-badge
                          [meaning]="d.meaning"
                          [value]="d.value"
                          [labelKey]="'suppliers.decision.' + l.decision"
                        />
                      }
                      @if (scoreOf(l.score); as sc) {
                        <span class="text-fg-muted">{{
                          'suppliers.score.of100' | transloco: sc
                        }}</span>
                      }
                      @if (l.decided_at) {
                        <span class="text-fg-subtle">{{ l.decided_at | localDay }}</span>
                      }
                    </a>
                  }
                  @if (r.open_evaluation_id) {
                    <a
                      [routerLink]="['/suppliers', s.id, 'evaluations', r.open_evaluation_id]"
                      class="font-semibold text-accent hover:underline"
                    >
                      {{ 'suppliers.required.inProgress' | transloco }}
                      <span aria-hidden="true">→</span>
                    </a>
                  } @else if (!r.done && canWrite()) {
                    <app-button size="sm" variant="secondary" (click)="startRequested.emit(r.kind)">
                      {{ 'suppliers.required.start' | transloco }}
                    </app-button>
                  } @else if (!r.done) {
                    <span class="text-fg-subtle">{{
                      'suppliers.required.notStarted' | transloco
                    }}</span>
                  }
                </span>
              </li>
            }
          </ul>
        </div>
        @if (items().length) {
          <h3 class="px-5 pb-1 text-meta font-semibold text-fg-muted">
            {{ 'suppliers.evaluations.history' | transloco }}
          </h3>
        }
      }
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
              (cta)="startRequested.emit(null)"
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
  readonly startRequested = output<EvaluationKind | null>();

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

  protected scoreOf(score: number | null) {
    return scoreParams(score, null, this.language.locale());
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
