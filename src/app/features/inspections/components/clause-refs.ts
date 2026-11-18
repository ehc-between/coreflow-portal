import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { parseClause } from '../../../shared/requirement-links/clause-picker';
import { fixedShortName, shortNameKey } from '../../../shared/requirement-links/requirement-label';
import { InspectionReferences } from '../data/inspection-references';

interface ClauseView {
  readonly ref: string;
  readonly fixed: string | null;
  readonly key: string | null;
  readonly number: string;
  readonly link: readonly string[] | null;
}

/**
 * The clauses a checklist question cites, as readable chips ("ISO 45001 · 8.1.2",
 * "Felles ISO-krav · 9.1"), never the stored ref. A chip opens the clause in
 * Standards when the org has that standard. Renders nothing for an empty list.
 * These are references, not evidence: the requirement links themselves show in
 * "Krav dette dokumenterer".
 */
@Component({
  selector: 'app-clause-refs',
  imports: [RouterLink, TranslocoPipe],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (views().length > 0) {
      <span class="inline-flex flex-wrap items-center gap-1" data-testid="clause-refs">
        @if (labelKey(); as key) {
          <span class="text-meta text-fg-subtle">{{ key | transloco }}</span>
        }
        @for (c of views(); track c.ref) {
          @if (c.link) {
            <a
              [routerLink]="c.link"
              class="inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-meta font-medium text-fg-muted hover:border-accent hover:text-accent"
              [title]="'inspections.clauses.open' | transloco"
              data-testid="clause-ref"
              >{{ c.key ? (c.key | transloco) : c.fixed }} · {{ c.number }}</a
            >
          } @else {
            <span
              class="inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-meta font-medium text-fg-muted"
              data-testid="clause-ref"
              >{{ c.key ? (c.key | transloco) : c.fixed }} · {{ c.number }}</span
            >
          }
        }
      </span>
    }
  `,
})
export class ClauseRefs {
  private readonly references = inject(InspectionReferences);

  /** Canonical clause refs (`iso45001:8.1.2`, `hs:9.1`). */
  readonly refs = input<readonly string[] | null | undefined>([]);
  /** Optional lead-in ("Krav:"), an i18n key. */
  readonly labelKey = input<string | null>(null);

  protected readonly views = computed<readonly ClauseView[]>(() => {
    const keys = this.references.standardKeys();
    return (this.refs() ?? []).map((ref) => {
      const p = parseClause(ref);
      const standardKey = keys[p.framework];
      return {
        ref,
        key: shortNameKey(p.framework),
        fixed: fixedShortName(p.framework) ?? (p.framework.toUpperCase() || null),
        number: p.number,
        link: standardKey ? ['/standards', standardKey, p.number] : null,
      };
    });
  });

  constructor() {
    this.references.ensureStandardKeys();
  }
}
