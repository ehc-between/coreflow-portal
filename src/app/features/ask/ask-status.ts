import { AskStatus } from '../../core/ai/ai.models';

/**
 * The status categories the server sends with a `status` event (P2). The portal
 * translates these (`ask.status.categories.<category>`) instead of one label per
 * tool, so new tools need no new translation.
 */
export const STATUS_CATEGORIES = [
  'searching',
  'listing',
  'counting',
  'reading',
  'summarising',
  'standards',
  'my_work',
  'overview',
  'howto',
  'proposing',
  'drafting',
  'designing',
  'access',
  'working',
] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Categories that read better naming the record type ("Listing “Supplier” records…"). */
export const TYPED_STATUS_CATEGORIES: readonly StatusCategory[] = [
  'searching',
  'listing',
  'counting',
  'reading',
  'summarising',
];

const KNOWN = new Set<string>(STATUS_CATEGORIES);

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The label shown while the assistant works, in the UI language.
 *
 * - A known `category` → `ask.status.categories.<category>`, or the typed variant
 *   `ask.status.typed.<category>` when the event names a record type whose label
 *   is known (`typeLabel` returns null for unknown types).
 * - No category (an older server): the English `text` only in an English UI,
 *   otherwise the neutral "Working…" so nb users never see English labels.
 */
export function statusLabel(
  status: AskStatus,
  translate: Translate,
  typeLabel: (entityType: string) => string | null,
  lang: string,
): string {
  const category = status.category && KNOWN.has(status.category) ? status.category : null;
  if (!category) {
    if (lang === 'en' && status.text?.trim()) {
      return status.text.trim();
    }
    return translate('ask.status.categories.working');
  }
  const entityType = status.params?.entity_type;
  if (entityType && TYPED_STATUS_CATEGORIES.includes(category as StatusCategory)) {
    const type = typeLabel(entityType);
    if (type) {
      return translate(`ask.status.typed.${category}`, { type });
    }
  }
  return translate(`ask.status.categories.${category}`);
}
