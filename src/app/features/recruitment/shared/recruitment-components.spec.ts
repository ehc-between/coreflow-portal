import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../assets/i18n/en.json';
import recruitmentEn from '../../../../assets/i18n/recruitment/en.json';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ApplicationDetail, Stage } from '../data/recruitment.models';
import { CriteriaEditor, CriterionDraft } from './criteria-editor';
import { StageMove } from './stage-move';

const BASE = 'http://test/api';
const ORG = 'org-1';

const tick = () => new Promise((resolve) => setTimeout(resolve));

function configure(component: unknown) {
  TestBed.configureTestingModule({
    imports: [
      component as never,
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
}

@Component({
  imports: [CriteriaEditor],
  template: `<app-criteria-editor [(criteria)]="criteria" />`,
})
class CriteriaHost {
  readonly criteria = signal<readonly CriterionDraft[]>([
    { id: 'c1', label: 'Linux', description: '' },
  ]);
}

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

describe('CriteriaEditor', () => {
  it('adds, edits and removes criteria through the two-way binding', async () => {
    configure(CriteriaHost);
    const fixture = TestBed.createComponent(CriteriaHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-testid="criteria-add"]')!.click();
    fixture.detectChanges();
    const inputs = el.querySelectorAll<HTMLInputElement>('input');
    expect(inputs.length).toBe(4);
    inputs[2].value = 'ISO 27001';
    inputs[2].dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.criteria()[1].label).toBe('ISO 27001');

    el.querySelector<HTMLButtonElement>('button[aria-label^="Remove criterion"]')!.click();
    expect(fixture.componentInstance.criteria().map((c) => c.label)).toEqual(['ISO 27001']);
  });
});

describe('StageMove', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('moves straight to a normal stage', async () => {
    configure(MoveHost);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MoveHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '[data-testid="move-a1"]',
    )!;
    const options = [...select.options].map((o) => o.value);
    expect(options).not.toContain('screening');
    expect(options).toContain('interview');

    select.value = 'interview';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/recruitment/applications/a1/move`);
    expect(req.request.body).toEqual({ stage: 'interview', rejection_reason: null, note: null });
    req.flush({ id: 'a1', stage: 'interview' });
    await tick();
    expect(fixture.componentInstance.moved()?.stage).toBe('interview');
  });

  it('asks for a reason before rejecting', async () => {
    configure(MoveHost);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MoveHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector<HTMLSelectElement>('[data-testid="move-a1"]')!;
    select.value = 'rejected';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    http.expectNone(() => true);

    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Reject the application');
    const buttons = () => [...dialog.querySelectorAll('button')];
    const confirm = buttons().find((b) => b.textContent?.trim() === 'Reject')!;
    expect(confirm.disabled).toBe(true);

    const reason = dialog.querySelector<HTMLSelectElement>('select')!;
    reason.value = 'criteria_not_met';
    reason.dispatchEvent(new Event('change'));
    const note = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    note.value = ' Lacks the certification ';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    confirm.click();

    const req = http.expectOne(`${BASE}/v1/orgs/${ORG}/recruitment/applications/a1/move`);
    expect(req.request.body).toEqual({
      stage: 'rejected',
      rejection_reason: 'criteria_not_met',
      note: 'Lacks the certification',
    });
    req.flush({ id: 'a1', stage: 'rejected' });
  });
});
