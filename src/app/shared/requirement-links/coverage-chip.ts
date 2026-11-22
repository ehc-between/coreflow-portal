import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { RequirementCoverageCounts } from '../../core/standards/standards.models';
import { pluralKey } from '../i18n/plural';
import { Icon } from '../ui/icon/icon';
import { RequirementCoverageService } from './requirement-coverage.service';
import { RequirementsVisibilityService } from '../../core/shell/requirements-visibility.service';

/** What a coverage chip says. */
export type CoverageState = 'documents' | 'suggested' | 'none';

export function coverageState(counts: RequirementCoverageCounts): CoverageState {
  if (counts.confirmed > 0) {
    return 'documents';
  }
  return counts.suggested > 0 ? 'suggested' : 'none';
}

/**
 * Requirement coverage of a record, for list rows. Compact and single-line:
 * a small pill "✓ 3 krav" (plus a secondary "2 forslag" beside it, wrapping
 * under it only when the column is too narrow), a dashed "13 forslag" pill,
 * or a muted "–". The full sentence ("Dokumenterer 3 krav, 2 forslag venter
 * på vurdering") is the tooltip and the screen-reader text.
 *
 * Pass `counts` directly, or `entityType` + `entityId` and the chip reads them
 * from `RequirementCoverageService` (every chip of a list is fetched in one
 * batched request). Renders nothing without `standards:read` or until known.
 */
@Component({
  selector: 'app-coverage-chip',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex max-w-full items-center align-middle',
    '[style.display]': "reqVis.show() ? null : 'none'",
  },
  template: `
    @if (resolved(); as c) {
      @switch (state()) {
        @case ('documents') {
          @let documents =
            plural('standards.reqs.coverage.documents', c.confirmed)
              | transloco: { count: c.confirmed };
          @let summary =
            c.suggested > 0
              ? ('standards.reqs.coverage.summary'
                | transloco
                  : {
                      documents,
                      pending:
                        (plural('standards.reqs.coverage.pending', c.suggested)
                        | transloco: { count: c.suggested }),
                    })
              : documents;
          <span
            class="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta leading-5"
            [title]="summary"
            data-testid="coverage-chip"
            data-state="documents"
          >
            <span
              class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 font-medium whitespace-nowrap text-fg-muted"
              aria-hidden="true"
            >
              <app-icon name="checkcircle" [size]="12" class="text-pass" />
              {{
                plural('standards.reqs.coverage.count', c.confirmed)
                  | transloco: { count: c.confirmed }
              }}
            </span>
            @if (c.suggested > 0) {
              <span class="whitespace-nowrap text-accent" aria-hidden="true">{{
                plural('standards.reqs.coverage.suggested', c.suggested)
                  | transloco: { count: c.suggested }
              }}</span>
            }
            <span class="sr-only">{{ summary }}</span>
          </span>
        }
        @case ('suggested') {
          @let pending =
            plural('standards.reqs.coverage.pending', c.suggested)
              | transloco: { count: c.suggested };
          <span
            class="inline-flex items-center gap-1 rounded-full border border-dashed border-accent-border px-2 text-meta leading-5 font-medium whitespace-nowrap text-accent"
            [title]="pending"
            data-testid="coverage-chip"
            data-state="suggested"
          >
            <app-icon name="spark" [size]="12" />
            <span aria-hidden="true">{{
              plural('standards.reqs.coverage.suggested', c.suggested)
                | transloco: { count: c.suggested }
            }}</span>
            <span class="sr-only">{{ pending }}</span>
          </span>
        }
        @default {
          @let none = 'standards.reqs.coverage.none' | transloco;
          <span
            class="inline-flex items-center px-1 text-meta leading-5 text-fg-subtle"
            [title]="none"
            data-testid="coverage-chip"
            data-state="none"
          >
            <span aria-hidden="true">–</span>
            <span class="sr-only">{{ none }}</span>
          </span>
        }
      }
    }
  `,
})
export class CoverageChip {
  /** "Vis krav" (IA v2 §4.3): hidden unless the switch is on or on an expert page. */
  protected readonly reqVis = inject(RequirementsVisibilityService);
  private readonly coverage = inject(RequirementCoverageService);

  readonly counts = input<RequirementCoverageCounts | null | undefined>(undefined);
  readonly entityType = input<string | null | undefined>(null);
  readonly entityId = input<string | null | undefined>(null);

  protected readonly plural = pluralKey;
  protected readonly resolved = computed<RequirementCoverageCounts | null>(() => {
    if (!this.coverage.canRead()) {
      return null;
    }
    const given = this.counts();
    if (given) {
      return given;
    }
    const type = this.entityType();
    const id = this.entityId();
    return type && id ? this.coverage.counts(type, id) : null;
  });
  protected readonly state = computed(() => {
    const c = this.resolved();
    return c ? coverageState(c) : 'none';
  });
}
