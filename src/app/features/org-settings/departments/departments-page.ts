import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgApi } from '../../../core/org/org-api';
import { DepartmentSummary } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { SettingsPeopleNav } from '../settings-nav/settings-nav';

/** `{{count}} medlemmer` / `1 medlem`: the key for a count (the `…One` variant for 1). */
export function countKey(key: string, count: number): string {
  return count === 1 ? `${key}One` : key;
}

/** Departments whose lead is missing (escalations to the department lead reach nobody). */
export function departmentsWithoutLead(
  departments: readonly DepartmentSummary[],
): DepartmentSummary[] {
  return departments.filter((d) => d.lead_user_id === null);
}

/**
 * `/settings/departments` (org:manage): the organisation's departments with
 * their lead, members and People-register entries; create, rename and delete.
 * A department without a lead is flagged, because overdue reminders that
 * escalate to the department lead then reach nobody.
 */
@Component({
  selector: 'app-departments-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    FormField,
    Icon,
    LoadingState,
    PageHeader,
    HelpStrip,
    SettingsPeopleNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="settings.members.pageTitle"
        descriptionKey="settings.departments.description"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.departments.title' },
        ]"
      />
      <app-settings-people-nav />
      <div class="mb-4">
        <app-help-strip scope="platform" page="settings-departments" lesson="people-and-access" />
      </div>

      @if (withoutLead().length > 0) {
        <div class="mb-4" data-testid="departments-no-lead">
          <p
            role="status"
            class="flex items-start gap-2 rounded-tile border border-warn/30 bg-warn-soft px-3 py-2 text-ui text-warn-ink"
          >
            <app-icon name="alert" [size]="15" />
            <span>{{
              countKey('settings.departments.noLeadWarning', withoutLead().length)
                | transloco: { count: withoutLead().length, names: withoutLeadNames() }
            }}</span>
          </p>
        </div>
      }

      <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
        <app-card [padded]="false">
          @if (loading() && departments().length === 0) {
            <app-loading-state [rows]="4" />
          } @else if (loadError()) {
            <app-error-state (retry)="reload()" />
          } @else if (departments().length === 0) {
            <app-empty-state
              icon="people"
              titleKey="settings.departments.emptyTitle"
              bodyKey="settings.departments.emptyBody"
              [compact]="true"
            />
          } @else {
            <ul>
              @for (department of departments(); track department.id) {
                <li
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
                  data-testid="department-row"
                >
                  @if (editingId() === department.id) {
                    <form
                      class="flex flex-1 flex-wrap items-center gap-2"
                      [formGroup]="renameForm"
                      (ngSubmit)="rename(department)"
                    >
                      <div class="flex min-w-48 flex-1 flex-col gap-1">
                        <input
                          type="text"
                          formControlName="name"
                          autocomplete="off"
                          [attr.aria-label]="
                            'settings.departments.renameLabel'
                              | transloco: { name: department.name }
                          "
                          class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                        />
                        @if (renameTaken()) {
                          <p role="alert" class="text-meta font-medium text-fail">
                            {{ 'settings.departments.nameTaken' | transloco }}
                          </p>
                        }
                      </div>
                      <app-button type="submit" size="sm" [loading]="renaming()">
                        {{ 'settings.save' | transloco }}
                      </app-button>
                      <app-button type="button" variant="ghost" size="sm" (click)="cancelRename()">
                        {{ 'settings.cancel' | transloco }}
                      </app-button>
                    </form>
                  } @else {
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/settings/departments', department.id]"
                        class="font-semibold text-accent hover:underline"
                      >
                        {{ department.name }}
                      </a>
                      <div
                        class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
                      >
                        <span>{{
                          countKey('settings.departments.memberCount', department.member_count)
                            | transloco: { count: department.member_count }
                        }}</span>
                        @if (department.employee_count !== undefined) {
                          <span>{{
                            countKey(
                              'settings.departments.employeeCount',
                              department.employee_count
                            ) | transloco: { count: department.employee_count }
                          }}</span>
                        }
                        @if (department.lead_name) {
                          <span>{{
                            'settings.departments.leadIs'
                              | transloco: { name: department.lead_name }
                          }}</span>
                        } @else if (department.lead_user_id === null) {
                          <app-badge tone="warn">{{
                            'settings.departments.noLead' | transloco
                          }}</app-badge>
                        }
                      </div>
                    </div>
                    <app-button
                      variant="ghost"
                      size="sm"
                      [attr.aria-label]="
                        'settings.departments.renameLabel' | transloco: { name: department.name }
                      "
                      (click)="startRename(department)"
                    >
                      {{ 'settings.departments.rename' | transloco }}
                    </app-button>
                    <app-button
                      variant="ghost"
                      size="sm"
                      [attr.aria-label]="
                        'settings.departments.deleteLabel' | transloco: { name: department.name }
                      "
                      (click)="pendingDelete.set(department)"
                    >
                      {{ 'settings.departments.delete' | transloco }}
                    </app-button>
                  }
                </li>
              }
            </ul>
          }
        </app-card>

        <app-card>
          <h2 class="font-display text-card font-bold text-fg">
            {{ 'settings.departments.create' | transloco }}
          </h2>
          <p class="mt-1 text-meta text-fg-muted">
            {{ 'settings.departments.createHint' | transloco }}
          </p>
          <form class="mt-4 flex flex-col gap-4" [formGroup]="createForm" (ngSubmit)="create()">
            <app-form-field
              inputId="department-name"
              [label]="'settings.departments.name' | transloco"
            >
              <input id="department-name" type="text" formControlName="name" autocomplete="off" />
            </app-form-field>
            @if (nameTaken()) {
              <p
                role="alert"
                class="rounded-tile border border-fail/30 bg-fail-soft px-3 py-2 text-ui font-medium text-fail"
              >
                {{ 'settings.departments.nameTaken' | transloco }}
              </p>
            }
            <app-button type="submit" [full]="true" [loading]="creating()">
              <app-icon name="plus" [size]="15" />
              {{ 'settings.departments.create' | transloco }}
            </app-button>
          </form>
        </app-card>
      </div>

      <app-confirm-dialog
        [open]="pendingDelete() !== null"
        [busy]="deleting()"
        [title]="'settings.departments.deleteTitle' | transloco"
        [message]="
          'settings.departments.confirmDelete' | transloco: { name: pendingDelete()?.name ?? '' }
        "
        [confirmLabel]="'settings.departments.delete' | transloco"
        [cancelLabel]="'settings.cancel' | transloco"
        (confirmed)="confirmDelete()"
        (cancelled)="pendingDelete.set(null)"
      />
    </div>
  `,
})
export class DepartmentsPage {
  private readonly fb = inject(FormBuilder);
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly countKey = countKey;

  protected readonly departments = signal<readonly DepartmentSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly creating = signal(false);
  protected readonly nameTaken = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly renameTaken = signal(false);
  protected readonly renaming = signal(false);
  protected readonly pendingDelete = signal<DepartmentSummary | null>(null);
  protected readonly deleting = signal(false);

  protected readonly withoutLead = computed(() => departmentsWithoutLead(this.departments()));
  protected readonly withoutLeadNames = computed(() =>
    this.withoutLead()
      .map((d) => d.name)
      .join(', '),
  );

  protected readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });
  protected readonly renameForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'department',
      view: 'list',
      title: this.language.translate('settings.departments.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      this.departments.set([]);
      this.editingId.set(null);
      this.pendingDelete.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) this.load(orgId);
  }

  protected create(): void {
    const orgId = this.orgId();
    if (!orgId || this.createForm.invalid || this.creating()) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.creating.set(true);
    this.nameTaken.set(false);
    const name = this.createForm.getRawValue().name.trim();
    this.orgApi.createDepartment(orgId, name).subscribe({
      next: () => {
        this.createForm.reset({ name: '' });
        this.creating.set(false);
        this.notifications.success('settings.departments.createdToast');
        this.load(orgId);
      },
      error: (error: unknown) => {
        this.creating.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.nameTaken.set(true);
        }
      },
    });
  }

  protected startRename(department: DepartmentSummary): void {
    this.editingId.set(department.id);
    this.renameTaken.set(false);
    this.renameForm.reset({ name: department.name });
  }

  protected cancelRename(): void {
    this.editingId.set(null);
    this.renameTaken.set(false);
  }

  protected rename(department: DepartmentSummary): void {
    const orgId = this.orgId();
    if (!orgId || this.renameForm.invalid || this.renaming()) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.renaming.set(true);
    this.renameTaken.set(false);
    const name = this.renameForm.getRawValue().name.trim();
    this.orgApi.renameDepartment(orgId, department.id, name).subscribe({
      next: () => {
        this.renaming.set(false);
        this.editingId.set(null);
        this.notifications.success('settings.departments.renamedToast');
        this.load(orgId);
      },
      error: (error: unknown) => {
        this.renaming.set(false);
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.renameTaken.set(true);
        }
      },
    });
  }

  protected confirmDelete(): void {
    const orgId = this.orgId();
    const department = this.pendingDelete();
    if (!orgId || !department || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.orgApi.deleteDepartment(orgId, department.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.notifications.success('settings.departments.deletedToast');
        this.load(orgId);
      },
      error: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.orgApi.listDepartments(orgId).subscribe({
      next: (departments) => {
        if (this.orgId() !== orgId) return;
        this.departments.set(departments);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}
