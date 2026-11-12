import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../i18n/language.service';
import { NotificationText, notificationText, scopesFor } from './notification-text';
import { UserNotification } from './user-notification.models';

/**
 * Renders notification titles, including scoped title keys
 * (`"<scope>:<path>"`) whose module translation file is loaded on demand.
 * `resolve()` is signal-tracked: call it in a `computed()` and the row updates
 * when the language switches or a scope file arrives.
 */
@Injectable({ providedIn: 'root' })
export class NotificationTextResolver {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  /** `<scope>/<lang>` paths already requested (Transloco caches the loads too). */
  private readonly requested = new Set<string>();

  /** Load the translation scopes these notifications need for the active language. */
  ensureScopes(notifications: readonly UserNotification[]): void {
    const lang = this.language.active();
    for (const scope of scopesFor(notifications)) {
      const path = `${scope}/${lang}`;
      if (this.requested.has(path)) {
        continue;
      }
      this.requested.add(path);
      // A missing scope file just keeps the generic fallback title.
      this.transloco.load(path).subscribe({ error: () => undefined });
    }
  }

  resolve(notification: UserNotification): NotificationText {
    const translate = (key: string): string => this.language.translate(key);
    return notificationText(notification, this.language.active(), {
      has: (key) => translate(key) !== key,
      translate,
    });
  }
}
