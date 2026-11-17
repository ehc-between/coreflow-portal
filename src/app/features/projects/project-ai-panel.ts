import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { FlowPrefillValues } from '../../core/kit/connections.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { RISK_LEVELS, RiskLevel, RiskPrompt, isOneOf } from './data/project.models';
import { RiskScale, ProjectsApi, levelOnScale } from './data/projects-api';

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
 * The risk form values for a suggestion: title, description (with the suggested
 * mitigation), the mitigation as treatment notes, and the low / medium / high
 * rating placed on the org's own matrix when it is known.
 */
export function riskOverlay(
  risk: RiskPrompt,
  scale: RiskScale | null,
  mitigationLabel: string,
): FlowPrefillValues {
  const description = [
    risk.description,
    risk.mitigation ? `${mitigationLabel}: ${risk.mitigation}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const likelihood = scale ? levelOnScale(risk.likelihood, scale.likelihood) : null;
  const consequence = scale ? levelOnScale(risk.impact, scale.consequence) : null;
  return {
    title: risk.title.slice(0, 255),
    ...(description ? { description } : {}),
    ...(risk.mitigation ? { treatment_notes: risk.mitigation } : {}),
    ...(likelihood !== null ? { inherent_likelihood: likelihood } : {}),
    ...(consequence !== null ? { inherent_consequence: consequence } : {}),
  };
}

/**
 * AI help on a project: a status summary for a steering group, and risk prompts
 * (things that could go wrong, with a mitigation). A suggested risk can be
 * registered in the risk register (the risk form opens prefilled and the risk is
 * linked to the project) or kept as a follow-up task. Both run through the
 * generic assist endpoint and are hidden when AI is off.
 */
@Component({
  selector: 'app-project-ai-panel',
  imports: [TranslocoPipe, MarkdownPipe, AiAssistButton, StatusBadge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="mb-3 text-meta text-fg-muted">{{ 'projects.ai.intro' | transloco }}</p>
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
        <h3 class="mb-1 text-ui font-semibold text-fg">
          {{ 'projects.ai.summaryHeading' | transloco }}
        </h3>
        <div
          class="prose-sm text-ui text-fg"
          data-testid="ai-summary"
          [innerHTML]="summary() | appMarkdown"
        ></div>
        <p class="mt-1 text-meta text-fg-subtle">{{ 'projects.ai.checkNote' | transloco }}</p>
      </section>
    }

    @if (risksLoaded()) {
      <section class="mt-4" aria-live="polite">
        <h3 class="mb-1 text-ui font-semibold text-fg">
          {{ 'projects.ai.risksHeading' | transloco }}
        </h3>
        @if (risks().length === 0) {
          <p class="text-ui text-fg-muted">{{ 'projects.ai.noRisks' | transloco }}</p>
        } @else {
          <ul class="flex flex-col gap-2" data-testid="ai-risks">
            @for (r of risks(); track $index) {
              <li class="rounded-tile border border-border p-3">
                <div class="flex flex-wrap items-start gap-2">
                  <p class="min-w-0 flex-1 text-body font-semibold text-fg">{{ r.title }}</p>
                  <app-status-badge
                    meaning="severity"
                    [value]="r.likelihood"
                    labelKey="projects.ai.likelihood"
                    [labelParams]="{ level: levelLabel(r.likelihood) }"
                  />
                  <app-status-badge
                    meaning="severity"
                    [value]="r.impact"
                    labelKey="projects.ai.impact"
                    [labelParams]="{ level: levelLabel(r.impact) }"
                  />
                </div>
                @if (r.description) {
                  <p class="mt-1 text-ui text-fg-muted">{{ r.description }}</p>
                }
                @if (r.mitigation) {
                  <p class="mt-1 text-ui text-fg">
                    <span class="font-semibold">{{ 'projects.ai.mitigation' | transloco }}:</span>
                    {{ r.mitigation }}
                  </p>
                }
                @if (canContribute()) {
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class="inline-flex min-h-7 items-center gap-1 rounded-tile bg-accent-soft px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft/70 disabled:opacity-50"
                      [disabled]="flows.starting() !== null"
                      (click)="registerRisk(r)"
                      [attr.data-testid]="'risk-register-' + $index"
                    >
                      <app-icon name="risk" [size]="13" />
                      {{ 'projects.ai.registerRisk' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-7 items-center gap-1 rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
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
                  </div>
                }
              </li>
            }
          </ul>
          <p class="mt-1 text-meta text-fg-subtle">
            {{ 'projects.ai.risksNote' | transloco }}
          </p>
        }
      </section>
    }
  `,
})
export class ProjectAiPanel {
  private readonly tasksApi = inject(TasksApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly flows = inject(CreateFlowService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Emitted after a follow-up task was created (the page refreshes the plan). */
  readonly taskAdded = output<void>();

  protected readonly summary = signal('');
  protected readonly risks = signal<readonly RiskPrompt[]>([]);
  protected readonly risksLoaded = signal(false);
  protected readonly added = signal<ReadonlySet<number>>(new Set());
  protected readonly adding = signal<number | null>(null);
  private readonly scale = signal<RiskScale | null>(null);

  protected levelLabel(level: string): string {
    return this.language.translate(`projects.riskLevels.${level}`);
  }

  protected onRisks(data: unknown): void {
    this.risks.set(parseRiskPrompts(data));
    this.added.set(new Set());
    this.risksLoaded.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId && !this.scale()) {
      this.projectsApi
        .riskScale(orgId)
        .pipe(catchError(() => of(null)))
        .subscribe((scale) => this.scale.set(scale));
    }
  }

  /** Open the risk form prefilled with the suggestion; the risk is linked to the project. */
  protected registerRisk(risk: RiskPrompt): void {
    void this.flows.start(
      'project.to_risk',
      'project',
      this.projectId(),
      riskOverlay(risk, this.scale(), this.language.translate('projects.ai.mitigation')),
    );
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
