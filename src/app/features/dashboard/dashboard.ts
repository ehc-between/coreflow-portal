import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AgentBanner } from '../../shared/ui/agent-banner/agent-banner';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';

/**
 * Dashboard surface. Lightly styled with the CoreFlow design system to exercise
 * the new tokens and shared components; richer content lands in its own ticket.
 */
@Component({
  selector: 'app-dashboard',
  imports: [TranslocoPipe, AgentBanner, KpiTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'dashboard.welcome' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">{{ 'dashboard.subtitle' | transloco }}</div>
      </div>

      <div class="mb-[22px]">
        <app-agent-banner agentName="Iris" [agentRole]="'dashboard.agentRole' | transloco" />
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <app-kpi-tile
          [label]="'dashboard.kpi.deviations.label' | transloco"
          value="7"
          [delta]="'dashboard.kpi.deviations.delta' | transloco"
          tone="warn"
          deltaTone="pass"
        />
        <app-kpi-tile
          [label]="'dashboard.kpi.audits.label' | transloco"
          value="3"
          [delta]="'dashboard.kpi.audits.delta' | transloco"
          tone="info"
        />
        <app-kpi-tile
          [label]="'dashboard.kpi.passRate.label' | transloco"
          value="96%"
          delta="+1.2%"
          tone="pass"
        />
        <app-kpi-tile
          [label]="'dashboard.kpi.overdue.label' | transloco"
          value="1"
          [delta]="'dashboard.kpi.overdue.delta' | transloco"
          tone="fail"
        />
      </div>
    </div>
  `,
})
export class Dashboard {}
