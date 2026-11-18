import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { fixedShortName, frameworkOf } from '../../../shared/requirement-links/requirement-label';

/** The parts of a canonical clause ref (`iso27001:A.6.6`, `hs:7.2`). */
export function splitClause(ref: string): { framework: string; number: string } {
  const at = ref.indexOf(':');
  if (at <= 0) {
    return { framework: '', number: ref };
  }
  return {
    framework: frameworkOf(ref.slice(0, at)),
    number: ref.slice(at + 1).replace(/\.r\d+$/, ''),
  };
}

/** i18n key of the clause title the People pages explain (`people.clauses.iso27001_A_6_6`). */
export function clauseTitleKey(ref: string): string {
  const { framework, number } = splitClause(ref);
  return `people.clauses.${framework}_${number.replace(/\./g, '_')}`;
}

/**
 * A clause in plain words: "ISO 27001 · A.6.6 Taushetserklæring", "Felles ISO-krav ·
 * 7.2 Kompetanse". Never the raw ref and never "ISO HS"; the shared ISO clauses get
 * a tooltip naming the ISO standards they belong to.
 */
@Component({
  selector: 'app-people-clause',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline' },
  template: `<span [attr.title]="tooltip()" data-testid="people-clause">{{ text() }}</span>`,
})
export class PeopleClause {
  private readonly language = inject(LanguageService);

  readonly ref = input.required<string>();
  /** Show the clause title after the number. */
  readonly withTitle = input(true);

  protected readonly text = computed(() => {
    const ref = this.ref();
    const { framework, number } = splitClause(ref);
    const short =
      fixedShortName(framework) ?? this.language.translate(`people.clauses.short.${framework}`);
    const base = `${short} · ${number}`;
    if (!this.withTitle()) {
      return base;
    }
    const key = clauseTitleKey(ref);
    const title = this.language.translate(key);
    return title && title !== key ? `${base} ${title}` : base;
  });

  protected readonly tooltip = computed(() =>
    splitClause(this.ref()).framework === 'hs'
      ? this.language.translate('people.clauses.hsTooltip')
      : null,
  );
}
