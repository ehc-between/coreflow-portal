import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { Obligation } from '../data/ai-governance.models';
import { AiObligationList } from './obligation-list';

const LITERACY: Obligation = {
  key: 'ai_literacy',
  ref: 'eu_ai_act:4',
  clause_ref: 'eu_ai_act:4',
  article: 'Art. 4',
  article_detail: null,
  title: 'Ensure AI literacy',
  status: 'not_started',
  status_source: 'default',
};
const OVERSIGHT: Obligation = {
  key: 'human_oversight',
  ref: 'eu_ai_act:26',
  clause_ref: 'eu_ai_act:26',
  article: 'Art. 26(2)',
  article_detail: 'Art. 26(2)',
  title: 'Assign human oversight',
  task_id: 't-1',
  task_status: 'in_progress',
  status: 'in_progress',
  status_source: 'task',
};

async function setup(obligations: Obligation[], editable = true) {
  const api = {
    updateObligation: vi.fn(() => of([{ ...LITERACY, status: 'not_relevant' }])),
    createObligationTask: vi.fn(() => of([{ ...LITERACY, task_id: 't-2' }])),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AiObligationList, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...provideFakeGuidance().providers,
      { provide: AiGovernanceApi, useValue: api },
      { provide: KitApi, useValue: { search: vi.fn(() => of({ items: [] })) } },
      { provide: NotificationService, useValue: toasts },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org-1').asReadonly() },
      },
    ],
  });
  const fixture = TestBed.createComponent(AiObligationList);
  fixture.componentRef.setInput('obligations', obligations);
  if (editable) {
    fixture.componentRef.setInput('systemId', 's-1');
    fixture.componentRef.setInput('canWrite', true);
  }
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, toasts, changed };
}

describe('AiObligationList', () => {
  it('shows status, the task link and the article only when it is more specific', async () => {
    const { el } = await setup([LITERACY, OVERSIGHT]);
    const literacy = el.querySelector('[data-testid="obligation-ai_literacy"]')!;
    expect(literacy.textContent).toContain('aiGovernance.obligationStatus.not_started');
    expect(literacy.querySelector('[data-testid="obligation-task-ai_literacy"]')).not.toBeNull();
    const oversight = el.querySelector('[data-testid="obligation-human_oversight"]')!;
    expect(oversight.textContent).toContain('Art. 26(2)');
    expect(oversight.querySelector('a[href="/tasks/t-1"]')).not.toBeNull();
  });

  it('creates a task for an obligation and emits the refreshed list', async () => {
    const { el, fixture, api, changed } = await setup([LITERACY]);
    (
      el.querySelector('[data-testid="obligation-task-ai_literacy"] button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(api.createObligationTask).toHaveBeenCalledWith('org-1', 's-1', 'ai_literacy');
    expect(changed).toHaveBeenCalledWith([expect.objectContaining({ task_id: 't-2' })]);
  });

  it('asks for a reason before marking an obligation not relevant', async () => {
    const { el, fixture, api, changed } = await setup([LITERACY]);
    (
      el.querySelector('[data-testid="obligation-edit-ai_literacy"] button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const editor = el.querySelector('[data-testid="obligation-editor"]')!;
    const radios = editor.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    // auto, not_started, in_progress, met, not_relevant
    radios[4].click();
    radios[4].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    editor.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.updateObligation).not.toHaveBeenCalled();
    expect(el.textContent).toContain('aiGovernance.errors.reason_required');

    const reason = el.querySelector(
      '[data-testid="obligation-editor"] textarea',
    ) as HTMLTextAreaElement;
    reason.value = 'Nobody uses it';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="obligation-editor"]') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();
    expect(api.updateObligation).toHaveBeenCalledWith('org-1', 's-1', 'ai_literacy', {
      status: 'not_relevant',
      reason: 'Nobody uses it',
      evidence: null,
    });
    expect(changed).toHaveBeenCalled();
  });

  it('is read-only for previews', async () => {
    const { el } = await setup([LITERACY], false);
    expect(el.querySelector('[data-testid="obligation-task-ai_literacy"]')).toBeNull();
    expect(el.querySelector('[data-testid="obligation-edit-ai_literacy"]')).toBeNull();
  });
});
