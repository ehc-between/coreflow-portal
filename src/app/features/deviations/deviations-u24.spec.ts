import { convertToParamMap } from '@angular/router';
import { filtersFromParams, stateFilter, toDeviationFilters } from './deviations-list';

/** U24: the statistics tiles open the register filtered to the rows they count. */
describe('Deviation register filters behind the statistics tiles', () => {
  it('maps ?active, ?overdue and ?closed to the one status filter', () => {
    expect(filtersFromParams(convertToParamMap({ active: 'true' }))['state']).toBe('scope:active');
    expect(filtersFromParams(convertToParamMap({ overdue: 'true' }))['state']).toBe(
      'scope:overdue',
    );
    expect(filtersFromParams(convertToParamMap({ closed: 'true', type_id: 't-1' }))).toEqual({
      state: 'scope:closed',
      type_id: 't-1',
    });
  });

  it('sends closed=true for the closed scope (the same rule as stats.closed)', () => {
    expect(stateFilter('scope:closed')).toEqual({ closed: true });
    expect(toDeviationFilters('', { state: 'scope:closed' }).closed).toBe(true);
  });
});
