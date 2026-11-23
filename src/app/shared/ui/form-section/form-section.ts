import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * One section of a form (docs/ux-guide.md, "Form anatomy"): a card with a header
 * (h2 title + optional `?` in `[title-suffix]`, one-line description, optional
 * `[section-actions]` on the right) and a body grid.
 *
 *   <app-form-section [title]="'x.form.sections.basics' | transloco"
 *                     [description]="'x.form.sections.basicsHint' | transloco">
 *     <app-field-help title-suffix scope="x" page="form" field="basics" />
 *     <app-form-field span="full" …>…</app-form-field>
 *     <app-form-field …>…</app-form-field>   <app-form-field …>…</app-form-field>
 *   </app-form-section>
 *
 * The body is a 1-column grid on phones and a 2-column grid from 640 px
 * (`columns="1"` keeps one column); every cell aligns at the top. Long fields set
 * `span="full"` on `app-form-field` (or `class="sm:col-span-2"` on any other child).
 */
@Component({
  selector: 'app-form-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-card border border-border bg-surface shadow-card"
      [attr.aria-labelledby]="title() ? headingId : null"
      data-testid="form-section"
    >
      @if (title()) {
        <header
          class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3.5 sm:px-5"
        >
          <div class="min-w-0 flex-1 basis-[min(100%,320px)]">
            <h2
              [id]="headingId"
              class="flex min-h-6 items-center gap-1.5 font-display text-card font-bold text-fg"
            >
              {{ title() }}
              <ng-content select="[title-suffix]" />
            </h2>
            @if (description()) {
              <p class="mt-0.5 max-w-[68ch] text-meta leading-snug text-fg-muted">
                {{ description() }}
              </p>
            }
          </div>
          <div class="flex flex-wrap items-center gap-2 empty:hidden">
            <ng-content select="[section-actions]" />
          </div>
        </header>
      }
      <div
        class="grid grid-cols-1 items-start gap-x-4 gap-y-5 px-4 py-4 sm:px-5 sm:py-5"
        [class.sm:grid-cols-2]="columns() === 2"
      >
        <ng-content />
      </div>
    </section>
  `,
})
export class FormSection {
  /** Section title (already translated). */
  readonly title = input('');
  /** One line under the title (already translated). */
  readonly description = input<string | null | undefined>('');
  /** Body grid columns from 640 px. */
  readonly columns = input<1 | 2>(2);

  protected readonly headingId = `cf-form-section-${nextId++}`;
}
