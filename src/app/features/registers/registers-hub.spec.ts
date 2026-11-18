import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule, provideTranslocoScope } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import shellEn from '../../../assets/i18n/shell/en.json';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { RegistersHub } from './registers-hub';

async function render(
  opts: { pins?: string[] | null; permissions?: string[]; loaded?: boolean } = {},
) {
  const pins = signal<readonly string[] | null>(opts.pins ?? null);
  const prefs = {
    pins: pins.asReadonly(),
    loaded: signal(opts.loaded ?? true).asReadonly(),
    saving: signal(false).asReadonly(),
    setPins: vi.fn((next: readonly string[] | null) => pins.set(next)),
  };
  TestBed.configureTestingModule({
    imports: [
      RegistersHub,
      TranslocoTestingModule.forRoot({
        langs: { en, 'shell/en': shellEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideTranslocoScope('shell'),
      { provide: ModuleService, useValue: { isEnabled: (m: string) => m !== 'hse' } },
      { provide: ShellPreferencesService, useValue: prefs },
      {
        provide: SelectedOrgService,
        useValue: {
          currentOrgId: signal('org-1').asReadonly(),
          currentOrg: signal({
            id: 'org-1',
            name: 'Org',
            roles: ['dpo'],
            permissions: opts.permissions ?? [
              'risk:read',
              'assets:read',
              'privacy:read',
              'hse:read',
              'documents:read',
            ],
          }).asReadonly(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(RegistersHub);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, prefs };
}

describe('RegistersHub', () => {
  it('lists only the enabled registers the user may read, grouped by area', async () => {
    const { el } = await render();
    expect(el.querySelector('[data-testid="register-risk"]')?.getAttribute('href')).toBe('/risk');
    expect(el.querySelector('[data-testid="register-assets"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="register-privacy"]')).not.toBeNull();
    // Module off (hse) or no read permission (people): not listed.
    expect(el.querySelector('[data-testid="register-hse"]')).toBeNull();
    expect(el.querySelector('[data-testid="register-people"]')).toBeNull();
    expect(el.querySelector('[data-testid="register-group-people"]')).toBeNull();
    // Documents stand in for the library until /library exists.
    expect(el.querySelector('[data-testid="register-group-library"]')).not.toBeNull();
  });

  it('filters by name and description', async () => {
    const { el, fixture } = await render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="register-filter"]')!;
    input.value = 'calibration';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="register-assets"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="register-risk"]')).toBeNull();

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('No registers match');
  });

  it('shows the role default pins and saves changes as the user own list', async () => {
    const { el, fixture, prefs } = await render();
    // dpo defaults: record of processing + breaches.
    expect(el.querySelector('[data-testid="registers-pinned"]')?.textContent).toContain(
      'Record of processing',
    );
    el.querySelector<HTMLButtonElement>('[data-testid="pin-risk"]')!.click();
    fixture.detectChanges();
    expect(prefs.setPins).toHaveBeenLastCalledWith(['privacy/ropa', 'privacy/breaches', 'risk']);
    expect(el.querySelector('[data-testid="pin-risk"]')!.getAttribute('aria-pressed')).toBe('true');

    el.querySelector<HTMLButtonElement>('[data-testid="unpin-privacy/ropa"]')!.click();
    expect(prefs.setPins).toHaveBeenLastCalledWith(['privacy/breaches', 'risk']);
  });

  it('stops at five pins', async () => {
    const { el } = await render({ pins: ['risk', 'audits', 'deviations', 'people', 'training'] });
    expect(el.querySelector<HTMLButtonElement>('[data-testid="pin-assets"]')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[data-testid="pin-risk"]')!.disabled).toBe(false);
  });

  it('waits for the preferences before pins can change', async () => {
    const { el } = await render({ loaded: false });
    expect(el.querySelector<HTMLButtonElement>('[data-testid="pin-risk"]')!.disabled).toBe(true);
  });
});
