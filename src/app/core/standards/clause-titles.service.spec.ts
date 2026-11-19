import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { LanguageService } from '../i18n/language.service';
import { SelectedOrgService } from '../org/selected-org.service';
import {
  CLAUSE_TITLE_BATCH,
  ClauseTitlesService,
  canonicalClauseRef,
} from './clause-titles.service';
import { ClauseTitle } from './standards.models';

const API = 'http://api.test/api';
const URL = `${API}/v1/orgs/org-1/requirement-catalogue/titles`;

function title(ref: string, text: string, found = true): ClauseTitle {
  const [framework, number] = ref.split(':');
  return {
    clause_ref: ref,
    framework,
    number,
    short: framework === 'hs' ? 'Felles ISO-krav' : 'ISO 27001',
    title: found ? text : '',
    title_en: found ? text : '',
    title_nb: found ? text : '',
    found,
  };
}

function setup() {
  const lang = signal('nb');
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: API } },
      { provide: LanguageService, useValue: { active: lang, translate: (k: string) => k } },
      { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1') } },
    ],
  });
  return {
    service: TestBed.inject(ClauseTitlesService),
    http: TestBed.inject(HttpTestingController),
    lang,
  };
}

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('canonicalClauseRef', () => {
  it('drops the year, hyphens and the requirement suffix', () => {
    expect(canonicalClauseRef('hs:7.2')).toBe('hs:7.2');
    expect(canonicalClauseRef('iso27001-2022:A.6.3')).toBe('iso27001:A.6.3');
    expect(canonicalClauseRef('iso9001-2026:8.4.1.r1')).toBe('iso9001:8.4.1');
    expect(canonicalClauseRef('eu-ai-act:4')).toBe('eu_ai_act:4');
    expect(canonicalClauseRef('custom-ref')).toBeNull();
    expect(canonicalClauseRef('gdpr:')).toBeNull();
  });
});

describe('ClauseTitlesService (simplify U39)', () => {
  it('fetches queued refs in one request and serves the titles', async () => {
    const { service, http } = setup();
    expect(service.read('hs:7.2')).toBeNull();
    expect(service.read('iso27001-2022:A.6.3')).toBeNull();
    expect(service.read('hs:7.2')).toBeNull();
    await tick();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('refs')).toBe('hs:7.2,iso27001:A.6.3');
    expect(req.request.params.get('lang')).toBe('nb');
    req.flush([title('hs:7.2', 'Kompetanse'), title('iso27001:A.6.3', 'Bevissthet')]);
    expect(service.read('hs:7.2')?.title).toBe('Kompetanse');
    expect(service.read('iso27001:A.6.3')?.title).toBe('Bevissthet');
    await tick();
    http.verify();
  });

  it('answers null for unknown refs, failed requests and refs without a framework', async () => {
    const { service, http } = setup();
    service.read('hs:99');
    service.read('iso27001:A.1');
    expect(service.read('custom-ref')).toBeNull();
    await tick();
    http.expectOne((r) => r.url === URL).flush([title('hs:99', '', false)]);
    expect(service.read('hs:99')).toBeNull();
    // A ref the answer left out is not asked for again.
    expect(service.read('iso27001:A.1')).toBeNull();
    await tick();
    http.expectNone(() => true);

    service.read('gdpr:30');
    await tick();
    http.expectOne((r) => r.url === URL).flush('down', { status: 500, statusText: 'Error' });
    expect(service.read('gdpr:30')).toBeNull();
    await tick();
    http.verify();
  });

  it('asks again per language and splits large batches', async () => {
    const { service, http, lang } = setup();
    const refs = Array.from({ length: CLAUSE_TITLE_BATCH + 2 }, (_, i) => `iso27001:A.5.${i}`);
    refs.forEach((ref) => service.read(ref));
    await tick();
    const reqs = http.match((r) => r.url === URL);
    expect(reqs.map((r) => r.request.params.get('refs')!.split(',').length)).toEqual([
      CLAUSE_TITLE_BATCH,
      2,
    ]);
    reqs.forEach((r) => r.flush([]));
    lang.set('en');
    service.read('iso27001:A.5.0');
    await tick();
    http.expectOne((r) => r.url === URL).flush([]);
    http.verify();
  });
});
