import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { Button, ButtonSize, ButtonVariant } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService } from '../ask/ask-panel.service';

/**
 * A labelled "ask the assistant" button ("Spør om denne"): the icon-only
 * `app-ask-about` is easy to miss in a page header. Hidden when AI is off.
 */
@Component({
  selector: 'app-feedback-ask-button',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!availability.unavailable()) {
      <app-button
        [variant]="variant()"
        [size]="size()"
        (click)="ask()"
        [attr.data-testid]="testId()"
      >
        <app-icon name="spark" [size]="14" />
        {{ labelKey() | transloco }}
      </app-button>
    }
  `,
})
export class FeedbackAskButton {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);
  protected readonly availability = inject(AiAvailability);

  /** i18n key of the question to ask. */
  readonly promptKey = input.required<string>();
  readonly promptParams = input<Record<string, unknown> | undefined>(undefined);
  readonly labelKey = input('feedback.ask.button');
  readonly requirements = input<readonly string[] | null>(null);
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('sm');
  readonly testId = input('feedback-ask');

  protected ask(): void {
    this.panel.askAbout(this.language.translate(this.promptKey(), this.promptParams()), undefined, {
      requirements: this.requirements(),
    });
  }
}
