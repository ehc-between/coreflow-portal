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
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { ModuleNavItem } from '../../shared/ui/module-nav/module-nav';
import { Breadcrumb } from '../../shared/ui/page-header/page-header';
import { AskPanelService } from '../ask/ask-panel.service';
import { PERM_MANAGE, PERM_RECORD, PERM_WRITE } from './data/environment.models';

/** The guidance / i18n scope and module key (`modules.names.environment`). */
export const ENV_SCOPE = 'environment';
export const ENV_MODULE = 'environment';

/** The standards whose requirements environment records usually document. */
export const ENV_FRAMEWORKS: readonly string[] = ['iso14001'];
/** Emergency preparedness also documents ISO 45001 8.2. */
export const ENV_PLAN_FRAMEWORKS: readonly string[] = ['iso14001', 'iso45001'];

const NAV: readonly ModuleNavItem[] = [
  { labelKey: 'environment.nav.overview', link: '/environment', exact: true },
  { labelKey: 'environment.nav.aspects', link: '/environment/aspects' },
  { labelKey: 'environment.nav.plans', link: '/environment/emergency-plans' },
  { labelKey: 'environment.nav.metrics', link: '/environment/metrics' },
  { labelKey: 'environment.nav.emissions', link: '/environment/emissions' },
];

/** The module's sub-pages (`app-module-nav` under every header); scoring needs manage. */
export function envNav(canManage: boolean): readonly ModuleNavItem[] {
  return canManage
    ? [...NAV, { labelKey: 'environment.nav.scoring', link: '/environment/scoring' }]
    : NAV;
}

/** The module root as the first breadcrumb (= nav label = module h1). */
export const ENV_ROOT_CRUMB: Breadcrumb = {
  labelKey: 'modules.names.environment',
  link: '/environment',
};

/** Breadcrumbs of the registers. */
export const ENV_CRUMBS = {
  aspects: { labelKey: 'environment.nav.aspects', link: '/environment/aspects' },
  plans: { labelKey: 'environment.nav.plans', link: '/environment/emergency-plans' },
  metrics: { labelKey: 'environment.nav.metrics', link: '/environment/metrics' },
  emissions: { labelKey: 'environment.nav.emissions', link: '/environment/emissions' },
  scoring: { labelKey: 'environment.nav.scoring', link: '/environment/scoring' },
} as const satisfies Record<string, Breadcrumb>;

/** The gear in every page header: the significance method (managers only). */
export const ENV_SETTINGS_LINK = '/environment/scoring';

export interface EnvPermissions {
  readonly write: Signal<boolean>;
  readonly manage: Signal<boolean>;
  readonly record: Signal<boolean>;
  /** Permission keys of other modules (create-from-here, overview cards). */
  readonly has: (key: string) => Signal<boolean>;
  readonly nav: Signal<readonly ModuleNavItem[]>;
  readonly settingsLink: Signal<string | null>;
}

/** Reactive environment permissions of the current user in the selected org. */
export function injectEnvPermissions(): EnvPermissions {
  const org = inject(SelectedOrgService);
  const has = (key: string) => computed(() => (org.currentOrg()?.permissions ?? []).includes(key));
  const manage = has(PERM_MANAGE);
  return {
    write: has(PERM_WRITE),
    manage,
    record: has(PERM_RECORD),
    has,
    nav: computed(() => envNav(manage())),
    settingsLink: computed(() => (manage() ? ENV_SETTINGS_LINK : null)),
  };
}

/**
 * One form field: the label with its "?" help right after it (never on a line of
 * its own), an optional required star, the control (projected), an optional
 * always-visible hint and the error line. Controls get the shared input styling.
 */
@Component({
  selector: 'app-env-field',
  imports: [TranslocoPipe, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: [
    `
      :host ::ng-deep input:not([type='checkbox']):not([type='radio']):not([data-bare]),
      :host ::ng-deep select:not([data-bare]),
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
      :host ::ng-deep select:not([data-bare]):focus,
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
      @if (legend()) {
        <span class="text-ui font-semibold text-fg-muted" [id]="inputId() + '-label'">
          {{ labelKey() | transloco: labelParams() }}
          @if (required()) {
            <span class="text-fail" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'environment.form.required' | transloco }}</span>
          }
        </span>
      } @else {
        <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
          {{ labelKey() | transloco: labelParams() }}
          @if (required()) {
            <span class="text-fail" aria-hidden="true">*</span>
            <span class="sr-only">{{ 'environment.form.required' | transloco }}</span>
          }
        </label>
      }
      @if (help()) {
        <app-field-help scope="environment" [page]="page()" [field]="help()!" />
      }
      <span class="ml-auto empty:hidden"><ng-content select="[label-extra]" /></span>
    </div>
    <ng-content />
    @if (hintKey()) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hintKey()! | transloco: hintParams() }}
      </p>
    }
    @if (errorKey()) {
      <p class="mt-1 text-meta font-semibold text-fail" role="alert" [id]="inputId() + '-error'">
        {{ errorKey()! | transloco }}
      </p>
    }
  `,
})
export class EnvField {
  readonly labelKey = input.required<string>();
  readonly labelParams = input<Record<string, unknown>>({});
  readonly inputId = input('');
  /** Guidance page (`pages.<page>.fields.<help>`) for the "?" toggletip. */
  readonly page = input('aspectForm');
  readonly help = input<string | null>(null);
  readonly hintKey = input<string | null>(null);
  readonly hintParams = input<Record<string, unknown>>({});
  readonly errorKey = input<string | null | undefined>(null);
  readonly required = input(false);
  /** The control is a group (radios, checkboxes, a picker): render the label as text. */
  readonly legend = input(false);
}

/**
 * A labelled "ask the assistant" button ("Spør om dette", "Forklar vurderingen"):
 * opens the assistant with the translated prompt about the current page (whose page
 * context names the record). Icon-only sparkles are kept for card corners only.
 */
@Component({
  selector: 'app-env-ask-button',
  imports: [Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (!availability.unavailable()) {
      <app-button variant="ghost" size="sm" (click)="ask()" [attr.data-testid]="testId()">
        <app-icon name="spark" [size]="14" />
        {{ label() }}
      </app-button>
    }
  `,
})
export class EnvAskButton {
  private readonly panel = inject(AskPanelService);
  private readonly language = inject(LanguageService);
  protected readonly availability = inject(AiAvailability);

  readonly labelKey = input('environment.ask.label');
  readonly promptKey = input.required<string>();
  readonly params = input<Readonly<Record<string, unknown>>>({});
  /** Confirmed requirement refs of the record (sharpens the answer). */
  readonly requirements = input<readonly string[]>([]);
  readonly testId = input('env-ask');

  protected readonly label = computed(() => this.language.translate(this.labelKey()));

  protected ask(): void {
    this.panel.askAbout(this.language.translate(this.promptKey(), this.params()), undefined, {
      requirements: this.requirements(),
    });
  }
}

/** `{value: id, label}` options of the org directory for one kind. */
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
  id: string | null | undefined,
): string | null {
  if (!id) {
    return null;
  }
  return directoryOptions(directory, 'department').find((o) => o.value === id)?.label ?? null;
}

/**
 * A native `<select>` of the org's people (`kind="user"`) or departments; '' = none.
 * A current value that is no longer in the directory (a former member) is kept as
 * an option with its stored name.
 */
@Component({
  selector: 'app-env-directory-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      [id]="inputId()"
      [attr.aria-describedby]="describedBy() || null"
      [attr.aria-label]="ariaLabel() || null"
      (change)="valueChange.emit($any($event.target).value)"
      [attr.data-testid]="testId() || null"
    >
      <option value="" [selected]="!value()">{{ noneKey() | transloco }}</option>
      @if (orphan(); as orphan) {
        <option [value]="orphan.value" selected>{{ orphan.label }}</option>
      }
      @for (o of options(); track o.value) {
        <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
      }
    </select>
  `,
})
export class EnvDirectorySelect {
  private readonly directory = inject(AssigneeOptionsService);

  readonly kind = input<'user' | 'department'>('user');
  readonly inputId = input('');
  readonly value = input('');
  readonly currentName = input<string | null>(null);
  readonly noneKey = input('environment.form.noOwner');
  readonly describedBy = input('');
  readonly ariaLabel = input('');
  readonly testId = input('');
  readonly valueChange = output<string>();

  protected readonly options = computed(() => directoryOptions(this.directory, this.kind()));

  protected readonly orphan = computed(() => {
    const value = this.value();
    if (!value || this.options().some((o) => o.value === value)) {
      return null;
    }
    return {
      value,
      label: this.currentName() || this.language.translate('environment.form.currentOwner'),
    };
  });

  private readonly language = inject(LanguageService);

  constructor() {
    this.directory.ensureLoaded();
  }
}

/** Styles of the list filters (`.cf-filter` selects, `.cf-more-label` in "Flere filtre"). */
export const ENV_FILTER_STYLES = `
  .cf-filter {
    height: 40px;
    max-width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 13px;
    font-weight: 400;
    padding: 0 10px;
    outline: none;
  }
  .cf-filter:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .cf-more-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--fg-muted);
  }
`;
