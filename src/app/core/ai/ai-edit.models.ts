/** The kind of AI edit to apply to the selected (or surrounding) text. */
export type AiEditMode =
  | 'improve'
  | 'rewrite'
  | 'shorten'
  | 'expand'
  | 'fix'
  | 'translate'
  | 'continue'
  | 'custom';

/** Body sent to the `/ai/edit` streaming endpoint. */
export interface AiEditRequest {
  readonly org_id: string;
  readonly mode: AiEditMode;
  /** Free-text instruction (custom edits, translation target, etc.). */
  readonly instruction: string;
  /** HTML of the current selection (empty for "continue writing"). */
  readonly selection_html: string;
  /** Plain-text of the whole document, for context. */
  readonly doc_context_text: string;
}

/**
 * A parsed `/ai/edit` stream event. Mirrors the SSE `data:` JSON shapes, plus a
 * synthetic `not-configured` event mapped from a 503 so the caller can render a
 * calm "not set up yet" state without inspecting HTTP.
 */
export type AiEditEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };
