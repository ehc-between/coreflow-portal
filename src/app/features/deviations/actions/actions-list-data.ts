import { ActionFilters } from '../../../core/deviations/deviation.models';

/** Which actions the list shows: all open (open + in progress) or only the overdue ones. */
export type ActionScope = 'open' | 'overdue';

/** Whose actions the list shows. */
export type ActionOwnerScope = 'all' | 'me';

export interface ActionListQuery {
  readonly scope: ActionScope;
  readonly owner: ActionOwnerScope;
}

/**
 * Reads the actions list's drill-down query params: `overdue=true` narrows to
 * overdue actions, `owner_user_id=me` to the caller's own. Anything else falls
 * back to all open actions — the same set the dashboard's "Open actions" counts.
 */
export function parseActionListQuery(params: {
  get(name: string): string | null;
}): ActionListQuery {
  return {
    scope: params.get('overdue') === 'true' ? 'overdue' : 'open',
    owner: params.get('owner_user_id') === 'me' ? 'me' : 'all',
  };
}

/** Query params that reopen the list in the given state (omits defaults). */
export function actionListQueryParams(query: ActionListQuery): Record<string, string> {
  return {
    ...(query.scope === 'overdue' ? { overdue: 'true' } : {}),
    ...(query.owner === 'me' ? { owner_user_id: 'me' } : {}),
  };
}

/**
 * API filters for a list query. No `status` is sent, so the backend's default
 * (open + in progress) applies — matching the dashboard's action counts.
 */
export function toActionFilters(
  query: ActionListQuery,
  limit: number,
  offset: number,
): ActionFilters {
  return {
    owner_user_id: query.owner === 'me' ? 'me' : undefined,
    overdue: query.scope === 'overdue' || undefined,
    sort: 'due_at',
    limit,
    offset,
  };
}
