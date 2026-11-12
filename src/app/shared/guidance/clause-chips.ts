import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatClause } from '../../core/guidance/clause-ref';
import { TutorService } from '../../core/guidance/tutor.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';

/**
 * Clause reference chips (`hs:7.2`, `iso27001:A.6.3`). Clicking a chip asks the
 * assistant, in tutor mode, to explain that clause.
 */
@Component({
  selector: 'app-clause-chips',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap gap-1.5' },
  template: `
    @for (chip of chips(); track chip.ref) {
      <button
        type="button"
        data-testid="clause-chip"
        class="inline-flex h-6 items-center rounded-full border border-accent-border bg-accent-soft px-2.5 text-[12px] font-semibold text-accent hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="'guidance.why.explainClause' | transloco: { clause: chip.label }"
        (click)="tutor.explainClause(chip.ref)"
      >
        {{ chip.label }}
      </button>
    }
  `,
})
export class ClauseChips {
  protected readonly tutor = inject(TutorService);
  private readonly language = inject(LanguageService);

  readonly clauses = input<readonly string[]>([]);

  protected readonly chips = computed(() =>
    this.clauses().map((ref) => ({
      ref,
      label: formatClause(ref, (key, params) => this.language.translate(key, params)),
    })),
  );
}
