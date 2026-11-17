/**
 * Connections DTOs (P4, coreflow-core `app/platform/kit/schemas.py`): everything a
 * record is connected to (links, structural field relations, attached tasks,
 * link suggestions and requirement counts), the connection map graph and the
 * "create from here" flows. All endpoints live under `v1/orgs/{org_id}`.
 */
import { EntityRefDto } from '../entities/entity.models';
import { LinkDirection } from './kit.models';

/**
 * Why a connection exists: a person linked it (`user`), a rule linked it because
 * the data already said so (`auto`), it was written by a "create from here" flow
 * (`flow`), the assistant suggested it and a person accepted (`ai`), or a form
 * field already ties the two records together (`structural`, never removable here).
 */
export type ConnectionOrigin = 'user' | 'auto' | 'flow' | 'ai' | 'structural';

/** One connected record (or attached task) as seen from the record it is listed for. */
export interface ConnectionItem {
  /** Null for structural relations and attached tasks (nothing to unlink). */
  readonly link_id: string | null;
  readonly origin: ConnectionOrigin | string;
  readonly link_type: string;
  readonly direction: LinkDirection;
  readonly flow_key: string | null;
  readonly created_at: string | null;
  readonly other: EntityRefDto;
}

/** The connections to one record type (at most 50 items; `count` is the total). */
export interface ConnectionGroup {
  readonly module: string;
  readonly entity_type: string;
  readonly label_key: string | null;
  readonly kind: 'record' | 'task';
  readonly count: number;
  readonly items: readonly ConnectionItem[];
}

/** A link a rule (or the assistant) proposes, waiting for a person to accept or dismiss it. */
export interface LinkSuggestionItem {
  readonly id: string;
  /** Rule reason, e.g. `same_control`, `asset_named`, `same_process`, `ai`. */
  readonly reason: string;
  readonly confidence: number | null;
  readonly link_type: string;
  readonly direction: LinkDirection;
  readonly other: EntityRefDto;
}

export interface ConnectionCounts {
  readonly records: number;
  readonly requirements: number;
  readonly tasks: number;
  readonly suggestions: number;
}

/** `GET connections?entity_type&entity_id`. */
export interface ConnectionsResponse {
  readonly counts: ConnectionCounts;
  readonly groups: readonly ConnectionGroup[];
  readonly suggestions: readonly LinkSuggestionItem[];
  readonly requirements: { readonly confirmed: number; readonly suggested: number };
}

export type GraphNodeKind = 'record' | 'requirement' | 'person' | 'task';

/** One node of the connection map. `id` is `"<entity_type>:<entity_id>"`. */
export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  /** 0 = the record itself, 1 = directly connected, 2 = connected through a neighbour. */
  readonly depth: number;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  readonly label_key: string | null;
  /** Requirement nodes only. */
  readonly ref?: string | null;
  readonly standard_key?: string | null;
  readonly standard_name?: string | null;
  readonly framework?: string | null;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  /** Link type; `owned_by` for owner edges. */
  readonly link_type: string;
  /** Connection origin, or `requirement_confirmed` / `requirement_suggested`. */
  readonly origin: string;
}

/** `GET connections/graph?entity_type&entity_id&depth&lang` (at most 60 nodes). */
export interface ConnectionGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** `GET connections/counts?entity_type&ids=a,b,…` (at most 200 ids). */
export interface ConnectionCountMap {
  readonly items: Readonly<Record<string, number>>;
}

/** `POST link-suggestions/{id}/accept|dismiss`. */
export interface SuggestionDecision {
  readonly id: string;
  readonly status: 'accepted' | 'dismissed';
  readonly link_id: string | null;
}

/** Flow keys of "create from a requirement" flows start with this prefix. */
export const REQUIREMENT_FLOW_PREFIX = 'requirement.evidence:';

/** One "create from here" flow offered for a record (only usable ones are listed). */
export interface CreateFlowItem {
  readonly key: string;
  /** Global-style key `flows.<key>`; the kit scope carries the text as `kit.flows.<key>`. */
  readonly label_key: string;
  readonly target_type: string;
  readonly target_module: string | null;
  readonly target_label_key: string | null;
  /** Portal new-form path (may already carry a query, e.g. `?newTreatment=1`). */
  readonly target_route: string;
  /** Null when no link is written (a field on the new record already relates them). */
  readonly link_type: string | null;
  readonly enabled: boolean;
}

export interface CreateFlowList {
  readonly items: readonly CreateFlowItem[];
}

/** Where a prefilled record comes from (`prefill.from`). */
export interface FlowSourceRef {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly code: string | null;
  readonly title: string;
  readonly url: string | null;
}

/** The requirement a "create from a requirement" flow documents (`prefill.requirement`). */
export interface FlowRequirementRef {
  readonly ref: string;
  readonly number: string;
  readonly title: string;
  readonly title_nb: string | null;
  readonly standard_key: string;
  readonly framework: string;
}

/**
 * Form values for the new record, in the target create-DTO's field names
 * (`title`, `description`, `source_type`, `supplier_id`, …), plus where it comes from.
 */
export interface FlowPrefillValues {
  readonly title?: string;
  readonly description?: string;
  readonly from?: FlowSourceRef;
  readonly requirement?: FlowRequirementRef;
  readonly [field: string]: unknown;
}

/** `POST create-flows/{key}/prefill`. */
export interface PrefillResponse {
  readonly key: string;
  readonly target_type: string;
  readonly target_route: string;
  readonly prefill: FlowPrefillValues;
  /** Signed, valid for one hour, bound to org, user, flow and source. */
  readonly token: string;
  readonly source: EntityRefDto | null;
}

/** Body of `POST create-flows/complete`: with the flow token, or for `?fromRequirement=` forms. */
export type CompleteFlowRequest =
  | { readonly target_id: string; readonly token: string }
  | {
      readonly target_id: string;
      readonly requirement_ref: string;
      readonly target_type: string;
    };

export interface CompleteFlowResponse {
  readonly flow_key: string;
  readonly link: {
    readonly id: string;
    readonly link_type: string;
    readonly origin: string;
    readonly flow_key: string | null;
    readonly direction: LinkDirection;
  } | null;
  readonly requirement_link_id: string | null;
  /** How many of the source's confirmed requirement links were copied as suggestions. */
  readonly requirement_suggestions: number;
  readonly source: EntityRefDto | null;
  readonly target: EntityRefDto;
}
