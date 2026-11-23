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
import { Icon } from '../../shared/ui/icon/icon';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { ProjectAskButton } from './ask-button';
import { projectErrorKey } from './data/project-errors';
import { emptyProjectForm, toCreateRequest } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';
import { ProjectForm, ProjectFormSubmit } from './project-form';
import { CustomerRef, customerIdFromRoute } from '../../shared/customers';

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
    Icon,
    HelpStrip,
    PageHeader,
    ProjectAskButton,
    ProjectForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
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
      <div
        class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border border-accent-border bg-accent-soft/50 px-3 py-2.5"
      >
        <span
          class="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface text-accent"
          aria-hidden="true"
        >
          <app-icon name="spark" [size]="14" />
        </span>
        <p class="min-w-0 flex-1 basis-[min(100%,240px)] text-meta leading-snug text-fg-muted">
          <span class="font-semibold text-fg">{{ 'projects.form.assistTitle' | transloco }}</span>
          · {{ 'projects.form.assistBody' | transloco }}
        </p>
        <app-project-ask-button
          variant="secondary"
          size="sm"
          promptKey="projects.ask.draft"
          labelKey="projects.ask.draftLabel"
          testId="project-draft"
        />
      </div>
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
  private readonly route = inject(ActivatedRoute);
  protected readonly flow = this.flows.consume(this.route, { targetType: 'project' });

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
    // The Kunde field: from the customer card's create flow or `?customer_id=`.
    effect(() => {
      const form = this.formCmp();
      if (!form) {
        return;
      }
      const p = this.flow()?.prefill ?? {};
      const id = typeof p['customer_id'] === 'string' ? p['customer_id'] : null;
      const ref = (p['customer'] as CustomerRef | undefined) ?? null;
      form.patchCustomer(id ?? customerIdFromRoute(this.route), id ? ref : null);
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
