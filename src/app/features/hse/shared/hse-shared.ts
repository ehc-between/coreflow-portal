import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../../shared/ui/page-header/page-header';
import { AskPanelService } from '../../ask/ask-panel.service';

/** The guidance / i18n scope of the module (portal path `hse`). */
export const HSE_SCOPE = 'hse';
/** The module key (permission prefix, page-context module, `modules.names.hse`). */
export const HSE_MODULE = 'hse';

/** The module's sub-pages, shown as `app-module-nav` directly under every page header. */
export const HSE_NAV: readonly ModuleNavItem[] = [
  { labelKey: 'hse.nav.overview', link: '/hse', exact: true },
  { labelKey: 'hse.nav.sja', link: '/hse/sja' },
  { labelKey: 'hse.nav.ppe', link: '/hse/ppe' },
  { labelKey: 'hse.nav.consultations', link: '/hse/consultations' },
  { labelKey: 'hse.nav.safetyRounds', link: '/hse/safety-rounds' },
];

/** The module root as the first breadcrumb (= nav label = module h1). */
export const HSE_ROOT_CRUMB: Breadcrumb = { labelKey: 'modules.names.hse', link: '/hse' };

/** Breadcrumbs of a list page and its records. */
export const HSE_CRUMBS = {
  sja: { labelKey: 'hse.nav.sja', link: '/hse/sja' },
  ppe: { labelKey: 'hse.nav.ppe', link: '/hse/ppe' },
  consultations: { labelKey: 'hse.nav.consultations', link: '/hse/consultations' },
  safetyRounds: { labelKey: 'hse.nav.safetyRounds', link: '/hse/safety-rounds' },
} as const satisfies Record<string, Breadcrumb>;

export interface HsePermissions {
  readonly read: Signal<boolean>;
  readonly write: Signal<boolean>;
  readonly manage: Signal<boolean>;
  readonly approve: Signal<boolean>;
  /** Permission keys of other modules HSE links to (create-from-here, overview cards). */
  readonly has: (key: string) => Signal<boolean>;
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
    has,
  };
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
      [attr.aria-label]="ariaLabel() || null"
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
  readonly ariaLabel = input('');
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
 * One HSE form field, on the shared form anatomy (`app-form-field`): the label row
 * with its "?" help, the control (projected), a one-line hint and an error line.
 * Hints live in their own keys (`…Hint`) so read-only labels never carry them.
 */
@Component({
  selector: 'app-hse-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <app-form-field
      [label]="labelKey() | transloco"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hintKey() ? (hintKey()! | transloco) : ''"
      [error]="errorKey() ? (errorKey()! | transloco) : ''"
    >
      @if (help()) {
        <app-field-help
          label-suffix
          scope="hse"
          [page]="page()"
          [field]="help()!"
          [label]="labelKey() | transloco"
        />
      }
      <span label-suffix class="ml-auto inline-flex h-6 items-center empty:hidden"
        ><ng-content select="[label-extra]"
      /></span>
      <ng-content />
    </app-form-field>
  `,
})
export class HseField {
  readonly labelKey = input.required<string>();
  readonly inputId = input('');
  /** Guidance page (`pages.<page>.fields.<help>`) for the "?" toggletip. */
  readonly page = input('sja-edit');
  readonly help = input<string | null>(null);
  /** Always-visible one-line hint (e.g. "One per line", "Pick members; add others by name"). */
  readonly hintKey = input<string | null>(null);
  /** Shown in red under the control (validation). */
  readonly errorKey = input<string | null>(null);
  readonly required = input(false);
  /** `full` spans both columns of an `app-form-section` grid (textareas, pickers). */
  readonly span = input<'half' | 'full'>('half');
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
      <app-button variant="ghost" size="sm" (click)="ask()">
        <app-icon name="spark" [size]="14" />
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
  /** Confirmed requirement refs of the record (sharpens the answer). */
  readonly requirements = input<readonly string[]>([]);

  protected readonly label = computed(() => this.language.translate(this.labelKey()));

  protected ask(): void {
    this.panel.askAbout(this.language.translate(this.promptKey(), this.params()), undefined, {
      requirements: this.requirements(),
    });
  }
}
