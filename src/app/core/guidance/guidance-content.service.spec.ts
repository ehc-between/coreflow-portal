import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../i18n/language.service';
import { GuidanceContentService } from './guidance-content.service';
import { GuidanceFile } from './guidance.models';

const PLATFORM: GuidanceFile = {
  pages: { dashboard: { intro: { title: 'Hello', body: 'Body' } } },
  lessons: { intro: { title: 'Lesson', sections: [{ heading: 'H', body: 'B' }] } },
  tours: { main: [{ target: 'a', title: 'T', body: 'B' }] },
  glossary: { risk: { term: 'Platform risk', definition: 'Own definition' } },
};
const GLOSSARY: GuidanceFile = {
  glossary: {
    risk: { term: 'Risk', definition: 'Effect of uncertainty' },
    audit: { term: 'Audit', definition: 'A check' },
  },
};

function setup() {
  const lang = signal('en');
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LanguageService, useValue: { active: lang } },
    ],
  });
  return {
    service: TestBed.inject(GuidanceContentService),
    http: TestBed.inject(HttpTestingController),
    lang,
  };
}

/** Let the deferred (microtask) request start. */
const flushMicrotasks = () => Promise.resolve();

describe('GuidanceContentService', () => {
  it('loads a scope file once per language and serves its parts', async () => {
    const { service, http, lang } = setup();
    const page = computed(() => service.readPage('platform', 'dashboard'));
    expect(page()).toBeNull();
    expect(service.readLoaded('platform')).toBe(false);
    await flushMicrotasks();
    // A second read before the response does not issue another request.
    service.readFile('platform');
    await flushMicrotasks();
    http.expectOne('/assets/guidance/en/platform.json').flush(PLATFORM);

    expect(page()?.intro?.title).toBe('Hello');
    expect(service.readLesson('platform', 'intro')?.title).toBe('Lesson');
    expect(service.readTour('platform', 'main')).toHaveLength(1);
    expect(service.readTour('platform', 'missing')).toEqual([]);
    expect(service.page('platform', 'dashboard')()?.intro?.body).toBe('Body');

    lang.set('nb');
    expect(page()).toBeNull();
    await flushMicrotasks();
    http.expectOne('/assets/guidance/nb/platform.json').flush(PLATFORM);
    expect(page()?.intro?.title).toBe('Hello');
    http.verify();
  });

  it('resolves glossary terms from the scope first, then the shared glossary', async () => {
    const { service, http } = setup();
    service.readTerm('risk', 'platform');
    await flushMicrotasks();
    http.expectOne('/assets/guidance/en/platform.json').flush(PLATFORM);
    http.expectOne('/assets/guidance/en/glossary.json').flush(GLOSSARY);
    expect(service.readTerm('risk', 'platform')?.term).toBe('Platform risk');
    expect(service.readTerm('risk')?.term).toBe('Risk');
    expect(service.glossaryTerm('audit', 'platform')()?.definition).toBe('A check');
    expect(service.readTerm('unknown')).toBeNull();
  });

  it('treats a missing file as no content and waits for loads', async () => {
    const { service, http } = setup();
    const pending = service.whenLoaded('risk');
    http
      .expectOne('/assets/guidance/en/risk.json')
      .flush('missing', { status: 404, statusText: 'Not Found' });
    await expect(pending).resolves.toBeNull();
    expect(service.readLoaded('risk')).toBe(true);
    expect(service.readPage('risk', 'list')).toBeNull();
    await expect(service.whenLoaded('risk')).resolves.toBeNull();
    http.verify();
  });
});
