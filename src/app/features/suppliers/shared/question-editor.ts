import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  MAX_QUESTION_REFS,
  QUESTION_CATEGORIES,
  QUESTION_TYPES,
  QuestionIn,
  QuestionType,
} from '../data/supplier.models';

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
  /** Clauses the question checks (canonical refs). */
  readonly requirement_refs: readonly string[];
}

/** Whether a section is one of the known (translated) sections. */
export function isKnownCategory(category: string): boolean {
  return (QUESTION_CATEGORIES as readonly string[]).includes(category.trim().toLowerCase());
}

export function toEditable(q: QuestionIn): EditableQuestion {
  const category = (q.category || 'general').trim();
  return {
    id: q.id ?? null,
    text: q.text ?? '',
    help: q.help ?? '',
    category: isKnownCategory(category) ? category.toLowerCase() : category,
    type: q.type ?? 'yes_no',
    weight: clampInt(q.weight ?? 1, 1, 10),
    max_score: clampInt(q.max_score ?? 5, 1, 10),
    critical: !!q.critical,
    required: q.required ?? true,
    requirement_refs: [...(q.requirement_refs ?? [])].slice(0, MAX_QUESTION_REFS),
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
      requirement_refs: [...r.requirement_refs].slice(0, MAX_QUESTION_REFS),
    }));
}

export function blankQuestion(): EditableQuestion {
  return toEditable({ text: '' });
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** The select value of a row's section: a known key, or `other` for a custom one. */
export function categoryChoice(category: string): string {
  return isKnownCategory(category) ? category : 'other';
}

let nextId = 0;

/**
 * Editor for a questionnaire's questions: text, guidance for the person answering,
 * section (a known one or "Annet" with a name), answer type, weight (how much the
 * question counts), maximum score (score questions), the clauses the question checks
 * and the critical / required flags (critical: a "Nei" means rejection whatever the
 * score). Rows can be reordered, removed and added. Stateless: emits the full new list
 * on every change.
 */
@Component({
  selector: 'app-question-editor',
  imports: [FormsModule, TranslocoPipe, Button, ClausePicker, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex flex-col gap-3" [attr.aria-label]="'suppliers.questions.listLabel' | transloco">
      @for (q of questions(); track $index; let i = $index; let first = $first; let last = $last) {
        <li class="rounded-tile border border-border bg-bg p-4" data-testid="question-row">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-meta font-semibold text-fg-subtle">
              {{ 'suppliers.questions.number' | transloco: { n: i + 1 } }}
            </span>
            <span class="flex items-center gap-1">
              <button
                type="button"
                class="h-7 rounded-tile px-2 text-meta text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                [disabled]="disabled() || first"
                [attr.aria-label]="'suppliers.questions.moveUp' | transloco: { n: i + 1 }"
                (click)="move(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="h-7 rounded-tile px-2 text-meta text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                [disabled]="disabled() || last"
                [attr.aria-label]="'suppliers.questions.moveDown' | transloco: { n: i + 1 }"
                (click)="move(i, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="h-7 rounded-tile p-1 text-fg-subtle hover:text-fail disabled:opacity-40"
                [disabled]="disabled()"
                [attr.aria-label]="'suppliers.questions.remove' | transloco: { n: i + 1 }"
                (click)="remove(i)"
              >
                <app-icon name="trash" [size]="14" />
              </button>
            </span>
          </div>
          <div class="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-6">
            <div class="sm:col-span-6">
              <app-form-field
                [label]="'suppliers.questions.text' | transloco"
                [inputId]="id + '-text-' + i"
              >
                <textarea
                  [id]="id + '-text-' + i"
                  rows="2"
                  maxlength="1000"
                  [value]="q.text"
                  [disabled]="disabled()"
                  (input)="patch(i, { text: $any($event.target).value })"
                ></textarea>
              </app-form-field>
            </div>
            <div class="sm:col-span-6">
              <app-form-field
                [label]="'suppliers.questions.help' | transloco"
                [inputId]="id + '-help-' + i"
              >
                <input
                  [id]="id + '-help-' + i"
                  type="text"
                  maxlength="1000"
                  [value]="q.help"
                  [disabled]="disabled()"
                  (input)="patch(i, { help: $any($event.target).value })"
                />
              </app-form-field>
            </div>
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'suppliers.questions.category' | transloco"
                [inputId]="id + '-cat-' + i"
              >
                <select
                  [id]="id + '-cat-' + i"
                  [disabled]="disabled()"
                  (change)="setCategory(i, $any($event.target).value)"
                >
                  @for (c of categories; track c) {
                    <option [value]="c" [selected]="choice(q.category) === c">
                      {{ 'suppliers.questionCategory.' + c | transloco }}
                    </option>
                  }
                  <option value="other" [selected]="choice(q.category) === 'other'">
                    {{ 'suppliers.questionCategory.other' | transloco }}
                  </option>
                </select>
                @if (choice(q.category) === 'other') {
                  <label class="sr-only" [attr.for]="id + '-catname-' + i">
                    {{ 'suppliers.questions.categoryName' | transloco }}
                  </label>
                  <input
                    [id]="id + '-catname-' + i"
                    type="text"
                    maxlength="64"
                    [placeholder]="'suppliers.questions.categoryName' | transloco"
                    [value]="q.category === 'other' ? '' : q.category"
                    [disabled]="disabled()"
                    (input)="patch(i, { category: $any($event.target).value || 'other' })"
                  />
                }
              </app-form-field>
            </div>
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'suppliers.questions.type' | transloco"
                [inputId]="id + '-type-' + i"
              >
                <select
                  [id]="id + '-type-' + i"
                  [disabled]="disabled()"
                  (change)="patch(i, { type: $any($event.target).value })"
                >
                  @for (t of types; track t) {
                    <option [value]="t" [selected]="t === q.type">
                      {{ 'suppliers.questionType.' + t | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'suppliers.questions.weight' | transloco"
                [inputId]="id + '-weight-' + i"
                [hint]="'suppliers.questions.weightHint' | transloco"
              >
                <input
                  [id]="id + '-weight-' + i"
                  type="number"
                  min="1"
                  max="10"
                  [value]="q.weight"
                  [disabled]="disabled() || q.type === 'text'"
                  (change)="patchNumber(i, 'weight', $any($event.target).value)"
                />
              </app-form-field>
            </div>
            @if (q.type === 'score') {
              <div class="sm:col-span-3">
                <app-form-field
                  [label]="'suppliers.questions.maxScore' | transloco"
                  [inputId]="id + '-max-' + i"
                >
                  <input
                    [id]="id + '-max-' + i"
                    type="number"
                    min="1"
                    max="10"
                    [value]="q.max_score"
                    [disabled]="disabled()"
                    (change)="patchNumber(i, 'max_score', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
            }
            <div class="sm:col-span-6">
              <app-form-field
                [label]="'suppliers.questions.refs' | transloco"
                [inputId]="id + '-refs-' + i"
                [hint]="'suppliers.questions.refsHint' | transloco: { max: maxRefs }"
              >
                <app-clause-picker
                  [inputId]="id + '-refs-' + i"
                  [ngModel]="q.requirement_refs"
                  [ngModelOptions]="{ standalone: true }"
                  [disabled]="disabled()"
                  (ngModelChange)="setRefs(i, $event)"
                />
              </app-form-field>
            </div>
          </div>
          <div class="mt-3 flex flex-col gap-2 text-ui text-fg">
            <label class="inline-flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                [checked]="q.critical"
                [disabled]="disabled() || q.type === 'text'"
                (change)="patch(i, { critical: $any($event.target).checked })"
              />
              <span>
                {{ 'suppliers.questions.critical' | transloco }}
                <span class="block text-meta text-fg-subtle">
                  {{ 'suppliers.questions.criticalHint' | transloco }}
                </span>
              </span>
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
        <li class="rounded-tile border border-dashed border-border p-4 text-ui text-fg-muted">
          {{ 'suppliers.questions.empty' | transloco }}
        </li>
      }
    </ol>
    <app-button
      class="mt-3 inline-block"
      variant="secondary"
      size="sm"
      [disabled]="disabled()"
      (click)="add()"
      data-testid="question-add"
    >
      <app-icon name="plus" [size]="14" />
      {{ 'suppliers.questions.add' | transloco }}
    </app-button>
  `,
})
export class QuestionEditor {
  readonly questions = input.required<readonly EditableQuestion[]>();
  readonly disabled = input(false);
  readonly questionsChange = output<readonly EditableQuestion[]>();

  protected readonly id = `sup-q-${++nextId}`;
  protected readonly types = QUESTION_TYPES;
  protected readonly categories = QUESTION_CATEGORIES;
  protected readonly maxRefs = MAX_QUESTION_REFS;
  protected readonly choice = categoryChoice;

  protected patch(index: number, change: Partial<EditableQuestion>): void {
    const next = [...this.questions()];
    const merged = { ...next[index], ...change };
    next[index] = merged.type === 'text' ? { ...merged, critical: false } : merged;
    this.questionsChange.emit(next);
  }

  protected setCategory(index: number, value: string): void {
    // "Annet" keeps a custom name already typed; a known section replaces it.
    const current = this.questions()[index]?.category ?? '';
    if (value === 'other') {
      this.patch(index, { category: isKnownCategory(current) ? 'other' : current || 'other' });
    } else {
      this.patch(index, { category: value });
    }
  }

  protected setRefs(index: number, value: unknown): void {
    const refs = Array.isArray(value) ? (value as string[]) : [];
    this.patch(index, { requirement_refs: refs.slice(0, MAX_QUESTION_REFS) });
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
