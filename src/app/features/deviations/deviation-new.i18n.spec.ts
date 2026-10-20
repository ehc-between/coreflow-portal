import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, of, throwError } from 'rxjs';
import nb from '../../../assets/i18n/nb.json';
import { AuthService } from '../../core/auth/auth.service';
import { DeviationType } from '../../core/deviations/deviation.models';
import { DeviationsApi } from '../../core/deviations/deviations-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { DeviationNew } from './deviation-new';

/**
 * Renders /deviations/new in Norwegian with a realistic, Norwegian-authored type
 * (every field type, sections, help text, options) and asserts that none of the
 * portal's own text leaks English or raw i18n keys. Org data (the type) is
 * Norwegian here on purpose: the portal cannot translate it, so anything English
 * left on screen must come from the portal itself.
 */
const TYPE: DeviationType = {
  id: 't1',
  key: 'hms_hendelse',
  name: 'HMS-hendelse',
  description: 'Registrerer personskader, nestenulykker og farlige forhold.',
  standards: ['iso45001', 'gdpr'],
  code_prefix: 'HMS',
  is_active: true,
  schema: [
    {
      key: 'sted',
      label: 'Sted',
      type: 'text',
      required: true,
      width: 'half',
      placeholder: 'F.eks. lager 2',
      section: null,
    },
    { key: 'tidspunkt', label: 'Tidspunkt', type: 'date', required: true, width: 'half' },
    { key: 'antall', label: 'Antall involverte', type: 'number', required: false, width: 'half' },
    {
      key: 'skadetype',
      label: 'Skadetype',
      type: 'select',
      required: true,
      width: 'half',
      options: ['Kutt', 'Brudd', 'Forbrenning'],
      section: 'Skade',
    },
    {
      key: 'kroppsdel',
      label: 'Kroppsdel',
      type: 'multiselect',
      required: false,
      width: 'full',
      options: ['Hode', 'Arm', 'Bein'],
      section: 'Skade',
    },
    {
      key: 'fravaer',
      label: 'Fravær',
      type: 'checkbox',
      required: false,
      width: 'half',
      help: 'Kryss av hvis hendelsen førte til fravær.',
      section: 'Skade',
    },
    {
      key: 'meldt_av',
      label: 'Meldt av',
      type: 'user',
      required: true,
      width: 'half',
      section: 'Oppfølging',
    },
    {
      key: 'avdeling',
      label: 'Ansvarlig avdeling',
      type: 'department',
      required: false,
      width: 'half',
      section: 'Oppfølging',
    },
    {
      key: 'tiltak',
      label: 'Strakstiltak',
      type: 'textarea',
      required: false,
      width: 'full',
      section: 'Oppfølging',
    },
  ],
};

/**
 * English words that must never appear in the Norwegian UI. Chosen so none is
 * also a Norwegian word (e.g. "Status", "Type", "Person" are excluded).
 */
const ENGLISH_WORDS = [
  'add',
  'back',
  'cancel',
  'change',
  'choose',
  'clause',
  'create',
  'critical',
  'department',
  'description',
  'details',
  'due',
  'high',
  'loading',
  'low',
  'medium',
  'method',
  'none',
  'organization',
  'owner',
  'pick',
  'please',
  'remove',
  'required',
  'restricted',
  'root',
  'save',
  'select',
  'severity',
  'source',
  'submit',
  'tag',
  'tags',
  'the',
  'title',
  'unassigned',
  'yes',
  'no',
  'internal',
  'audit',
  'customer',
  'incident',
  'other',
  'invalid',
  'field',
  'value',
];

/**
 * Every piece of user-facing text: each non-empty text node plus the
 * user-facing attributes (placeholder, aria-label, title, alt), whitespace-collapsed.
 */
function visibleChunks(root: HTMLElement): string[] {
  const chunks: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    chunks.push(node.textContent ?? '');
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const name of ['placeholder', 'aria-label', 'title', 'alt']) {
      chunks.push(el.getAttribute(name) ?? '');
    }
  }
  return chunks.map((c) => c.replace(/\s+/g, ' ').trim()).filter((c) => c !== '');
}

/** The visible text snapshot, one chunk per line. */
function visibleText(root: HTMLElement): string {
  return visibleChunks(root).join('\n');
}

/** English words found in the chunks (whole words, case-insensitive). */
function englishWordsIn(chunks: readonly string[]): string[] {
  const words = new Set(
    chunks
      .join(' ')
      .toLowerCase()
      .match(/[a-zæøå]+/g) ?? [],
  );
  return ENGLISH_WORDS.filter((w) => words.has(w));
}

/** Chunks that are an unresolved Transloco key (`deviations.create.submit`). */
function rawKeysIn(chunks: readonly string[]): string[] {
  return chunks.filter((c) => /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(c));
}

async function setup(createError?: unknown): Promise<{
  fixture: ComponentFixture<DeviationNew>;
  root: HTMLElement;
  notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}> {
  const api = {
    listTypes: vi.fn(() => of([TYPE])),
    listAccessSubjects: vi.fn(() =>
      of({
        users: [{ id: 'u1', name: 'Kari Nordmann', email: 'kari@example.no' }],
        departments: [{ id: 'd1', name: 'Produksjon' }],
      }),
    ),
    createDeviation: vi.fn(() => (createError ? throwError(() => createError) : NEVER)),
  };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      DeviationNew,
      TranslocoTestingModule.forRoot({
        langs: { nb },
        translocoConfig: { availableLangs: ['nb'], defaultLang: 'nb' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'deviations', children: [] }]),
      { provide: DeviationsApi, useValue: api },
      { provide: NotificationService, useValue: notify },
      { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org1') } },
    ],
  });
  const fixture = TestBed.createComponent(DeviationNew);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, notify };
}

async function pickType(fixture: ComponentFixture<DeviationNew>, root: HTMLElement) {
  const card = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes(TYPE.name),
  );
  card!.click();
  await fixture.whenStable();
}

function expectNorwegianOnly(chunks: readonly string[]): void {
  expect(englishWordsIn(chunks)).toEqual([]);
  expect(rawKeysIn(chunks)).toEqual([]);
}

describe('DeviationNew (nb)', () => {
  it('shows the type picker in Norwegian', async () => {
    const { root } = await setup();
    const text = visibleText(root);
    expect(text).toContain('Velg en avvikstype for å starte.');
    expect(text).toContain('ISO 45001');
    expectNorwegianOnly(visibleChunks(root));
  });

  it('renders the whole form in Norwegian, including options and attributes', async () => {
    const { fixture, root } = await setup();
    await pickType(fixture, root);
    // Open a clause row and add a tag so the classification editor's row
    // controls (aria-labels, placeholders) are on screen too.
    Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Legg til punkt'))!
      .click();
    await fixture.whenStable();
    const tagInput = root.querySelector<HTMLInputElement>('#dev-tag')!;
    tagInput.value = 'lager';
    tagInput.dispatchEvent(new Event('input'));
    tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();

    const text = visibleText(root);
    for (const expected of [
      'Opprett avvik',
      'Alvorlighetsgrad',
      'Middels',
      'Intern',
      'Ikke tildelt',
      'Hele organisasjonen',
      'Rotårsaksmetode',
      'Fiskebeinsdiagram (Ishikawa)',
      'Velg…',
      'Fjern punkt',
      'Standard for punktet',
      'Punktnummer',
      'Fjern etikett',
      'Skade',
      'Oppfølging',
    ]) {
      expect(text).toContain(expected);
    }
    expectNorwegianOnly(visibleChunks(root));
  });

  it('shows validation messages in Norwegian', async () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        detail: {
          code: 'invalid_data',
          data: {
            sted: { code: 'required', message: 'This field is required' },
            tidspunkt: 'Must be an ISO date',
            skadetype: { code: 'something_new', message: 'Unknown problem' },
          },
        },
      },
    });
    const { fixture, root, notify } = await setup(error);
    await pickType(fixture, root);
    const form = root.querySelector('form')!;

    // Empty title → client-side message.
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(visibleText(root)).toContain('En tittel er påkrevd.');

    const title = root.querySelector<HTMLInputElement>('#dev-title')!;
    title.value = 'Kuttskade på lager';
    title.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const text = visibleText(root);
    expect(text).toContain('Dette feltet er påkrevd.');
    expect(text).toContain('Skriv inn en gyldig dato.');
    expect(text).toContain('Denne verdien er ikke gyldig.');
    expectNorwegianOnly(visibleChunks(root));
    expect(notify.error).toHaveBeenCalledWith('deviations.create.validationToast');
  });

  it('has no unresolved keys or English in any select option', async () => {
    const { fixture, root } = await setup();
    await pickType(fixture, root);
    const options = Array.from(root.querySelectorAll('option')).map((o) => o.textContent!.trim());
    expect(options.length).toBeGreaterThan(10);
    expect(options).not.toContain('');
    expectNorwegianOnly(options);
  });
});
