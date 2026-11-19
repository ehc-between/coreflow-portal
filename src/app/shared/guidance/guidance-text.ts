import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import {
  GuidanceRun,
  boldRuns,
  displaySegments,
  parseTermTokens,
} from '../../core/guidance/term-tokens';
import { MarkdownInlinePipe, MarkdownPipe } from '../markdown/markdown.pipe';
import { Term } from './term';

interface Paragraph {
  /** A paragraph without terms is rendered as plain markdown (lists, links…). */
  readonly markdown: string | null;
  readonly runs: readonly GuidanceRun[];
}

/**
 * Guidance text with glossary terms (simplify U39): markdown whose `[[key|word]]` tokens
 * render as `<app-term>` (hover/focus shows the definition). In beginner mode the first use
 * of each term also shows its plain words (see `core/guidance/term-tokens.ts`).
 *
 *   <app-guidance-text [text]="intro.body" scope="risk" />
 *   <app-guidance-text [text]="step" [inline]="true" [seen]="keysExplainedAbove" />
 *
 * `inline` renders one run of text without paragraphs; `seen` lists term keys already
 * explained earlier on the same panel, so they are not expanded again; `tooltips=false`
 * renders the words without hover (one-line leads, where a tooltip would be clipped).
 */
@Component({
  selector: 'app-guidance-text',
  imports: [NgTemplateOutlet, Term, MarkdownPipe, MarkdownInlinePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.block]': '!inline()', '[class.inline]': 'inline()' },
  template: `
    @for (p of paragraphs(); track $index) {
      @if (p.markdown !== null) {
        <div class="cf-prose" [innerHTML]="p.markdown | appMarkdown"></div>
      } @else if (inline()) {
        <ng-container *ngTemplateOutlet="runsTpl; context: { $implicit: p.runs }" />
      } @else {
        <p><ng-container *ngTemplateOutlet="runsTpl; context: { $implicit: p.runs }" /></p>
      }
    }
    <ng-template #runsTpl let-runs>
      @for (run of asRuns(runs); track $index) {
        @if (run.strong) {
          <strong><ng-container *ngTemplateOutlet="runTpl; context: { $implicit: run }" /></strong>
        } @else {
          <ng-container *ngTemplateOutlet="runTpl; context: { $implicit: run }" />
        }
      }
    </ng-template>
    <ng-template #runTpl let-run>
      @if (run.key === null) {
        <span [innerHTML]="run.text | appMarkdownInline"></span>
      } @else if (!tooltips()) {
        <span data-testid="term-plain">{{ run.text }}</span>
      } @else {
        <app-term [key]="run.key" [scope]="scope()">{{ run.text }}</app-term>
      }
    </ng-template>
  `,
})
export class GuidanceText {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);

  readonly text = input<string | null | undefined>('');
  /** Guidance scope whose own glossary is read before the shared one. */
  readonly scope = input<string | null>(null);
  /** One run of text (a lead line, a list item) instead of paragraphs. */
  readonly inline = input(false);
  /** Show the definition on hover; off where a tooltip would be clipped. */
  readonly tooltips = input(true);
  /** Term keys already explained above this text. */
  readonly seen = input<readonly string[]>([]);

  protected readonly paragraphs = computed<Paragraph[]>(() => {
    const beginner = this.guidance.isBeginner();
    const scope = this.scope();
    const lookup = (key: string) => this.content.readTerm(key, scope);
    const text = this.text() ?? '';
    const blocks = this.inline() ? [text] : text.split(/\n{2,}/).filter((b) => b.trim());
    const seen = new Set(this.seen());
    return blocks.map((block) => {
      const segments = parseTermTokens(block);
      if (!this.inline() && segments.every((s) => s.kind === 'text')) {
        return { markdown: block, runs: [] };
      }
      const runs = boldRuns(displaySegments(segments, beginner, lookup, seen));
      segments.forEach((s) => s.kind === 'term' && seen.add(s.key));
      return { markdown: null, runs };
    });
  });

  protected asRuns(runs: unknown): readonly GuidanceRun[] {
    return runs as readonly GuidanceRun[];
  }
}
