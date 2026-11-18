import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, skip } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { Icon } from '../ui/icon/icon';
import { KpiBand } from '../ui/kpi-band/kpi-band';
import { Breadcrumb, PageHeader } from '../ui/page-header/page-header';
import { PromptDialog } from '../ui/prompt-dialog/prompt-dialog';
import { provideKitScope } from './kit-scope';
import { SavedView, SavedViewsService } from './saved-views.service';

const SEARCH_DEBOUNCE_MS = 250;
let nextId = 0;

/**
 * Standard list page of a module (docs/ux-guide.md, "List"):
 *
 *   app-page-header (breadcrumbs, h1 = module name on the module root, description,
 *   `[primary]` / `[secondary]` / `[overflow]` actions, settings gear) →
 *   `[nav]` (app-module-nav, ≤ 4 tabs + "Mer") → `[help]` (app-help-strip) → `[kpis]`
 *   (app-kpi-band: collapsible, ≤ 4 tiles + "Vis alle") → one toolbar row: search ·
 *   `[filters]` (≤ 2, U30) · "Flere filtre" (`[more-filters]`) ·
 *   saved views → the list (default slot) or `[empty]` → `[below]` (why-it-matters).
 *
 * The older `[toolbar]` slot still works (it sits with the secondary actions).
 *
 *   <app-record-list-page titleKey="risk.list.title" scope="risk"
 *       [query]="q()" [filters]="{ status: status() }" [empty]="rows().length === 0"
 *       (search)="q.set($event)" (viewApplied)="applyView($event)">
 *     <app-button toolbar …>New risk</app-button>
 *     <select filters …></select>
 *     <table>…</table>
 *     <app-teaching-empty empty … />
 *   </app-record-list-page>
 *
 * `search` emits the debounced search text. Saved views store the search text
 * plus `filters` in localStorage (`coreflow.views.<scope>.<page>`); applying one
 * emits `search` and `viewApplied` so the page can restore its filters.
 */
@Component({
  selector: 'app-record-list-page',
  imports: [TranslocoPipe, Icon, KpiBand, PageHeader, PromptDialog],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeMenu()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="titleKey()"
        [descriptionKey]="descriptionKey()"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        titleTestId="list-title"
      >
        <ng-container ngProjectAs="[intro]">
          @if (activeView(); as view) {
            <p class="mt-1 text-meta text-fg-muted">
              {{ 'kit.list.activeView' | transloco: { name: view.name } }}
            </p>
          }
          <ng-content select="[intro]" />
        </ng-container>
        <ng-container ngProjectAs="[secondary]"
          ><ng-content select="[toolbar]" /><ng-content select="[secondary]"
        /></ng-container>
        <ng-container ngProjectAs="[primary]"><ng-content select="[primary]" /></ng-container>
        <ng-container ngProjectAs="[overflow]"><ng-content select="[overflow]" /></ng-container>
      </app-page-header>

      <ng-content select="[nav]" />
      <ng-content select="[help]" />

      <app-kpi-band [scope]="scope() + '.' + page()"><ng-content select="[kpis]" /></app-kpi-band>

      <div
        class="relative mb-4 flex flex-wrap items-center gap-2"
        role="search"
        [attr.aria-label]="'ui.list.toolbar' | transloco"
      >
        <div
          class="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="16" class="text-fg-subtle" />
          <label [attr.for]="searchId" class="sr-only">{{ 'kit.list.search' | transloco }}</label>
          <input
            [id]="searchId"
            type="search"
            [value]="text()"
            (input)="text.set($any($event.target).value)"
            [placeholder]="placeholder()"
            class="h-full flex-1 bg-transparent text-ui text-fg outline-none"
            data-testid="list-search"
          />
        </div>
        <ng-content select="[filters]" />

        <div class="sm:relative" #moreHost [class.hidden]="!hasMoreFilters()">
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-tile border border-border bg-bg px-3 text-ui font-semibold text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-expanded]="moreOpen()"
            [attr.aria-controls]="moreId"
            (click)="moreOpen.set(!moreOpen())"
            data-testid="more-filters-button"
          >
            <app-icon name="sliders" [size]="15" />
            {{
              (moreFiltersActive() > 0 ? 'ui.list.moreFiltersCount' : 'ui.list.moreFilters')
                | transloco: { count: moreFiltersActive() }
            }}
          </button>
          <div
            #morePanel
            [id]="moreId"
            [hidden]="!moreOpen()"
            class="absolute left-0 z-30 mt-1 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-pop sm:right-0 sm:left-auto"
            data-testid="more-filters-panel"
          >
            <ng-content select="[more-filters]" />
          </div>
        </div>

        <div class="relative" #menuHost>
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-tile border border-border bg-bg px-3 text-ui font-semibold text-fg-muted hover:text-fg"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-controls]="menuId"
            [attr.aria-label]="'kit.list.viewsMenu' | transloco"
            (click)="menuOpen.set(!menuOpen())"
            data-testid="views-button"
          >
            <app-icon name="sliders" [size]="15" />
            <span class="hidden sm:inline">{{ 'kit.list.views' | transloco }}</span>
          </button>
          @if (menuOpen()) {
            <div
              [id]="menuId"
              class="absolute right-0 z-30 mt-1 w-[260px] rounded-tile border border-border bg-surface p-1.5 shadow-card"
              data-testid="views-menu"
            >
              @for (view of presetViews(); track view.id) {
                <button
                  type="button"
                  class="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-ui text-fg hover:bg-surface-2"
                  [attr.aria-label]="'kit.list.applyView' | transloco: { name: view.name }"
                  (click)="apply(view)"
                  [attr.data-testid]="'preset-view-' + view.id"
                >
                  {{ view.name }}
                </button>
              }
              @if (presetViews().length && views().length) {
                <div class="my-1 border-t border-border" aria-hidden="true"></div>
              }
              @for (view of views(); track view.id) {
                <div class="flex items-center gap-1 rounded-lg hover:bg-surface-2">
                  <button
                    type="button"
                    class="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-ui text-fg"
                    [attr.aria-label]="'kit.list.applyView' | transloco: { name: view.name }"
                    (click)="apply(view)"
                  >
                    {{ view.name }}
                  </button>
                  <button
                    type="button"
                    class="flex flex-none rounded-md p-1 text-fg-subtle hover:text-fail"
                    [attr.aria-label]="'kit.list.deleteView' | transloco: { name: view.name }"
                    (click)="remove(view)"
                  >
                    <app-icon name="x" [size]="13" />
                  </button>
                </div>
              } @empty {
                @if (!presetViews().length) {
                  <p class="px-2.5 py-1.5 text-meta text-fg-muted">
                    {{ 'kit.list.noViews' | transloco }}
                  </p>
                }
              }
              <div class="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-ui font-semibold text-accent hover:bg-surface-2"
                  (click)="openSave()"
                  data-testid="views-save"
                >
                  <app-icon name="plus" [size]="13" />
                  {{ 'kit.list.saveView' | transloco }}
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      @if (empty()) {
        <ng-content select="[empty]" />
      } @else {
        <ng-content />
      }
      <div class="mt-8 empty:hidden"><ng-content select="[below]" /></div>
    </div>

    <app-prompt-dialog
      [open]="saveOpen()"
      [title]="'kit.list.saveViewTitle' | transloco"
      [message]="'kit.list.saveViewMessage' | transloco"
      [label]="'kit.list.viewName' | transloco"
      [placeholder]="'kit.list.viewNamePlaceholder' | transloco"
      [required]="true"
      confirmVariant="primary"
      [confirmLabel]="'kit.list.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="save($event)"
      (cancelled)="saveOpen.set(false)"
    />
  `,
})
export class RecordListPage {
  private readonly language = inject(LanguageService);
  private readonly savedViews = inject(SavedViewsService);

  /** i18n key of the page heading. On a module root: `modules.names.<key>` (= nav label). */
  readonly titleKey = input.required<string>();
  /** One-line description under the h1. */
  readonly descriptionKey = input<string | null | undefined>(null);
  /** Module › sub-area. A module root usually has none. */
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
  /** Gear link to the module's settings (types, templates…). */
  readonly settingsLink = input<string | readonly unknown[] | null | undefined>(null);
  /** How many filters inside "Flere filtre" are set (shown on the button). */
  readonly moreFiltersActive = input(0);
  /** Module scope (portal path), used for the saved-views key and guidance. */
  readonly scope = input.required<string>();
  readonly page = input('list');
  readonly searchPlaceholderKey = input<string | undefined>(undefined);
  /** The current search text (e.g. restored from the URL). */
  readonly query = input('');
  /** The current filter values, stored with a saved view. */
  readonly filters = input<Readonly<Record<string, string>>>({});
  /** Ready-made views of the page (listed first, cannot be deleted). Names are display text. */
  readonly presetViews = input<readonly SavedView[]>([]);
  /** Show the `[empty]` slot instead of the list. */
  readonly empty = input(false);

  /** The debounced search text (name fixed by the platform contract, 11.4). */
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly search = output<string>();
  /** A saved view was applied: restore its filters. */
  readonly viewApplied = output<SavedView>();

  private readonly menuHost = viewChild<ElementRef<HTMLElement>>('menuHost');
  private readonly moreHost = viewChild<ElementRef<HTMLElement>>('moreHost');
  private readonly morePanel = viewChild<ElementRef<HTMLElement>>('morePanel');

  protected readonly searchId = `cf-list-search-${++nextId}`;
  protected readonly menuId = `cf-list-views-${nextId}`;
  protected readonly moreId = `cf-list-more-${nextId}`;
  protected readonly moreOpen = signal(false);
  protected readonly hasMoreFilters = signal(false);
  protected readonly text = linkedSignal(() => this.query());
  protected readonly menuOpen = signal(false);
  protected readonly saveOpen = signal(false);
  protected readonly activeView = signal<SavedView | null>(null);
  private lastEmitted: string | null = null;

  protected readonly placeholder = computed(() =>
    this.language.translate(this.searchPlaceholderKey() ?? 'kit.list.searchPlaceholder'),
  );
  protected readonly views = computed(() => this.savedViews.views(this.scope(), this.page())());

  constructor() {
    // Show the "Flere filtre" button only when a page projects filters into it.
    afterEveryRender(() => {
      const more = (this.morePanel()?.nativeElement.childElementCount ?? 0) > 0;
      if (more !== this.hasMoreFilters()) {
        this.hasMoreFilters.set(more);
      }
    });
    const sub = toObservable(this.text)
      .pipe(skip(1), debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged())
      .subscribe((text) => {
        if (text === this.lastEmitted) {
          return;
        }
        const active = this.activeView();
        if (active && active.query !== text) {
          this.activeView.set(null);
        }
        this.emit(text);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private emit(text: string): void {
    this.lastEmitted = text;
    this.search.emit(text);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
    this.moreOpen.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const host = this.menuHost()?.nativeElement;
    if (this.menuOpen() && host && !host.contains(target)) {
      this.menuOpen.set(false);
    }
    const more = this.moreHost()?.nativeElement;
    // Option lists of native selects render outside the panel; ignore detached targets.
    if (this.moreOpen() && more && !more.contains(target) && target.isConnected) {
      this.moreOpen.set(false);
    }
  }

  protected apply(view: SavedView): void {
    this.menuOpen.set(false);
    this.activeView.set(view);
    this.text.set(view.query);
    this.emit(view.query);
    this.viewApplied.emit(view);
  }

  protected remove(view: SavedView): void {
    this.savedViews.remove(this.scope(), this.page(), view.id);
    if (this.activeView()?.id === view.id) {
      this.activeView.set(null);
    }
  }

  protected openSave(): void {
    this.menuOpen.set(false);
    this.saveOpen.set(true);
  }

  protected save(name: string): void {
    this.saveOpen.set(false);
    const view = this.savedViews.save(this.scope(), this.page(), {
      name,
      query: this.text(),
      filters: this.filters(),
    });
    this.activeView.set(view);
  }
}
