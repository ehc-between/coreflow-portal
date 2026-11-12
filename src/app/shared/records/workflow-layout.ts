import { StateCategory, WorkflowDefinition } from '../../core/records/record.models';

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 46;
const COLUMN_GAP = 90;
const ROW_GAP = 34;
const PADDING = 24;

export interface DiagramNode {
  readonly key: string;
  readonly category: StateCategory;
  readonly x: number;
  readonly y: number;
  readonly initial: boolean;
}

export interface DiagramEdge {
  /** `<transition key>:<from state>`: one edge per source state. */
  readonly id: string;
  readonly transition: string;
  readonly from: string;
  readonly to: string;
  /** SVG path data. */
  readonly path: string;
  /** Label anchor. */
  readonly labelX: number;
  readonly labelY: number;
  /** Whether the edge goes back (or stays) left of its source. */
  readonly back: boolean;
}

export interface DiagramLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/**
 * Lays a workflow out left to right: each state's column is its shortest
 * distance from the initial state (unreachable states go after the last
 * column), rows stack in definition order. Forward edges are gentle curves
 * between columns; edges going back (or to the same column) arc below the
 * nodes so they never cross a box. Pure, so it is easy to test.
 */
export function layoutWorkflow(definition: WorkflowDefinition): DiagramLayout {
  const states = definition.states;
  const rank = new Map<string, number>();
  const known = new Set(states.map((s) => s.key));
  const start = known.has(definition.initial_state)
    ? definition.initial_state
    : (states[0]?.key ?? null);
  if (start) {
    rank.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const t of definition.transitions) {
        if (t.from.includes(current) && known.has(t.to) && !rank.has(t.to)) {
          rank.set(t.to, rank.get(current)! + 1);
          queue.push(t.to);
        }
      }
    }
  }
  const maxRank = Math.max(0, ...rank.values());
  const columns: string[][] = [];
  for (const state of states) {
    const r = rank.get(state.key) ?? maxRank + 1;
    (columns[r] ??= []).push(state.key);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let rows = 0;
  columns.forEach((keys, col) => {
    keys.forEach((key, row) => {
      positions.set(key, {
        x: PADDING + col * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
      });
      rows = Math.max(rows, row + 1);
    });
  });

  const nodes: DiagramNode[] = states.map((state) => ({
    key: state.key,
    category: state.category,
    initial: state.key === start,
    ...positions.get(state.key)!,
  }));

  const colCount = Math.max(1, columns.length);
  const contentHeight = PADDING * 2 + rows * NODE_HEIGHT + Math.max(0, rows - 1) * ROW_GAP;
  const arcBase = contentHeight - PADDING + 6;
  let backCount = 0;
  const edges: DiagramEdge[] = [];
  for (const t of definition.transitions) {
    const to = positions.get(t.to);
    if (!to) {
      continue;
    }
    for (const source of t.from) {
      const from = positions.get(source);
      if (!from) {
        continue;
      }
      const id = `${t.key}:${source}`;
      if (to.x > from.x) {
        const x1 = from.x + NODE_WIDTH;
        const y1 = from.y + NODE_HEIGHT / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_HEIGHT / 2;
        const mid = (x1 + x2) / 2;
        edges.push({
          id,
          transition: t.key,
          from: source,
          to: t.to,
          path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
          labelX: mid,
          labelY: (y1 + y2) / 2 - 6,
          back: false,
        });
      } else {
        backCount++;
        const depth = arcBase + backCount * 16;
        const x1 = from.x + NODE_WIDTH / 2 + 10;
        const y1 = from.y + NODE_HEIGHT;
        const x2 = to.x + NODE_WIDTH / 2 - 10;
        const y2 = to.y + NODE_HEIGHT;
        edges.push({
          id,
          transition: t.key,
          from: source,
          to: t.to,
          path: `M ${x1} ${y1} C ${x1} ${depth}, ${x2} ${depth}, ${x2} ${y2}`,
          labelX: (x1 + x2) / 2,
          labelY: depth - 4,
          back: true,
        });
      }
    }
  }

  return {
    width: PADDING * 2 + colCount * NODE_WIDTH + (colCount - 1) * COLUMN_GAP,
    height: contentHeight + (backCount ? backCount * 16 + 14 : 0),
    nodes,
    edges,
  };
}
