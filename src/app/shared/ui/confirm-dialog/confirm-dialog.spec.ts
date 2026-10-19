import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <button type="button" id="trigger" (click)="open.set(true)">Open</button>
    <app-confirm-dialog
      [open]="open()"
      title="Delete?"
      message="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      (confirmed)="confirmed = confirmed + 1; open.set(false)"
      (cancelled)="open.set(false)"
    />
    <app-confirm-dialog [open]="second()" title="Other" message="Other" />
  `,
})
class Host {
  readonly open = signal(false);
  readonly second = signal(false);
  confirmed = 0;
}

async function setup(): Promise<{ fixture: ComponentFixture<Host>; root: HTMLElement }> {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

async function openFromTrigger(fixture: ComponentFixture<Host>, root: HTMLElement): Promise<void> {
  const trigger = root.querySelector<HTMLButtonElement>('#trigger')!;
  trigger.focus();
  trigger.click();
  await fixture.whenStable();
}

const buttonsIn = (dialog: Element) =>
  Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));

describe('ConfirmDialog', () => {
  afterEach(() => document.body.replaceChildren());

  it('renders nothing while closed', async () => {
    const { root } = await setup();
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('labels the dialog with per-instance ids', async () => {
    const { fixture, root } = await setup();
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.second.set(true);
    await fixture.whenStable();

    const dialogs = Array.from(root.querySelectorAll('[role="alertdialog"]'));
    expect(dialogs).toHaveLength(2);
    const [a, b] = dialogs.map((d) => d.getAttribute('aria-labelledby'));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect(root.querySelector(`#${a}`)!.textContent).toContain('Delete?');
    const described = dialogs[0].getAttribute('aria-describedby')!;
    expect(root.querySelector(`#${described}`)!.textContent).toContain('cannot be undone');
  });

  it('focuses cancel on open and restores focus to the trigger on close', async () => {
    const { fixture, root } = await setup();
    await openFromTrigger(fixture, root);

    const dialog = root.querySelector('[role="alertdialog"]')!;
    const [cancel] = buttonsIn(dialog);
    expect(document.activeElement).toBe(cancel);

    cancel.click();
    await fixture.whenStable();
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('#trigger'));
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    const { fixture, root } = await setup();
    await openFromTrigger(fixture, root);
    const dialog = root.querySelector<HTMLElement>('[role="alertdialog"]')!;
    const [cancel, confirm] = buttonsIn(dialog);

    confirm.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    confirm.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    cancel.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);
  });

  it('emits confirmed and cancels on Escape', async () => {
    const { fixture, root } = await setup();
    await openFromTrigger(fixture, root);
    const [, confirm] = buttonsIn(root.querySelector('[role="alertdialog"]')!);
    confirm.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.confirmed).toBe(1);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });
});
