import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { OrgApi } from '../../../core/org/org-api';
import { DepartmentSummary } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Org Settings shell, scoped to the currently selected org. For now it hosts a
 * single Departments section (list + create + rename + delete); the layout is
 * structured so further org-settings sections can be added below. Reacts to org
 * switches by reloading departments for the new org and dropping stale state.
 */
@Component({
  selector: 'app-org-settings',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Card, FormField, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './org-settings.html',
})
export class OrgSettings {
  private readonly fb = inject(FormBuilder);
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  /** The active org id; the page is scoped to and reloads on changes to it. */
  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly departments = signal<readonly DepartmentSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly creating = signal(false);
  protected readonly nameTaken = signal(false);

  /** Department currently being renamed inline (id), with a pending value. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly renameTaken = signal(false);
  protected readonly renaming = signal(false);

  protected readonly createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  protected readonly renameForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
  });

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      // Drop any stale data from a previously selected org.
      this.departments.set([]);
      this.editingId.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
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
          this.notifications.error('settings.departments.nameTaken');
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
          this.notifications.error('settings.departments.nameTaken');
        }
      },
    });
  }

  protected remove(department: DepartmentSummary): void {
    const orgId = this.orgId();
    const message = this.transloco.translate('settings.departments.confirmDelete', {
      name: department.name,
    });
    if (!orgId || !globalThis.confirm?.(message)) {
      return;
    }

    this.orgApi.deleteDepartment(orgId, department.id).subscribe({
      next: () => {
        this.notifications.success('settings.departments.deletedToast');
        this.load(orgId);
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.orgApi.listDepartments(orgId).subscribe({
      next: (departments) => {
        this.departments.set(departments);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
