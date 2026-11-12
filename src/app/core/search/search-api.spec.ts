import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { LanguageService } from '../i18n/language.service';
import { entityTypeLabel } from './entity-label';
import { internalLink } from './internal-link';
import { SearchApi } from './search-api';
import { SearchResponse } from './search.models';

describe('SearchApi', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api' } },
        { provide: LanguageService, useValue: { active: signal('nb') } },
      ],
    });
    return { api: TestBed.inject(SearchApi), http: TestBed.inject(HttpTestingController) };
  }

  it('sends q, types, limit and the UI language, quietly', () => {
    const { api, http } = setup();
    let response: SearchResponse | undefined;
    api
      .search('o1', '  kalib  ', { types: ['document', 'deviation'], limit: 80 })
      .subscribe((r) => (response = r));

    const req = http.expectOne((r) => r.url === 'http://api/v1/orgs/o1/search');
    expect(req.request.params.get('q')).toBe('kalib');
    expect(req.request.params.get('types')).toBe('document,deviation');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('lang')).toBe('nb');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ items: [], counts: {} });
    expect(response).toEqual({ items: [], counts: {} });
    http.verify();
  });

  it('never sends a blank query', () => {
    const { api, http } = setup();
    let response: SearchResponse | undefined;
    api.search('o1', '   ').subscribe((r) => (response = r));
    http.expectNone(() => true);
    expect(response).toEqual({ items: [], counts: {} });
  });
});

describe('internalLink', () => {
  it('splits a path and its query', () => {
    expect(internalLink('/standards/iso9001?req=iso9001%3A6.1')).toEqual({
      path: '/standards/iso9001',
      queryParams: { req: 'iso9001:6.1' },
    });
    expect(internalLink('/documents/abc')).toEqual({ path: '/documents/abc', queryParams: null });
  });

  it('rejects anything that is not an in-app path', () => {
    expect(internalLink('https://evil.example')).toBeNull();
    expect(internalLink('//evil.example/x')).toBeNull();
    expect(internalLink('javascript:alert(1)')).toBeNull();
    expect(internalLink(null)).toBeNull();
  });
});

describe('entityTypeLabel', () => {
  const dict: Record<string, string> = {
    'modules.entities.risk': 'Risks',
    'search.types.document': 'Documents',
    'search.types.other': 'Records',
  };
  const translate = (key: string) => dict[key] ?? key;

  it('prefers the registered label key, then the built-in label, then the generic one', () => {
    expect(entityTypeLabel(translate, 'modules.entities.risk', 'risk')).toBe('Risks');
    expect(entityTypeLabel(translate, 'modules.entities.document', 'document')).toBe('Documents');
    expect(entityTypeLabel(translate, 'modules.entities.audit_plan', 'audit_plan')).toBe('Records');
  });
});
