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
 * One HSE form field: the label with its "?" help right next to it, the control
 * (projected), an always-visible one-line hint underneath and an error line.
 * Hints live in their own keys (`…Hint`) so read-only labels never carry them.
 */
@Component({
  selector: 'app-hse-field',
  imports: [TranslocoPipe, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: [
    `
      :host ::ng-deep input:not([type='checkbox']):not([type='radio']):not([data-bare]),
      :host ::ng-deep select,
      :host ::ng-deep textarea {
        width: 100%;
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      :host ::ng-deep textarea {
        padding: 10px 12px;
      }
      :host ::ng-deep input:not([data-bare]):focus,
      :host ::ng-deep select:focus,
      :host ::ng-deep textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
      :host ::ng-deep [aria-invalid='true'] {
        border-color: var(--fail);
      }
    `,
  ],
  template: `
    <div class="mb-1.5 flex min-h-6 flex-wrap items-center gap-1.5">
      <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (required()) {
          <span class="text-fail" aria-hidden="true">*</span>
          <span class="sr-only">{{ 'hse.common.required' | transloco }}</span>
        }
      </label>
      @if (help()) {
        <app-field-help scope="hse" [page]="page()" [field]="help()!" />
      }
      <span class="ml-auto empty:hidden"><ng-content select="[label-extra]" /></span>
    </div>
    <ng-content />
    @if (hintKey()) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hintKey()! | transloco }}
      </p>
    }
    @if (errorKey()) {
      <p class="mt-1 text-meta font-semibold text-fail" role="alert" [id]="inputId() + '-error'">
        {{ errorKey()! | transloco }}
      </p>
    }
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
