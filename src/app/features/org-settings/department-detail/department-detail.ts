import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OrgApi } from '../../../core/org/org-api';
import { DepartmentDetail as DepartmentDetailModel, OrgMember } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Department detail, scoped to the currently selected org: member list, an
 * add-member control offering org members not yet in the department, and a
 * per-member remove action. If the user switches org, navigates back to the
 * settings list rather than showing a department that belongs to another org.
 */
@Component({
  selector: 'app-department-detail',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Card, FormField, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './department-detail.html',
})
export class DepartmentDetail {
  private readonly fb = inject(FormBuilder);
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param `deptId`, bound via withComponentInputBinding(). */
  readonly deptId = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly department = signal<DepartmentDetailModel | null>(null);
  protected readonly members = signal<readonly OrgMember[]>([]);
  protected readonly loading = signal(true);
  protected readonly adding = signal(false);

  /** Org members not already in this department, for the add-member select. */
  protected readonly addableMembers = computed<readonly OrgMember[]>(() => {
    const inDept = new Set(this.department()?.members.map((m) => m.user_id) ?? []);
    return this.members().filter((m) => !inDept.has(m.user_id));
  });

  protected readonly addForm = this.fb.nonNullable.group({
    user_id: ['', [Validators.required]],
  });

  private currentOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const deptId = this.deptId();
      // The org switcher changed the active org out from under this department.
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/settings');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.load(orgId, deptId);
      }
    });
  }

  protected add(): void {
    const orgId = this.orgId();
    if (!orgId || this.addForm.invalid || this.adding()) {
      this.addForm.markAllAsTouched();
      return;
    }

    this.adding.set(true);
    const userId = this.addForm.getRawValue().user_id;

    this.orgApi.addDepartmentMember(orgId, this.deptId(), userId).subscribe({
      next: () => {
        this.adding.set(false);
        this.addForm.reset({ user_id: '' });
        this.notifications.success('settings.member.addedToast');
        this.load(orgId, this.deptId());
      },
      error: (error: unknown) => {
        this.adding.set(false);
        // The add call suppresses the generic error toast, so surface a message
        // for every failure (400 not-a-member, 409 already-in, 404 dept gone, …)
        // and refresh so a stale option disappears.
        this.notifications.error('settings.member.addFailed');
        if (error instanceof HttpErrorResponse && error.status !== 404) {
          this.load(orgId, this.deptId());
        }
      },
    });
  }

  protected remove(member: { user_id: string }): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.orgApi.removeDepartmentMember(orgId, this.deptId(), member.user_id).subscribe({
      next: () => {
        this.notifications.success('settings.member.removedToast');
        this.load(orgId, this.deptId());
      },
    });
  }

  private load(orgId: string, deptId: string): void {
    this.loading.set(true);
    this.orgApi.getDepartment(orgId, deptId).subscribe({
      next: (department) => {
        this.department.set(department);
        this.loading.set(false);
      },
      error: () => {
        this.department.set(null);
        this.loading.set(false);
      },
    });
    this.orgApi.listMembers(orgId).subscribe({
      next: (members) => this.members.set(members),
    });
  }
}
