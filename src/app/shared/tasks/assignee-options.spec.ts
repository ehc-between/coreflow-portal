import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeOptionsService } from './assignee-options';

describe('AssigneeOptionsService (U26: pickers read the People register)', () => {
  it('carries the job title and register membership of each user', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal(null) } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal('org-1'),
            currentOrg: signal({ id: 'org-1', permissions: ['documents:read'] }),
          },
        },
        {
          provide: DocumentsApi,
          useValue: {
            listAccessSubjects: () =>
              of({
                users: [
                  {
                    id: 'u-1',
                    name: 'Emma',
                    email: 'emma@x.no',
                    employee_id: 'e-1',
                    employee_code: 'EMP-1',
                    job_title: 'Kvalitetsleder',
                  },
                  {
                    id: 'u-2',
                    name: 'Lars',
                    email: 'lars@x.no',
                    employee_id: null,
                    employee_code: null,
                    job_title: null,
                  },
                  { id: 'u-3', name: 'Old', email: 'old@x.no' },
                ],
                departments: [],
              }),
          },
        },
      ],
    });
    const service = TestBed.inject(AssigneeOptionsService);
    service.ensureLoaded();
    const users = service.options().users;
    expect(users.map((u) => [u.label, u.detail, u.inRegister])).toEqual([
      ['Emma', 'Kvalitetsleder', true],
      ['Lars', null, false],
      ['Old', null, undefined],
    ]);
  });
});
