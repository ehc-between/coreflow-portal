import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TutorService } from '../../../core/guidance/tutor.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { teachingClause } from '../../../shared/guidance/clause-chips';
import { fixedShortName } from '../../../shared/requirement-links/requirement-label';
import { formatClauseItem } from '../management-review-display';

/**
 * The clause an input answers, readable instead of raw (`hs:9.3.2 c` ->
 * "Felles ISO-krav · 9.3.2 c)"): a plain teaching link, never a pill, so it is
 * not mistaken for evidence. Clicking it asks the assistant to explain the
 * clause. A shared ISO clause gets a tooltip naming the standards it covers
 * here ("Felles krav i ISO 9001, ISO 27001 …").
 */
@Component({
  selector: 'app-mr-clause-ref',
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <button
      type="button"
      data-testid="mr-clause-ref"
      class="truncate rounded-sm text-meta font-medium text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      [title]="tooltip()"
      [attr.aria-label]="ariaLabel()"
      (click)="$event.stopPropagation(); $event.preventDefault(); explain()"
    >
      {{ label() }}
    </button>
  `,
})
export class ClauseRef {
  private readonly tutor = inject(TutorService);
  private readonly language = inject(LanguageService);

  /** Canonical clause ref (`hs:9.3.2`, `iso9001:9.3.2`). */
  readonly ref = input.required<string>();
  /** The list item inside the clause (`c 1`). */
  readonly item = input<string | null | undefined>(null);
  /** Frameworks of the review, named in the tooltip of a shared ISO clause. */
  readonly frameworks = input<readonly string[]>([]);

  private readonly clause = computed(() =>
    teachingClause(this.ref(), (key, params) => this.language.translate(key, params)),
  );

  protected readonly label = computed(() => {
    const item = formatClauseItem(this.item());
    return item ? `${this.clause().label} ${item}` : this.clause().label;
  });

  protected readonly tooltip = computed(() => {
    if (!this.clause().shared) {
      return this.language.translate('managementReview.clause.tooltip');
    }
    const names = this.frameworks()
      .map((f) => fixedShortName(f))
      .filter((n): n is string => !!n);
    return names.length
      ? this.language.translate('managementReview.clause.sharedIn', { standards: names.join(', ') })
      : this.language.translate('managementReview.clause.shared');
  });

  protected readonly ariaLabel = computed(() =>
    this.language.translate('managementReview.clause.explain', { clause: this.label() }),
  );

  protected explain(): void {
    this.tutor.explainClause(this.ref());
  }
}
