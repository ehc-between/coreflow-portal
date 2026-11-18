import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import trainingEn from '../../../../assets/i18n/training/en.json';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TrainingApi } from '../data/training-api';
import { Rule, RulePreview } from '../data/training.models';
import { TrainingPeople } from '../shared/people';
import { CourseRules } from './course-rules';

const PREVIEW: RulePreview = {
  targeted: 12,
  will_assign: 9,
  already_assigned: 2,
  already_compliant: 1,
  sample: [
    { id: 'u1', name: 'Kari Nordmann', email: 'kari@x.no' },
    { id: 'u2', name: 'Lars Olsen', email: 'lars@x.no' },
  ],
  duplicate_rule_id: null,
  course_published: true,
};

const RULE: Rule = {
  id: 'r1',
  course_id: 'c1',
  target_type: 'department',
  target_value: 'd1',
  target_label: 'Drift',
  due_days: 30,
  recurrence_months: 12,
  active: true,
  open_assignments: 9,
  created_by: null,
  created_at: '2026-11-17T10:00:00',
};

async function render(fixture: ComponentFixture<CourseRules>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function setup(preview: RulePreview = PREVIEW, createError?: unknown) {
  const api = {
    listRules: vi.fn(() => of({ items: [] as Rule[] })),
    positions: vi.fn(() => of({ items: [{ id: 'p1', title: 'Lagermedarbeider', code: null }] })),
    previewRule: vi.fn(() => of(preview)),
    createRule: vi.fn(() =>
      createError ? throwError(() => createError) : of({ ...RULE, assignments_created: 9 }),
    ),
    undoRule: vi.fn(() => of({ cancelled: 7, kept: 2 })),
    updateRule: vi.fn(),
    sync: vi.fn(),
  };
  const notifications = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [
      CourseRules,
      TranslocoTestingModule.forRoot({
        langs: { en: { training: trainingEn }, 'guidance/en': {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      ...provideFakeGuidance({}, 'standard').providers,
      { provide: TrainingApi, useValue: api },
      { provide: NotificationService, useValue: notifications },
      {
        provide: TrainingPeople,
        useValue: {
          people: signal([{ id: 'u1', name: 'Kari Nordmann' }]),
          departments: signal([{ id: 'd1', name: 'Drift' }]),
          ensureLoaded: vi.fn(),
        },
      },
      {
        provide: LanguageService,
        useValue: {
          translate: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${JSON.stringify(params)}` : key,
          locale: () => 'en',
          active: () => 'en',
        },
      },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1'),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions: [] }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CourseRules);
  fixture.componentRef.setInput('courseId', 'c1');
  fixture.componentRef.setInput('canManage', true);
  return { fixture, api, notifications };
}

const q = <T extends HTMLElement>(el: HTMLElement, sel: string) => el.querySelector<T>(sel);
const button = (el: HTMLElement, testId: string) =>
  q<HTMLButtonElement>(el, `[data-testid="${testId}"] button`);

function choose(el: HTMLElement, id: string, value: string) {
  const select = q<HTMLSelectElement>(el, `#${id}`)!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('CourseRules', () => {
  it('keeps the form closed and starts with no target, so one click cannot assign everyone', async () => {
    const { fixture, api } = setup();
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(q(el, '[data-testid="rule-form"]')).toBeNull();

    button(el, 'rule-open')!.click();
    await render(fixture);
    expect(q<HTMLSelectElement>(el, '#rule-target')!.value).toBe('');
    expect(button(el, 'rule-add')!.disabled).toBe(true);
    expect(api.createRule).not.toHaveBeenCalled();
  });

  it('shows who a rule assigns before saving it, then saves on confirm', async () => {
    const { fixture, api, notifications } = setup();
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    button(el, 'rule-open')!.click();
    await render(fixture);
    choose(el, 'rule-target', 'position');
    await render(fixture);
    choose(el, 'rule-value', 'p1');
    await render(fixture);

    button(el, 'rule-add')!.click();
    await render(fixture);
    expect(api.previewRule).toHaveBeenCalledWith('org-1', 'c1', {
      target_type: 'position',
      target_value: 'p1',
      due_days: 30,
      recurrence_months: null,
    });
    expect(api.createRule).not.toHaveBeenCalled();
    const preview = q(el, '[data-testid="rule-preview"]')!.textContent ?? '';
    expect(preview).toContain('This assigns the course to 9 people.');
    expect(preview).toContain('Kari Nordmann');

    button(el, 'rule-confirm')!.click();
    await render(fixture);
    expect(api.createRule).toHaveBeenCalledTimes(1);
    expect(notifications.success).toHaveBeenCalledWith('training.rules.added', { count: 9 });
    expect(q(el, '[data-testid="rule-form"]')).toBeNull();
  });

  it('refuses to save a duplicate rule', async () => {
    const { fixture, api } = setup({ ...PREVIEW, duplicate_rule_id: 'r0' });
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    button(el, 'rule-open')!.click();
    await render(fixture);
    choose(el, 'rule-target', 'all');
    await render(fixture);
    button(el, 'rule-add')!.click();
    await render(fixture);
    expect(q(el, '[data-testid="rule-preview"]')!.textContent).toContain(
      'An identical rule already exists',
    );
    expect(q(el, '[data-testid="rule-confirm"]')).toBeNull();
    expect(api.createRule).not.toHaveBeenCalled();
  });

  it('turns a 409 duplicate_rule from the server into the duplicate message', async () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: { detail: { code: 'duplicate_rule', rule_id: 'r0' } },
    });
    const { fixture } = setup(PREVIEW, conflict);
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;
    button(el, 'rule-open')!.click();
    await render(fixture);
    choose(el, 'rule-target', 'new_hire');
    await render(fixture);
    button(el, 'rule-add')!.click();
    await render(fixture);
    button(el, 'rule-confirm')!.click();
    await render(fixture);
    expect(el.textContent).toContain('An identical rule already exists');
    expect(q(el, '[data-testid="rule-confirm"]')).toBeNull();
  });
});
