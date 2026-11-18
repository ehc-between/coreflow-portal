import { toneFor } from '../../shared/ui/tones';
import { documentTypeName, lifecycleSteps, statusLabelKey } from './document-status';

describe('document status', () => {
  it('uses the shared lifecycle tones', () => {
    expect(toneFor('lifecycle', 'withdrawn')).toBe('neutral');
    expect(toneFor('lifecycle', 'superseded')).toBe('neutral');
    expect(toneFor('lifecycle', 'obsolete')).toBe('neutral');
    expect(toneFor('lifecycle', 'approved')).toBe('pass');
    expect(toneFor('lifecycle', 'in_review')).toBe('accent');
    expect(statusLabelKey('withdrawn')).toBe('documents.status.withdrawn');
  });

  it('walks the lifecycle steps', () => {
    expect(lifecycleSteps('in_review', false).map((s) => s.state)).toEqual([
      'done',
      'current',
      'todo',
      'todo',
    ]);
    expect(lifecycleSteps('approved', true).map((s) => s.state)).toEqual([
      'done',
      'done',
      'current',
      'todo',
    ]);
    // A new draft of an approved document keeps approval as done.
    expect(lifecycleSteps('draft', true).map((s) => s.state)).toEqual([
      'current',
      'todo',
      'done',
      'todo',
    ]);
  });

  it('never shows the raw type key', () => {
    expect(documentTypeName({ type: 'procedure', type_name: 'Prosedyre' })).toBe('Prosedyre');
    expect(documentTypeName({ type: 'policy' }, [{ key: 'policy', name: 'Policy' }])).toBe(
      'Policy',
    );
    expect(documentTypeName({ type: 'work_instruction' })).toBe('Work instruction');
  });
});
