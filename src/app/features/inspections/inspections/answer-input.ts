import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClauseRefs } from '../components/clause-refs';
import { SignaturePad, SignatureValue } from '../components/signature-pad';
import { AnswerDraft, canBeNa, evaluate } from '../data/answer-model';
import { severityKey } from '../data/inspection-display';
import { Question, Signature } from '../data/inspection.models';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

let nextId = 0;

/** Question types that can carry a free-text note (text questions already are one). */
const NOTE_TYPES = new Set(['yes_no', 'score', 'number', 'photo']);
/** Question types that can carry evidence photos besides the answer itself. */
const PHOTO_TYPES = new Set(['yes_no', 'score', 'number', 'text', 'photo']);

/**
 * One checklist question while performing an inspection, built for a phone: large
 * touch targets for yes/no and scores, a number field with its unit, free text,
 * photos from the camera, and a signature. Before answering it says what does not
 * pass ("Ikke godkjent ved Nei", "Godkjent: 1–10 stk") and which clauses it covers.
 * Every scored answer can be marked N/A (when allowed), carry a note and photos; when
 * an answer fails, it asks for a note or a photo, since the finding is built from
 * them. Emits the edited draft (`draftChange`), asks the page to save (`commit`)
 * and hands picked photos to the page to upload (`upload`).
 */
@Component({
  selector: 'app-answer-input',
  imports: [TranslocoPipe, LocalNumberPipe, Icon, StatusBadge, ClauseRefs, SignaturePad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let q = question();
    <div
      class="rounded-card border bg-surface p-3.5 sm:p-4"
      [class.border-fail]="evaluation().failed || missing()"
      [class.border-border]="!evaluation().failed && !missing()"
      [attr.data-testid]="'answer-' + q.id"
      [id]="'q-' + q.id"
    >
      <div class="flex flex-wrap items-start gap-2">
        <span class="font-mono text-meta text-fg-subtle">{{ number() }}.</span>
        <p class="min-w-0 flex-1 text-body font-semibold text-fg" [id]="uid + '-label'">
          {{ q.text }}
          @if (q.required) {
            <span class="text-fail" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'inspections.builder.required' | transloco }}</span>
          }
        </p>
        @switch (saveState()) {
          @case ('saving') {
            <span class="text-meta text-fg-subtle" aria-live="polite">{{
              'inspections.run.saving' | transloco
            }}</span>
          }
          @case ('saved') {
            <span class="inline-flex items-center gap-1 text-meta text-pass-ink" aria-live="polite">
              <app-icon name="check" [size]="13" />
              {{ 'inspections.run.saved' | transloco }}
            </span>
          }
          @case ('error') {
            <span class="text-meta text-fail" role="alert">{{
              'inspections.run.saveFailed' | transloco
            }}</span>
          }
        }
      </div>
      @if (q.help) {
        <p class="mt-1 pl-6 text-ui text-fg-muted">{{ q.help }}</p>
      }
      <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-meta text-fg-subtle">
        @switch (q.type) {
          @case ('yes_no') {
            <span data-testid="fail-hint">{{
              'inspections.preview.failsOn'
                | transloco: { answer: ('inspections.answers.' + q.fail_answer | transloco) }
            }}</span>
          }
          @case ('score') {
            @if (q.pass_score !== null) {
              <span>{{
                'inspections.preview.passScore' | transloco: { value: q.pass_score }
              }}</span>
            }
          }
          @case ('number') {
            @if (q.min !== null || q.max !== null) {
              <span data-testid="range-hint">{{
                'inspections.preview.range'
                  | transloco
                    : {
                        min: q.min === null ? '–' : (q.min | localNumber),
                        max: q.max === null ? '–' : (q.max | localNumber),
                        unit: q.unit ?? '',
                      }
              }}</span>
            }
          }
        }
        <app-clause-refs [refs]="q.clause_refs" />
      </p>

      <div class="mt-3 pl-0 sm:pl-6" role="group" [attr.aria-labelledby]="uid + '-label'">
        @if (!isNa()) {
          @switch (q.type) {
            @case ('yes_no') {
              <div class="flex flex-wrap gap-2">
                @for (option of yesNo; track option) {
                  <button
                    type="button"
                    class="h-11 min-w-24 rounded-tile border px-4 text-body font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    [class]="optionClass(draft().value === option, option === q.fail_answer)"
                    [attr.aria-pressed]="draft().value === option"
                    [disabled]="disabled()"
                    (click)="choose(option)"
                    [attr.data-testid]="'answer-' + q.id + '-' + option"
                  >
                    {{ 'inspections.answers.' + option | transloco }}
                  </button>
                }
              </div>
            }
            @case ('score') {
              <div class="flex flex-wrap gap-1.5">
                @for (n of scale(); track n) {
                  <button
                    type="button"
                    class="h-11 min-w-11 rounded-tile border px-3 text-body font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    [class]="
                      optionClass(draft().value === n, q.pass_score !== null && n < q.pass_score!)
                    "
                    [attr.aria-pressed]="draft().value === n"
                    [disabled]="disabled()"
                    (click)="choose(n)"
                  >
                    {{ n }}
                  </button>
                }
              </div>
            }
            @case ('number') {
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  inputmode="decimal"
                  class="h-11 w-44 rounded-tile border border-border bg-bg px-3 text-body text-fg outline-none focus:border-accent"
                  [attr.aria-labelledby]="uid + '-label'"
                  [value]="draft().value ?? ''"
                  [disabled]="disabled()"
                  (input)="setValue(numberOf($any($event.target).value))"
                  (change)="commit.emit()"
                />
                @if (q.unit) {
                  <span class="text-ui text-fg-muted">{{ q.unit }}</span>
                }
              </div>
            }
            @case ('text') {
              <textarea
                rows="3"
                maxlength="5000"
                class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
                [attr.aria-labelledby]="uid + '-label'"
                [value]="draft().value ?? ''"
                [disabled]="disabled()"
                (input)="setValue($any($event.target).value)"
                (blur)="commit.emit()"
              ></textarea>
            }
            @case ('signature') {
              <app-signature-pad
                [value]="signature()"
                [disabled]="disabled()"
                (valueChange)="onSignature($event)"
              />
            }
          }
        } @else {
          <p class="text-ui text-fg-muted">{{ 'inspections.run.markedNa' | transloco }}</p>
        }

        @if (draft().attachment_ids.length > 0) {
          <ul
            class="mt-2 flex flex-col gap-1"
            [attr.aria-label]="'inspections.run.photos' | transloco"
          >
            @for (id of draft().attachment_ids; track id) {
              <li class="flex min-h-8 items-center gap-2 text-ui text-fg">
                <app-icon name="upload" [size]="14" />
                <span class="min-w-0 flex-1 truncate">{{
                  fileNames()[id] ?? ('inspections.run.photo' | transloco)
                }}</span>
                @if (!disabled()) {
                  <button
                    type="button"
                    class="min-h-8 px-1 text-meta font-semibold text-fail hover:underline"
                    (click)="removePhoto(id)"
                  >
                    {{ 'inspections.run.removePhoto' | transloco }}
                  </button>
                }
              </li>
            }
          </ul>
        }

        @if (
          evaluation().failed && !draft().note && !draft().attachment_ids.length && !disabled()
        ) {
          <p class="mt-3 text-ui font-semibold text-fail" data-testid="fail-prompt">
            {{ 'inspections.run.failPrompt' | transloco }}
          </p>
        }

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          @if (allowNa()) {
            <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="isNa()"
                [disabled]="disabled()"
                (change)="toggleNa($any($event.target).checked)"
              />
              {{ 'inspections.answers.na' | transloco }}
            </label>
          }
          @if (canNote()) {
            <button
              type="button"
              class="min-h-8 text-ui font-semibold text-accent hover:underline"
              [attr.aria-expanded]="noteShown()"
              (click)="noteOpen.set(!noteOpen())"
              [disabled]="disabled()"
            >
              {{
                (draft().note ? 'inspections.run.editNote' : 'inspections.run.addNote') | transloco
              }}
            </button>
          }
          @if (canPhoto() && !disabled()) {
            <label
              class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-ui font-semibold text-accent hover:underline focus-within:ring-2 focus-within:ring-accent"
              [class.h-11]="q.type === 'photo'"
              [class.rounded-tile]="q.type === 'photo'"
              [class.border]="q.type === 'photo'"
              [class.border-border]="q.type === 'photo'"
              [class.px-4]="q.type === 'photo'"
            >
              <app-icon name="upload" [size]="15" />
              {{
                (uploading() ? 'inspections.run.uploading' : 'inspections.run.addPhoto') | transloco
              }}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                [disabled]="uploading()"
                (change)="pickFile($event)"
                [attr.data-testid]="'photo-' + q.id"
              />
            </label>
          }
          @if (evaluation().failed) {
            <app-status-badge
              meaning="lifecycle"
              value="failed"
              [labelKey]="
                q.finding_on_fail ? 'inspections.run.failedWithFinding' : 'inspections.run.failed'
              "
              [labelParams]="{ severity: (severityKey(q.finding_severity) | transloco) }"
            />
          }
          @if (missing()) {
            <app-status-badge
              meaning="lifecycle"
              value="overdue"
              labelKey="inspections.run.missing"
            />
          }
        </div>
        @if (canNote() && noteShown()) {
          <label class="mt-2 block">
            <span class="sr-only">{{ 'inspections.run.note' | transloco }}</span>
            <textarea
              rows="2"
              maxlength="5000"
              class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
              [placeholder]="'inspections.run.notePlaceholder' | transloco"
              [value]="draft().note"
              [disabled]="disabled()"
              (input)="setNote($any($event.target).value)"
              (blur)="commit.emit()"
            ></textarea>
          </label>
        }
      </div>
    </div>
  `,
})
export class AnswerInput {
  readonly question = input.required<Question>();
  readonly number = input(1);
  readonly draft = input.required<AnswerDraft>();
  readonly disabled = input(false);
  readonly saveState = input<SaveState>('idle');
  /** Highlight as a required question still unanswered (after a completion attempt). */
  readonly missing = input(false);
  readonly uploading = input(false);
  /** Attachment id -> file name, for photos. */
  readonly fileNames = input<Readonly<Record<string, string>>>({});

  readonly draftChange = output<AnswerDraft>();
  readonly commit = output<void>();
  readonly upload = output<File>();

  protected readonly uid = `ans-${++nextId}`;
  protected readonly yesNo = ['yes', 'no'] as const;
  protected readonly severityKey = severityKey;
  protected readonly noteOpen = signal(false);

  protected readonly evaluation = computed(() => evaluate(this.question(), this.draft()));
  protected readonly allowNa = computed(() => canBeNa(this.question()));
  protected readonly isNa = computed(() => this.allowNa() && this.draft().is_na);
  protected readonly canNote = computed(() => NOTE_TYPES.has(this.question().type));
  protected readonly canPhoto = computed(() => PHOTO_TYPES.has(this.question().type));
  /** The note is open when asked for, already written, or the answer failed. */
  protected readonly noteShown = computed(
    () => this.noteOpen() || !!this.draft().note || this.evaluation().failed,
  );
  protected readonly scale = computed(() => {
    const q = this.question();
    const out: number[] = [];
    for (let n = q.scale_min; n <= q.scale_max && out.length < 101; n++) {
      out.push(n);
    }
    return out;
  });
  protected readonly signature = computed<SignatureValue | null>(() => {
    const v = this.draft().value as Signature | null;
    return v && typeof v === 'object' ? { name: v.name ?? '', image: v.image ?? null } : null;
  });

  protected optionClass(selected: boolean, failing: boolean): string {
    if (!selected) {
      return 'border-border bg-surface text-fg hover:bg-surface-2';
    }
    return failing
      ? 'border-fail bg-fail-soft text-fail-ink'
      : 'border-accent bg-accent-soft text-accent';
  }

  protected choose(value: string | number): void {
    const same = this.draft().value === value;
    this.draftChange.emit({ ...this.draft(), is_na: false, value: same ? null : value });
    this.commit.emit();
  }

  protected setValue(value: string | number | null): void {
    this.draftChange.emit({ ...this.draft(), is_na: false, value });
  }

  protected numberOf(raw: string): number | null {
    if (raw === '') {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  protected setNote(note: string): void {
    this.draftChange.emit({ ...this.draft(), note });
  }

  protected toggleNa(on: boolean): void {
    this.draftChange.emit({ ...this.draft(), is_na: on, value: on ? null : this.draft().value });
    this.commit.emit();
  }

  protected onSignature(sig: SignatureValue): void {
    this.draftChange.emit({
      ...this.draft(),
      value: sig.name.trim()
        ? { name: sig.name, ...(sig.image ? { image: sig.image } : {}) }
        : null,
    });
    this.commit.emit();
  }

  protected pickFile(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      this.upload.emit(file);
    }
    target.value = '';
  }

  protected removePhoto(id: string): void {
    this.draftChange.emit({
      ...this.draft(),
      attachment_ids: this.draft().attachment_ids.filter((a) => a !== id),
    });
    this.commit.emit();
  }
}
