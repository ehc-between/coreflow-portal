import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import { QUESTION_TYPES, QuestionIn, QuestionType } from '../data/supplier.models';

/** A question row being edited (every field set, so the template stays simple). */
export interface EditableQuestion {
  readonly id: string | null;
  readonly text: string;
  readonly help: string;
  readonly category: string;
  readonly type: QuestionType;
  readonly weight: number;
  readonly max_score: number;
  readonly critical: boolean;
  readonly required: boolean;
}

export function toEditable(q: QuestionIn): EditableQuestion {
  return {
    id: q.id ?? null,
    text: q.text ?? '',
    help: q.help ?? '',
    category: q.category || 'general',
    type: q.type ?? 'yes_no',
    weight: clampInt(q.weight ?? 1, 1, 10),
    max_score: clampInt(q.max_score ?? 5, 1, 10),
    critical: !!q.critical,
    required: q.required ?? true,
  };
}

/** The wire form of edited questions (blank questions dropped). */
export function toQuestionIn(rows: readonly EditableQuestion[]): QuestionIn[] {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      text: r.text.trim(),
      help: r.help.trim() || null,
      category: r.category.trim() || 'general',
      type: r.type,
      weight: r.weight,
      max_score: r.max_score,
      critical: r.critical,
      required: r.required,
    }));
}

export function blankQuestion(): EditableQuestion {
  return toEditable({ text: '' });
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/**
 * Editor for a questionnaire's questions: text, help, category, answer type, weight,
 * maximum score (score questions), and the critical / required flags; rows can be
 * reordered, removed and added. Stateless: emits the full new list on every change.
 */
@Component({
  selector: 'app-question-editor',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex flex-col gap-3" [attr.aria-label]="'suppliers.questions.listLabel' | transloco">
      @for (q of questions(); track $index; let i = $index; let first = $first; let last = $last) {
        <li class="rounded-tile border border-border bg-bg p-3" data-testid="question-row">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-[12px] font-semibold text-fg-subtle">
              {{ 'suppliers.questions.number' | transloco: { n: i + 1 } }}
            </span>
            <span class="flex items-center gap-1">
              <button
                type="button"
                class="rounded-[8px] px-2 py-1 text-[12px] text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                [disabled]="disabled() || first"
                [attr.aria-label]="'suppliers.questions.moveUp' | transloco: { n: i + 1 }"
                (click)="move(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded-[8px] px-2 py-1 text-[12px] text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                [disabled]="disabled() || last"
                [attr.aria-label]="'suppliers.questions.moveDown' | transloco: { n: i + 1 }"
                (click)="move(i, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="rounded-[8px] p-1 text-fg-subtle hover:text-fail disabled:opacity-40"
                [disabled]="disabled()"
                [attr.aria-label]="'suppliers.questions.remove' | transloco: { n: i + 1 }"
                (click)="remove(i)"
              >
                <app-icon name="trash" [size]="14" />
              </button>
            </span>
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <label
              class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-6"
            >
              {{ 'suppliers.questions.text' | transloco }}
              <textarea
                rows="2"
                maxlength="1000"
                class="rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] font-normal text-fg"
                [value]="q.text"
                [disabled]="disabled()"
                (input)="patch(i, { text: $any($event.target).value })"
              ></textarea>
            </label>
            <label
              class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-6"
            >
              {{ 'suppliers.questions.help' | transloco }}
              <input
                type="text"
                maxlength="1000"
                class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
                [value]="q.help"
                [disabled]="disabled()"
                (input)="patch(i, { help: $any($event.target).value })"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-2"
            >
              {{ 'suppliers.questions.category' | transloco }}
              <input
                type="text"
                maxlength="64"
                class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
                [value]="q.category"
                [disabled]="disabled()"
                (input)="patch(i, { category: $any($event.target).value })"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-2"
            >
              {{ 'suppliers.questions.type' | transloco }}
              <select
                class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] font-normal text-fg"
                [disabled]="disabled()"
                (change)="patch(i, { type: $any($event.target).value })"
              >
                @for (t of types; track t) {
                  <option [value]="t" [selected]="t === q.type">
                    {{ 'suppliers.questionType.' + t | transloco }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
              {{ 'suppliers.questions.weight' | transloco }}
              <input
                type="number"
                min="1"
                max="10"
                class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] font-normal text-fg"
                [value]="q.weight"
                [disabled]="disabled() || q.type === 'text'"
                (change)="patchNumber(i, 'weight', $any($event.target).value)"
              />
            </label>
            @if (q.type === 'score') {
              <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
                {{ 'suppliers.questions.maxScore' | transloco }}
                <input
                  type="number"
                  min="1"
                  max="10"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] font-normal text-fg"
                  [value]="q.max_score"
                  [disabled]="disabled()"
                  (change)="patchNumber(i, 'max_score', $any($event.target).value)"
                />
              </label>
            }
          </div>
          <div class="mt-2 flex flex-wrap gap-4 text-[13px] text-fg">
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4"
                [checked]="q.critical"
                [disabled]="disabled() || q.type === 'text'"
                (change)="patch(i, { critical: $any($event.target).checked })"
              />
              {{ 'suppliers.questions.critical' | transloco }}
            </label>
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4"
                [checked]="q.required"
                [disabled]="disabled()"
                (change)="patch(i, { required: $any($event.target).checked })"
              />
              {{ 'suppliers.questions.required' | transloco }}
            </label>
          </div>
        </li>
      } @empty {
        <li class="rounded-tile border border-dashed border-border p-4 text-[13px] text-fg-muted">
          {{ 'suppliers.questions.empty' | transloco }}
        </li>
      }
    </ol>
    <button
      type="button"
      class="mt-3 inline-flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
      [disabled]="disabled()"
      (click)="add()"
      data-testid="question-add"
    >
      <app-icon name="plus" [size]="14" />
      {{ 'suppliers.questions.add' | transloco }}
    </button>
  `,
})
export class QuestionEditor {
  readonly questions = input.required<readonly EditableQuestion[]>();
  readonly disabled = input(false);
  readonly questionsChange = output<readonly EditableQuestion[]>();

  protected readonly types = QUESTION_TYPES;

  protected patch(index: number, change: Partial<EditableQuestion>): void {
    const next = [...this.questions()];
    const merged = { ...next[index], ...change };
    next[index] = merged.type === 'text' ? { ...merged, critical: false } : merged;
    this.questionsChange.emit(next);
  }

  protected patchNumber(index: number, key: 'weight' | 'max_score', raw: string): void {
    this.patch(index, { [key]: clampInt(Number(raw), 1, 10) });
  }

  protected move(index: number, delta: number): void {
    const next = [...this.questions()];
    const target = index + delta;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    this.questionsChange.emit(next);
  }

  protected remove(index: number): void {
    this.questionsChange.emit(this.questions().filter((_, i) => i !== index));
  }

  protected add(): void {
    this.questionsChange.emit([...this.questions(), blankQuestion()]);
  }
}
