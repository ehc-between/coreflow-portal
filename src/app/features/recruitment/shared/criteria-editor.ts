import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';

export interface CriterionDraft {
  readonly id: string | null;
  readonly label: string;
  readonly description: string;
}

let nextId = 0;

/**
 * Editable list of structured screening criteria (label + what evidence meets it).
 * Every application is screened and every interview scored against the same list,
 * which keeps screening consistent and job-related.
 */
@Component({
  selector: 'app-criteria-editor',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex flex-col gap-2.5">
      @for (item of criteria(); track $index; let i = $index) {
        <li class="rounded-tile border border-border bg-surface p-3">
          <div class="flex items-start gap-2">
            <span class="mt-2 w-5 flex-none text-[12px] font-semibold text-fg-subtle">{{
              i + 1
            }}</span>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <label class="sr-only" [attr.for]="uid + '-label-' + i">{{
                'recruitment.criteria.label' | transloco
              }}</label>
              <input
                [id]="uid + '-label-' + i"
                class="cf-input"
                maxlength="200"
                [value]="item.label"
                [disabled]="disabled()"
                [placeholder]="'recruitment.criteria.labelPlaceholder' | transloco"
                (input)="update(i, 'label', $any($event.target).value)"
              />
              <label class="sr-only" [attr.for]="uid + '-desc-' + i">{{
                'recruitment.criteria.description' | transloco
              }}</label>
              <input
                [id]="uid + '-desc-' + i"
                class="cf-input"
                maxlength="1000"
                [value]="item.description"
                [disabled]="disabled()"
                [placeholder]="'recruitment.criteria.descriptionPlaceholder' | transloco"
                (input)="update(i, 'description', $any($event.target).value)"
              />
            </div>
            @if (!disabled()) {
              <button
                type="button"
                class="mt-1.5 flex rounded-[6px] p-1.5 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="
                  'recruitment.criteria.remove' | transloco: { label: item.label || i + 1 }
                "
                (click)="remove(i)"
              >
                <app-icon name="trash" [size]="15" />
              </button>
            }
          </div>
        </li>
      } @empty {
        <li class="text-[13px] text-fg-muted">{{ 'recruitment.criteria.none' | transloco }}</li>
      }
    </ol>
    @if (!disabled() && criteria().length < max) {
      <button
        type="button"
        class="mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="add()"
        data-testid="criteria-add"
      >
        <app-icon name="plus" [size]="14" />
        {{ 'recruitment.criteria.add' | transloco }}
      </button>
    }
  `,
  styles: [
    `
      .cf-input {
        width: 100%;
        height: 38px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      .cf-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
      .cf-input:disabled {
        opacity: 0.7;
      }
    `,
  ],
})
export class CriteriaEditor {
  readonly criteria = model<readonly CriterionDraft[]>([]);
  readonly disabled = input(false);

  protected readonly max = 30;
  protected readonly uid = `cf-criteria-${++nextId}`;

  protected add(): void {
    this.criteria.update((list) => [...list, { id: null, label: '', description: '' }]);
  }

  protected remove(index: number): void {
    this.criteria.update((list) => list.filter((_, i) => i !== index));
  }

  protected update(index: number, field: 'label' | 'description', value: string): void {
    this.criteria.update((list) =>
      list.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }
}
