import {
  FILTERED,
  hasSecrets,
  scrubBreadcrumb,
  scrubEvent,
  scrubQueryString,
  scrubRecordingEvent,
  scrubText,
  scrubUrl,
} from './scrub';

const F = FILTERED;

describe('scrubUrl', () => {
  it('redacts secret params in absolute URLs and keeps the rest intact', () => {
    expect(scrubUrl('https://app.example.com/reset-password?token=abc123&lang=nb')).toBe(
      `https://app.example.com/reset-password?token=${F}&lang=nb`,
    );
  });

  it('matches code, secret and password, case-insensitively', () => {
    expect(scrubUrl('/cb?Code=1&SECRET=2&Password=3&TOKEN=4&state=ok')).toBe(
      `/cb?Code=${F}&SECRET=${F}&Password=${F}&TOKEN=${F}&state=ok`,
    );
  });

  it('matches prefixed names but not unrelated ones', () => {
    expect(scrubUrl('/x?access_token=a&reset-token=b&postcode=0150&tokens=1')).toBe(
      `/x?access_token=${F}&reset-token=${F}&postcode=0150&tokens=1`,
    );
  });

  it('handles relative, protocol-relative and query-only URLs', () => {
    expect(scrubUrl('/invite/accept?token=xyz')).toBe(`/invite/accept?token=${F}`);
    expect(scrubUrl('invite/accept?token=xyz')).toBe(`invite/accept?token=${F}`);
    expect(scrubUrl('//cdn.example.com/a?token=xyz')).toBe(`//cdn.example.com/a?token=${F}`);
    expect(scrubUrl('?token=xyz')).toBe(`?token=${F}`);
  });

  it('keeps fragments and scrubs query-like fragments', () => {
    expect(scrubUrl('/reset-password?token=abc#section')).toBe(
      `/reset-password?token=${F}#section`,
    );
    expect(scrubUrl('/cb#access_token=abc&type=bearer')).toBe(`/cb#access_token=${F}&type=bearer`);
    expect(scrubUrl('/#/reset-password?token=abc')).toBe(`/#/reset-password?token=${F}`);
    // A `?` after the `#` belongs to the fragment, not the query.
    expect(scrubUrl('/page#frag?x=1')).toBe('/page#frag?x=1');
  });

  it('handles percent-encoded names and values', () => {
    expect(scrubUrl('/x?%74oken=a%20b&next=%2Fhome')).toBe(`/x?%74oken=${F}&next=%2Fhome`);
    expect(scrubUrl('/x?token=a%2Bb%3D%3D')).toBe(`/x?token=${F}`);
    // Malformed escapes don't throw.
    expect(scrubUrl('/x?%E0%A4%A=1&token=z')).toBe(`/x?%E0%A4%A=1&token=${F}`);
  });

  it('redacts empty values and repeated params, leaves bare flags alone', () => {
    expect(scrubUrl('/x?token=&token=b&token')).toBe(`/x?token=${F}&token=${F}&token`);
  });

  it('redacts invitation tokens carried as a path segment', () => {
    expect(scrubUrl('http://localhost:8000/api/v1/invitations/s3cr3t-T0k3n')).toBe(
      `http://localhost:8000/api/v1/invitations/${F}`,
    );
    expect(scrubUrl('/api/v1/invitations/abc?x=1')).toBe(`/api/v1/invitations/${F}?x=1`);
    expect(scrubUrl('/api/v1/invitations/accept')).toBe('/api/v1/invitations/accept');
  });

  it('returns the very same string when nothing is secret', () => {
    for (const url of ['', '/', '/dashboard', 'https://a.b/c?d=e&f#g', '/a?b', '#', '?']) {
      expect(scrubUrl(url)).toBe(url);
      expect(hasSecrets(url)).toBe(false);
    }
    expect(hasSecrets('/reset-password?token=abc')).toBe(true);
  });
});

describe('scrubText', () => {
  it('redacts URLs embedded in error messages', () => {
    expect(
      scrubText('Http failure response for /api/v1/invitations/abc123: 500 Internal Server Error'),
    ).toBe(`Http failure response for /api/v1/invitations/${F}: 500 Internal Server Error`);
    expect(scrubText('GET /reset-password?token=abc&x=1 failed')).toContain(`token=${F}`);
    expect(scrubText('navigated from /a to /b?x=1&code=zz')).not.toContain('zz');
  });

  it('leaves ordinary text alone', () => {
    expect(scrubText('Something went wrong? Try again.')).toBe('Something went wrong? Try again.');
  });
});

describe('scrubQueryString', () => {
  it('handles string, pair-list and map shapes', () => {
    expect(scrubQueryString('token=a&b=1')).toBe(`token=${F}&b=1`);
    expect(scrubQueryString('?token=a')).toBe(`?token=${F}`);
    expect(
      scrubQueryString([
        ['token', 'a'],
        ['b', '1'],
      ]),
    ).toEqual([
      ['token', F],
      ['b', '1'],
    ]);
    expect(scrubQueryString({ Password: 'p', b: '1' })).toEqual({ Password: F, b: '1' });
  });
});

describe('scrubBreadcrumb', () => {
  it('scrubs navigation from/to and fetch/xhr urls', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/invite/accept?token=abc', to: '/invite/accept' },
      }),
    ).toEqual({
      category: 'navigation',
      data: { from: `/invite/accept?token=${F}`, to: '/invite/accept' },
    });

    expect(
      scrubBreadcrumb({
        category: 'xhr',
        data: { method: 'GET', url: '/api/v1/invitations/abc', status_code: 404 },
      }),
    ).toEqual({
      category: 'xhr',
      data: { method: 'GET', url: `/api/v1/invitations/${F}`, status_code: 404 },
    });
  });
});

describe('scrubEvent', () => {
  it('scrubs error events: request, transaction, message and exception values', () => {
    const event = scrubEvent({
      transaction: '/reset-password?token=abc',
      request: {
        url: 'https://app/reset-password?token=abc',
        query_string: [['token', 'abc']],
        headers: { Referer: 'https://app/invite/accept?token=xyz' },
      },
      exception: {
        values: [
          { type: 'Error', value: 'Http failure response for /api/v1/invitations/xyz: 500' },
        ],
      },
      breadcrumbs: [{ category: 'navigation', data: { to: '/reset-password?token=abc' } }],
    });

    const json = JSON.stringify(event);
    expect(json).not.toContain('abc');
    expect(json).not.toContain('xyz');
    expect(event.request.query_string).toEqual([['token', F]]);
  });

  it('scrubs transactions and spans', () => {
    const event = scrubEvent({
      type: 'transaction',
      transaction: '/invite/accept',
      contexts: { trace: { data: { 'url.full': 'https://app/invite/accept?token=abc' } } },
      spans: [
        {
          op: 'http.client',
          description: 'GET /api/v1/invitations/abc',
          data: { url: '/api/v1/invitations/abc', 'http.query': '?token=abc' },
        },
      ],
    });
    expect(JSON.stringify(event)).not.toContain('abc');
  });

  it('scrubs the visited URLs of replay events', () => {
    const event = scrubEvent({
      type: 'replay_event',
      urls: ['https://app/reset-password?token=abc'],
    });
    expect(event.urls).toEqual([`https://app/reset-password?token=${F}`]);
  });
});

describe('scrubRecordingEvent', () => {
  it('scrubs replay navigation and breadcrumb frames', () => {
    const event = scrubRecordingEvent({
      type: 5,
      timestamp: 1,
      data: {
        tag: 'performanceSpan',
        payload: { op: 'navigation.push', description: 'https://app/reset-password?token=abc' },
      },
    });
    expect(event.data.payload.description).toBe(`https://app/reset-password?token=${F}`);
  });
});
