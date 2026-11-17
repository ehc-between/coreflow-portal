import { makeJourney, makeStep } from '../dashboard/data/home.testing';
import { recommendations } from './recommended-lessons';

const lesson = (scope: string, key: string) => ({
  scope,
  key,
  url: `/account/learning/${scope}/${key}`,
});

describe('recommended lessons', () => {
  it('takes the lessons of open steps of active journeys, once each and in order', () => {
    const journey = makeJourney({
      phases: [
        {
          key: 'scope',
          title: 'Scope',
          summary: null,
          done: 1,
          total: 3,
          skipped: 0,
          percent: 33,
          steps: [
            makeStep({ key: 'a', status: 'done', lesson: lesson('context', 'scope') }),
            makeStep({ key: 'b', title: 'Assess risks', lesson: lesson('risk', 'first-risk') }),
            makeStep({ key: 'c', lesson: lesson('risk', 'first-risk') }),
            makeStep({ key: 'd', lesson: null }),
            makeStep({ key: 'e', status: 'skipped', lesson: lesson('audits', 'internal') }),
            makeStep({ key: 'f', title: 'Train people', lesson: lesson('training', 'awareness') }),
          ],
        },
      ],
    });
    expect(recommendations([journey])).toEqual([
      {
        scope: 'risk',
        key: 'first-risk',
        url: '/account/learning/risk/first-risk',
        step: 'Assess risks',
        journey: 'Get ready for ISO 27001',
      },
      {
        scope: 'training',
        key: 'awareness',
        url: '/account/learning/training/awareness',
        step: 'Train people',
        journey: 'Get ready for ISO 27001',
      },
    ]);
  });

  it('ignores archived journeys and caps the list', () => {
    const steps = Array.from({ length: 6 }, (_, i) =>
      makeStep({ key: `s${i}`, lesson: lesson('risk', `l${i}`) }),
    );
    const phases = [{ ...makeJourney().phases[0], steps }];
    expect(recommendations([makeJourney({ phases })])).toHaveLength(4);
    expect(recommendations([makeJourney({ phases, status: 'archived' })])).toEqual([]);
  });
});
