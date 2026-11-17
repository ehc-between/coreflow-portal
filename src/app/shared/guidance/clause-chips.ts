import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TutorService } from '../../core/guidance/tutor.service';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { parseClause } from '../requirement-links/clause-picker';
import { fixedShortName, shortNameKey } from '../requirement-links/requirement-label';

/** A teaching link: the clause ref and its readable label. */
export interface TeachingClause {
  readonly ref: string;
  /** "ISO 27001 · A.6.3", "Felles ISO-krav · 7.2", "GDPR · 32". */
  readonly label: string;
  /** Harmonised Structure clause (shared by every ISO management-system standard). */
  readonly shared: boolean;
}

/** Translate-function shape (`LanguageService.translate`). */
type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Readable label of a teaching clause ref, never "ISO HS" (plan 2.1). */
export function teachingClause(ref: string, t: Translate): TeachingClause {
  const parsed = parseClause(ref);
  const key = shortNameKey(parsed.framework);
  const short = key ? t(key) : fixedShortName(parsed.framework);
  return {
    ref,
    label: short ? `${short} · ${parsed.number}` : ref,
    shared: parsed.framework === 'hs',
  };
}

/**
 * Teaching references to clauses (`hs:7.2`, `iso27001:A.6.3`): plain text
 * links, never pills, so they cannot be mistaken for evidence (plan 2.1, "two
 * visual languages"). Clicking one asks the assistant, in tutor mode, to
 * explain that clause. With `lead` the list reads "Les om: …".
 */
@Component({
  selector: 'app-clause-chips',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('guidance', 'standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex flex-wrap items-baseline gap-x-1 text-meta' },
  template: `
    @if (lead() && chips().length > 0) {
      <span class="text-fg-subtle">{{ 'standards.reqs.teach.readAbout' | transloco }}</span>
    }
    @for (chip of chips(); track chip.ref; let last = $last) {
      <span class="inline-flex items-baseline">
        <button
          type="button"
          data-testid="clause-chip"
          class="rounded-sm font-medium text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'guidance.why.explainClause' | transloco: { clause: chip.label }"
          [title]="
            (chip.shared ? 'standards.reqs.teach.sharedTooltip' : 'standards.reqs.teach.tooltip')
              | transloco
          "
          (click)="tutor.explainClause(chip.ref)"
        >
          {{ chip.label }}
        </button>
        @if (!last) {
          <span class="text-fg-subtle">,</span>
        }
      </span>
    }
  `,
})
export class ClauseChips {
  protected readonly tutor = inject(TutorService);
  private readonly language = inject(LanguageService);

  readonly clauses = input<readonly string[]>([]);
  /** Prefix the links with "Les om:" (inside explanations). */
  readonly lead = input(false);

  protected readonly chips = computed(() =>
    this.clauses()
      .filter((ref) => !!ref)
      .map((ref) => teachingClause(ref, (key, params) => this.language.translate(key, params))),
  );
}
