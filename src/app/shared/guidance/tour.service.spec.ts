import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideFakeGuidance } from '../../core/guidance/guidance.testing';
import { TourButton } from './tour-button';
import { TourStepDirective } from './tour-step.directive';
import { TourService } from './tour.service';

@Component({
  imports: [TourStepDirective, TourButton],
  template: `
    <div id="first" appTourStep="first">First</div>
    <app-tour-button scope="platform" tour="main" />
    <app-tour-button scope="platform" tour="none" />
  `,
})
class Host {}

function setup() {
  const fake = provideFakeGuidance({
    platform: {
      tours: {
        main: [
          { target: 'first', title: 'Step A', body: 'Body A' },
          { target: 'not-on-page', title: 'Step B', body: 'Body B' },
        ],
      },
    },
  });
  TestBed.configureTestingModule({
    imports: [Host, TranslocoTestingModule.forRoot({ langs: { en: {}, 'guidance/en': {} } })],
    providers: [provideZonelessChangeDetection(), ...fake.providers],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, tours: TestBed.inject(TourService), el: fixture.nativeElement as HTMLElement };
}

const popover = () => document.querySelector('[data-testid="tour-popover"]');

describe('TourService', () => {
  afterEach(() => TestBed.inject(TourService).end());

  it('shows only the buttons of tours that exist', () => {
    const { el } = setup();
    expect(el.querySelectorAll('[data-testid="tour-button"]')).toHaveLength(1);
  });

  it('walks the steps, highlighting registered targets', async () => {
    const { tours, el } = setup();
    const target = el.querySelector<HTMLElement>('#first')!;
    await expect(tours.start('platform', 'main')).resolves.toBe(true);
    TestBed.tick();
    expect(tours.step()?.title).toBe('Step A');
    expect(popover()?.textContent).toContain('Step A');
    expect(target.style.outline).toContain('solid');

    tours.next();
    TestBed.tick();
    expect(tours.step()?.title).toBe('Step B');
    expect(tours.isLast()).toBe(true);
    expect(target.style.outline).toBe('');

    tours.previous();
    expect(tours.index()).toBe(0);
    tours.next();
    tours.next();
    TestBed.tick();
    expect(tours.active()).toBe(false);
    expect(popover()).toBeNull();
  });

  it('does not start a tour without steps', async () => {
    const { tours } = setup();
    await expect(tours.start('platform', 'none')).resolves.toBe(false);
    expect(tours.active()).toBe(false);
  });
});
