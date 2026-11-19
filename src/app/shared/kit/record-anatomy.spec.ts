import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { FieldItem } from '../ui/field-list/field-list';
import { MenuItem } from '../ui/overflow-menu/overflow-menu';
import { configureKit, flushEntityTypes, kitUrl, tick } from './kit.testing';
import { RecordDetailLayout } from './record-detail-layout';
import { RecordPageContext } from './record-page-context';
import { RecordDetails, RecordLead, RecordMeta, RecordStatusLine } from './record-sections';

async function render(fixture: ComponentFixture<unknown>, ms = 0) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick(ms);
  fixture.detectChanges();
}

/** Stands in for the requirements panel: hands its pending suggestions to the page. */
@Component({ selector: 'app-fake-requirements', template: '<p>Requirement chips</p>' })
class FakeRequirements {
  readonly page = inject(RecordPageContext);
}

@Component({
  imports: [
    RecordDetailLayout,
    RecordLead,
    RecordDetails,
    RecordMeta,
    RecordStatusLine,
    FieldItem,
    MenuItem,
    FakeRequirements,
  ],
  template: `
    <app-record-detail-layout
      [anatomy]="true"
      entityType="deviation"
      entityId="d1"
      title="Record"
      [canEdit]="true"
      [createFlows]="false"
      [watch]="false"
      [missing]="[{ key: 'owner', labelKey: 'kit.detail.tab.details', link: '/owner' }]"
    >
      <button appMenuItem ask type="button" data-testid="page-ask">Summarise</button>
      <app-record-lead record-lead fillLink="/edit">
        <app-record-status-line status tone="pass">Handled</app-record-status-line>
        <app-field-item size="lead" labelText="Needs" [value]="needs()" />
        <app-field-item size="lead" labelText="How" [value]="null" />
      </app-record-lead>
      <app-record-details fillLink="/edit">
        <app-field-item labelText="Category" value="Regulator" />
        <app-field-item labelText="Description" [value]="''" />
        <app-field-item labelText="Monitoring">
          @if (false) {
            <span>never</span>
          }
        </app-field-item>
      </app-record-details>
      <app-fake-requirements aside-requirements />
      <app-record-meta follow-up-meta>
        <app-field-item layout="inline" labelText="Owner" [value]="null" />
        <app-field-item
          layout="inline"
          labelText="Next review"
          [keepEmpty]="true"
          emptyKey="kit.detail.meta.notPlanned"
          emptyActionKey="kit.detail.meta.plan"
          emptyLink="/edit"
        />
      </app-record-meta>
    </app-record-detail-layout>
  `,
})
class AnatomyHost {
  readonly needs = signal<string | null>('Valid certificate');
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('Detail-page anatomy (docs/ux-guide.md §2.7)', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    flushEntityTypes(http);
    http.verify();
  });

  it('shows the lead first, hides empty fields and merges the aside into one card', async () => {
    const { http } = configureKit(AnatomyHost);
    const fixture = TestBed.createComponent(AnatomyHost);
    await render(fixture);
    http
      .expectOne((r) => r.url === kitUrl('connections'))
      .flush({
        counts: { records: 0, requirements: 3, tasks: 0, suggestions: 0 },
        groups: [],
        suggestions: [],
        requirements: { confirmed: 3, suggested: 2 },
      });
    await render(fixture);
    const el = fixture.nativeElement as HTMLElement;

    // Lead: first in the DOM (phones show it first), empty lead fields are named.
    const lead = el.querySelector('[data-testid="record-lead"]')!;
    const aside = el.querySelector('aside')!;
    expect(lead.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(lead.querySelector('[data-testid="record-status-line"]'))).toBe('Handled');
    expect(text(lead.querySelector('[data-testid="empty-fields"]'))).toBe(
      'Not filled in: How · Fill in',
    );

    // Details: empty fields hidden, one count line.
    const details = el.querySelector('[data-testid="record-details"]')!;
    const shown = [...details.querySelectorAll<HTMLElement>('[data-testid="field-item"]')].filter(
      (f) => !f.classList.contains('hidden'),
    );
    expect(shown.map((f) => text(f))).toEqual(['CategoryRegulator']);
    expect(text(details.querySelector('[data-testid="empty-fields"]'))).toBe(
      '2 fields are not filled in · Fill in',
    );

    // A filled-in lead field disappears from the line when it empties.
    fixture.componentInstance.needs.set(null);
    await render(fixture);
    expect(text(lead.querySelector('[data-testid="empty-fields"]'))).toBe(
      'Not filled in: Needs, How · Fill in',
    );

    // One "Oppfølging" card: what is missing, requirements, connections, metadata.
    const card = el.querySelector('[data-testid="record-follow-up"]')!;
    expect(text(card.querySelector('h2'))).toBe('Follow-up');
    const part = fixture.debugElement.query(By.directive(FakeRequirements))
      .componentInstance as FakeRequirements;
    let reviewed = 0;
    part.page.requirements.set({ pending: 2, suggestMore: null, review: () => reviewed++ });
    await render(fixture);
    const missing = [...card.querySelectorAll('[data-testid="record-missing-item"]')];
    expect(missing.map((m) => text(m))).toEqual(['Details →']);
    const confirm = card.querySelector<HTMLElement>('[data-testid="record-confirm-requirements"]')!;
    expect(text(confirm)).toBe('Confirm 2 suggestions →');
    confirm.click();
    expect(reviewed).toBe(1);
    part.page.requirements.set({
      pending: 2,
      suggestMore: null,
      review: () => reviewed++,
      expanded: true,
    });
    await render(fixture);
    expect(card.querySelector('[data-testid="record-confirm-requirements"]')).toBeNull();

    // Connections: no zero counts, no requirement counts, a short empty state.
    expect(card.querySelector('[data-testid="connections-summary"]')).toBeNull();
    expect(text(card.querySelector('[data-testid="connections-empty"]'))).toBe(
      'No connections yet.',
    );

    // Metadata: unset values hidden, except the next review with its action.
    const meta = [...card.querySelectorAll<HTMLElement>('[data-testid="record-meta"] > *')];
    expect(meta.filter((m) => !m.classList.contains('hidden')).map((m) => text(m))).toEqual([
      'Next reviewNot planned · Plan',
    ]);

    // Assistant actions: one "Ask AI" menu in the header, with the page's and the kit's.
    const askMenu = el.querySelector('[data-testid="record-ask-menu"]')!;
    expect(text(askMenu)).toBe('Ask AI');
    const items = askMenu.parentElement!.querySelectorAll('[role="menuitem"]');
    expect([...items].map((i) => text(i))).toEqual(['Summarise', 'Ask about the connections']);
  });
});
