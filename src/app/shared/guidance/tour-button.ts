import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { TourService } from './tour.service';

/** "Take the tour" button; hidden when the guidance file has no such tour. */
@Component({
  selector: 'app-tour-button',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (available()) {
      <button
        type="button"
        data-testid="tour-button"
        class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-[13px] font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="start()"
      >
        <span
          class="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white"
          aria-hidden="true"
          >&#9654;</span
        >
        {{ 'guidance.tour.start' | transloco }}
      </button>
    }
  `,
})
export class TourButton {
  private readonly content = inject(GuidanceContentService);
  private readonly tours = inject(TourService);

  readonly scope = input.required<string>();
  readonly tour = input.required<string>();

  protected readonly available = computed(
    () => this.content.readTour(this.scope(), this.tour()).length > 0,
  );

  protected start(): void {
    void this.tours.start(this.scope(), this.tour());
  }
}
