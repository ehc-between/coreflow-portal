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
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import {
  AccessGrant,
  DocumentDetail,
  DocumentVisibility,
  RelatedRecordInput,
} from '../../core/documents/document.models';
import { documentErrorKey } from '../../core/documents/document-errors';
import { DocumentsApi } from '../../core/documents/documents-api';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { EntityChipRef } from '../../shared/kit/entity-chip';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { CustomerPicker, CustomersAvailability, customerIdFromRoute } from '../../shared/customers';
import { ClausePicker, toRefs } from '../../shared/requirement-links/clause-picker';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormField } from '../../shared/ui/form-field/form-field';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { DocumentAccessEditor } from './access/document-access-editor';
import { DocumentControlApi } from './data/document-control-api';
import { documentControlErrorKey } from './data/document-control-errors';
import { DocumentTemplate, DocumentType } from './data/document-control.models';
import { DocumentEditor } from './editor/document-editor';
import { DocumentsAiDraft, DraftContext, cleanDraftHtml } from './shared/ai-draft-panel';
import {
  AcceptedSuggestion,
  FormSuggest,
  FormSuggestFieldDef,
} from '../../shared/ask/form-suggest';
import { DocumentsPageGuide } from './shared/documents-page-guide';
import { RecordPicker } from './shared/record-picker';

/** Max requirement refs / records sent with a new document (the API limits). */
export const MAX_REQUIREMENTS = 30;
export const MAX_RELATED = 20;

/** `?related=<entity_type>:<uuid>` (a process page linking "Nytt dokument" here). */
export function parseRelatedParam(value: string | null): RelatedRecordInput | null {
  const match = /^([a-z_]{2,32}):([0-9a-f-]{36})$/i.exec((value ?? '').trim());
  return match ? { entity_type: match[1], entity_id: match[2] } : null;
}

/**
 * New document form. "Om dokumentet": type (gives the code and the review
 * interval), title, code and template. "Kobling": the requirements the document
 * documents (clause picker; saved as confirmed links) and the records it belongs
 * to (process, risk, obligation …; linked on create). Then the body — from a
 * template, a KI draft (whose requirement and process are added to the links
 * when the draft is used) or written in the editor — and owner / access. Opened
 * from a requirement (`?fromRequirement=`) or as "Lag ny fra denne" (`?flow=`),
 * the form is prefilled, and saving links the new document back. Gated upstream
 * on `documents:draft`; navigates back to the list on org switch.
 */
@Component({
  selector: 'app-document-new',
  imports: [
    FormSuggest,
    ReactiveFormsModule,
    TranslocoPipe,
    PageHeader,
    Card,
    FormActions,
    FormField,
    FormSection,
    Button,
    Icon,
    Alert,
    AskAbout,
    FieldHelp,
    FlowBanner,
    ClausePicker,
    RecordPicker,
    DocumentEditor,
    DocumentAccessEditor,
    DocumentsAiDraft,
    DocumentsPageGuide,
    CustomerPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="documents.new"
        [breadcrumbs]="[
          { labelKey: 'modules.names.documents', link: '/documents' },
          { labelKey: 'documents.new' },
        ]"
        backLink="/documents"
        backLabelKey="documents.backToList"
      />
      <app-flow-banner [flow]="flow()" />
      <app-documents-page-guide page="newDocument" lesson="first-document" [why]="true" />

      <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (!templateId()) {
          <app-form-suggest
            suggestKey="documents.document"
            labelKey="ask.formSuggest.labels.document"
            [fields]="suggestFields()"
            [values]="{ title: titleValue(), type: typeKey() || null, content: content() }"
            [context]="{ from: 'documents' }"
            [titleOnly]="!!titleValue().trim() && !content().trim()"
            (applied)="applySuggestion($event)"
          />
        }
        <app-form-section
          [title]="'documents.page.new.about' | transloco"
          [description]="'documents.page.new.sections.aboutHint' | transloco"
        >
          <app-form-field
            span="full"
            inputId="doc-title"
            [required]="true"
            [label]="'documents.fields.title' | transloco"
            [error]="showError('title') ? ('documents.page.new.errors.title' | transloco) : ''"
          >
            <input id="doc-title" type="text" formControlName="title" autocomplete="off" />
          </app-form-field>
          <app-form-field
            inputId="doc-type"
            [required]="true"
            [label]="'documents.fields.type' | transloco"
            [error]="showError('type') ? ('documents.page.new.errors.type' | transloco) : ''"
          >
            <app-field-help
              label-suffix
              scope="documents"
              page="newDocument"
              field="type"
              [label]="'documents.fields.type' | transloco"
            />
            @if (types().length) {
              <select id="doc-type" formControlName="type" data-testid="doc-type-select">
                <option value="">
                  {{ 'documents.control.newDocument.chooseType' | transloco }}
                </option>
                @for (t of types(); track t.id) {
                  <option [value]="t.key">{{ t.name }}</option>
                }
              </select>
            } @else {
              <input id="doc-type" type="text" formControlName="type" autocomplete="off" />
            }
          </app-form-field>
          <app-form-field inputId="doc-code" [label]="'documents.fields.codeOptional' | transloco">
            <input
              id="doc-code"
              type="text"
              formControlName="doc_code"
              autocomplete="off"
              [placeholder]="selectedType()?.next_code ?? ''"
            />
          </app-form-field>
          @if (selectedType(); as t) {
            <p
              class="-mt-3 text-meta leading-snug text-fg-subtle sm:col-span-2"
              data-testid="doc-code-hint"
            >
              @if (t.next_code) {
                {{ 'documents.control.newDocument.autoCode' | transloco: { code: t.next_code } }}
              }
              @if (t.default_review_interval_months) {
                {{
                  'documents.control.newDocument.reviewDefault'
                    | transloco: { count: t.default_review_interval_months }
                }}
              }
              @if (t.default_acknowledgement_required) {
                {{ 'documents.control.newDocument.ackDefault' | transloco }}
              }
            </p>
          }
          @if (templates().length) {
            <app-form-field
              inputId="doc-template"
              [label]="'documents.control.newDocument.template' | transloco"
            >
              <app-field-help
                label-suffix
                scope="documents"
                page="newDocument"
                field="template"
                [label]="'documents.control.newDocument.template' | transloco"
              />
              <select
                id="doc-template"
                (change)="templateId.set($any($event.target).value)"
                data-testid="doc-template"
              >
                <option value="" [selected]="!templateId()">
                  {{ 'documents.control.newDocument.blank' | transloco }}
                </option>
                @for (t of templates(); track t.id) {
                  <option [value]="t.id" [selected]="t.id === templateId()">
                    {{ t.name }}
                  </option>
                }
              </select>
            </app-form-field>
          }
        </app-form-section>

        <app-form-section
          data-testid="link-card"
          [title]="'documents.link.title' | transloco"
          [description]="'documents.link.intro' | transloco"
        >
          @if (customers.enabled()) {
            <app-form-field
              span="full"
              inputId="doc-customer"
              [label]="'documents.link.customer' | transloco"
              [hint]="'documents.link.customerHint' | transloco"
            >
              <app-customer-picker
                inputId="doc-customer"
                [value]="customerId()"
                (valueChange)="customerId.set($event)"
                data-testid="doc-customer"
              />
            </app-form-field>
          }
          @if (canReadStandards()) {
            <app-form-field
              span="full"
              inputId="doc-requirements"
              [label]="'documents.link.requirements' | transloco"
              [hint]="'documents.link.requirementsHint' | transloco"
            >
              <app-field-help
                label-suffix
                scope="documents"
                page="newDocument"
                field="requirements"
                [label]="'documents.link.requirements' | transloco"
              />
              <app-ask-about
                label-suffix
                field="requirements"
                [fieldLabel]="'documents.link.requirements' | transloco"
                [prompt]="'documents.link.askWhich' | transloco: { title: titleValue() || '…' }"
              />
              @if (flowRequirement(); as req) {
                <p
                  class="inline-flex items-center gap-1.5 self-start rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 text-meta font-semibold text-accent"
                  data-testid="from-requirement"
                >
                  <app-icon name="link" [size]="12" />
                  {{ 'documents.link.fromRequirement' | transloco: { ref: req } }}
                </p>
              }
              <app-clause-picker
                inputId="doc-requirements"
                [formControl]="requirementControl"
                data-testid="requirement-picker"
              />
            </app-form-field>
          }
          <app-form-field
            span="full"
            inputId="doc-related"
            [label]="'documents.link.records' | transloco"
          >
            <app-field-help
              label-suffix
              scope="documents"
              page="newDocument"
              field="related"
              [label]="'documents.link.records' | transloco"
            />
            <app-record-picker
              inputId="doc-related"
              [value]="related()"
              [max]="maxRelated"
              (valueChange)="related.set($event)"
            />
          </app-form-field>
        </app-form-section>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }

        @if (templateId()) {
          <p class="rounded-tile border border-border bg-surface-2 px-4 py-3 text-ui text-fg-muted">
            {{ 'documents.control.newDocument.fromTemplateHint' | transloco }}
          </p>
        } @else {
          <div class="-mb-2">
            <h2 class="font-display text-card font-bold text-fg">
              {{ 'documents.page.new.sections.content' | transloco }}
            </h2>
            <p class="mt-0.5 text-meta text-fg-muted">
              {{ 'documents.page.new.sections.contentHint' | transloco }}
            </p>
          </div>
          <app-documents-ai-draft
            [title]="titleValue()"
            [documentType]="typeKey()"
            (apply)="applyDraft($event)"
            (used)="linkDraft($event)"
          />
          @for (key of [editorKey()]; track key) {
            <app-document-editor
              [embedded]="true"
              [content]="content()"
              (contentChange)="content.set($event)"
            />
          }
        }

        <app-card [padded]="false">
          <button
            type="button"
            (click)="accessOpen.set(!accessOpen())"
            [attr.aria-expanded]="accessOpen()"
            class="flex w-full items-center gap-2 px-4 py-3.5 text-left"
          >
            <app-icon name="lock" [size]="16" class="flex-none text-fg-subtle" />
            <span class="flex-1">
              <span class="block text-body font-semibold text-fg">{{
                'documents.access.sectionTitle' | transloco
              }}</span>
              <span class="block text-meta text-fg-subtle">{{
                'documents.access.sectionHint' | transloco
              }}</span>
            </span>
            <app-icon
              name="chevron"
              [size]="16"
              class="flex-none text-fg-subtle"
              [class.rotate-180]="accessOpen()"
            />
          </button>
          @if (accessOpen()) {
            <div class="border-t border-border px-4 py-4">
              <app-document-access-editor
                mode="local"
                [owner]="owner()"
                [visibility]="visibility()"
                [grants]="grants()"
                (ownerChange)="owner.set($event)"
                (visibilityChange)="visibility.set($event)"
                (grantsChange)="grants.set($event)"
              />
            </div>
          }
        </app-card>

        <app-form-actions>
          <app-button type="button" variant="secondary" (click)="cancel()">
            {{ 'documents.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="saving()" data-testid="create-document">
            {{ 'documents.create' | transloco }}
          </app-button>
        </app-form-actions>
      </form>
    </div>
  `,
})
export class DocumentNew {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);
  private readonly controlApi = inject(DocumentControlApi);
  private readonly language = inject(LanguageService);

  /** `?template=<id>` preselects a template. */
  readonly template = input<string | undefined>(undefined);

  protected readonly maxRelated = MAX_RELATED;
  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  /** A "Lag ny fra denne" / "fra kravet" flow this form was opened with. */
  protected readonly flow = this.flows.consume(this.route, { targetType: 'document' });
  protected readonly customers = inject(CustomersAvailability);
  /** A customer-specific document: from the customer card (flow or `?customer_id=`). */
  protected readonly customerId = signal<string | null>(customerIdFromRoute(this.route));
  /** The requirement a requirement flow documents (linked by the flow on save). */
  protected readonly flowRequirement = computed(() => {
    const req = this.flow()?.prefill.requirement;
    return req
      ? `${req.number} ${req.title_nb && this.language.active() === 'nb' ? req.title_nb : req.title}`
      : null;
  });

  /** The org's active document types (numbering + defaults) and templates. */
  protected readonly types = signal<readonly DocumentType[]>([]);
  protected readonly templates = signal<readonly DocumentTemplate[]>([]);
  protected readonly templateId = signal('');
  /** Mirrors of the type / title controls, so computed state stays signal-based. */
  protected readonly typeKey = signal('');
  protected readonly titleValue = signal('');
  protected readonly selectedType = computed(
    () => this.types().find((t) => t.key === this.typeKey()) ?? null,
  );
  /** Bumped to re-create the editor with new content (an accepted AI draft). */
  protected readonly editorKey = signal(0);

  /** Current editor HTML, streamed from the embedded editor. */
  protected readonly content = signal('');

  /** Kobling: requirement refs (clause picker) and records to link. */
  protected readonly requirementControl = new FormControl<string[]>([], { nonNullable: true });
  private readonly requirementValue = toSignal(this.requirementControl.valueChanges, {
    initialValue: [] as string[],
  });
  protected readonly related = signal<readonly EntityChipRef[]>([]);

  protected readonly canReadStandards = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('standards:read'),
  );

  /** Access section: defaults to the current user as owner, open visibility. */
  protected readonly accessOpen = signal(false);
  protected readonly owner = signal(this.auth.user()?.id ?? '');
  protected readonly visibility = signal<DocumentVisibility>('organization');
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    type: ['', [Validators.required]],
    title: ['', [Validators.required]],
    doc_code: [''],
  });

  private currentOrgId: string | null = null;

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      view: 'new',
      title: this.titleValue() || this.language.translate('documents.new'),
      requirements: toRefs(this.requirementValue()),
    }));
    const subs = [
      this.form.controls.type.valueChanges.subscribe((v) => this.typeKey.set(v)),
      this.form.controls.title.valueChanges.subscribe((v) => this.titleValue.set(v)),
    ];
    inject(DestroyRef).onDestroy(() => subs.forEach((s) => s.unsubscribe()));

    // A flow's prefill (title, description as the opening text) fills empty fields.
    effect(() => {
      const ctx = this.flow();
      if (!ctx) {
        return;
      }
      untracked(() => {
        const title = ctx.prefill.title;
        if (typeof title === 'string' && !this.form.controls.title.value) {
          this.form.controls.title.setValue(title);
        }
        const customer = ctx.prefill['customer_id'];
        if (typeof customer === 'string' && customer && !this.customerId()) {
          this.customerId.set(customer);
        }
        const description = ctx.prefill.description;
        if (typeof description === 'string' && description.trim() && !this.content()) {
          this.applyDraft(`<p>${escapeHtml(description.trim())}</p>`);
        }
      });
    });
    // `?related=process:<id>`: start with that record in the links.
    const related = parseRelatedParam(this.route.snapshot.queryParamMap.get('related'));
    if (related) {
      this.related.set([
        {
          entity_type: related.entity_type,
          entity_id: related.entity_id,
          title: this.route.snapshot.queryParamMap.get('relatedTitle') ?? '',
        },
      ]);
    }
    effect(() => {
      const preset = this.template();
      if (preset) {
        untracked(() => this.templateId.set(preset));
      }
    });
    effect(() => {
      const orgId = this.orgId();
      if (orgId) {
        untracked(() => this.loadSetup(orgId));
      }
    });
    effect(() => {
      const orgId = this.orgId();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/documents');
        return;
      }
      this.currentOrgId = orgId;
    });
  }

  protected showError(field: 'type' | 'title'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  /**
   * `?type=<key>` (Håndbok "+ Ny prosedyre", Oversikt "Ny policy") preselects that type when
   * the org has it, or fills the free-text type when no types are set up.
   */
  private presetType(types: readonly DocumentType[]): void {
    const key = this.route.snapshot.queryParamMap.get('type')?.trim();
    const control = this.form.controls.type;
    if (!key || control.value) {
      return;
    }
    if (types.length === 0 || types.some((t) => t.key === key)) {
      control.setValue(key);
    }
  }

  /** Types and templates; without them (none set up, or no access) the form stays free text. */
  private loadSetup(orgId: string): void {
    this.controlApi.listTypes(orgId).subscribe({
      next: (types) => {
        this.types.set(types);
        this.presetType(types);
      },
      error: () => {
        this.types.set([]);
        this.presetType([]);
      },
    });
    this.controlApi.listTemplates(orgId).subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templates.set([]),
    });
  }

  protected readonly suggestFields = computed((): readonly FormSuggestFieldDef[] => [
    { name: 'title', labelKey: 'documents.fields.title' },
    {
      name: 'type',
      labelKey: 'documents.fields.type',
      format: (value, field) => (typeof field.display === 'string' ? field.display : ''),
    },
    { name: 'content', labelKey: 'ask.formSuggest.fields.content', long: true },
  ]);

  /** Accepted whole-form suggestions fill the form; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const title = accepted['title']?.value;
    if (typeof title === 'string') {
      this.form.controls.title.setValue(title.slice(0, 255));
    }
    const type = accepted['type']?.value;
    if (typeof type === 'string' && this.types().some((t) => t.key === type)) {
      this.form.controls.type.setValue(type);
    }
    const content = accepted['content']?.value;
    if (typeof content === 'string') {
      this.applyDraft(cleanDraftHtml(content));
    }
  }

  protected applyDraft(html: string): void {
    this.content.set(html);
    this.editorKey.update((k) => k + 1);
  }

  /** The used KI draft was written for a requirement and / or process: link them too. */
  protected linkDraft(context: DraftContext): void {
    if (context.requirementRef && this.canReadStandards()) {
      const refs = toRefs(this.requirementControl.value);
      if (!refs.includes(context.requirementRef) && refs.length < MAX_REQUIREMENTS) {
        this.requirementControl.setValue([...refs, context.requirementRef]);
      }
    }
    const record = context.record;
    if (
      record &&
      !this.related().some(
        (r) => r.entity_type === record.entity_type && r.entity_id === record.entity_id,
      )
    ) {
      this.related.update((list) => [...list, record]);
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/documents']);
  }

  protected submit(): void {
    const orgId = this.orgId();
    this.submitted.set(true);
    if (!orgId || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorKey.set(null);
    const value = this.form.getRawValue();
    const docCode = value.doc_code.trim();

    const owner = this.owner();
    const visibility = this.visibility();
    const access = this.grants().map((g) => ({
      subject_type: g.subject_type,
      subject_id: g.subject_id,
      level: g.level,
    }));
    const requirementRefs = this.canReadStandards()
      ? toRefs(this.requirementControl.value).slice(0, MAX_REQUIREMENTS)
      : [];
    const related: RelatedRecordInput[] = this.related()
      .slice(0, MAX_RELATED)
      .map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id }));
    const links = {
      requirement_refs: requirementRefs.length ? requirementRefs : undefined,
      related: related.length ? related : undefined,
    };

    const templateId = this.templateId();
    if (templateId) {
      // Created from the template (linked as derived_from); the body is edited next.
      this.controlApi
        .createFromTemplate(orgId, templateId, {
          title: value.title.trim(),
          type: value.type.trim() || undefined,
          doc_code: docCode || undefined,
          owner_user_id: owner || undefined,
          visibility,
          ...links,
        })
        .subscribe({
          next: (document) => {
            // The template endpoint takes no customer: set it on the new draft.
            const customer = this.customerId();
            if (!customer) {
              this.created(document, ['/documents', document.id, 'edit']);
              return;
            }
            this.api
              .updateControl(orgId, document.id, { customer_id: customer })
              .pipe(catchError(() => of(document)))
              .subscribe((doc) => this.created(doc, ['/documents', document.id, 'edit']));
          },
          error: (e: unknown) => {
            this.saving.set(false);
            this.errorKey.set(documentControlErrorKey(e));
          },
        });
      return;
    }

    this.api
      .create(orgId, {
        type: value.type.trim(),
        title: value.title.trim(),
        content: this.content(),
        doc_code: docCode || undefined,
        owner_user_id: owner || undefined,
        visibility,
        access: visibility === 'restricted' && access.length ? access : undefined,
        ...links,
        ...(this.customerId() ? { customer_id: this.customerId()! } : {}),
      })
      .subscribe({
        next: (document) => this.created(document, ['/documents', document.id]),
        error: (e: unknown) => {
          this.saving.set(false);
          this.errorKey.set(documentErrorKey(e, 'updateControl'));
        },
      });
  }

  /** Saved: finish a create-from-here flow (links back to its source), then open it. */
  private created(document: DocumentDetail, next: readonly unknown[]): void {
    this.saving.set(false);
    this.notifications.success('documents.createdToast');
    if (this.flow()) {
      this.flows.complete(document.id, 'document').subscribe();
    }
    void this.router.navigate(next);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
