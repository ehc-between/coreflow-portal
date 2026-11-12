import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

let nextId = 0;

/**
 * Edits a short list of strings (turtle-diagram facts such as inputs or outputs):
 * each item is an editable row with a remove button, and a trailing "add" field
 * that adds on Enter or with the add button. Items are trimmed; empty ones are
 * dropped. `items` is two-way bound.
 */
@Component({
  selector: 'app-string-list-editor',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="flex flex-col gap-1.5" [attr.aria-label]="label()">
      @for (item of items(); track $index; let i = $index) {
        <li class="flex items-center gap-1.5">
          <input
            class="cf-list-input"
            [value]="item"
            maxlength="500"
            [attr.aria-label]="
              'processes.items.itemLabel' | transloco: { label: label(), n: i + 1 }
            "
            (change)="update(i, $any($event.target).value)"
          />
          <button
            type="button"
            class="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] text-fg-subtle hover:bg-surface-2 hover:text-fail"
            [attr.aria-label]="'processes.items.remove' | transloco: { item }"
            (click)="remove(i)"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </li>
      }
    </ul>
    @if (items().length < max()) {
      <div class="mt-1.5 flex items-center gap-1.5">
        <input
          [id]="addId"
          class="cf-list-input"
          maxlength="500"
          [value]="draft()"
          [placeholder]="placeholder() || ('processes.items.addPlaceholder' | transloco)"
          [attr.aria-label]="'processes.items.addLabel' | transloco: { label: label() }"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="$event.preventDefault(); add()"
          [attr.data-testid]="'list-add-' + name()"
        />
        <button
          type="button"
          class="inline-flex h-9 flex-none items-center gap-1 rounded-[8px] border border-border px-2.5 text-[12.5px] font-semibold text-fg-muted hover:text-fg disabled:opacity-40"
          [disabled]="!draft().trim()"
          (click)="add()"
        >
          <app-icon name="plus" [size]="13" />
          {{ 'processes.items.add' | transloco }}
        </button>
      </div>
    }
  `,
  styles: [
    `
      .cf-list-input {
        width: 100%;
        height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 10px;
        outline: none;
      }
      .cf-list-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class StringListEditor {
  readonly items = model<readonly string[]>([]);
  /** Translated list label (for the accessible names). */
  readonly label = input('');
  /** Field name (test ids). */
  readonly name = input('list');
  readonly placeholder = input('');
  readonly max = input(50);

  protected readonly addId = `cf-string-list-${++nextId}`;
  protected readonly draft = signal('');

  protected add(): void {
    const value = this.draft().trim();
    if (!value || this.items().length >= this.max()) {
      return;
    }
    this.items.set([...this.items(), value]);
    this.draft.set('');
  }

  protected update(index: number, value: string): void {
    const trimmed = value.trim();
    const next = [...this.items()];
    if (trimmed) {
      next[index] = trimmed;
    } else {
      next.splice(index, 1);
    }
    this.items.set(next);
  }

  protected remove(index: number): void {
    this.items.set(this.items().filter((_, i) => i !== index));
  }
}
