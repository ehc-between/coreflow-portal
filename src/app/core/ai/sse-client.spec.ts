import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { SseClient } from './sse-client';

const BASE = 'http://test/api/';

/** A fetch Response whose body streams `chunks` one by one. */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

/** Resolve once the stream has delivered an event of `type` (or time out). */
async function until(events: { type: string }[], type: string): Promise<void> {
  for (let i = 0; i < 50 && !events.some((e) => e.type === type); i++) {
    await new Promise((resolve) => setTimeout(resolve));
  }
}

describe('SseClient', () => {
  let client: SseClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        { provide: AuthService, useValue: { accessToken: signal('tok-1').asReadonly() } },
      ],
    });
    client = TestBed.inject(SseClient);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('posts JSON with the bearer and parses events split across chunks', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        'data: {"type":"delta","text":"Hel"}\n\ndata: {"type":"del',
        'ta","text":"lo"}\n\n',
        'data: {"type":"sources","sources":[{"id":"d1","title":"Policy"}]}\n\n',
        'data: not json\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );
    const events: { type: string }[] = [];
    client.post('v1/orgs/o/standard-requirements/x/ai-help', { lang: 'nb' }, (e) => events.push(e));
    await until(events, 'done');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://test/api/v1/orgs/o/standard-requirements/x/ai-help');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'nb' });
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1');
    expect(events).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'sources', sources: [{ id: 'd1', title: 'Policy' }] },
      { type: 'done' },
    ]);
  });

  it('maps a "not configured" 503 to a single not-configured event', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'AI is not configured' }), { status: 503 }),
    );
    const events: { type: string }[] = [];
    client.post('v1/x', {}, (e) => events.push(e));
    await until(events, 'not-configured');
    expect(events).toEqual([{ type: 'not-configured' }]);
  });

  it('treats any other 503 as a (retryable) error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Model overloaded' }), { status: 503 }),
    );
    const events: { type: string }[] = [];
    client.post('v1/x', {}, (e) => events.push(e));
    await until(events, 'error');
    expect(events).toEqual([{ type: 'error', message: '' }]);

    fetchMock.mockResolvedValue(new Response('<html>busy</html>', { status: 503 }));
    const more: { type: string }[] = [];
    client.post('v1/x', {}, (e) => more.push(e));
    await until(more, 'error');
    expect(more).toEqual([{ type: 'error', message: '' }]);
  });

  it('ends with an error when the stream hits EOF without done / error', async () => {
    fetchMock.mockResolvedValue(streamResponse(['data: {"type":"delta","text":"Half"}\n\n']));
    const events: { type: string }[] = [];
    client.post('v1/x', {}, (e) => events.push(e));
    await until(events, 'error');
    expect(events).toEqual([
      { type: 'delta', text: 'Half' },
      { type: 'error', message: '' },
    ]);
  });

  it('delivers a final message that lacks the trailing blank line', async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['data: {"type":"delta","text":"A"}\n\n', 'data: {"type":"done"}']),
    );
    const events: { type: string }[] = [];
    client.post('v1/x', {}, (e) => events.push(e));
    await until(events, 'done');
    await new Promise((resolve) => setTimeout(resolve));
    expect(events).toEqual([{ type: 'delta', text: 'A' }, { type: 'done' }]);
  });

  it('maps other failures to a single error event', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));
    const events: { type: string }[] = [];
    client.post('v1/x', {}, (e) => events.push(e));
    await until(events, 'error');
    expect(events).toEqual([{ type: 'error', message: '' }]);
  });

  it('stays silent when cancelled before the response', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        ),
    );
    const events: { type: string }[] = [];
    const stream = client.post('v1/x', {}, (e) => events.push(e));
    stream.cancel();
    await until(events, 'error');
    expect(events).toEqual([]);
  });
});
