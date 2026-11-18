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
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ClausePicker, toRefs } from '../../shared/requirement-links/clause-picker';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { DocumentAccessEditor } from './access/document-access-editor';
import { DocumentControlApi } from './data/document-control-api';
import { documentControlErrorKey } from './data/document-control-errors';
import { DocumentTemplate, DocumentType } from './data/document-control.models';
import { DocumentEditor } from './editor/document-editor';
import { DocumentsAiDraft, DraftContext } from './shared/ai-draft-panel';
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
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    PageHeader,
    Card,
    FormField,
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
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
        <app-card>
          <h2 class="mb-4 font-display text-card font-bold text-fg">
            {{ 'documents.page.new.about' | transloco }}
          </h2>
          <div class="flex flex-col gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <label for="doc-type" class="text-ui font-semibold text-fg-muted">{{
                    'documents.fields.type' | transloco
                  }}</label>
                  <app-field-help scope="documents" page="newDocument" field="type" />
                </div>
                <app-form-field inputId="doc-type">
                  @if (types().length) {
                    <select
                      id="doc-type"
                      formControlName="type"
                      data-testid="doc-type-select"
                      [attr.aria-invalid]="showError('type')"
                    >
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
                @if (showError('type')) {
                  <p class="mt-1 text-meta text-fail-ink" role="alert">
                    {{ 'documents.page.new.errors.type' | transloco }}
                  </p>
                }
              </div>
              <app-form-field
                inputId="doc-code"
                [label]="'documents.fields.codeOptional' | transloco"
              >
                <input
                  id="doc-code"
                  type="text"
                  formControlName="doc_code"
                  autocomplete="off"
                  [placeholder]="selectedType()?.next_code ?? ''"
                />
              </app-form-field>
            </div>

            @if (selectedType(); as t) {
              <p class="-mt-2 text-meta text-fg-subtle" data-testid="doc-code-hint">
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

            <div>
              <app-form-field inputId="doc-title" [label]="'documents.fields.title' | transloco">
                <input
                  id="doc-title"
                  type="text"
                  formControlName="title"
                  autocomplete="off"
                  [attr.aria-invalid]="showError('title')"
                />
              </app-form-field>
              @if (showError('title')) {
                <p class="mt-1 text-meta text-fail-ink" role="alert">
                  {{ 'documents.page.new.errors.title' | transloco }}
                </p>
              }
            </div>

            @if (templates().length) {
              <div>
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <label for="doc-template" class="text-ui font-semibold text-fg-muted">{{
                    'documents.control.newDocument.template' | transloco
                  }}</label>
                  <app-field-help scope="documents" page="newDocument" field="template" />
                </div>
                <app-form-field inputId="doc-template">
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
              </div>
            }
          </div>
        </app-card>

        <app-card data-testid="link-card">
          <h2 class="font-display text-card font-bold text-fg">
            {{ 'documents.link.title' | transloco }}
          </h2>
          <p class="mt-1 mb-4 text-ui text-fg-muted">{{ 'documents.link.intro' | transloco }}</p>
          <div class="flex flex-col gap-4">
            @if (canReadStandards()) {
              <div>
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <label for="doc-requirements" class="text-ui font-semibold text-fg-muted">{{
                    'documents.link.requirements' | transloco
                  }}</label>
                  <app-field-help scope="documents" page="newDocument" field="requirements" />
                  <app-ask-about
                    field="requirements"
                    [fieldLabel]="'documents.link.requirements' | transloco"
                    [prompt]="'documents.link.askWhich' | transloco: { title: titleValue() || '…' }"
                  />
                </div>
                @if (flowRequirement(); as req) {
                  <p
                    class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-2.5 py-1 text-meta font-semibold text-accent"
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
                <p class="mt-1 text-meta text-fg-subtle">
                  {{ 'documents.link.requirementsHint' | transloco }}
                </p>
              </div>
            }
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="doc-related" class="text-ui font-semibold text-fg-muted">{{
                  'documents.link.records' | transloco
                }}</label>
                <app-field-help scope="documents" page="newDocument" field="related" />
              </div>
              <app-form-field inputId="doc-related">
                <app-record-picker
                  inputId="doc-related"
                  [value]="related()"
                  [max]="maxRelated"
                  (valueChange)="related.set($event)"
                />
              </app-form-field>
            </div>
          </div>
        </app-card>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }

        @if (templateId()) {
          <p class="rounded-tile border border-border bg-surface-2 px-4 py-3 text-ui text-fg-muted">
            {{ 'documents.control.newDocument.fromTemplateHint' | transloco }}
          </p>
        } @else {
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

        <div
          class="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
        >
          <a routerLink="/documents">
            <app-button type="button" variant="secondary">
              {{ 'documents.cancel' | transloco }}
            </app-button>
          </a>
          <app-button type="submit" [loading]="saving()" data-testid="create-document">
            {{ 'documents.create' | transloco }}
          </app-button>
        </div>
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

  /** Types and templates; without them (none set up, or no access) the form stays free text. */
  private loadSetup(orgId: string): void {
    this.controlApi.listTypes(orgId).subscribe({
      next: (types) => this.types.set(types),
      error: () => this.types.set([]),
    });
    this.controlApi.listTemplates(orgId).subscribe({
      next: (templates) => this.templates.set(templates),
      error: () => this.templates.set([]),
    });
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
          next: (document) => this.created(document, ['/documents', document.id, 'edit']),
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
