import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { Button } from '../ui/button/button';
import { TOUR_CONTROLLER } from './tour-controller';

/** The popover card of a running tour (rendered in a CDK overlay by `TourService`). */
@Component({
  selector: 'app-tour-popover',
  imports: [TranslocoPipe, MarkdownPipe, Button],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (tour.step(); as step) {
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        tabindex="-1"
        data-testid="tour-popover"
        class="w-[320px] max-w-full rounded-card border border-border bg-surface p-4 shadow-pop outline-none"
      >
        <div class="text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">
          {{
            'guidance.tour.progress'
              | transloco: { current: tour.index() + 1, total: tour.steps().length }
          }}
        </div>
        <h2 id="tour-step-title" class="mt-1 text-[15px] font-bold text-fg">{{ step.title }}</h2>
        <div class="cf-prose mt-1.5 text-fg-muted" [innerHTML]="step.body | appMarkdown"></div>
        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            class="mr-auto text-[12.5px] font-medium text-fg-muted hover:text-fg hover:underline"
            (click)="tour.end()"
          >
            {{ 'guidance.tour.skip' | transloco }}
          </button>
          @if (tour.index() > 0) {
            <app-button variant="secondary" size="sm" (click)="tour.previous()">
              {{ 'guidance.tour.back' | transloco }}
            </app-button>
          }
          <app-button size="sm" data-testid="tour-next" (click)="tour.next()">
            {{ (tour.isLast() ? 'guidance.tour.done' : 'guidance.tour.next') | transloco }}
          </app-button>
        </div>
      </div>
    }
  `,
})
export class TourPopover {
  protected readonly tour = inject(TOUR_CONTROLLER);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  constructor() {
    // Move focus into the popover on every step so keyboard users follow the tour.
    afterRenderEffect(() => {
      this.tour.index();
      this.host.nativeElement.querySelector<HTMLElement>('[role="dialog"]')?.focus();
    });
  }
}
