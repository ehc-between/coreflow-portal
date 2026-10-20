import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  AdminUser,
  CreateInvitationRequest,
  CreateOrgRequest,
  CreatedInvitation,
  CreatedOrg,
  Invitation,
  OrgDetail,
  OrgSummary,
} from './admin.models';

/**
 * Super-admin API for managing organisations, members and invitations. Goes
 * through ApiService, so requests carry the in-memory bearer token (attached by
 * the auth interceptor) and the configured base URL.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiService);

  createOrg(body: CreateOrgRequest): Observable<CreatedOrg> {
    return this.api.post<CreatedOrg>('v1/admin/organizations', body);
  }

  listOrgs(): Observable<OrgSummary[]> {
    return this.api.get<OrgSummary[]>('v1/admin/organizations');
  }

  getOrg(orgId: string): Observable<OrgDetail> {
    return this.api.get<OrgDetail>(`v1/admin/organizations/${orgId}`);
  }

  createInvitation(orgId: string, body: CreateInvitationRequest): Observable<CreatedInvitation> {
    return this.api.post<CreatedInvitation>(`v1/admin/organizations/${orgId}/invitations`, body);
  }

  listInvitations(orgId: string): Observable<Invitation[]> {
    return this.api.get<Invitation[]>(`v1/admin/organizations/${orgId}/invitations`);
  }

  revokeInvitation(invitationId: string): Observable<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(`v1/admin/invitations/${invitationId}/revoke`, null);
  }

  /** Globally disable an account (all orgs) and revoke its sessions. Superuser only. */
  deactivateUser(userId: string): Observable<AdminUser> {
    return this.api.post<AdminUser>(`v1/admin/users/${userId}/deactivate`, null, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Re-enable a deactivated account. Superuser only. */
  reactivateUser(userId: string): Observable<AdminUser> {
    return this.api.post<AdminUser>(`v1/admin/users/${userId}/reactivate`, null, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
