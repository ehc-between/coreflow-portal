import { InteractionMapNode } from '../data/process.models';
import { BAND_HEIGHT, MIN_GAP_X, BOX_WIDTH, layoutInteractions } from './interaction-layout';

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
    expect(layout.bands.map((b) => b.key)).toEqual(['management', 'core', 'support']);
    const at = (id: string) => layout.nodes.find((p) => p.id === id)!;
    expect(at('m').y).toBeLessThan(BAND_HEIGHT);
    expect(at('a').y).toBeGreaterThan(BAND_HEIGHT);
    expect(at('a').x).toBeLessThan(at('b').x);
    expect(at('s').y).toBeGreaterThan(2 * BAND_HEIGHT);
    expect(layout.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(layout.edges[0].path.startsWith('M ')).toBe(true);
    expect(layout.height).toBe(3 * BAND_HEIGHT);
  });

  it('widens the gap for long labels and adds an interested-party band', () => {
    const layout = layoutInteractions({
      nodes: [node('a', 'PR-001', 'core'), node('b', 'PR-002', 'core')],
      edges: [
        { id: 'e1', source_process_id: 'a', target_process_id: 'b', label: 'Confirmed order' },
      ],
      parties: [{ id: 'c', name: 'Customers' }],
      party_edges: [
        { id: 'pe', process_id: 'a', party_id: 'c', direction: 'incoming', label: 'Request' },
      ],
    });
    expect(layout.bands.map((b) => b.key)).toEqual(['parties', 'management', 'core', 'support']);
    const a = layout.nodes.find((n) => n.id === 'a')!;
    const b = layout.nodes.find((n) => n.id === 'b')!;
    expect(b.x - a.x - BOX_WIDTH).toBeGreaterThan(MIN_GAP_X);
    const pe = layout.edges.find((e) => e.id === 'pe')!;
    expect(pe).toMatchObject({ party: true, sourceId: 'c', targetId: 'a' });
  });

  it('handles an empty landscape', () => {
    const layout = layoutInteractions({ nodes: [], edges: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
  });
});
