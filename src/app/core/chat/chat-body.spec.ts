import { Block, Inline, parseBody, recordRefs, textWithTags } from './chat-body';
import { activeTag, decodeBody, encodeBody, prefixLines, wrapSelection } from './chat-compose';
import { badgeText, buildRows, snippetOf, upsertMessage } from './chat-format';
import { fakeMessage, KARI, ME } from './chat.testing';

const U = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';

function inline(blocks: Block[]): Inline[] {
  const first = blocks[0];
  return first?.kind === 'paragraph' ? [...first.inline] : [];
}

/** Every string anywhere in the tree (to prove nothing became markup). */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
}

describe('parseBody', () => {
  it('parses formatting, mentions, tags and links into a safe tree', () => {
    const tree = parseBody(
      `Hei [@Kari N](cf:user/${U}) og [@HMS](cf:team/${T}): **viktig** *nå* ~~ikke~~ \`kode\` #hms-runde https://example.no`,
    );
    const nodes = inline(tree);
    expect(nodes).toContainEqual({ kind: 'user', id: U, label: 'Kari N' });
    expect(nodes).toContainEqual({ kind: 'team', id: T, label: 'HMS' });
    expect(nodes).toContainEqual({ kind: 'tag', tag: 'hms-runde' });
    expect(nodes).toContainEqual({ kind: 'code', text: 'kode' });
    expect(nodes.some((n) => n.kind === 'strong')).toBe(true);
    expect(nodes.some((n) => n.kind === 'em')).toBe(true);
    expect(nodes.some((n) => n.kind === 'del')).toBe(true);
    expect(nodes).toContainEqual({
      kind: 'link',
      href: 'https://example.no',
      children: [{ kind: 'text', text: 'https://example.no' }],
    });
  });

  it('renders a paragraph of record links as cards and inline ones as chips', () => {
    const cards = parseBody(`[](cf:record/risk/${R})`);
    expect(cards).toEqual([{ kind: 'records', refs: [{ entity_type: 'risk', entity_id: R }] }]);
    const chip = inline(parseBody(`Se [](cf:record/deviation/${R}) her`));
    expect(chip).toContainEqual({
      kind: 'record',
      ref: { entity_type: 'deviation', entity_id: R },
    });
  });

  it('keeps hostile input as plain text', () => {
    const hostile = [
      '<img src=x onerror=alert(1)>',
      '<script>alert(1)</script>',
      '[klikk](javascript:alert(1))',
      '[data](data:text/html;base64,PHNjcmlwdD4=)',
      '![bilde](https://evil.example/x.png)',
      '# Overskrift',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '[@X](cf:user/not-a-uuid!)',
    ].join('\n\n');
    const tree = parseBody(hostile);
    const links = JSON.stringify(tree);
    expect(links).not.toContain('"kind":"link","href":"javascript');
    expect(links).not.toContain('"href":"data:');
    expect(links).not.toContain('"kind":"user"');
    // The raw text survives as text nodes, never as elements.
    expect(texts(tree).join(' ')).toContain('<img src=x onerror=alert(1)>');
    expect(texts(tree).join(' ')).toContain('# Overskrift');
  });

  it('limits lists to two levels', () => {
    const tree = parseBody('- a\n  - b\n    - c');
    const outer = tree[0] as Extract<Block, { kind: 'list' }>;
    expect(outer.kind).toBe('list');
    const inner = outer.items[0].find((b) => b.kind === 'list') as Extract<Block, { kind: 'list' }>;
    expect(inner.kind).toBe('list');
    expect(inner.items[0].some((b) => b.kind === 'list')).toBe(false);
  });

  it('does not tag inside words, paths or code', () => {
    expect(textWithTags('a#b /x#y #ok').filter((n) => n.kind === 'tag')).toEqual([
      { kind: 'tag', tag: 'ok' },
    ]);
    expect(inline(parseBody('`#ikke`')).some((n) => n.kind === 'tag')).toBe(false);
    expect(textWithTags('#Æøå_1').filter((n) => n.kind === 'tag')).toEqual([
      { kind: 'tag', tag: 'æøå_1' },
    ]);
  });

  it('collects record refs once', () => {
    expect(recordRefs(`[](cf:record/risk/${R}) [](cf:record/risk/${R})`)).toEqual([
      { entity_type: 'risk', entity_id: R },
    ]);
  });

  it('is empty for an empty body', () => {
    expect(parseBody('   ')).toEqual([]);
  });
});

describe('composer encoding', () => {
  it('turns chosen mentions and record chips into tokens', () => {
    const body = encodeBody({
      text: 'Hei @Kari Nordmann og @HMS, se `@Kari Nordmann`',
      mentions: [
        { type: 'user', id: U, name: 'Kari Nordmann' },
        { type: 'team', id: T, name: 'HMS' },
      ],
      records: [{ entity_type: 'risk', entity_id: R }],
    });
    expect(body).toBe(
      `Hei [@Kari Nordmann](cf:user/${U}) og [@HMS](cf:team/${T}), se \`@Kari Nordmann\`\n\n[](cf:record/risk/${R})`,
    );
  });

  it('does not match a longer name prefix', () => {
    const body = encodeBody({
      text: '@Kari Nordmannsen',
      mentions: [{ type: 'user', id: U, name: 'Kari Nordmann' }],
      records: [],
    });
    expect(body).toBe('@Kari Nordmannsen');
  });

  it('round-trips through decode for editing', () => {
    const draft = decodeBody(`Hei [@Kari](cf:user/${U})\n\n[](cf:record/risk/${R})`);
    expect(draft.text).toBe('Hei @Kari');
    expect(draft.mentions).toEqual([{ type: 'user', id: U, name: 'Kari' }]);
    expect(draft.records).toEqual([{ entity_type: 'risk', entity_id: R }]);
    expect(encodeBody(draft)).toBe(`Hei [@Kari](cf:user/${U})\n\n[](cf:record/risk/${R})`);
  });

  it('finds the #tag being typed', () => {
    expect(activeTag('se #hms', 7)).toEqual({ start: 3, query: 'hms' });
    expect(activeTag('se #', 4)).toEqual({ start: 3, query: '' });
    expect(activeTag('a#b', 3)).toBeNull();
  });

  it('wraps selections and prefixes lines', () => {
    expect(wrapSelection('abc', 0, 3, '**').text).toBe('**abc**');
    expect(prefixLines('a\nb', 0, 3, '- ').text).toBe('- a\n- b');
  });
});

describe('list helpers', () => {
  it('caps badges at 99+', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(5)).toBe('5');
    expect(badgeText(120)).toBe('99+');
  });

  it('builds snippets without markdown or record titles', () => {
    expect(snippetOf(`**Hei** [@Kari](cf:user/${U}) [](cf:record/risk/${R})`)).toBe('Hei @Kari');
  });

  it('groups by sender and places the unread divider before the first unread from others', () => {
    const a = fakeMessage({ seq: 1, sender: ME, created_at: '2026-11-19T09:00:00Z' });
    const b = fakeMessage({ seq: 2, sender: KARI, created_at: '2026-11-19T09:01:00Z' });
    const c = fakeMessage({ seq: 3, sender: KARI, created_at: '2026-11-19T09:02:00Z' });
    const rows = buildRows([a, b, c], 1, ME.id);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'message', 'unread', 'message', 'message']);
    const heads = rows
      .filter((r) => r.kind === 'message')
      .map((r) => (r as { head: boolean }).head);
    expect(heads).toEqual([true, true, false]);
  });

  it('replaces an optimistic message by client id and ignores older versions', () => {
    const pending = {
      ...fakeMessage({ client_id: 'cid', seq: Number.MAX_SAFE_INTEGER }),
      localState: 'pending' as const,
    };
    const echo = fakeMessage({ client_id: 'cid', seq: 7, change_seq: 7 });
    const list = upsertMessage([pending], echo);
    expect(list).toEqual([echo]);
    const stale = { ...echo, change_seq: 5, body: 'old' };
    expect(upsertMessage(list, stale)[0].body).toBe(echo.body);
  });
});
