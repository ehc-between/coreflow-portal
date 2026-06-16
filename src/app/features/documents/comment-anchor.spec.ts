import { anchorFromSelection, findAnchorRange, resolveOffset } from './comment-anchor';

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** Build a Selection over the `n`-th occurrence of `quote` within `root`. */
function selectText(root: HTMLElement, quote: string): Selection {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const index = (node.textContent ?? '').indexOf(quote);
    if (index !== -1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + quote.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection;
    }
    node = walker.nextNode() as Text | null;
  }
  throw new Error(`quote not found: ${quote}`);
}

describe('comment-anchor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  describe('anchorFromSelection', () => {
    it('computes quote, prefix and offsets from a selection', () => {
      const root = makeRoot('<p>The quick brown fox jumps over the lazy dog.</p>');
      const anchor = anchorFromSelection(root, selectText(root, 'brown fox'));

      expect(anchor).not.toBeNull();
      expect(anchor!.quote).toBe('brown fox');
      expect(anchor!.start).toBe('The quick '.length);
      expect(anchor!.end).toBe('The quick brown fox'.length);
      expect(anchor!.prefix).toBe('The quick ');
    });

    it('caps the prefix at 40 characters', () => {
      const lead = 'x'.repeat(80);
      const root = makeRoot(`<p>${lead}TARGET tail</p>`);
      const anchor = anchorFromSelection(root, selectText(root, 'TARGET'));

      expect(anchor!.prefix).toHaveLength(40);
      expect(anchor!.prefix).toBe('x'.repeat(40));
    });

    it('counts offsets across multiple block elements', () => {
      const root = makeRoot('<h1>Title</h1><p>Body text here</p>');
      const anchor = anchorFromSelection(root, selectText(root, 'text'));

      expect(anchor!.start).toBe('TitleBody '.length);
      expect(anchor!.quote).toBe('text');
    });

    it('returns null for a collapsed or absent selection', () => {
      const root = makeRoot('<p>Hello</p>');
      expect(anchorFromSelection(root, null)).toBeNull();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      expect(anchorFromSelection(root, selection)).toBeNull();
    });
  });

  describe('resolveOffset', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';

    it('uses stored offsets when they still spell the quote', () => {
      expect(
        resolveOffset(text, {
          anchor_quote: 'brown',
          anchor_prefix: 'quick ',
          anchor_start: 10,
          anchor_end: 15,
        }),
      ).toBe(10);
    });

    it('falls back to prefix + quote when offsets have shifted', () => {
      const shifted = 'PREPENDED. ' + text;
      const start = shifted.indexOf('brown');
      expect(
        resolveOffset(shifted, {
          anchor_quote: 'brown',
          anchor_prefix: 'quick ',
          anchor_start: 10,
          anchor_end: 15,
        }),
      ).toBe(start);
    });

    it('disambiguates repeated quotes via the prefix', () => {
      const repeated = 'cat dog cat fish cat bird';
      // Bare search would return the first "cat"; the prefix points to the third.
      expect(
        resolveOffset(repeated, {
          anchor_quote: 'cat',
          anchor_prefix: 'fish ',
          anchor_start: 999,
          anchor_end: 1002,
        }),
      ).toBe(repeated.indexOf('fish cat') + 'fish '.length);
    });

    it('returns null when the quote is gone', () => {
      expect(
        resolveOffset(text, {
          anchor_quote: 'absent',
          anchor_prefix: '',
          anchor_start: 0,
          anchor_end: 6,
        }),
      ).toBeNull();
    });
  });

  describe('findAnchorRange', () => {
    it('round-trips a selection back to the same text', () => {
      const root = makeRoot('<p>The quick brown fox jumps.</p>');
      const anchor = anchorFromSelection(root, selectText(root, 'brown fox'))!;

      const range = findAnchorRange(root, {
        anchor_quote: anchor.quote,
        anchor_prefix: anchor.prefix,
        anchor_start: anchor.start,
        anchor_end: anchor.end,
      });

      expect(range).not.toBeNull();
      expect(range!.toString()).toBe('brown fox');
    });

    it('relocates the quote across block boundaries via fallback', () => {
      const root = makeRoot('<h2>Section</h2><p>important clause</p>');
      const range = findAnchorRange(root, {
        anchor_quote: 'important clause',
        anchor_prefix: 'Section',
        anchor_start: 999,
        anchor_end: 1015,
      });

      expect(range!.toString()).toBe('important clause');
    });

    it('returns null when the anchor text cannot be found', () => {
      const root = makeRoot('<p>Nothing relevant here.</p>');
      const range = findAnchorRange(root, {
        anchor_quote: 'missing text',
        anchor_prefix: '',
        anchor_start: 0,
        anchor_end: 12,
      });
      expect(range).toBeNull();
    });
  });
});
