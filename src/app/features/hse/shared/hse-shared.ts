import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LessonView } from '../../../shared/guidance/lesson';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { AskPanelService } from '../../ask/ask-panel.service';

/** The guidance / i18n scope of the module (portal path `hse`). */
export const HSE_SCOPE = 'hse';
/** The module key (permission prefix, page-context module). */
export const HSE_MODULE = 'hse';

export interface HsePermissions {
  readonly read: Signal<boolean>;
  readonly write: Signal<boolean>;
  readonly manage: Signal<boolean>;
  readonly approve: Signal<boolean>;
}

/** Reactive HSE permissions of the current user in the selected org (injection context). */
export function injectHsePermissions(): HsePermissions {
  const org = inject(SelectedOrgService);
  const has = (key: string) => computed(() => (org.currentOrg()?.permissions ?? []).includes(key));
  return {
    read: has('hse:read'),
    write: has('hse:write'),
    manage: has('hse:manage'),
    approve: has('hse:approve'),
  };
}

interface NavLink {
  readonly path: string;
  readonly labelKey: string;
  readonly exact: boolean;
}

const LINKS: readonly NavLink[] = [
  { path: '/hse', labelKey: 'hse.nav.overview', exact: true },
  { path: '/hse/sja', labelKey: 'hse.nav.sja', exact: false },
  { path: '/hse/ppe', labelKey: 'hse.nav.ppe', exact: false },
  { path: '/hse/consultations', labelKey: 'hse.nav.consultations', exact: false },
  { path: '/hse/safety-rounds', labelKey: 'hse.nav.safetyRounds', exact: false },
];

/** Section navigation between the HSE pages (scrolls horizontally on small screens). */
@Component({
  selector: 'app-hse-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      class="mb-5 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'hse.nav.label' | transloco"
    >
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="border-accent text-fg"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class HseNav {
  protected readonly links = LINKS;
}

/** A "micro-lesson" button that plays an HSE lesson (`<app-lesson>`) in a side panel. */
@Component({
  selector: 'app-hse-lesson-button',
  imports: [TranslocoPipe, Button, Icon, SlideOver, LessonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <app-button variant="ghost" size="sm" (click)="open.set(true)">
      <app-icon name="training" [size]="15" />
      {{ labelKey() | transloco }}
    </app-button>
    <app-slide-over
      [open]="open()"
      [title]="labelKey() | transloco"
      [closeLabel]="'hse.common.close' | transloco"
      [width]="560"
      (closed)="open.set(false)"
    >
      @if (open()) {
        <app-lesson scope="hse" [lesson]="lesson()" />
      }
    </app-slide-over>
  `,
})
export class HseLessonButton {
  readonly lesson = input.required<string>();
  readonly labelKey = input('hse.common.lesson');
  protected readonly open = signal(false);
}

/**
 * A native `<select>` of the org's people (`kind="user"`, value = user id) or
 * departments (`kind="department"`, value = department id); '' = none. Options come
 * from the shared assignee directory (falls back to the signed-in user).
 */
@Component({
  selector: 'app-hse-directory-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [value]="value()"
      [attr.aria-describedby]="describedBy() || null"
      (change)="valueChange.emit($any($event.target).value)"
    >
      <option value="">{{ noneKey() | transloco }}</option>
      @if (orphan(); as orphan) {
        <option [value]="orphan.value" selected>{{ orphan.label }}</option>
      }
      @for (o of options(); track o.value) {
        <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
      }
    </select>
  `,
})
export class HseDirectorySelect {
  private readonly directory = inject(AssigneeOptionsService);

  readonly kind = input<'user' | 'department'>('user');
  readonly inputId = input('');
  readonly value = input('');
  /** Name of the current value when it is not in the option list (e.g. a former member). */
  readonly currentName = input<string | null>(null);
  readonly noneKey = input('hse.common.none');
  readonly describedBy = input('');
  readonly valueChange = output<string>();

  protected readonly options = computed(() => directoryOptions(this.directory, this.kind()));

  protected readonly orphan = computed(() => {
    const value = this.value();
    if (!value || this.options().some((o) => o.value === value)) {
      return null;
    }
    return { value, label: this.currentName() || value };
  });

  constructor() {
    this.directory.ensureLoaded();
  }
}

/** `{value: id, label}` options of the directory for one kind. */
export function directoryOptions(
  directory: AssigneeOptionsService,
  kind: 'user' | 'department',
): { value: string; label: string }[] {
  const all = directory.options();
  const list = kind === 'user' ? all.users : all.departments;
  const prefix = `${kind}:`;
  return list.map((o) => ({ value: o.value.slice(prefix.length), label: o.label }));
}

/** Department name by id from the shared directory (null when unknown). */
export function departmentName(
  directory: AssigneeOptionsService,
  id: string | null,
): string | null {
  if (!id) {
    return null;
  }
  return directoryOptions(directory, 'department').find((o) => o.value === id)?.label ?? null;
}

/**
 * A labelled "ask the assistant" button (summarise, explain): opens the assistant
 * with the translated `promptKey` about the current page (its page context names
 * the record, so the module's summarise tools are available).
 */
@Component({
  selector: 'app-hse-ask-button',
  imports: [Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (!availability.unavailable()) {
      <app-button variant="secondary" size="sm" (click)="ask()">
        <app-icon name="spark" [size]="15" />
        {{ label() }}
      </app-button>
    }
  `,
})
export class HseAskButton {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);
  protected readonly availability = inject(AiAvailability);

  readonly labelKey = input.required<string>();
  readonly promptKey = input.required<string>();
  readonly params = input<Readonly<Record<string, unknown>>>({});

  protected readonly label = computed(() => this.language.translate(this.labelKey()));

  protected ask(): void {
    this.panel.askAbout(this.language.translate(this.promptKey(), this.params()));
  }
}
