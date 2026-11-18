import { RequirementLabel, RequirementStatus } from '../standards/standards.models';

/**
 * Requirement locations ("Her fyller du ut dette", docs/requirement-locations.md
 * section 5): where in CoreFlow a requirement is filled in, and the live result of
 * the rules over that place. Labels, descriptions and rule texts arrive already
 * rendered in the request language (the core owns those strings, decision D6).
 */

/** A rule result. `not_evaluable` (module off, place missing) never counts as not met. */
export type LocationOutcome = 'met' | 'partial' | 'not_met' | 'not_evaluable';

export type LocationRole = 'primary' | 'supporting';

export type LocationKind = 'register' | 'page' | 'settings';

/** Where a requirement's status comes from. */
export type StatusBasis = 'applicability' | 'manual' | 'links' | 'location' | 'location+links';

export type OverrideAction = 'disable' | 'add' | 'replace_rules';

/** A rule as stored in a mapping or an override (`{kind, ...params}`). */
export interface LocationRule {
  readonly kind: string;
  readonly [param: string]: unknown;
}

/** A place in CoreFlow, with its portal link (placeholders already filled). */
export interface LocationLite {
  readonly key: string;
  readonly module: string;
  readonly module_enabled: boolean;
  readonly label: string;
  readonly route: string;
  readonly query: Readonly<Record<string, string>>;
  /** `route` + `query`, ready to open. */
  readonly url: string;
}

/** A record that explains a shortfall ("Ikke håndtert: IP-3 Kommunen"). */
export interface LocationSample {
  readonly entity_type: string;
  readonly entity_id: string;
  readonly title: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly status: string | null;
  readonly module: string | null;
  readonly label_key: string | null;
}

export interface LocationRuleOutcome {
  readonly kind: string;
  readonly outcome: LocationOutcome;
  readonly text: string;
}

export interface LocationOverrideInfo {
  readonly id: string;
  readonly action: OverrideAction;
  readonly justification: string;
  readonly by_name: string | null;
  readonly at: string | null;
  readonly orphaned?: boolean;
}

/** One mapped place of a requirement with its live result. */
export interface LocationResult extends LocationLite {
  readonly description: string;
  readonly kind: LocationKind;
  readonly role: LocationRole;
  readonly outcome: LocationOutcome;
  readonly score: number;
  /** Rendered message ("6 interessenter registrert, 2 ikke håndtert"). */
  readonly text: string;
  readonly message: {
    readonly key: string;
    readonly params: Readonly<Record<string, string | number>>;
  };
  readonly counts: Readonly<Record<string, number>>;
  /** Newest change in the evaluated rows. */
  readonly as_of: string | null;
  readonly fresh: boolean;
  /** The result came from the cache past its budget; a refresh is queued. */
  readonly stale: boolean;
  readonly samples: readonly LocationSample[];
  readonly rules: readonly LocationRuleOutcome[];
  readonly origin: 'seed' | 'override';
  readonly override?: LocationOverrideInfo | null;
  /** The mapping's own hint for this requirement, if any. */
  readonly note?: string | null;
  /** "New <record>" prefilled from the requirement, when the caller may create. */
  readonly create_url: string | null;
}

export interface RequirementLocationStatus {
  readonly status: RequirementStatus;
  readonly basis: StatusBasis;
  readonly fresh: boolean;
  /** "Status fra Interessenter: …" / "Status fra koblet dokumentasjon" / "Satt manuelt av …". */
  readonly text: string;
  readonly location_outcome?: LocationOutcome | null;
}

/** `GET orgs/{org}/requirement-locations?ref=`. */
export interface RequirementLocations {
  readonly requirement: { readonly ref: string; readonly label: RequirementLabel | null };
  readonly status: RequirementLocationStatus;
  readonly primary: readonly LocationResult[];
  readonly supporting: readonly LocationResult[];
  /** Mappings the org switched off (with the justification). */
  readonly disabled: readonly LocationResult[];
  readonly links: { readonly confirmed: number; readonly suggested: number };
}

/** A proposed override, evaluated live and never cached. */
export interface LocationPreview {
  readonly target_ref: string;
  readonly location_key: string;
  readonly rules: readonly LocationRule[];
}

/** Body of `POST orgs/{org}/requirement-locations/evaluate`. */
export interface EvaluateRequest {
  readonly refs?: readonly string[];
  readonly standard_key?: string;
  readonly chapter?: string;
  readonly preview?: LocationPreview;
}

export interface EvaluatedItem {
  readonly status: RequirementStatus;
  readonly basis: StatusBasis;
  readonly outcome: LocationOutcome | null;
  readonly score: number | null;
  readonly fresh: boolean;
  readonly text_short: string;
  readonly primary: readonly string[];
}

export interface EvaluateResponse {
  readonly items: Readonly<Record<string, EvaluatedItem>>;
  readonly preview?: LocationResult | null;
}

/** A row of `GET orgs/{org}/locations` (the vocabulary of the enabled modules). */
export interface LocationVocabulary extends LocationLite {
  readonly description: string;
  readonly kind: LocationKind;
  readonly rule_kinds: readonly string[];
  readonly states: readonly { readonly key: string; readonly label: string }[];
}

/** A requirement a place fulfils ("Dette oppfyller"). */
export interface FulfilsItem {
  readonly ref: string;
  readonly label: { readonly short: string; readonly number: string; readonly title: string };
  readonly standard_key: string;
  readonly framework: string | null;
  readonly role: LocationRole;
  readonly outcome: LocationOutcome;
  readonly text: string;
  readonly status: RequirementStatus;
}

/** `GET orgs/{org}/locations/{key}/requirements`. */
export interface LocationRequirements {
  readonly location: LocationLite & { readonly description: string };
  readonly items: readonly FulfilsItem[];
}

/** Body of `POST orgs/{org}/requirement-locations/overrides`. */
export interface CreateOverrideRequest {
  readonly target_ref: string;
  readonly location_key: string;
  readonly action: OverrideAction;
  readonly role?: LocationRole | null;
  readonly rules?: readonly LocationRule[] | null;
  readonly justification: string;
}

export interface LocationOverride {
  readonly id: string;
  readonly target_ref: string;
  readonly location_key: string;
  readonly action: OverrideAction;
  readonly role: LocationRole | null;
  readonly rules: readonly LocationRule[] | null;
  readonly justification: string;
  readonly seed_version: string | null;
  readonly by_name: string | null;
  readonly at: string | null;
  readonly created_at: string;
  readonly updated_at: string | null;
}

// --- Optional fields the location layer adds to existing standards DTOs (L4) ----------------
// Kept here, not in standards.models.ts, so the standards area owns that file alone.

/** Extra fields of a requirement in the clause tree / clause detail. */
export interface LocatedRequirementFields {
  readonly ref: string;
  readonly basis?: StatusBasis | null;
  readonly location_outcome?: LocationOutcome | null;
  /** Short text of the deciding location, per language. */
  readonly location_text?: Readonly<Partial<Record<'en' | 'nb', string>>> | null;
  readonly primary_locations?: readonly string[];
}

/** A primary location of a gap (`GET frameworks/gaps` items, `fill_in`). */
export interface FillInLocation extends LocationLite {
  readonly outcome: LocationOutcome;
  readonly text: string;
}

export interface GapFillInFields {
  readonly ref: string;
  readonly fill_in?: readonly FillInLocation[];
}

/** Covered requirements per status basis (`GET frameworks/readiness` rows). */
export interface ReadinessBasisFields {
  readonly standard_key?: string;
  readonly by_basis?: Readonly<Partial<Record<'location' | 'links' | 'manual', number>>>;
}

/** One place with its row count (`GET orgs/{org}/locations/counts`, Registre hub, U04). */
export interface LocationCount extends LocationLite {
  readonly description: string;
  readonly kind: LocationKind;
  readonly entity_type: string | null;
  /** Live rows of the place's table; null for places without a table of their own. */
  readonly count: number | null;
  readonly last_updated_at: string | null;
  /** The org's enabled standards that map a requirement to the place. */
  readonly needed_by: readonly string[];
  /** Not needed by any enabled standard and holds no data: shown under "More registers". */
  readonly folded: boolean;
}

export interface LocationCounts {
  readonly items: readonly LocationCount[];
  readonly generated_at: string;
}
