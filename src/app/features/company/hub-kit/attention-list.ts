import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { actionView, keyScope, splitUrl } from '../../dashboard/data/home-format';
import { NextAction } from '../../dashboard/data/home.models';
import { actionTone } from './hub-data';
import { DOT_CLASS } from './hub-tiles';

/**
 * The prototype's to-do list ("Dette bør du gjøre nå" / "Dette trenger
 * oppmerksomhet"): a coloured dot, the bold title, a grey line saying why, and one
 * button that does the next thing. Built from the home API's next actions; their
 * texts are keys of the module scopes, loaded here as on Oversikt. The host provides
 * the `home` scope (the action labels).
 */
@Component({
  selector: 'app-attention-list',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (rows().length) {
      <ul class="m-0 flex flex-col p-0" data-testid="attention-list">
        @for (row of rows(); track row.key; let first = $first) {
          <li
            class="flex list-none flex-wrap items-center gap-x-3.5 gap-y-2 py-3.5"
            [class.border-t]="!first"
            [class.border-border]="!first"
            [class.pt-1]="first"
            data-testid="attention-row"
          >
            <span class="h-2.5 w-2.5 flex-none rounded-full" [class]="row.dot"></span>
            <div class="min-w-0 flex-1 basis-[200px]">
              <b class="block font-semibold text-fg [overflow-wrap:anywhere]">{{ row.title }}</b>
              <span class="block text-ui text-fg-muted">{{ row.why }}</span>
            </div>
            <a
              [routerLink]="row.link.path"
              [queryParams]="row.link.query"
              class="inline-flex h-8 flex-none items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              data-testid="attention-cta"
            >
              {{ row.ctaKey | transloco }}
              <span class="sr-only">: {{ row.title }}</span>
            </a>
          </li>
        }
      </ul>
    } @else {
      <p class="text-ui text-fg-muted" data-testid="attention-empty">
        {{ 'hubs.common.nothingUrgent' | transloco }}
      </p>
    }
  `,
})
export class AttentionList {
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly requested = new Set<string>();

  readonly actions = input.required<readonly NextAction[]>();

  constructor() {
    // Module actions carry their module's keys (`training:next.…`): load those scopes.
    effect(() => {
      const lang = this.language.active();
      const scopes = new Set(
        this.actions()
          .flatMap((a) => [keyScope(a.title_key), keyScope(a.why_key)])
          .filter((s): s is string => !!s && s !== 'home'),
      );
      untracked(() => {
        for (const scope of scopes) {
          const path = `${scope}/${lang}`;
          if (!this.requested.has(path)) {
            this.requested.add(path);
            this.transloco.load(path).subscribe({ error: () => undefined });
          }
        }
      });
    });
  }

  protected readonly rows = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return this.actions().map((action) => {
      const view = actionView(action, t);
      return {
        key: view.key,
        title: view.title,
        why: view.why,
        ctaKey: view.ctaKey,
        dot: DOT_CLASS[actionTone(action.kind)],
        link: splitUrl(action.url),
      };
    });
  });
}
