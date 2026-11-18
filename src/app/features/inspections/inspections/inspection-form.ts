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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { InspectionField } from '../components/inspection-field';
import { RefSelect } from '../components/ref-select';
import { NO_SUBJECT, SubjectPicker, SubjectValue } from '../components/subject-picker';
import {
  INSPECTIONS_SETTINGS_LINK,
  dateInputToIso,
  isoToDateInput,
} from '../data/inspection-display';
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
  readonly subject: SubjectValue;
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
  subject: NO_SUBJECT,
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
    subject: {
      type: i.subject_type ?? null,
      id: i.subject_id ?? null,
      title: i.subject ? [i.subject.code, i.subject.title].filter(Boolean).join(' ') : null,
    },
  };
}

export function toInspectionFields(f: InspectionForm): InspectionFields {
  const subject = f.subject.type && f.subject.id ? f.subject : null;
  return {
    title: f.title.trim() || null,
    location: f.location.trim() || null,
    notes: f.notes.trim() || null,
    inspector_user_id: f.inspectorId || null,
    owner_user_id: f.ownerId || null,
    department_id: f.departmentId || null,
    due_at: dateInputToIso(f.dueDate),
    subject_type: subject?.type ?? null,
    subject_id: subject?.id ?? null,
  };
}

/** The title the server gives an untitled inspection: "Checklist – Location". */
export function defaultTitle(templateTitle: string | null, location: string): string {
  const place = location.trim();
  return templateTitle ? (place ? `${templateTitle} – ${place}` : templateTitle) : '';
}

/**
 * Plan an inspection (`/inspections/new`, optionally `?template=<id>`) or change a
 * planned one (`/inspections/:id/edit`): the checklist (active ones only, chosen when
 * planning), what it checks (an optional asset, process, supplier or risk), place,
 * due date, the inspector who does it and the owner who follows up, department and
 * notes. The title defaults to "Checklist – Place". The questions are copied from the
 * checklist when the inspection is created, so later edits never change it.
 */
@Component({
  selector: 'app-inspection-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    WhyItMatters,
    Alert,
    Button,
    Card,
    EmptyState,
    HelpStrip,
    LoadingState,
    PageHeader,
    InspectionField,
    RefSelect,
    SubjectPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'inspections.form.editTitle' : 'inspections.form.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink"
      />
      <app-help-strip scope="inspections" page="form" lesson="inspection-basics" />

      @if (closed()) {
        <app-alert tone="info">{{ 'inspections.errors.inspection_closed' | transloco }}</app-alert>
      } @else if (id() && !original()) {
        @if (loadFailed()) {
          <app-empty-state
            icon="search"
            titleKey="inspections.detail.notFoundTitle"
            bodyKey="inspections.detail.notFound"
            ctaKey="inspections.list.back"
            ctaLink="/inspections"
          />
        } @else {
          <app-loading-state [rows]="4" />
        }
      } @else {
        <form (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <div class="flex flex-col gap-5">
              @if (id()) {
                <p class="text-ui text-fg-muted">
                  {{ 'inspections.fields.template' | transloco }}:
                  <span class="font-semibold text-fg">{{ original()?.template?.title }}</span>
                  ({{
                    'inspections.templates.versionShort'
                      | transloco: { version: original()?.template?.version }
                  }})
                </p>
              } @else {
                <div>
                  <app-inspection-field
                    labelKey="inspections.fields.template"
                    inputId="if-template"
                    help="template"
                  >
                    <app-ref-select
                      inputId="if-template"
                      [options]="templateOptions()"
                      [value]="form().templateId"
                      [noneLabel]="'inspections.form.chooseTemplate' | transloco"
                      testId="template-select"
                      [describedBy]="templateError() ? 'if-template-error' : ''"
                      (valueChange)="set('templateId', $event)"
                    />
                  </app-inspection-field>
                  @if (templateError()) {
                    <p id="if-template-error" class="mt-1 text-meta text-fail" role="alert">
                      {{ 'inspections.errors.template_required' | transloco }}
                    </p>
                  }
                  @if (templatesLoaded() && templateOptions().length === 0) {
                    <app-alert tone="info" class="mt-2 block">
                      {{ 'inspections.form.noTemplates' | transloco }}
                      <a
                        routerLink="/settings/modules/inspections/templates/library"
                        class="font-semibold text-accent"
                      >
                        {{ 'inspections.list.browseTemplates' | transloco }}
                      </a>
                    </app-alert>
                  }
                </div>
              }
              <app-inspection-field
                labelKey="inspections.subject.label"
                inputId="if-subject"
                help="subject"
                [optional]="true"
                hintKey="inspections.subject.hint"
              >
                <app-subject-picker
                  inputId="if-subject"
                  [value]="form().subject"
                  (valueChange)="set('subject', $event)"
                />
              </app-inspection-field>
              <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <app-inspection-field
                  labelKey="inspections.fields.location"
                  inputId="if-location"
                  help="location"
                  [optional]="true"
                >
                  <input
                    id="if-location"
                    maxlength="255"
                    [value]="form().location"
                    (input)="set('location', $any($event.target).value)"
                  />
                </app-inspection-field>
                <app-inspection-field labelKey="inspections.fields.dueAt" inputId="if-due">
                  <input
                    id="if-due"
                    type="date"
                    [value]="form().dueDate"
                    (input)="set('dueDate', $any($event.target).value)"
                  />
                </app-inspection-field>
              </div>
              <app-inspection-field
                labelKey="inspections.fields.title"
                inputId="if-title"
                [optional]="!id()"
                [hintKey]="id() ? null : 'inspections.form.titleHint'"
              >
                <input
                  id="if-title"
                  maxlength="255"
                  [value]="form().title"
                  [placeholder]="suggestedTitle()"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-inspection-field>
              <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <app-inspection-field
                  labelKey="inspections.fields.inspector"
                  inputId="if-inspector"
                  help="inspector"
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
                </app-inspection-field>
                <app-inspection-field
                  labelKey="inspections.fields.owner"
                  inputId="if-owner"
                  help="owner"
                >
                  <app-ref-select
                    inputId="if-owner"
                    [options]="users()"
                    [value]="form().ownerId"
                    [noneLabel]="'inspections.form.noOwner' | transloco"
                    [currentName]="original()?.owner?.name ?? null"
                    (valueChange)="set('ownerId', $event)"
                  />
                </app-inspection-field>
              </div>
              <p class="-mt-3 text-meta text-fg-muted">
                {{ 'inspections.form.rolesHint' | transloco }}
              </p>
              <app-inspection-field
                labelKey="inspections.fields.department"
                inputId="if-department"
                [optional]="true"
              >
                <app-ref-select
                  inputId="if-department"
                  [options]="departments()"
                  [value]="form().departmentId"
                  [noneLabel]="'inspections.form.noDepartment' | transloco"
                  (valueChange)="set('departmentId', $event)"
                />
              </app-inspection-field>
              <app-inspection-field
                labelKey="inspections.fields.notes"
                inputId="if-notes"
                [optional]="true"
              >
                <app-ask-about
                  label-extra
                  [prompt]="'inspections.form.askPlan' | transloco"
                  field="notes"
                />
                <textarea
                  id="if-notes"
                  rows="3"
                  maxlength="20000"
                  [value]="form().notes"
                  (input)="set('notes', $any($event.target).value)"
                ></textarea>
              </app-inspection-field>
              @if (id()) {
                <app-inspection-field
                  labelKey="inspections.fields.changeReason"
                  inputId="if-reason"
                  [optional]="true"
                >
                  <input
                    id="if-reason"
                    maxlength="2000"
                    [value]="form().changeReason"
                    (input)="set('changeReason', $any($event.target).value)"
                  />
                </app-inspection-field>
              }
            </div>
          </app-card>
          <div
            class="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0"
          >
            <a [routerLink]="id() ? ['/inspections', id()] : '/inspections'">
              <app-button variant="secondary">{{
                'inspections.actions.cancel' | transloco
              }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" data-testid="save-inspection">
              {{ (id() ? 'inspections.actions.save' : 'inspections.form.plan') | transloco }}
            </app-button>
          </div>
        </form>
      }
      <div class="mt-8"><app-why-it-matters scope="inspections" page="form" /></div>
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
  private readonly language = inject(LanguageService);

  /** Route param on `:id/edit`. */
  readonly id = input<string | undefined>(undefined);
  /** `?template=<id>` preselects a template when planning. */
  readonly template = input<string | undefined>(undefined);

  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly original = signal<InspectionDetail | null>(null);
  protected readonly form = signal<InspectionForm>(EMPTY_INSPECTION_FORM);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly users = this.references.users;
  protected readonly departments = this.references.departments;

  protected readonly templatesLoaded = this.references.templatesLoaded;

  protected readonly templateOptions = computed<NamedRef[]>(() =>
    this.references.activeTemplates().map((t) => ({ id: t.id, name: `${t.code} · ${t.title}` })),
  );

  protected readonly breadcrumbs = computed(() => {
    const original = this.original();
    return [
      { labelKey: 'modules.names.inspections', link: '/inspections' },
      ...(original ? [{ label: original.title, link: `/inspections/${original.id}` }] : []),
      { labelKey: this.id() ? 'inspections.form.editTitle' : 'inspections.form.newTitle' },
    ];
  });

  protected readonly templateError = computed(
    () => this.attempted() && !this.id() && !this.form().templateId,
  );

  /** "Vernerunde – Lager": what the title becomes when it is left empty. */
  protected readonly suggestedTitle = computed(() => {
    const id = this.form().templateId;
    const template = this.references.activeTemplates().find((t) => t.id === id)?.title ?? null;
    return defaultTitle(template, this.form().location);
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
      title:
        this.original()?.title ??
        this.language.translate(
          this.id() ? 'inspections.form.editTitle' : 'inspections.form.newTitle',
        ),
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
            error: () => this.loadFailed.set(true),
          }),
        );
      }
    });
  }

  protected set<K extends keyof InspectionForm>(key: K, value: InspectionForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected save(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.form();
    if (!orgId || this.saving()) {
      return;
    }
    if (!this.id() && !f.templateId) {
      document.getElementById('if-template')?.focus();
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
