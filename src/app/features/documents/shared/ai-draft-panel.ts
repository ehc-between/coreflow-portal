import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityChipRef } from '../../../shared/kit/entity-chip';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecordPicker } from './record-picker';

/** What the accepted draft was written for, so the host can link it. */
export interface DraftContext {
  /** Canonical clause ref the draft was written for (`iso9001:7.5.1`), or null. */
  readonly requirementRef: string | null;
  /** The process (or other record) the draft describes, or null. */
  readonly record: EntityChipRef | null;
}

let nextId = 0;

/** Strip a Markdown code fence the model may wrap the HTML fragment in. */
export function cleanDraftHtml(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** The `documents.draft` assist input (only non-empty values are sent). */
export function draftInput(values: {
  readonly title?: string;
  readonly documentType?: string;
  readonly requirementRef?: string;
  readonly processDescription?: string;
  readonly templateId?: string;
  readonly instructions?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: string | undefined) => {
    const v = (value ?? '').trim();
    if (v) {
      out[key] = v;
    }
  };
  put('title', values.title);
  put('document_type', values.documentType);
  put('requirement_ref', values.requirementRef);
  put('process_description', values.processDescription);
  put('template_id', values.templateId);
  put('instructions', values.instructions);
  return out;
}

/**
 * "Draft with AI" for a document or template body (`documents.draft` assist):
 * the author picks the requirement the document should cover (clause picker,
 * never typed refs) and/or the process it describes (record picker), or
 * describes the work and adds instructions. The draft streams into a preview and
 * is only put into the editor when the author clicks "Use this draft"; `used`
 * then tells the host which requirement and process to link the document to.
 */
@Component({
  selector: 'app-documents-ai-draft',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    AiAssistButton,
    ClausePicker,
    RecordPicker,
    FieldHelp,
    Button,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-card border border-accent/30 bg-accent-soft/40">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-3 text-left"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId"
        (click)="open.set(!open())"
        data-testid="ai-draft-toggle"
      >
        <app-icon name="spark" [size]="16" class="flex-none text-accent" />
        <span class="flex-1">
          <span class="block text-body font-semibold text-fg">{{
            'documents.control.draft.title' | transloco
          }}</span>
          <span class="block text-meta text-fg-subtle">{{
            'documents.control.draft.hint' | transloco
          }}</span>
        </span>
        <app-icon
          name="chevron"
          [size]="16"
          class="flex-none text-fg-subtle"
          [class.rotate-180]="open()"
        />
      </button>
      @if (open()) {
        <div [id]="panelId" class="flex flex-col gap-3 border-t border-accent/20 px-4 py-4">
          <div>
            <label
              [attr.for]="panelId + '-req'"
              class="mb-1.5 block text-ui font-semibold text-fg-muted"
              >{{ 'documents.control.draft.requirement' | transloco }}</label
            >
            <app-clause-picker
              [inputId]="panelId + '-req'"
              [multiple]="false"
              [formControl]="requirementControl"
            />
            <app-field-help scope="documents" page="draft" field="requirement" />
          </div>
          <app-form-field
            [inputId]="panelId + '-record'"
            [label]="'documents.link.processLabel' | transloco"
          >
            <app-record-picker
              [inputId]="panelId + '-record'"
              [types]="['process']"
              [max]="1"
              [value]="process() ? [process()!] : []"
              (valueChange)="process.set($event[0] ?? null)"
            />
          </app-form-field>
          <app-form-field
            [inputId]="panelId + '-process'"
            [label]="'documents.control.draft.process' | transloco"
          >
            <textarea
              [id]="panelId + '-process'"
              rows="3"
              maxlength="4000"
              [value]="processDescription()"
              (input)="processDescription.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <app-form-field
            [inputId]="panelId + '-instructions'"
            [label]="'documents.control.draft.instructions' | transloco"
          >
            <textarea
              [id]="panelId + '-instructions'"
              rows="2"
              maxlength="2000"
              [value]="instructions()"
              (input)="instructions.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
          <div class="flex flex-wrap items-center gap-2">
            <app-ai-assist-button
              assist="documents.draft"
              labelKey="documents.control.draft.run"
              [input]="assistInput()"
              [disabled]="!hasInput()"
              [entityType]="contextType()"
              [entityId]="contextId()"
              (text)="draft.set($event)"
            />
            @if (!hasInput()) {
              <span class="text-meta text-fg-subtle">{{
                'documents.control.draft.needInput' | transloco
              }}</span>
            }
          </div>
          @if (draft()) {
            <section
              class="rounded-tile border border-border bg-surface p-3"
              aria-live="polite"
              [attr.aria-label]="'documents.control.draft.preview' | transloco"
            >
              <div
                class="cf-doc max-h-[320px] overflow-y-auto text-ui"
                [innerHTML]="cleaned()"
              ></div>
              <div class="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <app-button size="sm" (click)="use()" data-testid="ai-draft-use">
                  {{ 'documents.control.draft.use' | transloco }}
                </app-button>
                <app-button size="sm" variant="ghost" (click)="draft.set('')">
                  {{ 'documents.control.draft.discard' | transloco }}
                </app-button>
              </div>
              <p class="mt-2 text-micro text-fg-subtle">
                {{ 'documents.control.draft.reviewNote' | transloco }}
              </p>
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class DocumentsAiDraft {
  /** Context the host already knows (document title, type key, template). */
  readonly title = input('');
  readonly documentType = input('');
  readonly templateId = input('');
  /** A record (e.g. a process) the draft should be based on. */
  readonly entityType = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  /** The author accepted the draft: the cleaned HTML fragment. */
  readonly apply = output<string>();
  /** Sent with `apply`: the requirement and process the draft was written for. */
  readonly used = output<DraftContext>();

  protected readonly panelId = `cf-ai-draft-${++nextId}`;
  protected readonly open = signal(false);
  /** The requirement the draft is written for (a canonical clause ref). */
  protected readonly requirementControl = new FormControl<string | null>(null);
  private readonly requirementValue = toSignal(this.requirementControl.valueChanges, {
    initialValue: null,
  });
  protected readonly requirementRef = computed(() => this.requirementValue() ?? '');
  /** The process the draft describes. */
  protected readonly process = signal<EntityChipRef | null>(null);
  protected readonly processDescription = signal('');
  protected readonly instructions = signal('');
  protected readonly draft = signal('');

  protected readonly assistInput = computed(() =>
    draftInput({
      title: this.title(),
      documentType: this.documentType(),
      requirementRef: this.requirementRef(),
      processDescription: this.processDescription(),
      templateId: this.templateId(),
      instructions: this.instructions(),
    }),
  );

  /** The backend needs at least a title, requirement, process or record. */
  protected readonly hasInput = computed(() => {
    const i = this.assistInput();
    return !!(i['title'] || i['requirement_ref'] || i['process_description'] || this.contextId());
  });

  /** The record the draft is based on: the picked process, else the host's record. */
  protected readonly contextType = computed(() => this.process()?.entity_type ?? this.entityType());
  protected readonly contextId = computed(() => this.process()?.entity_id ?? this.entityId());

  protected readonly cleaned = computed(() => cleanDraftHtml(this.draft()));

  protected use(): void {
    const html = this.cleaned();
    if (html) {
      this.apply.emit(html);
      this.used.emit({ requirementRef: this.requirementRef() || null, record: this.process() });
      this.draft.set('');
    }
  }
}
