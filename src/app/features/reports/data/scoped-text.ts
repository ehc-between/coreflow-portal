import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { flattenScopedKey, parseScopedKey } from '../../../core/notifications/notification-text';

/**
 * Translates backend keys of the form `"<scope>:<path>"` (widget titles such as
 * `reports:widgets.readiness.title`, or `risk:widgets.heatMap.title` from a
 * module that registers a metric), loading the scope file on first use.
 * `text()` is signal-tracked, so a `computed()` refreshes once the file arrives.
 */
@Injectable({ providedIn: 'root' })
export class ScopedText {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly requested = new Set<string>();

  /** The translation of `key`, or `fallback` while (or if) it is missing. */
  text(key: string | null | undefined, fallback = ''): string {
    if (!key) {
      return fallback;
    }
    const scoped = parseScopedKey(key);
    if (scoped) {
      this.ensure(scoped.scope);
    }
    const flat = flattenScopedKey(key);
    const text = this.language.translate(flat);
    return text && text !== flat ? text : fallback;
  }

  private ensure(scope: string): void {
    const path = `${scope}/${this.language.active()}`;
    if (this.requested.has(path)) {
      return;
    }
    this.requested.add(path);
    // A missing scope file just keeps the fallback.
    this.transloco.load(path).subscribe({ error: () => undefined });
  }
}
