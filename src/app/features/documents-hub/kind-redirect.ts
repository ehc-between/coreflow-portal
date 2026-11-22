import { inject } from '@angular/core';
import { CanActivateFn, Params, Router } from '@angular/router';

/**
 * The list's query for a `?kind=` link (Dokumenter's Policyer / Planer doors and the
 * top menu, docs/ia-v2.md §5.6): `kind` becomes the list's own `type` filter, the
 * other params stay. Null when there is no `kind`.
 */
export function kindQuery(params: Params): Params | null {
  const kind = params['kind'];
  if (typeof kind !== 'string' || !kind) {
    return null;
  }
  const { kind: _drop, ...rest } = params;
  void _drop;
  return { ...rest, type: kind };
}

/** `/documents/all?kind=policy` -> `/documents/all?type=policy`. */
export const kindToType: CanActivateFn = (route) => {
  const query = kindQuery(route.queryParams);
  return query ? inject(Router).createUrlTree(['/documents/all'], { queryParams: query }) : true;
};
