import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { projectErrorKey } from './data/project-errors';
import { emptyProjectForm, toCreateRequest } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';
import { ProjectLessonLink } from './lesson-link';
import { ProjectForm, ProjectFormSubmit } from './project-form';

/**
 * Start a project (`/projects/new`). The assistant can draft one from a short
 * description (its `projects_create_draft` tool asks for confirmation first).
 */
@Component({
  selector: 'app-project-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    Card,
    Icon,
    ProjectForm,
    ProjectLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/projects"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'projects.common.backToList' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'projects.form.newTitle' | transloco }}
      </h1>
      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="projects" page="form" />
        <app-card>
          <div class="flex items-start gap-3">
            <app-ask-about
              [prompt]="'projects.ask.draft' | transloco"
              labelKey="projects.ask.draftLabel"
            />
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] font-semibold text-fg">
                {{ 'projects.form.assistTitle' | transloco }}
              </p>
              <p class="text-[12.5px] text-fg-muted">
                {{ 'projects.form.assistBody' | transloco }}
              </p>
            </div>
          </div>
        </app-card>
      </div>
      <app-project-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="save($event)"
        (cancelled)="back()"
      />
      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="projects" page="form" />
        <app-project-lesson-link lesson="project-basics" />
      </div>
    </div>
  `,
})
export class ProjectNew {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly seed = emptyProjectForm();
  protected readonly saving = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'projects',
      entityType: 'project',
      view: 'new',
      title: this.language.translate('projects.form.newTitle'),
    }));
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
        void this.router.navigate(['/projects', project.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/projects']);
  }
}
