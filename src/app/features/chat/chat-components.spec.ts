import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import chatEn from '../../../assets/i18n/chat/en.json';
import chatNb from '../../../assets/i18n/chat/nb.json';
import shellEn from '../../../assets/i18n/shell/en.json';
import shellNb from '../../../assets/i18n/shell/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { AuthService } from '../../core/auth/auth.service';
import { ChatApi } from '../../core/chat/chat-api';
import { ChatStore } from '../../core/chat/chat-store';
import { FakeChatApi, KARI, ME, fakeConversation, fakeMessage } from '../../core/chat/chat.testing';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FakeSocketHub, provideFakeRealtime } from '../../core/realtime/realtime.testing';
import { snippetParts } from './chat-search';
import { chatMatcher } from './chat.routes';
import { Composer } from './composer';
import { MessageBody } from './message-body';
import { MessageItem } from './message-item';

const ORG = 'org-1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function configure(api = new FakeChatApi()) {
  const token = signal<string | null>('tok');
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, 'chat/en': chatEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test/api' } },
      {
        provide: AuthService,
        useValue: {
          accessToken: () => token(),
          isAuthenticated: computed(() => token() !== null),
          user: signal({ id: ME.id, email: 'me@x.no', full_name: ME.name }),
          refresh: () => of(true),
        },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({
            id: ORG,
            name: 'Org',
            roles: [],
            permissions: ['chat:use'],
          }).asReadonly(),
        },
      },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      { provide: ChatApi, useValue: api },
      ...provideFakeRealtime(new FakeSocketHub()),
    ],
  });
  return api;
}

describe('chat i18n', () => {
  it('keeps the chat scope at en/nb parity', () => expectKeyParity(chatEn, chatNb));

  it('has the global and shell keys of the design (§4.4)', () => {
    for (const dict of [en, nb]) {
      const modules = dict.modules as unknown as Record<string, Record<string, unknown>>;
      expect(typeof modules['names']['chat']).toBe('string');
      expect(typeof modules['descriptions']['chat']).toBe('string');
      expect(typeof modules['entities']['chat_conversation']).toBe('string');
      expect(typeof modules['entities']['chat_message']).toBe('string');
    }
    expect(shellEn.nav.chat).toBe('Messages');
    expect(shellNb.nav.chat).toBe('Meldinger');
    expect((nb.modules.names as Record<string, string>)['chat']).toBe('Meldinger');
  });

  it('has a title for every chat notification kind and no vendor names', () => {
    for (const key of ['mentioned', 'direct', 'added'] as const) {
      expect(chatEn.notifications[key]).toContain('{{sender_name}}');
      expect(chatNb.notifications[key]).toContain('{{sender_name}}');
    }
    const all = JSON.stringify([chatEn, chatNb]);
    expect(all).not.toMatch(/claude|anthropic|gpt|openai/i);
  });
});

describe('chat routes', () => {
  const seg = (path: string) => ({ path, parameters: {} }) as never;
  it('matches /chat, /chat/browse and /chat/:id with one route', () => {
    expect(chatMatcher([])).toEqual({ consumed: [] });
    expect(chatMatcher([seg('browse')])?.posParams?.['view']).toEqual(seg('browse'));
    expect(chatMatcher([seg('abc')])?.posParams?.['conversationId']).toEqual(seg('abc'));
    expect(chatMatcher([seg('a'), seg('b')])).toBeNull();
  });

  it('splits search snippets on <mark> without HTML', () => {
    expect(snippetParts('a <mark>b</mark> <b>c</b>')).toEqual([
      { text: 'a ', mark: false },
      { text: 'b', mark: true },
      { text: ' <b>c</b>', mark: false },
    ]);
  });
});

describe('MessageBody', () => {
  it('renders hostile input as text and tokens as pills, never as HTML', async () => {
    configure();
    const fixture = TestBed.createComponent(MessageBody);
    fixture.componentRef.setInput(
      'body',
      `<img src=x onerror="alert(1)"> [x](javascript:alert(1)) [@Kari](cf:user/${KARI.id}) #hms **fet**`,
    );
    fixture.componentRef.setInput('meId', ME.id);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('a[href^="javascript"]')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(el.textContent).toContain('@Kari');
    expect(el.querySelector('strong')?.textContent).toBe('fet');
    expect(el.querySelector('a[href="/chat?tag=hms"]')?.textContent?.trim()).toBe('#hms');
  });
});

describe('MessageItem', () => {
  it('shows edited and deleted states', async () => {
    configure();
    const fixture = TestBed.createComponent(MessageItem);
    fixture.componentRef.setInput(
      'message',
      fakeMessage({ body: 'Hei', edited_at: '2026-11-19T10:00:00' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('(edited)');
    fixture.componentRef.setInput(
      'message',
      fakeMessage({ body: '', deleted_at: '2026-11-19T10:00:00' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-tombstone"]'),
    ).not.toBeNull();
  });
});

describe('Composer', () => {
  async function render() {
    const api = configure();
    api.directoryEntries = [
      { type: 'user', id: KARI.id, name: KARI.name, detail: 'kari@x.no' },
      { type: 'team', id: '44444444-4444-4444-8444-444444444444', name: 'HMS', detail: '4' },
    ];
    api.tagList = [{ name: 'hms-runde', display: 'hms-runde', use_count: 3 }];
    const conv = fakeConversation();
    api.conversations = [conv];
    TestBed.inject(ChatStore);
    TestBed.tick();
    const fixture = TestBed.createComponent(Composer);
    fixture.componentRef.setInput('conversation', conv);
    fixture.componentRef.setInput('label', 'Test');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const textarea = el.querySelector('textarea')!;
    const type = async (value: string) => {
      textarea.value = value;
      textarea.setSelectionRange(value.length, value.length);
      textarea.dispatchEvent(new Event('input'));
      await sleep(160);
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const key = async (k: string) => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { api, conv, fixture, el, textarea, type, key };
  }

  it('offers @mentions as an ARIA combobox and sends them as tokens', async () => {
    const { api, el, textarea, type, key } = await render();
    expect(textarea.getAttribute('role')).toBe('combobox');
    await type('Hei @Ka');
    const options = el.querySelectorAll('[role="option"]');
    expect(options.length).toBe(1);
    expect(textarea.getAttribute('aria-expanded')).toBe('true');
    expect(textarea.getAttribute('aria-activedescendant')).toBe(options[0].id);
    await key('Enter');
    expect(textarea.value).toBe(`Hei @${KARI.name} `);
    await key('Enter');
    const sent = api.callsOf('send')[0].args[2] as { body: string };
    expect(sent.body).toBe(`Hei [@${KARI.name}](cf:user/${KARI.id})`);
  });

  it('autocompletes #tags', async () => {
    const { el, textarea, type, key } = await render();
    await type('Se #hm');
    expect(el.querySelectorAll('[role="option"]').length).toBe(1);
    await key('Tab');
    expect(textarea.value).toBe('Se #hms-runde ');
  });

  it('keeps Shift+Enter for new lines and does not send empty messages', async () => {
    const { api, textarea, key, type } = await render();
    await key('Enter');
    expect(api.callsOf('send').length).toBe(0);
    await type('linje');
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(api.callsOf('send').length).toBe(0);
  });
});
