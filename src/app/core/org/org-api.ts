import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { DepartmentDetail, DepartmentSummary, OrgMember } from './org.models';

/** Suppresses the generic error toast so the caller can message in place. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Org-scoped settings API for departments and their members. Goes through
 * ApiService, so requests carry the in-memory bearer token (attached by the auth
 * interceptor) and the configured base URL. Every endpoint requires `org:manage`
 * in the target org; callers gate on that permission for the current org.
 */
@Injectable({ providedIn: 'root' })
export class OrgApi {
  private readonly api = inject(ApiService);

  listMembers(orgId: string): Observable<OrgMember[]> {
    return this.api.get<OrgMember[]>(`v1/orgs/${orgId}/members`);
  }

  listDepartments(orgId: string): Observable<DepartmentSummary[]> {
    return this.api.get<DepartmentSummary[]>(`v1/orgs/${orgId}/departments`);
  }

  createDepartment(orgId: string, name: string): Observable<DepartmentSummary> {
    return this.api.post<DepartmentSummary>(`v1/orgs/${orgId}/departments`, { name }, skipToast());
  }

  getDepartment(orgId: string, deptId: string): Observable<DepartmentDetail> {
    return this.api.get<DepartmentDetail>(`v1/orgs/${orgId}/departments/${deptId}`);
  }

  renameDepartment(orgId: string, deptId: string, name: string): Observable<DepartmentSummary> {
    return this.api.patch<DepartmentSummary>(
      `v1/orgs/${orgId}/departments/${deptId}`,
      { name },
      skipToast(),
    );
  }

  deleteDepartment(orgId: string, deptId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/departments/${deptId}`);
  }

  addDepartmentMember(orgId: string, deptId: string, userId: string): Observable<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(
      `v1/orgs/${orgId}/departments/${deptId}/members`,
      { user_id: userId },
      skipToast(),
    );
  }

  removeDepartmentMember(
    orgId: string,
    deptId: string,
    userId: string,
  ): Observable<{ ok: boolean }> {
    return this.api.delete<{ ok: boolean }>(
      `v1/orgs/${orgId}/departments/${deptId}/members/${userId}`,
    );
  }
}
