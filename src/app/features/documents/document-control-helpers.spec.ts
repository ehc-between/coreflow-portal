import { addAudience, audienceKey } from './campaigns/audience-editor';
import { campaignBody } from './campaigns/campaign-form';
import { campaignQuery } from './campaigns/campaign-list';
import { DiffBlock, DocumentType, RevisionHistoryItem } from './data/document-control.models';
import { safeExternalUrl } from './external/external-detail';
import { emptyExternalForm, externalBody } from './external/external-form';
import { externalQuery, parseExternalFilters } from './external/external-list';
import { diffRows } from './history/diff-view';
import { defaultPair } from './history/document-history';
import { parseRegisterFilters, registerQuery } from './register/document-register';
import { ruleBody } from './retention/retention-form';
import { cleanDraftHtml, draftInput } from './shared/ai-draft-panel';
import { endOfDay, intOrNull, portalLink, textOrNull } from './shared/document-control-display';
import { TYPE_KEY_PATTERN, typeBody, typeToForm } from './types/document-type-form';
import { matchesType } from './types/document-type-list';
import { isValidPattern, previewCode } from './types/numbering';

describe('numbering', () => {
  it('accepts the documented tokens and exactly one sequence', () => {
    expect(isValidPattern('{prefix}-{seq:03}')).toBe(true);
    expect(isValidPattern('{prefix}-{year}-{seq}')).toBe(true);
    expect(isValidPattern('{prefix}')).toBe(false);
    expect(isValidPattern('{seq}-{seq}')).toBe(false);
    expect(isValidPattern('{prefix}-{seq:9}')).toBe(false);
    expect(isValidPattern('{prefix}-{seq:0}')).toBe(false);
    expect(isValidPattern('{dept}-{seq}')).toBe(false);
  });

  it('previews the next code like the backend renders it', () => {
    expect(previewCode('', 'PR', 7)).toBe('PR-007');
    expect(previewCode('{prefix}-{year}-{seq:04}', 'WI', 12, 2026)).toBe('WI-2026-0012');
    expect(previewCode('{prefix}{seq}', 'P', 3)).toBe('P3');
    expect(previewCode('{prefix}', 'P', 3)).toBeNull();
  });
});

describe('document type form', () => {
  it('validates type keys', () => {
    expect(TYPE_KEY_PATTERN.test('procedure')).toBe(true);
    expect(TYPE_KEY_PATTERN.test('wi.v2_x-1')).toBe(true);
    expect(TYPE_KEY_PATTERN.test('-bad')).toBe(false);
    expect(TYPE_KEY_PATTERN.test('has space')).toBe(false);
    expect(TYPE_KEY_PATTERN.test('a'.repeat(33))).toBe(false);
  });

  it('round-trips a type and clears blank optionals', () => {
    const type = {
      key: 'procedure',
      name: 'Procedure',
      description: null,
      numbering_prefix: 'PR',
      numbering_pattern: null,
      next_number: 4,
      default_review_interval_months: 24,
      default_acknowledgement_required: true,
      retention_rule_id: null,
      active: true,
    } as unknown as DocumentType;
    const form = typeToForm(type);
    expect(form.interval).toBe('24');
    expect(typeBody({ ...form, description: '  ' })).toEqual({
      key: 'procedure',
      name: 'Procedure',
      description: null,
      numbering_prefix: 'PR',
      numbering_pattern: null,
      default_review_interval_months: 24,
      default_acknowledgement_required: true,
      retention_rule_id: null,
      active: true,
    });
  });

  it('searches name, key and prefix', () => {
    const t = { name: 'Work instruction', key: 'wi', numbering_prefix: 'AI' } as DocumentType;
    expect(matchesType(t, 'work')).toBe(true);
    expect(matchesType(t, 'AI')).toBe(true);
    expect(matchesType(t, 'policy')).toBe(false);
  });
});

describe('display helpers', () => {
  it('normalises form values', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' a ')).toBe('a');
    expect(intOrNull('')).toBeNull();
    expect(intOrNull('12')).toBe(12);
    expect(intOrNull('1.5')).toBeNull();
    expect(endOfDay('')).toBeNull();
    expect(endOfDay('2026-12-01')).toBe('2026-12-01T23:59:59');
  });

  it('only routes to portal paths', () => {
    expect(portalLink('/documents/external/x')).toBe('/documents/external/x');
    expect(portalLink('https://evil.example')).toBeNull();
    expect(portalLink('//evil.example')).toBeNull();
    expect(portalLink(null)).toBeNull();
  });

  it('only links http(s) external URLs', () => {
    expect(safeExternalUrl(' https://standard.no/x ')).toBe('https://standard.no/x');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});

describe('campaign helpers', () => {
  it('de-duplicates audience entries and lets "all" replace the rest', () => {
    let list = addAudience([], { type: 'role', value: 'member' });
    list = addAudience(list, { type: 'role', value: 'member' });
    list = addAudience(list, { type: 'user', value: 'u1' });
    expect(list.map(audienceKey)).toEqual(['role:member', 'user:u1']);
    expect(addAudience(list, { type: 'all' })).toEqual([{ type: 'all' }]);
    expect(addAudience([{ type: 'all' }], { type: 'user', value: 'u2' })).toEqual([
      { type: 'user', value: 'u2' },
    ]);
  });

  it('builds the create body', () => {
    expect(
      campaignBody({
        documentId: 'd1',
        title: ' ',
        message: 'Please read',
        requireAck: true,
        audience: [{ type: 'all' }],
        due: '2026-12-01',
        launch: false,
      }),
    ).toEqual({
      document_id: 'd1',
      title: null,
      message: 'Please read',
      require_acknowledgement: true,
      audience: [{ type: 'all' }],
      due_at: '2026-12-01T23:59:59',
      launch: false,
    });
  });

  it('maps the status filter', () => {
    expect(campaignQuery('open', '-created_at', '', 0).status).toEqual(['draft', 'active']);
    expect(campaignQuery('all', '-created_at', '', 0).status).toEqual([]);
    expect(campaignQuery('closed', 'title', 'x', 50)).toMatchObject({
      status: ['closed'],
      q: 'x',
      offset: 50,
    });
  });
});

describe('list filters', () => {
  it('parses master-list saved views and builds the query', () => {
    const f = parseRegisterFilters({ status: 'approved', mine: '1', external: '0', sort: 'bad' });
    expect(f).toMatchObject({ status: 'approved', mine: true, external: false, sort: 'code' });
    expect(registerQuery(f, 'q', 'me-id', 0)).toMatchObject({
      q: 'q',
      status: 'approved',
      owner: 'me-id',
      include_external: false,
    });
    expect(parseRegisterFilters({ status: 'nonsense' }).status).toBe('');
  });

  it('parses external-document views and builds the query', () => {
    const f = parseExternalFilters({ status: 'all', reviewDue: '1' });
    expect(externalQuery(f, '', null, 0)).toMatchObject({ status: [], review_due: true });
    expect(externalQuery(parseExternalFilters({}), '', null, 0).status).toEqual(['current']);
  });
});

describe('external document form', () => {
  it('sends blank optionals as null', () => {
    const body = externalBody({ ...emptyExternalForm('u1'), title: ' ISO 9001 ', interval: '12' });
    expect(body).toMatchObject({
      title: 'ISO 9001',
      publisher: null,
      owner_user_id: 'u1',
      review_interval_months: 12,
      next_review_at: null,
      status: 'current',
    });
  });
});

describe('retention rule form', () => {
  const base = {
    name: 'Quality records',
    description: '',
    appliesTo: 'document' as const,
    months: '60',
    trigger: 'obsoleted' as const,
    disposition: 'destroy' as const,
    legalBasis: '',
    active: true,
  };

  it('requires a name and a period in range', () => {
    expect(ruleBody(base)?.retention_months).toBe(60);
    expect(ruleBody({ ...base, months: '0' })?.retention_months).toBe(0);
    expect(ruleBody({ ...base, months: '' })).toBeNull();
    expect(ruleBody({ ...base, months: '1201' })).toBeNull();
    expect(ruleBody({ ...base, name: ' ' })).toBeNull();
  });
});

describe('revision compare', () => {
  it('compares the newest revision with the previous one by default', () => {
    const items = [{ id: 'r3' }, { id: 'r2' }, { id: 'r1' }] as RevisionHistoryItem[];
    expect(defaultPair(items)).toEqual({ from: 'r2', to: 'r3' });
    expect(defaultPair(items.slice(0, 1))).toBeNull();
  });

  it('collapses long unchanged runs and renders word changes inline', () => {
    const blocks: DiffBlock[] = [
      { op: 'equal', before: ['a', 'b', 'c', 'd', 'e'], after: ['a', 'b', 'c', 'd', 'e'] },
      {
        op: 'replace',
        before: ['old text'],
        after: ['new text'],
        segments: [
          { op: 'delete', text: 'old' },
          { op: 'insert', text: 'new' },
          { op: 'equal', text: ' text' },
        ],
      },
      { op: 'replace', before: ['x'], after: ['y'] },
      { op: 'insert', before: [], after: ['added'] },
      { op: 'delete', before: ['gone'], after: [] },
    ];
    const rows = diffRows(blocks);
    expect(rows.map((r) => r.kind)).toEqual([
      'equal',
      'skip',
      'equal',
      'inline',
      'delete',
      'insert',
      'insert',
      'delete',
    ]);
    expect(rows[1]).toEqual({ kind: 'skip', count: 3, blockIndex: 0 });
    expect(
      diffRows(blocks, new Set([0]))
        .slice(0, 5)
        .every((r) => r.kind === 'equal'),
    ).toBe(true);
  });
});

describe('AI draft helpers', () => {
  it('strips a code fence around the HTML', () => {
    expect(cleanDraftHtml('```html\n<h2>Purpose</h2>\n```')).toBe('<h2>Purpose</h2>');
    expect(cleanDraftHtml('  <p>x</p> ')).toBe('<p>x</p>');
  });

  it('sends only the inputs that were given', () => {
    expect(
      draftInput({ title: ' Complaints ', requirementRef: 'iso9001:9.1.2', instructions: ' ' }),
    ).toEqual({ title: 'Complaints', requirement_ref: 'iso9001:9.1.2' });
  });
});
