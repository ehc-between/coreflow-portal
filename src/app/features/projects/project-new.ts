import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { ProjectAskButton } from './ask-button';
import { projectErrorKey } from './data/project-errors';
import { emptyProjectForm, toCreateRequest } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';
import { ProjectForm, ProjectFormSubmit } from './project-form';

/**
 * Start a project (`/projects/new`). The assistant can draft one from a short
 * description (its `projects_create_draft` tool asks for confirmation first).
 * Opened from a requirement (`?fromRequirement=`) or a create-from-here flow,
 * the new project is linked back when it is saved.
 */
@Component({
  selector: 'app-project-new',
  imports: [
    TranslocoPipe,
    WhyItMatters,
    FlowBanner,
    Card,
    HelpStrip,
    PageHeader,
    ProjectAskButton,
    ProjectForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="projects.form.newTitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.projects', link: '/projects' },
          { labelKey: 'projects.form.newTitle' },
        ]"
        backLink="/projects"
        backLabelKey="projects.common.backToList"
      />
      <app-help-strip scope="projects" page="form" lesson="project-basics" />
      <app-flow-banner [flow]="flow()" />
      <app-card class="mb-5 block">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1 basis-64">
            <p class="text-body font-semibold text-fg">
              {{ 'projects.form.assistTitle' | transloco }}
            </p>
            <p class="text-meta text-fg-muted">{{ 'projects.form.assistBody' | transloco }}</p>
          </div>
          <app-project-ask-button
            promptKey="projects.ask.draft"
            labelKey="projects.ask.draftLabel"
            testId="project-draft"
          />
        </div>
      </app-card>
      <app-project-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="save($event)"
        (cancelled)="back()"
      />
      <div class="mt-8"><app-why-it-matters scope="projects" page="form" /></div>
    </div>
  `,
})
export class ProjectNew {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);
  private readonly formCmp = viewChild(ProjectForm);

  protected readonly seed = emptyProjectForm();
  protected readonly saving = signal(false);
  /** A create-from-here flow or `?fromRequirement=` the form was opened with. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'project' });

  constructor() {
    providePageContext(() => ({
      module: 'projects',
      entityType: 'project',
      view: 'new',
      title: this.language.translate('projects.form.newTitle'),
    }));
    effect(() => {
      const flow = this.flow();
      const form = this.formCmp();
      if (flow && form) {
        const p = flow.prefill;
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
        form.patchEmpty({
          title: str(p.title),
          description: str(p.description),
          objective: str(p['objective']),
          scope: str(p['scope']),
        });
      }
    });
  }

  protected save(event: ProjectFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, toCreateRequest(event.value)).subscribe({
      next: (project) => {
        this.saving.set(false);
        this.notifications.success('projects.notices.created', { code: project.code });
        this.flows.complete(project.id, 'project').subscribe();
        void this.router.navigate(['/projects', project.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected back(): void {
    this.flows.cancel();
    void this.router.navigate(['/projects']);
  }
}
