import { LocationCount } from '../../core/locations/locations.models';
import { NextAction } from '../dashboard/data/home.models';
import { HubTile, TileSpec, actionsFor, buildTiles } from './hub-kit/hub-data';

/**
 * Bedriften's cards (docs/ia-v2.md §5.4, prototype `bedriften`): "Alt om bedriften"
 * in prototype order, Prosesser opening Håndbok.
 */
export const COMPANY_TILES: readonly TileSpec[] = [
  {
    key: 'interestedParties',
    locations: ['context.interested_parties'],
    link: '/context/interested-parties',
  },
  { key: 'policies', locations: ['context.policies'], link: '/context/policies' },
  {
    key: 'responsibilities',
    locations: ['context.responsibilities'],
    link: '/context/responsibilities',
  },
  { key: 'objectives', locations: ['objectives.objectives'], link: '/objectives' },
  { key: 'risk', locations: ['risk.risks', 'risk.opportunities'], link: '/risk' },
  { key: 'processes', locations: ['processes.register'], link: '/handbook' },
  { key: 'obligations', locations: ['obligations.register'], link: '/obligations' },
  { key: 'scope', locations: ['context.scopes', 'context.analyses'], link: '/context/scopes' },
  { key: 'projects', locations: ['projects.register'], link: '/projects' },
];

/** Fagområder (gap fix D3): the management areas without a top-level slot. */
export const TOPIC_TILES: readonly (TileSpec & { readonly module: string })[] = [
  { key: 'privacy', module: 'privacy', locations: ['privacy.ropa'], link: '/privacy' },
  { key: 'assets', module: 'assets', locations: ['assets.register'], link: '/assets' },
  {
    key: 'ai',
    module: 'ai_governance',
    locations: ['ai_governance.systems'],
    link: '/ai-governance',
  },
  {
    key: 'environment',
    module: 'environment',
    locations: ['environment.aspects'],
    link: '/environment',
  },
  {
    key: 'continuity',
    module: 'continuity',
    locations: ['continuity.plans', 'continuity.bias'],
    link: '/continuity',
  },
];

/** Context places: an org without any of them gets the "Foreslå med intervju" start card. */
export const CONTEXT_STARTER = [
  'context.interested_parties',
  'context.scopes',
  'context.analyses',
] as const;

/** The company cards; `policyCount` (policy documents) replaces the context count when known. */
export function companyTiles(
  items: readonly LocationCount[],
  policyCount: number | null,
): HubTile[] {
  return buildTiles(COMPANY_TILES, items, 'hubs.company.tiles').map((tile) =>
    tile.key === 'policies' && policyCount !== null ? { ...tile, count: policyCount } : tile,
  );
}

/** The Fagområder cards, each with a status line from its module's next actions. */
export function topicTiles(
  items: readonly LocationCount[],
  actions: readonly NextAction[],
): HubTile[] {
  return buildTiles(TOPIC_TILES, items, 'hubs.topics.tiles').map((tile) => {
    const module = TOPIC_TILES.find((t) => t.key === tile.key)!.module;
    const open = actionsFor(actions, [module]).length;
    return {
      ...tile,
      status: open
        ? { tone: 'warn' as const, key: 'hubs.topics.status.attention', params: { count: open } }
        : { tone: 'ok' as const, key: 'hubs.topics.status.ok' },
    };
  });
}
