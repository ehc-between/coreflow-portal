import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { AiSystemSummary } from '../data/ai-governance.models';
import { AiSystemsList } from './systems-list';

const SYSTEM: AiSystemSummary = {
  id: 's-1',
  code: 'AIS-001',
  name: 'Support assistant',
  ai_act_role: 'deployer',
  status: 'in_use',
  risk_class: 'limited',
  gpai: true,
  provider_name: 'Vendor',
  owner: { id: 'u-1', name: 'Ada' },
  department_id: null,
  classified_at: null,
  next_review_at: null,
  is_builtin: true,
  url: '/ai-governance/systems/s-1',
  created_at: '2026-11-01T10:00:00',
  updated_at: '2026-11-01T10:00:00',
};

async function setup(
  items: AiSystemSummary[],
  permissions = ['ai_governance:read', 'ai_governance:write'],
) {
  const api = {
    listSystems: vi.fn(() => of({ items, total: items.length })),
    registerPlatformFeatures: vi.fn(() => of({ created: 3, items: [] })),
  };
  const toasts = { success: vi.fn(), error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [AiSystemsList, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      ...provideFakeGuidance().providers,
      { provide: AiGovernanceApi, useValue: api },
      { provide: NotificationService, useValue: toasts },
      { provide: AskPanelService, useValue: { askAbout: vi.fn(), showWith: vi.fn() } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({ id: 'org-1', name: 'Acme', roles: [], permissions }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AiSystemsList);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, toasts };
}

describe('AiSystemsList', () => {
  it('lists the inventory with risk class and status', async () => {
    const { el, api } = await setup([SYSTEM]);
    expect(api.listSystems).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ sort: 'name', limit: 25, offset: 0 }),
    );
    const table = el.querySelector('[data-testid="systems-table"]')!;
    expect(table.textContent).toContain('AIS-001');
    expect(table.textContent).toContain('Support assistant');
    expect(table.textContent).toContain('aiGovernance.risk.limited');
    expect(table.textContent).toContain('aiGovernance.status.in_use');
    expect(table.textContent).toContain('aiGovernance.systems.builtin');
  });

  it('registers the platform features from the toolbar and reloads', async () => {
    const { el, api, toasts, fixture } = await setup([]);
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('aiGovernance.systems.registerPlatform'),
    )!;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.registerPlatformFeatures).toHaveBeenCalledWith('org-1', expect.any(String));
    expect(toasts.success).toHaveBeenCalledWith('aiGovernance.systems.registered', { count: 3 });
    expect(api.listSystems).toHaveBeenCalledTimes(2);
  });

  it('hides write actions without ai_governance:write', async () => {
    const { el } = await setup([SYSTEM], ['ai_governance:read']);
    expect(el.querySelector('[data-testid="system-new"]')).toBeNull();
  });
});
