import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * A small labelled "Spør" button next to a section heading: opens the assistant
 * with a ready question about this part of the page. Unlike a bare icon it says
 * what it does. Hidden when the assistant is off.
 */
@Component({
  selector: 'app-people-ask',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!availability.unavailable()) {
      <button
        type="button"
        (click)="ask()"
        [attr.title]="prompt()"
        class="inline-flex h-7 items-center gap-1 rounded-tile px-2 text-meta font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        data-testid="people-ask"
      >
        <app-icon name="spark" [size]="14" />
        {{ labelKey() | transloco }}
      </button>
    }
  `,
})
export class PeopleAsk {
  private readonly panel = inject(AskPanelService);
  protected readonly availability = inject(AiAvailability);

  /** The translated question. */
  readonly prompt = input.required<string>();
  /** The translated name of the part of the page the question is about. */
  readonly field = input<string | null>(null);
  readonly requirements = input<readonly string[] | null>(null);
  readonly labelKey = input('people.ask.label');

  protected ask(): void {
    const field = this.field();
    this.panel.askAbout(this.prompt(), field ? { field } : undefined, {
      requirements: this.requirements(),
    });
  }
}
