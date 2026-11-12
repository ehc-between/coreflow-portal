import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ScopeExclusion } from '../data/context.models';

/** Editor for a scope's excluded requirements, each with its justification (ISO HS 4.3). */
@Component({
  selector: 'app-context-exclusions-editor',
  imports: [TranslocoPipe, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
        {{ 'context.fields.exclusions' | transloco }}
      </legend>
      <ul class="flex flex-col gap-2">
        @for (e of exclusions(); track $index; let i = $index) {
          <li
            class="grid grid-cols-1 gap-2 rounded-tile border border-border p-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]"
          >
            <app-form-field
              [label]="'context.scope.clause' | transloco"
              [inputId]="'excl-clause-' + i"
            >
              <input
                [id]="'excl-clause-' + i"
                type="text"
                maxlength="32"
                [value]="e.clause"
                [placeholder]="'context.scope.clausePlaceholder' | transloco"
                (input)="patch(i, { clause: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field
              [label]="'context.scope.justification' | transloco"
              [inputId]="'excl-just-' + i"
            >
              <textarea
                [id]="'excl-just-' + i"
                rows="2"
                maxlength="2000"
                [value]="e.justification"
                (input)="patch(i, { justification: $any($event.target).value })"
              ></textarea>
            </app-form-field>
            <button
              type="button"
              class="self-end rounded-[6px] p-2 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'context.scope.removeExclusion' | transloco"
              (click)="remove(i)"
            >
              <app-icon name="trash" [size]="14" />
            </button>
          </li>
        }
      </ul>
      <button
        type="button"
        class="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="add()"
      >
        <app-icon name="plus" [size]="13" />
        {{ 'context.scope.addExclusion' | transloco }}
      </button>
    </fieldset>
  `,
})
export class ExclusionsEditor {
  readonly exclusions = input.required<readonly ScopeExclusion[]>();
  readonly exclusionsChange = output<readonly ScopeExclusion[]>();

  protected add(): void {
    this.exclusionsChange.emit([...this.exclusions(), { clause: '', justification: '' }]);
  }

  protected patch(index: number, change: Partial<ScopeExclusion>): void {
    this.exclusionsChange.emit(
      this.exclusions().map((e, i) => (i === index ? { ...e, ...change } : e)),
    );
  }

  protected remove(index: number): void {
    this.exclusionsChange.emit(this.exclusions().filter((_, i) => i !== index));
  }
}
