/** Elements that count as content even without text (controls, media). */
const CONTENT_SELECTOR = 'a[href], button, input, select, textarea, img, video, canvas';

/** Whether `node` is rendered, looking only at `display` between it and `root`. */
function shownWithin(node: Element, root: Element): boolean {
  for (let el: Element | null = node; el && el !== root; el = el.parentElement) {
    if (el.hasAttribute('hidden') || getComputedStyle(el).display === 'none') {
      return false;
    }
  }
  return true;
}

/**
 * Whether `block` renders anything a user can see or use: a non-blank text node or a
 * control / image that is not inside a `display: none` element. The block's own
 * `hidden` state is ignored, so the check can turn a hidden block back on.
 */
export function hasVisibleContent(block: Element): boolean {
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (node.textContent?.trim() && parent && shownWithin(parent, block)) {
      return true;
    }
  }
  for (const el of Array.from(block.querySelectorAll(CONTENT_SELECTOR))) {
    if (shownWithin(el, block)) {
      return true;
    }
  }
  return false;
}

/**
 * The record aside's "Oppfølging" card (§2.7): hide each `[data-follow-up-block]` that
 * renders nothing (a panel with no links, an empty projected slot), and the whole card
 * when no block is left, so the aside never shows an empty padded box or a lone heading.
 */
export function syncFollowUpCard(card: HTMLElement): void {
  let any = false;
  for (const block of Array.from(card.querySelectorAll<HTMLElement>('[data-follow-up-block]'))) {
    const visible = hasVisibleContent(block);
    any ||= visible;
    if (block.hidden === visible) {
      block.hidden = !visible;
    }
  }
  if (card.hidden === any) {
    card.hidden = !any;
  }
}
