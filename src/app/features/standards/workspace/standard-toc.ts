import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localized, statusLabelKey } from '../../../core/standards/standards-data';
import { LocalizedText } from '../../../core/standards/standards.models';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { themeKey } from '../standard-themes';
import { SectionStatus, TocRow, tocDomId } from './workspace-data';

const DOT_CLASSES: Record<SectionStatus, string> = {
  covered: 'bg-pass',
  partial: 'bg-warn',
  // Not started is a to-do, not a failure: grey, never red (plan decision 11).
  not_started: 'bg-border-strong',
  not_applicable: 'border border-fg-subtle bg-transparent',
  none: 'bg-transparent',
};

/**
 * The workspace's table of contents: the whole standard (chapters 0–10 and
 * Annex A grouped by theme) as collapsible entries with a status dot and, on
 * chapters, the coverage %. The current section is highlighted
 * (`aria-current="location"`) and kept in view. A search box filters by number
 * or title; the "only gaps" and "has AI suggestions" switches filter both the
 * TOC and the document. Purely presentational — the workspace owns every piece
 * of state.
 */
@Component({
  selector: 'app-standard-toc',
  imports: [RouterLink, TranslocoPipe, Icon, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex-none border-b border-border px-3 pt-3 pb-3">
        <div class="mb-2.5 flex items-center justify-between gap-2 px-1">
          <h2 class="text-micro font-bold tracking-wider text-fg-subtle uppercase">
            {{ 'standards.workspace.contents' | transloco }}
          </h2>
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="rounded-md px-2 py-1 text-meta font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
              (click)="collapseAll.emit()"
            >
              {{ 'standards.view.collapseAll' | transloco }}
            </button>
            <button
              type="button"
              class="flex rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
              [attr.aria-label]="'standards.workspace.hideContents' | transloco"
              [title]="'standards.workspace.hideContents' | transloco"
              (click)="hide.emit()"
            >
              <app-icon [name]="drawer() ? 'x' : 'back'" [size]="15" />
            </button>
          </div>
        </div>
        <div
          class="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-2.5 focus-within:border-accent"
        >
          <span class="flex text-fg-subtle"><app-icon name="search" [size]="15" /></span>
          <input
            #search
            type="search"
            [value]="query()"
            (input)="queryChange.emit(search.value)"
            (keydown.escape)="clearSearch($event)"
            [placeholder]="'standards.workspace.searchPlaceholder' | transloco"
            [attr.aria-label]="'standards.workspace.searchPlaceholder' | transloco"
            class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
          />
          <kbd
            class="hidden rounded border border-border px-1.5 font-mono text-micro text-fg-subtle sm:inline"
            aria-hidden="true"
            >/</kbd
          >
        </div>
        <div class="mt-2.5 flex flex-col gap-0.5">
          <app-switch
            [checked]="gapsOnly()"
            [count]="gapCount()"
            (checkedChange)="gapsOnlyChange.emit($event)"
            >{{ 'standards.workspace.onlyGaps' | transloco }}</app-switch
          >
          <app-switch
            data-testid="filter-suggestions"
            [checked]="suggestionsOnly()"
            [count]="suggestionCount()"
            (checkedChange)="suggestionsOnlyChange.emit($event)"
            >{{ 'standards.workspace.hasAiSuggestions' | transloco }}</app-switch
          >
          @if (staleCount() > 0 || staleOnly()) {
            <app-switch
              data-testid="filter-stale"
              [checked]="staleOnly()"
              [count]="staleCount()"
              (checkedChange)="staleOnlyChange.emit($event)"
              >{{ 'standards.workspace.onlyStale' | transloco }}</app-switch
            >
          }
        </div>
      </div>

      <nav
        #scroller
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
        [attr.aria-label]="'standards.workspace.tocLabel' | transloco: { name: standardName() }"
      >
        @if (rows().length === 0) {
          <p class="px-3 py-6 text-center text-ui text-fg-muted">
            {{ 'standards.workspace.noTocMatches' | transloco }}
          </p>
        } @else {
          <ul>
            @for (row of rows(); track row.number) {
              @if (row.themeHeading; as theme) {
                <li
                  class="pt-3 pb-1 text-micro font-bold tracking-wider text-fg-subtle uppercase"
                  [style.padding-left.px]="30 + row.depth * 14"
                  aria-hidden="true"
                >
                  @if (themeKey(theme); as k) {
                    {{ k | transloco }}
                  } @else {
                    {{ theme }}
                  }
                </li>
              }
              <li>
                <div
                  class="group flex items-center rounded-md"
                  [class]="row.number === active() ? 'bg-accent-soft' : 'hover:bg-surface-2'"
                  [style.padding-left.px]="row.depth * 14"
                >
                  @if (row.hasChildren) {
                    <button
                      type="button"
                      class="flex h-7 w-6 flex-none items-center justify-center rounded-md text-fg-subtle hover:text-fg"
                      [attr.aria-expanded]="row.expanded"
                      [attr.aria-label]="
                        (row.expanded ? 'standards.view.collapse' : 'standards.view.expand')
                          | transloco: { number: row.label }
                      "
                      (click)="nodeToggled.emit(row.number)"
                    >
                      <app-icon
                        name="chevron"
                        [size]="13"
                        class="transition-transform motion-reduce:transition-none"
                        [class]="row.expanded ? '' : '-rotate-90'"
                      />
                    </button>
                  } @else {
                    <span class="w-6 flex-none"></span>
                  }
                  <a
                    [id]="domId(row.number)"
                    [routerLink]="['/standards', standardKey(), row.segment]"
                    class="flex min-w-0 flex-1 items-start gap-2 py-[5px] pr-2 text-ui leading-snug"
                    [class]="
                      row.number === active()
                        ? 'font-semibold text-accent'
                        : activePath().has(row.number)
                          ? 'font-medium text-fg'
                          : 'text-fg-muted hover:text-fg'
                    "
                    [attr.aria-current]="row.number === active() ? 'location' : null"
                    [title]="row.label + ' ' + text(row.title)"
                    (click)="onNavigate($event, row.number)"
                  >
                    <span
                      class="mt-[6px] h-[7px] w-[7px] flex-none rounded-full"
                      [class]="dotClass(row.status)"
                      aria-hidden="true"
                    ></span>
                    <span
                      class="mt-px flex-none font-mono text-meta tabular-nums"
                      [class.text-fg-subtle]="row.number !== active()"
                      >{{ row.label }}</span
                    >
                    <span
                      class="line-clamp-2 min-w-0 flex-1"
                      [class.font-semibold]="row.depth === 0"
                      >{{ text(row.title) }}</span
                    >
                    @if (row.status !== 'none') {
                      <span class="sr-only">{{ statusLabelKey(row.status) | transloco }}</span>
                    }
                    @if (row.pct !== null) {
                      <span
                        class="mt-px flex-none text-meta font-semibold text-fg-subtle tabular-nums"
                        >{{ row.pct }}%</span
                      >
                    }
                  </a>
                </div>
              </li>
            }
          </ul>
        }
      </nav>

      <p
        class="flex-none border-t border-border px-4 py-2.5 text-micro leading-relaxed text-fg-subtle"
      >
        {{ 'standards.workspace.shortcutsHint' | transloco }}
      </p>
    </div>
  `,
})
export class StandardToc {
  private readonly language = inject(LanguageService);

  readonly rows = input.required<readonly TocRow[]>();
  readonly standardKey = input.required<string>();
  readonly standardName = input('');
  readonly active = input<string | null>(null);
  /** The active section and its ancestors. */
  readonly activePath = input<ReadonlySet<string>>(new Set());
  readonly query = input('');
  readonly gapsOnly = input(false);
  readonly gapCount = input(0);
  readonly suggestionsOnly = input(false);
  /** Requirements with AI suggestions waiting for review. */
  readonly suggestionCount = input(0);
  /** "Old or weak evidence" filter (shown only when there is any). */
  readonly staleOnly = input(false);
  readonly staleCount = input(0);
  /** Rendered as the mobile drawer (close icon instead of "hide"). */
  readonly drawer = input(false);

  readonly queryChange = output<string>();
  readonly gapsOnlyChange = output<boolean>();
  readonly suggestionsOnlyChange = output<boolean>();
  readonly staleOnlyChange = output<boolean>();
  readonly nodeToggled = output<string>();
  readonly navigate = output<string>();
  readonly collapseAll = output<void>();
  readonly hide = output<void>();

  protected readonly themeKey = themeKey;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly domId = tocDomId;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** The entry last scrolled into view; other row changes never move the TOC. */
  private lastRevealed: string | null = null;

  constructor() {
    // Keep the current entry in view as the reader moves through the document —
    // only when the current section changes. Rows are tracked only to retry
    // while the new entry isn't rendered yet (e.g. its parent just expanded);
    // expanding, collapsing, searching or saving leaves the TOC where it is.
    afterRenderEffect(() => {
      const active = this.active();
      this.rows();
      const scroller = this.scroller()?.nativeElement;
      if (!active || !scroller || active === this.lastRevealed) {
        return;
      }
      untracked(() => {
        if (this.reveal(scroller, active)) {
          this.lastRevealed = active;
        }
      });
    });
  }

  focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    input?.focus();
    input?.select();
  }

  protected text(value: LocalizedText): string {
    return localized(value, this.language.active());
  }

  protected dotClass(status: SectionStatus): string {
    return DOT_CLASSES[status];
  }

  protected clearSearch(event: Event): void {
    if (this.query()) {
      event.stopPropagation();
      this.queryChange.emit('');
    }
  }

  /** Plain left clicks scroll in place; modified clicks keep their browser meaning. */
  protected onNavigate(event: MouseEvent, number: string): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    this.navigate.emit(number);
  }

  /** Scroll the entry into view if needed; false while it isn't rendered. */
  private reveal(scroller: HTMLElement, number: string): boolean {
    const entry = scroller.ownerDocument.getElementById(tocDomId(number));
    if (!entry || !scroller.contains(entry)) {
      return false;
    }
    const box = scroller.getBoundingClientRect();
    const rect = entry.getBoundingClientRect();
    const margin = 48;
    if (rect.top < box.top + margin || rect.bottom > box.bottom - margin) {
      scroller.scrollTop += rect.top - box.top - box.height / 3;
    }
    return true;
  }
}
