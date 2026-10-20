import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PromptDialog } from './prompt-dialog';

@Component({
  imports: [PromptDialog],
  template: `
    <app-prompt-dialog
      [open]="open()"
      [required]="required()"
      title="Reason"
      message="Why?"
      label="Reason"
      confirmLabel="Save"
      cancelLabel="Cancel"
      (confirmed)="answers.push($event); open.set(false)"
      (cancelled)="open.set(false)"
    />
  `,
})
class Host {
  readonly open = signal(false);
  readonly required = signal(true);
  readonly answers: string[] = [];
}

async function setup() {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.componentInstance.open.set(true);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const confirm = () => {
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
    );
    return buttons[buttons.length - 1];
  };
  const type = async (value: string) => {
    const textarea = root.querySelector('textarea')!;
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, root, confirm, type };
}

describe('PromptDialog', () => {
  afterEach(() => document.body.replaceChildren());

  it('labels the field and keeps confirm disabled until a required answer is given', async () => {
    const { root, confirm, type } = await setup();
    const label = root.querySelector('label')!;
    expect(root.querySelector('textarea')!.id).toBe(label.getAttribute('for'));
    expect(confirm().disabled).toBe(true);
    await type('   ');
    expect(confirm().disabled).toBe(true);
    await type('Because');
    expect(confirm().disabled).toBe(false);
  });

  it('emits the trimmed answer and starts empty when reopened', async () => {
    const { fixture, root, confirm, type } = await setup();
    await type('  Updated scope  ');
    confirm().click();
    await fixture.whenStable();
    expect(fixture.componentInstance.answers).toEqual(['Updated scope']);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    expect(root.querySelector('textarea')!.value).toBe('');
  });

  it('allows an empty answer when optional', async () => {
    const { fixture, confirm } = await setup();
    fixture.componentInstance.required.set(false);
    await fixture.whenStable();
    expect(confirm().disabled).toBe(false);
    confirm().click();
    expect(fixture.componentInstance.answers).toEqual(['']);
  });
});
