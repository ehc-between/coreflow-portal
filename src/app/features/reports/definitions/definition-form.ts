import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { ColumnPicker } from '../components/column-picker';
import { RegisterFilters, supportedFilters } from '../components/register-filters';
import { reportErrorKey } from '../data/report-errors';
import {
  clauseText,
  groupRegisters,
  labelOr,
  localized,
  moduleLabelKey,
} from '../data/report-display';
import {
  EXPORT_FORMATS,
  ExportFormat,
  REPORTS_MODULE,
  REPORT_LANGS,
  Register,
  ReportDefinition,
  ReportFilters,
  ReportLang,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

/** Form state of a saved report. */
export interface DefinitionDraft {
  readonly name: string;
  readonly description: string;
  readonly register_key: string;
  readonly filters: ReportFilters;
  readonly columns: readonly string[];
  readonly default_format: ExportFormat;
  readonly lang: ReportLang;
  readonly owner_user_id: string;
  readonly change_reason: string;
}

/** A draft prefilled from query params (the register explorer's "Save as report"). */
export function draftFromQuery(
  params: Readonly<Record<string, string | undefined>>,
  fallbackLang: ReportLang,
): DefinitionDraft {
  const list = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : []);
  const lang = (REPORT_LANGS as readonly string[]).includes(params['lang'] ?? '')
    ? (params['lang'] as ReportLang)
    : fallbackLang;
  return {
    name: '',
    description: '',
    register_key: params['register'] ?? '',
    filters: {
      q: params['q'] || null,
      status: list(params['status']),
      from: params['from'] || null,
      to: params['to'] || null,
      standard_key: params['standard_key'] || null,
    },
    columns: list(params['columns']),
    default_format: 'xlsx',
    lang,
    owner_user_id: '',
    change_reason: '',
  };
}

export function draftFromDefinition(d: ReportDefinition): DefinitionDraft {
  return {
    name: d.name,
    description: d.description ?? '',
    register_key: d.register_key,
    filters: { ...d.filters, status: [...(d.filters.status ?? [])] },
    columns: [...d.columns],
    default_format: d.default_format,
    lang: d.lang,
    owner_user_id: d.owner?.id ?? '',
    change_reason: '',
  };
}

/**
 * `/reports/custom/new` and `/reports/custom/:id/edit`: a saved
 * report — name, register, filters, columns, default format and language. On
 * edit the register is fixed; an owner change and a change reason are recorded
 * in the report's revision history. One column, 760 px wide, Save bottom right
 * (sticky on phones).
 */
@Component({
  selector: 'app-definition-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    WhyItMatters,
    Alert,
    Button,
    FormActions,
    FormSection,
    FormField,
    HelpStrip,
    LoadingState,
    PageHeader,
    ColumnPicker,
    RegisterFilters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'reports.form.editTitle' : 'reports.form.newTitle'"
        descriptionKey="reports.form.subtitle"
        [breadcrumbs]="crumbs()"
        [backLink]="id() ? ['/reports/custom', id()] : '/reports/custom'"
        backLabelKey="reports.definitions.back"
      />
      <app-help-strip scope="reports" page="definitionForm" />

      @if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else if (!ready()) {
        <app-loading-state [rows]="5" />
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-form-section
            [title]="'reports.form.sections.basics' | transloco"
            [description]="'reports.form.sections.basicsHint' | transloco"
          >
            <app-form-field
              span="full"
              [label]="'reports.form.name' | transloco"
              inputId="def-name"
              [required]="true"
              [error]="nameMissing() ? ('reports.form.nameRequired' | transloco) : ''"
            >
              <input
                id="def-name"
                type="text"
                maxlength="200"
                required
                [value]="draft().name"
                [placeholder]="'reports.form.namePlaceholder' | transloco"
                (input)="patch({ name: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field
              span="full"
              [label]="'reports.form.register' | transloco"
              inputId="def-register"
              [required]="true"
              [error]="registerMissing() ? ('reports.form.registerRequired' | transloco) : ''"
            >
              <app-field-help
                label-suffix
                scope="reports"
                page="definitionForm"
                field="register"
                [label]="'reports.form.register' | transloco"
              />
              <app-ask-about
                label-suffix
                field="register_key"
                [fieldLabel]="'reports.form.register' | transloco"
                [prompt]="'reports.form.askRegister' | transloco"
              />
              <select
                id="def-register"
                required
                [disabled]="!!id()"
                (change)="changeRegister($any($event.target).value)"
              >
                <option value="" [selected]="!draft().register_key">
                  {{ 'reports.form.chooseRegister' | transloco }}
                </option>
                @for (group of groups(); track group.module) {
                  <optgroup [label]="group.name">
                    @for (reg of group.registers; track reg.key) {
                      <option [value]="reg.key" [selected]="reg.key === draft().register_key">
                        {{ name(reg) }}
                      </option>
                    }
                  </optgroup>
                }
              </select>
              @if (clauses().length) {
                <p
                  hint
                  class="text-meta leading-snug text-fg-subtle"
                  data-testid="form-register-clauses"
                >
                  {{ 'reports.registers.evidenceFor' | transloco }}
                  <span class="text-fg-muted">{{ clauses().join(', ') }}</span>
                </p>
              }
            </app-form-field>
            <app-form-field
              span="full"
              [label]="'reports.form.description' | transloco"
              inputId="def-description"
            >
              <textarea
                id="def-description"
                rows="3"
                maxlength="5000"
                [value]="draft().description"
                [placeholder]="'reports.form.descriptionPlaceholder' | transloco"
                (input)="patch({ description: $any($event.target).value })"
              ></textarea>
            </app-form-field>
          </app-form-section>

          @if (register(); as reg) {
            <app-form-section
              [title]="'reports.form.filtersTitle' | transloco"
              [description]="'reports.form.sections.contentHint' | transloco"
            >
              <app-ask-about
                section-actions
                field="filters"
                [fieldLabel]="'reports.form.filtersTitle' | transloco"
                [prompt]="'reports.form.askFilters' | transloco: { register: name(reg) }"
              />
              <app-register-filters
                class="sm:col-span-2"
                [register]="reg"
                [value]="draft().filters"
                (valueChange)="patch({ filters: $event })"
              />
              @if (standardMissing()) {
                <p class="text-meta font-medium text-fail-ink sm:col-span-2" role="alert">
                  {{ 'reports.errors.standard_required' | transloco }}
                </p>
              }
              <app-column-picker
                class="sm:col-span-2"
                [columns]="reg.columns"
                [selected]="draft().columns"
                (selectedChange)="patch({ columns: $event })"
              />
            </app-form-section>
          }

          <app-form-section
            [title]="'reports.form.sections.output' | transloco"
            [description]="'reports.form.sections.outputHint' | transloco"
          >
            <app-form-field [label]="'reports.form.format' | transloco" inputId="def-format">
              <app-field-help
                label-suffix
                scope="reports"
                page="definitionForm"
                field="format"
                [label]="'reports.form.format' | transloco"
              />
              <select
                id="def-format"
                (change)="patch({ default_format: $any($event.target).value })"
              >
                @for (f of formats; track f) {
                  <option [value]="f" [selected]="f === draft().default_format">
                    {{ 'reports.formats.' + f | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field [label]="'reports.form.lang' | transloco" inputId="def-lang">
              <select id="def-lang" (change)="patch({ lang: $any($event.target).value })">
                @for (l of langs; track l) {
                  <option [value]="l" [selected]="l === draft().lang">
                    {{ 'reports.langs.' + l | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            @if (id() && members().length > 1) {
              <app-form-field [label]="'reports.form.owner' | transloco" inputId="def-owner">
                <select
                  id="def-owner"
                  (change)="patch({ owner_user_id: $any($event.target).value })"
                >
                  @if (!hasOwnerOption()) {
                    <option [value]="draft().owner_user_id" selected>
                      {{ original()?.owner?.name || ('reports.detail.unknownUser' | transloco) }}
                    </option>
                  }
                  @for (m of members(); track m.id) {
                    <option [value]="m.id" [selected]="m.id === draft().owner_user_id">
                      {{ m.name }}
                    </option>
                  }
                </select>
              </app-form-field>
            }
          </app-form-section>

          @if (id()) {
            <app-form-section [columns]="1">
              <app-form-field
                [label]="'reports.form.changeReason' | transloco"
                inputId="def-reason"
              >
                <app-field-help
                  label-suffix
                  scope="reports"
                  page="definitionForm"
                  field="changeReason"
                  [label]="'reports.form.changeReason' | transloco"
                />
                <input
                  id="def-reason"
                  type="text"
                  maxlength="500"
                  [value]="draft().change_reason"
                  (input)="patch({ change_reason: $any($event.target).value })"
                  [placeholder]="'reports.form.changeReasonPlaceholder' | transloco"
                />
              </app-form-field>
            </app-form-section>
          }

          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          <app-form-actions
            [message]="
              nameMissing() || registerMissing() || standardMissing()
                ? ('reports.form.fixErrors' | transloco)
                : ''
            "
          >
            <app-button variant="secondary" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">
              {{ (id() ? 'reports.form.saveChanges' : 'reports.form.create') | transloco }}
            </app-button>
          </app-form-actions>
        </form>
      }

      <app-why-it-matters class="mt-6 block" scope="reports" page="definitionForm" />
    </div>
  `,
})
export class DefinitionForm {
  private readonly api = inject(ReportsApi);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  /** Route param on edit (component input binding). */
  readonly id = input<string | undefined>(undefined);

  protected readonly formats = EXPORT_FORMATS;
  protected readonly langs = REPORT_LANGS;

  protected readonly registers = signal<readonly Register[]>([]);
  protected readonly groups = computed(() =>
    groupRegisters(this.registers(), (m) =>
      labelOr((k) => this.language.translate(k), moduleLabelKey(m), m),
    ),
  );
  /** People the owner can be handed to (the org's user options). */
  protected readonly members = computed(() =>
    this.assignees
      .options()
      .users.map((u) => ({ id: u.value.replace(/^user:/, ''), name: u.label })),
  );
  protected readonly original = signal<ReportDefinition | null>(null);
  protected readonly draft = signal<DefinitionDraft>(draftFromQuery({}, this.uiLang()));
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  private readonly registersLoaded = signal(false);

  protected readonly ready = computed(
    () => this.registersLoaded() && (!this.id() || this.original() !== null),
  );

  protected readonly register = computed(
    () => this.registers().find((r) => r.key === this.draft().register_key) ?? null,
  );

  protected readonly nameMissing = computed(() => this.submitted() && !this.draft().name.trim());
  protected readonly registerMissing = computed(
    () => this.submitted() && !this.draft().register_key,
  );
  protected readonly standardMissing = computed(
    () =>
      this.submitted() &&
      !!this.register()?.requires_standard &&
      !this.draft().filters.standard_key,
  );

  protected readonly clauses = computed(() => {
    const lang = this.language.active();
    return (this.register()?.clauses ?? []).map((c) => clauseText(c, lang));
  });

  protected readonly crumbs = computed<readonly Breadcrumb[]>(() => {
    const base: Breadcrumb[] = [
      { labelKey: 'reports.hub.title', link: '/reports' },
      { labelKey: 'reports.nav.definitions', link: '/reports/custom' },
    ];
    const id = this.id();
    const original = this.original();
    if (id && original) {
      base.push({ label: original.name, link: ['/reports/custom', id] });
    }
    base.push({ labelKey: id ? 'reports.form.editTitle' : 'reports.form.newTitle' });
    return base;
  });

  protected readonly hasOwnerOption = computed(() =>
    this.members().some((m) => m.id === this.draft().owner_user_id),
  );

  private subs = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'report_definition',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.draft().name ||
        this.language.translate(this.id() ? 'reports.form.editTitle' : 'reports.form.newTitle'),
      requirements: this.register()?.clauses?.map((c) => c.ref) ?? null,
    }));
    inject(DestroyRef).onDestroy(() => this.subs.unsubscribe());

    const params = this.route.snapshot.queryParamMap;
    const query: Record<string, string | undefined> = {};
    for (const key of params.keys) {
      query[key] = params.get(key) ?? undefined;
    }
    this.draft.set(draftFromQuery(query, this.uiLang()));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id ?? null));
    });
  }

  protected name(reg: Register): string {
    return localized(reg.label, this.language.active(), reg.key);
  }

  protected patch(change: Partial<DefinitionDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected changeRegister(key: string): void {
    this.patch({ register_key: key, filters: {}, columns: [] });
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/reports/custom', id] : ['/reports/custom']);
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    const reg = this.register();
    if (!orgId || !d.name.trim() || !reg || this.saving()) {
      return;
    }
    const filters = supportedFilters(reg, d.filters);
    if (reg.requires_standard && !filters.standard_key) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const id = this.id();
    const request$ = id
      ? this.api.updateDefinition(orgId, id, {
          name: d.name.trim(),
          description: d.description.trim() || null,
          filters,
          columns: d.columns,
          default_format: d.default_format,
          lang: d.lang,
          ...(d.owner_user_id && d.owner_user_id !== this.original()?.owner?.id
            ? { owner_user_id: d.owner_user_id }
            : {}),
          change_reason: d.change_reason.trim() || null,
        })
      : this.api.createDefinition(orgId, {
          name: d.name.trim(),
          description: d.description.trim() || null,
          register_key: d.register_key,
          filters,
          columns: d.columns,
          default_format: d.default_format,
          lang: d.lang,
        });
    this.subs.add(
      request$.subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.notifications.success(id ? 'reports.form.saved' : 'reports.form.created');
          void this.router.navigate(['/reports/custom', saved.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(reportErrorKey(error));
        },
      }),
    );
  }

  private uiLang(): ReportLang {
    const lang = this.language.active();
    return (REPORT_LANGS as readonly string[]).includes(lang) ? (lang as ReportLang) : 'en';
  }

  private load(orgId: string | null, id: string | null): void {
    if (!orgId) {
      return;
    }
    this.subs.add(
      this.api.registers(orgId).subscribe({
        next: (list) => {
          this.registers.set(list.items);
          this.registersLoaded.set(true);
        },
        error: (error: unknown) => this.loadError.set(reportErrorKey(error)),
      }),
    );
    if (!id) {
      return;
    }
    this.subs.add(
      this.api.getDefinition(orgId, id).subscribe({
        next: (definition) => {
          this.original.set(definition);
          this.draft.set(draftFromDefinition(definition));
          if (!definition.can_edit) {
            this.loadError.set('reports.errors.forbidden');
          }
        },
        error: (error: unknown) => this.loadError.set(reportErrorKey(error)),
      }),
    );
    this.assignees.ensureLoaded();
  }
}
