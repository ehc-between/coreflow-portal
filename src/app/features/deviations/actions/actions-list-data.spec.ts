import { convertToParamMap } from '@angular/router';
import { actionListQueryParams, parseActionListQuery, toActionFilters } from './actions-list-data';

describe('actions list query', () => {
  it('defaults to every open action', () => {
    expect(parseActionListQuery(convertToParamMap({}))).toEqual({ scope: 'open', owner: 'all' });
  });

  it('reads the overdue and mine drill-downs', () => {
    expect(
      parseActionListQuery(convertToParamMap({ overdue: 'true', owner_user_id: 'me' })),
    ).toEqual({ scope: 'overdue', owner: 'me' });
  });

  it('ignores unknown values', () => {
    expect(
      parseActionListQuery(convertToParamMap({ overdue: 'yes', owner_user_id: 'someone' })),
    ).toEqual({ scope: 'open', owner: 'all' });
  });

  it('round-trips through query params, omitting defaults', () => {
    expect(actionListQueryParams({ scope: 'open', owner: 'all' })).toEqual({});
    const params = actionListQueryParams({ scope: 'overdue', owner: 'me' });
    expect(params).toEqual({ overdue: 'true', owner_user_id: 'me' });
    expect(parseActionListQuery(convertToParamMap(params))).toEqual({
      scope: 'overdue',
      owner: 'me',
    });
  });

  it('maps to API filters, leaving status to the backend default (open + in progress)', () => {
    expect(toActionFilters({ scope: 'open', owner: 'all' }, 25, 50)).toEqual({
      owner_user_id: undefined,
      overdue: undefined,
      sort: 'due_at',
      limit: 25,
      offset: 50,
    });
    expect(toActionFilters({ scope: 'overdue', owner: 'me' }, 25, 0)).toMatchObject({
      owner_user_id: 'me',
      overdue: true,
    });
  });
});
