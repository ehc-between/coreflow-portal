import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { Badge } from '../badge/badge';
import { ToneMeaning, humaniseValue, toneFor, toneLabelKey } from '../tones';

/**
 * A status / severity badge with the shared colour rule and a translated label.
 *
 *   <app-status-badge meaning="severity" [value]="risk.level" />
 *   <app-status-badge meaning="lifecycle" [value]="d.status" labelKey="deviations.status.open" />
 *
 * The label is `labelKey` when given, else `common.severity.<value>` (severity) or
 * `common.status.<value>`; a value without a translation is shown humanised
 * ("under_review" → "Under review"), never as the raw enum.
 */
@Component({
  selector: 'app-status-badge',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (label()) {
      <app-badge [tone]="tone()" [attr.data-tone]="tone()">{{ label() }}</app-badge>
    }
  `,
})
export class StatusBadge {
  private readonly language = inject(LanguageService);

  readonly meaning = input<ToneMeaning>('lifecycle');
  readonly value = input<string | null | undefined>(null);
  /** Explicit label key (e.g. the module's own status label). */
  readonly labelKey = input<string | null | undefined>(null);
  /** Params for `labelKey`. */
  readonly labelParams = input<Record<string, unknown> | undefined>(undefined);

  protected readonly tone = computed(() => toneFor(this.meaning(), this.value()));

  protected readonly label = computed(() => {
    const value = this.value();
    const key = this.labelKey() || (value ? toneLabelKey(this.meaning(), value) : '');
    if (!key) {
      return '';
    }
    const text = this.language.translate(key, this.labelParams());
    return text && text !== key ? text : humaniseValue(value);
  });
}
