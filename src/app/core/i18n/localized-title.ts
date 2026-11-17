import { Injectable, inject, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { flattenScopedKey, parseScopedKey } from '../notifications/notification-text';
import { LanguageService } from './language.service';

/**
 * A record whose display title may come as an i18n key: generated tasks (and
 * My Work items) carry `title_key` (`"<scope>:<path>"`, e.g.
 * `privacy:tasks.breachAssess`) plus `title_params`, with the stored English
 * `title` as the fallback. A hand-edited title has no key.
 */
export interface LocalizedTitleSource {
  readonly title: string;
  readonly title_key?: string | null;
  readonly title_params?: Readonly<Record<string, unknown>> | null;
}

/**
 * Renders `title_key` + `title_params` in the active language, loading the
 * key's module scope on demand, and falls back to `title` while the scope is
 * loading or when the key has no translation (a newer backend). Signal-tracked:
 * call `resolve()` in a template or `computed()` and it refreshes on a
 * language switch or once the scope file arrives.
 */
@Injectable({ providedIn: 'root' })
export class LocalizedTitleResolver {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  /** `<scope>/<lang>` paths already requested (Transloco caches the loads too). */
  private readonly requested = new Set<string>();

  resolve(source: LocalizedTitleSource | null | undefined): string {
    if (!source) {
      return '';
    }
    const key = source.title_key?.trim();
    if (!key) {
      return source.title;
    }
    const scoped = parseScopedKey(key);
    if (scoped) {
      const lang = this.language.active();
      untracked(() => this.ensureScope(scoped.scope, lang));
    }
    const flat = flattenScopedKey(key);
    // translate() ties the caller to language switches and file loads; the
    // lookup tells a real translation from the missing-key output.
    const text = this.language.translate(flat, { ...(source.title_params ?? {}) });
    const known = typeof this.transloco.getTranslation(this.language.active())?.[flat] === 'string';
    return known && text ? text : source.title;
  }

  private ensureScope(scope: string, lang: string): void {
    const path = `${scope}/${lang}`;
    if (this.requested.has(path)) {
      return;
    }
    this.requested.add(path);
    // A missing scope file keeps the stored title.
    this.transloco.load(path).subscribe({ error: () => undefined });
  }
}
