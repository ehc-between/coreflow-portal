import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG } from '../config/app-config';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { SelectedOrgService } from '../org/selected-org.service';
import { UxEventBatchIn } from './ux-metrics.models';
import { UX_FLUSH_DELAY_MS, UxMetricsService, clickSource } from './ux-metrics.service';

@Component({ template: '' })
class Blank {}

const URL = 'http://api/v1/orgs/o1/ux-events';

describe('UxMetricsService', () => {
  const cleanup: (() => void)[] = [];

  afterEach(() => {
    cleanup.splice(0).forEach((fn) => fn());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function setup(orgId: string | null = 'o1') {
    const org = signal<string | null>(orgId);
    const authenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: Blank },
          { path: 'dashboard', component: Blank },
          {
            path: 'risk',
            children: [
              { path: 'risks', component: Blank },
              { path: 'risks/:id', component: Blank },
            ],
          },
          { path: '**', component: Blank },
        ]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api' } },
        { provide: AuthService, useValue: { isAuthenticated: authenticated } },
        { provide: SelectedOrgService, useValue: { currentOrgId: org } },
      ],
    });
    const service = TestBed.inject(UxMetricsService);
    service.start();
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    await router.navigateByUrl('/dashboard');
    return { service, router, http, org, authenticated };
  }

  /** Append markup to the document and return its first link or button. */
  function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    // jsdom does not navigate; the test drives the router itself.
    const stop = (e: Event) => e.preventDefault();
    host.addEventListener('click', stop);
    cleanup.push(() => host.remove());
    return host.querySelector<HTMLElement>('a, button')!;
  }

  function sent(http: HttpTestingController): UxEventBatchIn {
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush({ accepted: 1, enabled: true });
    return req.request.body as UxEventBatchIn;
  }

  it('counts page views by route template, never by the concrete URL', async () => {
    const { service, router, http } = await setup();
    await router.navigateByUrl('/risk/risks/5f0c?q=tyveri#notes');
    await router.navigateByUrl('/risk/risks/5f0c?q=other'); // query-only change: same page
    await router.navigateByUrl('/nowhere/at-all');
    service.flush();

    expect(sent(http).events).toEqual([
      { source: 'page_view', target: '/dashboard', from_path: null, count: 1 },
      { source: 'page_view', target: '/risk/risks/:id', from_path: null, count: 1 },
      { source: 'page_view', target: '/not-found', from_path: null, count: 1 },
    ]);
    http.verify();
  });

  it('attributes a side-nav link click to the navigation it starts', async () => {
    const { service, router, http } = await setup();
    mount('<app-side-nav><nav><a href="/risk/risks">Risks</a></nav></app-side-nav>').click();
    await router.navigateByUrl('/risk/risks');
    service.flush();

    const events = sent(http).events;
    expect(events).toContainEqual({
      source: 'nav',
      target: '/risk/risks',
      from_path: '/dashboard',
      count: 1,
    });
  });

  it('attributes a link wrapping a stat tile to "tile", and merges repeats', async () => {
    const { service, router, http } = await setup();
    const tile = mount('<a href="/risk/risks?status=open"><app-kpi-tile>3</app-kpi-tile></a>');
    tile.click();
    await router.navigateByUrl('/risk/risks?status=open');
    await router.navigateByUrl('/dashboard');
    tile.click();
    await router.navigateByUrl('/risk/risks?status=open');
    service.flush();

    const events = sent(http).events;
    expect(events).toContainEqual({
      source: 'tile',
      target: '/risk/risks',
      from_path: '/dashboard',
      count: 2,
    });
  });

  it('honours an explicit data-ux-source tag on buttons, and markNext for code', async () => {
    const { service, router, http } = await setup();
    mount('<div data-ux-source="register"><button type="button">Register</button></div>').click();
    await router.navigateByUrl('/risk/risks/abc');
    service.markNext('palette');
    await router.navigateByUrl('/dashboard');
    service.flush();

    const events = sent(http).events;
    expect(events).toContainEqual({
      source: 'register',
      target: '/risk/risks/:id',
      from_path: '/dashboard',
      count: 1,
    });
    expect(events).toContainEqual({
      source: 'palette',
      target: '/dashboard',
      from_path: '/risk/risks/:id',
      count: 1,
    });
  });

  it('does not count untagged clicks, and they cancel an unfinished one', async () => {
    const { service, router, http } = await setup();
    service.markNext('palette');
    mount('<a href="/risk/risks">Plain link</a>').click();
    await router.navigateByUrl('/risk/risks');
    service.flush();

    const events = sent(http).events;
    expect(events.map((e) => e.source)).toEqual(['page_view', 'page_view']);
  });

  it('counts side-nav links but not its buttons, and never a page_view tag', () => {
    const link = document.createElement('a');
    link.href = '/x';
    const nav = document.createElement('app-side-nav');
    const button = document.createElement('button');
    nav.append(link, button);
    expect(clickSource(link)).toBe('nav');
    expect(clickSource(button)).toBeNull();

    const tagged = document.createElement('div');
    tagged.setAttribute('data-ux-source', 'page_view');
    const inner = document.createElement('a');
    tagged.append(inner);
    expect(clickSource(inner)).toBeNull();
  });

  it('flushes on its own after the delay', async () => {
    const { service, router, http } = await setup();
    service.flush(); // the real-timer batch from setup
    sent(http);
    vi.useFakeTimers();
    await router.navigateByUrl('/risk/risks');
    http.expectNone(URL);
    vi.advanceTimersByTime(UX_FLUSH_DELAY_MS);
    expect(sent(http).events).toEqual([
      { source: 'page_view', target: '/risk/risks', from_path: null, count: 1 },
    ]);
  });

  it('splits counts above 100 into several events', async () => {
    const { service, router, http } = await setup();
    for (let i = 0; i < 202; i++) {
      service.markNext('nav');
      await router.navigateByUrl(i % 2 ? '/dashboard' : '/risk/risks');
    }
    service.flush();
    const events = sent(http).events.filter(
      (e) => e.source === 'nav' && e.target === '/risk/risks',
    );
    expect(events.map((e) => e.count)).toEqual([100, 1]);
  });

  it('records nothing without an org, when signed out, or under Do Not Track', async () => {
    const { service, router, http, org, authenticated } = await setup(null);
    await router.navigateByUrl('/risk/risks');
    service.flush();
    http.expectNone(URL);

    org.set('o1');
    authenticated.set(false);
    await router.navigateByUrl('/dashboard');
    service.flush();
    http.expectNone(URL);

    authenticated.set(true);
    vi.stubGlobal('navigator', { ...navigator, doNotTrack: '1' });
    await router.navigateByUrl('/risk/risks');
    service.flush();
    http.expectNone(URL);
  });

  it('flushes the old org before counting for a new one', async () => {
    const { service, router, http, org } = await setup();
    org.set('o2');
    await router.navigateByUrl('/risk/risks');
    expect(sent(http).events).toEqual([
      { source: 'page_view', target: '/dashboard', from_path: null, count: 1 },
    ]);
    service.flush();
    const req = http.expectOne('http://api/v1/orgs/o2/ux-events');
    expect((req.request.body as UxEventBatchIn).events[0].target).toBe('/risk/risks');
  });

  it('stops sending for the session once the server reports it is switched off', async () => {
    const { service, router, http } = await setup();
    service.flush();
    http.expectOne(URL).flush({ accepted: 0, enabled: false });
    await router.navigateByUrl('/risk/risks');
    service.flush();
    http.expectNone(URL);
  });

  it('swallows a failed batch', async () => {
    const { service, http } = await setup();
    service.flush();
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    http.verify();
  });
});
