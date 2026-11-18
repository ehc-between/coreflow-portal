import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  BulkInvitationRequest,
  BulkInvitationResponse,
  CreateOrgInvitationRequest,
  CreatedOrgInvitation,
  OrgInvitation,
  OrgMember,
  OrgMemberDetail,
  OrgRole,
  RoleMatrix,
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

  /** A26: replace the member's roles with one or more roles (1..10; union of permissions). */
  setMemberRoles(
    orgId: string,
    userId: string,
    roleKeys: readonly string[],
  ): Observable<OrgMemberDetail> {
    return this.api.patch<OrgMemberDetail>(
      `v1/orgs/${orgId}/members/${userId}`,
      { role_keys: roleKeys },
      skipToast(),
    );
  }

  /** A26: read-only role → permission matrix (users:invite, org:manage or audit:read). */
  roleMatrix(orgId: string): Observable<RoleMatrix> {
    return this.api.get<RoleMatrix>(`v1/orgs/${orgId}/roles/matrix`);
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

  /** A26: invite up to 50 addresses with one role; already invited / members are skipped. */
  bulkInvite(orgId: string, body: BulkInvitationRequest): Observable<BulkInvitationResponse> {
    return this.api.post<BulkInvitationResponse>(
      `v1/orgs/${orgId}/invitations/bulk`,
      body,
      skipToast(),
    );
  }

  revokeInvitation(orgId: string, invitationId: string): Observable<{ ok: boolean }> {
    return this.api.post<{ ok: boolean }>(
      `v1/orgs/${orgId}/invitations/${invitationId}/revoke`,
      null,
      skipToast(),
    );
  }
}
