import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

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
 * the author gives a standard requirement (`iso9001:7.5`), a process description
 * and/or instructions; the draft streams into a preview and is only put into the
 * editor when the author clicks "Use this draft".
 */
@Component({
  selector: 'app-documents-ai-draft',
  imports: [TranslocoPipe, AiAssistButton, FieldHelp, Button, FormField, Icon],
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
          <span class="block text-[14px] font-semibold text-fg">{{
            'documents.control.draft.title' | transloco
          }}</span>
          <span class="block text-[12.5px] text-fg-subtle">{{
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
            <app-form-field
              [inputId]="panelId + '-req'"
              [label]="'documents.control.draft.requirement' | transloco"
            >
              <input
                [id]="panelId + '-req'"
                type="text"
                maxlength="80"
                placeholder="iso9001:7.5"
                [value]="requirementRef()"
                (input)="requirementRef.set($any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="documents" page="draft" field="requirement" />
          </div>
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
              [entityType]="entityType()"
              [entityId]="entityId()"
              (text)="draft.set($event)"
            />
            @if (!hasInput()) {
              <span class="text-[12px] text-fg-subtle">{{
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
                class="cf-doc max-h-[320px] overflow-y-auto text-[13.5px]"
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
              <p class="mt-2 text-[11.5px] text-fg-subtle">
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

  protected readonly panelId = `cf-ai-draft-${++nextId}`;
  protected readonly open = signal(false);
  protected readonly requirementRef = signal('');
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
    return !!(i['title'] || i['requirement_ref'] || i['process_description'] || this.entityId());
  });

  protected readonly cleaned = computed(() => cleanDraftHtml(this.draft()));

  protected use(): void {
    const html = this.cleaned();
    if (html) {
      this.apply.emit(html);
      this.draft.set('');
    }
  }
}
