import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { OrgMembersApi } from './org-members-api';

const BASE = 'http://test/api';
const ORG = 'org-1';

describe('OrgMembersApi', () => {
  let api: OrgMembersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(OrgMembersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the role catalogue', () => {
    let result: unknown;
    api.listRoles(ORG).subscribe((roles) => (result = roles));
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/roles`);
    expect(req.request.method).toBe('GET');
    const roles = [{ key: 'member', name: 'Member', permissions: [], grantable: true }];
    req.flush(roles);
    expect(result).toEqual(roles);
  });

  it('lists members', () => {
    api.listMembers(ORG).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('changes a member role with PATCH {role_key} and skips the generic toast', () => {
    api.changeMemberRole(ORG, 'u-1', 'auditor').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role_key: 'auditor' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({
      user_id: 'u-1',
      email: 'a@x.no',
      full_name: 'A',
      is_active: true,
      roles: ['auditor'],
    });
  });

  it('removes a member with DELETE', () => {
    api.removeMember(ORG, 'u-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/members/u-1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('lists pending invitations', () => {
    api.listInvitations(ORG).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates an invitation', () => {
    api.createInvitation(ORG, { email: 'b@x.no', role_key: 'member' }).subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'b@x.no', role_key: 'member' });
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ id: 'i-1', email: 'b@x.no', role_key: 'member', expires_at: '', accept_url: 'u' });
  });

  it('revokes an invitation within the org', () => {
    api.revokeInvitation(ORG, 'i-1').subscribe();
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations/i-1/revoke`);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ ok: true });
  });
});
