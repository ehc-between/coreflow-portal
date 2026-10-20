import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Standard } from '../../core/deviations/deviation.models';
import { Icon } from '../../shared/ui/icon/icon';
import { STANDARD_OPTIONS, standardLabelKey } from './deviation-enums';
import { ClauseRow } from './deviation-edit';

/**
 * Editor for a deviation's classification: standards (checkboxes), clause
 * references (standard + free-text clause rows) and free-form tags. Two-way
 * bound via `model()`s, so it is shared by the create form and the detail
 * page's edit mode:
 *
 *   <app-deviation-classification-fields
 *     idPrefix="dev"
 *     [(standards)]="standards" [(clauses)]="clauses" [(tags)]="tags" />
 */
@Component({
  selector: 'app-deviation-classification-fields',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.create.fields.standards' | transloco }}
        </span>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          @for (option of standardOptions; track option) {
            <label class="flex cursor-pointer items-center gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                [checked]="standards().includes(option)"
                (change)="toggleStandard(option)"
                class="h-4 w-4 accent-[var(--accent)]"
              />
              {{ standardLabelKey(option) | transloco }}
            </label>
          }
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.create.fields.clauses' | transloco }}
        </span>
        @for (row of clauses(); track $index) {
          <div class="flex items-center gap-2">
            <div class="cf-select w-[160px] flex-none">
              <select
                [value]="row.standard"
                [attr.aria-label]="'deviations.create.fields.standards' | transloco"
                (change)="setClauseStandard($index, $any($event.target).value)"
              >
                @for (option of standardOptions; track option) {
                  <option [value]="option" [selected]="option === row.standard">
                    {{ standardLabelKey(option) | transloco }}
                  </option>
                }
              </select>
            </div>
            <input
              type="text"
              [value]="row.clause"
              (input)="setClauseValue($index, $any($event.target).value)"
              [attr.aria-label]="'deviations.create.fields.clauses' | transloco"
              [placeholder]="'deviations.create.clausePlaceholder' | transloco"
              autocomplete="off"
              class="h-10 flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
            <button
              type="button"
              [attr.aria-label]="'deviations.create.removeClause' | transloco"
              (click)="removeClause($index)"
              class="flex flex-none rounded-[8px] p-2 text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <app-icon name="x" [size]="15" />
            </button>
          </div>
        }
        <button
          type="button"
          (click)="addClause()"
          class="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
        >
          <app-icon name="plus" [size]="14" />
          {{ 'deviations.create.addClause' | transloco }}
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <label [for]="idPrefix() + '-tag'" class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.create.fields.tags' | transloco }}
        </label>
        @if (tags().length) {
          <div class="flex flex-wrap gap-1.5">
            @for (t of tags(); track t) {
              <span
                class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-fg"
              >
                {{ t }}
                <button
                  type="button"
                  [attr.aria-label]="'deviations.create.removeTag' | transloco"
                  (click)="removeTag(t)"
                  class="flex text-fg-subtle hover:text-fg"
                >
                  <app-icon name="x" [size]="13" />
                </button>
              </span>
            }
          </div>
        }
        <input
          [id]="idPrefix() + '-tag'"
          type="text"
          [value]="tagDraft()"
          (input)="tagDraft.set($any($event.target).value)"
          (keydown.enter)="addTag($event)"
          (blur)="commitTagDraft()"
          [placeholder]="'deviations.create.tagPlaceholder' | transloco"
          autocomplete="off"
          class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationClassificationFields {
  /** Prefix for element ids, so two instances never collide. */
  readonly idPrefix = input('dev');
  readonly standards = model<readonly Standard[]>([]);
  readonly clauses = model<readonly ClauseRow[]>([]);
  readonly tags = model<readonly string[]>([]);

  protected readonly standardOptions = STANDARD_OPTIONS;
  protected readonly standardLabelKey = standardLabelKey;
  protected readonly tagDraft = signal('');

  protected toggleStandard(standard: Standard): void {
    const current = this.standards();
    this.standards.set(
      current.includes(standard) ? current.filter((s) => s !== standard) : [...current, standard],
    );
  }

  protected addClause(): void {
    this.clauses.set([...this.clauses(), { standard: STANDARD_OPTIONS[0], clause: '' }]);
  }

  protected removeClause(index: number): void {
    this.clauses.set(this.clauses().filter((_, i) => i !== index));
  }

  protected setClauseStandard(index: number, standard: Standard): void {
    this.clauses.set(this.clauses().map((row, i) => (i === index ? { ...row, standard } : row)));
  }

  protected setClauseValue(index: number, clause: string): void {
    this.clauses.set(this.clauses().map((row, i) => (i === index ? { ...row, clause } : row)));
  }

  protected addTag(event: Event): void {
    event.preventDefault();
    this.commitTagDraft();
  }

  /** Adds the typed tag (if any, and not a duplicate) and clears the draft. */
  protected commitTagDraft(): void {
    const value = this.tagDraft().trim();
    if (value && !this.tags().includes(value)) {
      this.tags.set([...this.tags(), value]);
    }
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.set(this.tags().filter((t) => t !== tag));
  }
}
