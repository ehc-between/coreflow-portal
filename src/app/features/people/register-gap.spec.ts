import { TestBed } from '@angular/core/testing';
import { NotificationService } from '../../core/notifications/notification.service';
import { configureKit, kitUrl, tick } from '../../shared/kit/kit.testing';
import { ImportUsersDialog } from './ui/import-users-dialog';
import { RegisterGap } from './ui/register-gap';

const people = (path: string) => kitUrl(`people/${path}`);

const MEMBERS = [
  { id: 'u-1', name: 'Emma Kristiansen', email: 'emma@x.no', suggested: false },
  { id: 'u-2', name: null, email: 'sofie@x.no', suggested: false },
];

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges();
  await fixture.whenStable();
  await tick();
  fixture.detectChanges();
}

describe('U26 RegisterGap', () => {
  it('names the members without an employee card and offers "Opprett ansattkort"', async () => {
    const { http } = configureKit(RegisterGap);
    const fixture = TestBed.createComponent(RegisterGap);
    fixture.componentRef.setInput('count', 2);
    fixture.componentRef.setInput('canWrite', true);
    const create = vi.fn();
    fixture.componentInstance.create.subscribe(create);
    await settle(fixture);
    http
      .expectOne(people('user-matches'))
      .flush({ suggestions: [], members_without_employee: MEMBERS });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="register-gap"]')?.textContent).toContain(
      'people.gap.title',
    );
    expect(el.querySelector('[data-testid="register-gap-names"]')?.textContent?.trim()).toBe(
      'Emma Kristiansen, sofie@x.no',
    );
    el.querySelector<HTMLElement>('[data-testid="register-gap-create"] button')?.click();
    expect(create).toHaveBeenCalled();
    http.verify();
  });

  it('is hidden and makes no request when there is no gap, and read-only users get no button', async () => {
    const { http } = configureKit(RegisterGap);
    const fixture = TestBed.createComponent(RegisterGap);
    fixture.componentRef.setInput('count', 0);
    await settle(fixture);
    http.expectNone(people('user-matches'));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="register-gap"]'),
    ).toBeNull();

    fixture.componentRef.setInput('count', 1);
    await settle(fixture);
    http
      .expectOne(people('user-matches'))
      .flush({ suggestions: [], members_without_employee: [MEMBERS[0]] });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="register-gap"]')?.textContent).toContain(
      'people.gap.titleOne',
    );
    expect(el.querySelector('[data-testid="register-gap-create"]')).toBeNull();
    http.verify();
  });
});

describe('U26 ImportUsersDialog', () => {
  it('creates employee cards with the chosen employment type (external = contractor)', async () => {
    const notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const { http } = configureKit(ImportUsersDialog, {
      providers: [{ provide: NotificationService, useValue: notifications }],
    });
    const fixture = TestBed.createComponent(ImportUsersDialog);
    fixture.componentRef.setInput('open', true);
    await settle(fixture);
    http
      .expectOne(people('user-matches'))
      .flush({ suggestions: [], members_without_employee: MEMBERS });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const boxes = el.querySelectorAll<HTMLInputElement>(
      '[data-testid="import-rows"] input[type="checkbox"]',
    );
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change'));
    const type = el.querySelector<HTMLSelectElement>('[data-testid="import-type"]')!;
    type.value = 'contractor';
    type.dispatchEvent(new Event('change'));
    await settle(fixture);
    (fixture.componentInstance as unknown as { importSelected(): void }).importSelected();
    const req = http.expectOne(people('employees/import-users'));
    expect(req.request.body).toEqual({
      user_ids: ['u-1'],
      status: 'active',
      employment_type: 'contractor',
    });
    req.flush({ items: [], total: 1 });
    expect(notifications.success).toHaveBeenCalledWith('people.notices.importedOne', { count: 1 });
  });
});
