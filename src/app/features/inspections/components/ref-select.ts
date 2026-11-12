import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NamedRef } from '../data/inspection-references';

/**
 * Native `<select>` over named references (people, departments, templates) with a
 * "none" option. A current value missing from the options (a former member, an
 * archived template) stays selectable under its known name. Pair with
 * `<app-form-field>` and give it the same `inputId`.
 */
@Component({
  selector: 'app-ref-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.data-testid]="testId() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      @if (noneLabel(); as none) {
        <option value="" [selected]="!value()">{{ none }}</option>
      }
      @if (orphan()) {
        <option [value]="value()" selected>{{ currentName() || value() }}</option>
      }
      @for (o of options(); track o.id) {
        <option [value]="o.id" [selected]="o.id === value()">{{ o.name }}</option>
      }
    </select>
  `,
})
export class RefSelect {
  readonly inputId = input('');
  readonly options = input<readonly NamedRef[]>([]);
  readonly value = input<string | null>('');
  /** Label of the empty option (translated by the host); omit for no empty option. */
  readonly noneLabel = input<string | null>(null);
  readonly currentName = input<string | null>(null);
  readonly disabled = input(false);
  readonly describedBy = input('');
  readonly testId = input('');
  readonly valueChange = output<string>();

  protected readonly orphan = computed(() => {
    const value = this.value();
    return !!value && !this.options().some((o) => o.id === value);
  });
}
