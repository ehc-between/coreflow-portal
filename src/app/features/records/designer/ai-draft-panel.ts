import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { localize } from '../../../core/records/localized';
import { WorkflowAiDraft } from '../../../core/records/record.models';
import { recordsErrorMessage } from '../../../core/records/records-errors';
import { RecordsApi } from '../../../core/records/records-api';
import { WorkflowDiagram } from '../../../shared/records/workflow-diagram';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { MODULE_KEYS, moduleLabelKey } from '../designer-model';

export const MIN_DESCRIPTION = 10;
export const MAX_DESCRIPTION = 5000;

/**
 * "Describe your process": the user writes how the process works in plain
 * language and the assistant proposes fields, layout and a workflow. Nothing
 * is saved here; `use` hands the draft to the designer, where the user reviews
 * and edits everything before publishing.
 */
@Component({
  selector: 'app-ai-draft-panel',
  imports: [FormsModule, TranslocoPipe, WorkflowDiagram, Alert, Button, FormField, Icon, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'records.ai.title' | transloco"
      [subtitle]="'records.ai.subtitle' | transloco"
      [closeLabel]="'records.ai.close' | transloco"
      [width]="620"
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-4">
        <app-form-field [label]="'records.ai.module' | transloco" inputId="ai-draft-module">
          <select
            id="ai-draft-module"
            [ngModel]="module()"
            (ngModelChange)="module.set($event)"
            [disabled]="lockModule() || busy()"
          >
            @for (key of modules; track key) {
              <option [value]="key">{{ moduleLabel(key) | transloco }}</option>
            }
          </select>
        </app-form-field>

        <app-form-field
          [label]="'records.ai.description' | transloco"
          inputId="ai-draft-description"
        >
          <textarea
            id="ai-draft-description"
            rows="7"
            [attr.maxlength]="max"
            [ngModel]="description()"
            (ngModelChange)="description.set($event)"
            [placeholder]="'records.ai.placeholder' | transloco"
            aria-describedby="ai-draft-count"
            [disabled]="busy()"
          ></textarea>
          <p id="ai-draft-count" class="text-right text-[11.5px] text-fg-subtle">
            {{ 'records.ai.count' | transloco: { count: description().length, max: max } }}
          </p>
        </app-form-field>

        <p class="text-[12px] text-fg-subtle">{{ 'records.ai.reviewNote' | transloco }}</p>

        <div class="flex justify-end">
          <app-button [loading]="busy()" [disabled]="!canSubmit()" (click)="submit()">
            <app-icon name="spark" [size]="15" />
            {{ (draft() ? 'records.ai.retry' : 'records.ai.submit') | transloco }}
          </app-button>
        </div>

        @if (busy()) {
          <p class="text-[13px] text-fg-muted" role="status">
            {{ 'records.ai.working' | transloco }}
          </p>
        }
        @if (error()) {
          <app-alert tone="error">{{ error()! | transloco }}</app-alert>
        }

        @if (draft(); as d) {
          <section
            class="flex flex-col gap-3 border-t border-border pt-4"
            [attr.aria-label]="'records.ai.result' | transloco"
          >
            <div>
              <h3 class="font-display text-[16px] font-bold text-fg">{{ d.name }}</h3>
              @if (d.description) {
                <p class="mt-0.5 text-[13px] text-fg-muted">{{ d.description }}</p>
              }
            </div>
            <div>
              <p class="mb-1 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                {{ 'records.ai.fields' | transloco: { count: d.fields.length } }}
              </p>
              <ul class="flex flex-wrap gap-1.5">
                @for (field of d.fields; track field.key) {
                  <li
                    class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] text-fg"
                  >
                    {{ label(field.label) }}
                    <span class="text-fg-subtle"
                      >· {{ 'records.fieldTypes.' + field.type | transloco }}</span
                    >
                  </li>
                }
              </ul>
            </div>
            <app-workflow-diagram [definition]="d.workflow" />
            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="secondary" (click)="draft.set(null)">
                {{ 'records.ai.discard' | transloco }}
              </app-button>
              <app-button (click)="use.emit({ module: module(), draft: d })">
                {{
                  (mode() === 'workflow' ? 'records.ai.useWorkflow' : 'records.ai.use') | transloco
                }}
              </app-button>
            </div>
          </section>
        }
      </div>
    </app-slide-over>
  `,
})
export class AiDraftPanel {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly open = input(false);
  readonly initialModule = input<string>('deviations');
  /** Keep the module fixed (e.g. when redesigning an existing workflow). */
  readonly lockModule = input(false);
  /** `type`: a whole record type; `workflow`: only the workflow is used. */
  readonly mode = input<'type' | 'workflow'>('type');

  readonly closed = output<void>();
  readonly use = output<{ module: string; draft: WorkflowAiDraft }>();

  protected readonly modules = MODULE_KEYS;
  protected readonly max = MAX_DESCRIPTION;
  protected readonly module = signal('deviations');
  protected readonly description = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly draft = signal<WorkflowAiDraft | null>(null);

  protected readonly canSubmit = computed(() => {
    const length = this.description().trim().length;
    return !this.busy() && length >= MIN_DESCRIPTION && length <= MAX_DESCRIPTION;
  });

  constructor() {
    effect(() => {
      const module = this.initialModule();
      if (this.open()) {
        untracked(() => this.module.set(module));
      }
    });
  }

  protected moduleLabel(key: string): string {
    return moduleLabelKey(key);
  }

  protected label(value: Parameters<typeof localize>[0]): string {
    return localize(value, this.language.active());
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .aiDraft(orgId, {
        module: this.module(),
        description: this.description().trim(),
        lang: this.language.active() === 'nb' ? 'nb' : 'en',
      })
      .subscribe({
        next: (draft) => {
          this.busy.set(false);
          this.draft.set(draft);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(recordsErrorMessage(error)?.key ?? 'errors.generic');
        },
      });
  }
}
