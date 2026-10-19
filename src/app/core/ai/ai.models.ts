/** A cited source document returned mid-stream. */
export interface AskSource {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string;
}

/** A draft queued to the review feed, surfaced mid-stream. */
export interface AskProposal {
  readonly proposal_id: string;
  readonly title: string;
}

/** One turn of the conversation sent to the backend (oldest→newest). */
export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * A parsed Ask CoreFlow stream event. Mirrors the SSE `data:` JSON shapes from
 * the backend, plus a synthetic `not-configured` event mapped from a 503 so the
 * panel can render its calm "not set up yet" state without inspecting HTTP.
 */
export type AskEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'status'; readonly text: string }
  | { readonly type: 'sources'; readonly sources: readonly AskSource[] }
  | { readonly type: 'proposal'; readonly proposal_id: string; readonly title: string }
  | { readonly type: 'question'; readonly question: string; readonly options: readonly string[] }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };
