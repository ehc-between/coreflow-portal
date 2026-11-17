import askEn from '../../../assets/i18n/ask/en.json';
import askNb from '../../../assets/i18n/ask/nb.json';
import { HOWTO_ENTRIES, HowtoEntry, isHowtoQuestion, matchHowtos, queryTerms } from './ask-howto';
import { moduleFromUrl, moduleIcon, recordIcon } from './ask-icons';
import { answerRecords } from './ask-panel';
import { statusLabel } from './ask-status';
import { suggestionKeys, suggestionSet } from './ask-suggestions';

const dict: Record<string, string> = {
  'ask.status.categories.listing': 'Går gjennom registeret …',
  'ask.status.categories.working': 'Arbeider …',
  'ask.status.typed.listing': 'Går gjennom registeret «{{type}}» …',
};
const translate = (key: string, params?: Record<string, unknown>) =>
  (dict[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));

describe('statusLabel', () => {
  const types = (t: string) => (t === 'supplier' ? 'Leverandør' : null);

  it('names the record type when the category reads better with it', () => {
    expect(
      statusLabel(
        { text: 'Looking…', category: 'listing', params: { entity_type: 'supplier' } },
        translate,
        types,
        'nb',
      ),
    ).toBe('Går gjennom registeret «Leverandør» …');
  });

  it('uses the plain category for an unknown type', () => {
    expect(
      statusLabel(
        { text: 'Looking…', category: 'listing', params: { entity_type: 'mystery' } },
        translate,
        types,
        'nb',
      ),
    ).toBe('Går gjennom registeret …');
  });

  it('never shows the English fallback text in an nb session', () => {
    expect(statusLabel({ text: 'Looking through your records…' }, translate, types, 'nb')).toBe(
      'Arbeider …',
    );
    expect(
      statusLabel({ text: 'Thinking…', category: 'something_new' }, translate, types, 'nb'),
    ).toBe('Arbeider …');
  });

  it('keeps the English text from an older server in an English session', () => {
    expect(statusLabel({ text: 'Looking through your records…' }, translate, types, 'en')).toBe(
      'Looking through your records…',
    );
  });
});

describe('suggestions per page', () => {
  it('picks the set that fits the page', () => {
    expect(suggestionSet(null)).toBe('general');
    expect(
      suggestionSet({ module: 'standards', entityType: 'standard_requirement', view: 'detail' }),
    ).toBe('requirement');
    expect(suggestionSet({ module: 'standards', entityType: 'standard', view: 'detail' })).toBe(
      'standard',
    );
    expect(suggestionSet({ module: null, view: 'dashboard' })).toBe('dashboard');
    expect(
      suggestionSet({ module: 'risk', entityType: 'risk', entityId: 'x', view: 'detail' }),
    ).toBe('record');
    expect(suggestionSet({ module: 'risk', view: 'new' })).toBe('form');
    expect(suggestionSet({ module: 'suppliers', view: 'list' })).toBe('list');
    expect(suggestionSet({ module: null, view: 'list' })).toBe('myWork');
    expect(suggestionSet({ module: 'suppliers', view: 'other' })).toBe('list');
    expect(suggestionSet({ module: null, view: 'settings' })).toBe('settings');
  });

  it('asks "what is missing" first on a requirement', () => {
    const keys = suggestionKeys({
      module: 'standards',
      entityType: 'standard_requirement',
      view: 'detail',
    });
    expect(keys[0]).toBe('ask.suggest.reqMissing');
    expect(askNb.suggest.reqMissing).toBe('Hva mangler for dette kravet?');
  });
});

describe('how-to matching', () => {
  const text = (file: typeof askEn) => (entry: HowtoEntry) => {
    const h = (file.howto as Record<string, { title: string; question: string; keywords: string }>)[
      entry.key
    ];
    return `${h.title} ${h.question} ${h.keywords}`;
  };

  it('finds topics by prefix in nb and en', () => {
    expect(matchHowtos('hvordan godkjenner jeg et dokument', text(askNb))[0].key).toBe(
      'approveDocument',
    );
    expect(matchHowtos('registrere avvik', text(askNb))[0].key).toBe('registerDeviation');
    expect(matchHowtos('invite colleague', text(askEn))[0].key).toBe('inviteUser');
    expect(matchHowtos('personvernbrudd', text(askNb))[0].key).toBe('registerBreach');
  });

  it('a bare "how to" lists the first topics, a miss lists none', () => {
    expect(matchHowtos('hvordan', text(askNb)).length).toBe(4);
    expect(matchHowtos('xyzzy', text(askNb))).toEqual([]);
    expect(matchHowtos('RSK-0001', text(askEn))).toEqual([]);
  });

  it('drops stop words and recognises how-to questions', () => {
    expect(queryTerms('How do I invite a colleague?')).toEqual(['invite', 'colleague']);
    expect(isHowtoQuestion('Hvordan gjør jeg det')).toBe(true);
    expect(isHowtoQuestion('leverandører')).toBe(false);
  });

  it('every entry has a module the app knows (or none)', () => {
    for (const entry of HOWTO_ENTRIES) {
      expect(entry.module === null || typeof entry.module === 'string').toBe(true);
    }
  });
});

describe('answer records and icons', () => {
  it('lists link events first, then sources not already linked, with safe urls only', () => {
    const records = answerRecords({
      links: [
        {
          entity_type: 'supplier',
          entity_id: 's1',
          title: 'Fjord Cloud Hosting',
          code: 'SUP-0002',
          url: '/suppliers/s1',
        },
        {
          entity_type: 'risk',
          entity_id: 'r1',
          title: 'Backup failure',
          code: 'RSK-0001',
          url: 'https://evil.example',
        },
      ],
      sources: [
        { id: 'd1', title: 'Purchasing procedure', doc_code: 'PRO-004' },
        {
          id: 's1',
          title: 'Fjord Cloud Hosting',
          doc_code: '',
          entity_type: 'supplier',
          url: '/suppliers/s1',
        },
      ],
    });
    expect(records.map((r) => r.code)).toEqual(['SUP-0002', 'RSK-0001', 'PRO-004']);
    expect(records[0]).toMatchObject({ module: 'suppliers', icon: 'link', url: '/suppliers/s1' });
    expect(records[1].url).toBeNull();
    expect(records[2]).toMatchObject({
      entity_type: 'document',
      url: '/documents/d1',
      icon: 'documents',
    });
  });

  it('uses the module nav icon for module records', () => {
    expect(moduleIcon('privacy')).toBe('shield');
    expect(moduleIcon('nope')).toBeNull();
    expect(recordIcon('ropa_entry', 'privacy')).toBe('shield');
    expect(recordIcon('deviation', 'deviations')).toBe('alert');
    expect(recordIcon('unknown', null)).toBe('link');
    expect(moduleFromUrl('/ai-governance/systems/x')).toBe('ai_governance');
    expect(moduleFromUrl('/privacy/ropa/x?tab=1')).toBe('privacy');
    expect(moduleFromUrl('https://x.example/privacy')).toBeNull();
    expect(moduleFromUrl(null)).toBeNull();
  });
});
