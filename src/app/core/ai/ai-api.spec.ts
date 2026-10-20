import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../i18n/language.service';
import { AiApi } from './ai-api';
import { AskEvent, ConversationTurn } from './ai.models';
import { SseClient } from './sse-client';

describe('AiApi', () => {
  function setup(lang: string) {
    const handle = { cancel: vi.fn() };
    const sse = { post: vi.fn(() => handle) };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SseClient, useValue: sse },
        { provide: LanguageService, useValue: { active: signal(lang) } },
      ],
    });
    return { api: TestBed.inject(AiApi), sse, handle };
  }

  it('posts the conversation, org and active UI language to /v1/ai/ask', () => {
    const { api, sse, handle } = setup('nb');
    const messages: ConversationTurn[] = [{ role: 'user', content: 'Lag en avvikstype' }];
    const onEvent = (event: AskEvent) => event;

    const stream = api.ask(messages, 'org1', onEvent);

    expect(sse.post).toHaveBeenCalledWith(
      'v1/ai/ask',
      { org_id: 'org1', messages, lang: 'nb' },
      onEvent,
    );
    expect(stream).toBe(handle);
  });

  it('sends English when the UI is in English', () => {
    const { api, sse } = setup('en');
    api.ask([], 'org1', () => undefined);
    expect(sse.post).toHaveBeenCalledWith(
      'v1/ai/ask',
      expect.objectContaining({ lang: 'en' }),
      expect.any(Function),
    );
  });
});
