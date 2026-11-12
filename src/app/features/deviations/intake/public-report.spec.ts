import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { PublicIntakeApi } from '../../../core/deviations/intake-api';
import { APP_CONFIG } from '../../../core/config/app-config';
import { PublicReportPage } from './public-report';

async function setup(
  info: unknown = {
    org_name: 'Acme',
    mode: 'whistleblowing',
    instructions: 'Be kind',
    allow_contact: false,
  },
) {
  const api = {
    get: vi.fn(() =>
      info
        ? of(info)
        : throwError(
            () =>
              new HttpErrorResponse({
                status: 404,
                error: { detail: { code: 'intake_not_found' } },
              }),
          ),
    ),
    submit: vi.fn(() =>
      of({
        receipt_code: 'ABCD-EFGH-IJKL-MNOP',
        status: 'new',
        received_at: '2026-11-12T08:00:00',
      }),
    ),
    status: vi.fn(() =>
      of({
        status: 'triaged',
        received_at: '2026-11-12T08:00:00',
        updated_at: '2026-11-12T09:00:00',
        public_note: 'We are on it',
      }),
    ),
  };
  TestBed.configureTestingModule({
    imports: [PublicReportPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      { provide: PublicIntakeApi, useValue: api },
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: 'http://test/api', i18n: { availableLanguages: ['en'] } },
      },
    ],
  });
  const fixture = TestBed.createComponent(PublicReportPage);
  fixture.componentRef.setInput('token', 'tok');
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api };
}

function type(root: HTMLElement, selector: string, value: string): void {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

describe('PublicReportPage', () => {
  it('shows the organisation, its instructions and no contact field when not allowed', async () => {
    const { root } = await setup();
    expect(root.textContent).toContain('deviations.publicReport.title.whistleblowing');
    expect(root.textContent).toContain('Be kind');
    expect(root.querySelector('#pr-contact')).toBeNull();
  });

  it('validates locally, then submits and shows the receipt code', async () => {
    const { fixture, root, api } = await setup();
    const form = root.querySelector<HTMLFormElement>('[data-testid="public-report-form"]')!;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(api.submit).not.toHaveBeenCalled();
    expect(root.textContent).toContain('deviations.publicReport.errors.invalid');

    type(root, '#pr-title', 'Leak');
    type(root, '#pr-description', 'Water on the floor in hall B');
    await fixture.whenStable();
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(api.submit).toHaveBeenCalledWith('tok', {
      title: 'Leak',
      description: 'Water on the floor in hall B',
      occurred_on: null,
      location: null,
      contact: null,
      website: '',
    });
    expect(root.querySelector('[data-testid="receipt-code"]')?.textContent).toContain(
      'ABCD-EFGH-IJKL-MNOP',
    );
  });

  it('checks the status of a receipt code', async () => {
    const { fixture, root, api } = await setup();
    type(root, '#pr-receipt', 'abcdefghijklmnop');
    await fixture.whenStable();
    root
      .querySelector<HTMLFormElement>('[data-testid="status-form"]')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(api.status).toHaveBeenCalledWith('tok', 'ABCD-EFGH-IJKL-MNOP');
    expect(root.querySelector('[data-testid="report-status"]')?.textContent).toContain(
      'We are on it',
    );
  });

  it('says the link is unavailable when it is off or unknown', async () => {
    const { root } = await setup(null);
    expect(root.querySelector('[data-testid="intake-unavailable"]')).toBeTruthy();
  });
});
