import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import { AiAvailability } from '../../core/ai/ai-availability';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { TutorService } from '../../core/guidance/tutor.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { TourService } from '../guidance/tour.service';
import { Notifications, TOAST_NAVIGATION_GRACE_MS } from '../notifications/notifications';
import { ErrorState } from './error-state/error-state';
import { FieldItem, FieldList } from './field-list/field-list';
import { HelpStrip } from './help-strip/help-strip';
import { LoadingState } from './loading-state/loading-state';
import { ModuleNav, ModuleNavItem } from './module-nav/module-nav';
import { MenuItem, OverflowMenu } from './overflow-menu/overflow-menu';
import { Breadcrumb, PageHeader } from './page-header/page-header';
import { RecordRow, RecordRowHeader } from './record-row/record-row';
import { StatusBadge } from './status-badge/status-badge';
import { TitleService } from './title/title.service';
import { humaniseValue, toneFor, toneLabelKey } from './tones';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function configure(imports: unknown[], providers: unknown[] = []) {
  TestBed.configureTestingModule({
    imports: [
      ...(imports as never[]),
      TranslocoTestingModule.forRoot({
        langs: { en, nb },
        translocoConfig: { availableLangs: ['en', 'nb'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [provideZonelessChangeDetection(), provideRouter([]), ...(providers as never[])],
  });
}

describe('toneFor', () => {
  it('maps severity with low as neutral and medium as warn', () => {
    expect(toneFor('severity', 'critical')).toBe('fail');
    expect(toneFor('severity', 'High')).toBe('fail');
    expect(toneFor('severity', 'medium')).toBe('warn');
    expect(toneFor('severity', 'moderate')).toBe('warn');
    expect(toneFor('severity', 'low')).toBe('neutral');
    expect(toneFor('severity', 'minimal')).toBe('neutral');
  });

  it('maps lifecycle statuses', () => {
    expect(toneFor('lifecycle', 'draft')).toBe('neutral');
    expect(toneFor('lifecycle', 'open')).toBe('info');
    expect(toneFor('lifecycle', 'in progress')).toBe('accent');
    expect(toneFor('lifecycle', 'under-review')).toBe('accent');
    expect(toneFor('lifecycle', 'overdue')).toBe('warn');
    expect(toneFor('lifecycle', 'approved')).toBe('pass');
    expect(toneFor('lifecycle', 'archived')).toBe('neutral');
    expect(toneFor('lifecycle', 'rejected')).toBe('fail');
  });

  it('maps compliance', () => {
    expect(toneFor('compliance', 'compliant')).toBe('pass');
    expect(toneFor('compliance', 'partially_compliant')).toBe('warn');
    expect(toneFor('compliance', 'non_compliant')).toBe('fail');
    expect(toneFor('compliance', 'not_applicable')).toBe('neutral');
  });

  it('never makes progress red', () => {
    expect(toneFor('progress', 0)).toBe('neutral');
    expect(toneFor('progress', '3')).toBe('accent');
    expect(toneFor('progress', 100)).toBe('pass');
    expect(toneFor('progress', 'failed')).toBe('warn');
  });

  it('falls back to neutral for unknown values', () => {
    expect(toneFor('lifecycle', 'whatever')).toBe('neutral');
    expect(toneFor('severity', null)).toBe('neutral');
  });

  it('builds label keys and readable fallbacks', () => {
    expect(toneLabelKey('severity', 'High')).toBe('common.severity.high');
    expect(toneLabelKey('lifecycle', 'in progress')).toBe('common.status.in_progress');
    expect(humaniseValue('under_review')).toBe('Under review');
  });
});

@Component({
  imports: [StatusBadge],
  template: `
    <app-status-badge meaning="severity" value="high" />
    <app-status-badge meaning="lifecycle" value="in_progress" />
    <app-status-badge meaning="lifecycle" value="some_custom_state" />
  `,
})
class BadgeHost {}

describe('StatusBadge', () => {
  it('translates known values and humanises unknown ones', async () => {
    configure([BadgeHost]);
    const fixture = TestBed.createComponent(BadgeHost);
    await fixture.whenStable();
    const badges = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-badge'),
    ).map((b) => [b.textContent?.trim(), b.getAttribute('data-tone')]);
    expect(badges).toEqual([
      ['High', 'fail'],
      ['In progress', 'accent'],
      ['Some custom state', 'neutral'],
    ]);
  });
});

@Component({
  imports: [PageHeader, MenuItem],
  template: `
    <app-page-header
      titleKey="modules.names.risk"
      descriptionKey="ui.empty.noResultsBody"
      [breadcrumbs]="crumbs"
      settingsLink="/risk/matrices"
    >
      <button primary type="button">Primary</button>
      <button secondary type="button">Secondary</button>
      <button appMenuItem overflow type="button">Archive</button>
      <button appMenuItem overflow type="button" [danger]="true">Delete</button>
    </app-page-header>
  `,
})
class HeaderHost {
  crumbs: Breadcrumb[] = [
    { labelKey: 'modules.names.risk', link: '/risk' },
    { label: 'RSK-0001 Backup' },
  ];
}

describe('PageHeader', () => {
  it('renders h1, breadcrumbs, actions and the gear, and sets the document title', async () => {
    configure([HeaderHost]);
    const fixture = TestBed.createComponent(HeaderHost);
    await fixture.whenStable();
    await tick();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Risks and opportunities');
    const crumbs = Array.from(el.querySelectorAll('nav ol li')).map((li) =>
      li.textContent?.replace('›', '').trim(),
    );
    expect(crumbs).toEqual(['Risks and opportunities', 'RSK-0001 Backup']);
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('RSK-0001 Backup');
    expect(el.querySelector('[data-testid="page-settings"]')?.getAttribute('href')).toBe(
      '/risk/matrices',
    );
    expect(el.querySelector('[data-testid="page-header-back"]')?.textContent?.trim()).toBe(
      'Risks and opportunities',
    );
    expect(TestBed.inject(Title).getTitle()).toBe('Risks and opportunities · CoreFlow');

    fixture.destroy();
    await tick();
    TestBed.inject(TitleService);
    expect(TestBed.inject(Title).getTitle()).toBe('CoreFlow');
  });

  it('puts overflow items in a keyboard menu that returns focus', async () => {
    configure([HeaderHost]);
    const fixture = TestBed.createComponent(HeaderHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    await tick();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="overflow-trigger"]')!;
    const menu = el.querySelector<HTMLElement>('[data-testid="overflow-menu"]')!;
    expect(el.querySelector('app-overflow-menu')?.classList.contains('hidden')).toBe(false);
    expect(trigger.textContent?.trim()).toBe('More');
    expect(menu.hidden).toBe(true);

    trigger.click();
    await fixture.whenStable();
    await tick();
    expect(menu.hidden).toBe(false);
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);
    expect(items[1].getAttribute('data-danger')).toBe('true');

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    fixture.nativeElement.remove();
  });
});

@Component({
  imports: [OverflowMenu],
  template: `<app-overflow-menu />`,
})
class EmptyMenuHost {}

describe('OverflowMenu', () => {
  it('hides itself when it has no items', async () => {
    configure([EmptyMenuHost]);
    const fixture = TestBed.createComponent(EmptyMenuHost);
    await fixture.whenStable();
    await tick();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('app-overflow-menu')
        ?.classList.contains('hidden'),
    ).toBe(true);
  });
});

@Component({
  imports: [ModuleNav],
  template: `<app-module-nav labelKey="modules.names.risk" [items]="items" />`,
})
class NavHost {
  items: ModuleNavItem[] = [
    { labelKey: 'ui.recordRow.title', link: '/a', exact: true, count: 3 },
    { labelKey: 'ui.recordRow.owner', link: '/b' },
  ];
}

describe('ModuleNav', () => {
  it('renders labelled links with counts', async () => {
    configure([NavHost]);
    const fixture = TestBed.createComponent(NavHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Risks and opportunities');
    const links = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Title 3', 'Owner']);
  });
});

@Component({
  imports: [FieldList, FieldItem],
  template: `
    <app-field-list>
      <app-field-item labelKey="ui.recordRow.owner" value="Kari" />
      <app-field-item labelKey="ui.recordRow.date.due" [value]="null" />
      <app-field-item labelKey="ui.recordRow.coverage" empty="none" />
      <app-field-item labelText="Custom"><b>projected</b></app-field-item>
    </app-field-list>
  `,
})
class FieldsHost {}

describe('FieldList', () => {
  it('shows values, projected content and the empty words', async () => {
    configure([FieldsHost]);
    const fixture = TestBed.createComponent(FieldsHost);
    await fixture.whenStable();
    await tick();
    await fixture.whenStable();
    const items = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="field-item"]'),
    ).map((i) => i.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['OwnerKari', 'DueNot set', 'RequirementsNone', 'Customprojected']);
  });
});

@Component({
  imports: [RecordRow, RecordRowHeader],
  template: `
    <div role="list">
      <app-record-row-header dateKind="due" />
      <app-record-row
        code="RSK-0001"
        title="Backup fails"
        subtitle="IT"
        [link]="['/risk', '1']"
        owner="Lars Olsen"
        date="2026-10-20"
        dateKind="due"
        [overdue]="true"
      >
        <span badges data-testid="badge">Open</span>
      </app-record-row>
    </div>
  `,
})
class RowHost {}

describe('RecordRow', () => {
  it('renders the fixed slots with a stretched title link', async () => {
    configure([RowHost]);
    const fixture = TestBed.createComponent(RowHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="record-row-code"]')?.textContent?.trim()).toBe(
      'RSK-0001',
    );
    const title = el.querySelector<HTMLAnchorElement>('[data-testid="record-row-title"]')!;
    expect(title.getAttribute('href')).toBe('/risk/1');
    expect(
      el.querySelector('[data-testid="record-row-badges"] [data-testid="badge"]'),
    ).not.toBeNull();
    const date = el.querySelector('[data-testid="record-row-date"]')!.textContent!;
    expect(date).toContain('Oct 20, 2026');
    expect(date).toContain('Overdue');
    expect(el.querySelector('app-record-row')?.getAttribute('role')).toBe('listitem');
  });
});

describe('Loading and error states', () => {
  it('renders skeleton rows and a retry button', async () => {
    @Component({
      imports: [LoadingState, ErrorState],
      template: `<app-loading-state [rows]="3" /><app-error-state (retry)="retried = true" />`,
    })
    class StatesHost {
      retried = false;
    }
    configure([StatesHost]);
    const fixture = TestBed.createComponent(StatesHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="loading-state"] [aria-hidden="true"]').length).toBe(
      3,
    );
    expect(el.querySelector('[data-testid="loading-state"]')?.textContent).toContain('Loading');
    el.querySelector<HTMLElement>('[data-testid="error-retry"] button')!.click();
    expect(fixture.componentInstance.retried).toBe(true);
  });
});

describe('HelpStrip', () => {
  const page = {
    intro: { title: 'What this page is for', body: 'Body text', steps: ['Open **Tavle**'] },
  };

  function setupStrip(level: 'beginner' | 'standard', stored?: string) {
    localStorage.clear();
    if (stored) {
      localStorage.setItem('coreflow.help.risk.list', stored);
    }
    const tutor = { teach: vi.fn() };
    const tours = { start: vi.fn().mockResolvedValue(true) };
    @Component({
      imports: [HelpStrip],
      template: `<app-help-strip scope="risk" page="list" tour="register" lesson="basics" />`,
    })
    class StripHost {}
    configure(
      [StripHost],
      [
        {
          provide: GuidanceContentService,
          useValue: {
            readPage: () => page,
            readTour: () => [{ target: 'x', title: 't', body: 'b' }],
            readLesson: () => ({
              title: 'Risk basics',
              minutes: 5,
              sections: [{ heading: 'H', body: 'B' }],
            }),
            readLoaded: () => true,
            readFile: () => null,
          },
        },
        {
          provide: GuidanceService,
          useValue: { isBeginner: signal(level === 'beginner'), isExpert: signal(false) },
        },
        { provide: TutorService, useValue: tutor },
        { provide: TourService, useValue: tours },
        { provide: AiAvailability, useValue: { unavailable: signal(false) } },
        {
          provide: LearningProgressService,
          useValue: { ensureLoaded: vi.fn(), byKey: signal(new Map()), record: vi.fn() },
        },
      ],
    );
    const fixture = TestBed.createComponent(StripHost);
    return { fixture, tutor, tours, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => localStorage.clear());

  it('shows one line and a "?" whose panel holds the intro, the steps and the three actions', async () => {
    const { fixture, el, tutor, tours } = setupStrip('standard');
    await fixture.whenStable();
    const toggle = el.querySelector<HTMLElement>('[data-testid="help-strip-toggle"]')!;
    expect(el.querySelector('[data-testid="help-strip-lead"]')?.textContent?.trim()).toBe(
      'What this page is for',
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('ol li strong')).toBeNull();
    expect(el.querySelector('[data-testid="help-strip-tour"]')).toBeNull();

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('ol li strong')?.textContent).toBe('Tavle');
    expect(el.querySelector('[data-testid="help-strip-tour"]')?.textContent?.trim()).toBe('Tour');
    expect(el.querySelector('[data-testid="help-strip-lesson"]')?.textContent?.trim()).toBe(
      'Lesson · 5 min',
    );
    expect(el.querySelector('[data-testid="help-strip-explain"]')?.textContent?.trim()).toBe(
      'Explain this page',
    );
    el.querySelector<HTMLElement>('[data-testid="help-strip-explain"]')!.click();
    expect(tutor.teach).toHaveBeenCalledWith('risk.list', 'What this page is for');
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="help-panel"]')).toBeNull();

    toggle.click();
    await fixture.whenStable();
    el.querySelector<HTMLElement>('[data-testid="help-strip-tour"]')!.click();
    expect(tours.start).toHaveBeenCalledWith('risk', 'register');
  });

  it('opens the lesson inside the panel, with a way back', async () => {
    const { fixture, el } = setupStrip('standard');
    await fixture.whenStable();
    el.querySelector<HTMLElement>('[data-testid="help-strip-toggle"]')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLElement>('[data-testid="help-strip-lesson"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-lesson')).not.toBeNull();
    el.querySelector<HTMLElement>('[data-testid="help-strip-back"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-lesson')).toBeNull();
    expect(el.querySelector('[data-testid="help-panel"]')).not.toBeNull();
  });

  it('gives beginners one plain sentence and a labelled button, never the whole intro', async () => {
    const { fixture, el } = setupStrip('beginner');
    await fixture.whenStable();
    expect(el.querySelector('[data-testid="help-strip-lead"]')?.textContent?.trim()).toBe(
      'Body text',
    );
    expect(el.querySelector('[data-testid="help-strip-toggle"]')?.textContent).toContain(
      'How this page works',
    );
    expect(el.querySelector('ol')).toBeNull();
  });
});

describe('Notifications', () => {
  it('clears toasts that belong to an earlier page and keeps fresh ones', async () => {
    configure([Notifications]);
    const fixture = TestBed.createComponent(Notifications);
    const service = TestBed.inject(NotificationService);
    // A fixed clock, so the result does not depend on how fast the effects run.
    const start = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    try {
      service.error('errors.generic');
      await fixture.whenStable();
      clock.mockReturnValue(start + 1000);
      service.success('common.save');
      await fixture.whenStable();
      // Navigating soon after keeps both: neither has been showing for the grace period.
      fixture.componentInstance.clearStale(start + 1010);
      expect(service.notifications().length).toBe(2);
      // Later only the older toast has outlived the grace period.
      fixture.componentInstance.clearStale(start + TOAST_NAVIGATION_GRACE_MS + 10);
      expect(service.notifications().map((n) => n.level)).toEqual(['success']);
      fixture.componentInstance.clearStale(start + 1000 + TOAST_NAVIGATION_GRACE_MS);
      expect(service.notifications().length).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });
});
