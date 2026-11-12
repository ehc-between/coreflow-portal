import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  TranslocoService,
  TranslocoTestingModule,
  provideTranslocoTranspiler,
} from '@jsverse/transloco';
import {
  TerminologyStore,
  TerminologyTranspiler,
  buildTermParams,
  pluralParamName,
} from './terminology-transpiler';

const en = {
  terms: {
    deviation: { one: 'deviation', other: 'deviations' },
    process: { one: 'process', other: 'processes' },
  },
  line: 'Open {{ term.deviations }}: {{ count }}',
  title: '{{ term.Deviation }} register',
  plain: 'No params here',
  override: 'Hello {{ term.deviation }}',
};
const nb = {
  terms: {
    deviation: { one: 'avvik', other: 'avvik' },
    process: { one: 'prosess', other: 'prosesser' },
  },
  line: 'Åpne {{ term.deviations }}: {{ count }}',
  title: '{{ term.Deviation }}register',
  plain: 'Ingen parametre',
  override: 'Hei {{ term.deviation }}',
};

describe('pluralParamName', () => {
  it('adds s, or es after a sibilant', () => {
    expect(pluralParamName('deviation')).toBe('deviations');
    expect(pluralParamName('process')).toBe('processes');
    expect(pluralParamName('employee')).toBe('employees');
  });
});

describe('buildTermParams', () => {
  const translation = {
    'terms.deviation.one': 'deviation',
    'terms.deviation.other': 'deviations',
  };

  it('uses the defaults and capitalised variants', () => {
    expect(buildTermParams(['deviation', 'risk'], {}, translation, 'en')).toEqual({
      deviation: 'deviation',
      Deviation: 'Deviation',
      deviations: 'deviations',
      Deviations: 'Deviations',
    });
  });

  it('prefers the override for the language', () => {
    const terms = buildTermParams(
      ['deviation'],
      { deviation: { en: { one: 'nonconformity', other: 'nonconformities' } } },
      translation,
      'en',
    );
    expect(terms['deviation']).toBe('nonconformity');
    expect(terms['Deviations']).toBe('Nonconformities');
    // Another language without an override keeps the defaults.
    expect(
      buildTermParams(
        ['deviation'],
        { deviation: { nb: { one: 'x', other: 'y' } } },
        translation,
        'en',
      )['deviation'],
    ).toBe('deviation');
  });
});

describe('TerminologyTranspiler', () => {
  let transloco: TranslocoService;
  let store: TerminologyStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en, nb },
          translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslocoTranspiler(TerminologyTranspiler),
      ],
    });
    transloco = TestBed.inject(TranslocoService);
    store = TestBed.inject(TerminologyStore);
    store.set({}, ['deviation', 'process']);
  });

  it('injects the default terms into every translation', () => {
    expect(transloco.translate('line', { count: 3 })).toBe('Open deviations: 3');
    expect(transloco.translate('title')).toBe('Deviation register');
    expect(transloco.translate('plain')).toBe('No params here');
  });

  it('applies org overrides and follows the active language', () => {
    store.set({
      deviation: {
        en: { one: 'nonconformity', other: 'nonconformities' },
        nb: { one: 'uoverensstemmelse', other: 'uoverensstemmelser' },
      },
    });
    expect(transloco.translate('line', { count: 1 })).toBe('Open nonconformities: 1');
    transloco.setActiveLang('nb');
    expect(transloco.translate('title')).toBe('Uoverensstemmelseregister');
  });

  it('lets explicit params win over term', () => {
    expect(transloco.translate('override', { term: { deviation: 'explicit' } })).toBe(
      'Hello explicit',
    );
  });
});
