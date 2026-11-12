import { makeProcess } from '../data/processes.testing';
import {
  emptyForm,
  formFromDetail,
  mergeTurtleDraft,
  parseInterval,
  toCreateRequest,
  toUpdateRequest,
  validateForm,
} from './process-form-model';

describe('process form model', () => {
  it('validates the title, the interval and KPI names', () => {
    expect(validateForm(emptyForm())).toEqual(['processes.form.errors.titleRequired']);
    const form = { ...emptyForm(), title: 'X', review_interval_months: '0', kpis: [{ name: ' ' }] };
    expect(validateForm(form)).toEqual([
      'processes.form.errors.interval',
      'processes.form.errors.kpiName',
    ]);
    expect(parseInterval('')).toBeNull();
    expect(parseInterval('12')).toBe(12);
    expect(parseInterval('1.5')).toBeNaN();
  });

  it('builds a create request with nulls for empty values', () => {
    const body = toCreateRequest({
      ...emptyForm('u-1'),
      title: '  Sales ',
      next_review_at: '2027-03-01',
      kpis: [{ name: ' Win rate ', target: ' 30 ', unit: '', frequency: undefined }],
    });
    expect(body).toMatchObject({
      title: 'Sales',
      code: null,
      category: 'core',
      owner_user_id: 'u-1',
      department_id: null,
      review_interval_months: 12,
      next_review_at: '2027-03-01T00:00:00',
      kpis: [{ name: 'Win rate', target: '30', unit: null, frequency: null }],
    });
  });

  it('patches only the changed fields, with the change reason', () => {
    const process = makeProcess();
    const unchanged = toUpdateRequest(formFromDetail(process), process, 'why');
    expect(unchanged).toEqual({});

    const form = { ...formFromDetail(process), title: 'Buying', outputs: ['PO', 'Receipt'] };
    expect(toUpdateRequest(form, process, ' new name ')).toEqual({
      title: 'Buying',
      outputs: ['PO', 'Receipt'],
      change_reason: 'new name',
    });

    // Clearing the owner sends null; clearing the code is ignored.
    const cleared = { ...formFromDetail(process), owner_user_id: '', code: '' };
    expect(toUpdateRequest(cleared, process, '')).toEqual({ owner_user_id: null });
  });

  it('merges an assistant draft without overwriting or duplicating', () => {
    const form = { ...emptyForm(), title: 'X', purpose: 'Mine', inputs: ['Order'] };
    const merged = mergeTurtleDraft(form, {
      purpose: 'Suggested',
      inputs: ['order', 'Forecast', ''],
      outputs: ['Plan'],
      kpis: [{ name: 'Accuracy' }],
    });
    expect(merged.purpose).toBe('Mine');
    expect(merged.inputs).toEqual(['Order', 'Forecast']);
    expect(merged.outputs).toEqual(['Plan']);
    expect(merged.kpis).toEqual([{ name: 'Accuracy' }]);
    expect(mergeTurtleDraft(emptyForm(), { purpose: ' Why ' }).purpose).toBe('Why');
  });
});
