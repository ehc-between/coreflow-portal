import { Provider } from '@angular/core';
import { REALTIME_RANDOM, WEB_SOCKET_FACTORY, WebSocketLike } from './realtime.models';

/**
 * Test-only fake of the browser WebSocket (never opens a network socket).
 * Specs drive it: `open()`, `receive(frame)`, `serverClose(code)`, and read
 * what the client sent from `sent` / `frames()`.
 */
export class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: string[] = [];
  closedWith: number | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  /** Parsed frames the client sent. */
  frames(): { type: string; id?: string; payload: Record<string, unknown> }[] {
    return this.sent.map((s) => JSON.parse(s));
  }

  /** Frames of one type the client sent. */
  framesOf(type: string) {
    return this.frames().filter((f) => f.type === type);
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  /** Simulate `auth.ok` for `userId`. */
  authOk(userId = 'u-me', orgs: string[] = ['org-1']): void {
    this.receive({ v: 1, type: 'auth.ok', payload: { user_id: userId, orgs, ping_interval: 25 } });
  }

  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

/** Collects every fake socket the service creates. */
export class FakeSocketHub {
  readonly sockets: FakeWebSocket[] = [];
  readonly factory = (url: string): WebSocketLike => {
    const socket = new FakeWebSocket(url);
    this.sockets.push(socket);
    return socket;
  };
  get last(): FakeWebSocket {
    return this.sockets[this.sockets.length - 1];
  }
}

/** Providers wiring the fake socket factory (and a fixed jitter) into TestBed. */
export function provideFakeRealtime(hub: FakeSocketHub, random = 1): Provider[] {
  return [
    { provide: WEB_SOCKET_FACTORY, useValue: hub.factory },
    { provide: REALTIME_RANDOM, useValue: () => random },
  ];
}
