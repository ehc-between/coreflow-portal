import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from '../../../core/config/app-config';
import { CustomersApi } from './customers-api';
import { MatchGroup } from './customer.models';

const BASE = 'http://test/api';
const ORG = 'org-1';

const GROUP: MatchGroup = {
  proposed: {
    id: 'c-1',
    code: 'CUS-0001',
    name: 'Fjord Industrier ASA',
    status: 'active',
    deleted: false,
  },
  proposed_name: 'Fjord Industrier ASA',
  items: [],
};

describe('CustomersApi', () => {
  let api: CustomersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      ],
    });
    api = TestBed.inject(CustomersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the pending match groups from the API shape {groups, total}', () => {
    let groups: readonly MatchGroup[] = [];
    api.matches(ORG).subscribe((g) => (groups = g));
    const req = http.expectOne((r) => r.url === `${BASE}/v1/orgs/${ORG}/customers/matches`);
    expect(req.request.params.get('status')).toBe('pending');
    req.flush({ groups: [GROUP], total: 1 });
    expect(groups).toEqual([GROUP]);
  });
});
