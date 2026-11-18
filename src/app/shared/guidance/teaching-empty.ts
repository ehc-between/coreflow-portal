import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { PageHelpRegistry } from '../../core/guidance/page-help.registry';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { Button } from '../ui/button/button';
import { TeachMe } from './teach-me';

/**
 * An empty state that teaches (`pages.<page>.empty`): what the list is for, why to
 * start, and a call to action (`action` fires on click). Beginners also get "Teach me", unless the
 * page has a help strip: then that help sits behind its "?" (U38: one help entry point).
 * Falls back to the projected content when the page has no empty-state guidance.
 */
@Component({
  selector: 'app-teaching-empty',
  imports: [MarkdownPipe, Button, TeachMe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (empty(); as empty) {
      <div
        data-testid="teaching-empty"
        class="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center"
      >
        <div
          class="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-section font-bold text-accent"
          aria-hidden="true"
        >
          +
        </div>
        <h2 class="font-display text-section font-bold text-fg">{{ empty.title }}</h2>
        <div class="cf-prose mt-1.5 text-fg-muted" [innerHTML]="empty.body | appMarkdown"></div>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          @if (empty.cta && showAction()) {
            <app-button (click)="action.emit()">{{ empty.cta }}</app-button>
          }
          @if (beginner() && !registry.hasStrip()) {
            <app-teach-me [topic]="scope() + '.' + page()" [subject]="empty.title" />
          }
        </div>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class TeachingEmpty {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);
  protected readonly registry = inject(PageHelpRegistry);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();
  /** Hide the CTA (e.g. when the user may not create records). */
  readonly showAction = input(true);
  readonly action = output<void>();

  protected readonly beginner = this.guidance.isBeginner;
  protected readonly empty = computed(
    () => this.content.readPage(this.scope(), this.page())?.empty ?? null,
  );
}
