import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { InboxService } from '../../core/notifications/inbox.service';
import { Org, SelectedOrgService } from '../../core/org/selected-org.service';
import EN from '../../../assets/i18n/en.json';
import { OrgSwitcher } from './org-switcher';

const ORGS: readonly Org[] = [
  { id: 'org-1', name: 'Alpha', roles: [], permissions: [] },
  { id: 'org-2', name: 'Beta', roles: [], permissions: [] },
  { id: 'org-3', name: 'Gamma', roles: [], permissions: [] },
];

describe('OrgSwitcher unread counts', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(counts: ReadonlyMap<string, number>) {
    const currentOrgId = signal<string | null>('org-1');
    const unreadByOrg = signal(counts);
    const inbox = {
      unreadByOrg: unreadByOrg.asReadonly(),
      unreadElsewhere: computed(() =>
        [...unreadByOrg()].reduce((sum, [id, n]) => (id === currentOrgId() ? sum : sum + n), 0),
      ),
      refreshByOrg: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [
        OrgSwitcher,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: InboxService, useValue: inbox },
        {
          provide: SelectedOrgService,
          useValue: {
            orgs: signal(ORGS).asReadonly(),
            currentOrgId: currentOrgId.asReadonly(),
            currentOrg: computed(() => ORGS.find((o) => o.id === currentOrgId()) ?? null),
            setCurrentOrg: (id: string) => currentOrgId.set(id),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(OrgSwitcher);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = () => el.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const openPanel = async () => {
      trigger().click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { el, fixture, inbox, trigger, byTestId, openPanel, unreadByOrg };
  }

  it('flags unread notifications in other organizations on the trigger', async () => {
    const { trigger, byTestId, fixture } = setup(
      new Map([
        ['org-1', 2],
        ['org-2', 5],
      ]),
    );
    await fixture.whenStable();
    expect(byTestId('org-unread-elsewhere')).not.toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe(
      'Switch organization, 5 unread in other organizations',
    );
  });

  it('shows no flag when only the current organization has unread items', () => {
    const { byTestId } = setup(new Map([['org-1', 2]]));
    expect(byTestId('org-unread-elsewhere')).toBeNull();
  });

  it('lists the unread count per organization and refreshes on open', async () => {
    const { byTestId, openPanel, inbox } = setup(
      new Map([
        ['org-1', 2],
        ['org-2', 150],
        ['org-3', 0],
      ]),
    );
    await openPanel();
    expect(inbox.refreshByOrg).toHaveBeenCalled();
    expect(byTestId('org-unread-org-1')?.textContent).toContain('2');
    expect(byTestId('org-unread-org-2')?.textContent).toContain('99+');
    expect(byTestId('org-unread-org-2')?.textContent).toContain('150 unread');
    expect(byTestId('org-unread-org-3')).toBeNull();
  });
});
