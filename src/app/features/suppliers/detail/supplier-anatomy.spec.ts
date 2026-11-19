import { EvaluationDetail, SupplierDetail } from '../data/supplier.models';
import { evaluationStatusKey, evaluationTone, supplierTodos } from './supplier-anatomy';

function supplier(patch: Partial<SupplierDetail>): SupplierDetail {
  return {
    id: 's-1',
    status: 'prospective',
    approved_at: null,
    owner: { id: 'u-1', name: 'Kari' },
    attention: [],
    required_assessments: [],
    open_conditions: null,
    can_edit: true,
    ...patch,
  } as unknown as SupplierDetail;
}

const all = () => true;

describe('supplierTodos', () => {
  it('turns attention flags into steps, one per evaluation kind', () => {
    const todos = supplierTodos(
      supplier({
        attention: ['not_approved', 'dpa_missing', 'certificate_expired'],
        required_assessments: [
          {
            kind: 'initial',
            reason: 'always',
            done: false,
            latest: null,
            open_evaluation_id: null,
          },
          {
            kind: 'privacy',
            reason: 'personal_data',
            done: false,
            latest: null,
            open_evaluation_id: 'e-2',
          },
        ],
      }),
      all,
    );
    expect(todos.map((t) => [t.key, t.kind])).toEqual([
      ['not_approved', 'start'],
      ['dpa_missing', 'flow'],
      ['certificate_expired', 'edit'],
      ['required:privacy', 'open'],
    ]);
  });

  it('labels a required assessment that is not started', () => {
    const [todo] = supplierTodos(
      supplier({
        required_assessments: [
          {
            kind: 'security',
            reason: 'system_access',
            done: false,
            latest: null,
            open_evaluation_id: null,
          },
        ],
      }),
      all,
    );
    expect(todo).toMatchObject({ kind: 'start', evaluation: 'security' });
    expect(todo.labelKey).toBe('suppliers.detail.todo.required');
  });

  it('points to the agreements card without the permission to create a DPA', () => {
    const [todo] = supplierTodos(supplier({ attention: ['dpa_missing'] }), () => false);
    expect(todo.kind).toBe('agreements');
  });

  it('leaves out steps a reader cannot take, but keeps links', () => {
    const todos = supplierTodos(
      supplier({
        can_edit: false,
        owner: null,
        attention: ['not_approved', 'no_next_evaluation'],
        open_conditions: {
          text: 'Send the ISO certificate',
          evaluation_id: 'e-1',
          evaluation_url: '/suppliers/s-1/evaluations/e-1',
          decided_at: null,
          due_at: '2026-12-01',
          overdue: true,
          task_id: null,
          task_status: null,
        },
      }),
      all,
    );
    expect(todos).toEqual([
      expect.objectContaining({
        key: 'conditions',
        kind: 'link',
        labelKey: 'suppliers.detail.todo.conditionsOverdue',
      }),
    ]);
  });

  it('asks for a supplier owner', () => {
    const todos = supplierTodos(supplier({ owner: null }), all);
    expect(todos.map((t) => t.key)).toEqual(['owner']);
  });
});

describe('evaluation status sentence', () => {
  const e = (status: EvaluationDetail['status'], decision: EvaluationDetail['decision'] = null) =>
    ({ status, decision }) as EvaluationDetail;

  it('is green only for an approval, a to-do never red', () => {
    expect(evaluationTone(e('completed', 'approved'))).toBe('pass');
    expect(evaluationTone(e('completed', 'conditional'))).toBe('warn');
    expect(evaluationTone(e('completed', 'rejected'))).toBe('fail');
    expect(evaluationTone(e('draft'))).toBe('warn');
    expect(evaluationTone(e('submitted'))).toBe('info');
    expect(evaluationTone(e('cancelled'))).toBe('neutral');
  });

  it('names the decision once decided', () => {
    expect(evaluationStatusKey(e('completed', 'conditional'))).toBe(
      'suppliers.evaluation.lead.status.decided.conditional',
    );
    expect(evaluationStatusKey(e('draft'))).toBe('suppliers.evaluation.lead.status.draft');
  });
});
