import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
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
import { entityTypeLabel } from '../../core/search/entity-label';
import { InternalLink, internalLink } from '../../core/search/internal-link';
import { SearchApi } from '../../core/search/search-api';
import { SearchItem, SearchResponse } from '../../core/search/search.models';
import { UxMetricsService } from '../../core/ux-metrics/ux-metrics.service';
import { Icon } from '../../shared/ui/icon/icon';
import { NAV_ITEMS, NavItem } from '../../layout/nav';
import { AskPanelService } from '../ask/ask-panel.service';
import { HowtoEntry, matchHowtos } from '../ask/ask-howto';
import { moduleIcon, recordIcon } from '../ask/ask-icons';
import {
  AGENT_ACTIONS,
  AgentAction,
  actionLabelKey,
  actionPromptKey,
} from './command-palette.actions';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CommandPaletteService } from './command-palette.service';

/** A keyboard-navigable row, tagged by kind so Enter knows what to do. */
type Row =
  | { readonly kind: 'ask'; readonly query: string }
  | { readonly kind: 'action'; readonly action: AgentAction }
  | { readonly kind: 'howto'; readonly entry: HowtoEntry }
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
/** Highlight value meaning "the Ask CoreFlow row" (always the last row). */
const ASK_ROW = -1;

/** Words that start a question or a request to the assistant (en + nb). */
const QUESTION_STARTS = new Set([
  'what',
  'which',
  'who',
  'where',
  'how',
  'why',
  'when',
  'can',
  'should',
  'is',
  'are',
  'do',
  'does',
  'list',
  'show',
  'find',
  'create',
  'register',
  'summarise',
  'summarize',
  'explain',
  'help',
  'hva',
  'hvilke',
  'hvilken',
  'hvilket',
  'hvem',
  'hvor',
  'hvordan',
  'hvorfor',
  'når',
  'kan',
  'bør',
  'skal',
  'er',
  'finnes',
  'har',
  'vis',
  'finn',
  'lag',
  'registrer',
  'oppsummer',
  'forklar',
  'hjelp',
]);

/** A machine requirement ref (`iso27001-2022:A.5.19.r1`): never shown to users. */
const REQUIREMENT_REF_RE = /^[a-z0-9-]+:\S+\.r\d+$/i;

/**
 * The record code to show next to a hit, or null. Requirement refs are hidden: the
 * hit's title already starts with the clause number, and raw `.rN` refs are not
 * for users (polish plan §2.1).
 */
export function displayCode(code: string | null | undefined): string | null {
  const value = code?.trim();
  return value && !REQUIREMENT_REF_RE.test(value) ? value : null;
}

/**
 * Whether the text reads as a question or request for the assistant rather than a
 * search term: it ends with "?", starts with a question / request word, or is a
 * longer sentence. Then Enter asks CoreFlow instead of opening the first hit.
 */
export function looksLikeQuestion(text: string): boolean {
  const value = text.trim();
  if (!value) {
    return false;
  }
  if (value.endsWith('?')) {
    return true;
  }
  const words = value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return words.length >= 5 || (words.length >= 2 && QUESTION_STARTS.has(words[0]));
}

/**
 * ⌘K command palette: one place to find anything, learn how to do something or
 * ask CoreFlow.
 *
 * - From two characters the query searches every record type the user may read
 *   (debounced, via SearchApi), grouped by type with the per-type hit count and
 *   the module's icon; Enter opens the record. Failures stay quiet (an inline note).
 * - "Slik gjør du" (how to) rows match the query against the how-to topics the
 *   assistant can answer; choosing one asks the assistant for the steps.
 * - "Be CoreFlow om å" actions send a translated starter question to the assistant.
 * - "Gå til" lists the pages (the sidebar's {@link NAV_ITEMS}).
 * - "Spør CoreFlow: <query>" is the last row for any free text. When the text reads
 *   like a question it is highlighted, so Enter asks; Ctrl/⌘+Enter always asks.
 *
 * ArrowUp/Down move a highlight across every visible row; Esc and backdrop close.
 */
@Component({
  selector: 'app-command-palette',
  imports: [FormsModule, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('search', 'ask')],
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (palette.open()) {
      <div
        class="fixed inset-0 z-[50] flex items-start justify-center px-3 pt-[8vh] sm:px-4 sm:pt-[12vh]"
      >
        <button
          type="button"
          (click)="close()"
          [attr.aria-label]="'common.dismiss' | transloco"
          class="absolute inset-0 cursor-default bg-black/40"
        ></button>

        <div
          class="animate-cf-pop relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'commandPalette.placeholder' | transloco"
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
              class="min-w-0 flex-1 bg-transparent text-card text-fg outline-none placeholder:text-fg-subtle"
            />
            <kbd
              class="hidden flex-none rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-micro text-fg-muted sm:inline"
              >{{ 'commandPalette.esc' | transloco }}</kbd
            >
          </div>

          <div class="max-h-[64vh] overflow-y-auto py-2 sm:max-h-[56vh]">
            @switch (searchStatus()) {
              @case ('loading') {
                <p class="px-4 pt-2 pb-1 text-ui text-fg-subtle" role="status">
                  {{ 'search.palette.searching' | transloco }}
                </p>
              }
              @case ('error') {
                <p class="px-4 pt-2 pb-1 text-ui text-fail-ink" role="status">
                  {{ 'search.palette.error' | transloco }}
                </p>
              }
              @case ('done') {
                @if (!recordGroups().length) {
                  <p class="px-4 pt-2 pb-1 text-ui text-fg-subtle" role="status">
                    {{ 'search.palette.noResults' | transloco: { query: trimmed() } }}
                  </p>
                }
              }
            }

            @for (group of recordGroups(); track group.entityType) {
              <div
                class="flex items-center gap-2 px-4 pt-3 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
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
                  (mouseenter)="highlightRow(row)"
                  class="flex w-full items-start gap-3 px-4 py-2 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none pt-0.5 text-fg-muted"
                    ><app-icon [name]="group.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-2">
                      <span class="truncate text-body font-medium text-fg">{{
                        row.item.title
                      }}</span>
                      @if (displayCode(row.item.code); as code) {
                        <span class="flex-none font-mono text-meta text-fg-subtle">{{ code }}</span>
                      }
                    </span>
                    @if (row.item.snippet) {
                      <span class="block truncate text-meta text-fg-subtle">{{
                        row.item.snippet
                      }}</span>
                    }
                  </span>
                </button>
              }
            }

            @if (howtoRows().length) {
              <div
                class="px-4 pt-3 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'ask.palette.howtoHeading' | transloco }}
              </div>
              @for (row of howtoRows(); track row.entry.key) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlightRow(row)"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none text-fg-muted"
                    ><app-icon [name]="iconForModule(row.entry.module, 'book')" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1 truncate text-body font-medium text-fg">{{
                    'ask.howto.' + row.entry.key + '.title' | transloco
                  }}</span>
                  <span class="flex-none text-meta text-fg-subtle">{{
                    'ask.palette.howtoTag' | transloco
                  }}</span>
                </button>
              }
            }

            @if (!trimmed()) {
              <p class="px-4 pt-1 pb-2 text-ui text-fg-subtle">
                {{ 'ask.palette.hint' | transloco }}
              </p>
            }

            @if (actionRows().length) {
              <div
                class="px-4 pt-2 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'ask.palette.actionsHeading' | transloco }}
              </div>
              @for (row of actionRows(); track row.action.key) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlightRow(row)"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none text-fg-muted"
                    ><app-icon [name]="row.action.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1 truncate text-body font-medium text-fg">{{
                    actionLabel(row.action) | transloco
                  }}</span>
                  @if (row.action.module) {
                    <span class="hidden flex-none text-meta text-fg-subtle sm:inline">{{
                      'modules.names.' + row.action.module | transloco
                    }}</span>
                  }
                </button>
              }
            }

            @if (navRows().length) {
              <div
                class="px-4 pt-3 pb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
              >
                {{ 'commandPalette.goTo' | transloco }}
              </div>
              @for (row of navRows(); track row.item.path) {
                <button
                  type="button"
                  (click)="run(row)"
                  (mouseenter)="highlightRow(row)"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  [class.bg-accent-soft]="highlighted() === row"
                >
                  <span class="flex flex-none text-fg-muted"
                    ><app-icon [name]="row.item.icon" [size]="18"
                  /></span>
                  <span class="min-w-0 flex-1 truncate text-body font-medium text-fg">{{
                    row.item.labelKey | transloco
                  }}</span>
                </button>
              }
            }

            @if (askRow(); as ask) {
              <div class="mx-4 mt-2 border-t border-border"></div>
              <button
                type="button"
                (click)="run(ask)"
                (mouseenter)="highlightRow(ask)"
                class="mt-1 flex w-full items-center gap-3 px-4 py-2.5 text-left"
                [class.bg-accent-soft]="highlighted() === ask"
              >
                <span class="flex flex-none text-accent"
                  ><app-icon name="spark" [size]="18"
                /></span>
                <span class="min-w-0 flex-1 truncate text-body font-semibold text-fg">{{
                  'commandPalette.askFor' | transloco: { query: query() }
                }}</span>
                <kbd
                  class="hidden flex-none rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-micro text-fg-muted sm:inline"
                  >{{ askShortcut }}</kbd
                >
              </button>
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
  private readonly searchApi = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly uxMetrics = inject(UxMetricsService);

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  /** Index into {@link rows}, or {@link ASK_ROW} for the Ask CoreFlow row. */
  protected readonly highlight = signal(0);

  protected readonly askShortcut = isMac() ? '⌘↵' : 'Ctrl+↵';

  protected readonly trimmed = computed(() => this.query().trim());

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
      icon: recordIcon(entityType, rows[0].item.module),
      total: state.response.counts[entityType] ?? rows.length,
      rows,
    }));
  });

  private readonly recordRows = computed(() => this.recordGroups().flatMap((group) => group.rows));

  /** How-to topics matching the query (title, question and keywords, UI language). */
  protected readonly howtoRows = computed<Extract<Row, { kind: 'howto' }>[]>(() => {
    const query = this.trimmed();
    if (query.length < MIN_SEARCH_LENGTH) {
      return [];
    }
    return matchHowtos(query, (entry) => this.howtoText(entry)).map((entry) => ({
      kind: 'howto',
      entry,
    }));
  });

  protected readonly askRow = computed<Row | null>(() =>
    this.trimmed() ? { kind: 'ask', query: this.trimmed() } : null,
  );

  protected readonly actionRows = computed<Extract<Row, { kind: 'action' }>[]>(() => {
    const q = this.trimmed().toLocaleLowerCase();
    return AGENT_ACTIONS.filter(
      (action) =>
        !q || this.language.translate(actionLabelKey(action)).toLocaleLowerCase().includes(q),
    ).map((action) => ({ kind: 'action', action }));
  });

  protected readonly navRows = computed<Extract<Row, { kind: 'nav' }>[]>(() => {
    const q = this.trimmed().toLocaleLowerCase();
    return NAV_ITEMS.filter(
      (item) => !q || this.language.translate(item.labelKey).toLocaleLowerCase().includes(q),
    ).map((item) => ({ kind: 'nav', item }));
  });

  /** Every visible row in display order — the keyboard navigation space. */
  protected readonly rows = computed<Row[]>(() => {
    const ask = this.askRow();
    return [
      ...this.recordRows(),
      ...this.howtoRows(),
      ...this.actionRows(),
      ...this.navRows(),
      ...(ask ? [ask] : []),
    ];
  });

  private readonly highlightedIndex = computed(() => {
    const count = this.rows().length;
    const index = this.highlight();
    if (!count) {
      return -1;
    }
    return index === ASK_ROW ? count - 1 : Math.min(index, count - 1);
  });

  protected readonly highlighted = computed<Row | null>(
    () => this.rows()[this.highlightedIndex()] ?? null,
  );

  constructor() {
    effect(() => {
      if (this.palette.open()) {
        this.query.set('');
        this.highlight.set(0);
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });

    // A new query starts on the first hit, or on "Ask CoreFlow" for a question.
    effect(() => {
      const query = this.trimmed();
      untracked(() => this.highlight.set(looksLikeQuestion(query) ? ASK_ROW : 0));
    });
  }

  protected actionLabel(action: AgentAction): string {
    return actionLabelKey(action);
  }

  protected iconForModule(module: string | null, fallback: string): string {
    return moduleIcon(module) ?? (module === 'tasks' ? 'inbox' : fallback);
  }

  protected indexOf(row: Row): number {
    return this.rows().indexOf(row);
  }

  protected highlightRow(row: Row): void {
    const index = this.indexOf(row);
    if (index !== -1) {
      this.highlight.set(index);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlight.set(count ? (this.highlightedIndex() + 1) % count : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlight.set(count ? (this.highlightedIndex() - 1 + count) % count : 0);
    } else if (event.key === 'Enter') {
      if (event.isComposing) {
        return;
      }
      event.preventDefault();
      const ask = this.askRow();
      const row = (event.ctrlKey || event.metaKey) && ask ? ask : this.highlighted();
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
        this.ask.showWith(this.language.translate(actionPromptKey(row.action)));
        break;
      case 'howto':
        this.ask.showWith(this.language.translate(`ask.howto.${row.entry.key}.question`));
        break;
      case 'nav':
        this.uxMetrics.markNext('palette');
        void this.router.navigate(['/' + row.item.path]);
        break;
      case 'record':
        this.uxMetrics.markNext('search');
        void this.router.navigate([row.link.path], {
          queryParams: row.link.queryParams ?? undefined,
        });
        break;
    }
  }

  /** The words a how-to entry is found by, in the active language. */
  private howtoText(entry: HowtoEntry): string {
    const base = `ask.howto.${entry.key}`;
    return ['title', 'question', 'keywords']
      .map((part) => this.language.translate(`${base}.${part}`))
      .filter((text) => !text.startsWith(base))
      .join(' ');
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

  protected readonly displayCode = displayCode;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '');
}
