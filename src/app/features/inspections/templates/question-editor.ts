import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClauseRefs } from '../components/clause-refs';
import { EditableQuestion, questionProblems } from '../data/answer-model';
import { questionTypeKey, severityKey } from '../data/inspection-display';
import { NA_TYPES, QUESTION_TYPES, Question, SEVERITIES } from '../data/inspection.models';

let nextId = 0;

/**
 * One row of the checklist builder. Collapsed it is a one-line summary (number, text,
 * answer type, what fails, the finding severity and the clauses it covers), so a long
 * checklist stays scannable; expanded it edits the text, type, section and the rule
 * for its type (fail answer, score scale and pass score, acceptable range), whether
 * it is required or may be N/A, the finding it raises, and the clauses it documents
 * (the shared clause picker, so references always resolve). Help text, weight and a
 * stable id are under "Flere valg". New and invalid rows open expanded.
 */
@Component({
  selector: 'app-question-editor',
  imports: [
    FormsModule,
    TranslocoPipe,
    FieldHelp,
    ClausePicker,
    Button,
    FormField,
    Icon,
    StatusBadge,
    ClauseRefs,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset
      class="rounded-card border bg-surface"
      [class.border-fail]="invalid()"
      [class.border-border]="!invalid()"
      [attr.aria-label]="'inspections.builder.questionN' | transloco: { n: index() + 1 }"
      [attr.data-testid]="'question-' + index()"
    >
      <div class="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          class="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="id('body')"
          (click)="expanded.set(!expanded())"
          data-testid="question-toggle"
        >
          <app-icon
            name="chevron"
            [size]="14"
            class="flex-none text-fg-subtle transition-transform"
            [class.-rotate-90]="!expanded()"
          />
          <span class="font-mono text-meta text-fg-subtle">{{ index() + 1 }}.</span>
          <span
            class="min-w-0 flex-1 truncate text-ui font-semibold"
            [class.text-fg]="q().text.trim()"
            [class.text-fg-subtle]="!q().text.trim()"
            >{{ q().text.trim() || ('inspections.builder.untitled' | transloco) }}</span
          >
        </button>
        <span
          class="order-last flex w-full flex-wrap items-center gap-1.5 pl-9 text-meta text-fg-muted"
        >
          <span>{{ typeKey(q().type) | transloco }}</span>
          @if (q().type === 'yes_no') {
            <span
              >·
              {{
                'inspections.builder.failsShort'
                  | transloco: { answer: ('inspections.answers.' + q().fail_answer | transloco) }
              }}</span
            >
          }
          @if (scored() && q().finding_on_fail) {
            <app-status-badge
              meaning="severity"
              [value]="q().finding_severity"
              [labelKey]="severityKey(q().finding_severity)"
            />
          }
          @if (!expanded()) {
            <app-clause-refs [refs]="q().clause_refs" />
          }
        </span>
        <span class="flex flex-none items-center">
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
        </span>
      </div>

      <div
        [id]="id('body')"
        [hidden]="!expanded()"
        class="border-t border-border px-3.5 pt-3 pb-3.5"
      >
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
                <app-form-field
                  [label]="'inspections.builder.min' | transloco"
                  [inputId]="id('min')"
                >
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
                <app-form-field
                  [label]="'inspections.builder.max' | transloco"
                  [inputId]="id('max')"
                >
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

          <div class="sm:col-span-6">
            <div class="mb-1.5 flex items-center gap-1.5">
              <label [attr.for]="id('refs')" class="text-ui font-semibold text-fg-muted">
                {{ 'inspections.builder.clauseRefs' | transloco }}
              </label>
              <app-field-help scope="inspections" page="builder" field="clauseRefs" />
            </div>
            <app-clause-picker
              [inputId]="id('refs')"
              [frameworks]="pickerFrameworks()"
              placeholderKey="inspections.builder.clausePlaceholder"
              [ngModel]="q().clause_refs"
              (ngModelChange)="patch({ clause_refs: $event ?? [] })"
              data-testid="question-clauses"
            />
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-ui text-fg">
          <label class="inline-flex min-h-8 items-center gap-2">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="q().required"
              (change)="patch({ required: $any($event.target).checked })"
            />
            {{ 'inspections.builder.required' | transloco }}
          </label>
          @if (naAllowed()) {
            <label class="inline-flex min-h-8 items-center gap-2">
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
            <label class="inline-flex min-h-8 items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="q().finding_on_fail"
                (change)="patch({ finding_on_fail: $any($event.target).checked })"
              />
              {{ 'inspections.builder.findingOnFail' | transloco }}
            </label>
            @if (q().finding_on_fail) {
              <label class="inline-flex min-h-8 items-center gap-2">
                <span class="text-fg-muted">{{ 'inspections.builder.severity' | transloco }}</span>
                <select
                  class="h-8 rounded-tile border border-border bg-bg px-2 text-ui"
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
            class="ml-auto min-h-8 text-ui font-semibold text-accent hover:underline"
            [attr.aria-expanded]="more()"
            (click)="more.set(!more())"
          >
            {{ (more() ? 'inspections.builder.less' : 'inspections.builder.more') | transloco }}
          </button>
        </div>

        @if (more()) {
          <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div class="sm:col-span-6">
              <app-form-field
                [label]="'inspections.builder.help' | transloco"
                [inputId]="id('help')"
              >
                <input
                  [id]="id('help')"
                  maxlength="2000"
                  [value]="q().help ?? ''"
                  (input)="patch({ help: $any($event.target).value || null })"
                />
              </app-form-field>
            </div>
            @if (scored()) {
              <div class="sm:col-span-3">
                <div class="mb-1.5 flex items-center gap-1.5">
                  <label [attr.for]="id('weight')" class="text-ui font-semibold text-fg-muted">
                    {{ 'inspections.builder.weight' | transloco }}
                  </label>
                  <app-field-help scope="inspections" page="builder" field="weight" />
                </div>
                <app-form-field>
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
              </div>
            }
            <div class="sm:col-span-3">
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
      </div>

      @if (invalid()) {
        <ul class="px-3.5 pb-3 text-meta text-fail" role="alert">
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
  /** The template's standards: the clause picker searches these first (all when empty). */
  readonly frameworks = input<readonly string[]>([]);

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
  protected readonly pickerFrameworks = computed(() =>
    this.frameworks().length ? this.frameworks() : null,
  );

  /**
   * Starts open when the question has no text yet; opens when it gets problems; the
   * designer toggles it otherwise (typing never collapses it).
   */
  protected readonly expanded = linkedSignal<{ key: string; invalid: boolean }, boolean>({
    source: () => ({ key: this.question().key, invalid: this.invalid() }),
    computation: (source, previous) =>
      source.invalid ||
      (previous && previous.source.key === source.key
        ? previous.value
        : !untracked(() => this.question().text.trim())),
  });

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
}
