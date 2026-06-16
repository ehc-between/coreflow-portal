/** Roles and permissions a user holds within a single organisation. */
export interface OrgMembership {
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** The authenticated user as returned by the backend (login / refresh / me). */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly full_name: string;
  readonly is_superuser: boolean;
  readonly orgs: Readonly<Record<string, OrgMembership>>;
}

/** Successful login / refresh response body. */
export interface AuthSession {
  readonly access_token: string;
  readonly token_type: 'bearer';
  readonly expires_in: number;
  readonly user: AuthUser;
}

/** Login request body. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/** Change-password request body. */
export interface ChangePasswordRequest {
  readonly old_password: string;
  readonly new_password: string;
}
