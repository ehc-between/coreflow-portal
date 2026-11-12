import {
  MAP_NODE_TYPES,
  MAX_EDGES,
  MAX_LANES,
  MAX_NODES,
  MapEdge,
  MapLane,
  MapNode,
  MapNodeType,
  ProcessMap,
} from './process.models';

/**
 * Pure helpers behind the swimlane process-map editor. A map is drawn in "map
 * units": lane `k` is the horizontal band `[k * LANE_HEIGHT, (k + 1) * LANE_HEIGHT)`
 * (the same grid the server's generated-map layout uses), lane headers sit left of
 * x = 0. Every function returns a new map and never mutates its input.
 */

export const LANE_HEIGHT = 160;
export const LANE_HEADER_WIDTH = 150;
export const GRID = 10;
export const CANVAS_PADDING = 40;
export const MIN_CANVAS_WIDTH = 760;

const SIZES: Readonly<Record<MapNodeType, { readonly width: number; readonly height: number }>> = {
  start: { width: 120, height: 48 },
  end: { width: 120, height: 48 },
  task: { width: 160, height: 64 },
  decision: { width: 130, height: 84 },
  subprocess: { width: 160, height: 64 },
  document: { width: 150, height: 66 },
  event: { width: 120, height: 52 },
};

export function emptyMap(): ProcessMap {
  return { lanes: [], nodes: [], edges: [] };
}

/** A map from the server (or an assist), with missing arrays defaulted. */
export function normaliseMap(value: unknown): ProcessMap {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ProcessMap>;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return {
    lanes: Array.isArray(raw.lanes) ? raw.lanes : [],
    nodes: nodes.map((n) => ({
      ...n,
      type: (MAP_NODE_TYPES as readonly string[]).includes(n.type) ? n.type : 'task',
      label: n.label ?? '',
      x: Number.isFinite(n.x) ? n.x : 0,
      y: Number.isFinite(n.y) ? n.y : 0,
    })),
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

export function nodeSize(node: Pick<MapNode, 'type' | 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const base = SIZES[node.type] ?? SIZES.task;
  return { width: node.width || base.width, height: node.height || base.height };
}

export function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/** A fresh id `<prefix><n>` not used by any of `existing`. */
export function nextId(prefix: string, existing: readonly { readonly id: string }[]): string {
  const used = new Set(existing.map((e) => e.id));
  let n = existing.length + 1;
  while (used.has(`${prefix}${n}`)) {
    n++;
  }
  return `${prefix}${n}`;
}

/** Index of the lane band a y coordinate falls in (clamped to the lanes there are). */
export function laneIndexAt(y: number, laneCount: number): number {
  if (laneCount <= 0) {
    return -1;
  }
  return Math.min(laneCount - 1, Math.max(0, Math.floor(y / LANE_HEIGHT)));
}

function laneFor(map: ProcessMap, node: MapNode): string | null {
  const { height } = nodeSize(node);
  const index = laneIndexAt(node.y + height / 2, map.lanes.length);
  return index < 0 ? null : map.lanes[index].id;
}

/** Keeps a node inside its lane band vertically (when there are lanes). */
function clampToLane(map: ProcessMap, node: MapNode): MapNode {
  const index = map.lanes.findIndex((l) => l.id === node.lane_id);
  if (index < 0) {
    return node;
  }
  const { height } = nodeSize(node);
  const top = index * LANE_HEIGHT + 8;
  const bottom = (index + 1) * LANE_HEIGHT - height - 8;
  return { ...node, y: Math.min(Math.max(node.y, top), Math.max(top, bottom)) };
}

export function canAddNode(map: ProcessMap): boolean {
  return map.nodes.length < MAX_NODES;
}

/** Adds a step to the right of the existing ones in `laneId` (else the first lane). */
export function addNode(
  map: ProcessMap,
  type: MapNodeType,
  label: string,
  laneId?: string | null,
): { map: ProcessMap; node: MapNode | null } {
  if (!canAddNode(map)) {
    return { map, node: null };
  }
  const lane =
    map.lanes.find((l) => l.id === laneId) ?? (map.lanes.length > 0 ? map.lanes[0] : null);
  const laneIndex = lane ? map.lanes.indexOf(lane) : 0;
  const size = SIZES[type];
  const inLane = map.nodes.filter((n) => (lane ? n.lane_id === lane.id : true));
  const right = inLane.reduce((max, n) => Math.max(max, n.x + nodeSize(n).width), 0);
  const x = snap(inLane.length === 0 ? CANVAS_PADDING : right + 60);
  const y = snap(laneIndex * LANE_HEIGHT + (LANE_HEIGHT - size.height) / 2);
  const node: MapNode = {
    id: nextId('n', map.nodes),
    type,
    label,
    lane_id: lane?.id ?? null,
    x,
    y,
  };
  return { map: { ...map, nodes: [...map.nodes, node] }, node };
}

export function updateNode(map: ProcessMap, id: string, patch: Partial<MapNode>): ProcessMap {
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      if (n.id !== id) {
        return n;
      }
      const next: MapNode = { ...n, ...patch, id: n.id };
      if (patch.lane_id !== undefined && patch.lane_id !== n.lane_id) {
        // Moving to another lane: centre the step vertically in its new band.
        const index = map.lanes.findIndex((l) => l.id === patch.lane_id);
        if (index >= 0) {
          const { height } = nodeSize(next);
          return { ...next, y: snap(index * LANE_HEIGHT + (LANE_HEIGHT - height) / 2) };
        }
      }
      return next;
    }),
  };
}

/** Moves a step to (x, y), snapped to the grid; the lane follows the new position. */
export function moveNode(map: ProcessMap, id: string, x: number, y: number): ProcessMap {
  return {
    ...map,
    nodes: map.nodes.map((n) => {
      if (n.id !== id) {
        return n;
      }
      const moved: MapNode = { ...n, x: Math.max(0, snap(x)), y: Math.max(0, snap(y)) };
      return { ...moved, lane_id: laneFor(map, moved) };
    }),
  };
}

/** Removes a step and every connection to or from it. */
export function removeNode(map: ProcessMap, id: string): ProcessMap {
  return {
    ...map,
    nodes: map.nodes.filter((n) => n.id !== id),
    edges: map.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export type ConnectResult = 'ok' | 'self' | 'duplicate' | 'missing' | 'limit';

/** Connects two steps (no self-loops, no duplicate source -> target pair). */
export function addEdge(
  map: ProcessMap,
  source: string,
  target: string,
  label?: string | null,
): { map: ProcessMap; result: ConnectResult; edge: MapEdge | null } {
  if (source === target) {
    return { map, result: 'self', edge: null };
  }
  const ids = new Set(map.nodes.map((n) => n.id));
  if (!ids.has(source) || !ids.has(target)) {
    return { map, result: 'missing', edge: null };
  }
  if (map.edges.some((e) => e.source === source && e.target === target)) {
    return { map, result: 'duplicate', edge: null };
  }
  if (map.edges.length >= MAX_EDGES) {
    return { map, result: 'limit', edge: null };
  }
  const edge: MapEdge = { id: nextId('e', map.edges), source, target, label: label || null };
  return { map: { ...map, edges: [...map.edges, edge] }, result: 'ok', edge };
}

export function updateEdge(map: ProcessMap, id: string, patch: Partial<MapEdge>): ProcessMap {
  return {
    ...map,
    edges: map.edges.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)),
  };
}

export function removeEdge(map: ProcessMap, id: string): ProcessMap {
  return { ...map, edges: map.edges.filter((e) => e.id !== id) };
}

export function canAddLane(map: ProcessMap): boolean {
  return map.lanes.length < MAX_LANES;
}

/** Appends a lane at the bottom. Steps without a lane join the first lane. */
export function addLane(map: ProcessMap, label: string): { map: ProcessMap; lane: MapLane | null } {
  if (!canAddLane(map)) {
    return { map, lane: null };
  }
  const lane: MapLane = { id: nextId('lane-', map.lanes), label };
  const lanes = [...map.lanes, lane];
  const withLanes: ProcessMap = { ...map, lanes };
  const nodes = map.nodes.map((n) => {
    if (n.lane_id && lanes.some((l) => l.id === n.lane_id)) {
      return n;
    }
    return clampToLane(withLanes, { ...n, lane_id: laneFor(withLanes, n) });
  });
  return { map: { ...withLanes, nodes }, lane };
}

export function updateLane(map: ProcessMap, id: string, patch: Partial<MapLane>): ProcessMap {
  return {
    ...map,
    lanes: map.lanes.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)),
  };
}

/** Moves lane `id` one band up (-1) or down (+1), carrying its steps along. */
export function moveLane(map: ProcessMap, id: string, delta: -1 | 1): ProcessMap {
  const from = map.lanes.findIndex((l) => l.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= map.lanes.length) {
    return map;
  }
  const lanes = [...map.lanes];
  [lanes[from], lanes[to]] = [lanes[to], lanes[from]];
  const other = map.lanes[to].id;
  const nodes = map.nodes.map((n) => {
    if (n.lane_id === id) {
      return { ...n, y: n.y + delta * LANE_HEIGHT };
    }
    if (n.lane_id === other) {
      return { ...n, y: n.y - delta * LANE_HEIGHT };
    }
    return n;
  });
  return { ...map, lanes, nodes };
}

/**
 * Removes a lane. Its steps move to the neighbouring lane (the one above, else the
 * one below); lanes below shift up one band. With no lanes left, steps keep their
 * position and lose their lane.
 */
export function removeLane(map: ProcessMap, id: string): ProcessMap {
  const index = map.lanes.findIndex((l) => l.id === id);
  if (index < 0) {
    return map;
  }
  const lanes = map.lanes.filter((l) => l.id !== id);
  const target = lanes.length === 0 ? null : lanes[Math.max(0, index - 1)];
  const targetIndex = target ? lanes.indexOf(target) : -1;
  const nodes = map.nodes.map((n) => {
    const laneIndex = map.lanes.findIndex((l) => l.id === n.lane_id);
    if (n.lane_id === id) {
      if (!target) {
        return { ...n, lane_id: null };
      }
      const offset = n.y - index * LANE_HEIGHT;
      return clampToLane(
        { ...map, lanes },
        { ...n, lane_id: target.id, y: targetIndex * LANE_HEIGHT + offset },
      );
    }
    if (laneIndex > index) {
      return { ...n, y: n.y - LANE_HEIGHT };
    }
    return n;
  });
  return { ...map, lanes, nodes };
}

/** Size of the drawing (map units), never smaller than the lanes or the minimum width. */
export function canvasSize(map: ProcessMap): { width: number; height: number } {
  let width = MIN_CANVAS_WIDTH;
  let height = Math.max(map.lanes.length * LANE_HEIGHT, LANE_HEIGHT);
  for (const n of map.nodes) {
    const size = nodeSize(n);
    width = Math.max(width, n.x + size.width + CANVAS_PADDING * 2);
    height = Math.max(height, n.y + size.height + CANVAS_PADDING);
  }
  return { width, height };
}

export interface EdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

/** An orthogonal connector between two steps (right -> left when flowing forward). */
export function edgeGeometry(source: MapNode, target: MapNode): EdgeGeometry {
  const s = nodeSize(source);
  const t = nodeSize(target);
  const sx = source.x + s.width;
  const sy = source.y + s.height / 2;
  const tx = target.x;
  const ty = target.y + t.height / 2;
  if (tx >= sx + 20) {
    const mid = snap((sx + tx) / 2);
    return {
      path: `M ${sx} ${sy} H ${mid} V ${ty} H ${tx}`,
      labelX: mid,
      labelY: sy === ty ? sy - 8 : (sy + ty) / 2,
    };
  }
  // Backwards or overlapping in x: leave from the bottom / top and loop around.
  const sCx = source.x + s.width / 2;
  const tCx = target.x + t.width / 2;
  if (Math.abs(sy - ty) > (s.height + t.height) / 2) {
    const down = ty > sy;
    const y1 = down ? source.y + s.height : source.y;
    const y2 = down ? target.y : target.y + t.height;
    const mid = (y1 + y2) / 2;
    return {
      path: `M ${sCx} ${y1} V ${mid} H ${tCx} V ${y2}`,
      labelX: (sCx + tCx) / 2,
      labelY: mid - 6,
    };
  }
  const below = Math.max(source.y + s.height, target.y + t.height) + 24;
  return {
    path: `M ${sCx} ${source.y + s.height} V ${below} H ${tCx} V ${target.y + t.height}`,
    labelX: (sCx + tCx) / 2,
    labelY: below + 14,
  };
}

export interface MapIssue {
  /** i18n key under `processes.map.issues`. */
  readonly key: 'noStart' | 'noEnd' | 'unconnected' | 'decisionBranches' | 'unlabelled';
  readonly nodeIds: readonly string[];
}

/** Modelling hints (not errors): what a reviewer would flag on the map. */
export function mapIssues(map: ProcessMap): MapIssue[] {
  if (map.nodes.length === 0) {
    return [];
  }
  const issues: MapIssue[] = [];
  if (!map.nodes.some((n) => n.type === 'start')) {
    issues.push({ key: 'noStart', nodeIds: [] });
  }
  if (!map.nodes.some((n) => n.type === 'end')) {
    issues.push({ key: 'noEnd', nodeIds: [] });
  }
  const connected = new Set(map.edges.flatMap((e) => [e.source, e.target]));
  const loose = map.nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);
  if (map.nodes.length > 1 && loose.length > 0) {
    issues.push({ key: 'unconnected', nodeIds: loose });
  }
  const thinDecisions = map.nodes
    .filter((n) => n.type === 'decision')
    .filter((n) => map.edges.filter((e) => e.source === n.id).length < 2)
    .map((n) => n.id);
  if (thinDecisions.length > 0) {
    issues.push({ key: 'decisionBranches', nodeIds: thinDecisions });
  }
  const unlabelled = map.nodes.filter((n) => !n.label.trim()).map((n) => n.id);
  if (unlabelled.length > 0) {
    issues.push({ key: 'unlabelled', nodeIds: unlabelled });
  }
  return issues;
}

/** Structural equality of two maps (for the unsaved-changes indicator). */
export function sameMap(a: ProcessMap, b: ProcessMap): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Steps in reading order (lane by lane, left to right): the accessible text
 * alternative of the drawing.
 */
export function readingOrder(map: ProcessMap): MapNode[] {
  const laneIndex = new Map(map.lanes.map((l, i) => [l.id, i]));
  return [...map.nodes].sort((a, b) => {
    const la = laneIndex.get(a.lane_id ?? '') ?? -1;
    const lb = laneIndex.get(b.lane_id ?? '') ?? -1;
    return la - lb || a.x - b.x || a.y - b.y;
  });
}

/** Splits a step label into at most `maxLines` lines of about `maxChars` characters. */
export function wrapLabel(label: string, maxChars: number, maxLines = 3): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate.length > maxChars ? `${candidate.slice(0, maxChars - 1)}…` : candidate;
    } else {
      lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    }
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
}
