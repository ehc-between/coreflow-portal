import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { ProjectDetail, isClosedStatus } from './data/project.models';
import { projectErrorKey } from './data/project-errors';
import { ProjectFormValue, formFromProject, toUpdateRequest } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';
import { ProjectForm, ProjectFormSubmit } from './project-form';

/** Edit a project's fields (`/projects/:id/edit`). The team is managed on the detail page. */
@Component({
  selector: 'app-project-edit',
  imports: [TranslocoPipe, Alert, ErrorState, HelpStrip, LoadingState, PageHeader, ProjectForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="projects.form.editTitle"
        [titleParams]="{ code: project()?.code ?? '' }"
        [breadcrumbs]="crumbs()"
        [backLink]="['/projects', id()]"
        backLabelKey="projects.common.backToProject"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          @if (errorKey() === 'projects.errors.notFound') {
            <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          } @else {
            <app-error-state (retry)="reload()" />
          }
        }
        @default {
          @if (project(); as p) {
            <app-help-strip scope="projects" page="form" lesson="project-basics" />
            @if (closed(p)) {
              <app-alert tone="info" data-testid="edit-closed">{{
                'projects.form.closedReadOnly' | transloco
              }}</app-alert>
            } @else if (!p.can_edit) {
              <app-alert tone="info" data-testid="edit-readonly">{{
                'projects.form.readOnly' | transloco
              }}</app-alert>
            } @else if (seed(); as value) {
              <app-project-form
                mode="edit"
                [value]="value"
                [ownerName]="p.owner?.name ?? null"
                [busy]="saving()"
                (submitted)="save($event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class ProjectEdit {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('projects.common.loadFailed');
  protected readonly project = signal<ProjectDetail | null>(null);
  protected readonly seed = signal<ProjectFormValue | null>(null);
  protected readonly saving = signal(false);

  protected readonly crumbs = computed<readonly Breadcrumb[]>(() => {
    const p = this.project();
    return [
      { labelKey: 'modules.names.projects', link: '/projects' },
      ...(p ? [{ label: `${p.code} ${p.title}`, link: ['/projects', p.id] }] : []),
      { labelKey: 'projects.form.editCrumb' },
    ];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const p = this.project();
      return {
        module: 'projects',
        entityType: 'project',
        entityId: this.id(),
        view: 'edit',
        title: p ? `${p.code} ${p.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected closed(p: ProjectDetail): boolean {
    return isClosedStatus(p.status);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected save(event: ProjectFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    const original = this.seed();
    if (!orgId || !original || this.saving()) {
      return;
    }
    const body = toUpdateRequest(original, event.value, event.changeReason);
    if (Object.keys(body).length === 0) {
      this.notifications.info('projects.notices.noChanges');
      this.back();
      return;
    }
    this.saving.set(true);
    this.api.update(orgId, this.id(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('projects.notices.saved');
        this.back();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/projects', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.seed.set(formFromProject(project));
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(projectErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
