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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { AccessGrant, DocumentVisibility } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { DocumentAccessEditor } from './access/document-access-editor';
import { DocumentEditor } from './editor/document-editor';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { Alert } from '../../shared/ui/alert/alert';
import { DocumentControlApi } from './data/document-control-api';
import { documentControlErrorKey } from './data/document-control-errors';
import { DocumentTemplate, DocumentType } from './data/document-control.models';
import { DocumentsAiDraft } from './shared/ai-draft-panel';

/**
 * New document form, scoped to the currently selected org. Captures a type,
 * title and optional doc code, with the body authored in the rich TipTap editor
 * (embedded AI included). Submits the editor HTML as `content` (sanitized
 * server-side), then navigates to the new document's detail. Gated upstream on
 * `documents:draft`. Navigates back to the list on org switch.
 */
@Component({
  selector: 'app-document-new',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Card,
    FormField,
    Button,
    Icon,
    DocumentEditor,
    DocumentAccessEditor,
    DocumentsAiDraft,
    FieldHelp,
    Alert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-8 pt-7 pb-12">
      <a
        routerLink="/documents"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'documents.backToList' | transloco }}
      </a>

      <h1 class="mb-[18px] font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
        {{ 'documents.new' | transloco }}
      </h1>

      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <app-card>
          <div class="flex flex-col gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-form-field inputId="doc-type" [label]="'documents.fields.type' | transloco">
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
                <app-field-help scope="documents" page="newDocument" field="type" />
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
              <p class="-mt-2 text-[12px] text-fg-subtle" data-testid="doc-code-hint">
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

            <app-form-field inputId="doc-title" [label]="'documents.fields.title' | transloco">
              <input id="doc-title" type="text" formControlName="title" autocomplete="off" />
            </app-form-field>

            @if (templates().length) {
              <div>
                <app-form-field
                  inputId="doc-template"
                  [label]="'documents.control.newDocument.template' | transloco"
                >
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
                <app-field-help scope="documents" page="newDocument" field="template" />
              </div>
            }
          </div>
        </app-card>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }

        @if (templateId()) {
          <p
            class="rounded-tile border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-muted"
          >
            {{ 'documents.control.newDocument.fromTemplateHint' | transloco }}
          </p>
        } @else {
          <app-documents-ai-draft
            [title]="titleValue()"
            [documentType]="typeKey()"
            (apply)="applyDraft($event)"
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
            class="flex w-full items-center gap-2 px-4 py-3.5 text-left"
          >
            <app-icon name="lock" [size]="16" class="flex-none text-fg-subtle" />
            <span class="flex-1">
              <span class="block text-[14px] font-semibold text-fg">{{
                'documents.access.sectionTitle' | transloco
              }}</span>
              <span class="block text-[12.5px] text-fg-subtle">{{
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

        <div class="flex items-center gap-2">
          <app-button type="submit" [loading]="saving()">
            {{ 'documents.create' | transloco }}
          </app-button>
          <a routerLink="/documents">
            <app-button type="button" variant="ghost">
              {{ 'documents.cancel' | transloco }}
            </app-button>
          </a>
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

  private readonly controlApi = inject(DocumentControlApi);
  private readonly language = inject(LanguageService);

  /** `?template=<id>` preselects a template. */
  readonly template = input<string | undefined>(undefined);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);

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
    }));
    const subs = [
      this.form.controls.type.valueChanges.subscribe((v) => this.typeKey.set(v)),
      this.form.controls.title.valueChanges.subscribe((v) => this.titleValue.set(v)),
    ];
    inject(DestroyRef).onDestroy(() => subs.forEach((s) => s.unsubscribe()));
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

  protected submit(): void {
    const orgId = this.orgId();
    if (!orgId || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();
    const docCode = value.doc_code.trim();

    const owner = this.owner();
    const visibility = this.visibility();
    const access = this.grants().map((g) => ({
      subject_type: g.subject_type,
      subject_id: g.subject_id,
      level: g.level,
    }));

    const templateId = this.templateId();
    if (templateId) {
      // Created from the template (linked as derived_from); the body is edited next.
      this.errorKey.set(null);
      this.controlApi
        .createFromTemplate(orgId, templateId, {
          title: value.title.trim(),
          type: value.type.trim() || undefined,
          doc_code: docCode || undefined,
          owner_user_id: owner || undefined,
          visibility,
        })
        .subscribe({
          next: (document) => {
            this.saving.set(false);
            this.notifications.success('documents.createdToast');
            void this.router.navigate(['/documents', document.id, 'edit']);
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
      })
      .subscribe({
        next: (document) => {
          this.saving.set(false);
          this.notifications.success('documents.createdToast');
          void this.router.navigate(['/documents', document.id]);
        },
        error: () => this.saving.set(false),
      });
  }
}
