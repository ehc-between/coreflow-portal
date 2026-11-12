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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ColumnPicker } from '../components/column-picker';
import { RegisterFilters, supportedFilters } from '../components/register-filters';
import { reportErrorKey } from '../data/report-errors';
import { localized } from '../data/report-display';
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
 * `/reports/definitions/new` and `/reports/definitions/:id/edit`: a saved
 * report — name, register, filters, columns, default format and language. On
 * edit the register is fixed; an owner change and a change reason are recorded
 * in the report's revision history.
 */
@Component({
  selector: 'app-definition-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    ColumnPicker,
    RegisterFilters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/reports/definitions', id()] : '/reports/definitions'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'reports.form.back' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg">
        {{ (id() ? 'reports.form.editTitle' : 'reports.form.newTitle') | transloco }}
      </h1>

      <app-guide-intro class="mb-4 block" scope="reports" page="definitionForm" />

      @if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else if (!ready()) {
        <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
          {{ 'reports.common.loading' | transloco }}
        </p>
      } @else {
        <form (submit)="$event.preventDefault(); save()" novalidate>
          <app-card class="mb-4 block">
            <div class="flex flex-col gap-4">
              <app-form-field [label]="'reports.form.name' | transloco" inputId="def-name">
                <input
                  id="def-name"
                  type="text"
                  maxlength="200"
                  required
                  [attr.aria-invalid]="submitted() && !draft().name.trim()"
                  [value]="draft().name"
                  (input)="patch({ name: $any($event.target).value })"
                />
              </app-form-field>
              @if (submitted() && !draft().name.trim()) {
                <p class="-mt-3 text-[12px] text-fail" role="alert">
                  {{ 'reports.form.nameRequired' | transloco }}
                </p>
              }
              <app-form-field
                [label]="'reports.form.description' | transloco"
                inputId="def-description"
              >
                <textarea
                  id="def-description"
                  rows="3"
                  maxlength="5000"
                  [value]="draft().description"
                  (input)="patch({ description: $any($event.target).value })"
                ></textarea>
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'reports.form.register' | transloco"
                  inputId="def-register"
                >
                  <select
                    id="def-register"
                    required
                    [disabled]="!!id()"
                    (change)="changeRegister($any($event.target).value)"
                  >
                    <option value="" [selected]="!draft().register_key">
                      {{ 'reports.form.chooseRegister' | transloco }}
                    </option>
                    @for (reg of registers(); track reg.key) {
                      <option [value]="reg.key" [selected]="reg.key === draft().register_key">
                        {{ name(reg) }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help
                  class="mt-1 block"
                  scope="reports"
                  page="definitionForm"
                  field="register"
                />
                @if (submitted() && !draft().register_key) {
                  <p class="mt-1 text-[12px] text-fail" role="alert">
                    {{ 'reports.form.registerRequired' | transloco }}
                  </p>
                }
              </div>
            </div>
          </app-card>

          @if (register(); as reg) {
            <app-card class="mb-4 block">
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-[14px] font-semibold text-fg">
                  {{ 'reports.form.filtersTitle' | transloco }}
                </h2>
                <app-ask-about
                  field="filters"
                  [prompt]="'reports.form.askFilters' | transloco: { register: name(reg) }"
                />
              </div>
              <app-register-filters
                [register]="reg"
                [value]="draft().filters"
                (valueChange)="patch({ filters: $event })"
              />
              @if (submitted() && reg.requires_standard && !draft().filters.standard_key) {
                <p class="mt-1 text-[12px] text-fail" role="alert">
                  {{ 'reports.errors.standard_required' | transloco }}
                </p>
              }
              <app-column-picker
                class="mt-4"
                [columns]="reg.columns"
                [selected]="draft().columns"
                (selectedChange)="patch({ columns: $event })"
              />
            </app-card>
          }

          <app-card class="mb-4 block">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-form-field [label]="'reports.form.format' | transloco" inputId="def-format">
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
                <app-field-help
                  class="mt-1 block"
                  scope="reports"
                  page="definitionForm"
                  field="format"
                />
              </div>
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
                        {{ original()?.owner?.name || draft().owner_user_id }}
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
            </div>
            @if (id()) {
              <div class="mt-4">
                <app-form-field
                  [label]="'reports.form.changeReason' | transloco"
                  inputId="def-reason"
                >
                  <input
                    id="def-reason"
                    type="text"
                    maxlength="500"
                    [value]="draft().change_reason"
                    (input)="patch({ change_reason: $any($event.target).value })"
                    [placeholder]="'reports.form.changeReasonPlaceholder' | transloco"
                  />
                </app-form-field>
                <app-field-help
                  class="mt-1 block"
                  scope="reports"
                  page="definitionForm"
                  field="changeReason"
                />
              </div>
            }
          </app-card>

          @if (saveError(); as key) {
            <app-alert class="mb-3 block">{{ key | transloco }}</app-alert>
          }

          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" (click)="cancel()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">
              {{ (id() ? 'reports.form.saveChanges' : 'reports.form.create') | transloco }}
            </app-button>
          </div>
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
      title: this.draft().name || null,
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
    void this.router.navigate(id ? ['/reports/definitions', id] : ['/reports/definitions']);
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
          void this.router.navigate(['/reports/definitions', saved.id]);
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
