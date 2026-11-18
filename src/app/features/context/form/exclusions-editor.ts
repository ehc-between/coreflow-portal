import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DraftExclusion } from './context-draft';

/**
 * Editor for a scope's excluded requirements (HS 4.3): each picks a clause of
 * the scope's standard from the catalogue (no free text) and says why it does
 * not apply. While the scope is the approved one, those requirements count as
 * "not applicable" in the standard's coverage.
 */
@Component({
  selector: 'app-context-exclusions-editor',
  imports: [FormsModule, TranslocoPipe, ClausePicker, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset aria-describedby="excl-hint">
      <legend class="mb-1 text-ui font-semibold text-fg-muted">
        {{ 'context.fields.exclusions' | transloco }}
      </legend>
      <p id="excl-hint" class="mb-2 text-meta text-fg-muted">
        {{ 'context.scope.exclusionsFormHint' | transloco }}
      </p>
      <ul class="flex flex-col gap-2">
        @for (e of exclusions(); track $index; let i = $index) {
          <li
            class="grid grid-cols-1 gap-2 rounded-tile border border-border p-2.5 sm:grid-cols-[220px_minmax(0,1fr)_auto]"
          >
            <app-form-field
              [label]="'context.scope.clause' | transloco"
              [inputId]="'excl-clause-' + i"
            >
              <app-clause-picker
                [inputId]="'excl-clause-' + i"
                [multiple]="false"
                [frameworks]="pickerFrameworks()"
                [ngModel]="e.clause || null"
                (ngModelChange)="patch(i, { clause: $event ?? '' })"
                [placeholderKey]="'context.scope.clausePlaceholder'"
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
              class="flex h-9 w-9 items-center justify-center self-end rounded-md text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'context.scope.removeExclusion' | transloco: { number: i + 1 }"
              (click)="remove(i)"
            >
              <app-icon name="trash" [size]="14" />
            </button>
          </li>
        }
      </ul>
      <button
        type="button"
        class="mt-2 inline-flex min-h-8 items-center gap-1 text-meta font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="add()"
      >
        <app-icon name="plus" [size]="13" />
        {{ 'context.scope.addExclusion' | transloco }}
      </button>
    </fieldset>
  `,
})
export class ExclusionsEditor {
  readonly exclusions = input.required<readonly DraftExclusion[]>();
  /** The scope's standard: the picker searches its clauses. */
  readonly framework = input('');
  readonly exclusionsChange = output<readonly DraftExclusion[]>();

  protected readonly pickerFrameworks = computed(() =>
    this.framework() ? [this.framework()] : null,
  );

  protected add(): void {
    this.exclusionsChange.emit([...this.exclusions(), { clause: '', justification: '' }]);
  }

  protected patch(index: number, change: Partial<DraftExclusion>): void {
    this.exclusionsChange.emit(
      this.exclusions().map((e, i) => (i === index ? { ...e, ...change } : e)),
    );
  }

  protected remove(index: number): void {
    this.exclusionsChange.emit(this.exclusions().filter((_, i) => i !== index));
  }
}
