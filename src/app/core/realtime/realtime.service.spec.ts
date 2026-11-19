import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { REALTIME_TIMINGS, backoffDelay, realtimeUrl } from './realtime.models';
import { RealtimeService } from './realtime.service';
import { FakeSocketHub, provideFakeRealtime } from './realtime.testing';

const TIMINGS = {
  pingInterval: 25_000,
  pongTimeout: 10_000,
  maxBackoff: 30_000,
  baseBackoff: 1_000,
  stableAfter: 30_000,
  degradedAfter: 10_000,
};

function setup(random = 1) {
  const token = signal<string | null>('tok-1');
  const refreshResult = new Subject<boolean>();
  const auth = {
    accessToken: () => token(),
    refreshCalls: 0,
    refresh() {
      this.refreshCalls++;
      return refreshResult;
    },
  };
  const hub = new FakeSocketHub();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: auth },
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test/api' } },
      { provide: REALTIME_TIMINGS, useValue: TIMINGS },
      ...provideFakeRealtime(hub, random),
    ],
  });
  const service = TestBed.inject(RealtimeService);
  TestBed.tick();
  return { service, hub, token, auth, refreshResult };
}

describe('realtime helpers', () => {
  it('builds ws/wss URLs from the API base', () => {
    expect(realtimeUrl('http://localhost:8000/api', 'http://localhost:4200/')).toBe(
      'ws://localhost:8000/api/v1/realtime/ws',
    );
    expect(realtimeUrl('/api', 'https://app.example.no/chat')).toBe(
      'wss://app.example.no/api/v1/realtime/ws',
    );
  });

  it('uses full-jitter exponential backoff capped at 30 s', () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(3, () => 1)).toBe(8000);
    expect(backoffDelay(10, () => 1)).toBe(30_000);
    expect(backoffDelay(10, () => 0.5)).toBe(15_000);
    expect(backoffDelay(4, () => 0)).toBe(0);
  });
});

describe('RealtimeService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not connect until started, then sends auth as the first frame', () => {
    const { service, hub } = setup();
    expect(hub.sockets.length).toBe(0);
    service.start();
    expect(hub.last.url).toBe('ws://api.test/api/v1/realtime/ws');
    expect(service.state()).toBe('connecting');
    hub.last.open();
    expect(service.state()).toBe('authenticating');
    expect(hub.last.frames()[0]).toEqual({ type: 'auth', payload: { token: 'tok-1' } });
    hub.last.authOk();
    expect(service.state()).toBe('open');
    expect(service.isOpen()).toBe(true);
  });

  it('queues durable frames while down, drops ephemeral ones, flushes after auth', () => {
    const { service, hub } = setup();
    service.start();
    service.send('chat.typing', { conversation_id: 'c' });
    service.send('custom.command', { a: 1 });
    hub.last.open();
    hub.last.authOk();
    const types = hub.last.frames().map((f) => f.type);
    expect(types).toContain('custom.command');
    expect(types).not.toContain('chat.typing');
  });

  it('re-sends auth on the same socket when the token changes (no reconnect)', () => {
    const { service, hub, token } = setup();
    service.start();
    hub.last.open();
    hub.last.authOk();
    const reconnected = vi.fn();
    service.reconnected.subscribe(reconnected);
    token.set('tok-2');
    TestBed.tick();
    expect(hub.last.framesOf('auth').map((f) => f.payload['token'])).toEqual(['tok-1', 'tok-2']);
    hub.last.authOk();
    expect(hub.sockets.length).toBe(1);
    expect(reconnected).not.toHaveBeenCalled();
  });

  it('refreshes on auth.expiring', () => {
    const { service, hub, auth } = setup();
    service.start();
    hub.last.open();
    hub.last.authOk();
    hub.last.receive({ type: 'auth.expiring', payload: {} });
    expect(auth.refreshCalls).toBe(1);
  });

  it('reconnects with backoff after an abnormal close and emits reconnected', () => {
    const { service, hub } = setup(1);
    const reconnected = vi.fn();
    service.reconnected.subscribe(reconnected);
    service.start();
    hub.last.open();
    hub.last.authOk();
    hub.last.serverClose(1006);
    expect(service.state()).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(hub.sockets.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(hub.sockets.length).toBe(2);
    hub.last.serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(hub.sockets.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(hub.sockets.length).toBe(3);
    hub.last.open();
    hub.last.authOk();
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it('retries at once (0–2 s) after a deploy close', () => {
    const { service, hub } = setup(0.5);
    service.start();
    hub.last.open();
    hub.last.authOk();
    hub.last.serverClose(1001);
    vi.advanceTimersByTime(1000);
    expect(hub.sockets.length).toBe(2);
  });

  it('honours retry_after on 4429', () => {
    const { service, hub } = setup(1);
    service.start();
    hub.last.open();
    hub.last.authOk();
    hub.last.receive({ type: 'error', payload: { code: 'rate_limited', retry_after: 7 } });
    hub.last.serverClose(4429);
    vi.advanceTimersByTime(6999);
    expect(hub.sockets.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(hub.sockets.length).toBe(2);
  });

  it('refreshes the token on 4401 and reconnects, or stops when the refresh fails', () => {
    const first = setup();
    first.service.start();
    first.hub.last.open();
    first.hub.last.serverClose(4401);
    expect(first.auth.refreshCalls).toBe(1);
    first.refreshResult.next(true);
    expect(first.hub.sockets.length).toBe(2);

    TestBed.resetTestingModule();
    const second = setup();
    second.service.start();
    second.hub.last.open();
    second.hub.last.serverClose(4401);
    second.refreshResult.next(false);
    expect(second.service.state()).toBe('idle');
    vi.advanceTimersByTime(60_000);
    expect(second.hub.sockets.length).toBe(1);
  });

  it('pings every 25 s and reconnects when no pong arrives within 10 s', () => {
    const { service, hub } = setup(1);
    service.start();
    hub.last.open();
    hub.last.authOk();
    vi.advanceTimersByTime(25_000);
    expect(hub.last.framesOf('ping').length).toBe(1);
    hub.last.receive({ type: 'pong', payload: {} });
    vi.advanceTimersByTime(25_000);
    expect(hub.last.framesOf('ping').length).toBe(2);
    vi.advanceTimersByTime(10_000);
    expect(hub.sockets[0].closedWith).toBe(4000);
    expect(service.state()).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(hub.sockets.length).toBe(2);
  });

  it('goes offline without retrying and reconnects when back online', () => {
    const { service, hub } = setup();
    service.start();
    hub.last.open();
    hub.last.authOk();
    window.dispatchEvent(new Event('offline'));
    expect(service.state()).toBe('offline');
    vi.advanceTimersByTime(60_000);
    expect(hub.sockets.length).toBe(1);
    window.dispatchEvent(new Event('online'));
    expect(hub.sockets.length).toBe(2);
  });

  it('flags degraded after 10 s without an open socket (polling fallback)', () => {
    const { service, hub } = setup();
    service.start();
    expect(service.degraded()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(service.degraded()).toBe(true);
    hub.last.open();
    hub.last.authOk();
    expect(service.degraded()).toBe(false);
  });

  it('forwards feature events and never logs internal frames', () => {
    const { service, hub } = setup();
    const seen: string[] = [];
    service.events('chat.').subscribe((e) => seen.push(e.type));
    service.start();
    hub.last.open();
    hub.last.receive({ type: 'hello', payload: {} });
    hub.last.authOk();
    hub.last.receive({
      type: 'chat.message.created',
      org_id: 'o',
      seq: 3,
      payload: { message: {} },
    });
    hub.last.receive({ type: 'presence.changed', payload: {} });
    hub.last.receive({ type: 'pong', payload: {} });
    expect(seen).toEqual(['chat.message.created']);
  });

  it('stops with close 1000 and stops when the token disappears', () => {
    const { service, hub, token } = setup();
    service.start();
    hub.last.open();
    hub.last.authOk();
    token.set(null);
    TestBed.tick();
    expect(hub.last.closedWith).toBe(1000);
    expect(service.state()).toBe('idle');
  });

  it('ignores a token arriving after stop', () => {
    const { service, hub, token } = setup();
    service.start();
    service.stop();
    token.set('tok-3');
    TestBed.tick();
    expect(hub.sockets.length).toBe(1);
    void of(null);
  });
});
