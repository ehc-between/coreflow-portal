import { quickRiskBody } from './risk-quick-wizard';

describe('quickRiskBody', () => {
  it('needs all three answers', () => {
    expect(quickRiskBody({ title: ' ', likelihood: 2, consequence: 3 })).toBeNull();
    expect(quickRiskBody({ title: 'Fire', likelihood: null, consequence: 3 })).toBeNull();
    expect(quickRiskBody({ title: 'Fire', likelihood: 2, consequence: null })).toBeNull();
  });

  it('rates the risk on the inherent scale', () => {
    expect(quickRiskBody({ title: ' Fire in the yard ', likelihood: 2, consequence: 4 })).toEqual({
      title: 'Fire in the yard',
      inherent_likelihood: 2,
      inherent_consequence: 4,
    });
  });
});
