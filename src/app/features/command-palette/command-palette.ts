import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { entityTypeIcon, entityTypeLabel } from '../../core/search/entity-label';
import { InternalLink, internalLink } from '../../core/search/internal-link';
import { SearchApi } from '../../core/search/search-api';
import { SearchItem, SearchResponse } from '../../core/search/search.models';
import { Icon } from '../../shared/ui/icon/icon';
import { NAV_ITEMS, NavItem } from '../../layout/nav';
import { AskPanelService } from '../ask/ask-panel.service';
import { AGENT_ACTIONS, AgentAction } from './command-palette.actions';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CommandPaletteService } from './command-palette.service';

/** A keyboard-navigable row, tagged by kind so Enter knows what to do. */
type Row =
  | { readonly kind: 'ask'; readonly query: string }
  | { readonly kind: 'action'; readonly action: AgentAction }
  | { readonly kind: 'nav'; readonly item: NavItem }
  | { readonly kind: 'record'; readonly item: SearchItem; readonly link: InternalLink };

/** A group of record hits of one type, in rank order of its best hit. */
interface RecordGroup {
  readonly entityType: string;
  readonly label: string;
  readonly icon: string;
  readonly total: number;
  readonly rows: readonly Extract<Row, { kind: 'record' }>[];
}

/** Where the record search stands for the current query. */
type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly query: string }
  | { readonly status: 'done'; readonly query: string; readonly response: SearchResponse }
  | { readonly status: 'error'; readonly query: string };

/** Record search starts at this many characters. */
export const MIN_SEARCH_LENGTH = 2;
/** Debounce between keystrokes and the search request. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * ⌘K command palette: a centered launcher that showcases what CoreFlow can do.
 * An AGENT ACTIONS list (each seeds the Ask CoreFlow chat with a starter prompt)
 * and a GO TO navigation list (reusing the sidebar's {@link NAV_ITEMS} config),
 * both filterable as you type. A free-text query also surfaces an "Ask CoreFlow"
 * row. ArrowUp/Down move a highlight across every visible row; Enter activates it;
 * Esc and backdrop click close. Opened from the top bar's search button and ⌘K.
 *
 * F5 global search: from two characters the query also searches every record
 * type the user may read (debounced, via SearchApi), shown first and grouped by
 * type with the per-type hit count; Enter opens the record. Search failures stay
 * quiet (an inline note), so navigation and actions keep working.
 */
@Component({
  selector: 'app-command-palette',
  imports: [FormsModule, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('search')],
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (palette.open()) {
      <div class="fixed inset-0 z-[50] flex items-start justify-center px-4 pt-[12vh]">
        <button
          type="button"
          (click)="close()"
          [attr.aria-label]="'common.dismiss' | transloco"
          class="absolute inset-0 cursor-default bg-black/40"
        ></button>

        <div
          class="animate-cf-pop relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <div class="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3">
            <span class="flex text-fg-subtle"><app-icon name="search" [size]="18" /></span>
            <input
              #input
              type="text"
              [(ngModel)]="query"
              (keydown)="onKeydown($event)"
              [placeholder]="'commandPalette.placeholder' | transloco"
              [attr.aria-label]="'commandPalette.placeholder' | transloco"
              class="min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-fg-subtle"
            />
            <kbd
              class="flex-none rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted"
              >{{ 'commandPalette.esc' | transloco }}</kbd
            >
          </div>

          <div class="max-h-[56vh] overflow-y-auto py-2">
            @if (askRow(); as ask) {
              <button
                type="button"
                (click)="run(ask)"
                (mouseenter)="highlight.set(0)"
                class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                [class.bg-accent-soft]="highlighted() === ask"
              >
                <span class="flex flex-none text-accent"
                  ><app-icon name="spark" [size]="18"
                /></span>
                <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">{{
                  'commandPalette.askFor' | transloco: { query: query() }
                }}</span>
              </button>
            }

            @switch (searchStatus()) {
              @case ('loading') {
                <p class="px-4 pt-2 pb-1 text-[12.5px] text-fg-subtle" role="status">
                  {{ 'search.palette.searching' | transloco }}
                </p>
              }
              @case ('error') {
                <p class="px-4 pt-2 pb-1 text-[12.5px] text-fail" role="status">
                  {{ 'search.palette.error' | transloco }}
                </p>
              }
              @case ('done') {
                @if (!recordGroups().length) {
                  <p class="px-4 pt-2 pb-1 text-[12.5px] text-fg-subtle" role="status">
                    {{ 'search.palette.noResults' | transloco: { query: trimmed() } }}
                  </p>
                }
              }
            }

            @for (group of recordGroups(); track group.entityType) {
              <div
                class="flex items-center gap-2 px-4 pt-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                <span class="flex-1">{{ group.label }}</span>
                <span class="font-semibold tracking-normal normal-case">{{
                  'search.palette.count' | transloco: { count: group.total }
                }}</span>
              </div>
              @for (row of group.rows; track row.item.entity_id) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlight.set(indexOf(row))"
                  class="flex w-full items-start gap-3 px-4 py-2 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none pt-0.5 text-fg-muted"
                    ><app-icon [name]="group.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-2">
                      <span class="truncate text-[13.5px] font-medium text-fg">{{
                        row.item.title
                      }}</span>
                      @if (row.item.code) {
                        <span class="flex-none font-mono text-[11.5px] text-fg-subtle">{{
                          row.item.code
                        }}</span>
                      }
                    </span>
                    @if (row.item.snippet) {
                      <span class="block truncate text-[12px] text-fg-subtle">{{
                        row.item.snippet
                      }}</span>
                    }
                  </span>
                </button>
              }
            }

            @if (!trimmed()) {
              <p class="px-4 pt-1 pb-2 text-[12.5px] text-fg-subtle">
                {{ 'search.palette.hint' | transloco }}
              </p>
            }

            @if (actionRows().length) {
              <div
                class="px-4 pt-2 pb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'commandPalette.agentActions' | transloco }}
              </div>
              @for (row of actionRows(); track row.action.labelKey) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlight.set(indexOf(row))"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none text-fg-muted"
                    ><app-icon [name]="row.action.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{{
                    row.action.labelKey | transloco
                  }}</span>
                  <span class="flex-none text-[12px] text-fg-subtle">{{ row.action.tag }}</span>
                </button>
              }
            }

            @if (navRows().length) {
              <div
                class="px-4 pt-3 pb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'commandPalette.goTo' | transloco }}
              </div>
              @for (row of navRows(); track row.item.path) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlight.set(indexOf(row))"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none text-fg-muted"
                    ><app-icon [name]="row.item.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{{
                    row.item.labelKey | transloco
                  }}</span>
                </button>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPalette {
  protected readonly palette = inject(CommandPaletteService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly highlight = signal(0);

  // Recompute translated labels when the active language changes (filtering reads them).
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly trimmed = computed(() => this.query().trim());

  private readonly searchApi = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  /** Record search for the typed query, debounced; stale responses are dropped. */
  protected readonly search = toSignal(
    toObservable(
      computed(() => ({ query: this.trimmed(), orgId: this.selectedOrg.currentOrgId() })),
    ).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged((a, b) => a.query === b.query && a.orgId === b.orgId),
      switchMap(({ query, orgId }) => this.runSearch(query, orgId)),
    ),
    { initialValue: { status: 'idle' } as SearchState },
  );

  /** What the record-search status line shows for the query as typed now. */
  protected readonly searchStatus = computed<SearchState['status']>(() => {
    const state = this.search();
    const query = this.trimmed();
    if (query.length < MIN_SEARCH_LENGTH || !this.selectedOrg.currentOrgId()) {
      return 'idle';
    }
    // Debouncing or in flight for a newer query: show it as searching.
    if (state.status === 'idle' || state.query !== query) {
      return 'loading';
    }
    return state.status;
  });

  /** Hits grouped by record type (group order = best hit first, as ranked by the server). */
  protected readonly recordGroups = computed<readonly RecordGroup[]>(() => {
    const state = this.search();
    // Only show results that belong to what is typed right now.
    if (state.status !== 'done' || state.query !== this.trimmed()) {
      return [];
    }
    const groups = new Map<string, Extract<Row, { kind: 'record' }>[]>();
    for (const item of state.response.items) {
      const link = internalLink(item.url);
      if (!link) {
        continue;
      }
      const rows = groups.get(item.entity_type) ?? [];
      rows.push({ kind: 'record', item, link });
      groups.set(item.entity_type, rows);
    }
    return [...groups.entries()].map(([entityType, rows]) => ({
      entityType,
      label: entityTypeLabel(
        (key) => this.language.translate(key),
        rows[0].item.label_key,
        entityType,
      ),
      icon: entityTypeIcon(entityType),
      total: state.response.counts[entityType] ?? rows.length,
      rows,
    }));
  });

  private readonly recordRows = computed(() => this.recordGroups().flatMap((group) => group.rows));

  protected readonly askRow = computed<Row | null>(() =>
    this.trimmed() ? { kind: 'ask', query: this.trimmed() } : null,
  );

  protected readonly actionRows = computed<Extract<Row, { kind: 'action' }>[]>(() => {
    const q = this.trimmed().toLowerCase();
    this.lang();
    return AGENT_ACTIONS.filter(
      (action) => !q || this.transloco.translate(action.labelKey).toLowerCase().includes(q),
    ).map((action) => ({ kind: 'action', action }));
  });

  protected readonly navRows = computed<Extract<Row, { kind: 'nav' }>[]>(() => {
    const q = this.trimmed().toLowerCase();
    this.lang();
    return NAV_ITEMS.filter(
      (item) => !q || this.transloco.translate(item.labelKey).toLowerCase().includes(q),
    ).map((item) => ({ kind: 'nav', item }));
  });

  /** Every visible row in display order — the keyboard navigation space. */
  protected readonly rows = computed<Row[]>(() => {
    const ask = this.askRow();
    return [...(ask ? [ask] : []), ...this.recordRows(), ...this.actionRows(), ...this.navRows()];
  });

  protected readonly highlighted = computed<Row | null>(
    () => this.rows()[this.highlight()] ?? null,
  );

  constructor() {
    effect(() => {
      if (this.palette.open()) {
        this.query.set('');
        this.highlight.set(0);
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });

    // Keep the highlight within bounds as filtering shrinks the list.
    effect(() => {
      const count = this.rows().length;
      if (this.highlight() > count - 1) {
        this.highlight.set(Math.max(0, count - 1));
      }
    });
  }

  protected indexOf(row: Row): number {
    return this.rows().indexOf(row);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlight.update((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlight.update((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.highlighted();
      if (row) {
        this.run(row);
      }
    }
  }

  protected run(row: Row): void {
    this.close();
    switch (row.kind) {
      case 'ask':
        this.ask.showWith(row.query);
        break;
      case 'action':
        this.ask.showWith(row.action.prompt);
        break;
      case 'nav':
        void this.router.navigate(['/', row.item.path]);
        break;
      case 'record':
        void this.router.navigate([row.link.path], {
          queryParams: row.link.queryParams ?? undefined,
        });
        break;
    }
  }

  private runSearch(query: string, orgId: string | null): Observable<SearchState> {
    if (!orgId || query.length < MIN_SEARCH_LENGTH) {
      return of({ status: 'idle' });
    }
    return concat(
      of<SearchState>({ status: 'loading', query }),
      this.searchApi.search(orgId, query, { limit: 20 }).pipe(
        map((response): SearchState => ({ status: 'done', query, response })),
        catchError(() => of<SearchState>({ status: 'error', query })),
      ),
    );
  }

  protected onEscape(): void {
    if (this.palette.open()) {
      this.close();
    }
  }

  protected close(): void {
    this.palette.hide();
  }
}
