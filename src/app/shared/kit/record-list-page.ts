import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { PromptDialog } from '../ui/prompt-dialog/prompt-dialog';
import { provideKitScope } from './kit-scope';
import { SavedView, SavedViewsService } from './saved-views.service';

const SEARCH_DEBOUNCE_MS = 250;
let nextId = 0;

/**
 * Standard list page of a module: heading, toolbar actions, a search box,
 * filters, saved views and the list itself.
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
  imports: [TranslocoPipe, Icon, PromptDialog],
  providers: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeMenu()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="list-title"
          >
            {{ title() }}
          </h1>
          @if (activeView(); as view) {
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'kit.list.activeView' | transloco: { name: view.name } }}
            </p>
          }
          <ng-content select="[intro]" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ng-content select="[toolbar]" />
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div
          class="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 focus-within:border-accent"
        >
          <app-icon name="search" [size]="16" class="text-fg-subtle" />
          <label [attr.for]="searchId" class="sr-only">{{ 'kit.list.search' | transloco }}</label>
          <input
            [id]="searchId"
            type="search"
            [value]="text()"
            (input)="text.set($any($event.target).value)"
            [placeholder]="placeholder()"
            class="h-full flex-1 bg-transparent text-[13.5px] text-fg outline-none"
            data-testid="list-search"
          />
        </div>
        <ng-content select="[filters]" />

        <div class="relative" #menuHost>
          <button
            type="button"
            class="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-bg px-3 text-[13px] font-semibold text-fg-muted hover:text-fg"
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
              class="absolute right-0 z-30 mt-1 w-[260px] rounded-[10px] border border-border bg-surface p-1.5 shadow-card"
              data-testid="views-menu"
            >
              @for (view of views(); track view.id) {
                <div class="flex items-center gap-1 rounded-[8px] hover:bg-surface-2">
                  <button
                    type="button"
                    class="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-[13px] text-fg"
                    [attr.aria-label]="'kit.list.applyView' | transloco: { name: view.name }"
                    (click)="apply(view)"
                  >
                    {{ view.name }}
                  </button>
                  <button
                    type="button"
                    class="flex flex-none rounded-[6px] p-1 text-fg-subtle hover:text-fail"
                    [attr.aria-label]="'kit.list.deleteView' | transloco: { name: view.name }"
                    (click)="remove(view)"
                  >
                    <app-icon name="x" [size]="13" />
                  </button>
                </div>
              } @empty {
                <p class="px-2.5 py-1.5 text-[12.5px] text-fg-muted">
                  {{ 'kit.list.noViews' | transloco }}
                </p>
              }
              <div class="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] font-semibold text-accent hover:bg-surface-2"
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

  /** i18n key of the page heading (usually in the module's scope). */
  readonly titleKey = input.required<string>();
  /** Module scope (portal path), used for the saved-views key and guidance. */
  readonly scope = input.required<string>();
  readonly page = input('list');
  readonly searchPlaceholderKey = input<string | undefined>(undefined);
  /** The current search text (e.g. restored from the URL). */
  readonly query = input('');
  /** The current filter values, stored with a saved view. */
  readonly filters = input<Readonly<Record<string, string>>>({});
  /** Show the `[empty]` slot instead of the list. */
  readonly empty = input(false);

  /** The debounced search text (name fixed by the platform contract, 11.4). */
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly search = output<string>();
  /** A saved view was applied: restore its filters. */
  readonly viewApplied = output<SavedView>();

  private readonly menuHost = viewChild<ElementRef<HTMLElement>>('menuHost');

  protected readonly searchId = `cf-list-search-${++nextId}`;
  protected readonly menuId = `cf-list-views-${nextId}`;
  protected readonly text = linkedSignal(() => this.query());
  protected readonly menuOpen = signal(false);
  protected readonly saveOpen = signal(false);
  protected readonly activeView = signal<SavedView | null>(null);
  private lastEmitted: string | null = null;

  protected readonly title = computed(() => this.language.translate(this.titleKey()));
  protected readonly placeholder = computed(() =>
    this.language.translate(this.searchPlaceholderKey() ?? 'kit.list.searchPlaceholder'),
  );
  protected readonly views = computed(() => this.savedViews.views(this.scope(), this.page())());

  constructor() {
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
  }

  protected onDocumentClick(event: MouseEvent): void {
    const host = this.menuHost()?.nativeElement;
    if (this.menuOpen() && host && !host.contains(event.target as Node)) {
      this.menuOpen.set(false);
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
