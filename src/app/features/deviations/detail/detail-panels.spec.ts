import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ReportingObligation } from '../../../core/deviations/deviation.models';
import { filtersFromParams, stateFilter, toDeviationFilters } from '../deviations-list';
import { DeviationClosureChecklist } from './closure-checklist';
import { DeviationReporting, ReportingSave } from './reporting-panel';

const OBLIGATION: ReportingObligation = {
  key: 'gdpr_33',
  framework: 'gdpr',
  authority: 'datatilsynet',
  article: 'gdpr:33',
  hours: 72,
  immediately: false,
  clock_started_at: '2026-01-01T08:00:00',
  clock_source: 'detected_at',
  deadline_at: '2026-01-04T08:00:00',
  status: 'overdue',
  task_id: 't1',
};

function configure() {
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
}

describe('DeviationReporting', () => {
  it('shows the obligation, its deadline and records a notification', async () => {
    configure();
    const fixture = TestBed.createComponent(DeviationReporting);
    fixture.componentRef.setInput('obligations', [OBLIGATION]);
    fixture.componentRef.setInput('canEdit', true);
    const saved: ReportingSave[] = [];
    fixture.componentInstance.save.subscribe((s) => saved.push(s));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('deviations.reporting.obligation.gdpr_33');
    expect(root.querySelector('[data-testid="reporting-deadline"]')?.textContent).toContain(
      'deviations.reporting.lateBy',
    );
    const record = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('deviations.reporting.recordNotified'),
    )!;
    record.click();
    await fixture.whenStable();
    const save = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('deviations.reporting.save'),
    )!;
    save.click();
    expect(saved.length).toBe(1);
    expect(saved[0].key).toBe('gdpr_33');
    expect(saved[0].update.notified_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('asks for a reason before marking it as not required', async () => {
    configure();
    const fixture = TestBed.createComponent(DeviationReporting);
    fixture.componentRef.setInput('obligations', [{ ...OBLIGATION, status: 'pending' }]);
    fixture.componentRef.setInput('canEdit', true);
    const saved: ReportingSave[] = [];
    fixture.componentInstance.save.subscribe((s) => saved.push(s));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    Array.from(root.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('deviations.reporting.recordNotRequired'))!
      .click();
    await fixture.whenStable();
    const save = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('deviations.reporting.save'),
    )!;
    expect(save.disabled).toBe(true);
    const reason = root.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Encrypted laptop';
    reason.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    save.click();
    expect(saved[0].update).toEqual({
      not_required_reason: 'Encrypted laptop',
      notified_at: null,
      reference: null,
    });
  });
});

describe('DeviationClosureChecklist', () => {
  it('counts done items and marks the recommended ones', async () => {
    configure();
    const fixture = TestBed.createComponent(DeviationClosureChecklist);
    fixture.componentRef.setInput('items', [
      { key: 'root_cause', done: true, required: true },
      { key: 'actions_done', done: false, required: true },
      { key: 'requirements_linked', done: false, required: false },
    ]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-check]').length).toBe(3);
    expect(root.textContent).toContain('deviations.checklist.intro');
    expect(root.querySelector('[data-check="requirements_linked"]')?.textContent).toContain(
      'deviations.checklist.recommended',
    );
  });
});

describe('deviations list filters', () => {
  it('splits the one status filter into list params', () => {
    expect(stateFilter('scope:overdue')).toEqual({ overdue: true });
    expect(stateFilter('scope:active')).toEqual({ active: true });
    expect(stateFilter('cat:done')).toEqual({ category: 'done' });
    expect(stateFilter('investigating')).toEqual({ status: 'investigating' });
    expect(stateFilter('')).toEqual({});
  });

  it('reads drill-down links into filters', () => {
    const params = new URLSearchParams('overdue=true&type_id=t1&clause=10.2');
    expect(filtersFromParams(params)).toEqual({
      state: 'scope:overdue',
      type_id: 't1',
      clause: '10.2',
    });
    expect(toDeviationFilters(' leak ', { state: 'cat:open', severity: 'high' })).toEqual(
      expect.objectContaining({
        q: 'leak',
        category: 'open',
        severity: 'high',
        sort: '-raised_at',
      }),
    );
  });
});
