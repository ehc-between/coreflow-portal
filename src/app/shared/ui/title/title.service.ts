import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';

const APP_NAME = 'CoreFlow';

/**
 * The document `<title>`: "<page title> · CoreFlow".
 *
 * Two sources, the most specific wins:
 * 1. A page title set by the page itself (`app-page-header` calls `set()` with its
 *    translated h1, so the tab name always equals the heading).
 * 2. The route's `title` (an i18n key, e.g. `modules.names.risk`), set by
 *    {@link CoreflowTitleStrategy} on every navigation.
 *
 * Both are signals, so the title follows a runtime language switch.
 */
@Injectable({ providedIn: 'root' })
export class TitleService {
  private readonly language = inject(LanguageService);
  private readonly title = inject(Title);

  private readonly routeKey = signal<string | null>(null);
  /** Page titles by owner; the latest one wins (nested headers, dialogs). */
  private readonly pages = signal<readonly { owner: object; text: string }[]>([]);

  /** The full document title. */
  readonly documentTitle = computed(() => {
    const page = this.pages().at(-1)?.text?.trim();
    const key = this.routeKey();
    let text = page || '';
    if (!text && key) {
      const translated = this.language.translate(key);
      text = translated && translated !== key ? translated : '';
    }
    return text ? `${text} · ${APP_NAME}` : APP_NAME;
  });

  constructor() {
    effect(() => this.title.setTitle(this.documentTitle()));
  }

  /** Route title key from the router (see CoreflowTitleStrategy). */
  setRouteKey(key: string | null): void {
    this.routeKey.set(key);
  }

  /** Set (or replace) the page title owned by `owner`. An empty text removes it. */
  set(owner: object, text: string): void {
    this.pages.update((list) => {
      const rest = list.filter((p) => p.owner !== owner);
      return text.trim() ? [...rest, { owner, text }] : rest;
    });
  }

  /** Drop the page title owned by `owner` (call on destroy). */
  clear(owner: object): void {
    this.pages.update((list) => list.filter((p) => p.owner !== owner));
  }
}

/**
 * Router title strategy: a route's `title` is an i18n key (`modules.names.<key>`,
 * `nav.dashboard` …), translated by {@link TitleService}. Registered in app.config.
 */
@Injectable({ providedIn: 'root' })
export class CoreflowTitleStrategy extends TitleStrategy {
  private readonly titles = inject(TitleService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.titles.setRouteKey(this.buildTitle(snapshot) ?? null);
  }
}
