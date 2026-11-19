import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { ModuleService } from '../modules/module.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { FakeSocketHub, provideFakeRealtime } from '../realtime/realtime.testing';
import { ChatApi } from './chat-api';
import { ChatStore } from './chat-store';
import { notificationLink } from '../notifications/notification-text';
import { FakeChatApi, KARI, ME, fakeConversation, fakeMessage } from './chat.testing';

const ORG = 'org-1';

function setup(options: { permissions?: string[]; seed?: (api: FakeChatApi) => void } = {}) {
  const api = new FakeChatApi();
  options.seed?.(api);
  const hub = new FakeSocketHub();
  const token = signal<string | null>('tok');
  const user = signal({ id: ME.id, email: 'me@x.no', full_name: ME.name });
  const auth = {
    accessToken: () => token(),
    isAuthenticated: computed(() => token() !== null),
    user,
    refresh: () => of(true),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test/api' } },
      { provide: AuthService, useValue: auth },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({
            id: ORG,
            name: 'Org',
            roles: [],
            permissions: options.permissions ?? ['chat:use'],
          }).asReadonly(),
        },
      },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      { provide: ChatApi, useValue: api },
      ...provideFakeRealtime(hub),
    ],
  });
  const store = TestBed.inject(ChatStore);
  TestBed.tick();
  const connect = () => {
    hub.last.open();
    hub.last.authOk(ME.id, [ORG]);
  };
  return { store, api, hub, connect };
}

function created(conversationId: string, seq: number, overrides = {}) {
  return {
    type: 'chat.message.created',
    org_id: ORG,
    conversation_id: conversationId,
    seq,
    payload: {
      message: fakeMessage({ conversation_id: conversationId, seq, change_seq: seq, ...overrides }),
      root: null,
    },
  };
}

describe('ChatStore', () => {
  afterEach(() => vi.useRealTimers());

  it('stays idle without chat:use (no list, no socket)', () => {
    const { api, hub } = setup({ permissions: [] });
    expect(api.callsOf('listConversations').length).toBe(0);
    expect(hub.sockets.length).toBe(0);
  });

  it('loads the list and opens the shared socket when chat is available', () => {
    const conv = fakeConversation({
      kind: 'dm',
      dm_user_ids: [ME.id, KARI.id],
      member_preview: [ME, KARI],
    });
    const { store, api, hub } = setup({ seed: (a) => (a.conversations = [conv]) });
    expect(api.callsOf('listConversations').length).toBe(1);
    expect(store.conversations().map((c) => c.id)).toEqual([conv.id]);
    expect(hub.sockets.length).toBe(1);
  });

  it('computes the nav badge: DM/group unread + channel mentions, muted excluded', () => {
    const { store } = setup({
      seed: (a) =>
        (a.conversations = [
          fakeConversation({ kind: 'dm', unread_count: 2 }),
          fakeConversation({
            kind: 'group',
            unread_count: 3,
            me: { role: 'member', notify_level: 'none', last_read_seq: 0 },
          }),
          fakeConversation({ kind: 'channel', unread_count: 40, mention_count: 1 }),
        ]),
    });
    expect(store.unreadBadge()).toBe(3);
  });

  it('applies events by seq: duplicates ignored, gaps filled from changes', () => {
    vi.useFakeTimers();
    const conv = fakeConversation({ last_seq: 5 });
    const { store, api, hub, connect } = setup({ seed: (a) => (a.conversations = [conv]) });
    connect();
    store.open(conv.id);
    hub.last.receive(created(conv.id, 6, { body: 'seks' }));
    expect(store.page(conv.id).items.map((m) => m.body)).toEqual(['seks']);
    hub.last.receive(created(conv.id, 6, { body: 'duplikat' }));
    expect(store.page(conv.id).items.length).toBe(1);
    expect(store.conversation(conv.id)!.unread_count).toBe(1);

    hub.last.receive(created(conv.id, 9, { body: 'ni' }));
    expect(api.callsOf('changes').length).toBe(0);
    vi.advanceTimersByTime(300);
    expect(api.callsOf('changes')[0].args).toEqual([ORG, conv.id, 6]);
  });

  it('ignores events of another org', () => {
    const conv = fakeConversation({ last_seq: 1 });
    const { store, hub, connect } = setup({ seed: (a) => (a.conversations = [conv]) });
    connect();
    store.open(conv.id);
    hub.last.receive({ ...created(conv.id, 2), org_id: 'other-org' });
    expect(store.page(conv.id).items.length).toBe(0);
  });

  it('sends optimistically and replaces the pending message with the echo', () => {
    const conv = fakeConversation();
    const { store, api } = setup({ seed: (a) => (a.conversations = [conv]) });
    store.open(conv.id);
    let done = false;
    store.send(conv.id, 'Hei').subscribe(() => (done = true));
    expect(done).toBe(true);
    const items = store.page(conv.id).items;
    expect(items.length).toBe(1);
    expect(items[0].localState).toBeUndefined();
    expect(items[0].client_id).toBe(
      (api.callsOf('send')[0].args[2] as { client_id: string }).client_id,
    );
  });

  it('marks a failed send and retries with the same client_id', () => {
    const conv = fakeConversation();
    const { store, api } = setup({ seed: (a) => (a.conversations = [conv]) });
    store.open(conv.id);
    api.failSend = true;
    store.send(conv.id, 'Hei').subscribe({ error: () => undefined });
    const failed = store.page(conv.id).items[0];
    expect(failed.localState).toBe('failed');
    api.failSend = false;
    store.retry(failed).subscribe();
    const sends = api.callsOf('send').map((c) => (c.args[2] as { client_id: string }).client_id);
    expect(sends[0]).toBe(sends[1]);
    expect(store.page(conv.id).items.length).toBe(1);
    expect(store.page(conv.id).items[0].localState).toBeUndefined();
  });

  it('toggles reactions optimistically', () => {
    const conv = fakeConversation();
    const message = fakeMessage({ conversation_id: conv.id });
    const { store, api } = setup({
      seed: (a) => {
        a.conversations = [conv];
        a.messagesById.set(conv.id, [message]);
      },
    });
    store.open(conv.id);
    store.toggleReaction(store.page(conv.id).items[0], '👍');
    expect(store.page(conv.id).items[0].reactions).toEqual([
      { emoji: '👍', count: 1, user_ids: [ME.id] },
    ]);
    expect(api.callsOf('react')[0].args.slice(3)).toEqual(['👍', true]);
  });

  it('catches up loaded conversations after a reconnect', () => {
    vi.useFakeTimers();
    const conv = fakeConversation({ last_seq: 3 });
    const { store, api, hub, connect } = setup({ seed: (a) => (a.conversations = [conv]) });
    connect();
    store.open(conv.id);
    api.conversations = [{ ...conv, last_seq: 8 }];
    hub.last.serverClose(1001);
    vi.advanceTimersByTime(2000);
    connect();
    expect(api.callsOf('changes')[0]?.args).toEqual([ORG, conv.id, 3]);
  });

  it('shows typing for 6 s and drops my own frames', () => {
    vi.useFakeTimers();
    const conv = fakeConversation();
    const { store, hub, connect } = setup({ seed: (a) => (a.conversations = [conv]) });
    connect();
    hub.last.receive({
      type: 'chat.typing',
      org_id: ORG,
      conversation_id: conv.id,
      payload: { user: KARI, parent_id: null },
    });
    hub.last.receive({
      type: 'chat.typing',
      org_id: ORG,
      conversation_id: conv.id,
      payload: { user: ME, parent_id: null },
    });
    expect(store.typing(conv.id).map((t) => t.user.id)).toEqual([KARI.id]);
    vi.advanceTimersByTime(6000);
    expect(store.typing(conv.id)).toEqual([]);
  });

  it('throttles my typing frames to one per 3 s', () => {
    const conv = fakeConversation();
    const { store, hub, connect } = setup({ seed: (a) => (a.conversations = [conv]) });
    connect();
    store.notifyTyping(conv.id);
    store.notifyTyping(conv.id);
    expect(hub.last.framesOf('chat.typing').length).toBe(1);
  });
});

describe('chat notifications', () => {
  it('link to the conversation URL from params, else the conversation', () => {
    const base = {
      id: 'n1',
      org_id: ORG,
      kind: 'chat_message.mentioned',
      entity_type: 'chat_conversation',
      entity_id: 'c1',
      title_key: 'chat:notifications.mentioned',
      params: { url: '/chat/c1?m=m1' },
    } as never;
    expect(notificationLink(base)).toEqual(['/chat/c1?m=m1']);
    expect(notificationLink({ ...(base as object), params: {} } as never)).toEqual(['/chat', 'c1']);
  });
});
