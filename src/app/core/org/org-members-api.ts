import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  CreateOrgInvitationRequest,
  CreatedOrgInvitation,
  OrgInvitation,
  OrgMember,
  OrgMemberDetail,
  OrgRole,
} from './org.models';

/** Suppresses the generic error toast so the caller can show a translated, specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Org-scoped user management: role catalogue, members (role change / removal) and
 * invitations. Goes through ApiService (base URL + bearer + error handling).
 *
 * Permissions (a platform super-admin is always allowed):
 *  - roles: `users:invite` or `org:manage`
 *  - invitations: `users:invite`
 *  - members: `org:manage`
 *
 * Mutations skip the generic error toast — callers map 400/403/404/409 to
 * translated messages (see `memberErrorKey`).
 */
@Injectable({ providedIn: 'root' })
export class OrgMembersApi {
  private readonly api = inject(ApiService);

  listRoles(orgId: string): Observable<OrgRole[]> {
    return this.api.get<OrgRole[]>(`v1/orgs/${orgId}/roles`);
  }

  listMembers(orgId: string): Observable<OrgMember[]> {
    return this.api.get<OrgMember[]>(`v1/orgs/${orgId}/members`);
  }

  changeMemberRole(orgId: string, userId: string, roleKey: string): Observable<OrgMemberDetail> {
    return this.api.patch<OrgMemberDetail>(
      `v1/orgs/${orgId}/members/${userId}`,
      { role_key: roleKey },
      skipToast(),
    );
  }

  removeMember(orgId: string, userId: string): Observable<void> {
    return this.api.delete<void>(`v1/orgs/${orgId}/members/${userId}`, skipToast());
  }

  listInvitations(orgId: string): Observable<OrgInvitation[]> {
    return this.api.get<OrgInvitation[]>(`v1/orgs/${orgId}/invitations`);
  }

  createInvitation(
    orgId: string,
    body: CreateOrgInvitationRequest,
  ): Observable<CreatedOrgInvitation> {
    return this.api.post<CreatedOrgInvitation>(`v1/orgs/${orgId}/invitations`, body, skipToast());
  }

  revokeInvitation(orgId: string, invitationId: string): Observable<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(
      `v1/orgs/${orgId}/invitations/${invitationId}/revoke`,
      null,
      skipToast(),
    );
  }
}
