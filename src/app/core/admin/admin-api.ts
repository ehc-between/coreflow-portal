import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import {
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
}
