import { describe, expect, it, vi } from 'vitest';
import en from '../../../assets/i18n/hse/en.json';
import nb from '../../../assets/i18n/hse/nb.json';
import { Consultation, Ppe, Sja } from './data/hse.models';
import {
  consultationMissing,
  consultationPassed,
  consultationStatusSentence,
  ppeMissing,
  ppeStatusSentence,
  sjaMissing,
  sjaStatusSentence,
} from './hse-anatomy';

const keys = (items: { key: string }[]) => items.map((i) => i.key);
const NOW = Date.parse('2026-11-19T12:00:00Z');

function sja(over: Partial<Sja> = {}): Sja {
  return {
    id: 's1',
    code: 'SJA-0001',
    title: 'Job',
    status: 'draft',
    owner: { id: 'u1', name: 'Ola' },
    participants: ['Kari'],
    participant_users: [],
    steps: [{ description: 'Lift', hazards: ['Fall'], controls: ['Harness'] }],
    emergency_measures: 'Call 113',
    sign_off: { expected: 0, signed: 0, missing: [], complete: true },
    ppe_coverage: [],
    warnings: [],
    ...over,
  } as unknown as Sja;
}

function ppe(over: Partial<Ppe> = {}): Ppe {
  return {
    id: 'p1',
    code: 'PPE-0001',
    status: 'in_stock',
    expired: false,
    overdue: false,
    inspection_overdue: false,
    holder: null,
    holder_name: null,
    responsible: { id: 'u1', name: 'Ola' },
    next_inspection_at: '2027-01-01',
    inspection_interval_days: 365,
    ...over,
  } as unknown as Ppe;
}

function consultation(over: Partial<Consultation> = {}): Consultation {
  return {
    id: 'c1',
    code: 'WC-0001',
    status: 'planned',
    scheduled_at: '2026-12-01T10:00:00',
    held_at: null,
    topics: 'Noise',
    summary: null,
    decisions: null,
    worker_representatives: [],
    representative_users: [{ id: 'u2', name: 'Per' }],
    worker_representative_present: false,
    actions: { total: 0, open: 0, overdue: 0, done: 0 },
    owner: { id: 'u1', name: 'Ola' },
    ...over,
  } as unknown as Consultation;
}

const sjaOpts = { editLink: ['/edit'], editable: true, canWrite: true, showParticipants: null };

describe('SJA anatomy', () => {
  it('reads approved and completed as done, open work as amber, cancelled as neutral', () => {
    expect(sjaStatusSentence({ status: 'approved' }).tone).toBe('pass');
    expect(sjaStatusSentence({ status: 'completed' }).tone).toBe('pass');
    expect(sjaStatusSentence({ status: 'draft' }).tone).toBe('warn');
    expect(sjaStatusSentence({ status: 'in_review' }).tone).toBe('warn');
    expect(sjaStatusSentence({ status: 'cancelled' }).tone).toBe('neutral');
  });

  it('is empty for a complete draft', () => {
    expect(sjaMissing(sja(), sjaOpts)).toEqual([]);
  });

  it('asks for steps, hazards, participants, emergency measures and an owner while editable', () => {
    expect(
      keys(
        sjaMissing(
          sja({ steps: [], participants: [], emergency_measures: null, owner: null }),
          sjaOpts,
        ),
      ),
    ).toEqual(['steps', 'participants', 'emergency', 'owner']);
    const items = sjaMissing(
      sja({
        steps: [
          { description: 'a', hazards: ['x'], controls: ['y'] },
          { description: 'b', hazards: [], controls: ['y'] },
        ] as Sja['steps'],
      }),
      sjaOpts,
    );
    expect(items[0]).toMatchObject({ key: 'incomplete', params: { steps: '2' } });
    expect(sjaMissing(sja({ steps: [] }), { ...sjaOpts, editable: false })).toEqual([]);
  });

  it('counts missing sign-offs while signable and points at missing PPE', () => {
    const show = vi.fn();
    const items = sjaMissing(
      sja({
        status: 'approved',
        sign_off: { expected: 3, signed: 1, missing: [], complete: false },
        ppe_coverage: [
          { category: 'head', items: [], available: 0, warning: 'none', issue_url: '' },
        ] as unknown as Sja['ppe_coverage'],
      }),
      { ...sjaOpts, editable: false, showParticipants: show },
    );
    expect(keys(items)).toEqual(['signOff', 'ppe']);
    expect(items[0].params).toEqual({ count: 2 });
    items[0].action?.();
    expect(show).toHaveBeenCalled();
    expect(items[1].link).toEqual(['/hse/ppe/new']);
  });
});

describe('PPE anatomy', () => {
  it('says whether the item may be used', () => {
    expect(ppeStatusSentence(ppe()).tone).toBe('pass');
    expect(ppeStatusSentence(ppe({ status: 'issued', holder_name: 'Kari' }))).toEqual({
      key: 'hse.ppe.statusLine.issuedTo',
      params: { name: 'Kari' },
      tone: 'pass',
    });
    expect(ppeStatusSentence(ppe({ inspection_overdue: true })).tone).toBe('warn');
    expect(ppeStatusSentence(ppe({ expired: true })).tone).toBe('fail');
    expect(ppeStatusSentence(ppe({ status: 'retired', expired: true })).tone).toBe('neutral');
  });

  it('offers an inspection, a deviation after a failure, a plan and an owner', () => {
    const opts = { editLink: ['/edit'], canWrite: true, inspect: vi.fn(), deviation: null };
    expect(ppeMissing(ppe(), opts)).toEqual([]);
    expect(
      keys(
        ppeMissing(
          ppe({
            overdue: true,
            next_inspection_at: null,
            inspection_interval_days: null,
            responsible: null,
          }),
          { ...opts, deviation: vi.fn() },
        ),
      ),
    ).toEqual(['inspect', 'deviation', 'plan', 'owner']);
    expect(keys(ppeMissing(ppe({ expired: true }), opts))).toEqual(['expired']);
    expect(ppeMissing(ppe({ overdue: true }), { ...opts, canWrite: false })).toEqual([]);
    expect(ppeMissing(ppe({ status: 'retired', responsible: null }), opts)).toEqual([]);
  });
});

describe('consultation anatomy', () => {
  const fmt = (v: string) => `D(${v})`;

  it('reads the meeting state as a sentence', () => {
    expect(consultationStatusSentence(consultation(), fmt, NOW)).toEqual({
      key: 'hse.consultation.statusLine.plannedOn',
      params: { date: 'D(2026-12-01T10:00:00)' },
      tone: 'info',
    });
    expect(
      consultationStatusSentence(consultation({ scheduled_at: '2026-11-01T10:00:00' }), fmt, NOW)
        .key,
    ).toBe('hse.consultation.statusLine.passed');
    const held = consultation({ status: 'held', held_at: '2026-11-02T10:00:00' });
    expect(consultationStatusSentence(held, fmt, NOW)).toMatchObject({
      key: 'hse.consultation.statusLine.heldNoRepOn',
      tone: 'warn',
    });
    expect(
      consultationStatusSentence({ ...held, worker_representative_present: true }, fmt, NOW).tone,
    ).toBe('pass');
    expect(consultationStatusSentence(consultation({ status: 'cancelled' }), fmt, NOW).tone).toBe(
      'neutral',
    );
  });

  it('treats a past date as passed only while planned', () => {
    expect(
      consultationPassed({ status: 'planned', scheduled_at: '2026-11-01T10:00:00' }, NOW),
    ).toBe(true);
    expect(consultationPassed({ status: 'held', scheduled_at: '2026-11-01T10:00:00' }, NOW)).toBe(
      false,
    );
    expect(consultationPassed({ status: 'planned', scheduled_at: null }, NOW)).toBe(false);
  });

  it('lists what a planned and a held consultation still need', () => {
    const hold = vi.fn();
    const opts = { editLink: ['/edit'], canWrite: true, hold, now: NOW };
    expect(consultationMissing(consultation(), opts)).toEqual([]);
    const planned = consultationMissing(
      consultation({
        scheduled_at: '2026-11-01T10:00:00',
        topics: null,
        representative_users: [],
      }),
      opts,
    );
    expect(keys(planned)).toEqual(['hold', 'topics', 'reps']);
    planned[0].action?.();
    expect(hold).toHaveBeenCalled();

    const held = consultationMissing(
      consultation({
        status: 'held',
        decisions: 'Buy ear protection',
        actions: { total: 0, open: 0, overdue: 0, done: 0 },
      }),
      opts,
    );
    expect(held).toEqual([
      expect.objectContaining({ key: 'tasks', queryParams: { tab: 'tasks' } }),
    ]);
    expect(
      keys(
        consultationMissing(
          consultation({
            status: 'held',
            actions: { total: 2, open: 1, overdue: 1, done: 0 },
            owner: null,
          }),
          opts,
        ),
      ),
    ).toEqual(['outcome', 'overdue', 'owner']);
    expect(
      consultationMissing(consultation({ owner: null }), { ...opts, canWrite: false }),
    ).toEqual([]);
  });
});

describe('HSE anatomy i18n', () => {
  type Dict = Record<string, unknown>;
  const get = (dict: unknown, path: string) =>
    path.split('.').reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);

  it('has every status-sentence and missing key in en and nb', () => {
    const paths = [
      ...['draft', 'in_review', 'approved', 'completed', 'cancelled'].map(
        (k) => `sja.statusLine.${k}`,
      ),
      ...[
        'steps',
        'incomplete',
        'participants',
        'emergency',
        'owner',
        'signOff',
        'signOffOne',
        'ppe',
      ].map((k) => `sja.missing.${k}`),
      ...[
        'in_stock',
        'issued',
        'issuedTo',
        'out_of_service',
        'inspectionOverdue',
        'expired',
        'retired',
      ].map((k) => `ppe.statusLine.${k}`),
      ...['expired', 'inspect', 'deviation', 'plan', 'owner'].map((k) => `ppe.missing.${k}`),
      ...[
        'planned',
        'plannedOn',
        'passed',
        'held',
        'heldOn',
        'heldNoRep',
        'heldNoRepOn',
        'cancelled',
      ].map((k) => `consultation.statusLine.${k}`),
      ...[
        'hold',
        'date',
        'topics',
        'reps',
        'outcome',
        'tasks',
        'overdue',
        'overdueOne',
        'owner',
      ].map((k) => `consultation.missing.${k}`),
    ];
    for (const path of paths) {
      expect(typeof get(en, path), `en:${path}`).toBe('string');
      expect(typeof get(nb, path), `nb:${path}`).toBe('string');
    }
  });
});
