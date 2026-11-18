import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { APP_CONFIG } from '../../../core/config/app-config';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { Requirement } from '../../../core/standards/standards.models';
import { ClauseLink } from './clause-link';

function req(ref: string): Requirement {
  return {
    ref,
    text: { en: `Requirement ${ref}`, nb: `Krav ${ref}` },
    evidence_examples: null,
    status: 'not_started',
    applicable: true,
    justification: null,
    confirmed_links: [],
    suggested_links: [],
    status_override: null,
    note: null,
  };
}

describe('ClauseLink', () => {
  it('links one record to every requirement of the clause, minus the opted-out ones', async () => {
    const linkClause = vi.fn(() => of({ linked: 2, refs: ['iso:5.1.r1', 'iso:5.1.r3'] }));
    TestBed.configureTestingModule({
      imports: [ClauseLink, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideZonelessChangeDetection(),
        { provide: APP_CONFIG, useValue: { i18n: { availableLanguages: ['en', 'nb'] } } },
        { provide: StandardsApi, useValue: { linkClause } },
        { provide: SelectedOrgService, useValue: { currentOrgId: signal('org-1').asReadonly() } },
      ],
    });
    const fixture = TestBed.createComponent(ClauseLink);
    fixture.componentRef.setInput('standardKey', 'iso');
    fixture.componentRef.setInput('number', '5.1');
    fixture.componentRef.setInput('requirements', [
      req('iso:5.1.r1'),
      req('iso:5.1.r2'),
      req('iso:5.1.r3'),
    ]);
    const linked: string[] = [];
    fixture.componentInstance.linked.subscribe((ref) => linked.push(ref));
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance as unknown as {
      choose(pick: { entity_type: string; entity_id: string; label: string }): void;
      toggle(ref: string): void;
      save(): void;
    };
    component.choose({ entity_type: 'document', entity_id: 'd-1', label: 'POL-001 · Policy' });
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelectorAll('[data-testid="clause-link-confirm"] input[type="checkbox"]'),
    ).toHaveLength(3);

    component.toggle('iso:5.1.r2');
    component.save();
    expect(linkClause).toHaveBeenCalledWith('org-1', 'iso', '5.1', {
      entity_type: 'document',
      entity_id: 'd-1',
      exclude_refs: ['iso:5.1.r2'],
    });
    expect(linked).toEqual(['iso:5.1.r1']);
  });
});
