/**
 * A cited source returned mid-stream. Documents keep the original
 * `{id, title, doc_code}` shape; other record types add `entity_type` and the
 * portal `url` of the record.
 */
export interface AskSource {
  readonly id: string;
  readonly title: string;
  readonly doc_code: string;
  readonly entity_type?: string;
  readonly url?: string;
}

/** A draft queued to the review feed, surfaced mid-stream. */
export interface AskProposal {
  readonly proposal_id: string;
  readonly title: string;
}

/** One labelled value in a proposed change's preview. */
export interface AskActionPreviewField {
  readonly label: string;
  readonly value: string;
}

/** What a proposed change would do, shown on its confirmation card. */
export interface AskActionPreview {
  readonly title: string;
  readonly fields: readonly AskActionPreviewField[];
}

/** A change the assistant proposed; nothing happens until the user confirms it. */
export interface AskAction {
  readonly action_id: string;
  readonly tool: string;
  readonly summary: string;
  readonly preview: AskActionPreview;
}

/** A record the assistant opened or cited, shown as a link. */
export interface AskLink {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string;
}

/** Ask mode: a normal answer, or the tutor that teaches step by step. */
export type AskMode = 'ask' | 'tutor';

/** The user's guidance level (F6), which the tutor adapts to. */
export type GuidanceLevel = 'beginner' | 'standard' | 'expert';

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
  | ({ readonly type: 'action' } & AskAction)
  | ({ readonly type: 'link' } & AskLink)
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };

// --- Confirm-before-write actions (GET/confirm/reject) --------------------------

/** What a confirmed action did. `url` is the portal path of the changed record. */
export interface AiActionResult {
  readonly message: string;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly url: string | null;
}

export type AiActionStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'failed';

/** `POST /orgs/{org}/ai/actions/{id}/confirm` response. */
export interface AiActionConfirmResponse {
  readonly status: 'confirmed';
  readonly result: AiActionResult;
}

/** `GET /orgs/{org}/ai/actions/{id}`: a proposal and its current state. */
export interface AiActionDto {
  readonly id: string;
  readonly tool: string;
  readonly summary: string;
  readonly preview: AskActionPreview;
  readonly status: AiActionStatus;
  readonly result: AiActionResult | null;
  readonly error: string | null;
  readonly created_at: string;
  readonly decided_at: string | null;
  readonly expires_at: string;
}

// --- Assists (per-module AI buttons) --------------------------------------------

/** `POST /orgs/{org}/ai/assist/{key}` body. The entity pair goes together. */
export interface AssistRequestBody {
  readonly input: Readonly<Record<string, unknown>>;
  readonly lang?: string;
  readonly entity_type?: string;
  readonly entity_id?: string;
}

/** A parsed assist stream event (text assists stream `delta`, JSON assists one `result`). */
export type AssistEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'result'; readonly data: unknown }
  | { readonly type: 'sources'; readonly sources: readonly AskSource[] }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'not-configured' };
