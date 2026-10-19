import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { OrgInvitation, OrgRole } from '../../../core/org/org.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OrgInvitations, isInvitationExpired } from './org-invitations';

const BASE = 'http://test/api';
const ORG = 'org-1';

const ROLES: OrgRole[] = [
  { key: 'admin', name: 'Administrator', permissions: [], grantable: false },
  { key: 'auditor', name: 'Auditor', permissions: [], grantable: true },
  { key: 'member', name: 'Member', permissions: [], grantable: true },
];

const PENDING: OrgInvitation = {
  id: 'i-1',
  email: 'old@x.no',
  role_key: 'member',
  status: 'pending',
  created_at: '2026-10-01T00:00:00Z',
  expires_at: '2020-10-08T00:00:00Z',
};

interface InvitationsInternals {
  form: { setValue(v: { email: string; role_key: string }): void; getRawValue(): unknown };
  invite(): void;
  askRevoke(i: OrgInvitation): void;
  confirmRevoke(): void;
  inviteErrorKey(): string | null;
  invitations(): readonly OrgInvitation[];
  acceptUrl(i: OrgInvitation): string | null;
}

function setup(): {
  fixture: ComponentFixture<OrgInvitations>;
  http: HttpTestingController;
  cmp: InvitationsInternals;
} {
  TestBed.configureTestingModule({
    imports: [OrgInvitations, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal(ORG).asReadonly(), currentOrg: signal(null).asReadonly() },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrgInvitations);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${BASE}/v1/orgs/${ORG}/roles`).flush(ROLES);
  http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations`).flush([PENDING]);
  fixture.detectChanges();
  return { fixture, http, cmp: fixture.componentInstance as unknown as InvitationsInternals };
}

describe('isInvitationExpired', () => {
  it('marks invitations past expires_at as expired', () => {
    const now = Date.parse('2026-10-10T00:00:00Z');
    expect(isInvitationExpired({ expires_at: '2026-10-08T00:00:00Z' }, now)).toBe(true);
    expect(isInvitationExpired({ expires_at: '2026-10-12T00:00:00Z' }, now)).toBe(false);
    expect(isInvitationExpired({ expires_at: 'garbage' }, now)).toBe(false);
  });
});

describe('OrgInvitations', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('offers only grantable roles and defaults to member', () => {
    const { fixture, cmp } = setup();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '#org-invite-role',
    )!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['auditor', 'member']);
    expect(cmp.form.getRawValue()).toEqual({ email: '', role_key: 'member' });
  });

  it('does not send an invite with a non-grantable role', () => {
    const { http, cmp } = setup();
    cmp.form.setValue({ email: 'new@x.no', role_key: 'admin' });
    cmp.invite();
    http.expectNone(`${BASE}/v1/orgs/${ORG}/invitations`);
    expect(cmp.inviteErrorKey()).toBe('settings.errors.escalation');
  });

  it('creates an invite, remembers its accept link and reloads the list', () => {
    const { http, cmp } = setup();
    cmp.form.setValue({ email: 'new@x.no', role_key: 'auditor' });
    cmp.invite();
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === `${BASE}/v1/orgs/${ORG}/invitations`,
    );
    expect(req.request.body).toEqual({ email: 'new@x.no', role_key: 'auditor' });
    req.flush({
      id: 'i-2',
      email: 'new@x.no',
      role_key: 'auditor',
      expires_at: '2026-10-26T00:00:00Z',
      accept_url: 'http://app/invite/accept?token=t',
    });
    const created = { ...PENDING, id: 'i-2', email: 'new@x.no', role_key: 'auditor' };
    http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations`).flush([PENDING, created]);

    expect(cmp.acceptUrl(created)).toBe('http://app/invite/accept?token=t');
    expect(cmp.acceptUrl(PENDING)).toBeNull();
  });

  it('maps a 409 pending-invite conflict to a translated message', () => {
    const { http, cmp } = setup();
    cmp.form.setValue({ email: 'old@x.no', role_key: 'member' });
    cmp.invite();
    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        { detail: 'A pending invitation already exists for this email' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(cmp.inviteErrorKey()).toBe('settings.errors.invitePending');
  });

  it('shows an expired badge in the pending list', () => {
    const { fixture } = setup();
    // PENDING expired in 2020.
    const cell = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-invitation-id="i-1"]',
    )!;
    expect(cell.textContent).toContain('settings.invitations.expired');
  });

  it('revokes only after confirmation', () => {
    const { http, cmp } = setup();
    cmp.askRevoke(PENDING);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/invitations/i-1/revoke`);
    cmp.confirmRevoke();
    http.expectOne(`${BASE}/v1/orgs/${ORG}/invitations/i-1/revoke`).flush({ ok: true });
    expect(cmp.invitations()).toEqual([]);
  });
});
