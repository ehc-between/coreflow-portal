import { WorkflowDefinition } from '../../core/records/record.models';
import { layoutWorkflow } from './workflow-layout';

const definition: WorkflowDefinition = {
  initial_state: 'open',
  states: [
    { key: 'open', label: 'Open', category: 'open' },
    { key: 'work', label: 'Work', category: 'in_progress' },
    { key: 'done', label: 'Done', category: 'done' },
    { key: 'cancelled', label: 'Cancelled', category: 'cancelled' },
    { key: 'orphan', label: 'Orphan', category: 'open' },
  ],
  transitions: [
    { key: 'start', from: ['open'], to: 'work', label: 'Start' },
    { key: 'finish', from: ['work'], to: 'done', label: 'Finish' },
    { key: 'cancel', from: ['open', 'work'], to: 'cancelled', label: 'Cancel' },
    { key: 'reopen', from: ['done'], to: 'open', label: 'Reopen' },
  ],
};

describe('layoutWorkflow', () => {
  it('places states in columns by distance from the initial state', () => {
    const layout = layoutWorkflow(definition);
    const x = Object.fromEntries(layout.nodes.map((n) => [n.key, n.x]));
    expect(x['open']).toBeLessThan(x['work']);
    expect(x['work']).toBe(x['cancelled']);
    expect(x['done']).toBeGreaterThan(x['work']);
    // Unreachable states go after the last column.
    expect(x['orphan']).toBeGreaterThan(x['done']);
    expect(layout.nodes.find((n) => n.key === 'open')?.initial).toBe(true);
  });

  it('draws one edge per source state and marks back edges', () => {
    const layout = layoutWorkflow(definition);
    expect(layout.edges.map((e) => e.id).sort()).toEqual(
      ['cancel:open', 'cancel:work', 'finish:work', 'reopen:done', 'start:open'].sort(),
    );
    expect(layout.edges.find((e) => e.transition === 'reopen')?.back).toBe(true);
    expect(layout.edges.find((e) => e.transition === 'start')?.back).toBe(false);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('ignores transitions to unknown states and handles an empty definition', () => {
    const layout = layoutWorkflow({
      initial_state: 'x',
      states: [],
      transitions: [{ key: 't', from: ['a'], to: 'b', label: 'T' }],
    });
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });
});
