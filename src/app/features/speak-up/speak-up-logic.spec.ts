import en from '../../../assets/i18n/speakup/en.json';
import nb from '../../../assets/i18n/speakup/nb.json';
import { expectKeyParity } from '../../../testing/i18n-parity';
import { CASE_TYPES, KINDS, Proposal, SPEAK_UP_TYPES } from './data/speak-up.models';
import {
  chipTypes,
  dueCell,
  fallbackForm,
  formFromProposal,
  needsCustomerName,
  nextStepKey,
  titleFrom,
  toRequest,
  whenText,
} from './speak-up-logic';

const PROPOSAL: Proposal = {
  type: 'data_breach',
  kind: null,
  title: 'Tapt PC på toget',
  description: 'Kari glemte PC-en.',
  severity: 'high',
  affected: [{ entity_type: 'customer', id: 'c1', label: 'Nordic Steel' }],
  owner: { user_id: 'u-sofie', name: 'Sofie Johansen', reason: 'personvernansvarlig' },
  due_at: '2026-11-25T14:10:00',
  deadline: { key: 'gdpr72h', params: { hours: 72 }, at: '2026-11-25T14:10:00' },
  immediate_actions: 'PC-en er sperret.',
  requirement_refs: ['GDPR art. 33'],
  rationale: 'Kundedata',
};

describe('speak-up i18n', () => {
  it('keeps en and nb at full key parity', () => {
    expectKeyParity(en, nb);
  });

  it('has a chip and a label for every type and a word for every kind', () => {
    for (const t of CASE_TYPES) {
      expect(nb.types[t].label, t).toBeTruthy();
    }
    for (const t of SPEAK_UP_TYPES) {
      expect(nb.types[t].chip, t).toBeTruthy();
    }
    for (const kinds of Object.values(KINDS)) {
      for (const k of kinds ?? []) {
        expect((nb.kinds as Record<string, string>)[k], k).toBeTruthy();
      }
    }
  });

  it('names no vendor or model', () => {
    expect(JSON.stringify([en, nb])).not.toMatch(/claude|anthropic|gpt|openai|bedrock/i);
  });
});

describe('speak-up logic', () => {
  it('offers the chips in prototype order, only the available ones', () => {
    expect(chipTypes(new Set(['improvement', 'deviation', 'data_breach']))).toEqual([
      'deviation',
      'data_breach',
      'improvement',
    ]);
  });

  it('makes a short title from free text', () => {
    expect(titleFrom('Kari glemte PC-en. Den har kundelisten.')).toBe('Kari glemte PC-en.');
    expect(titleFrom('x'.repeat(120)).length).toBe(80);
  });

  it('turns a proposal into the form; a legal deadline replaces the date field', () => {
    const form = formFromProposal(PROPOSAL);
    expect(form.ownerId).toBe('u-sofie');
    expect(form.due).toBe('');
    expect(form.immediate).toBe('PC-en er sperret.');
    const plain = formFromProposal({ ...PROPOSAL, type: 'deviation', deadline: null });
    expect(plain.due).toMatch(/^2026-11-2\d$/);
  });

  it('falls back to the chip, the text and the reporter when there is no proposal', () => {
    const now = new Date(2026, 10, 22, 10);
    const form = fallbackForm('Noen falt. Ingen ble skadet.', 'near_miss', 'me', now);
    expect(form).toMatchObject({
      type: 'near_miss',
      kind: 'near_miss',
      title: 'Noen falt.',
      severity: 'medium',
      ownerId: 'me',
      due: '2026-12-06',
    });
    expect(fallbackForm('Lekket', 'data_breach', null, now)).toMatchObject({
      severity: 'high',
      due: '',
      kind: null,
    });
  });

  it('builds the request; a customer name only for a complaint without a customer', () => {
    const form = { ...formFromProposal(PROPOSAL), customerName: 'X' };
    const body = toRequest(form);
    expect(body).toMatchObject({
      type: 'data_breach',
      kind: null,
      owner_user_id: 'u-sofie',
      due_at: null,
      affected: [{ entity_type: 'customer', id: 'c1' }],
      customer_name: null,
    });
    const complaint = { ...form, type: 'complaint' as const, affected: [], due: '2026-12-01' };
    expect(needsCustomerName(complaint)).toBe(true);
    expect(toRequest(complaint)).toMatchObject({
      customer_name: 'X',
      due_at: '2026-12-01T12:00:00',
    });
  });

  it('uses the no-date variant of a dated next step without a date', () => {
    expect(nextStepKey({ key: 'ownerFollowsUp', params: {}, url: null })).toBe(
      'speakup.next.ownerFollowsUpNoDate',
    );
    expect(nextStepKey({ key: 'ownerFollowsUp', params: { due: '2026-12-01' }, url: null })).toBe(
      'speakup.next.ownerFollowsUp',
    );
    expect(nextStepKey({ key: 'findCause', params: {}, url: null })).toBe('speakup.next.findCause');
  });

  it('shows the due column as the prototype does', () => {
    const now = new Date('2026-11-22T10:00:00Z');
    expect(dueCell({ due_at: null, tone: 'info' }, 'nb', now)).toBeNull();
    expect(dueCell({ due_at: '2026-11-20T10:00:00', tone: 'warn' }, 'nb', now)?.tone).toBe('bad');
    const soon = dueCell({ due_at: '2026-11-27T13:10:00', tone: 'bad' }, 'nb', now);
    expect(soon?.tone).toBe('bad');
    expect(soon?.text).toMatch(/^Fredag /);
    expect(dueCell({ due_at: '2026-12-30T10:00:00', tone: 'warn' }, 'nb', now)).toEqual({
      text: '30. des.',
      tone: null,
    });
  });

  it('says a near deadline as a weekday and time', () => {
    const now = new Date('2026-11-22T10:00:00Z');
    expect(whenText('2026-11-27T13:10:00', 'nb', now)).toMatch(/^fredag kl\. /);
    expect(whenText('2026-11-27T13:10:00', 'en', now)).toMatch(/^Friday /);
  });
});
