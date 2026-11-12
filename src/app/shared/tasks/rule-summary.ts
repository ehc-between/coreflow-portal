import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { LanguageService } from '../../core/i18n/language.service';
import { formatLocalDay } from '../locale/locale-pipes';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { describeRrule } from './rrule';

/**
 * A recurrence rule in words ("Every 2 weeks · on Monday, Wednesday · 10 times"),
 * in the active language. Unsupported rules render as the raw rule text.
 */
@Component({
  selector: 'app-rule-summary',
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ text() }}`,
})
export class RuleSummary {
  private readonly language = inject(LanguageService);

  readonly rrule = input<string | null>(null);

  protected readonly text = computed(() => {
    const fragments = describeRrule(this.rrule());
    if (!fragments) {
      return this.rrule() ?? '';
    }
    const locale = this.language.locale();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const list = (items: readonly string[]) =>
      new Intl.ListFormat(this.language.active(), { style: 'long', type: 'conjunction' }).format(
        items,
      );
    return fragments
      .map((f) => {
        const params = { ...f.params };
        if (Array.isArray(params['days'])) {
          params['days'] = list((params['days'] as string[]).map((k) => t(k)));
        }
        if (typeof params['month'] === 'string') {
          params['month'] = t(params['month']);
        }
        if (typeof params['date'] === 'string') {
          params['date'] = formatLocalDay(params['date'], 'mediumDate', locale);
        }
        return t(f.key, params);
      })
      .join(' · ');
  });
}
