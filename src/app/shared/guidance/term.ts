import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';

let nextId = 0;

const TERM_CLASSES =
  'cursor-help underline decoration-fg-subtle decoration-dotted underline-offset-[3px] focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';

/**
 * A glossary term in running text: `<app-term key="nonconformity">nonconformity</app-term>`.
 * Hover or focus shows the definition from the glossary (the scope's own glossary
 * first, then `glossary.json`). Without a definition it renders the plain text.
 */
@Component({
  selector: 'app-term',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline' },
  template: `
    @let def = entry();
    <span
      data-testid="term"
      [attr.tabindex]="def ? 0 : null"
      [attr.aria-describedby]="def ? tipId : null"
      [class]="def ? termClasses : ''"
      (mouseenter)="open.set(true)"
      (mouseleave)="open.set(false)"
      (focus)="open.set(true)"
      (blur)="open.set(false)"
      (keydown.escape)="open.set(false)"
      ><ng-content
    /></span>
    @if (def) {
      <span
        [id]="tipId"
        role="tooltip"
        data-testid="term-tooltip"
        class="absolute bottom-full left-0 z-30 mb-1.5 w-64 max-w-[80vw] rounded-tile border border-border bg-surface p-3 text-left text-[12.5px] leading-snug font-normal text-fg not-italic shadow-pop"
        [class.hidden]="!open()"
      >
        <span class="block font-semibold">{{ def.term }}</span>
        <span class="mt-0.5 block text-fg-muted">{{ def.definition }}</span>
      </span>
    }
  `,
})
export class Term {
  private readonly content = inject(GuidanceContentService);

  readonly key = input.required<string>();
  readonly scope = input<string | null>(null);

  protected readonly termClasses = TERM_CLASSES;
  protected readonly tipId = `term-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly entry = computed(() => this.content.readTerm(this.key(), this.scope()));
}
