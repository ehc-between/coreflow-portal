import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { ReviewInput } from '../data/management-review.models';
import {
  inputClause,
  inputDone,
  inputHintKey,
  inputTitleKey,
  textOrNull,
} from '../management-review-display';
import { ClauseRef } from './clause-ref';
import { InputDataView } from './input-data';

/** A change of an input row, handled (saved) by the review page. */
export type InputRowChange =
  | { readonly kind: 'notes'; readonly notes: string | null }
  | { readonly kind: 'reviewed'; readonly reviewed: boolean }
  | { readonly kind: 'notRelevant'; readonly notRelevant: boolean; readonly reason: string | null }
  | { readonly kind: 'remove' }
  | { readonly kind: 'compile' };

let nextId = 0;

/**
 * One input of a management review: a collapsible row with a done mark, the
 * topic, the clause it answers (readable, explained on click) and whether its
 * figures are fetched automatically. Opened, it shows what to look at, the
 * figures, and the reviewer's notes. Notes save when the field loses focus
 * (no save button per row); "Gjennomgått" and "Ikke relevant" (with a reason)
 * count the input as done for sign-off.
 */
@Component({
  selector: 'app-mr-input-row',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Icon,
    PromptDialog,
    ClauseRef,
    InputDataView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let i = item();
    <details
      class="group rounded-tile border bg-surface"
      [class]="done() ? 'border-border' : 'border-border-strong'"
      [open]="open()"
      (toggle)="open.set($any($event.target).open)"
      [attr.data-testid]="'mr-input-' + i.category"
    >
      <summary
        class="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-body [&::-webkit-details-marker]:hidden"
      >
        <span
          class="flex h-5 w-5 flex-none items-center justify-center rounded-full border"
          [class]="
            done()
              ? i.not_relevant
                ? 'border-fg-subtle bg-surface-2 text-fg-muted'
                : 'border-pass bg-pass text-white'
              : 'border-border-strong'
          "
          role="img"
          [attr.aria-label]="doneLabelKey() | transloco"
        >
          @if (done()) {
            <app-icon [name]="i.not_relevant ? 'x' : 'check'" [size]="11" />
          }
        </span>
        <span class="min-w-0 flex-1 basis-48 font-semibold text-fg sm:basis-auto">{{
          title()
        }}</span>
        @if (clause(); as c) {
          <app-mr-clause-ref [ref]="c.ref" [item]="c.item" [frameworks]="frameworks()" />
        }
        @if (i.not_relevant) {
          <app-badge tone="neutral">{{
            'managementReview.inputs.notRelevant' | transloco
          }}</app-badge>
        }
        <span
          [title]="
            (i.auto
              ? 'managementReview.inputs.source.autoHint'
              : 'managementReview.inputs.source.manualHint'
            ) | transloco
          "
        >
          <app-badge [tone]="i.auto ? 'info' : 'neutral'">
            {{
              (i.auto
                ? 'managementReview.inputs.source.auto'
                : 'managementReview.inputs.source.manual'
              ) | transloco
            }}
          </app-badge>
        </span>
        <span
          class="flex text-fg-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
          ><app-icon name="chevron" [size]="15"
        /></span>
      </summary>

      <div class="flex flex-col gap-3 border-t border-border px-3 py-3">
        @if (hintKey(); as hint) {
          <p class="text-ui text-fg-muted">{{ hint | transloco }}</p>
        }
        <app-mr-input-data [data]="i.data" [auto]="i.auto" />
        @if (i.auto && !i.compiled_at && canCompile()) {
          <div>
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="busy()"
              (click)="emit({ kind: 'compile' })"
            >
              <app-icon name="history" [size]="14" />
              {{ 'managementReview.inputs.fetchNow' | transloco }}
            </app-button>
          </div>
        } @else if (i.compiled_at) {
          <p class="text-micro text-fg-subtle">
            {{
              'managementReview.inputs.fetchedAt' | transloco: { date: (i.compiled_at | localDate) }
            }}
          </p>
        }

        @if (i.not_relevant && i.not_relevant_reason) {
          <p class="rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg">
            <span class="font-semibold">{{
              'managementReview.inputs.notRelevantBecause' | transloco
            }}</span>
            {{ i.not_relevant_reason }}
          </p>
        }

        @if (canEdit()) {
          <div>
            <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label [attr.for]="notesId" class="text-ui font-semibold text-fg-muted">{{
                'managementReview.inputs.notes' | transloco
              }}</label>
              <span class="text-micro text-fg-subtle" aria-live="polite">
                @if (saving()) {
                  {{ 'managementReview.inputs.saving' | transloco }}
                } @else if (dirty()) {
                  {{ 'managementReview.inputs.savesOnLeave' | transloco }}
                } @else if (savedOnce()) {
                  {{ 'managementReview.inputs.saved' | transloco }}
                }
              </span>
            </div>
            <textarea
              [id]="notesId"
              rows="3"
              maxlength="50000"
              class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-body text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              [placeholder]="'managementReview.inputs.notesPlaceholder' | transloco"
              [value]="notes()"
              (input)="notes.set($any($event.target).value)"
              (blur)="saveNotes()"
              data-testid="mr-input-notes"
            ></textarea>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            @if (!i.not_relevant) {
              <label
                class="inline-flex min-h-9 items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui font-semibold text-fg"
              >
                <input
                  type="checkbox"
                  [checked]="i.reviewed"
                  [disabled]="busy()"
                  (change)="emit({ kind: 'reviewed', reviewed: $any($event.target).checked })"
                  data-testid="mr-input-reviewed"
                />
                {{ 'managementReview.inputs.markReviewed' | transloco }}
              </label>
              <app-button
                size="sm"
                variant="ghost"
                [disabled]="busy()"
                (click)="reasonOpen.set(true)"
              >
                {{ 'managementReview.inputs.markNotRelevant' | transloco }}
              </app-button>
            } @else {
              <app-button
                size="sm"
                variant="ghost"
                [disabled]="busy()"
                (click)="emit({ kind: 'notRelevant', notRelevant: false, reason: null })"
              >
                {{ 'managementReview.inputs.relevantAfterAll' | transloco }}
              </app-button>
            }
            <span class="flex-1"></span>
            @if (i.category === 'custom') {
              <app-button
                size="sm"
                variant="ghost"
                [disabled]="busy()"
                (click)="emit({ kind: 'remove' })"
              >
                <app-icon name="trash" [size]="13" />
                {{ 'managementReview.inputs.remove' | transloco }}
              </app-button>
            }
          </div>
        } @else if (i.notes) {
          <div>
            <p class="text-meta font-semibold text-fg-muted">
              {{ 'managementReview.inputs.notes' | transloco }}
            </p>
            <p class="text-body whitespace-pre-line text-fg">{{ i.notes }}</p>
          </div>
        }
      </div>
    </details>

    <app-prompt-dialog
      [open]="reasonOpen()"
      [title]="'managementReview.inputs.notRelevantTitle' | transloco: { title: title() }"
      [message]="'managementReview.inputs.notRelevantMessage' | transloco"
      [label]="'managementReview.inputs.notRelevantReason' | transloco"
      [confirmLabel]="'managementReview.inputs.markNotRelevant' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [required]="true"
      [busy]="busy()"
      (confirmed)="markNotRelevant($event)"
      (cancelled)="reasonOpen.set(false)"
    />
  `,
})
export class ReviewInputRow {
  private readonly language = inject(LanguageService);

  readonly item = input.required<ReviewInput>();
  /** Frameworks of the review (named in the tooltip of shared ISO clauses). */
  readonly frameworks = input<readonly string[]>([]);
  readonly canEdit = input(false);
  readonly canCompile = input(false);
  readonly busy = input(false);
  /** Whether this row's notes are being saved. */
  readonly saving = input(false);
  /** Open the row from the start (the first input that is not done). */
  readonly initiallyOpen = input(false);

  readonly changed = output<InputRowChange>();

  protected readonly notesId = `mr-input-notes-${++nextId}`;
  protected readonly open = linkedSignal(() => this.initiallyOpen());
  protected readonly reasonOpen = signal(false);
  protected readonly savedOnce = signal(false);
  protected readonly notes = linkedSignal(() => this.item().notes ?? '');

  protected readonly done = computed(() => inputDone(this.item()));
  protected readonly clause = computed(() => inputClause(this.item()));
  protected readonly hintKey = computed(() => inputHintKey(this.item().category));
  protected readonly title = computed(() => {
    const key = inputTitleKey(this.item());
    return key ? this.language.translate(key) : (this.item().title ?? '');
  });
  protected readonly dirty = computed(
    () => this.notes().trim() !== (this.item().notes ?? '').trim(),
  );
  protected readonly doneLabelKey = computed(() =>
    this.item().not_relevant
      ? 'managementReview.inputs.notRelevant'
      : this.done()
        ? 'managementReview.inputs.reviewed'
        : 'managementReview.inputs.notReviewed',
  );

  protected emit(change: InputRowChange): void {
    this.changed.emit(change);
  }

  protected saveNotes(): void {
    if (!this.dirty()) {
      return;
    }
    this.savedOnce.set(true);
    this.emit({ kind: 'notes', notes: textOrNull(this.notes()) });
  }

  protected markNotRelevant(reason: string): void {
    const text = textOrNull(reason);
    if (!text) {
      return;
    }
    this.reasonOpen.set(false);
    this.emit({ kind: 'notRelevant', notRelevant: true, reason: text });
  }
}
