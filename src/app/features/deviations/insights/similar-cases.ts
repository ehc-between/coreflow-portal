import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SimilarDeviation, StatusCategory } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Badge } from '../../../shared/ui/badge/badge';
import { DeviationStatusLabels, StatusSubject } from '../deviation-status';

/**
 * Similar past deviations (permission-filtered full-text search, no AI), each
 * with its root cause so lessons carry over, plus an AI button that explains
 * what the cases have in common and what worked before.
 */
@Component({
  selector: 'app-similar-cases',
  imports: [RouterLink, TranslocoPipe, Badge, AiAssistButton, LocalDatePipe, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-label]="'deviations.similar.title' | transloco">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'deviations.similar.title' | transloco }}
        </h2>
        @if (items().length) {
          <app-ai-assist-button
            assist="deviations.similar_cases"
            labelKey="deviations.assist.compareCases"
            entityType="deviation"
            [entityId]="deviationId()"
            (text)="analysis.set($event)"
          />
        }
      </div>
      @if (analysis()) {
        <div
          class="mb-3 rounded-tile border border-accent-border bg-accent-soft/30 px-3 py-2.5 text-[13px] text-fg"
          aria-live="polite"
          data-testid="similar-analysis"
        >
          <div [innerHTML]="analysis() | appMarkdown"></div>
          <p class="mt-1.5 text-[11.5px] text-fg-subtle">
            {{ 'deviations.assist.reviewNote' | transloco }}
          </p>
        </div>
      }
      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (items().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'deviations.similar.empty' | transloco }}</p>
      } @else {
        <ul class="flex flex-col divide-y divide-border">
          @for (item of items(); track item.id) {
            <li class="py-2.5">
              <a
                [routerLink]="['/deviations', item.id]"
                class="group flex flex-col gap-0.5 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span class="flex flex-wrap items-center gap-1.5">
                  <span class="font-mono text-[12px] text-fg-subtle">{{ item.code }}</span>
                  <app-badge [tone]="labels.tone(statusOf(item))">{{
                    labels.label(statusOf(item))
                  }}</app-badge>
                  <span class="text-[12px] text-fg-subtle">{{
                    item.raised_at | localDate: 'mediumDate'
                  }}</span>
                </span>
                <span class="text-[13.5px] font-semibold text-fg group-hover:underline">{{
                  item.title
                }}</span>
                @if (item.root_cause) {
                  <span class="line-clamp-2 text-[12.5px] text-fg-muted">
                    {{ 'deviations.similar.rootCause' | transloco: { cause: item.root_cause } }}
                  </span>
                }
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class SimilarCases {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly labels = inject(DeviationStatusLabels);

  readonly deviationId = input.required<string>();

  protected readonly items = signal<readonly SimilarDeviation[]>([]);
  protected readonly loading = signal(false);
  protected readonly analysis = signal('');

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.deviationId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected statusOf(item: SimilarDeviation): StatusSubject {
    return {
      status: item.status,
      status_category: item.status_category as StatusCategory,
      // Similar cases carry no version id; a non-legacy key resolves as a workflow state.
      record_type_version_id: null,
    };
  }

  private load(orgId: string | null, id: string): void {
    this.items.set([]);
    this.analysis.set('');
    if (!orgId || !id) {
      return;
    }
    this.loading.set(true);
    this.api.similar(orgId, id, 5).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
