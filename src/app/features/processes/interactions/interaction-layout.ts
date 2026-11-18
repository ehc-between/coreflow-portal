import { InteractionMap, PROCESS_CATEGORIES, ProcessCategory } from '../data/process.models';

export const BAND_HEIGHT = 150;
export const BOX_WIDTH = 180;
export const BOX_HEIGHT = 64;
export const MIN_GAP_X = 40;
export const MAX_GAP_X = 170;
export const PADDING_X = 30;
export const BAND_LABEL_HEIGHT = 26;
/** Approximate width of one character of an 11 px edge label. */
const LABEL_CHAR_WIDTH = 6.2;
/** The drawing is at least as wide as the desktop card, so bands fill it without upscaling. */
export const MIN_WIDTH = 1120;

/** A band of the picture: interested parties on top, then the three process categories. */
export type BandKey = 'parties' | ProcessCategory;

/** One box: a process or an interested party. */
export interface PlacedBox {
  readonly id: string;
  readonly kind: 'process' | 'party';
  readonly code: string | null;
  readonly title: string;
  readonly status: string | null;
  readonly url: string | null;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly id: string;
  readonly path: string;
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly sourceId: string;
  readonly targetId: string;
  readonly party: boolean;
}

export interface Band {
  readonly key: BandKey;
  readonly y: number;
}

export interface InteractionLayout {
  readonly width: number;
  readonly height: number;
  readonly bands: readonly Band[];
  readonly nodes: readonly PlacedBox[];
  readonly edges: readonly PlacedEdge[];
}

interface BoxIn {
  readonly id: string;
  readonly kind: 'process' | 'party';
  readonly code: string | null;
  readonly title: string;
  readonly status: string | null;
  readonly url: string | null;
}

/**
 * Lays out the process landscape: interested parties (customers, authorities …)
 * in a top band when there are any, then management, core and support processes
 * (the classic ISO 9001 process-model picture). Each band is ordered by code and
 * centred. The gap between boxes grows with the longest edge label, so labels
 * are never squeezed between boxes. Edges are curved arrows; a party edge runs
 * from the party into the process (incoming) or out to it (outgoing).
 */
export function layoutInteractions(map: InteractionMap): InteractionLayout {
  const parties = map.parties ?? [];
  const partyEdges = map.party_edges ?? [];
  const bandKeys: BandKey[] = parties.length
    ? ['parties', ...PROCESS_CATEGORIES]
    : [...PROCESS_CATEGORIES];
  const byBand = new Map<BandKey, BoxIn[]>(bandKeys.map((k) => [k, []]));
  for (const node of map.nodes) {
    const list = byBand.get(node.category) ?? byBand.get('core')!;
    list.push({
      id: node.id,
      kind: 'process',
      code: node.code,
      title: node.title,
      status: node.status,
      url: node.url,
    });
  }
  for (const party of parties) {
    byBand.get('parties')?.push({
      id: party.id,
      kind: 'party',
      code: party.code ?? null,
      title: party.name,
      status: null,
      url: party.url ?? null,
    });
  }
  const longest = Math.max(
    0,
    ...map.edges.map((e) => (e.label ?? '').length),
    ...partyEdges.map((e) => (e.label ?? '').length),
  );
  const gap = Math.min(MAX_GAP_X, Math.max(MIN_GAP_X, Math.round(longest * LABEL_CHAR_WIDTH + 20)));
  const widest = Math.max(1, ...[...byBand.values()].map((list) => list.length));
  const width = Math.max(MIN_WIDTH, PADDING_X * 2 + widest * BOX_WIDTH + (widest - 1) * gap);

  const bands: Band[] = [];
  const nodes: PlacedBox[] = [];
  bandKeys.forEach((key, index) => {
    const y = index * BAND_HEIGHT;
    bands.push({ key, y });
    const list = [...(byBand.get(key) ?? [])].sort((a, b) =>
      (a.code ?? a.title).localeCompare(b.code ?? b.title, undefined, { numeric: true }),
    );
    const rowWidth = list.length * BOX_WIDTH + Math.max(0, list.length - 1) * gap;
    const startX = (width - rowWidth) / 2;
    list.forEach((box, i) => {
      nodes.push({
        ...box,
        x: startX + i * (BOX_WIDTH + gap),
        y: y + BAND_LABEL_HEIGHT + (BAND_HEIGHT - BAND_LABEL_HEIGHT - BOX_HEIGHT) / 2,
      });
    });
  });

  const placed = new Map(nodes.map((p) => [`${p.kind}:${p.id}`, p]));
  const edges: PlacedEdge[] = [];
  for (const edge of map.edges) {
    const source = placed.get(`process:${edge.source_process_id}`);
    const target = placed.get(`process:${edge.target_process_id}`);
    if (!source || !target || source === target) {
      continue;
    }
    edges.push({
      id: edge.id,
      label: edge.label,
      sourceId: source.id,
      targetId: target.id,
      party: false,
      ...curve(source, target),
    });
  }
  for (const edge of partyEdges) {
    const party = placed.get(`party:${edge.party_id}`);
    const process = placed.get(`process:${edge.process_id}`);
    if (!party || !process) {
      continue;
    }
    const [source, target] = edge.direction === 'incoming' ? [party, process] : [process, party];
    edges.push({
      id: edge.id,
      label: edge.label,
      sourceId: source.id,
      targetId: target.id,
      party: true,
      ...curve(source, target),
    });
  }
  return { width, height: bandKeys.length * BAND_HEIGHT, bands, nodes, edges: stackLabels(edges) };
}

/** Labels that land on the same spot (several arrows into one box) are stacked upwards. */
function stackLabels(edges: readonly PlacedEdge[]): PlacedEdge[] {
  const used = new Map<string, number>();
  return edges.map((edge) => {
    if (!edge.label) {
      return edge;
    }
    const key = `${Math.round(edge.labelX / 24)}:${Math.round(edge.labelY / 12)}:${edge.anchor}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return n === 0 ? edge : { ...edge, labelY: edge.labelY - n * 13 };
  });
}

function curve(
  source: PlacedBox,
  target: PlacedBox,
): { path: string; labelX: number; labelY: number; anchor: 'start' | 'middle' | 'end' } {
  if (source.y === target.y) {
    const forward = target.x > source.x;
    const sx = forward ? source.x + BOX_WIDTH : source.x;
    const tx = forward ? target.x : target.x + BOX_WIDTH;
    // Same band: arc above (forward) or below (backward) so both directions show.
    const sy = forward ? source.y + BOX_HEIGHT * 0.35 : source.y + BOX_HEIGHT * 0.65;
    const ty = forward ? target.y + BOX_HEIGHT * 0.35 : target.y + BOX_HEIGHT * 0.65;
    const lift = Math.abs(tx - sx) > BOX_WIDTH ? (forward ? -36 : 36) : 0;
    const cx = (sx + tx) / 2;
    const cy = (sy + ty) / 2 + lift;
    return {
      path: `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`,
      labelX: cx,
      labelY: (sy + cy) / 2 + (forward ? -4 : 12),
      anchor: 'middle',
    };
  }
  const down = target.y > source.y;
  const sx = source.x + BOX_WIDTH / 2 + (down ? -12 : 12);
  const tx = target.x + BOX_WIDTH / 2 + (down ? -12 : 12);
  const sy = down ? source.y + BOX_HEIGHT : source.y;
  const ty = down ? target.y : target.y + BOX_HEIGHT;
  const my = (sy + ty) / 2;
  // Edges that skip a band bow sideways, around the boxes in between.
  const skips = Math.abs(target.y - source.y) > BAND_HEIGHT;
  const side = (down ? -1 : 1) * BOX_WIDTH * 0.8;
  const bend = down ? 70 : -70;
  const path = skips
    ? `M ${sx} ${sy} C ${sx + side} ${sy + bend}, ${tx + side} ${ty - bend}, ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
  // The label sits just above the lower box, beside its arrow (never on a box).
  const lowerX = down ? tx : sx;
  const lowerTop = down ? ty : sy;
  return {
    path,
    labelX: down ? lowerX - 6 : lowerX + 6,
    labelY: lowerTop - 8,
    anchor: down ? 'end' : 'start',
  };
}
