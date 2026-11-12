import { InteractionMapNode } from '../data/process.models';
import { BAND_HEIGHT, layoutInteractions } from './interaction-layout';

const node = (id: string, code: string, category: InteractionMapNode['category']) => ({
  id,
  code,
  title: id,
  category,
  status: 'active' as const,
  owner: null,
  url: `/processes/${id}`,
});

describe('layoutInteractions', () => {
  it('places processes in management / core / support bands, ordered by code', () => {
    const layout = layoutInteractions({
      nodes: [
        node('b', 'PR-010', 'core'),
        node('a', 'PR-002', 'core'),
        node('m', 'PR-001', 'management'),
        node('s', 'PR-020', 'support'),
      ],
      edges: [
        { id: 'e1', source_process_id: 'a', target_process_id: 'b', label: 'orders' },
        { id: 'e2', source_process_id: 'm', target_process_id: 'a', label: null },
        { id: 'e3', source_process_id: 'a', target_process_id: 'missing', label: null },
      ],
    });
    expect(layout.bands.map((b) => b.category)).toEqual(['management', 'core', 'support']);
    const at = (id: string) => layout.nodes.find((p) => p.node.id === id)!;
    expect(at('m').y).toBeLessThan(BAND_HEIGHT);
    expect(at('a').y).toBeGreaterThan(BAND_HEIGHT);
    expect(at('a').x).toBeLessThan(at('b').x);
    expect(at('s').y).toBeGreaterThan(2 * BAND_HEIGHT);
    expect(layout.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(layout.edges[0].path.startsWith('M ')).toBe(true);
    expect(layout.height).toBe(3 * BAND_HEIGHT);
  });

  it('handles an empty landscape', () => {
    const layout = layoutInteractions({ nodes: [], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
  });
});
