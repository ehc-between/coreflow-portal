import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Avatar } from '../avatar/avatar';

/**
 * AI-agent banner: gradient accent-soft panel with the agent's avatar, its
 * name · role, a descriptive line, and an optional projected action (e.g. an
 * "Ask <agent>" button). Used atop module surfaces.
 */
@Component({
  selector: 'app-agent-banner',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center gap-3 rounded-card border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),transparent)] px-4 py-3.5"
    >
      <app-avatar [name]="agentName()" [initials]="initials()" />
      <div class="min-w-0 flex-1">
        <div class="text-[13px] font-bold text-fg">{{ agentName() }} · {{ agentRole() }}</div>
        @if (line()) {
          <div class="mt-px text-[13px] text-fg-muted">{{ line() }}</div>
        }
      </div>
      <ng-content />
    </div>
  `,
})
export class AgentBanner {
  readonly agentName = input.required<string>();
  readonly agentRole = input('');
  readonly initials = input<string | null>(null);
  readonly line = input('');
}
