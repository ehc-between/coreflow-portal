import {
  DOCUMENT,
  EffectRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { reportError } from '../monitoring/error-reporter';
import {
  CLOSE,
  EPHEMERAL_TYPES,
  REALTIME_RANDOM,
  REALTIME_TIMINGS,
  RealtimeEnvelope,
  RealtimeState,
  WEB_SOCKET_FACTORY,
  WebSocketLike,
  backoffDelay,
  realtimeUrl,
} from './realtime.models';

/** Frames the service consumes itself (never forwarded to `events()`). */
const INTERNAL = new Set(['hello', 'pong', 'auth.ok', 'auth.expiring', 'ack']);

/** Queued durable frames kept while the socket is down (oldest dropped beyond this). */
const MAX_QUEUE = 100;

type Timer = ReturnType<typeof setTimeout>;

/**
 * The one shared WebSocket of the app (docs/chat-design.md §3, §4.1).
 *
 * - First-frame auth with the in-memory access token; an effect re-sends
 *   `auth` whenever the token changes; `auth.expiring` triggers a
 *   (single-flight) refresh; a `4401` close refreshes first and reconnects,
 *   or stops when the refresh fails (the auth interceptor owns the logout).
 * - Full-jitter backoff (reset once a socket stayed open 30 s); `1001`/`1012`
 *   retry within 0–2 s; `4429` waits `retry_after`.
 * - Heartbeat: `ping` every 25 s, no `pong` within 10 s → reconnect.
 * - Browser offline → state `offline`, no retries; online → connect at once.
 *   Tab hidden/visible → `presence.set away/online`.
 * - `reconnected` emits after every `auth.ok` that follows an earlier
 *   connection: the chat store's catch-up trigger.
 *
 * It does not connect by itself: the feature that needs it (the chat store)
 * calls {@link start} / {@link stop}, so pages without chat never open a socket.
 * Tokens are never logged; monitoring gets close codes only.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly apiBaseUrl = inject(APP_CONFIG).apiBaseUrl;
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly timings = inject(REALTIME_TIMINGS);
  private readonly random = inject(REALTIME_RANDOM);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private tokenWatch: EffectRef | null = null;

  private readonly _state = signal<RealtimeState>('idle');
  /** Connection state. */
  readonly state = this._state.asReadonly();
  readonly isOpen = computed(() => this._state() === 'open');

  private readonly _degraded = signal(false);
  /** True once a started socket has not been open for 10 s: consumers poll instead. */
  readonly degraded = this._degraded.asReadonly();

  private readonly _userId = signal<string | null>(null);
  /** User id confirmed by the last `auth.ok`. */
  readonly userId = this._userId.asReadonly();

  private readonly incoming = new Subject<RealtimeEnvelope>();
  private readonly _reconnected = new Subject<void>();
  /** Emits after each re-established connection (not the first one). */
  readonly reconnected: Observable<void> = this._reconnected.asObservable();

  private socket: WebSocketLike | null = null;
  private socketAuthed = false;
  private started = false;
  private everOpened = false;
  private attempt = 0;
  private retryAfterMs: number | null = null;
  private queue: string[] = [];

  private reconnectTimer: Timer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: Timer | null = null;
  private stableTimer: Timer | null = null;
  private degradedTimer: Timer | null = null;

  private readonly onOnline = () => this.handleOnline();
  private readonly onOffline = () => this.handleOffline();
  private readonly onVisibility = () => this.sendPresence();

  /** Open the shared socket (idempotent). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    // Re-auth whenever the access token changes (created lazily: apps and
    // specs that never start the socket never read the auth state).
    this.tokenWatch ??= effect(
      () => {
        const token = this.auth.accessToken();
        untracked(() => this.onToken(token));
      },
      { injector: this.injector },
    );
    const win = this.document.defaultView;
    win?.addEventListener('online', this.onOnline);
    win?.addEventListener('offline', this.onOffline);
    this.document.addEventListener('visibilitychange', this.onVisibility);
    if (win?.navigator && win.navigator.onLine === false) {
      this.setState('offline');
      return;
    }
    this.connect();
  }

  /** Close the socket (`1000`) and forget queued frames (sign-out, chat disabled). */
  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    const win = this.document.defaultView;
    win?.removeEventListener('online', this.onOnline);
    win?.removeEventListener('offline', this.onOffline);
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearTimer('reconnectTimer');
    this.clearTimer('degradedTimer');
    this.dropSocket(CLOSE.normal);
    this.queue = [];
    this.everOpened = false;
    this.attempt = 0;
    this._userId.set(null);
    this._degraded.set(false);
    this._state.set('idle');
  }

  /** Server frames of one `type`, or of a namespace when `typeOrPrefix` ends in `.`. */
  events<P = Record<string, unknown>>(typeOrPrefix: string): Observable<RealtimeEnvelope<P>> {
    const prefix = typeOrPrefix.endsWith('.');
    return this.incoming.pipe(
      filter((e) => (prefix ? e.type.startsWith(typeOrPrefix) : e.type === typeOrPrefix)),
    ) as Observable<RealtimeEnvelope<P>>;
  }

  /**
   * Send a command. While the socket is not open durable frames are queued
   * and ephemeral ones (typing, focus, presence) are dropped.
   */
  send(type: string, payload: Record<string, unknown>, id?: string): void {
    const frame = JSON.stringify(id ? { type, id, payload } : { type, payload });
    if (this._state() === 'open' && this.socket) {
      this.socket.send(frame);
      return;
    }
    if (EPHEMERAL_TYPES.has(type)) {
      return;
    }
    this.queue.push(frame);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
    }
  }

  // --- connection lifecycle ---

  private connect(): void {
    this.clearTimer('reconnectTimer');
    if (!this.started) {
      return;
    }
    if (!this.auth.accessToken()) {
      // Wait for a token: the token effect connects once one arrives.
      this.setState(this.everOpened ? 'reconnecting' : 'connecting');
      return;
    }
    this.setState(this.everOpened ? 'reconnecting' : 'connecting');
    let socket: WebSocketLike;
    try {
      socket = this.createSocket(
        realtimeUrl(this.apiBaseUrl, this.document.location?.href ?? 'http://localhost/'),
      );
    } catch {
      this.scheduleReconnect(null);
      return;
    }
    this.socket = socket;
    this.socketAuthed = false;
    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.setState('authenticating');
      this.sendAuth();
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket === socket) {
        this.handleFrame(event.data);
      }
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket === socket) {
        this.handleClose(event.code);
      }
    };
    socket.onerror = () => {
      // A close event follows; nothing to do here.
    };
  }

  private sendAuth(): void {
    const token = this.auth.accessToken();
    if (token && this.socket) {
      this.socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
    }
  }

  private onToken(token: string | null): void {
    if (!this.started) {
      return;
    }
    if (!token) {
      // Signed out (or the refresh failed): the interceptor owns the redirect.
      this.stop();
      return;
    }
    if (this.socket && (this._state() === 'authenticating' || this._state() === 'open')) {
      this.sendAuth();
    } else if (!this.socket && !this.reconnectTimer && this._state() !== 'offline') {
      this.connect();
    }
  }

  private handleFrame(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }
    let frame: RealtimeEnvelope;
    try {
      frame = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      return;
    }
    if (!frame || typeof frame.type !== 'string') {
      return;
    }
    const payload = (frame.payload ?? {}) as Record<string, unknown>;
    switch (frame.type) {
      case 'auth.ok':
        this.onAuthOk(payload);
        break;
      case 'pong':
        this.clearTimer('pongTimer');
        break;
      case 'auth.expiring':
        this.auth.refresh().subscribe();
        break;
      case 'error': {
        const retry = Number(payload['retry_after']);
        if (Number.isFinite(retry) && retry > 0) {
          this.retryAfterMs = retry * 1000;
        }
        break;
      }
    }
    if (!INTERNAL.has(frame.type)) {
      this.incoming.next({ ...frame, payload });
    }
  }

  private onAuthOk(payload: Record<string, unknown>): void {
    const userId = typeof payload['user_id'] === 'string' ? payload['user_id'] : null;
    this._userId.set(userId);
    if (this.socketAuthed) {
      // Re-auth on the same socket after a token refresh: nothing to replay.
      return;
    }
    this.socketAuthed = true;
    this.retryAfterMs = null;
    this.setState('open');
    this.startHeartbeat();
    this.clearTimer('stableTimer');
    this.stableTimer = setTimeout(() => {
      this.attempt = 0;
      this.stableTimer = null;
    }, this.timings.stableAfter);
    const queued = this.queue;
    this.queue = [];
    for (const frame of queued) {
      this.socket?.send(frame);
    }
    this.sendPresence();
    if (this.everOpened) {
      this._reconnected.next();
    }
    this.everOpened = true;
  }

  private handleClose(code: number): void {
    this.dropSocket(null);
    if (!this.started) {
      return;
    }
    if (code === CLOSE.badFrame) {
      reportError(new Error('Realtime socket closed by the server'), { closeCode: code });
    }
    if (code === CLOSE.authFailed) {
      this.setState('reconnecting');
      this.auth.refresh().subscribe((ok) => {
        if (!this.started) {
          return;
        }
        if (ok) {
          this.connect();
        } else {
          this.stop();
        }
      });
      return;
    }
    this.scheduleReconnect(code);
  }

  private scheduleReconnect(code: number | null): void {
    if (!this.started || this._state() === 'offline') {
      return;
    }
    let delay: number;
    if (code === CLOSE.goingAway || code === CLOSE.serviceRestart) {
      delay = Math.floor(2000 * this.random());
    } else if (code === CLOSE.rateLimited && this.retryAfterMs) {
      delay = this.retryAfterMs;
    } else {
      delay = backoffDelay(this.attempt, this.random, this.timings);
      this.attempt++;
    }
    this.retryAfterMs = null;
    this.setState('reconnecting');
    this.clearTimer('reconnectTimer');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Detach and close the current socket without triggering its close handler. */
  private dropSocket(code: number | null): void {
    this.stopHeartbeat();
    this.clearTimer('stableTimer');
    const socket = this.socket;
    this.socket = null;
    this.socketAuthed = false;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (code !== null) {
        try {
          socket.close(code);
        } catch {
          // Already closed.
        }
      }
    }
  }

  // --- heartbeat ---

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.socket || this._state() !== 'open') {
        return;
      }
      this.socket.send(JSON.stringify({ type: 'ping', payload: {} }));
      if (!this.pongTimer) {
        this.pongTimer = setTimeout(() => {
          this.pongTimer = null;
          // The socket is dead: close it ourselves and reconnect.
          this.dropSocket(CLOSE.heartbeatLost);
          this.scheduleReconnect(null);
        }, this.timings.pongTimeout);
      }
    }, this.timings.pingInterval);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearTimer('pongTimer');
  }

  // --- browser signals ---

  private handleOffline(): void {
    if (!this.started) {
      return;
    }
    this.clearTimer('reconnectTimer');
    this.dropSocket(CLOSE.normal);
    this.setState('offline');
  }

  private handleOnline(): void {
    if (!this.started) {
      return;
    }
    this.attempt = 0;
    if (!this.socket) {
      this._state.set('reconnecting');
      this.connect();
    }
  }

  private sendPresence(): void {
    if (this._state() !== 'open') {
      return;
    }
    const hidden = this.document.visibilityState === 'hidden';
    this.send('presence.set', { status: hidden ? 'away' : 'online' });
  }

  // --- helpers ---

  private setState(state: RealtimeState): void {
    this._state.set(state);
    if (state === 'open') {
      this.clearTimer('degradedTimer');
      this._degraded.set(false);
    } else if (this.started && !this._degraded() && !this.degradedTimer) {
      this.degradedTimer = setTimeout(() => {
        this.degradedTimer = null;
        if (this.started && this._state() !== 'open') {
          this._degraded.set(true);
        }
      }, this.timings.degradedAfter);
    }
  }

  private clearTimer(name: 'reconnectTimer' | 'pongTimer' | 'stableTimer' | 'degradedTimer'): void {
    const timer = this[name];
    if (timer) {
      clearTimeout(timer);
      this[name] = null;
    }
  }
}
