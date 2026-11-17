import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AttachmentDeletion } from '../../../core/attachments/attachment.models';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AttachmentDeletions } from './attachment-deletions';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/attachment-deletions`;

function row(overrides: Partial<AttachmentDeletion> = {}): AttachmentDeletion {
  return {
    id: 'del-1',
    attachment_id: 'att-1',
    entity_type: 'recruitment_application',
    entity_id: 'app-1234567890abcdef',
    object_key_sha256: 'a'.repeat(64),
    versions_deleted: 3,
    reason: 'erasure',
    actor_user_id: null,
    deleted_at: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

async function setup() {
  TestBed.configureTestingModule({
    imports: [AttachmentDeletions, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal(ORG).asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(AttachmentDeletions);
  await fixture.whenStable();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, root: fixture.nativeElement as HTMLElement };
}

describe('AttachmentDeletions', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists permanent deletions with reason, versions and a shortened key hash', async () => {
    const { fixture, http, root } = await setup();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('offset')).toBe('0');
    req.flush({ items: [row(), row({ id: 'del-2', reason: 'quarantine' })], total: 2 });
    await fixture.whenStable();

    const rows = root.querySelectorAll('[data-testid="deletion-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('settings.attachmentDeletions.reasons.erasure');
    expect(rows[0].textContent).toContain('3');
    expect(rows[0].textContent).toContain('aaaaaaaaaaaa…');
    expect(rows[0].textContent).not.toContain('a'.repeat(13));
    expect(rows[0].textContent).toContain('settings.attachmentDeletions.system');
    expect(rows[1].textContent).toContain('settings.attachmentDeletions.reasons.quarantine');
  });

  it('shows the empty state', async () => {
    const { fixture, http, root } = await setup();
    http.expectOne((r) => r.url === URL).flush({ items: [], total: 0 });
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="deletions-empty"]')).not.toBeNull();
  });

  it('reports a load failure (e.g. 403 without audit:read)', async () => {
    const { fixture, http, root } = await setup();
    http.expectOne((r) => r.url === URL).flush(null, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'settings.attachmentDeletions.loadError',
    );
  });
});
