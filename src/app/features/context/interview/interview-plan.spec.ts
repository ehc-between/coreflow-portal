import { emptyAnswers, interviewPlan } from './interview-plan';

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('interviewPlan', () => {
  it('plans nothing for empty answers', () => {
    expect(interviewPlan(emptyAnswers(), ['iso9001'], t, 2026)).toEqual([]);
  });

  it('drafts an analysis, a party per group or name, and a scope per unscoped standard', () => {
    const plan = interviewPlan(
      {
        what: 'We build boats for sailors.',
        parties: ['customer', 'employee'],
        otherParties: 'Harbour office\n\n',
        helps: 'Skilled staff',
        hinders: 'Steel prices\nStorms',
        covers: 'The yard in Oslo',
      },
      ['iso9001', 'iso14001'],
      t,
      2026,
    );
    expect(plan.map((p) => p.kind)).toEqual([
      'analysis',
      'party',
      'party',
      'party',
      'scope',
      'scope',
    ]);

    const analysis = plan[0].body;
    expect(analysis['method']).toBe('swot');
    expect(analysis['summary']).toBe('We build boats for sailors.');
    expect(
      (analysis['items'] as { category: string; text: string }[]).map((i) => [i.category, i.text]),
    ).toEqual([
      ['strength', 'Skilled staff'],
      ['threat', 'Steel prices'],
      ['threat', 'Storms'],
    ]);

    expect(plan[1].body).toMatchObject({ category: 'customer', party_type: 'external' });
    expect(plan[2].body).toMatchObject({ category: 'employee', party_type: 'internal' });
    expect(plan[3].body).toMatchObject({ name: 'Harbour office', category: 'other' });

    expect(plan[4].body).toMatchObject({
      framework: 'iso9001',
      statement: 'We build boats for sailors.',
      boundaries: 'The yard in Oslo',
    });
    expect(plan[5].body['framework']).toBe('iso14001');
  });

  it('skips the scope when every standard already has one', () => {
    const plan = interviewPlan({ ...emptyAnswers(), covers: 'All of it' }, [], t, 2026);
    expect(plan).toEqual([]);
  });
});
