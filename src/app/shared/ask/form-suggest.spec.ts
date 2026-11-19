import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import askEn from '../../../assets/i18n/ask/en.json';
import { AiAvailability } from '../../core/ai/ai-availability';
import { FormSuggestApi, FormSuggestResult } from '../../core/ai/form-suggest-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { emptyDraft } from '../../features/context/form/context-draft';
import { policyPatch, policySuggestValues } from '../../features/context/form/policy-suggest';
import { AcceptedSuggestion, FormSuggest } from './form-suggest';

const RESULT: FormSuggestResult = {
  fields: [
    {
      name: 'title',
      value: 'Information security policy for Fjordtech AS',
      rationale: 'Named after the organisation',
      changed: true,
      display: null,
    },
    {
      name: 'statement',
      value: 'Fjordtech AS protects …',
      rationale: null,
      changed: true,
      display: null,
    },
    {
      name: 'owner_user_id',
      value: 'u-1',
      rationale: null,
      changed: true,
      display: 'Kari Nordmann',
    },
  ],
  missing_facts: ['address'],
};

function setup() {
  const api = {
    options: vi.fn(() =>
      of({
        offers: [
          {
            key: 'information_security',
            values: { kind: 'information_security' },
            reason: 'iso27001',
          },
        ],
        missing_facts: ['address'],
        ai_enabled: true,
      }),
    ),
    suggest: vi.fn(() => of(RESULT)),
  };
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, 'ask/en': askEn },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SelectedOrgService, useValue: { currentOrgId: () => 'org-1' } },
      { provide: FormSuggestApi, useValue: api },
      { provide: AiAvailability, useValue: { unavailable: () => false, markUnavailable: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FormSuggest);
  fixture.componentRef.setInput('suggestKey', 'context.policy');
  fixture.componentRef.setInput('fields', [
    { name: 'title', labelKey: 'Title' },
    { name: 'statement', labelKey: 'Statement', long: true },
    { name: 'owner_user_id', labelKey: 'Owner' },
  ]);
  fixture.componentRef.setInput('values', { title: 'Old title', statement: '' });
  return { fixture, api };
}

describe('FormSuggest', () => {
  it('offers missing records, reviews the whole proposal and applies it (nothing saved)', async () => {
    const { fixture, api } = setup();
    const offers: unknown[] = [];
    let applied: AcceptedSuggestion | null = null;
    fixture.componentInstance.offerPicked.subscribe((offer) => offers.push(offer));
    fixture.componentInstance.applied.subscribe((value) => (applied = value));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.options).toHaveBeenCalledWith('org-1', 'context.policy');
    expect(el.textContent).toContain('Add the address to the company profile');

    const offerButton = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Suggest it'),
    )!;
    offerButton.click();
    await fixture.whenStable();
    expect(offers).toHaveLength(1);
    expect(api.suggest).toHaveBeenCalledWith('org-1', 'context.policy', {
      values: { title: 'Old title', statement: '', kind: 'information_security' },
      context: { offer: 'information_security' },
      mode: 'create',
    });
    const review = el.querySelector('[data-testid="form-suggest-review"]')!;
    expect(review.textContent).toContain('Information security policy for Fjordtech AS');
    expect(review.textContent).toContain('Old title'); // the current value, struck through
    expect(review.textContent).toContain('Kari Nordmann'); // a pick shows its label
    (
      el.querySelector('[data-testid="form-suggest-apply-all"] button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(Object.keys(applied!)).toEqual(['title', 'statement', 'owner_user_id']);
    expect(el.querySelector('[data-testid="form-suggest-review"]')).toBeNull();
  });

  it('improves an existing record without offers', async () => {
    const { fixture, api } = setup();
    fixture.componentRef.setInput('editing', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Suggest it');
    (el.querySelector('[data-testid="form-suggest-run"] button') as HTMLButtonElement).click();
    expect(api.suggest).toHaveBeenCalledWith(
      'org-1',
      'context.policy',
      expect.objectContaining({ mode: 'improve' }),
    );
  });
});

describe('policy suggestion mapping', () => {
  it('maps the draft to suggestion values and accepted values back to the draft', () => {
    const draft = { ...emptyDraft(), title: 'P', review_interval_months: '12' };
    expect(policySuggestValues(draft)).toMatchObject({
      title: 'P',
      review_interval_months: 12,
      owner_user_id: null,
      document_id: null,
    });
    const field = (name: string, value: unknown, display: string | null = null) => ({
      name,
      value,
      rationale: null,
      changed: true,
      display,
    });
    expect(
      policyPatch({
        kind: field('kind', 'privacy'),
        frameworks: field('frameworks', ['gdpr', 'bogus']),
        review_interval_months: field('review_interval_months', 24),
        document_id: field('document_id', 'd-1', 'Privacy policy'),
        available_to_interested_parties: field('available_to_interested_parties', true),
      }),
    ).toEqual({
      kind: 'privacy',
      frameworks: ['gdpr'],
      review_interval_months: '24',
      document: { id: 'd-1', title: 'Privacy policy', code: null },
      available_to_interested_parties: true,
    });
    expect(policyPatch({ kind: field('kind', 'nope') })).toEqual({});
  });
});
