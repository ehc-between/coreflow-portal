import en from '../../../../assets/i18n/hubs/en.json';
import nb from '../../../../assets/i18n/hubs/nb.json';
import { expectKeyParity } from '../../../../testing/i18n-parity';
import { COMPANY_TILES, TOPIC_TILES, companyTiles, topicTiles } from '../company-tiles';
import {
  actionTone,
  actionsFor,
  buildTiles,
  countFor,
  daysUntil,
  frameworksInScope,
  isCeoTitle,
  monthYear,
  nextExternalAudit,
  profileFacts,
  siteTowns,
} from './hub-data';
import { action, loc } from './hub.testing';

function get(dict: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], dict);
}

describe('hubs i18n', () => {
  it('keeps en and nb at full key parity', () => expectKeyParity(en, nb));

  it('labels every hub card in both languages', () => {
    for (const lang of [en, nb]) {
      for (const tile of COMPANY_TILES) {
        expect(typeof get(lang, `company.tiles.${tile.key}.label`), tile.key).toBe('string');
        expect(typeof get(lang, `company.tiles.${tile.key}.hint`), tile.key).toBe('string');
      }
      for (const tile of TOPIC_TILES) {
        expect(typeof get(lang, `topics.tiles.${tile.key}.label`), tile.key).toBe('string');
      }
    }
  });

  it('uses the prototype wording in nb and no vendor names', () => {
    expect(nb.company.eyebrow).toBe('Bedriften på én side');
    expect(nb.company.hubTitle).toBe('Alt om bedriften');
    expect(nb.people.intro).toBe('Alle som jobber for dere, hva de kan, og hva de må lære.');
    expect(JSON.stringify([en, nb])).not.toMatch(/claude|anthropic|gpt|openai/i);
  });
});

describe('hub counts', () => {
  const items = [
    loc('risk.risks', 7),
    loc('risk.opportunities', 2),
    loc('projects.register', null),
  ];

  it('sums the counts of the present keys, null when none is present', () => {
    expect(countFor(items, ['risk.risks', 'risk.opportunities'])).toBe(9);
    expect(countFor(items, ['projects.register'])).toBe(0);
    expect(countFor(items, ['context.scopes'])).toBeNull();
  });

  it('builds cards only for places that exist, in spec order', () => {
    const tiles = buildTiles(
      [
        { key: 'projects', locations: ['projects.register'], link: '/projects' },
        { key: 'scope', locations: ['context.scopes'], link: '/context/scopes' },
        { key: 'risk', locations: ['risk.risks', 'risk.opportunities'], link: '/risk' },
      ],
      items,
      'p',
    );
    expect(tiles.map((t) => [t.key, t.count, t.labelKey])).toEqual([
      ['projects', 0, 'p.projects.label'],
      ['risk', 9, 'p.risk.label'],
    ]);
  });

  it('shows the policy documents count on the Policyer card when known', () => {
    const base = [loc('context.policies', 2), loc('processes.register', 4)];
    expect(companyTiles(base, null).find((t) => t.key === 'policies')?.count).toBe(2);
    expect(companyTiles(base, 5).find((t) => t.key === 'policies')?.count).toBe(5);
    expect(companyTiles(base, 5).find((t) => t.key === 'processes')?.link).toBe('/handbook');
  });

  it('gives each topic a status line from its module next actions', () => {
    const tiles = topicTiles(
      [loc('privacy.ropa', 4), loc('environment.aspects', 6)],
      [action('privacy'), action('privacy', 'overdue', 'p2'), action('risk')],
    );
    expect(tiles.map((t) => [t.key, t.count, t.status?.key, t.status?.params])).toEqual([
      ['privacy', 4, 'hubs.topics.status.attention', { count: 2 }],
      ['environment', 6, 'hubs.topics.status.ok', undefined],
    ]);
  });
});

describe('next actions', () => {
  it('colours by kind like the prototype dots', () => {
    expect(actionTone('overdue')).toBe('bad');
    expect(actionTone('review')).toBe('warn');
    expect(actionTone('due_soon')).toBe('warn');
    expect(actionTone('gap')).toBe('info');
  });

  it('keeps the actions of the given modules, in order, up to max', () => {
    const list = [
      action('people', 'gap', 'a'),
      action(null),
      action('training', 'gap', 'b'),
      action('people', 'gap', 'c'),
    ];
    expect(actionsFor(list, ['people', 'training'], 2).map((a) => a.key)).toEqual(['a', 'b']);
  });
});

describe('company profile', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    `${key}${params ? JSON.stringify(params) : ''}`;

  it('lists towns once, falling back to the site name', () => {
    expect(
      siteTowns([
        { name: 'HQ', country: 'NO', city: 'Oslo' },
        { name: 'Lager', country: 'NO', city: ' ' },
        { name: 'Avd', country: 'NO', city: 'Oslo' },
      ]),
    ).toEqual(['Oslo', 'Lager']);
  });

  it('builds the fact line from what the profile has', () => {
    const facts = profileFacts(
      {
        org_number: '912 345 678',
        industry: 'Stål',
        size_band: '11-50',
        sites: [
          { name: 'a', country: 'NO', city: 'Oslo' },
          { name: 'b', country: 'NO', city: 'Bergen' },
        ],
      },
      t,
      'nb-NO',
    );
    expect(facts).toEqual([
      'hubs.company.orgNumber{"value":"912 345 678"}',
      'Stål',
      'hubs.company.employees{"value":"11–50"}',
      'Oslo og Bergen',
    ]);
    expect(
      profileFacts({ org_number: null, industry: null, size_band: null, sites: [] }, t, 'nb-NO'),
    ).toEqual([]);
  });

  it('takes the in-scope frameworks', () => {
    expect(
      frameworksInScope({
        frameworks: ['iso9001', 'gdpr'],
        standards: [
          {
            framework: 'iso9001',
            standard_key: 'x',
            in_scope: true,
            standard_enabled: true,
            available: true,
          },
          {
            framework: 'gdpr',
            standard_key: 'y',
            in_scope: false,
            standard_enabled: false,
            available: true,
          },
        ],
      }),
    ).toEqual(['iso9001']);
    expect(frameworksInScope({ frameworks: ['nis2'] })).toEqual(['nis2']);
  });

  it('recognises the managing director position', () => {
    expect(isCeoTitle('Daglig leder')).toBe(true);
    expect(isCeoTitle('CEO')).toBe(true);
    expect(isCeoTitle('Administrerende direktør')).toBe(true);
    expect(isCeoTitle('Kvalitetsleder')).toBe(false);
    expect(isCeoTitle(null)).toBe(false);
  });

  it('finds the earliest upcoming external audit', () => {
    const now = new Date(2026, 10, 22);
    expect(
      nextExternalAudit(
        [
          {
            framework: 'iso9001',
            status: 'certified',
            next_surveillance_at: '2027-01-11T09:00:00',
            expires_at: '2028-05-20',
          },
          { framework: 'iso27001', status: 'planned', next_surveillance_at: '2026-12-01T09:00:00' },
          {
            framework: 'iso14001',
            status: 'certified',
            next_surveillance_at: '2026-01-01',
            expires_at: '2026-12-31',
          },
          { framework: 'nis2', status: 'withdrawn', next_surveillance_at: '2026-11-25' },
        ],
        now,
      ),
    ).toEqual({ framework: 'iso27001', date: '2026-12-01T09:00:00' });
    expect(nextExternalAudit([], now)).toBeNull();
  });

  it('formats month and year, and counts days', () => {
    expect(monthYear('2027-03-15', 'nb-NO')).toBe('Mars 2027');
    expect(monthYear('2027-03-15', 'en-GB')).toBe('March 2027');
    expect(monthYear('nope', 'nb-NO')).toBe('');
    const now = new Date(2026, 10, 22, 15);
    expect(daysUntil('2026-11-25T12:00:00', now)).toBe(3);
    expect(daysUntil('2026-11-20T12:00:00', now)).toBe(-2);
  });
});
