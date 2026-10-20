import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../../core/config/app-config';
import { DeletedDocument } from '../../../core/documents/document.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DeletedDocuments } from './deleted-documents';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/documents/deleted`;

const item = (id: string, deletedAt: string, extra: Partial<DeletedDocument> = {}) => ({
  id,
  title: `Title ${id}`,
  doc_code: `QM-${id}`,
  deleted_at: deletedAt,
  deleted_by_name: 'Ada Admin',
  deleted_reason: 'Duplicate',
  ...extra,
});

async function setup() {
  TestBed.configureTestingModule({
    imports: [DeletedDocuments, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({
            id: ORG,
            name: 'Org',
            roles: [],
            permissions: ['org:manage'],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeletedDocuments);
  await fixture.whenStable();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController),
  };
}

describe('DeletedDocuments', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists deleted documents newest first, with who and why', async () => {
    const { fixture, root, http } = await setup();
    http
      .expectOne(URL)
      .flush([
        item('1', '2026-10-01T10:00:00Z'),
        item('2', '2026-10-15T10:00:00Z', { deleted_by_name: null, deleted_reason: null }),
      ]);
    await fixture.whenStable();

    const rows = Array.from(root.querySelectorAll('[data-testid="deleted-row"]'));
    expect(rows.map((r) => r.querySelector('.font-semibold')?.textContent?.trim())).toEqual([
      'Title 2',
      'Title 1',
    ]);
    expect(rows[0].textContent).toContain('settings.deletedDocuments.unknownUser');
    expect(rows[0].textContent).toContain('settings.deletedDocuments.noReason');
    expect(rows[1].textContent).toContain('QM-1');
    expect(rows[1].textContent).toContain('Ada Admin');
    expect(rows[1].textContent).toContain('Duplicate');
  });

  it('shows an empty state', async () => {
    const { fixture, root, http } = await setup();
    http.expectOne(URL).flush([]);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="deleted-empty"]')).not.toBeNull();
  });

  it('shows an error when the list fails to load', async () => {
    const { fixture, root, http } = await setup();
    http.expectOne(URL).flush(null, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'settings.deletedDocuments.loadError',
    );
  });
});
