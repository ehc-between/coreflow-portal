import { riskExplainKey, technicalDocCopy } from './ai-governance-display';

describe('riskExplainKey', () => {
  it('gives deployers and intermediaries the duties of their own role for high risk', () => {
    expect(riskExplainKey('high', 'provider')).toBe('aiGovernance.riskExplain.high');
    expect(riskExplainKey('high', 'provider_and_deployer')).toBe('aiGovernance.riskExplain.high');
    expect(riskExplainKey('high', 'product_manufacturer')).toBe('aiGovernance.riskExplain.high');
    expect(riskExplainKey('high', 'deployer')).toBe('aiGovernance.riskExplainByRole.deployer.high');
    for (const role of ['importer', 'distributor', 'authorised_representative']) {
      expect(riskExplainKey('high', role)).toBe('aiGovernance.riskExplainByRole.other.high');
    }
  });

  it('keeps the shared explanation for the other risk classes', () => {
    expect(riskExplainKey('limited', 'deployer')).toBe('aiGovernance.riskExplain.limited');
    expect(riskExplainKey('minimal', null)).toBe('aiGovernance.riskExplain.minimal');
  });
});

describe('technicalDocCopy', () => {
  it('marks Annex IV required only for the provider audience', () => {
    expect(technicalDocCopy({ required: true, audience: 'provider' })).toEqual({
      badge: 'aiGovernance.docs.required',
      body: 'aiGovernance.docs.requiredBody',
    });
    expect(technicalDocCopy({ required: false, audience: 'deployer' })).toEqual({
      badge: 'aiGovernance.docs.providerDuty',
      body: 'aiGovernance.docs.deployerBody',
    });
    expect(technicalDocCopy({ required: false, audience: 'other' })).toEqual({
      badge: 'aiGovernance.docs.providerDuty',
      body: 'aiGovernance.docs.otherBody',
    });
    expect(technicalDocCopy({ required: false, audience: 'none' })).toEqual({
      badge: null,
      body: 'aiGovernance.docs.optionalBody',
    });
  });

  it('falls back to `required` when the payload has no audience', () => {
    expect(technicalDocCopy({ required: true }).body).toBe('aiGovernance.docs.requiredBody');
    expect(technicalDocCopy({ required: false }).badge).toBeNull();
  });
});
