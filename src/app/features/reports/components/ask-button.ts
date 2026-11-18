import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { loadSearchScope } from '../../../core/search/search-scope';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * "Spør om dette": the assistant button of the Reports cards, with a visible label
 * (the icon-only ✦ floated without context, audit finding 22). Asks `prompt` about
 * the current page, whose context the page registered with `providePageContext`.
 * Hidden once the assistant is known to be off.
 */
@Component({
  selector: 'app-reports-ask',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (!availability.unavailable()) {
      <button
        type="button"
        (click)="ask()"
        data-testid="reports-ask"
        class="inline-flex min-h-8 items-center gap-1.5 rounded-tile px-2 text-ui font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <app-icon name="spark" [size]="14" />
        {{ labelKey() | transloco }}
      </button>
    }
  `,
})
export class ReportsAsk {
  private readonly panel = inject(AskPanelService);
  protected readonly availability = inject(AiAvailability);

  /** The (translated) question. */
  readonly prompt = input.required<string>();
  /** The field the question is about, as the user knows it (translated). */
  readonly field = input<string | null>(null);
  readonly requirements = input<readonly string[] | null>(null);
  readonly labelKey = input('reports.common.ask');

  constructor() {
    loadSearchScope();
  }

  protected ask(): void {
    const field = this.field();
    this.panel.askAbout(this.prompt(), field ? { field } : undefined, {
      requirements: this.requirements(),
    });
  }
}
