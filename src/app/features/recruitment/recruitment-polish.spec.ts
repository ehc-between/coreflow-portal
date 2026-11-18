import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import recruitmentEn from '../../../assets/i18n/recruitment/en.json';
import recruitmentNb from '../../../assets/i18n/recruitment/nb.json';
import standardsEn from '../../../assets/i18n/standards/en.json';
import standardsNb from '../../../assets/i18n/standards/nb.json';
import kitEn from '../../../assets/i18n/kit/en.json';
import kitNb from '../../../assets/i18n/kit/nb.json';
import guidanceEn from '../../../assets/guidance/en/recruitment.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { toneFor } from '../../shared/ui/tones';
import { checksState } from './applications/application-checks';
import { attentionQuery, parseAttention, parseStageParam } from './applications/applications-list';
import {
  checksProgress,
  groupRequisitionActions,
  needsScreening,
  offerBlockers,
  offerNeedsOverride,
  requisitionToneValue,
  screeningProgress,
  splitUrl,
  stageToneValue,
  visibleStageTiles,
} from './data/recruitment-display';
import {
  ApplicationDetail,
  Check,
  OFFER_BLOCKERS,
  OVERVIEW_COUNTERS,
  RETENTION_BASES,
  STAGES,
  Stage,
} from './data/recruitment.models';
import { requisitionErrors, emptyRequisitionDraft } from './data/requisition-form-model';
import { recruitmentNavItems } from './shared/recruitment-nav';
import { StageMove } from './shared/stage-move';

type Dict = Record<string, unknown>;
const get = (d: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((n, k) => (n as Dict | undefined)?.[k], d);

const BASE = 'http://test/api';
const ORG = 'org-1';
const tick = () => new Promise((resolve) => setTimeout(resolve));

function app(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    id: 'a1',
    code: 'APP-0001',
    requisition_id: 'r1',
    requisition_code: 'REQ-0001',
    requisition_title: 'Adviser',
    candidate_id: 'c1',
    candidate_code: 'CAN-0001',
    candidate_name: 'Ola',
    stage: 'interview',
    stage_changed_at: null,
    offer_status: 'none',
    source: 'direct',
    created_at: '2026-11-01T10:00:00',
    updated_at: '2026-11-01T10:00:00',
    url: '/recruitment/applications/a1',
    cover_note: null,
    screening: [],
    rejection_reason: null,
    rejection_note: null,
    offer_start_date: null,
    offer_note: null,
    offer_extended_at: null,
    offer_responded_at: null,
    hired_at: null,
    onboarding_task_id: null,
    closed_at: null,
    created_by: null,
    privacy_notice_given: true,
    can_edit: true,
    criteria: [],
    required_checks: [],
    interviews: [],
    scorecards: [],
    checks: [],
    team_roles: [],
    ...overrides,
  };
}

describe('recruitment rules (A12)', () => {
  it('puts one next step first, reject next to approve, and the rest in "Mer"', () => {
    expect(groupRequisitionActions(['approve', 'reject', 'cancel', 'delete'])).toEqual({
      primary: 'approve',
      secondary: 'reject',
      overflow: ['cancel', 'delete'],
    });
    expect(groupRequisitionActions(['submit', 'cancel'])).toEqual({
      primary: 'submit',
      secondary: null,
      overflow: ['cancel'],
    });
    expect(groupRequisitionActions(['hold', 'fill', 'cancel']).primary).toBeNull();
  });

  it('explains a disabled offer from the server list, without closed/offer-made codes', () => {
    const blockers = offerBlockers(
      app({
        offer_blockers: [
          { code: 'offer_made' },
          { code: 'checks_open', count: 6, check_types: ['identity'] },
        ],
      }),
    );
    expect(blockers.map((b) => b.code)).toEqual(['checks_open']);
    expect(offerNeedsOverride(blockers)).toBe(false);
  });

  it('derives blockers locally on older servers and allows an override only for screening', () => {
    const blockers = offerBlockers(
      app({ screening_missing: ['c1', 'c2'], required_checks: [], checks: [] }),
    );
    expect(blockers).toEqual([{ code: 'screening_incomplete', count: 2, missing: ['c1', 'c2'] }]);
    expect(offerNeedsOverride(blockers)).toBe(true);
    const withChecks = offerBlockers(
      app({
        screening_missing: [],
        required_checks: ['identity'],
        checks: [{ check_type: 'identity', required: true, status: 'requested' } as Check],
      }),
    );
    expect(withChecks[0].code).toBe('checks_open');
  });

  it('needs screening only for the stages after it', () => {
    expect(needsScreening('interview')).toBe(true);
    expect(needsScreening('offer')).toBe(true);
    expect(needsScreening('screening')).toBe(false);
    expect(needsScreening('rejected')).toBe(false);
  });

  it('says checks are upcoming before the reference check, instead of "open"', () => {
    const summary = {
      required_types: ['identity', 'reference'] as const,
      planned: 0,
      open: 0,
      done: 0,
      failed: 0,
      not_planned: ['identity', 'reference'] as const,
    };
    expect(checksState('interview', summary, ['identity', 'reference'], [])).toBe('upcoming');
    expect(checksState('reference_check', summary, ['identity', 'reference'], [])).toBe('open');
    expect(checksState('offer', { ...summary, planned: 2, done: 2, not_planned: [] }, [], [])).toBe(
      'done',
    );
    expect(
      checksState('applied', { ...summary, required_types: [], not_planned: [] }, [], []),
    ).toBe('none');
  });

  it('reads the overview links into list filters', () => {
    const params = (q: Record<string, string>) => ({ get: (k: string) => q[k] ?? null });
    expect(parseAttention(params({ screening: 'incomplete' }))).toBe('screening_incomplete');
    expect(parseAttention(params({ checks: 'overdue' }))).toBe('checks_overdue');
    expect(parseAttention(params({ stalled: 'true' }))).toBe('stalled');
    expect(parseAttention(params({}))).toBe('');
    expect(attentionQuery('checks_open')).toEqual({ checks: 'open' });
    expect(parseStageParam('offer')).toBe('offer');
    expect(parseStageParam('applied,screening,interview')).toBe('active');
    expect(parseStageParam('nonsense')).toBe('');
    expect(splitUrl('/recruitment/applications?stage=offer&stalled=true')).toEqual({
      path: '/recruitment/applications',
      queryParams: { stage: 'offer', stalled: 'true' },
    });
  });

  it('maps stages and statuses onto the shared tone map', () => {
    expect(toneFor('lifecycle', stageToneValue('hired'))).toBe('pass');
    expect(toneFor('lifecycle', stageToneValue('rejected'))).toBe('fail');
    expect(toneFor('lifecycle', stageToneValue('interview'))).toBe('accent');
    expect(toneFor('lifecycle', requisitionToneValue('on_hold'))).toBe('warn');
    expect(toneFor('lifecycle', requisitionToneValue('filled'))).toBe('pass');
  });

  it('shows progress and only the stage tiles that have candidates', () => {
    expect(screeningProgress({ screening_assessed: 1, screening_total: 4 })).toEqual({
      done: 1,
      total: 4,
    });
    expect(checksProgress({ checks_done: 0, checks_required: 0 })).toBeNull();
    expect(visibleStageTiles({ applied: 2, interview: 0, offer: 1 }, STAGES)).toEqual([
      'applied',
      'offer',
    ]);
  });

  it('validates the requisition form on save', () => {
    expect(requisitionErrors(emptyRequisitionDraft())).toEqual({
      title: 'recruitment.form.errors.title',
    });
    expect(
      requisitionErrors({ ...emptyRequisitionDraft(), title: 'Adviser', headcount: 0 }),
    ).toEqual({ headcount: 'recruitment.form.errors.headcount' });
  });

  it('starts the module nav with the overview and shows settings to managers only', () => {
    expect(recruitmentNavItems(false).map((i) => i.link)).toEqual([
      '/recruitment',
      '/recruitment/requisitions',
      '/recruitment/applications',
      '/recruitment/candidates',
    ]);
    expect(recruitmentNavItems(true).at(-1)?.link).toBe('/recruitment/settings');
  });
});

describe('recruitment i18n (A12)', () => {
  const groups: [string, readonly string[]][] = [
    ['overview.counters', OVERVIEW_COUNTERS],
    ['offerBlockers', OFFER_BLOCKERS],
    ['privacy.retentionBasis', RETENTION_BASES],
    ['privacy.retentionBasisNoDays', RETENTION_BASES],
    ['timelineValues.stage', STAGES],
    ['timelineValues.from_stage', STAGES],
    [
      'filters.attentionValues',
      ['screening_incomplete', 'checks_open', 'checks_overdue', 'stalled'],
    ],
    ['settings.dpiaReasons', ['special_checks', 'ai_assist', 'profiling']],
    ['tasks', ['onboarding', 'scorecard', 'approval']],
  ];

  it.each(groups)('translates every %s value in en and nb', (group, values) => {
    for (const value of values) {
      expect(typeof get(recruitmentEn, `${group}.${value}`), `en ${group}.${value}`).toBe('string');
      expect(typeof get(recruitmentNb, `${group}.${value}`), `nb ${group}.${value}`).toBe('string');
    }
  });

  it('has the next-action keys the backend declares', () => {
    for (const name of ['approvals', 'checksOverdue', 'screening', 'erasureDue']) {
      for (const part of ['title', 'why']) {
        expect(typeof get(recruitmentEn, `next.${name}.${part}`)).toBe('string');
        expect(typeof get(recruitmentNb, `next.${name}.${part}`)).toBe('string');
      }
    }
  });

  it('labels the link settings and the create-from-here flows', () => {
    for (const kind of ['processing_record', 'dpia', 'ai_system']) {
      for (const part of ['title', 'why', 'create', 'created']) {
        expect(typeof get(recruitmentNb, `settings.links.${kind}.${part}`)).toBe('string');
      }
    }
    for (const field of [
      'screening_criteria',
      'approval',
      'privacy_notice',
      'screening',
      'checks',
      'offer',
    ]) {
      expect(typeof get(standardsEn, `reqs.fields.${field}`), field).toBe('string');
      expect(typeof get(standardsNb, `reqs.fields.${field}`), field).toBe('string');
    }
    for (const key of [
      'job_application.to_deviation',
      'job_application.to_risk',
      'job_application.to_task',
      'job_requisition.to_deviation',
      'job_requisition.to_risk',
      'job_requisition.to_task',
      'candidate.to_data_subject_request',
    ]) {
      expect(typeof get(kitEn, `flows.${key}`), key).toBe('string');
      expect(typeof get(kitNb, `flows.${key}`), key).toBe('string');
    }
  });

  it('uses the agreed Norwegian words', () => {
    expect(get(recruitmentNb, 'filters.everyone')).toBe('Alle');
    expect(get(recruitmentNb, 'requisition.actions.cancel')).toBe('Stopp rekrutteringen');
    expect(get(recruitmentNb, 'privacy.noConsent')).toBe('Har ikke samtykket');
    expect(get(recruitmentNb, 'checkType.credit')).toBe('Kredittsjekk');
    expect(get(recruitmentNb, 'pipeline.emptyColumn')).toBe('Ingen kandidater på dette trinnet');
    expect(JSON.stringify(recruitmentNb)).not.toMatch(/Minikurs|Alles/);
  });

  it('documents requirements on the key form fields and has the overview page', () => {
    for (const path of [
      'pages.requisitionForm.fields.role_risk.requirements',
      'pages.requisitionForm.fields.screening_criteria.requirements',
      'pages.application.fields.checks.requirements',
      'pages.settings.fields.retention_days.requirements',
    ]) {
      expect((get(guidanceEn, path) as unknown[]).length, path).toBeGreaterThan(0);
    }
    expect(get(guidanceEn, 'pages.overview.intro.title')).toBeTruthy();
    expect((get(guidanceEn, 'tours.overview') as unknown[]).length).toBeGreaterThan(0);
  });
});

@Component({
  imports: [StageMove],
  template: `<app-stage-move
    applicationId="a1"
    [stage]="stage()"
    name="CAN-0001"
    (moved)="moved.set($event)"
  />`,
})
class MoveHost {
  readonly stage = signal<Stage>('screening');
  readonly moved = signal<ApplicationDetail | null>(null);
}

describe('StageMove screening override', () => {
  it('asks for a reason when screening is not finished and retries with it', async () => {
    TestBed.configureTestingModule({
      imports: [
        MoveHost,
        TranslocoTestingModule.forRoot({
          langs: { en: { ...en, recruitment: recruitmentEn } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({
              id: ORG,
              name: 'Org',
              roles: [],
              permissions: ['recruitment:read', 'recruitment:write'],
            }).asReadonly(),
          },
        },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MoveHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector<HTMLSelectElement>('[data-testid="move-a1"]')!;
    select.value = 'interview';
    select.dispatchEvent(new Event('change'));
    const url = `${BASE}/v1/orgs/${ORG}/recruitment/applications/a1/move`;
    http
      .expectOne(url)
      .flush(
        { detail: { code: 'screening_incomplete', missing: ['c1', 'c2'] } },
        { status: 409, statusText: 'Conflict' },
      );
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.textContent).toContain('Move on before screening is finished?');
    const textarea = el.querySelector<HTMLTextAreaElement>(
      '[role="dialog"] textarea, [role="alertdialog"] textarea, textarea',
    )!;
    textarea.value = 'Internal candidate, criteria assessed in the last appraisal';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const confirm = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Move on with this reason',
    )!;
    confirm.click();
    const retry = http.expectOne(url);
    expect(retry.request.body).toEqual({
      stage: 'interview',
      rejection_reason: null,
      note: null,
      override_reason: 'Internal candidate, criteria assessed in the last appraisal',
    });
    retry.flush({ id: 'a1', stage: 'interview' });
    await tick();
    expect(fixture.componentInstance.moved()?.stage).toBe('interview');
    http.verify();
  });
});
