import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { EditableQuestion, questionProblems } from '../data/answer-model';
import { questionTypeKey, severityKey } from '../data/inspection-display';
import { NA_TYPES, QUESTION_TYPES, Question, SEVERITIES } from '../data/inspection.models';

let nextId = 0;

/**
 * One row of the checklist builder: the question text, type, section and the rules
 * for its type (fail answer, score scale and pass score, acceptable number range),
 * whether it is required or may be N/A, the finding it raises when it fails, and
 * (under "More") help text, weight, clause references and a stable id.
 */
@Component({
  selector: 'app-question-editor',
  imports: [TranslocoPipe, FieldHelp, Button, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset
      class="rounded-card border bg-surface p-3.5"
      [class.border-fail]="invalid()"
      [class.border-border]="!invalid()"
      [attr.aria-label]="'inspections.builder.questionN' | transloco: { n: index() + 1 }"
      [attr.data-testid]="'question-' + index()"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="font-mono text-[12px] text-fg-subtle">{{ index() + 1 }}.</span>
        <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg-muted">
          {{ typeKey(q().type) | transloco }}
        </span>
        <app-button
          variant="ghost"
          size="sm"
          [disabled]="index() === 0"
          (click)="move.emit(-1)"
          [attr.aria-label]="'inspections.builder.moveUp' | transloco"
        >
          <app-icon name="chevron" [size]="14" class="rotate-180" />
        </app-button>
        <app-button
          variant="ghost"
          size="sm"
          [disabled]="index() === total() - 1"
          (click)="move.emit(1)"
          [attr.aria-label]="'inspections.builder.moveDown' | transloco"
        >
          <app-icon name="chevron" [size]="14" />
        </app-button>
        <app-button
          variant="ghost"
          size="sm"
          (click)="duplicate.emit()"
          [attr.aria-label]="'inspections.builder.duplicateQuestion' | transloco"
        >
          <app-icon name="plus" [size]="14" />
        </app-button>
        <app-button
          variant="ghost"
          size="sm"
          (click)="remove.emit()"
          [attr.aria-label]="'inspections.builder.removeQuestion' | transloco"
          data-testid="remove-question"
        >
          <app-icon name="trash" [size]="14" />
        </app-button>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div class="sm:col-span-4">
          <app-form-field [label]="'inspections.builder.text' | transloco" [inputId]="id('text')">
            <textarea
              [id]="id('text')"
              rows="2"
              maxlength="500"
              [value]="q().text"
              (input)="patch({ text: $any($event.target).value })"
              [attr.aria-invalid]="problems().includes('textRequired')"
              data-testid="question-text"
            ></textarea>
          </app-form-field>
        </div>
        <div class="sm:col-span-2">
          <app-form-field [label]="'inspections.builder.type' | transloco" [inputId]="id('type')">
            <select
              [id]="id('type')"
              (change)="changeType($any($event.target).value)"
              data-testid="question-type"
            >
              @for (t of types; track t) {
                <option [value]="t" [selected]="t === q().type">
                  {{ typeKey(t) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        </div>
        <div class="sm:col-span-3">
          <app-form-field
            [label]="'inspections.builder.section' | transloco"
            [inputId]="id('section')"
          >
            <input
              [id]="id('section')"
              maxlength="120"
              [value]="q().section ?? ''"
              [attr.list]="sectionListId()"
              (input)="patch({ section: $any($event.target).value || null })"
            />
          </app-form-field>
        </div>

        @switch (q().type) {
          @case ('yes_no') {
            <div class="sm:col-span-3">
              <app-form-field
                [label]="'inspections.builder.failAnswer' | transloco"
                [inputId]="id('fail')"
              >
                <select
                  [id]="id('fail')"
                  (change)="patch({ fail_answer: $any($event.target).value })"
                >
                  <option value="no" [selected]="q().fail_answer === 'no'">
                    {{ 'inspections.builder.failOnNo' | transloco }}
                  </option>
                  <option value="yes" [selected]="q().fail_answer === 'yes'">
                    {{ 'inspections.builder.failOnYes' | transloco }}
                  </option>
                </select>
              </app-form-field>
            </div>
          }
          @case ('score') {
            <div class="sm:col-span-1">
              <app-form-field
                [label]="'inspections.builder.scaleMin' | transloco"
                [inputId]="id('smin')"
              >
                <input
                  [id]="id('smin')"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  [value]="q().scale_min"
                  (change)="patch({ scale_min: int($any($event.target).value, 0) })"
                />
              </app-form-field>
            </div>
            <div class="sm:col-span-1">
              <app-form-field
                [label]="'inspections.builder.scaleMax' | transloco"
                [inputId]="id('smax')"
              >
                <input
                  [id]="id('smax')"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  [value]="q().scale_max"
                  (change)="patch({ scale_max: int($any($event.target).value, 5) })"
                />
              </app-form-field>
            </div>
            <div class="sm:col-span-1">
              <app-form-field
                [label]="'inspections.builder.passScore' | transloco"
                [inputId]="id('pass')"
              >
                <input
                  [id]="id('pass')"
                  type="number"
                  step="1"
                  [min]="q().scale_min"
                  [max]="q().scale_max"
                  [value]="q().pass_score ?? ''"
                  (change)="patch({ pass_score: optInt($any($event.target).value) })"
                />
              </app-form-field>
            </div>
          }
          @case ('number') {
            <div class="sm:col-span-1">
              <app-form-field [label]="'inspections.builder.min' | transloco" [inputId]="id('min')">
                <input
                  [id]="id('min')"
                  type="number"
                  step="any"
                  [value]="q().min ?? ''"
                  (change)="patch({ min: optNum($any($event.target).value) })"
                />
              </app-form-field>
            </div>
            <div class="sm:col-span-1">
              <app-form-field [label]="'inspections.builder.max' | transloco" [inputId]="id('max')">
                <input
                  [id]="id('max')"
                  type="number"
                  step="any"
                  [value]="q().max ?? ''"
                  (change)="patch({ max: optNum($any($event.target).value) })"
                />
              </app-form-field>
            </div>
            <div class="sm:col-span-1">
              <app-form-field
                [label]="'inspections.builder.unit' | transloco"
                [inputId]="id('unit')"
              >
                <input
                  [id]="id('unit')"
                  maxlength="32"
                  [value]="q().unit ?? ''"
                  (input)="patch({ unit: $any($event.target).value || null })"
                />
              </app-form-field>
            </div>
          }
        }
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-fg">
        <label class="inline-flex items-center gap-2">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="q().required"
            (change)="patch({ required: $any($event.target).checked })"
          />
          {{ 'inspections.builder.required' | transloco }}
        </label>
        @if (naAllowed()) {
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="q().allow_na"
              (change)="patch({ allow_na: $any($event.target).checked })"
            />
            {{ 'inspections.builder.allowNa' | transloco }}
          </label>
        }
        @if (scored()) {
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="q().finding_on_fail"
              (change)="patch({ finding_on_fail: $any($event.target).checked })"
            />
            {{ 'inspections.builder.findingOnFail' | transloco }}
          </label>
          @if (q().finding_on_fail) {
            <label class="inline-flex items-center gap-2">
              <span class="text-fg-muted">{{ 'inspections.builder.severity' | transloco }}</span>
              <select
                class="h-8 rounded-[8px] border border-border bg-bg px-2 text-[13px]"
                (change)="patch({ finding_severity: $any($event.target).value })"
              >
                @for (s of severities; track s) {
                  <option [value]="s" [selected]="s === q().finding_severity">
                    {{ severityKey(s) | transloco }}
                  </option>
                }
              </select>
            </label>
          }
        }
        <button
          type="button"
          class="ml-auto text-[13px] font-semibold text-accent hover:underline"
          [attr.aria-expanded]="more()"
          (click)="more.set(!more())"
        >
          {{ (more() ? 'inspections.builder.less' : 'inspections.builder.more') | transloco }}
        </button>
      </div>

      @if (more()) {
        <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div class="sm:col-span-6">
            <app-form-field [label]="'inspections.builder.help' | transloco" [inputId]="id('help')">
              <input
                [id]="id('help')"
                maxlength="2000"
                [value]="q().help ?? ''"
                (input)="patch({ help: $any($event.target).value || null })"
              />
            </app-form-field>
          </div>
          @if (scored()) {
            <div class="sm:col-span-2">
              <app-form-field
                [label]="'inspections.builder.weight' | transloco"
                [inputId]="id('weight')"
              >
                <input
                  [id]="id('weight')"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  [value]="q().weight"
                  (change)="patch({ weight: optNum($any($event.target).value) ?? 1 })"
                />
              </app-form-field>
              <app-field-help scope="inspections" page="builder" field="weight" />
            </div>
          }
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'inspections.builder.clauseRefs' | transloco"
              [inputId]="id('refs')"
            >
              <input
                [id]="id('refs')"
                [value]="q().clause_refs.join(', ')"
                placeholder="iso45001:9.1.1"
                (change)="patch({ clause_refs: refs($any($event.target).value) })"
              />
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'inspections.builder.questionId' | transloco"
              [inputId]="id('qid')"
            >
              <input
                [id]="id('qid')"
                maxlength="40"
                [value]="q().id"
                [placeholder]="'inspections.builder.questionIdAuto' | transloco"
                (change)="patch({ id: $any($event.target).value.trim() })"
              />
            </app-form-field>
          </div>
        </div>
      }

      @if (invalid()) {
        <ul class="mt-2 text-[12.5px] text-fail" role="alert">
          @for (p of problems(); track p) {
            <li>{{ 'inspections.builder.problems.' + p | transloco }}</li>
          }
          @if (serverInvalid() && problems().length === 0) {
            <li>{{ 'inspections.builder.problems.server' | transloco }}</li>
          }
        </ul>
      }
    </fieldset>
  `,
})
export class QuestionEditor {
  readonly question = input.required<EditableQuestion>();
  readonly index = input(0);
  readonly total = input(1);
  /** Show problems (after a save attempt). */
  readonly showProblems = input(false);
  /** The server rejected this row (`invalid_questions`). */
  readonly serverInvalid = input(false);
  /** `<datalist>` id with the template's sections. */
  readonly sectionListId = input<string | null>(null);

  readonly changed = output<Partial<Question>>();
  readonly move = output<-1 | 1>();
  readonly remove = output<void>();
  readonly duplicate = output<void>();

  protected readonly types = QUESTION_TYPES;
  protected readonly severities = SEVERITIES;
  protected readonly typeKey = questionTypeKey;
  protected readonly severityKey = severityKey;
  protected readonly more = signal(false);
  private readonly uid = `qe-${++nextId}`;

  protected readonly q = computed(() => this.question());
  protected readonly scored = computed(() => {
    const t = this.q().type;
    return t === 'yes_no' || t === 'score' || t === 'number';
  });
  protected readonly naAllowed = computed(() => NA_TYPES.includes(this.q().type));
  protected readonly problems = computed(() =>
    this.showProblems() || this.serverInvalid() ? questionProblems(this.q()) : [],
  );
  protected readonly invalid = computed(() => this.problems().length > 0 || this.serverInvalid());

  protected id(part: string): string {
    return `${this.uid}-${part}`;
  }

  protected patch(change: Partial<Question>): void {
    this.changed.emit(change);
  }

  protected changeType(type: Question['type']): void {
    this.changed.emit({ type, allow_na: NA_TYPES.includes(type) ? this.q().allow_na : false });
  }

  protected int(raw: string, fallback: number): number {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  protected optInt(raw: string): number | null {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  protected optNum(raw: string): number | null {
    if (raw === '' || raw === null || raw === undefined) {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  protected refs(raw: string): string[] {
    return raw
      .split(/[,\s]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && r.length <= 64)
      .slice(0, 10);
  }
}
