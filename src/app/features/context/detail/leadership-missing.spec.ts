import { Policy, Responsibility, ScopeStatement } from '../data/context.models';
import { leadershipMissing, raciStatus } from './leadership-missing';

const edit = ['/context/scopes', 's1', 'edit'];
const owner = { id: 'u1', name: 'Ola' } as never;

describe('leadershipMissing', () => {
  it('scope: overdue review first, then SoA, main fields, processes and owner', () => {
    const scope = {
      statement: '',
      products_services: null,
      processes: [],
      warnings: ['soa_missing'],
      owner: null,
    } as unknown as ScopeStatement;
    const keys = leadershipMissing('scope', scope, {
      editLink: edit,
      reviewOverdue: true,
      review: () => undefined,
    }).map((i) => i.key);
    expect(keys).toEqual(['review', 'soa', 'statement', 'products', 'processes', 'owner']);
  });

  it('policy: asks to communicate only when approved, unacknowledged and allowed', () => {
    const policy = {
      status: 'approved',
      statement: 'We deliver',
      documents: [{ entity_id: 'd1' }],
      acknowledgements: { total: 0 },
      owner,
    } as unknown as Policy;
    const ctx = { editLink: edit, reviewOverdue: false, review: null };
    expect(leadershipMissing('policy', policy, ctx)).toEqual([]);
    const items = leadershipMissing('policy', policy, { ...ctx, communicate: () => undefined });
    expect(items.map((i) => i.key)).toEqual(['communicate']);
  });

  it('responsibility: names the missing A and R and the maintainer', () => {
    const raci = {
      status: 'active',
      description: 'Approve policies',
      assignments: [{ type: 'role', value: 'member', raci: 'I', name: null }],
      warnings: ['no_accountable', 'no_responsible'],
      owner: null,
    } as unknown as Responsibility;
    const items = leadershipMissing('responsibility', raci, {
      editLink: edit,
      reviewOverdue: false,
      review: null,
    });
    expect(items.map((i) => i.key)).toEqual(['accountable', 'responsible', 'owner']);
    expect(items[2].labelKey).toBe('context.leadDetail.missing.maintainer');
  });
});

describe('raciStatus', () => {
  const base = { status: 'active', warnings: [] } as unknown as Responsibility;

  it('is complete without warnings, a to-do with one, neutral when archived', () => {
    expect(raciStatus(base).tone).toBe('pass');
    const gap = raciStatus({ ...base, warnings: ['no_responsible'] });
    expect(gap).toEqual({ key: 'context.raci.warningText.no_responsible', tone: 'warn' });
    expect(raciStatus({ ...base, status: 'archived' }).tone).toBe('neutral');
  });
});
