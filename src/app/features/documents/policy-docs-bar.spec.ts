import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { APP_CONFIG } from '../../core/config/app-config';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { PolicyDocsBar } from './policy-docs-bar';

const BASE = 'http://test/api';
const ORG = 'org-1';

async function setup(type: string, permissions: string[]) {
  TestBed.configureTestingModule({
    imports: [PolicyDocsBar, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } },
      { provide: ModuleService, useValue: { isEnabled: () => true } },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal(ORG).asReadonly(),
          currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PolicyDocsBar);
  fixture.componentRef.setInput('type', type);
  await fixture.whenStable();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

describe('PolicyDocsBar (U16)', () => {
  it('offers "Lag utkast" for every policy type without an approved policy', async () => {
    const { fixture, http } = await setup('policy', ['context:read', 'context:write']);
    http
      .expectOne(`${BASE}/v1/orgs/${ORG}/context/overview`)
      .flush({ policy_kinds_missing: ['information_security', 'privacy'] });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="new-policy"]')).not.toBeNull();
    const draft = el.querySelector('[data-testid="draft-privacy"]');
    expect(draft?.getAttribute('href')).toBe('/context/policies/new?kind=privacy');
    expect(el.querySelector('[data-testid="draft-information_security"]')).not.toBeNull();
  });

  it('shows only the chip for read-only users and other types', async () => {
    const { fixture, http } = await setup('scope', ['context:read']);
    http.expectNone(`${BASE}/v1/orgs/${ORG}/context/overview`);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="type-chip"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="policy-gaps"]')).toBeNull();
    expect(el.querySelector('[data-testid="new-policy"]')).toBeNull();
  });

  it('emits clear from the chip', async () => {
    const { fixture, http } = await setup('scope', []);
    http.verify();
    let cleared = false;
    fixture.componentInstance.clear.subscribe(() => (cleared = true));
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="type-chip-clear"]')!
      .click();
    expect(cleared).toBe(true);
  });
});
