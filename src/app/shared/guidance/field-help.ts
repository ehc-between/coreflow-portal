import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { teachingClause } from './clause-chips';

let nextId = 0;

/**
 * Inline help for a form field (`pages.<page>.fields.<field>`). Beginners see the
 * help (and example) as text under the field; everyone else gets a `?` toggletip.
 * When the field documents requirements (the `requirements` input, else
 * `fields.<field>.requirements` in the guidance JSON), the help ends with
 * "Dokumenterer: ISO 9001 · 8.4.1", so users see why the field matters for
 * compliance. Place it next to or inside an `app-form-field`.
 */
@Component({
  selector: 'app-field-help',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('guidance', 'standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative',
    '[class.block]': 'beginner()',
    '[class.inline-block]': '!beginner()',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'open.set(false)',
  },
  template: `
    @if (help() || documents()) {
      @if (beginner()) {
        <p data-testid="field-help-inline" class="text-meta leading-snug text-fg-muted">
          @if (help(); as help) {
            {{ help.help }}
            @if (help.example) {
              <span class="mt-0.5 block text-fg-subtle">
                {{ 'guidance.field.example' | transloco: { example: help.example } }}
              </span>
            }
          }
          @if (documents(); as docs) {
            <span class="mt-0.5 block text-fg-subtle" data-testid="field-help-requirements">
              {{ 'standards.reqs.fieldDocuments' | transloco: { requirements: docs } }}
            </span>
          }
        </p>
      } @else {
        <button
          type="button"
          data-testid="field-help-toggle"
          class="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border-strong text-micro leading-none font-bold text-fg-muted hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
              class="absolute top-full left-0 z-30 mt-1.5 w-64 max-w-[80vw] rounded-tile border border-border bg-surface p-3 text-meta leading-snug font-normal text-fg shadow-pop"
            >
              @if (help(); as help) {
                {{ help.help }}
                @if (help.example) {
                  <span class="mt-1 block text-fg-muted">
                    {{ 'guidance.field.example' | transloco: { example: help.example } }}
                  </span>
                }
              }
              @if (documents(); as docs) {
                <span class="mt-1 block text-fg-muted" data-testid="field-help-requirements">
                  {{ 'standards.reqs.fieldDocuments' | transloco: { requirements: docs } }}
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
  private readonly language = inject(LanguageService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();
  readonly field = input.required<string>();
  /** Clause refs the field documents (`iso9001:8.4.1`); wins over the guidance JSON. */
  readonly requirements = input<readonly string[] | null | undefined>(null);

  protected readonly popId = `field-help-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly beginner = this.guidance.isBeginner;
  protected readonly help = computed(
    () => this.content.readPage(this.scope(), this.page())?.fields?.[this.field()] ?? null,
  );
  /** "ISO 9001 · 8.4.1, ISO 27001 · A.5.19", or null when the field documents nothing. */
  protected readonly documents = computed(() => {
    const refs = this.requirements() ?? this.help()?.requirements ?? [];
    if (refs.length === 0) {
      return null;
    }
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.language.translate(key, params);
    return refs.map((ref) => teachingClause(ref, t).label).join(', ');
  });

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
