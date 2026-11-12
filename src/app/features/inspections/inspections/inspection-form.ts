import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RefSelect } from '../components/ref-select';
import { dateInputToIso, isoToDateInput } from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences, NamedRef } from '../data/inspection-references';
import {
  INSPECTIONS_MODULE,
  INSPECTION_ENTITY_TYPE,
  InspectionDetail,
  InspectionFields,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

export interface InspectionForm {
  readonly templateId: string;
  readonly title: string;
  readonly location: string;
  readonly notes: string;
  readonly inspectorId: string;
  readonly ownerId: string;
  readonly departmentId: string;
  readonly dueDate: string;
  readonly changeReason: string;
}

export const EMPTY_INSPECTION_FORM: InspectionForm = {
  templateId: '',
  title: '',
  location: '',
  notes: '',
  inspectorId: '',
  ownerId: '',
  departmentId: '',
  dueDate: '',
  changeReason: '',
};

export function formFromInspection(i: InspectionDetail): InspectionForm {
  return {
    templateId: i.template?.id ?? '',
    title: i.title,
    location: i.location ?? '',
    notes: i.notes ?? '',
    inspectorId: i.inspector?.id ?? '',
    ownerId: i.owner?.id ?? '',
    departmentId: i.department_id ?? '',
    dueDate: isoToDateInput(i.due_at),
    changeReason: '',
  };
}

export function toInspectionFields(f: InspectionForm): InspectionFields {
  return {
    title: f.title.trim() || null,
    location: f.location.trim() || null,
    notes: f.notes.trim() || null,
    inspector_user_id: f.inspectorId || null,
    owner_user_id: f.ownerId || null,
    department_id: f.departmentId || null,
    due_at: dateInputToIso(f.dueDate),
  };
}

/**
 * Plan an inspection (`/inspections/new`, optionally `?template=<id>`) or change a
 * planned one (`/inspections/:id/edit`): the checklist template (active ones only, and
 * only when planning), title (defaults to the template's), location, inspector,
 * owner, department, due date and notes. The questions are copied from the template
 * when the inspection is created, so later template edits never change it.
 */
@Component({
  selector: 'app-inspection-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    RefSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[820px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/inspections', id()] : '/inspections'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'inspections.detail.back' : 'inspections.list.back') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'inspections.form.editTitle' : 'inspections.form.newTitle') | transloco }}
      </h1>
      <app-guide-intro class="mb-4 block" scope="inspections" page="form" />

      @if (closed()) {
        <app-alert tone="error">{{ 'inspections.errors.inspection_closed' | transloco }}</app-alert>
      } @else if (id() && !original()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <form (submit)="$event.preventDefault(); save()">
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                @if (id()) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'inspections.fields.template' | transloco }}:
                    <span class="font-semibold text-fg">{{ original()?.template?.title }}</span>
                    ({{
                      'inspections.templates.version'
                        | transloco: { version: original()?.template?.version }
                    }})
                  </p>
                } @else {
                  <app-form-field
                    [label]="'inspections.fields.template' | transloco"
                    inputId="if-template"
                  >
                    <app-ref-select
                      inputId="if-template"
                      [options]="templateOptions()"
                      [value]="form().templateId"
                      [noneLabel]="'inspections.form.chooseTemplate' | transloco"
                      testId="template-select"
                      (valueChange)="set('templateId', $event)"
                    />
                  </app-form-field>
                  <app-field-help scope="inspections" page="form" field="template" />
                  @if (templatesLoaded() && templateOptions().length === 0) {
                    <app-alert tone="info" class="mt-2 block">
                      {{ 'inspections.form.noTemplates' | transloco }}
                      <a routerLink="/inspections/templates" class="font-semibold text-accent">
                        {{ 'inspections.list.browseTemplates' | transloco }}
                      </a>
                    </app-alert>
                  }
                }
              </div>
              <div class="sm:col-span-2">
                <app-form-field [label]="'inspections.fields.title' | transloco" inputId="if-title">
                  <input
                    id="if-title"
                    maxlength="255"
                    [value]="form().title"
                    [placeholder]="selectedTemplateTitle() ?? ''"
                    (input)="set('title', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'inspections.fields.location' | transloco"
                  inputId="if-location"
                >
                  <input
                    id="if-location"
                    maxlength="255"
                    [value]="form().location"
                    (input)="set('location', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="inspections" page="form" field="location" />
              </div>
              <div>
                <app-form-field [label]="'inspections.fields.dueAt' | transloco" inputId="if-due">
                  <input
                    id="if-due"
                    type="date"
                    [value]="form().dueDate"
                    (input)="set('dueDate', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'inspections.fields.inspector' | transloco"
                  inputId="if-inspector"
                >
                  <app-ref-select
                    inputId="if-inspector"
                    [options]="users()"
                    [value]="form().inspectorId"
                    [noneLabel]="'inspections.form.anyInspector' | transloco"
                    [currentName]="original()?.inspector?.name ?? null"
                    testId="inspector-select"
                    (valueChange)="set('inspectorId', $event)"
                  />
                </app-form-field>
                <app-field-help scope="inspections" page="form" field="inspector" />
              </div>
              <div>
                <app-form-field [label]="'inspections.fields.owner' | transloco" inputId="if-owner">
                  <app-ref-select
                    inputId="if-owner"
                    [options]="users()"
                    [value]="form().ownerId"
                    [noneLabel]="'inspections.form.noOwner' | transloco"
                    [currentName]="original()?.owner?.name ?? null"
                    (valueChange)="set('ownerId', $event)"
                  />
                </app-form-field>
                <app-field-help scope="inspections" page="form" field="owner" />
              </div>
              <div>
                <app-form-field
                  [label]="'inspections.fields.department' | transloco"
                  inputId="if-department"
                >
                  <app-ref-select
                    inputId="if-department"
                    [options]="departments()"
                    [value]="form().departmentId"
                    [noneLabel]="'inspections.form.noDepartment' | transloco"
                    (valueChange)="set('departmentId', $event)"
                  />
                </app-form-field>
              </div>
              <div class="sm:col-span-2">
                <app-form-field [label]="'inspections.fields.notes' | transloco" inputId="if-notes">
                  <textarea
                    id="if-notes"
                    rows="3"
                    maxlength="20000"
                    [value]="form().notes"
                    (input)="set('notes', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
              @if (id()) {
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'inspections.fields.changeReason' | transloco"
                    inputId="if-reason"
                  >
                    <input
                      id="if-reason"
                      maxlength="2000"
                      [value]="form().changeReason"
                      (input)="set('changeReason', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
              }
            </div>
          </app-card>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <a [routerLink]="id() ? ['/inspections', id()] : '/inspections'">
              <app-button variant="ghost">{{
                'inspections.actions.cancel' | transloco
              }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="!id() && !form().templateId"
              data-testid="save-inspection"
            >
              {{ (id() ? 'inspections.actions.save' : 'inspections.form.plan') | transloco }}
            </app-button>
          </div>
        </form>
      }
      <app-why-it-matters class="mt-6 block" scope="inspections" page="form" />
    </div>
  `,
})
export class InspectionFormPage {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);
  private readonly auth = inject(AuthService);

  /** Route param on `:id/edit`. */
  readonly id = input<string | undefined>(undefined);
  /** `?template=<id>` preselects a template when planning. */
  readonly template = input<string | undefined>(undefined);

  protected readonly original = signal<InspectionDetail | null>(null);
  protected readonly form = signal<InspectionForm>(EMPTY_INSPECTION_FORM);
  protected readonly saving = signal(false);

  protected readonly users = this.references.users;
  protected readonly departments = this.references.departments;

  protected readonly templatesLoaded = this.references.templatesLoaded;

  protected readonly templateOptions = computed<NamedRef[]>(() =>
    this.references.activeTemplates().map((t) => ({ id: t.id, name: `${t.code} · ${t.title}` })),
  );

  protected readonly selectedTemplateTitle = computed(() => {
    const id = this.form().templateId;
    return this.references.activeTemplates().find((t) => t.id === id)?.title ?? null;
  });

  protected readonly closed = computed(() => {
    const status = this.original()?.status;
    return status === 'completed' || status === 'cancelled';
  });

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: INSPECTION_ENTITY_TYPE,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
    }));

    this.references.ensurePeople();
    this.references.ensureTemplates(true);

    effect(() => {
      const preset = this.template();
      if (preset && !this.id()) {
        untracked(() => this.set('templateId', preset));
      }
    });

    effect(() => {
      const me = this.auth.user();
      if (me && !this.id()) {
        untracked(() => {
          if (!this.form().inspectorId) {
            this.set('inspectorId', me.id);
          }
        });
      }
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.get(orgId, id).subscribe({
            next: (i) => {
              this.original.set(i);
              this.form.set(formFromInspection(i));
            },
            error: (e: unknown) => this.notifications.error(inspectionErrorKey(e)),
          }),
        );
      }
    });
  }

  protected set<K extends keyof InspectionForm>(key: K, value: InspectionForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.form();
    if (!orgId || this.saving() || (!this.id() && !f.templateId)) {
      return;
    }
    const fields = toInspectionFields(f);
    const original = this.original();
    this.saving.set(true);
    const call = original
      ? this.api.update(orgId, original.id, {
          ...fields,
          title: fields.title ?? original.title,
          change_reason: f.changeReason.trim() || null,
        })
      : this.api.create(orgId, { ...fields, template_id: f.templateId });
    call.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.notifications.success(
          original ? 'inspections.notices.saved' : 'inspections.notices.planned',
          { code: saved.code },
        );
        void this.router.navigate(['/inspections', saved.id]);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
