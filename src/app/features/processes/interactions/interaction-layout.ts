import {
  InteractionMap,
  InteractionMapNode,
  PROCESS_CATEGORIES,
  ProcessCategory,
} from '../data/process.models';

export const BAND_HEIGHT = 150;
export const BOX_WIDTH = 180;
export const BOX_HEIGHT = 64;
export const GAP_X = 40;
export const PADDING_X = 30;
export const BAND_LABEL_HEIGHT = 26;

export interface PlacedProcess {
  readonly node: InteractionMapNode;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly id: string;
  readonly path: string;
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface Band {
  readonly category: ProcessCategory;
  readonly y: number;
}

export interface InteractionLayout {
  readonly width: number;
  readonly height: number;
  readonly bands: readonly Band[];
  readonly nodes: readonly PlacedProcess[];
  readonly edges: readonly PlacedEdge[];
}

/**
 * Lays out the process landscape: management processes in the top band, core
 * processes in the middle and support processes at the bottom (the classic ISO
 * 9001 process-model picture), each band ordered by code and centred, with curved
 * arrows for "what flows from one process to the next".
 */
export function layoutInteractions(map: InteractionMap): InteractionLayout {
  const byCategory = new Map<ProcessCategory, InteractionMapNode[]>(
    PROCESS_CATEGORIES.map((c) => [c, []]),
  );
  for (const node of map.nodes) {
    (byCategory.get(node.category) ?? byCategory.get('core')!).push(node);
  }
  const widest = Math.max(1, ...[...byCategory.values()].map((list) => list.length));
  const width = Math.max(720, PADDING_X * 2 + widest * BOX_WIDTH + (widest - 1) * GAP_X);

  const bands: Band[] = [];
  const nodes: PlacedProcess[] = [];
  PROCESS_CATEGORIES.forEach((category, index) => {
    const y = index * BAND_HEIGHT;
    bands.push({ category, y });
    const list = [...(byCategory.get(category) ?? [])].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
    const rowWidth = list.length * BOX_WIDTH + Math.max(0, list.length - 1) * GAP_X;
    const startX = (width - rowWidth) / 2;
    list.forEach((node, i) => {
      nodes.push({
        node,
        x: startX + i * (BOX_WIDTH + GAP_X),
        y: y + BAND_LABEL_HEIGHT + (BAND_HEIGHT - BAND_LABEL_HEIGHT - BOX_HEIGHT) / 2,
      });
    });
  });

  const placed = new Map(nodes.map((p) => [p.node.id, p]));
  const edges: PlacedEdge[] = [];
  for (const edge of map.edges) {
    const source = placed.get(edge.source_process_id);
    const target = placed.get(edge.target_process_id);
    if (!source || !target || source === target) {
      continue;
    }
    edges.push({
      id: edge.id,
      label: edge.label,
      sourceId: source.node.id,
      targetId: target.node.id,
      ...curve(source, target),
    });
  }
  return { width, height: PROCESS_CATEGORIES.length * BAND_HEIGHT, bands, nodes, edges };
}

function curve(
  source: PlacedProcess,
  target: PlacedProcess,
): { path: string; labelX: number; labelY: number } {
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
    };
  }
  const down = target.y > source.y;
  const sx = source.x + BOX_WIDTH / 2 + (down ? -12 : 12);
  const tx = target.x + BOX_WIDTH / 2 + (down ? -12 : 12);
  const sy = down ? source.y + BOX_HEIGHT : source.y;
  const ty = down ? target.y : target.y + BOX_HEIGHT;
  const my = (sy + ty) / 2;
  return {
    path: `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`,
    labelX: (sx + tx) / 2,
    labelY: my,
  };
}
