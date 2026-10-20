import { statusLabelKey, statusTone } from './document-status';

describe('document status', () => {
  it('shows withdrawn (and superseded / obsolete) revisions in the neutral tone', () => {
    expect(statusTone('withdrawn')).toBe('neutral');
    expect(statusTone('superseded')).toBe('neutral');
    expect(statusTone('obsolete')).toBe('neutral');
    expect(statusLabelKey('withdrawn')).toBe('documents.status.withdrawn');
  });

  it('keeps the workflow tones', () => {
    expect(statusTone('approved')).toBe('pass');
    expect(statusTone('in_review')).toBe('warn');
    expect(statusTone('draft')).toBe('info');
  });
});
