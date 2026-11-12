import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { RISK_LEVELS, RiskLevel, RiskPrompt, isOneOf } from './data/project.models';
import { riskLevelTone } from './data/project-display';

/** Parse the `projects.risk_prompts` result defensively (unknown values fall back). */
export function parseRiskPrompts(data: unknown): RiskPrompt[] {
  const risks = (data as { risks?: unknown } | null)?.risks;
  if (!Array.isArray(risks)) {
    return [];
  }
  const level = (v: unknown): RiskLevel => (isOneOf(RISK_LEVELS, v) ? v : 'medium');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return risks
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      title: str(r['title']),
      description: str(r['description']),
      category: str(r['category']) || 'general',
      likelihood: level(r['likelihood']),
      impact: level(r['impact']),
      mitigation: str(r['mitigation']),
    }))
    .filter((r) => r.title.trim());
}

/**
 * AI help on a project: a status summary for a steering group, and risk prompts
 * (things that could go wrong, with a mitigation) that can be turned into a
 * follow-up task on the project. Both run through the generic assist endpoint
 * and are hidden when AI is off.
 */
@Component({
  selector: 'app-project-ai-panel',
  imports: [TranslocoPipe, MarkdownPipe, AiAssistButton, Badge, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <h2 class="mb-1 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
        <app-icon name="spark" [size]="15" class="text-accent" />
        {{ 'projects.ai.title' | transloco }}
      </h2>
      <p class="mb-3 text-[12.5px] text-fg-muted">{{ 'projects.ai.intro' | transloco }}</p>
      <div class="flex flex-wrap gap-2">
        <app-ai-assist-button
          assist="projects.status_summary"
          labelKey="projects.ai.statusSummary"
          entityType="project"
          [entityId]="projectId()"
          (text)="summary.set($event)"
          data-testid="ai-status-summary"
        />
        <app-ai-assist-button
          assist="projects.risk_prompts"
          labelKey="projects.ai.riskPrompts"
          entityType="project"
          [entityId]="projectId()"
          (result)="onRisks($event)"
          data-testid="ai-risk-prompts"
        />
      </div>

      @if (summary()) {
        <section class="mt-4" aria-live="polite">
          <h3 class="mb-1 text-[13px] font-semibold text-fg">
            {{ 'projects.ai.summaryHeading' | transloco }}
          </h3>
          <div
            class="prose-sm text-[13px] text-fg"
            data-testid="ai-summary"
            [innerHTML]="summary() | appMarkdown"
          ></div>
          <p class="mt-1 text-[11.5px] text-fg-subtle">{{ 'projects.ai.checkNote' | transloco }}</p>
        </section>
      }

      @if (risksLoaded()) {
        <section class="mt-4" aria-live="polite">
          <h3 class="mb-1 text-[13px] font-semibold text-fg">
            {{ 'projects.ai.risksHeading' | transloco }}
          </h3>
          @if (risks().length === 0) {
            <p class="text-[13px] text-fg-muted">{{ 'projects.ai.noRisks' | transloco }}</p>
          } @else {
            <ul class="flex flex-col gap-2" data-testid="ai-risks">
              @for (r of risks(); track $index) {
                <li class="rounded-tile border border-border p-3">
                  <div class="flex flex-wrap items-start gap-2">
                    <p class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">{{ r.title }}</p>
                    <app-badge [tone]="tone(r.likelihood)">{{
                      'projects.ai.likelihood'
                        | transloco: { level: ('projects.riskLevels.' + r.likelihood | transloco) }
                    }}</app-badge>
                    <app-badge [tone]="tone(r.impact)">{{
                      'projects.ai.impact'
                        | transloco: { level: ('projects.riskLevels.' + r.impact | transloco) }
                    }}</app-badge>
                  </div>
                  @if (r.description) {
                    <p class="mt-1 text-[13px] text-fg-muted">{{ r.description }}</p>
                  }
                  @if (r.mitigation) {
                    <p class="mt-1 text-[13px] text-fg">
                      <span class="font-semibold">{{ 'projects.ai.mitigation' | transloco }}:</span>
                      {{ r.mitigation }}
                    </p>
                  }
                  @if (canContribute()) {
                    <button
                      type="button"
                      class="mt-2 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
                      [disabled]="added().has($index) || adding() === $index"
                      (click)="addTask(r, $index)"
                      [attr.data-testid]="'risk-task-' + $index"
                    >
                      <app-icon [name]="added().has($index) ? 'check' : 'plus'" [size]="13" />
                      {{
                        (added().has($index) ? 'projects.ai.taskAdded' : 'projects.ai.addTask')
                          | transloco
                      }}
                    </button>
                  }
                </li>
              }
            </ul>
            <p class="mt-1 text-[11.5px] text-fg-subtle">
              {{ 'projects.ai.risksNote' | transloco }}
            </p>
          }
        </section>
      }
    </app-card>
  `,
})
export class ProjectAiPanel {
  private readonly tasksApi = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Emitted after a follow-up task was created (the page refreshes the plan). */
  readonly taskAdded = output<void>();

  protected readonly summary = signal('');
  protected readonly risks = signal<readonly RiskPrompt[]>([]);
  protected readonly risksLoaded = signal(false);
  protected readonly added = signal<ReadonlySet<number>>(new Set());
  protected readonly adding = signal<number | null>(null);

  protected tone(level: string) {
    return riskLevelTone(level);
  }

  protected onRisks(data: unknown): void {
    this.risks.set(parseRiskPrompts(data));
    this.added.set(new Set());
    this.risksLoaded.set(true);
  }

  protected addTask(risk: RiskPrompt, index: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.adding() !== null) {
      return;
    }
    this.adding.set(index);
    const description = [
      risk.description,
      risk.mitigation
        ? `${this.language.translate('projects.ai.mitigation')}: ${risk.mitigation}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    this.tasksApi
      .create(orgId, {
        title: this.language
          .translate('projects.ai.taskTitle', { title: risk.title })
          .slice(0, 255),
        description: description || null,
        entity_type: 'project',
        entity_id: this.projectId(),
        priority: risk.impact === 'high' ? 'high' : 'normal',
      })
      .subscribe({
        next: () => {
          this.adding.set(null);
          this.added.update((s) => new Set([...s, index]));
          this.notifications.success('projects.notices.taskAdded');
          this.taskAdded.emit();
        },
        error: () => {
          this.adding.set(null);
          this.notifications.error('projects.ai.taskFailed');
        },
      });
  }
}
