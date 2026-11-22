import { LocationCount } from '../../../core/locations/locations.models';
import { NextAction } from '../../dashboard/data/home.models';

/** Test fixtures of the area hubs. */
export function loc(key: string, count: number | null = 3): LocationCount {
  const [module] = key.split('.');
  return {
    key,
    module,
    module_enabled: true,
    label: key,
    route: `/${module}`,
    query: {},
    url: `/${module}`,
    description: '',
    kind: 'register',
    entity_type: null,
    count,
    last_updated_at: null,
    needed_by: [],
    folded: false,
  };
}

export function action(module: string | null, kind = 'gap', key = `${module}.x`): NextAction {
  return {
    key,
    kind,
    title_key: 'home:next.gap.title',
    why_key: 'home:next.gap.why',
    params: {},
    url: `/${module ?? 'home'}?a=1`,
    priority: 1,
    module,
  };
}
