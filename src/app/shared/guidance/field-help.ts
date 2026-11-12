import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';

let nextId = 0;

/**
 * Inline help for a form field (`pages.<page>.fields.<field>`). Beginners see the
 * help (and example) as text under the field; everyone else gets a `?` toggletip.
 * Place it next to or inside an `app-form-field`.
 */
@Component({
  selector: 'app-field-help',
  imports: [TranslocoPipe],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative',
    '[class.block]': 'beginner()',
    '[class.inline-block]': '!beginner()',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'open.set(false)',
  },
  template: `
    @if (help(); as help) {
      @if (beginner()) {
        <p data-testid="field-help-inline" class="text-[12.5px] leading-snug text-fg-muted">
          {{ help.help }}
          @if (help.example) {
            <span class="mt-0.5 block text-fg-subtle">
              {{ 'guidance.field.example' | transloco: { example: help.example } }}
            </span>
          }
        </p>
      } @else {
        <button
          type="button"
          data-testid="field-help-toggle"
          class="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-strong text-[11px] leading-none font-bold text-fg-muted hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'guidance.field.help' | transloco"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="popId"
          (click)="open.set(!open())"
        >
          ?
        </button>
        <div [id]="popId" role="status" aria-live="polite">
          @if (open()) {
            <div
              data-testid="field-help-popover"
              class="absolute top-full left-0 z-30 mt-1.5 w-64 max-w-[80vw] rounded-tile border border-border bg-surface p-3 text-[12.5px] leading-snug font-normal text-fg shadow-pop"
            >
              {{ help.help }}
              @if (help.example) {
                <span class="mt-1 block text-fg-muted">
                  {{ 'guidance.field.example' | transloco: { example: help.example } }}
                </span>
              }
            </div>
          }
        </div>
      }
    }
  `,
})
export class FieldHelp {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();
  readonly field = input.required<string>();

  protected readonly popId = `field-help-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly beginner = this.guidance.isBeginner;
  protected readonly help = computed(
    () => this.content.readPage(this.scope(), this.page())?.fields?.[this.field()] ?? null,
  );

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
