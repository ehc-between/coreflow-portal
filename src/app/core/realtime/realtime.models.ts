import { InjectionToken } from '@angular/core';

/** Server → client frame (docs/chat-design.md §3.2). */
export interface RealtimeEnvelope<P = Record<string, unknown>> {
  readonly v?: number;
  readonly type: string;
  readonly id?: string;
  readonly ts?: string;
  readonly org_id?: string | null;
  readonly conversation_id?: string | null;
  readonly seq?: number | null;
  readonly payload: P;
}

export type RealtimeState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'open'
  | 'reconnecting'
  | 'offline';

/** Close codes the gateway uses (§3.3). */
export const CLOSE = {
  normal: 1000,
  goingAway: 1001,
  serviceRestart: 1012,
  tryAgainLater: 1013,
  badFrame: 4400,
  authFailed: 4401,
  forbidden: 4403,
  timeout: 4408,
  tooMany: 4409,
  rateLimited: 4429,
  /** Client-side: no pong in time (never sent by the server). */
  heartbeatLost: 4000,
} as const;

/** Client frames that are worthless later: dropped (not queued) while not open. */
export const EPHEMERAL_TYPES: ReadonlySet<string> = new Set([
  'chat.typing',
  'chat.focus',
  'presence.set',
  'presence.query',
  'ping',
]);

/** The subset of the browser WebSocket the service uses (fakeable in specs). */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/**
 * Builds the socket. Specs provide a fake so they never open a network
 * connection (`realtime.testing.ts`).
 */
export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocketLike>(
  'WEB_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url: string) => new WebSocket(url) as unknown as WebSocketLike,
  },
);

/** Timings (ms). Overridable in specs through {@link REALTIME_TIMINGS}. */
export interface RealtimeTimings {
  readonly pingInterval: number;
  readonly pongTimeout: number;
  readonly maxBackoff: number;
  readonly baseBackoff: number;
  readonly stableAfter: number;
  readonly degradedAfter: number;
}

export const DEFAULT_TIMINGS: RealtimeTimings = {
  pingInterval: 25_000,
  pongTimeout: 10_000,
  maxBackoff: 30_000,
  baseBackoff: 1_000,
  stableAfter: 30_000,
  degradedAfter: 10_000,
};

export const REALTIME_TIMINGS = new InjectionToken<RealtimeTimings>('REALTIME_TIMINGS', {
  providedIn: 'root',
  factory: () => DEFAULT_TIMINGS,
});

/** Source of randomness for backoff jitter (fixed in specs). */
export const REALTIME_RANDOM = new InjectionToken<() => number>('REALTIME_RANDOM', {
  providedIn: 'root',
  factory: () => Math.random,
});

/** Full-jitter backoff: `min(max, base × 2^attempt) × random()`. */
export function backoffDelay(
  attempt: number,
  random: () => number,
  timings: Pick<RealtimeTimings, 'baseBackoff' | 'maxBackoff'> = DEFAULT_TIMINGS,
): number {
  const cap = Math.min(timings.maxBackoff, timings.baseBackoff * 2 ** Math.max(0, attempt));
  return Math.floor(cap * random());
}

/** `{apiBaseUrl}/v1/realtime/ws` as a ws:/wss: URL (relative bases resolve against the page). */
export function realtimeUrl(apiBaseUrl: string, pageHref: string): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, '')}/v1/realtime/ws`, pageHref);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
