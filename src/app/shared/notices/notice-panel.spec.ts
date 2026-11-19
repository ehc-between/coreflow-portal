import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import rootEn from '../../../assets/i18n/en.json';
import en from '../../../assets/i18n/notices/en.json';
import nb from '../../../assets/i18n/notices/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { NoticeList, NoticePanel, noticeTone } from './notice-panel';

const BASE = 'http://test/api';
const ORG = 'org-1';
const URL = `${BASE}/v1/orgs/${ORG}/privacy/breaches/b1/notices`;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const LIST: NoticeList = {
  lang: 'en',
  stages: [
    {
      key: 'gdpr_33',
      output_key: 'privacy.breach_notice_authority',
      title: 'Notice of a personal data breach',
      recipient: 'Datatilsynet',
      article: 'gdpr:33',
      intro: 'Draft for the notice.',
      status: 'pending',
      due_at: '2026-11-20T10:00:00',
      sent_at: null,
      reference: null,
      missing: 1,
      sections: [
        {
          key: 'nature',
          label: 'What happened',
          hint: 'Art. 33(3)(a)',
          text: 'A laptop was lost.',
          required: true,
          missing: false,
        },
        {
          key: 'consequences',
          label: 'Likely consequences',
          hint: null,
          text: '',
          required: true,
          missing: true,
        },
      ],
      text: 'What happened\nA laptop was lost.',
    },
  ],
};

async function setup(canSave = true) {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: rootEn, 'notices/en': en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE, i18n: { availableLanguages: ['en'] } } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal(ORG).asReadonly() },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(NoticePanel);
  fixture.componentRef.setInput('path', 'privacy/breaches/b1/notices');
  fixture.componentRef.setInput('entityId', 'b1');
  fixture.componentRef.setInput('canSave', canSave);
  fixture.detectChanges();
  await tick();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('NoticePanel (U13 Varsling)', () => {
  it('keeps en and nb at key parity', () => {
    expectKeyParity(en, nb);
  });

  it('maps statuses to badge tones', () => {
    expect(noticeTone('sent')).toBe('done');
    expect(noticeTone('not_required')).toBe('not_applicable');
    expect(noticeTone('overdue')).toBe('overdue');
  });

  it('shows each stage with its deadline and opens the draft in one click', async () => {
    const { fixture, http, el } = await setup();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('lang')).toBe('en');
    req.flush(LIST);
    await fixture.whenStable();
    fixture.detectChanges();

    const stage = el.querySelector('[data-stage="gdpr_33"]') as HTMLElement;
    expect(stage.textContent).toContain('Notice of a personal data breach');
    expect(stage.textContent).toContain('Datatilsynet');
    expect(el.querySelector('[data-testid="notice-missing"]')?.textContent).toContain('1');
    expect(el.querySelector('[data-section]')).toBeNull();

    (el.querySelector('[data-testid="notice-toggle"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-section]').length).toBe(2);
    // Only filled-in sections can be copied; a missing one is flagged instead.
    expect(el.querySelectorAll('[data-testid="notice-copy"]').length).toBe(1);
    expect(el.querySelector('[data-section="consequences"]')?.textContent).toContain('Missing');
    expect(el.querySelector('[data-testid="notice-save"]')).not.toBeNull();
    http.verify();
  });

  it('copies one section to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { fixture, http, el } = await setup(false);
    http.expectOne((r) => r.url === URL).flush(LIST);
    await fixture.whenStable();
    fixture.detectChanges();
    (el.querySelector('[data-testid="notice-toggle"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-testid="notice-copy"] button') as HTMLButtonElement).click();
    expect(writeText).toHaveBeenCalledWith('A laptop was lost.');
    expect(el.querySelector('[data-testid="notice-save"]')).toBeNull();
  });

  it('renders nothing when the record has no notices', async () => {
    const { fixture, http, el } = await setup();
    http.expectOne((r) => r.url === URL).flush({ lang: 'en', stages: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="notice-panel"]')).toBeNull();
  });
});
