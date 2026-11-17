import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { RequirementCoverageCounts } from '../../core/standards/standards.models';
import { pluralKey } from '../i18n/plural';
import { Icon } from '../ui/icon/icon';
import { RequirementCoverageService } from './requirement-coverage.service';

/** What a coverage chip says. */
export type CoverageState = 'documents' | 'suggested' | 'none';

export function coverageState(counts: RequirementCoverageCounts): CoverageState {
  if (counts.confirmed > 0) {
    return 'documents';
  }
  return counts.suggested > 0 ? 'suggested' : 'none';
}

/**
 * Requirement coverage of a record, for list rows: "Dokumenterer 3 krav"
 * (plus "· 2 forslag"), "13 forslag" or "Ikke koblet til krav".
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
  host: { class: 'inline-flex' },
  template: `
    @if (resolved(); as c) {
      @switch (state()) {
        @case ('documents') {
          <span
            class="inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-tile border border-border bg-surface px-2 py-0.5 text-meta font-medium text-fg-muted"
            data-testid="coverage-chip"
            data-state="documents"
          >
            <app-icon name="checkcircle" [size]="12" class="text-pass" />
            <span class="whitespace-nowrap">{{
              plural('standards.reqs.coverage.documents', c.confirmed)
                | transloco: { count: c.confirmed }
            }}</span>
            @if (c.suggested > 0) {
              <span class="whitespace-nowrap text-accent"
                >·
                {{
                  plural('standards.reqs.coverage.suggested', c.suggested)
                    | transloco: { count: c.suggested }
                }}</span
              >
            }
          </span>
        }
        @case ('suggested') {
          <span
            class="inline-flex items-center gap-1 rounded-full border border-dashed border-accent-border bg-surface px-2 py-0.5 text-meta font-medium whitespace-nowrap text-accent"
            data-testid="coverage-chip"
            data-state="suggested"
          >
            <app-icon name="spark" [size]="12" />
            {{
              plural('standards.reqs.coverage.suggested', c.suggested)
                | transloco: { count: c.suggested }
            }}
          </span>
        }
        @default {
          <span
            class="inline-flex items-center rounded-full px-1 py-0.5 text-meta whitespace-nowrap text-fg-subtle"
            data-testid="coverage-chip"
            data-state="none"
          >
            {{ 'standards.reqs.coverage.none' | transloco }}
          </span>
        }
      }
    }
  `,
})
export class CoverageChip {
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
