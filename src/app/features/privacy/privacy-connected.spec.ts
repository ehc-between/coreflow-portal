import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { PrivacyGap } from './data/privacy.models';
import { prefillValues, validate } from './data/privacy-form-model';
import { REGISTERS } from './data/privacy-registers';
import { makeBreach, makeDpia, makeDsr, makeRopa } from './privacy.testing';
import { PrivacyGaps, splitRoute } from './privacy-gaps';
import { nextStep } from './register-detail';
import { RetentionRuns } from './retention-runs';

async function render(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

describe('next workflow step', () => {
  it('offers the step that moves each record forward', () => {
    expect(nextStep('ropa', makeRopa({ status: 'draft' }))?.status).toBe('active');
    expect(nextStep('ropa', makeRopa({ status: 'active' }))).toBeNull();
    expect(
      nextStep('dpia', makeDpia({ status: 'screening', screening_result: 'required' }))?.labelKey,
    ).toBe('privacy.next.startDpia');
    expect(
      nextStep('dpia', makeDpia({ status: 'screening', screening_result: 'not_required' }))?.status,
    ).toBe('not_required');
    expect(nextStep('dpia', makeDpia({ status: 'in_progress' }))?.status).toBe('awaiting_decision');
    // A breach closes only once both notification decisions are recorded.
    expect(nextStep('breach', makeBreach({ status: 'open' }))?.status).toBe('assessing');
    expect(nextStep('breach', makeBreach({ status: 'assessing' }))).toBeNull();
    expect(
      nextStep(
        'breach',
        makeBreach({
          status: 'assessing',
          authority_notification_required: false,
          subjects_notification_required: false,
        }),
      )?.status,
    ).toBe('closed');
    // A request is closed once the reply is sent.
    expect(nextStep('dsr', makeDsr())).toBeNull();
    expect(nextStep('dsr', makeDsr({ responded_at: '2026-11-20T10:00:00' }))?.status).toBe(
      'completed',
    );
  });
});

describe('prefill from a gap fix or a flow', () => {
  it('keeps only fields of the register, with valid values', () => {
    expect(
      prefillValues(REGISTERS.lba, {
        ropa_entry_id: 'r-1',
        legal_basis: 'legitimate_interests',
        title: 'GPS',
        unknown: 'x',
      }),
    ).toEqual({ ropa_entry_id: 'r-1', legal_basis: 'legitimate_interests', title: 'GPS' });
    expect(prefillValues(REGISTERS.lba, { legal_basis: 'nonsense' })).toEqual({});
    expect(
      prefillValues(REGISTERS.transfer, { destination_country: 'us', mechanism: 'sccs' }),
    ).toEqual({ destination_country: 'US', mechanism: 'sccs' });
    expect(prefillValues(REGISTERS.ropa, { processor_ids: 'p-1,p-2' })).toEqual({
      processor_ids: ['p-1', 'p-2'],
    });
  });

  it('asks a retention rule for its period in months or in words', () => {
    const base = {
      title: 'CRM',
      data_category: 'Customers',
      retention_months: '',
      retention_period: '',
    };
    expect(validate(REGISTERS.retention, base, 'create')['retention_months']).toBe(
      'privacy.form.periodRequired',
    );
    expect(validate(REGISTERS.retention, { ...base, retention_months: '36' }, 'create')).toEqual(
      {},
    );
    expect(
      validate(REGISTERS.retention, { ...base, retention_period: '5 years after' }, 'create'),
    ).toEqual({});
  });
});

describe('PrivacyGaps', () => {
  const gap = (over: Partial<PrivacyGap> = {}): PrivacyGap => ({
    key: 'lia_missing:r-3',
    kind: 'lia_missing',
    severity: 'high',
    article: 'gdpr:6',
    entity_type: 'ropa_entry',
    entity_id: 'r-3',
    code: 'ROPA-0003',
    title: 'GPS tracking',
    url: '/privacy/ropa/r-3',
    params: {},
    fix: {
      action: 'create',
      entity_type: 'legal_basis_assessment',
      url: '/privacy/legal-basis-assessments/new?ropa_entry_id=r-3&legal_basis=legitimate_interests',
      prefill: {},
    },
    ...over,
  });

  it('links each gap to its prefilled fix', async () => {
    configureKit(PrivacyGaps, { permissions: ['privacy:read'] });
    const fixture = TestBed.createComponent(PrivacyGaps);
    fixture.componentRef.setInput('gaps', [gap(), gap({ key: 'b', kind: 'dpa_missing' })]);
    fixture.componentRef.setInput('limit', 1);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const fix = el.querySelector('[data-testid="gap-fix-lia_missing"]')!;
    expect(fix.getAttribute('href')).toBe(
      '/privacy/legal-basis-assessments/new?ropa_entry_id=r-3&legal_basis=legitimate_interests',
    );
    expect(el.querySelectorAll('[data-testid="privacy-gaps"] li').length).toBe(1);
    el.querySelector<HTMLElement>('[data-testid="gaps-show-all"]')!.click();
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="privacy-gaps"] li').length).toBe(2);
  });

  it('splits a route with its query', () => {
    expect(splitRoute('/privacy/ropa/1?execute=1')).toEqual({
      path: '/privacy/ropa/1',
      query: { execute: '1' },
    });
    expect(splitRoute('/privacy')).toEqual({ path: '/privacy', query: null });
  });
});

describe('RetentionRuns', () => {
  it('logs a deletion run and lists it', async () => {
    const { http } = configureKit(RetentionRuns, {
      permissions: ['privacy:read', 'privacy:write'],
      providers: [
        {
          provide: NotificationService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(RetentionRuns);
    fixture.componentRef.setInput('schedule', {
      ...makeRopa(),
      id: 's-1',
      code: 'RET-0001',
      status: 'active',
      ropa_entry_id: null,
      data_category: 'CRM',
      retention_period: '36 months',
      retention_months: 36,
      trigger_event: null,
      legal_reference: null,
      disposal_method: 'anonymise',
      review_due_at: null,
      execution_interval_months: 12,
      last_executed_at: null,
      next_execution_due_at: '2026-11-01T00:00:00',
      execution_overdue: true,
    });
    fixture.componentRef.setInput('canWrite', true);
    fixture.componentRef.setInput('openForm', true);
    const el = fixture.nativeElement as HTMLElement;
    await render(fixture);
    http
      .expectOne(kitUrl('privacy/retention-schedules/s-1/executions'))
      .flush({ items: [], total: 0 });
    await render(fixture);
    expect(el.querySelector('[data-testid="retention-log-empty"]')).toBeTruthy();
    // `?execute=1` opened the form; the method defaults to the rule's disposal method.
    expect(el.querySelector<HTMLSelectElement>('#cf-run-method')!.value).toBe('anonymise');
    const count = el.querySelector<HTMLInputElement>('#cf-run-count')!;
    count.value = '120';
    count.dispatchEvent(new Event('input'));
    el.querySelector<HTMLElement>('[data-testid="retention-execute-save"] button')!.click();
    await render(fixture);
    const req = http.expectOne(kitUrl('privacy/retention-schedules/s-1/executions'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ method: 'anonymise', records_affected: 120 });
    req.flush({
      id: 'x',
      retention_schedule_id: 's-1',
      executed_at: '2026-11-18T09:00:00',
      executed_by: null,
      method: 'anonymise',
      records_affected: 120,
      notes: null,
      evidence_reference: null,
      created_at: '2026-11-18T09:00:00',
    });
    await render(fixture);
    expect(el.querySelectorAll('[data-testid="retention-log"] li').length).toBe(1);
  });
});
