import { ActivatedRouteSnapshot } from '@angular/router';

/** Longest template sent; the backend caps paths at 200 characters as well. */
const MAX_TEMPLATE_LENGTH = 200;

/**
 * The route template of the activated route, e.g. `/risk/risks/:id`, built from
 * the matched route config paths (never from the concrete URL), so ids, query
 * strings and search text can never end up in the counters. The wildcard route
 * reads `/not-found`; the root reads `/`.
 */
export function routeTemplate(root: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  let node: ActivatedRouteSnapshot | null = root;
  while (node) {
    const path = node.routeConfig?.path;
    if (path === '**') {
      parts.push('not-found');
      break;
    }
    if (path) {
      parts.push(...path.split('/').filter(Boolean));
    }
    node = primaryChild(node);
  }
  return `/${parts.join('/')}`.slice(0, MAX_TEMPLATE_LENGTH);
}

function primaryChild(node: ActivatedRouteSnapshot): ActivatedRouteSnapshot | null {
  return node.children.find((child) => child.outlet === 'primary') ?? null;
}
