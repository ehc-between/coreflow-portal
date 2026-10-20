import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SlideOver } from './slide-over';

@Component({
  imports: [SlideOver],
  template: `
    <app-slide-over [open]="open()" title="Panel" closeLabel="Close" (closed)="closes = closes + 1">
      <button type="button" id="inside">Inside</button>
      @if (nested()) {
        <div role="alertdialog" aria-modal="true" id="nested">Confirm?</div>
      }
    </app-slide-over>
  `,
})
class Host {
  readonly open = signal(true);
  readonly nested = signal(false);
  closes = 0;
}

describe('SlideOver', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const escape = () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    document.dispatchEvent(event);
    return event;
  };

  it('closes on Escape and marks the event handled', async () => {
    const fixture = await setup();
    const event = escape();
    expect(fixture.componentInstance.closes).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Escape to a dialog opened on top of it', async () => {
    const fixture = await setup();
    fixture.componentInstance.nested.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    escape();
    expect(fixture.componentInstance.closes).toBe(0);
  });

  it('ignores an Escape another handler already took', async () => {
    const fixture = await setup();
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(fixture.componentInstance.closes).toBe(0);
  });
});
