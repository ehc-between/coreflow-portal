import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { RootCauseAnalysis } from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RootCausePanel } from './root-cause-panel';

const SAVED: RootCauseAnalysis = {
  id: 'r1',
  deviation_id: 'd1',
  method: 'five_whys',
  problem: 'Wrong label',
  whys: [{ question: 'deviations.rootCauses.whyPrompt', answer: 'Old template' }],
  categories: {},
  conclusion: 'Old template',
  applied_at: null,
  source: 'manual',
  created_by: 'u1',
  created_by_name: 'Ada',
  created_at: '2026-11-12T08:00:00',
  updated_at: '2026-11-12T08:00:00',
};

async function setup(items: RootCauseAnalysis[] = []) {
  const api = {
    listRootCauses: vi.fn(() => of({ items })),
    createRootCause: vi.fn(() => of(SAVED)),
    applyRootCause: vi.fn(() => of({ ...SAVED, applied_at: '2026-11-12T09:00:00' })),
  };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({
    imports: [RootCausePanel, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
      { provide: DeviationsApi, useValue: api },
      { provide: NotificationService, useValue: notify },
      { provide: AuthService, useValue: { user: signal(null), isAuthenticated: signal(false) } },
      {
        provide: SelectedOrgService,
        useValue: { currentOrgId: signal('org1'), currentOrg: signal(null) },
      },
    ],
  });
  const fixture = TestBed.createComponent(RootCausePanel);
  fixture.componentRef.setInput('deviationId', 'd1');
  fixture.componentRef.setInput('canEdit', true);
  fixture.componentRef.setInput('problem', 'Wrong label');
  const applied = vi.fn();
  fixture.componentInstance.applied.subscribe(applied);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement, api, applied };
}

const buttonWith = (root: HTMLElement, text: string) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes(text),
  )!;

describe('RootCausePanel', () => {
  it('starts a 5 Whys worksheet from the deviation description and saves it', async () => {
    const { fixture, root, api } = await setup();
    buttonWith(root, 'deviations.rootCauses.newFiveWhys').click();
    await fixture.whenStable();
    const editor = root.querySelector<HTMLFormElement>('[data-testid="root-cause-editor"]')!;
    expect(editor.querySelectorAll('ol li')).toHaveLength(5);
    const firstAnswer = editor.querySelectorAll<HTMLInputElement>('ol li input')[1];
    firstAnswer.value = 'Old template';
    firstAnswer.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    editor.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    const body = (api.createRootCause.mock.calls[0] as unknown[])[2] as {
      method: string;
      problem: string;
      whys: unknown[];
    };
    expect(body.method).toBe('five_whys');
    expect(body.problem).toBe('Wrong label');
    expect(body.whys).toHaveLength(5);
    expect(root.querySelector('[data-analysis="r1"]')).toBeTruthy();
  });

  it('applies a saved conclusion and asks the host to refresh', async () => {
    const { fixture, root, api, applied } = await setup([SAVED]);
    buttonWith(root, 'deviations.rootCauses.apply').click();
    await fixture.whenStable();
    expect(api.applyRootCause).toHaveBeenCalledWith('org1', 'd1', 'r1');
    expect(applied).toHaveBeenCalled();
    expect(root.textContent).toContain('deviations.rootCauses.applied');
  });
});
