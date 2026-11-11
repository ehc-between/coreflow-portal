import { camelCase, humanize } from '../../core/kit/entity-types.service';
import { CommentItem } from '../../core/kit/kit.models';
import { buildThreads } from './comments';
import { displayValue, fieldLabel, inlineValue, linkTypeKey } from './kit-format';
import {
  activeMention,
  bodySegments,
  filterCandidates,
  insertMention,
  mentionsInBody,
} from './mentions';
import { splitLabelKey } from './timeline';

describe('mention helpers', () => {
  it('detects the @query being typed', () => {
    expect(activeMention('Hi @ad', 6)).toEqual({ start: 3, query: 'ad' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
    expect(activeMention('Hi @Ada Love', 12)).toEqual({ start: 3, query: 'Ada Love' });
    expect(activeMention('mail a@b.no', 11)).toBeNull();
    expect(activeMention('no mention', 10)).toBeNull();
    expect(activeMention('@ada\nnext', 9)).toBeNull();
  });

  it('inserts the chosen name and moves the caret after it', () => {
    const text = 'Hi @ad please';
    const mention = activeMention(text, 6)!;
    expect(insertMention(text, mention, 6, 'Ada Lovelace')).toEqual({
      text: 'Hi @Ada Lovelace  please',
      caret: 17,
    });
  });

  it('ranks candidates by prefix, word prefix, then substring', () => {
    const people = [
      { id: '1', name: 'Bob Adams' },
      { id: '2', name: 'Ada Lovelace' },
      { id: '3', name: 'Kari Nordmann', email: 'adm@x.no' },
      { id: '4', name: 'Zed' },
    ];
    expect(filterCandidates(people, 'ad').map((p) => p.id)).toEqual(['2', '1', '3']);
    expect(filterCandidates(people, '', 2)).toHaveLength(2);
  });

  it('keeps only mentions still present in the body, once each', () => {
    const chosen = [
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Bob' },
      { id: '1', name: 'Ada' },
    ];
    expect(mentionsInBody('Thanks @Ada!', chosen)).toEqual([{ id: '1', name: 'Ada' }]);
  });

  it('splits a body into mention segments, longest name first', () => {
    expect(bodySegments('Hi @Ada Lovelace and @Ada', ['Ada', 'Ada Lovelace'])).toEqual([
      { text: 'Hi ', mention: false },
      { text: '@Ada Lovelace', mention: true },
      { text: ' and ', mention: false },
      { text: '@Ada', mention: true },
    ]);
    expect(bodySegments('a (b)', [])).toEqual([{ text: 'a (b)', mention: false }]);
  });
});

describe('format helpers', () => {
  it('formats snapshot values', () => {
    expect(displayValue(null).empty).toBe(true);
    expect(displayValue([]).empty).toBe(true);
    expect(displayValue(true, 'Ja', 'Nei').text).toBe('Ja');
    expect(displayValue(['a', 'b']).text).toBe('a, b');
    expect(displayValue({ a: 1 }).block).toBe(true);
    expect(displayValue('line\nline').block).toBe(true);
    expect(inlineValue(null, '(empty)')).toBe('(empty)');
    expect(inlineValue('x'.repeat(100), '-')).toHaveLength(80);
  });

  it('labels fields from i18n keys, else humanized', () => {
    const t = (k: string) => (k === 'x.title' ? 'Title' : k);
    expect(fieldLabel('title', { title: 'x.title' }, t)).toBe('Title');
    expect(fieldLabel('due_at', { due_at: 'x.missing' }, t)).toBe('Due at');
    expect(fieldLabel('owner_user_id', undefined, t)).toBe('Owner user id');
  });

  it('maps link types to their wording keys', () => {
    expect(linkTypeKey('caused_by', 'incoming')).toBe('kit.linkTypes.caused_by.incoming');
    expect(linkTypeKey('future_type', 'name')).toBe('kit.linkTypes.other.name');
  });

  it('splits scoped label keys and camel-cases scopes', () => {
    expect(splitLabelKey('kit:timeline.commentCreated')).toEqual({
      scope: 'kit',
      key: 'timeline.commentCreated',
    });
    expect(splitLabelKey('plain.key')).toEqual({ scope: null, key: 'plain.key' });
    expect(camelCase('management-review')).toBe('managementReview');
    expect(camelCase('ai_governance')).toBe('aiGovernance');
    expect(humanize('risk_treatment')).toBe('Risk treatment');
  });
});

describe('buildThreads', () => {
  const c = (id: string, parent_id: string | null = null): CommentItem => ({
    id,
    entity_type: 'deviation',
    entity_id: 'd1',
    parent_id,
    author: { id: 'u1', name: 'Ada' },
    body: id,
    mentions: [],
    created_at: '2026-11-01T10:00:00',
    edited_at: null,
    can_edit: true,
    can_delete: true,
  });

  it('nests replies of replies under the thread start', () => {
    const threads = buildThreads([c('a'), c('b'), c('a1', 'a'), c('a1x', 'a1'), c('gone', 'zz')]);
    expect(threads.map((t) => t.root.id)).toEqual(['a', 'b', 'gone']);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['a1', 'a1x']);
  });
});
