import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

const MAX_TAGS = 50;

/**
 * A free-text list editor: type a value and press Enter (or comma) to add it;
 * each chip has a remove button. Backspace on an empty input removes the last chip.
 */
@Component({
  selector: 'app-privacy-tag-input',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-bg px-2 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
    >
      @for (tag of value(); track $index) {
        <span
          class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
        >
          {{ tag }}
          <button
            type="button"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="'privacy.form.removeTag' | transloco: { value: tag }"
            (click)="remove($index)"
          >
            <app-icon name="x" [size]="12" />
          </button>
        </span>
      }
      <input
        [id]="inputId()"
        type="text"
        maxlength="255"
        class="min-w-[140px] flex-1 border-0 bg-transparent px-1 text-[13.5px] text-fg outline-none"
        [placeholder]="'privacy.form.tagPlaceholder' | transloco"
        [value]="draft()"
        (input)="draft.set($any($event.target).value)"
        (keydown)="onKeydown($event)"
        (blur)="commit()"
        [attr.aria-describedby]="describedBy() || null"
      />
    </div>
  `,
})
export class TagInput {
  readonly value = input<readonly string[]>([]);
  readonly inputId = input('');
  readonly describedBy = input('');
  readonly valueChange = output<readonly string[]>();

  protected readonly draft = signal('');

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && !this.draft() && this.value().length) {
      this.remove(this.value().length - 1);
    }
  }

  protected commit(): void {
    const text = this.draft().trim();
    if (!text) {
      return;
    }
    this.draft.set('');
    if (this.value().includes(text) || this.value().length >= MAX_TAGS) {
      return;
    }
    this.valueChange.emit([...this.value(), text]);
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }
}
