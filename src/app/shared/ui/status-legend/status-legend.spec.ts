import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { StatusLegend } from './status-legend';

@Component({
  imports: [StatusLegend],
  template: `<app-status-legend text="Løst betyr svart. Lukket betyr ferdig." />`,
})
class Host {}

describe('StatusLegend (simplify U39)', () => {
  it('explains the status pair to beginners only', () => {
    const fake = provideFakeGuidance({}, 'beginner');
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection(), ...fake.providers],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="status-legend"]')?.textContent).toContain(
      'Løst betyr svart. Lukket betyr ferdig.',
    );
    fake.level.set('standard');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="status-legend"]')).toBeNull();
    expect(el.querySelector('app-status-legend')?.classList.contains('hidden')).toBe(true);
  });
});
