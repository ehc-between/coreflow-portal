import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { FieldHeading } from './field-heading';

/** A labelled block of free text on a detail page ("Not set" when empty). */
@Component({
  selector: 'app-context-text-block',
  imports: [TranslocoPipe, MarkdownPipe, FieldHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-context-field-heading role="heading" aria-level="3">
      {{ labelKey() | transloco }}
    </app-context-field-heading>
    @if (!text()?.trim()) {
      <p class="text-[13px] text-fg-subtle">{{ 'context.common.notSet' | transloco }}</p>
    } @else if (markdown()) {
      <div
        class="cf-prose text-[13.5px] leading-relaxed text-fg"
        [innerHTML]="text() | appMarkdown"
      ></div>
    } @else {
      <p class="text-[13.5px] leading-relaxed break-words whitespace-pre-line text-fg">
        {{ text() }}
      </p>
    }
  `,
})
export class TextBlock {
  readonly labelKey = input.required<string>();
  readonly text = input<string | null | undefined>(null);
  /** Render the text as markdown (policy and scope statements). */
  readonly markdown = input(false);
}
