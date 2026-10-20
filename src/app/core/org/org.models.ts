/** A member of the current organisation. */
export interface OrgMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  /** Whether the account is enabled (a super-admin can deactivate it globally). */
  readonly is_active: boolean;
  readonly roles: readonly string[];
}

/** A role from the org role catalogue. `grantable` is whether the caller may
 *  assign / invite with it (the backend blocks privilege escalation). */
export interface OrgRole {
  readonly key: string;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly grantable: boolean;
}

/** A pending invitation into the org. */
export interface OrgInvitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly status: string;
  readonly created_at: string;
  readonly expires_at: string;
}

/** Request body for inviting a user into the org. */
export interface CreateOrgInvitationRequest {
  readonly email: string;
  readonly role_key: string;
}

/** Response from creating an invitation (the accept URL is only returned once). */
export interface CreatedOrgInvitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly expires_at: string;
  readonly accept_url: string;
}

/** A member after a role change. */
export interface OrgMemberDetail {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string | null;
  readonly is_active: boolean;
  readonly roles: readonly string[];
}

/** A row in the departments list. */
export interface DepartmentSummary {
  readonly id: string;
  readonly name: string;
  readonly member_count: number;
}

/** A member of a department (no roles in this context). */
export interface DepartmentMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
}

/** Full department detail, including its members. */
export interface DepartmentDetail {
  readonly id: string;
  readonly name: string;
  readonly members: readonly DepartmentMember[];
}

/** Org-wide settings (`GET`/`PUT v1/orgs/{org}/settings`, `org:manage`). */
export interface OrgSettingsDto {
  /** Documents must be approved by someone other than their author. */
  readonly require_document_segregation: boolean;
}
