/** A role a user can be invited with / hold in an organisation. */
export type RoleKey = 'admin' | 'member';

/** Response from creating an organisation. */
export interface CreatedOrg {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly created_at: string;
}

/** A row in the organisations list. */
export interface OrgSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly member_count: number;
  readonly created_at: string;
}

/** A member of an organisation. */
export interface OrgMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly roles: readonly string[];
}

/** Full organisation detail, including its members. */
export interface OrgDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly created_at: string;
  readonly members: readonly OrgMember[];
}

/** Response from creating an invitation. */
export interface CreatedInvitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly expires_at: string;
  readonly accept_url: string;
}

/** A pending invitation row. */
export interface Invitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly status: string;
  readonly created_at: string;
  readonly expires_at: string;
}

/** Request body for creating an organisation. */
export interface CreateOrgRequest {
  readonly name: string;
  readonly slug?: string;
}

/** Request body for creating an invitation. */
export interface CreateInvitationRequest {
  readonly email: string;
  readonly role_key: RoleKey;
}
