import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { OutputsLink } from '../../outputs/outputs-link';
import { Icon } from '../icon/icon';
import { OverflowMenu } from '../overflow-menu/overflow-menu';
import { TitleService } from '../title/title.service';

/** One breadcrumb. `labelKey` is an i18n key; `label` is literal text (a record title). */
export interface Breadcrumb {
  readonly labelKey?: string;
  readonly label?: string;
  readonly params?: Record<string, unknown>;
  /** Router link; the last crumb (the current page) usually has none. */
  readonly link?: string | readonly unknown[];
}

/**
 * The header of every page (docs/ux-guide.md, "Page anatomy"):
 *
 *   breadcrumbs (Module › Sub-area › Record)
 *   [lead] (legacy custom heading block), h1 + optional [meta] line (code · type · status on detail pages) + description
 *   actions on the right: [secondary] (≤ 2) · [primary] (one) · "Mer ⋯" ([overflow]) · ⚙
 *   ("Dokumenter og rapporter" leads the actions when `outputsModule` / `outputsStandard` is set)
 *
 *   <app-page-header titleKey="modules.names.risk" descriptionKey="risk.list.description"
 *       [breadcrumbs]="[{ labelKey: 'modules.names.risk' }]" settingsLink="/settings/modules/risk">
 *     <app-button primary (click)="create()">Ny risiko</app-button>
 *     <app-button secondary variant="secondary">Eksporter</app-button>
 *     <button appMenuItem overflow [danger]="true">Slett</button>
 *   </app-page-header>
 *
 * The h1 also becomes the document title ("<h1> · CoreFlow"). On phones the
 * breadcrumb trail collapses to one "‹ parent" link.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, TranslocoPipe, Icon, OverflowMenu, OutputsLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="mb-5" data-testid="page-header">
      @if (crumbs().length > 1) {
        <nav
          [attr.aria-label]="'ui.pageHeader.breadcrumbs' | transloco"
          class="mb-2 hidden sm:block"
        >
          <ol class="flex flex-wrap items-center gap-1 text-meta text-fg-muted">
            @for (crumb of crumbs(); track $index; let last = $last) {
              <li class="flex min-w-0 items-center gap-1">
                @if (crumb.link && !last) {
                  <a
                    [routerLink]="crumb.link"
                    class="max-w-[28ch] truncate font-semibold hover:text-fg hover:underline"
                    >{{ crumb.text }}</a
                  >
                } @else {
                  <span class="max-w-[40ch] truncate" [attr.aria-current]="last ? 'page' : null">{{
                    crumb.text
                  }}</span>
                }
                @if (!last) {
                  <span aria-hidden="true" class="text-fg-subtle">›</span>
                }
              </li>
            }
          </ol>
        </nav>
      }
      @if (parent(); as up) {
        <a
          [routerLink]="up.link"
          data-testid="page-header-back"
          class="mb-2 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-fg-muted hover:text-fg"
          [class.sm:hidden]="crumbs().length > 1"
        >
          <app-icon name="back" [size]="15" />
          {{ up.text }}
        </a>
      }

      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-[min(100%,420px)]">
          <ng-content select="[lead]" />
          @if (heading()) {
            <h1
              class="font-display text-page font-bold text-fg [overflow-wrap:anywhere]"
              [attr.data-testid]="titleTestId()"
            >
              {{ heading() }}
            </h1>
          }
          <div
            class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted empty:hidden"
          >
            <ng-content select="[meta]" />
          </div>
          @if (description(); as text) {
            <p class="mt-1.5 max-w-[72ch] text-body text-fg-muted">{{ text }}</p>
          }
          <ng-content select="[intro]" />
        </div>
        <div class="flex flex-wrap items-center gap-2 empty:hidden" data-testid="page-actions">
          @if (outputsModule() || outputsStandard()) {
            <app-outputs-link
              [module]="outputsModule() ?? null"
              [standard]="outputsStandard() ?? null"
            />
          }
          <ng-content select="[secondary]" />
          <ng-content select="[primary]" />
          <app-overflow-menu>
            <ng-content select="[overflow]" />
          </app-overflow-menu>
          @if (settingsLink(); as link) {
            <a
              [routerLink]="link"
              data-testid="page-settings"
              [attr.aria-label]="'ui.pageHeader.settings' | transloco"
              [title]="'ui.pageHeader.settings' | transloco"
              class="inline-flex h-9 w-9 items-center justify-center rounded-tile border border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <app-icon name="gear" [size]="17" />
            </a>
          }
        </div>
      </div>
    </header>
  `,
})
export class PageHeader {
  private readonly language = inject(LanguageService);
  private readonly titles = inject(TitleService);

  /** i18n key of the h1. On module roots: `modules.names.<key>` (= the nav label). */
  readonly titleKey = input<string | null | undefined>(null);
  readonly titleParams = input<Record<string, unknown> | undefined>(undefined);
  /** Literal h1 text (a record title); wins over `titleKey`. */
  readonly title = input<string | null | undefined>(null);
  readonly descriptionKey = input<string | null | undefined>(null);
  readonly descriptionParams = input<Record<string, unknown> | undefined>(undefined);
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
  /** Gear link to the module's settings (types, templates, matrices…). */
  readonly settingsLink = input<string | readonly unknown[] | null | undefined>(null);
  /** "Back" link, used when there are no breadcrumbs (and on phones). */
  readonly backLink = input<string | readonly unknown[] | null | undefined>(null);
  readonly backLabelKey = input<string | null | undefined>(null);
  /** Module whose outputs the "Dokumenter og rapporter" action opens (the library, filtered; U11). */
  readonly outputsModule = input<string | null | undefined>(null);
  /** Standard whose outputs the "Dokumenter og rapporter" action opens. */
  readonly outputsStandard = input<string | null | undefined>(null);
  /** `data-testid` of the h1 (kept stable for the kit frames' tests). */
  readonly titleTestId = input('page-title');
  /** Set the document title from the h1 (default on). */
  readonly setDocumentTitle = input(true);

  protected readonly heading = computed(() => {
    const literal = this.title();
    if (literal) {
      return literal;
    }
    const key = this.titleKey();
    return key ? this.language.translate(key, this.titleParams()) : '';
  });

  protected readonly description = computed(() => {
    const key = this.descriptionKey();
    return key ? this.language.translate(key, this.descriptionParams()) : '';
  });

  protected readonly crumbs = computed(() =>
    this.breadcrumbs().map((crumb) => ({
      link: crumb.link,
      text:
        crumb.label ??
        (crumb.labelKey ? this.language.translate(crumb.labelKey, crumb.params) : ''),
    })),
  );

  /** The one "back" link for phones: the nearest linked crumb, else `backLink`. */
  protected readonly parent = computed<{ link: string | readonly unknown[]; text: string } | null>(
    () => {
      const crumbs = this.crumbs();
      for (let i = crumbs.length - 2; i >= 0; i--) {
        const link = crumbs[i].link;
        if (link) {
          return { link, text: crumbs[i].text };
        }
      }
      const back = this.backLink();
      if (!back) {
        return null;
      }
      return {
        link: back,
        text: this.language.translate(this.backLabelKey() || 'ui.pageHeader.back'),
      };
    },
  );

  constructor() {
    effect(() => {
      if (this.setDocumentTitle()) {
        this.titles.set(this, this.heading());
      } else {
        this.titles.clear(this);
      }
    });
    inject(DestroyRef).onDestroy(() => this.titles.clear(this));
  }
}
