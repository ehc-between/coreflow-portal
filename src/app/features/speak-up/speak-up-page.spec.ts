import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { AttachmentsApi } from '../../core/attachments/attachments-api';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RegistrerApi } from '../../shared/registrer/registrer-api';
import { SpeakUpApi } from './data/speak-up.api';
import { Proposal } from './data/speak-up.models';
import { SpeakUpPage } from './speak-up-page';

const TYPES = [
  'deviation',
  'near_miss',
  'data_breach',
  'security_incident',
  'complaint',
  'improvement',
];

const PROPOSAL: Proposal = {
  type: 'data_breach',
  kind: null,
  title: 'Tapt PC på toget',
  description: 'Kari glemte PC-en.',
  severity: 'high',
  affected: [{ entity_type: 'customer', id: 'c1', label: 'Nordic Steel' }],
  owner: { user_id: 'u-sofie', name: 'Sofie Johansen', reason: 'personvernansvarlig' },
  due_at: '2030-11-25T14:10:00',
  deadline: { key: 'gdpr72h', params: {}, at: '2030-11-25T14:10:00' },
  immediate_actions: 'PC-en er sperret.',
  requirement_refs: ['GDPR art. 33'],
  rationale: 'Kundedata på en tapt PC.',
};

async function setup(opts: { propose?: 'ok' | 'off'; available?: string[] } = {}) {
  const available = new Set(opts.available ?? TYPES);
  const api = {
    propose: vi.fn(() =>
      opts.propose === 'off'
        ? throwError(() => new HttpErrorResponse({ status: 503 }))
        : of(PROPOSAL),
    ),
    create: vi.fn(() =>
      of({
        entity_type: 'data_breach',
        id: 'b1',
        code: 'BR-0007',
        url: '/privacy/breaches/b1',
        owner_name: 'Sofie Johansen',
        next_steps: [
          {
            key: 'assessAuthority',
            params: { owner: 'Sofie', deadline: '2030-11-25T14:10:00' },
            url: null,
          },
          { key: 'breachLearn', params: {}, url: null },
        ],
      }),
    ),
    cases: vi.fn(() =>
      of({ items: [], counts: { open: 5, mine: 2, closed: 31 }, total: 0, intake_open: null }),
    ),
  };
  const registrer = {
    listTypes: vi.fn(() =>
      of({
        items: TYPES.map((key) => ({
          key,
          available: available.has(key),
          entity_type: key === 'data_breach' ? 'data_breach' : 'deviation',
        })),
      }),
    ),
    listPeople: vi.fn(() => of({ users: [{ id: 'u-erik', name: 'Erik' }] })),
  };
  const attachments = { upload: vi.fn() };
  TestBed.configureTestingModule({
    imports: [SpeakUpPage, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SpeakUpApi, useValue: api },
      { provide: RegistrerApi, useValue: registrer },
      { provide: AttachmentsApi, useValue: attachments },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org1'), currentOrg: signal({ permissions: [] }) },
      },
      {
        provide: AuthService,
        useValue: { user: signal({ id: 'me', full_name: 'Kari Nordmann', email: 'k@x' }) },
      },
      { provide: LanguageService, useValue: { active: signal('nb'), locale: signal('nb') } },
    ],
  });
  const fixture = TestBed.createComponent(SpeakUpPage);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, api };
}

function q<T extends HTMLElement>(root: HTMLElement, id: string): T {
  return root.querySelector<T>(`[data-testid="${id}"]`)!;
}

async function proposeFrom(root: HTMLElement, fixture: { whenStable(): Promise<unknown> }) {
  const text = q<HTMLTextAreaElement>(root, 'meld-text');
  text.value = 'Kari glemte jobb-PC-en på toget.';
  text.dispatchEvent(new Event('input'));
  q(root, 'make-proposal').querySelector('button')!.click();
  await fixture.whenStable();
}

describe('SpeakUpPage', () => {
  it('shows only the types the caller may file and the open case count', async () => {
    const { root } = await setup({ available: ['deviation', 'improvement'] });
    expect(q(root, 'chip-deviation')).toBeTruthy();
    expect(q(root, 'chip-improvement')).toBeTruthy();
    expect(q(root, 'chip-data_breach')).toBeNull();
    expect(q(root, 'see-cases').textContent).toContain('speakup.meld.seeCases');
    expect(q(root, 'step-1').getAttribute('aria-current')).toBe('step');
  });

  it('asks for some words before proposing', async () => {
    const { root, fixture, api } = await setup();
    q(root, 'make-proposal').querySelector('button')!.click();
    await fixture.whenStable();
    expect(api.propose).not.toHaveBeenCalled();
    expect(root.textContent).toContain('speakup.meld.textRequired');
  });

  it('proposes, lets the user check it and files it', async () => {
    const { root, fixture, api } = await setup();
    q(root, 'chip-data_breach').click();
    await proposeFrom(root, fixture);
    expect(api.propose).toHaveBeenCalledWith('org1', {
      text: 'Kari glemte jobb-PC-en på toget.',
      type_hint: 'data_breach',
      lang: 'nb',
    });
    expect(q(root, 'ai-note')).toBeTruthy();
    expect(q<HTMLInputElement>(root, 'f-title').value).toBe('Tapt PC på toget');
    expect(q<HTMLSelectElement>(root, 'f-owner').value).toBe('u-sofie');
    expect(q(root, 'affected').textContent).toContain('Nordic Steel');
    expect(q(root, 'f-due').textContent).toContain('speakup.meld.deadline.gdpr72h');

    q(root, 'submit').querySelector('button')!.click();
    await fixture.whenStable();
    expect(api.create).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({
        type: 'data_breach',
        title: 'Tapt PC på toget',
        owner_user_id: 'u-sofie',
        due_at: null,
        affected: [{ entity_type: 'customer', id: 'c1' }],
        immediate_actions: 'PC-en er sperret.',
      }),
    );
    expect(q(root, 'done')).toBeTruthy();
    expect(root.querySelectorAll('[data-testid="done"] li').length).toBe(2);
    expect(q(root, 'open-case').getAttribute('href')).toBe('/privacy/breaches/b1');

    q(root, 'again').querySelector('button')!.click();
    await fixture.whenStable();
    expect(q(root, 'step-1').getAttribute('aria-current')).toBe('step');
  });

  it('falls back to empty fields when suggestions are off', async () => {
    const { root, fixture } = await setup({ propose: 'off' });
    q(root, 'chip-improvement').click();
    await proposeFrom(root, fixture);
    expect(q(root, 'manual-note')).toBeTruthy();
    expect(q(root, 'ai-note')).toBeNull();
    expect(q<HTMLSelectElement>(root, 'f-type').value).toBe('improvement');
    expect(q<HTMLSelectElement>(root, 'f-owner').value).toBe('me');
  });
});
