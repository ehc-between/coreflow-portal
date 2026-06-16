import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AgentBanner } from '../../shared/ui/agent-banner/agent-banner';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Shared placeholder for modules whose real surfaces are deferred. Route `data`
 * ({ titleKey, agentName, agentRole }) is bound to the inputs below via
 * `withComponentInputBinding()`.
 */
@Component({
  selector: 'app-module-placeholder',
  imports: [TranslocoPipe, AgentBanner, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ titleKey() | transloco }}
        </h1>
      </div>

      <div class="mb-[22px]">
        <app-agent-banner [agentName]="agentName()" [agentRole]="agentRole()" />
      </div>

      <app-card>
        <div class="flex flex-col items-center gap-3 py-12 text-center">
          <span
            class="flex h-12 w-12 items-center justify-center rounded-card border border-accent-border bg-accent-soft text-accent"
          >
            <app-icon name="spark" [size]="22" />
          </span>
          <p class="max-w-sm text-[14px] text-fg-muted">{{ 'module.comingSoon' | transloco }}</p>
        </div>
      </app-card>
    </div>
  `,
})
export class ModulePlaceholder {
  readonly titleKey = input('');
  readonly agentName = input('CoreFlow');
  readonly agentRole = input('');
}
