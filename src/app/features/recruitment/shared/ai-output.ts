import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Shows an AI-generated draft, always labelled as such (EU AI Act transparency and
 * the module's assist-only policy): the human reviews it and decides whether to use
 * it. `useLabelKey` adds a "use this" action; Discard clears it.
 */
@Component({
  selector: 'app-recruitment-ai-output',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-card border border-accent-border bg-accent-soft/40 p-4"
      [attr.aria-label]="'recruitment.ai.outputLabel' | transloco"
      aria-live="polite"
    >
      <p class="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-accent">
        <app-icon name="spark" [size]="14" />
        {{ 'recruitment.ai.generatedNotice' | transloco }}
      </p>
      <ng-content />
      @if (text()) {
        <div class="text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">{{ text() }}</div>
      }
      <div class="mt-3 flex flex-wrap gap-2">
        @if (useLabelKey(); as key) {
          <app-button size="sm" (click)="used.emit()">{{ key | transloco }}</app-button>
        }
        <app-button size="sm" variant="ghost" (click)="dismissed.emit()">
          {{ 'recruitment.ai.discard' | transloco }}
        </app-button>
      </div>
    </section>
  `,
})
export class RecruitmentAiOutput {
  readonly text = input<string | null>(null);
  readonly useLabelKey = input<string | null>(null);
  readonly used = output<void>();
  readonly dismissed = output<void>();
}
