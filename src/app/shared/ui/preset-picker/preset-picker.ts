import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../icon/icon';

/** One preset ("start from …") a form can be filled from: a literal `label` or an i18n `labelKey`. */
export interface PresetOption {
  readonly key: string;
  readonly label?: string;
  readonly labelKey?: string;
}

/**
 * A compact "start from a template" card above a form (docs/ux-guide.md, "Form
 * anatomy"): icon + title + one line, then the presets as a tidy grid of equal tiles
 * (2 columns on phones, 3 from 640 px). Only the first `visible` show until the user
 * opens "Vis alle (N)". Picking one emits `picked`; the page fills the form.
 *
 *   <app-preset-picker [title]="'x.library.title' | transloco"
 *                      [description]="'x.library.body' | transloco"
 *                      [options]="presets()" [selected]="picked()"
 *                      [appliedText]="picked() ? ('x.library.applied' | transloco) : ''"
 *                      (picked)="use($event)" />
 */
@Component({
  selector: 'app-preset-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-card border border-border bg-surface p-4 shadow-card sm:px-5"
      [attr.aria-label]="title()"
      data-testid="preset-picker"
    >
      <div class="flex items-start gap-3">
        <span
          class="flex h-8 w-8 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <app-icon [name]="icon()" [size]="16" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-ui leading-6 font-semibold text-fg">{{ title() }}</h2>
          @if (description()) {
            <p class="text-meta leading-snug text-fg-muted">{{ description() }}</p>
          }
        </div>
      </div>
      <ul class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="preset-options">
        @for (o of shown(); track o.key) {
          <li class="min-w-0">
            <button
              type="button"
              class="flex h-full min-h-9 w-full min-w-0 items-center gap-1.5 rounded-tile border px-3 py-1.5 text-left text-ui leading-snug font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="
                selected() === o.key
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-bg text-fg hover:border-border-strong hover:bg-surface-2'
              "
              [attr.aria-pressed]="selected() === o.key"
              [title]="o.label ?? (o.labelKey ?? '' | transloco)"
              (click)="picked.emit(o.key)"
              [attr.data-testid]="testIdPrefix() + o.key"
            >
              @if (selected() === o.key) {
                <app-icon name="check" [size]="14" class="flex-none" />
              }
              <span class="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{{
                o.label ?? (o.labelKey ?? '' | transloco)
              }}</span>
            </button>
          </li>
        }
      </ul>
      @if (hiddenCount() > 0 || expanded()) {
        <button
          type="button"
          class="mt-2 text-meta font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-expanded]="expanded()"
          (click)="expanded.set(!expanded())"
          data-testid="preset-toggle"
        >
          {{
            expanded()
              ? ('ui.presets.showFewer' | transloco)
              : ('ui.presets.showAll' | transloco: { count: options().length })
          }}
        </button>
      }
      @if (appliedText()) {
        <p class="mt-2 text-meta text-fg-muted" role="status">{{ appliedText() }}</p>
      }
    </section>
  `,
})
export class PresetPicker {
  readonly title = input.required<string>();
  readonly description = input<string | null | undefined>('');
  readonly options = input.required<readonly PresetOption[]>();
  /** Key of the preset applied, if any (shown pressed). */
  readonly selected = input<string | null | undefined>(null);
  /** Status line once a preset is applied (translated). */
  readonly appliedText = input<string | null | undefined>('');
  /** How many tiles show before "Vis alle (N)". */
  readonly visible = input(6);
  readonly icon = input('book');
  /** `data-testid` prefix of each tile (`<prefix><key>`). */
  readonly testIdPrefix = input('preset-');

  readonly picked = output<string>();

  protected readonly expanded = signal(false);
  protected readonly shown = computed(() => {
    const all = this.options();
    if (this.expanded() || all.length <= this.visible() + 1) {
      return all;
    }
    const head = all.slice(0, this.visible());
    // Keep the picked one visible even when it is past the cut.
    const sel = all.find((o) => o.key === this.selected());
    return sel && !head.includes(sel) ? [...head.slice(0, -1), sel] : head;
  });
  protected readonly hiddenCount = computed(() => this.options().length - this.shown().length);
}
