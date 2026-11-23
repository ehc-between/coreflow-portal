import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  Injector,
  afterEveryRender,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../icon/icon';

let nextId = 0;

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';
const TRIGGER_CLASSES = {
  default: `inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 ${FOCUS}`,
  primary: `inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-tile bg-accent px-3 py-2 text-ui font-semibold text-white shadow-sm hover:brightness-110 ${FOCUS} focus-visible:ring-offset-2`,
  ghost: `flex h-10 w-10 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg ${FOCUS}`,
} as const;

/**
 * An item of `app-overflow-menu`: `<button appMenuItem (click)="…">Arkiver</button>`.
 * `danger` styles a destructive item (red); the page must still ask for confirmation
 * with `app-confirm-dialog` before it deletes anything.
 */
@Directive({
  selector: '[appMenuItem]',
  host: {
    role: 'menuitem',
    tabindex: '-1',
    class:
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui font-medium outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60',
    '[class]': "danger() ? 'text-fail-ink hover:bg-fail-soft' : 'text-fg'",
    '[attr.data-danger]': 'danger() || null',
  },
})
export class MenuItem {
  readonly danger = input(false);
}

/**
 * "Mer ⋯" menu for secondary page actions (contracts: one primary, two secondary,
 * the rest here; Delete only here). Keyboard: Enter/Space/ArrowDown opens and focuses
 * the first item, Arrow keys / Home / End move, Escape and Tab close, focus returns to
 * the trigger. Renders nothing when no item is projected.
 *
 *   <app-overflow-menu>
 *     <button appMenuItem (click)="archive()">Arkiver</button>
 *     <button appMenuItem [danger]="true" (click)="confirmDelete.set(true)">Slett</button>
 *   </app-overflow-menu>
 */
@Component({
  selector: 'app-overflow-menu',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative',
    // Exclusive display classes: a static inline-flex would beat `hidden` in the cascade.
    '[class.inline-flex]': 'hasItems()',
    '[class.hidden]': '!hasItems()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      [id]="triggerId"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="menuId"
      [attr.aria-label]="
        iconOnly()
          ? (labelKey() | transloco)
          : leadIcon()
            ? label() || (labelKey() | transloco)
            : null
      "
      [attr.data-testid]="triggerTestId()"
      [class]="triggerClass()"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
    >
      @if (variant() === 'primary') {
        <app-icon [name]="icon()" [size]="17" />
      } @else if (leadIcon()) {
        <!-- A named menu with its own icon ("✦ Spør KI ▾") leads with the icon. -->
        <app-icon [name]="icon()" [size]="15" />
      }
      @if (!iconOnly()) {
        <!-- cf-action-label: hidden when a crowded record header goes icon-only. -->
        <span class="cf-action-label">{{ label() || (labelKey() | transloco) }}</span>
      }
      @if (variant() !== 'primary') {
        <app-icon
          [name]="variant() === 'tab' || leadIcon() ? 'chevron' : icon()"
          [size]="variant() === 'ghost' ? 19 : variant() === 'tab' ? 14 : 16"
        />
      }
    </button>
    <div
      #panel
      role="menu"
      [id]="menuId"
      [attr.aria-labelledby]="triggerId"
      [hidden]="!open()"
      data-testid="overflow-menu"
      tabindex="-1"
      class="absolute top-full z-30 mt-1 flex min-w-[200px] flex-col rounded-card border border-border bg-surface p-1.5 shadow-pop"
      [class.right-0]="align() === 'end'"
      [class.left-0]="align() === 'start'"
      (keydown)="onMenuKeydown($event)"
      (click)="onMenuClick($event)"
    >
      <ng-content />
    </div>
  `,
})
export class OverflowMenu {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /** Trigger label (global i18n key). */
  readonly labelKey = input('ui.overflow.more');
  /** Show only the ⋯ icon (the label becomes the aria-label). */
  readonly iconOnly = input(false);
  readonly align = input<'start' | 'end'>('end');
  /** Trigger icon (shared Icon set); "⋯" by default. */
  readonly icon = input('more');
  /** Literal trigger label (wins over `labelKey`). */
  readonly label = input<string | null>(null);
  /**
   * Trigger look: `default` (bordered "Mer ⋯"), `primary` (a full-width accent button,
   * icon first, e.g. the shell's "Registrer"), `ghost` (a borderless top-bar icon) or
   * `tab` (looks like a tab of a tab row: "Mer ▾" on record pages, U29).
   */
  readonly variant = input<'default' | 'primary' | 'ghost' | 'tab'>('default');
  /** With `variant="tab"`: one of the menu's items is the open tab. */
  readonly active = input(false);
  readonly triggerTestId = input('overflow-trigger');

  /** A default-variant menu with its own icon shows it first and a chevron last. */
  protected readonly leadIcon = computed(
    () => this.variant() === 'default' && this.icon() !== 'more' && !this.iconOnly(),
  );

  protected readonly triggerClass = computed(() => {
    const variant = this.variant();
    if (variant === 'tab') {
      return `-mb-px inline-flex items-center gap-1 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap ${FOCUS} ${
        this.active() ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
      }`;
    }
    return TRIGGER_CLASSES[variant];
  });

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly triggerId = `cf-overflow-trigger-${++nextId}`;
  protected readonly menuId = `cf-overflow-menu-${nextId}`;
  protected readonly open = signal(false);
  private readonly itemCount = signal(0);
  protected readonly hasItems = computed(() => this.itemCount() > 0);

  constructor() {
    afterEveryRender(() => {
      const count = this.items().length;
      if (count !== this.itemCount()) {
        this.itemCount.set(count);
      }
    });
  }

  private items(): HTMLElement[] {
    return Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter((el) => !(el as HTMLButtonElement).disabled);
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.openAndFocus(0);
    }
  }

  private openAndFocus(index: number | 'last'): void {
    this.open.set(true);
    // Focus once the panel is rendered visible.
    afterNextRender(
      () => {
        const items = this.items();
        items[index === 'last' ? items.length - 1 : index]?.focus();
      },
      { injector: this.injector },
    );
  }

  close(returnFocus = true): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.openAndFocus(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.openAndFocus('last');
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(event.target as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  protected onMenuClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('[role="menuitem"]')) {
      this.close();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }
}
