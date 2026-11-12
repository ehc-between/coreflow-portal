import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import en from '../../../assets/i18n/en.json';
import assetsEn from '../../../assets/i18n/assets/en.json';
import { APP_CONFIG } from '../../core/config/app-config';
import { ItemChange, ReviewItems } from './access-reviews/review-items';
import { ChangeStep } from './changes/change-step';
import {
  ChangeDetail,
  ReviewItem,
  ReviewItemInput,
  UpdateChangeRequest,
} from './data/asset.models';

const item = (id: string, over: Partial<ReviewItem> = {}): ReviewItem => ({
  id,
  review_id: 'r-1',
  subject_name: `Person ${id}`,
  subject_user: null,
  account: `acct-${id}`,
  access_level: 'User',
  decision: 'pending',
  note: null,
  decided_by: null,
  decided_at: null,
  remediated_at: null,
  remediated_by: null,
  position: 0,
  created_at: '2026-11-01T00:00:00',
  updated_at: '2026-11-01T00:00:00',
  ...over,
});

const change = (over: Partial<ChangeDetail>): ChangeDetail =>
  ({
    id: 'c-1',
    code: 'CHG-0001',
    title: 'Upgrade',
    status: 'draft',
    description: null,
    reason: null,
    impact_assessment: null,
    risk_level: null,
    implementation_plan: null,
    implemented_at: null,
    review_outcome: null,
    pending_approval: false,
    locked_fields: [],
    closed: false,
    ...over,
  }) as ChangeDetail;

@Component({
  imports: [ReviewItems, ChangeStep],
  template: `
    <app-review-items
      [items]="items()"
      [editable]="editable()"
      (changed)="changes.push($event)"
      (added)="added.push($event)"
    />
    <app-change-step [change]="change()" [canWrite]="true" (saved)="saved.push($event)" />
  `,
})
class Host {
  readonly items = signal<readonly ReviewItem[]>([
    item('1'),
    item('2', { decision: 'revoke' }),
    item('3', { decision: 'keep' }),
  ]);
  readonly editable = signal(true);
  readonly change = signal<ChangeDetail>(change({}));
  readonly changes: ItemChange[] = [];
  readonly added: ReviewItemInput[] = [];
  readonly saved: UpdateChangeRequest[] = [];
}

async function setup(): Promise<{ fixture: ComponentFixture<Host>; root: HTMLElement }> {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en: { ...en, assets: assetsEn } },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://test/api' } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('assets components', () => {
  afterEach(() => document.body.replaceChildren());

  it('records a decision per account and offers remediation for revoked access', async () => {
    const { fixture, root } = await setup();
    const rows = root.querySelectorAll('[data-testid="review-items"] > li');
    expect(rows.length).toBe(3);
    const revoke = [...rows[0].querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) =>
      b.textContent?.includes('Revoke'),
    )!;
    revoke.click();
    expect(fixture.componentInstance.changes).toEqual([
      { item: fixture.componentInstance.items()[0], patch: { decision: 'revoke' } },
    ]);
    expect(rows[1].textContent).toContain('Done: the access has been changed');
    expect(rows[2].textContent).not.toContain('Done: the access has been changed');
  });

  it('filters to undecided accounts and adds an account', async () => {
    const { fixture, root } = await setup();
    const pendingOnly = root.querySelector<HTMLInputElement>(
      'app-review-items input[type="checkbox"]',
    )!;
    pendingOnly.click();
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-testid="review-items"] > li').length).toBe(1);

    const addButton = [...root.querySelectorAll<HTMLButtonElement>('app-review-items button')].find(
      (b) => b.textContent?.includes('Add account'),
    )!;
    addButton.click();
    await fixture.whenStable();
    const form = root.querySelector<HTMLFormElement>('[data-testid="add-item"]')!;
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(form.textContent).toContain('Enter who holds the account.');
    const name = form.querySelector<HTMLInputElement>('input')!;
    name.value = 'Ola';
    name.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    expect(fixture.componentInstance.added).toEqual([
      { subject_name: 'Ola', account: null, access_level: null },
    ]);
  });

  it('is read-only when the review cannot be worked', async () => {
    const { fixture, root } = await setup();
    fixture.componentInstance.editable.set(false);
    await fixture.whenStable();
    expect(root.querySelectorAll('app-review-items [role="radio"]').length).toBe(0);
    expect(root.textContent).toContain('Undecided');
  });

  it('asks for the fields the next change step needs and saves them', async () => {
    const { fixture, root } = await setup();
    const step = root.querySelector('[data-testid="change-step"]')!;
    expect(step.textContent).toContain('Describe the change and the reason');
    const description = step.querySelector<HTMLTextAreaElement>('#step-description')!;
    description.value = 'Move to version 9';
    description.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    step.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(fixture.componentInstance.saved).toEqual([{ description: 'Move to version 9' }]);

    fixture.componentInstance.change.set(
      change({ status: 'review', review_outcome: 'successful' }),
    );
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="change-step"]')).toBeNull();
  });
});
