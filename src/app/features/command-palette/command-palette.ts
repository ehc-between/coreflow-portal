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
import { toSignal } from '@angular/core/rxjs-interop';
import { Icon } from '../../shared/ui/icon/icon';
import { NAV_ITEMS, NavItem } from '../../layout/nav';
import { AskPanelService } from '../ask/ask-panel.service';
import { AGENT_ACTIONS, AgentAction } from './command-palette.actions';
import { CommandPaletteService } from './command-palette.service';

/** A keyboard-navigable row, tagged by kind so Enter knows what to do. */
type Row =
  | { readonly kind: 'ask'; readonly query: string }
  | { readonly kind: 'action'; readonly action: AgentAction }
  | { readonly kind: 'nav'; readonly item: NavItem };

/**
 * ⌘K command palette: a centered launcher that showcases what CoreFlow can do.
 * An AGENT ACTIONS list (each seeds the Ask CoreFlow chat with a starter prompt)
 * and a GO TO navigation list (reusing the sidebar's {@link NAV_ITEMS} config),
 * both filterable as you type. A free-text query also surfaces an "Ask CoreFlow"
 * row. ArrowUp/Down move a highlight across every visible row; Enter activates it;
 * Esc and backdrop click close. Opened from the top bar's search button and ⌘K.
 */
@Component({
  selector: 'app-command-palette',
  imports: [FormsModule, TranslocoPipe, Icon],
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

  private readonly trimmed = computed(() => this.query().trim());

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
    return [...(ask ? [ask] : []), ...this.actionRows(), ...this.navRows()];
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
    }
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
