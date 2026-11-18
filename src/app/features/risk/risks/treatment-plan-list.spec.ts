import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap } from '@angular/router';
import { APP_CONFIG } from '../../../core/config/app-config';
import { RiskApi } from '../data/risk-api';
import { parseRiskFilters, riskQuery } from './risk-list';
import { treatmentFiltersFromParams } from './treatment-plan-list';

const BASE = 'http://test/api';

describe('U24 risk treatment plan', () => {
  it('reads the tile filters from the URL (open by default)', () => {
    expect(treatmentFiltersFromParams(convertToParamMap({}))).toMatchObject({
      status: 'open',
      overdue: false,
      check: false,
      mine: false,
      sort: 'due_at',
    });
    expect(
      treatmentFiltersFromParams(
        convertToParamMap({ status: 'done', check: 'true', overdue: 'true', owner: 'me' }),
      ),
    ).toMatchObject({ status: 'done', check: true, overdue: true, mine: true });
    expect(treatmentFiltersFromParams(convertToParamMap({ status: 'bogus' })).status).toBe('open');
  });

  it('calls the org-wide treatment list with the same filters as the tiles', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(RiskApi)
      .listAllTreatments('org-1', {
        status: 'open',
        overdue: true,
        needs_effectiveness_check: false,
        sort: 'due_at',
        limit: 50,
        offset: 0,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/org-1/risk/treatments`);
    expect(req.request.params.get('status')).toBe('open');
    expect(req.request.params.get('overdue')).toBe('true');
    expect(req.request.params.has('needs_effectiveness_check')).toBe(false);
    req.flush({ items: [], total: 0 });
    http.verify();
  });

  it('lets the "no owner" line open the risks without an owner', () => {
    const filters = parseRiskFilters({ owner: 'none' });
    expect(filters.owner).toBe('none');
    expect(riskQuery(filters, '', 0).owner).toBe('none');
  });
});
