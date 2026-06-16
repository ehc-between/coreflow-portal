/**
 * Text anchoring for document comments. A comment is anchored to a span of the
 * rendered document by three things: the selected text (`quote`), a short run of
 * text immediately before it (`prefix`), and character offsets into the element's
 * full `textContent`. Offsets are the fast path for re-locating the span; prefix +
 * quote is the robust fallback when the body has shifted (added/removed text) but
 * the quoted run still exists.
 */

/** How much text before the selection to capture as the disambiguating prefix. */
const PREFIX_LENGTH = 40;

/** A resolved anchor: the text and its position in the rendered body. */
export interface AnchorSelection {
  readonly quote: string;
  readonly prefix: string;
  readonly start: number;
  readonly end: number;
}

/** The persisted anchor fields of a comment, used to re-find its span. */
export interface CommentAnchor {
  readonly anchor_quote: string;
  readonly anchor_prefix: string;
  readonly anchor_start: number | null;
  readonly anchor_end: number | null;
}

/**
 * Compute an anchor from the current DOM selection, provided it lies inside
 * `root`. Returns null when there is no selection, it is collapsed, or it falls
 * outside `root`. Offsets are character positions into `root.textContent`.
 */
export function anchorFromSelection(
  root: HTMLElement,
  selection: Selection | null,
): AnchorSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }
  if (!range.toString().trim()) {
    return null;
  }
  const start = offsetWithin(root, range.startContainer, range.startOffset);
  const end = offsetWithin(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) {
    return null;
  }
  const fullText = root.textContent ?? '';
  // Derive the quote from textContent (not range.toString()) so it stays exactly
  // consistent with the offsets — some engines inject whitespace at block edges.
  const quote = fullText.slice(start, end);
  const prefix = fullText.slice(Math.max(0, start - PREFIX_LENGTH), start);
  return { quote, prefix, start, end };
}

/**
 * The character offset of a (node, offset) DOM position within `root`'s text,
 * counting only text nodes in document order. Returns null if the position is
 * not under `root`.
 */
function offsetWithin(root: HTMLElement, node: Node, nodeOffset: number): number | null {
  if (!root.contains(node)) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) {
      return count + nodeOffset;
    }
    count += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  // The position is on an element node (a selection edge between blocks): the
  // offset addresses a child index, so sum the text up to that child boundary.
  if (node.nodeType === Node.ELEMENT_NODE) {
    return textLengthBeforeChild(root, node.childNodes[nodeOffset] ?? null, node);
  }
  return null;
}

/**
 * Sum the text length of every text node that precedes `boundary` in document
 * order. When `boundary` is null the position is at the end of `parent`, so count
 * all text within `parent`.
 */
function textLengthBeforeChild(root: HTMLElement, boundary: Node | null, parent: Node): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let current = walker.nextNode();
  while (current) {
    if (boundary !== null) {
      const relation = boundary.compareDocumentPosition(current);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING || current === boundary) {
        break;
      }
      count += current.textContent?.length ?? 0;
    } else if (parent.contains(current)) {
      count += current.textContent?.length ?? 0;
    }
    current = walker.nextNode();
  }
  return count;
}

/**
 * Re-locate an anchor's character range within `root`'s rendered text. Prefers
 * the stored offsets when they still spell the quote; otherwise searches for
 * `prefix + quote` (then bare `quote`) so a comment survives edits elsewhere in
 * the body. Returns null when the quoted text can no longer be found.
 */
export function findAnchorRange(root: HTMLElement, anchor: CommentAnchor): Range | null {
  const fullText = root.textContent ?? '';
  const offset = resolveOffset(fullText, anchor);
  if (offset === null) {
    return null;
  }
  return rangeForTextOffsets(root, offset, offset + anchor.anchor_quote.length);
}

/** The start character offset of the quote, or null if it cannot be found. */
export function resolveOffset(fullText: string, anchor: CommentAnchor): number | null {
  const quote = anchor.anchor_quote;
  const prefix = anchor.anchor_prefix;
  const start = anchor.anchor_start;
  if (!quote) {
    return null;
  }
  if (start !== null && fullText.slice(start, start + quote.length) === quote) {
    return start;
  }
  if (prefix) {
    const combined = fullText.indexOf(prefix + quote);
    if (combined !== -1) {
      return combined + prefix.length;
    }
  }
  const bare = fullText.indexOf(quote);
  return bare === -1 ? null : bare;
}

/** Build a DOM Range spanning [start, end) character offsets of `root`'s text. */
function rangeForTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const length = current.textContent?.length ?? 0;
    if (startNode === null && offset + length >= start) {
      startNode = current;
      startNodeOffset = start - offset;
    }
    if (offset + length >= end) {
      endNode = current;
      endNodeOffset = end - offset;
      break;
    }
    offset += length;
    current = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) {
    return null;
  }
  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}
