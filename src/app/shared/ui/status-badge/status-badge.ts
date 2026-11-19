import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { Badge } from '../badge/badge';
import {
  ToneMeaning,
  humaniseValue,
  plainStatus,
  plainStatusKey,
  toneFor,
  toneLabelKey,
} from '../tones';

/**
 * A status / severity badge with the shared colour rule and a translated label.
 *
 *   <app-status-badge meaning="severity" [value]="risk.level" />
 *   <app-status-badge meaning="lifecycle" [value]="d.status" labelKey="deviations.status.open" />
 *
 * The label is `labelKey` when given, else `common.severity.<value>` (severity) or
 * `common.status.<value>`; a value without a translation is shown humanised
 * ("under_review" → "Under review"), never as the raw enum.
 *
 * `plain` (lifecycle only) shows one of the four plain status words instead
 * (Open / In progress / Overdue / Closed, copy rule U41) and keeps the colour of
 * the real state; the real state is the tooltip. Unknown values keep their own label.
 */
@Component({
  selector: 'app-status-badge',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (label()) {
      <app-badge [tone]="tone()" [attr.data-tone]="tone()" [attr.title]="realLabel()">{{
        label()
      }}</app-badge>
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
  /** Show the plain status word (Open / In progress / Overdue / Closed) for a lifecycle value. */
  readonly plain = input(false);

  protected readonly tone = computed(() => toneFor(this.meaning(), this.value()));

  private readonly plainKey = computed(() => {
    const status =
      this.plain() && this.meaning() === 'lifecycle' && !this.labelKey()
        ? plainStatus(this.value())
        : null;
    return status ? plainStatusKey(status) : null;
  });

  /** The real state as a tooltip when the plain word stands in for it. */
  protected readonly realLabel = computed(() => {
    const value = this.value();
    if (!this.plainKey() || !value) {
      return null;
    }
    const key = toneLabelKey('lifecycle', value);
    const text = this.language.translate(key);
    return text && text !== key ? text : humaniseValue(value);
  });

  protected readonly label = computed(() => {
    const value = this.value();
    const plain = this.plainKey();
    if (plain) {
      return this.language.translate(plain);
    }
    const key = this.labelKey() || (value ? toneLabelKey(this.meaning(), value) : '');
    if (!key) {
      return '';
    }
    const text = this.language.translate(key, this.labelParams());
    return text && text !== key ? text : humaniseValue(value);
  });
}
