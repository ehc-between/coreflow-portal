import { TestBed } from '@angular/core/testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { PrivacyNotice, PrivacyNotices } from './privacy-notices';

function notice(overrides: Partial<PrivacyNotice> = {}): PrivacyNotice {
  return {
    audience: 'customers',
    output_key: 'privacy.notice_customers',
    latest: {
      id: 'g-1',
      version: 1,
      status: 'final',
      has_gaps: false,
      lang: 'nb',
      generated_at: '2026-11-19T08:00:00',
    },
    document: null,
    document_output_id: null,
    source_changed: null,
    ropa: [{ id: 'r-1', code: 'ROPA-0001', title: 'Kunder', url: '/privacy/ropa/r-1' }],
    ...overrides,
  };
}

describe('PrivacyNotices (U14)', () => {
  function setup(permissions: readonly string[]) {
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const { http } = configureKit(PrivacyNotices, {
      permissions,
      providers: [{ provide: NotificationService, useValue: notify }],
    });
    const fixture = TestBed.createComponent(PrivacyNotices);
    return { http, fixture, notify, el: fixture.nativeElement as HTMLElement };
  }

  async function render(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
  }

  it('links the source activities and makes the notice a document', async () => {
    const { http, fixture, notify, el } = setup([
      'privacy:read',
      'privacy:write',
      'documents:draft',
    ]);
    await render(fixture);
    http.expectOne(kitUrl('privacy/notices')).flush({ items: [notice()] });
    await render(fixture);
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="notice-customers"] a');
    expect(link?.getAttribute('href')).toBe('/privacy/ropa/r-1');

    el.querySelector<HTMLElement>('[data-testid="notice-accept-customers"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/notices/customers/document'));
    expect(req.request.body).toEqual({ output_id: 'g-1' });
    req.flush({ document: { title: 'Personvernerklæring for kunder' } });
    await render(fixture);
    expect(notify.success).toHaveBeenCalled();
    http.expectOne(kitUrl('privacy/notices')).flush({
      items: [
        notice({
          document: {
            id: 'd-1',
            title: 'Personvernerklæring for kunder',
            doc_code: null,
            status: 'in_review',
            url: '/documents/d-1',
          },
          document_output_id: 'g-1',
          source_changed: true,
        }),
      ],
    });
    await render(fixture);
    expect(el.querySelector('[data-testid="notice-document"]')?.getAttribute('href')).toBe(
      '/documents/d-1',
    );
    expect(el.querySelector('[data-testid="notice-source-changed"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="notice-accept-customers"]')).toBeNull();
  });

  it('hides the approve action without permission to draft documents', async () => {
    const { http, fixture, el } = setup(['privacy:read', 'privacy:write']);
    await render(fixture);
    http.expectOne(kitUrl('privacy/notices')).flush({ items: [notice()] });
    await render(fixture);
    expect(el.querySelector('[data-testid="notice-accept-customers"]')).toBeNull();
  });
});
