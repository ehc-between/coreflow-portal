import { InterestedParty } from '../data/context.models';
import { partyMissing } from './party-detail';

const party = (over: Partial<InterestedParty> = {}): InterestedParty =>
  ({
    id: 'p1',
    code: 'IP-8',
    name: 'Certification body',
    needs: null,
    expectations: null,
    how_addressed: null,
    addressed_status: 'addressed',
    owner: null,
    ...over,
  }) as unknown as InterestedParty;

describe('partyMissing', () => {
  const edit = ['/context/interested-parties', 'p1', 'edit'];

  it('lists the overdue review first, then the empty main fields and the owner', () => {
    const review = () => undefined;
    expect(partyMissing(party(), edit, true, review).map((i) => i.key)).toEqual([
      'review',
      'needs',
      'how',
      'owner',
    ]);
    expect(partyMissing(party(), edit, true, null).map((i) => i.key)).not.toContain('review');
  });

  it('needs only one of needs / expectations and skips "how" when not relevant', () => {
    const items = partyMissing(
      party({
        expectations: 'Access to documentation',
        addressed_status: 'not_relevant',
        owner: { id: 'u1', name: 'Ola' } as never,
      }),
      edit,
      false,
      null,
    );
    expect(items).toEqual([]);
  });
});
