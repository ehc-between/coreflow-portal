import {
  LANE_HEIGHT,
  addEdge,
  addLane,
  addNode,
  canvasSize,
  edgeGeometry,
  emptyMap,
  laneIndexAt,
  mapIssues,
  moveLane,
  moveNode,
  nextId,
  normaliseMap,
  readingOrder,
  removeLane,
  removeNode,
  sameMap,
  updateNode,
  wrapLabel,
} from './map-model';
import { ProcessMap } from './process.models';

function twoLaneMap(): ProcessMap {
  let map = addLane(emptyMap(), 'Sales').map;
  map = addLane(map, 'Production').map;
  return map;
}

describe('map model', () => {
  it('normalises missing arrays and unknown node types', () => {
    const map = normaliseMap({ nodes: [{ id: 'a', type: 'weird', label: null, x: 'x', y: 5 }] });
    expect(map.lanes).toEqual([]);
    expect(map.edges).toEqual([]);
    expect(map.nodes[0]).toMatchObject({ id: 'a', type: 'task', label: '', x: 0, y: 5 });
    expect(normaliseMap(null)).toEqual(emptyMap());
  });

  it('creates unique ids', () => {
    expect(nextId('n', [{ id: 'n1' }, { id: 'n3' }])).toBe('n4');
    expect(nextId('n', [{ id: 'n2' }, { id: 'n3' }])).toBe('n4');
    expect(nextId('e', [])).toBe('e1');
  });

  it('adds lanes and places new steps in the chosen lane, left to right', () => {
    const lanes = twoLaneMap();
    expect(lanes.lanes.map((l) => l.id)).toEqual(['lane-1', 'lane-2']);
    const first = addNode(lanes, 'start', 'Start', 'lane-2');
    const second = addNode(first.map, 'task', 'Build', 'lane-2');
    expect(first.node?.lane_id).toBe('lane-2');
    expect(first.node!.y).toBeGreaterThanOrEqual(LANE_HEIGHT);
    expect(first.node!.y).toBeLessThan(2 * LANE_HEIGHT);
    expect(second.node!.x).toBeGreaterThan(first.node!.x);
    expect(second.map.nodes).toHaveLength(2);
  });

  it('moves a step to the lane under its new position, snapped to the grid', () => {
    const { map, node } = addNode(twoLaneMap(), 'task', 'Pack', 'lane-1');
    const moved = moveNode(map, node!.id, 203, LANE_HEIGHT + 40);
    const after = moved.nodes[0];
    expect(after.x).toBe(200);
    expect(after.lane_id).toBe('lane-2');
    expect(laneIndexAt(after.y + 32, 2)).toBe(1);
  });

  it('recentres a step when its lane is changed from the panel', () => {
    const { map, node } = addNode(twoLaneMap(), 'task', 'Pack', 'lane-1');
    const updated = updateNode(map, node!.id, { lane_id: 'lane-2' });
    expect(updated.nodes[0].y).toBeGreaterThanOrEqual(LANE_HEIGHT);
  });

  it('connects steps and rejects self-loops, duplicates and unknown steps', () => {
    let map = addNode(emptyMap(), 'start', 'Start').map;
    map = addNode(map, 'end', 'End').map;
    const ok = addEdge(map, 'n1', 'n2', 'done');
    expect(ok.result).toBe('ok');
    expect(ok.edge).toMatchObject({ id: 'e1', source: 'n1', target: 'n2', label: 'done' });
    expect(addEdge(ok.map, 'n1', 'n2').result).toBe('duplicate');
    expect(addEdge(ok.map, 'n1', 'n1').result).toBe('self');
    expect(addEdge(ok.map, 'n1', 'zz').result).toBe('missing');
    // Removing a step removes its connections too.
    expect(removeNode(ok.map, 'n2').edges).toEqual([]);
  });

  it('moves lanes with their steps and removes lanes into the neighbour', () => {
    let map = twoLaneMap();
    map = addNode(map, 'task', 'A', 'lane-1').map;
    map = addNode(map, 'task', 'B', 'lane-2').map;
    const swapped = moveLane(map, 'lane-1', 1);
    expect(swapped.lanes.map((l) => l.id)).toEqual(['lane-2', 'lane-1']);
    expect(swapped.nodes.find((n) => n.label === 'A')!.y).toBeGreaterThanOrEqual(LANE_HEIGHT);
    expect(swapped.nodes.find((n) => n.label === 'B')!.y).toBeLessThan(LANE_HEIGHT);
    expect(moveLane(map, 'lane-1', -1)).toBe(map);

    const removed = removeLane(map, 'lane-1');
    expect(removed.lanes.map((l) => l.id)).toEqual(['lane-2']);
    expect(removed.nodes.every((n) => n.lane_id === 'lane-2')).toBe(true);
    expect(removed.nodes.every((n) => n.y < LANE_HEIGHT)).toBe(true);
  });

  it('assigns lane-less steps to the first lane when lanes are added', () => {
    const map = addNode(emptyMap(), 'task', 'Lonely').map;
    expect(map.nodes[0].lane_id).toBeNull();
    expect(addLane(map, 'Team').map.nodes[0].lane_id).toBe('lane-1');
  });

  it('flags modelling issues', () => {
    expect(mapIssues(emptyMap())).toEqual([]);
    let map = addNode(emptyMap(), 'decision', 'OK?').map;
    map = addNode(map, 'task', '').map;
    const keys = mapIssues(map).map((i) => i.key);
    expect(keys).toEqual(['noStart', 'noEnd', 'unconnected', 'decisionBranches', 'unlabelled']);
  });

  it('draws forward connectors right-to-left and loops backwards ones', () => {
    const a = { id: 'a', type: 'task' as const, label: 'A', x: 0, y: 40 };
    const b = { id: 'b', type: 'task' as const, label: 'B', x: 300, y: 40 };
    expect(edgeGeometry(a, b).path.startsWith('M 160 72 H')).toBe(true);
    expect(edgeGeometry(b, a).path).toContain('V');
  });

  it('sizes the canvas around lanes and steps', () => {
    const map = addNode(twoLaneMap(), 'task', 'A', 'lane-2').map;
    const size = canvasSize(map);
    expect(size.height).toBeGreaterThanOrEqual(2 * LANE_HEIGHT);
    expect(size.width).toBeGreaterThanOrEqual(760);
  });

  it('orders steps lane by lane for the text alternative', () => {
    let map = twoLaneMap();
    map = addNode(map, 'task', 'Second lane', 'lane-2').map;
    map = addNode(map, 'task', 'First lane', 'lane-1').map;
    expect(readingOrder(map).map((n) => n.label)).toEqual(['First lane', 'Second lane']);
  });

  it('wraps labels into a few short lines', () => {
    expect(wrapLabel('Check the incoming goods', 12)).toEqual(['Check the', 'incoming', 'goods']);
    expect(wrapLabel('one two three four five six seven', 5, 2)).toHaveLength(2);
    expect(wrapLabel('', 10)).toEqual([]);
  });

  it('compares maps structurally', () => {
    expect(sameMap(emptyMap(), emptyMap())).toBe(true);
    expect(sameMap(emptyMap(), addLane(emptyMap(), 'x').map)).toBe(false);
  });
});
