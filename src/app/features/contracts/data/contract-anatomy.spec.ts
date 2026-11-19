import { makeContract } from '../contracts.testing';
import {
  CONTRACT_SECTIONS,
  contractStatusSentence,
  contractTodos,
  counterpartiesOf,
} from './contract-anatomy';

describe('contract anatomy', () => {
  it('says what the status means, green only for a contract in force', () => {
    expect(contractStatusSentence(makeContract({ status: 'draft' })).tone).toBe('warn');
    expect(contractStatusSentence(makeContract({ status: 'in_review' })).tone).toBe('info');
    const active = contractStatusSentence(
      makeContract({ status: 'active', end_date: '2027-01-22', auto_renew: true }),
    );
    expect(active).toEqual({
      key: 'contracts.detail.statusLine.activeRenews',
      tone: 'pass',
      date: '2027-01-22',
    });
    expect(contractStatusSentence(makeContract({ status: 'active', end_date: null })).key).toBe(
      'contracts.detail.statusLine.activeOpen',
    );
    const ended = contractStatusSentence(
      makeContract({ status: 'terminated', termination_date: '2026-05-01' }),
    );
    expect(ended.tone).toBe('neutral');
    expect(ended.date).toBe('2026-05-01');
  });

  it('turns the warnings into things to do, each with a place to do it', () => {
    const todos = contractTodos(
      makeContract({
        warnings: ['dpa_missing', 'signed_copy_missing', 'notice_soon', 'end_date_missing'],
        allowed_actions: ['renew'],
      }),
    );
    expect(todos.map((t) => t.key)).toEqual([
      'dpa_missing',
      'signed_copy_missing',
      'notice_soon',
      'end_date_missing',
    ]);
    expect(todos[0].target).toEqual({ kind: 'section', id: CONTRACT_SECTIONS.dpa });
    expect(todos[1].target).toEqual({ kind: 'section', id: CONTRACT_SECTIONS.versions });
    expect(todos[2].target).toEqual({ kind: 'action', action: 'renew' });
    expect(todos[3].target).toEqual({ kind: 'edit' });
  });

  it('asks for a counterparty, and stays quiet on closed or read-only contracts', () => {
    const base = makeContract();
    const ours = base.parties.filter((p) => p.is_internal);
    const alone = makeContract({ parties: ours, warnings: [] });
    expect(counterpartiesOf(alone)).toEqual([]);
    expect(contractTodos(alone).map((t) => t.key)).toEqual(['counterparty']);
    expect(contractTodos(makeContract({ status: 'expired', warnings: ['dpa_missing'] }))).toEqual(
      [],
    );
    expect(contractTodos(makeContract({ can_edit: false, warnings: ['dpa_missing'] }))).toEqual([]);
  });
});
