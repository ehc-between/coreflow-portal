import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { SignaturePad, SignatureValue } from '../components/signature-pad';
import { AnswerDraft, canBeNa, evaluate } from '../data/answer-model';
import { severityKey } from '../data/inspection-display';
import { Question, Signature } from '../data/inspection.models';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

let nextId = 0;

/**
 * One checklist question while performing an inspection: large touch targets for
 * yes/no and scores, a number field with its unit and acceptable range, free text,
 * photo evidence (camera on phones) and a signature. Every question can be marked
 * N/A (when allowed) and carry a note. Emits the edited draft (`draftChange`) and
 * asks the page to save (`commit`) when an answer is complete; photos are handed to
 * the page to upload (`upload`).
 */
@Component({
  selector: 'app-answer-input',
  imports: [TranslocoPipe, Badge, Icon, SignaturePad],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="rounded-card border bg-surface p-3.5 sm:p-4"
      [class.border-fail]="evaluation().failed || missing()"
      [class.border-border]="!evaluation().failed && !missing()"
      [attr.data-testid]="'answer-' + question().id"
      [id]="'q-' + question().id"
    >
      <div class="flex flex-wrap items-start gap-2">
        <span class="font-mono text-[12px] text-fg-subtle">{{ number() }}.</span>
        <p class="min-w-0 flex-1 text-[14.5px] font-semibold text-fg" [id]="uid + '-label'">
          {{ question().text }}
          @if (question().required) {
            <span class="text-fail" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'inspections.builder.required' | transloco }}</span>
          }
        </p>
        @switch (saveState()) {
          @case ('saving') {
            <span class="text-[12px] text-fg-subtle" aria-live="polite">{{
              'inspections.run.saving' | transloco
            }}</span>
          }
          @case ('saved') {
            <span class="inline-flex items-center gap-1 text-[12px] text-pass" aria-live="polite">
              <app-icon name="check" [size]="13" />
              {{ 'inspections.run.saved' | transloco }}
            </span>
          }
          @case ('error') {
            <span class="text-[12px] text-fail" role="alert">{{
              'inspections.run.saveFailed' | transloco
            }}</span>
          }
        }
      </div>
      @if (question().help) {
        <p class="mt-1 pl-6 text-[12.5px] text-fg-muted">{{ question().help }}</p>
      }

      <div class="mt-3 pl-0 sm:pl-6" role="group" [attr.aria-labelledby]="uid + '-label'">
        @if (!isNa()) {
          @switch (question().type) {
            @case ('yes_no') {
              <div class="flex flex-wrap gap-2">
                @for (option of yesNo; track option) {
                  <button
                    type="button"
                    class="h-11 min-w-[96px] rounded-[10px] border px-4 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    [class]="
                      optionClass(draft().value === option, option === question().fail_answer)
                    "
                    [attr.aria-pressed]="draft().value === option"
                    [disabled]="disabled()"
                    (click)="choose(option)"
                    [attr.data-testid]="'answer-' + question().id + '-' + option"
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
                    class="h-11 min-w-11 rounded-[10px] border px-3 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    [class]="
                      optionClass(
                        draft().value === n,
                        question().pass_score !== null && n < question().pass_score!
                      )
                    "
                    [attr.aria-pressed]="draft().value === n"
                    [disabled]="disabled()"
                    (click)="choose(n)"
                  >
                    {{ n }}
                  </button>
                }
              </div>
              @if (question().pass_score !== null) {
                <p class="mt-1.5 text-[12px] text-fg-subtle">
                  {{
                    'inspections.preview.passScore' | transloco: { value: question().pass_score }
                  }}
                </p>
              }
            }
            @case ('number') {
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  inputmode="decimal"
                  class="h-11 w-[180px] rounded-[10px] border border-border bg-bg px-3 text-[14px] text-fg outline-none focus:border-accent"
                  [attr.aria-labelledby]="uid + '-label'"
                  [value]="draft().value ?? ''"
                  [disabled]="disabled()"
                  (input)="setValue(numberOf($any($event.target).value))"
                  (change)="commit.emit()"
                />
                @if (question().unit) {
                  <span class="text-[13px] text-fg-muted">{{ question().unit }}</span>
                }
              </div>
              @if (question().min !== null || question().max !== null) {
                <p class="mt-1.5 text-[12px] text-fg-subtle">
                  {{
                    'inspections.preview.range'
                      | transloco
                        : {
                            min: question().min ?? '—',
                            max: question().max ?? '—',
                            unit: question().unit ?? '',
                          }
                  }}
                </p>
              }
            }
            @case ('text') {
              <textarea
                rows="3"
                maxlength="5000"
                class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[14px] text-fg outline-none focus:border-accent"
                [attr.aria-labelledby]="uid + '-label'"
                [value]="draft().value ?? ''"
                [disabled]="disabled()"
                (input)="setValue($any($event.target).value)"
                (blur)="commit.emit()"
              ></textarea>
            }
            @case ('photo') {
              <ul class="mb-2 flex flex-col gap-1">
                @for (id of draft().attachment_ids; track id) {
                  <li class="flex items-center gap-2 text-[13px] text-fg">
                    <app-icon name="upload" [size]="14" />
                    <span class="min-w-0 flex-1 truncate">{{
                      fileNames()[id] ?? ('inspections.run.photo' | transloco)
                    }}</span>
                    @if (!disabled()) {
                      <button
                        type="button"
                        class="text-[12.5px] font-semibold text-fail hover:underline"
                        (click)="removePhoto(id)"
                      >
                        {{ 'inspections.run.removePhoto' | transloco }}
                      </button>
                    }
                  </li>
                }
              </ul>
              @if (!disabled()) {
                <label
                  class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-4 text-[14px] font-semibold text-fg hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent"
                >
                  <app-icon name="upload" [size]="16" />
                  {{
                    (uploading() ? 'inspections.run.uploading' : 'inspections.run.addPhoto')
                      | transloco
                  }}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    class="sr-only"
                    [disabled]="uploading()"
                    (change)="pickFile($event)"
                    [attr.data-testid]="'photo-' + question().id"
                  />
                </label>
              }
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
          <p class="text-[13px] text-fg-muted">{{ 'inspections.run.markedNa' | transloco }}</p>
        }

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          @if (allowNa()) {
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
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
          <button
            type="button"
            class="text-[13px] font-semibold text-accent hover:underline"
            [attr.aria-expanded]="noteOpen()"
            (click)="noteOpen.set(!noteOpen())"
          >
            {{
              (draft().note ? 'inspections.run.editNote' : 'inspections.run.addNote') | transloco
            }}
          </button>
          @if (evaluation().failed) {
            <app-badge tone="fail">
              {{ 'inspections.run.failed' | transloco }}
              @if (question().finding_on_fail) {
                ·
                {{
                  'inspections.run.findingWillBeRaised'
                    | transloco
                      : { severity: (severityKey(question().finding_severity) | transloco) }
                }}
              }
            </app-badge>
          }
          @if (missing()) {
            <app-badge tone="fail">{{ 'inspections.run.missing' | transloco }}</app-badge>
          }
        </div>
        @if (noteOpen() || draft().note) {
          <label class="mt-2 block">
            <span class="sr-only">{{ 'inspections.run.note' | transloco }}</span>
            <textarea
              rows="2"
              maxlength="5000"
              class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
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
  /** Attachment id -> file name, for photo answers. */
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
      ? 'border-fail bg-fail-soft text-fail'
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
