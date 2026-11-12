import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../i18n/language.service';
import { AiAssistApi } from './ai-assist-api';
import { SseClient } from './sse-client';

describe('AiAssistApi', () => {
  function setup() {
    const sse = { post: vi.fn(() => ({ cancel: vi.fn() })) };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SseClient, useValue: sse },
        { provide: LanguageService, useValue: { active: signal('nb') } },
      ],
    });
    return { api: TestBed.inject(AiAssistApi), sse };
  }

  it('posts to the org-scoped assist path with the UI language', () => {
    const { api, sse } = setup();
    const onEvent = vi.fn();
    api.run('o1', 'risk.suggest_controls', { input: { a: 1 } }, onEvent);
    expect(sse.post).toHaveBeenCalledWith(
      'v1/orgs/o1/ai/assist/risk.suggest_controls',
      { input: { a: 1 }, lang: 'nb' },
      onEvent,
    );
  });

  it('keeps an explicit language', () => {
    const { api, sse } = setup();
    api.run('o1', 'k', { input: {}, lang: 'en' }, vi.fn());
    expect(sse.post).toHaveBeenCalledWith(
      'v1/orgs/o1/ai/assist/k',
      { input: {}, lang: 'en' },
      expect.any(Function),
    );
  });
});
