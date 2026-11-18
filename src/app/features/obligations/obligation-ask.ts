import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService } from '../ask/ask-panel.service';

/** A ready-made question about the page (`obligations.ask.<key>`). */
export interface AskPrompt {
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * "Ask CoreFlow" with labelled, ready-made questions about the obligation or the
 * register ("Which duties lack documentation?"). The questions go to the assistant
 * with the page context (and the record's clause refs). Hidden when AI is off.
 */
@Component({
  selector: 'app-obligation-ask',
  imports: [TranslocoPipe, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!availability.unavailable()) {
      <app-card>
        <h2 class="mb-2 flex items-center gap-1.5 text-card font-semibold text-fg">
          <app-icon name="spark" [size]="15" class="text-accent" />
          {{ 'obligations.ask.title' | transloco }}
        </h2>
        <ul class="flex flex-col gap-1" data-testid="ask-prompts">
          @for (p of prompts(); track p.key) {
            <li>
              <button
                type="button"
                class="w-full rounded-tile px-2 py-1.5 text-left text-ui font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                (click)="ask(p)"
                [attr.data-testid]="'ask-' + p.key"
              >
                {{ 'obligations.ask.' + p.key | transloco: p.params }}
              </button>
            </li>
          }
        </ul>
      </app-card>
    }
  `,
})
export class ObligationAsk {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);
  protected readonly availability = inject(AiAvailability);

  readonly prompts = input.required<readonly AskPrompt[]>();
  /** Canonical clause refs of the record, sent with the page context. */
  readonly requirements = input<readonly string[] | null>(null);

  protected ask(prompt: AskPrompt): void {
    const text = this.language.translate(`obligations.ask.${prompt.key}`, prompt.params);
    this.panel.askAbout(text, undefined, { requirements: this.requirements() });
  }
}
