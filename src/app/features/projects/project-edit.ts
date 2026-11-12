import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { ProjectDetail, isClosedStatus } from './data/project.models';
import { projectErrorKey } from './data/project-errors';
import { ProjectFormValue, formFromProject, toUpdateRequest } from './data/project-form-model';
import { ProjectsApi } from './data/projects-api';
import { ProjectForm, ProjectFormSubmit } from './project-form';

/** Edit a project's fields (`/projects/:id/edit`). The team is managed on the detail page. */
@Component({
  selector: 'app-project-edit',
  imports: [RouterLink, TranslocoPipe, GuideIntro, Alert, Icon, ProjectForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="['/projects', id()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'projects.common.backToProject' | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'projects.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (project(); as p) {
            <h1
              class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ 'projects.form.editTitle' | transloco: { code: p.code } }}
            </h1>
            <div class="mb-5"><app-guide-intro scope="projects" page="form" /></div>
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

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'projects',
      entityType: 'project',
      entityId: this.id(),
      view: 'edit',
      title: this.project()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected closed(p: ProjectDetail): boolean {
    return isClosedStatus(p.status);
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
