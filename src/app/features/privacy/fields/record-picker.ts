import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

export interface PickerOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Several linked records: the chosen ones as chips (each with a remove button), and a
 * select that adds one more from the rest. Ids the options do not hold (a record the
 * user cannot see) stay as "Koblet post" chips, so saving never drops them.
 */
@Component({
  selector: 'app-privacy-record-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      @if (chosen().length) {
        <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="label()">
          @for (c of chosen(); track c.id) {
            <li
              class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-meta text-fg"
            >
              @let name = c.label ?? ('privacy.detail.linkedRecord' | transloco);
              {{ name }}
              <button
                type="button"
                class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'privacy.form.removeTag' | transloco: { value: name }"
                (click)="remove(c.id)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            </li>
          }
        </ul>
      }
      <select
        [id]="inputId()"
        (change)="add($any($event.target)); $any($event.target).value = ''"
        [attr.data-testid]="testId()"
        [disabled]="!available().length"
      >
        <option value="">
          {{ (available().length ? addLabelKey() : emptyLabelKey()) | transloco }}
        </option>
        @for (o of available(); track o.id) {
          <option [value]="o.id">{{ o.label }}</option>
        }
      </select>
    </div>
  `,
})
export class RecordPicker {
  readonly options = input<readonly PickerOption[]>([]);
  readonly value = input<readonly string[]>([]);
  readonly inputId = input('');
  readonly testId = input<string | null>(null);
  /** Accessible name of the chip list (the field label). */
  readonly label = input('');
  readonly addLabelKey = input('privacy.form.addRecord');
  readonly emptyLabelKey = input('privacy.form.noRecords');
  readonly valueChange = output<readonly string[]>();

  protected readonly chosen = computed(() =>
    this.value().map((id) => ({
      id,
      label: this.options().find((o) => o.id === id)?.label ?? null,
    })),
  );
  protected readonly available = computed(() =>
    this.options().filter((o) => !this.value().includes(o.id)),
  );

  protected add(select: HTMLSelectElement): void {
    const id = select.value;
    if (id && !this.value().includes(id)) {
      this.valueChange.emit([...this.value(), id]);
    }
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((v) => v !== id));
  }
}
