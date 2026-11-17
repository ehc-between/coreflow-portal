import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { RequirementDetail } from '../../core/standards/standards.models';
import { RequirementCard } from './requirement-card';

const ORG = 'org-1';
const REF = 'eu-ai-act-2024:16.r1';
const tick = () => new Promise((resolve) => setTimeout(resolve));

/** A provider-only AI Act point the derivation marks not applicable for a deployer org. */
const DERIVED_NA: RequirementDetail = {
  ref: REF,
  text: { en: 'Provider obligations', nb: 'Tilbyderens plikter' },
  evidence_examples: null,
  status: 'not_applicable',
  applicable: false,
  applicability_source: 'derived',
  derived_applicable: false,
  derived_reason: {
    en: 'Applies to providers; your AI systems are deployed.',
    nb: 'Gjelder tilbydere; KI-systemene deres er tatt i bruk.',
  },
  meta: { roles: ['provider'], risk_classes: ['high'] },
  justification: null,
  confirmed_links: [],
  suggested_links: [],
  status_override: null,
  note: null,
  links: [],
};

/** The same point after the org marked it applicable itself. */
const OVERRIDDEN: RequirementDetail = {
  ...DERIVED_NA,
  status: 'not_started',
  applicable: true,
  applicability_source: 'manual',
};

describe('RequirementCard applicability', () => {
  let fixture: ComponentFixture<RequirementCard>;
  let el: HTMLElement;
  let update: ReturnType<typeof vi.spyOn>;
  let emitted: RequirementDetail[];

  async function render(): Promise<void> {
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function setup(req: RequirementDetail, canManage: boolean, reply = OVERRIDDEN) {
    TestBed.configureTestingModule({
      imports: [RequirementCard, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: 'http://test/api', i18n: { availableLanguages: ['en', 'nb'] } },
        },
        { provide: AuthService, useValue: { accessToken: signal(null).asReadonly() } },
        {
          provide: SelectedOrgService,
          useValue: {
            currentOrgId: signal(ORG).asReadonly(),
            currentOrg: signal({ id: ORG, name: 'Org', roles: [], permissions: [] }).asReadonly(),
          },
        },
      ],
    });
    update = vi.spyOn(TestBed.inject(StandardsApi), 'updateRequirement').mockReturnValue(of(reply));
    fixture = TestBed.createComponent(RequirementCard);
    fixture.componentRef.setInput('requirement', req);
    fixture.componentRef.setInput('canManage', canManage);
    emitted = [];
    fixture.componentInstance.updated.subscribe((r) => emitted.push(r));
    el = fixture.nativeElement as HTMLElement;
    await render();
  }

  const button = (id: string) =>
    el.querySelector<HTMLButtonElement>(`[data-testid="${id}"] button`);

  it('explains a derived not-applicable point and lets a manager mark it applicable', async () => {
    await setup(DERIVED_NA, true);
    const box = el.querySelector('[data-testid="derived-not-applicable"]');
    expect(box?.textContent).toContain('standards.requirement.derivedTitle');
    expect(box?.textContent).toContain('Applies to providers; your AI systems are deployed.');

    button('mark-applicable')!.click();
    await render();
    expect(update).toHaveBeenCalledWith(ORG, REF, { applicable: true });
    expect(emitted).toEqual([OVERRIDDEN]);
  });

  it('shows the explanation but no override to readers', async () => {
    await setup(DERIVED_NA, false);
    expect(el.querySelector('[data-testid="derived-not-applicable"]')).not.toBeNull();
    expect(button('mark-applicable')).toBeNull();
  });

  it('resets an override back to the derived value with applicable: null', async () => {
    await setup(OVERRIDDEN, true, DERIVED_NA);
    const box = el.querySelector('[data-testid="applicability-overridden"]');
    expect(box?.textContent).toContain('standards.requirement.overriddenNotApplies');

    button('reset-applicability')!.click();
    await render();
    expect(update).toHaveBeenCalledWith(ORG, REF, { applicable: null });
    expect(emitted).toEqual([DERIVED_NA]);
  });

  it('does not turn a derived value into a decision when only the note changes', async () => {
    await setup(DERIVED_NA, true, DERIVED_NA);
    const card = fixture.componentInstance as unknown as {
      startEdit(): void;
      save(): void;
      formNote: { set(v: string): void };
      justificationMissing(): boolean;
    };
    card.startEdit();
    card.formNote.set('Checked with legal');
    card.save();
    expect(card.justificationMissing()).toBe(false);
    expect(update).toHaveBeenCalledWith(ORG, REF, {
      status_override: null,
      note: 'Checked with legal',
    });
  });

  it('does not send applicable on a default point when only the status changes', async () => {
    const plain: RequirementDetail = {
      ...DERIVED_NA,
      ref: 'iso9001-2026:5.2.r1',
      status: 'not_started',
      applicable: true,
      applicability_source: 'default',
      derived_applicable: null,
      derived_reason: null,
      meta: null,
    };
    await setup(plain, true, plain);
    expect(el.querySelector('[data-testid="applicability-overridden"]')).toBeNull();
    const card = fixture.componentInstance as unknown as {
      startEdit(): void;
      save(): void;
      formOverride: { set(v: string): void };
    };
    card.startEdit();
    card.formOverride.set('covered');
    card.save();
    expect(update).toHaveBeenCalledWith(ORG, plain.ref, { status_override: 'covered', note: null });
  });

  it('still requires a justification when the org marks a point not applicable', async () => {
    await setup(OVERRIDDEN, true);
    const card = fixture.componentInstance as unknown as {
      startEdit(): void;
      save(): void;
      formApplicable: { set(v: boolean): void };
      formJustification: { set(v: string): void };
      justificationMissing(): boolean;
    };
    card.startEdit();
    card.formApplicable.set(false);
    card.save();
    expect(card.justificationMissing()).toBe(true);
    expect(update).not.toHaveBeenCalled();

    card.formJustification.set('We only deploy');
    card.save();
    expect(update).toHaveBeenCalledWith(ORG, REF, {
      applicable: false,
      justification: 'We only deploy',
      status_override: null,
      note: null,
    });
  });
});
