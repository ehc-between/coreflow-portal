import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { localize } from '../../../core/records/localized';
import {
  DefinitionIssue,
  STATE_CATEGORIES,
  StateDef,
  TransitionDef,
  WorkflowDefinition,
} from '../../../core/records/record.models';
import { issueKey } from '../../../core/records/records-errors';
import { WorkflowDiagram } from '../../../shared/records/workflow-diagram';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { newState, newTransition, removeState, renameState } from '../designer-model';
import { RecordsFieldHelp } from '../guidance/records-guidance';
import { LocalizedInput } from './localized-input';
import { TransitionEditor } from './transition-editor';

let nextId = 0;

/** Issues whose `loc` points at state `index` / transition `index`. */
function issuesAt(issues: readonly DefinitionIssue[], prefix: string): string[] {
  return [
    ...new Set(
      issues.filter((i) => i.loc === prefix || i.loc.startsWith(`${prefix}.`)).map((i) => i.code),
    ),
  ];
}

/**
 * The visual workflow editor: a live state diagram (click a state to edit it),
 * the states (key, label, category, SLA hours, initial state) and the
 * transitions (each in a {@link TransitionEditor}). Purely a value editor:
 * emits a whole new definition on every change; the host saves / publishes.
 * Problems found by the client checks or returned by the server (`issues`)
 * are shown on the state / transition they belong to.
 */
@Component({
  selector: 'app-workflow-editor',
  imports: [
    FormsModule,
    TranslocoPipe,
    WorkflowDiagram,
    Button,
    FormField,
    Icon,
    LocalizedInput,
    TransitionEditor,
    RecordsFieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let def = definition();
    <div class="flex flex-col gap-5">
      <app-workflow-diagram
        [definition]="def"
        [selected]="selectedState()"
        [interactive]="true"
        (stateSelected)="selectState($event)"
      />

      @if (globalIssues().length) {
        <ul
          class="rounded-tile border border-fail/30 bg-fail-soft px-3 py-2 text-[12.5px] font-medium text-fail"
          role="alert"
        >
          @for (code of globalIssues(); track code) {
            <li>{{ issueText(code) | transloco }}</li>
          }
        </ul>
      }

      <section [attr.aria-labelledby]="id + '-states'">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h3 [id]="id + '-states'" class="font-display text-[15px] font-bold text-fg">
            {{ 'records.states.title' | transloco }}
          </h3>
          @if (!readonly()) {
            <app-button variant="secondary" size="sm" (click)="addState()">
              <app-icon name="plus" [size]="14" />
              {{ 'records.states.add' | transloco }}
            </app-button>
          }
        </div>
        <app-records-field-help page="workflow" field="states" />
        <ul class="mt-2 flex flex-col gap-2">
          @for (state of def.states; track $index; let i = $index) {
            <li
              class="rounded-tile border bg-surface p-3"
              [class]="
                stateIssues(i).length
                  ? 'border-fail/50'
                  : selectedState() === state.key
                    ? 'border-accent'
                    : 'border-border'
              "
              [attr.data-state]="state.key"
            >
              <fieldset
                class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_150px_120px_auto]"
                [disabled]="readonly()"
              >
                <app-localized-input
                  [label]="'records.states.label' | transloco"
                  [required]="true"
                  [value]="state.label"
                  (valueChange)="patchState(i, { label: $event ?? '' })"
                />
                <app-form-field
                  [label]="'records.states.key' | transloco"
                  [inputId]="id + '-sk-' + i"
                >
                  <input
                    [id]="id + '-sk-' + i"
                    type="text"
                    autocomplete="off"
                    maxlength="32"
                    class="font-mono"
                    [value]="state.key"
                    (change)="renameStateKey(i, $event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'records.states.category' | transloco"
                  [inputId]="id + '-sc-' + i"
                >
                  <select
                    [id]="id + '-sc-' + i"
                    [ngModel]="state.category"
                    (ngModelChange)="patchState(i, { category: $event })"
                  >
                    @for (category of categories; track category) {
                      <option [value]="category">
                        {{ 'records.categories.' + category | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-form-field
                  [label]="'records.states.sla' | transloco"
                  [inputId]="id + '-sla-' + i"
                >
                  <input
                    [id]="id + '-sla-' + i"
                    type="number"
                    min="1"
                    max="8784"
                    [ngModel]="state.sla_hours ?? null"
                    (ngModelChange)="patchState(i, { sla_hours: toInt($event) })"
                  />
                </app-form-field>
                <div class="flex items-end gap-2 pb-1">
                  <label class="flex items-center gap-1.5 text-[12.5px] text-fg">
                    <input
                      type="radio"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [name]="id + '-initial'"
                      [checked]="def.initial_state === state.key"
                      (change)="setInitial(state.key)"
                    />
                    {{ 'records.states.initial' | transloco }}
                  </label>
                  @if (!readonly()) {
                    <button
                      type="button"
                      class="flex rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-40"
                      [disabled]="def.states.length <= 1"
                      [attr.aria-label]="
                        'records.states.remove' | transloco: { name: stateName(state) }
                      "
                      (click)="deleteState(state.key)"
                    >
                      <app-icon name="trash" [size]="14" />
                    </button>
                  }
                </div>
              </fieldset>
              @if (stateIssues(i).length) {
                <ul class="mt-2 text-[12px] font-medium text-fail">
                  @for (code of stateIssues(i); track code) {
                    <li>{{ issueText(code) | transloco }}</li>
                  }
                </ul>
              }
            </li>
          }
        </ul>
      </section>

      <section [attr.aria-labelledby]="id + '-transitions'">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h3 [id]="id + '-transitions'" class="font-display text-[15px] font-bold text-fg">
            {{ 'records.transitions.title' | transloco }}
          </h3>
          @if (!readonly()) {
            <app-button variant="secondary" size="sm" (click)="addTransition()">
              <app-icon name="plus" [size]="14" />
              {{ 'records.transitions.add' | transloco }}
            </app-button>
          }
        </div>
        <app-records-field-help page="workflow" field="transitions" />
        <ul class="mt-2 flex flex-col gap-2">
          @for (t of def.transitions; track $index; let i = $index) {
            <li>
              <app-transition-editor
                [transition]="t"
                [states]="def.states"
                [fieldKeys]="fieldKeys()"
                [userFieldKeys]="userFieldKeys()"
                [issues]="transitionIssues(i)"
                [expanded]="expanded() === i"
                [readonly]="readonly()"
                (toggled)="expanded.set(expanded() === i ? null : i)"
                (transitionChange)="patchTransition(i, $event)"
                (remove)="deleteTransition(i)"
              />
            </li>
          } @empty {
            <li
              class="rounded-tile border border-dashed border-border px-4 py-6 text-center text-[13px] text-fg-muted"
            >
              {{ 'records.transitions.empty' | transloco }}
            </li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class WorkflowEditor {
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly definition = input.required<WorkflowDefinition>();
  readonly issues = input<readonly DefinitionIssue[]>([]);
  readonly fieldKeys = input<readonly string[]>([]);
  readonly userFieldKeys = input<readonly string[]>([]);
  readonly readonly = input(false);

  readonly definitionChange = output<WorkflowDefinition>();

  protected readonly id = `workflow-editor-${nextId++}`;
  protected readonly categories = STATE_CATEGORIES;
  protected readonly selectedState = signal<string | null>(null);
  protected readonly expanded = signal<number | null>(null);

  protected readonly globalIssues = computed(() => [
    ...new Set(
      this.issues()
        .filter((i) => !/^(states|transitions)\.\d+/.test(i.loc))
        .map((i) => i.code),
    ),
  ]);

  protected stateIssues(index: number): string[] {
    return issuesAt(this.issues(), `states.${index}`);
  }

  protected transitionIssues(index: number): string[] {
    return issuesAt(this.issues(), `transitions.${index}`);
  }

  protected issueText(code: string): string {
    return issueKey(code);
  }

  protected stateName(state: StateDef): string {
    return localize(state.label, this.language.active()) || state.key;
  }

  protected toInt(raw: unknown): number | null {
    if (raw === '' || raw === null || raw === undefined) {
      return null;
    }
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  protected selectState(key: string): void {
    this.selectedState.set(key);
    const index = this.definition().transitions.findIndex((t) => t.from.includes(key));
    // Move focus to the state's first input so keyboard users land where they clicked.
    this.host.nativeElement
      .querySelector<HTMLElement>(`[data-state="${CSS.escape(key)}"] input`)
      ?.focus();
    if (index >= 0) {
      this.expanded.set(index);
    }
  }

  protected setInitial(key: string): void {
    this.emit({ ...this.definition(), initial_state: key });
  }

  protected patchState(index: number, changes: Partial<StateDef>): void {
    const def = this.definition();
    this.emit({
      ...def,
      states: def.states.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    });
  }

  protected renameStateKey(index: number, event: Event): void {
    const def = this.definition();
    const next = (event.target as HTMLInputElement).value.trim();
    const current = def.states[index]?.key;
    if (current === undefined || !next || next === current) {
      return;
    }
    this.emit(renameState(def, current, next));
  }

  protected addState(): void {
    const def = this.definition();
    const name = this.transloco.translate('records.states.newLabel');
    const state = newState(
      def.states.map((s) => s.key),
      { en: name, nb: name },
    );
    this.emit({ ...def, states: [...def.states, state] });
    this.selectedState.set(state.key);
  }

  protected deleteState(key: string): void {
    this.emit(removeState(this.definition(), key));
  }

  protected addTransition(): void {
    const def = this.definition();
    const from = this.selectedState() ?? def.initial_state;
    const to = def.states.find((s) => s.key !== from)?.key ?? from;
    const name = this.transloco.translate('records.transitions.newLabel');
    const transition = newTransition(
      def.transitions.map((t) => t.key),
      from,
      to,
      { en: name, nb: name },
    );
    this.emit({ ...def, transitions: [...def.transitions, transition] });
    this.expanded.set(def.transitions.length);
  }

  protected patchTransition(index: number, next: TransitionDef): void {
    const def = this.definition();
    this.emit({ ...def, transitions: def.transitions.map((t, i) => (i === index ? next : t)) });
  }

  protected deleteTransition(index: number): void {
    const def = this.definition();
    this.emit({ ...def, transitions: def.transitions.filter((_, i) => i !== index) });
    this.expanded.set(null);
  }

  private emit(definition: WorkflowDefinition): void {
    this.definitionChange.emit(definition);
  }
}
