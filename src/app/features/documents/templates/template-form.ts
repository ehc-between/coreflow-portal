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
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { DocumentEditor } from '../editor/document-editor';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import { DocumentTemplate, DocumentType } from '../data/document-control.models';
import { DocumentsAiDraft } from '../shared/ai-draft-panel';
import { textOrNull } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

const TABS: readonly RecordTab[] = ['details', 'activity', 'related'];

/**
 * Create (`/documents/templates/new`) or view and edit (`/documents/templates/:id`)
 * a template: name, the document type it is for, and the body in the rich editor
 * (with an AI first draft). "Use template" creates a new document from it.
 */
@Component({
  selector: 'app-template-form',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    PromptDialog,
    DocumentEditor,
    DocumentsAiDraft,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #formTpl>
      <div class="flex flex-col gap-4">
        <app-documents-page-guide page="templateForm" />
        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }
        <app-card>
          <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2" [disabled]="!perms.canManage()">
            <app-form-field
              inputId="tpl-name"
              [label]="'documents.control.templates.fields.name' | transloco"
            >
              <input
                id="tpl-name"
                type="text"
                required
                maxlength="120"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
                data-testid="template-name"
              />
            </app-form-field>
            <div>
              <app-form-field
                inputId="tpl-type"
                [label]="'documents.control.fields.type' | transloco"
              >
                <select id="tpl-type" (change)="typeId.set($any($event.target).value)">
                  <option value="" [selected]="!typeId()">
                    {{ 'documents.control.templates.anyType' | transloco }}
                  </option>
                  @for (t of types(); track t.id) {
                    <option [value]="t.id" [selected]="t.id === typeId()">{{ t.name }}</option>
                  }
                </select>
              </app-form-field>
              <app-field-help scope="documents" page="templateForm" field="type" />
            </div>
            <app-form-field
              class="sm:col-span-2"
              inputId="tpl-description"
              [label]="'documents.control.fields.description' | transloco"
            >
              <textarea
                id="tpl-description"
                rows="2"
                maxlength="4000"
                [value]="description()"
                (input)="description.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </fieldset>
        </app-card>

        @if (perms.canManage()) {
          <app-documents-ai-draft
            [title]="name()"
            [documentType]="selectedTypeKey()"
            (apply)="replaceContent($event)"
          />
        }

        @for (key of [editorKey()]; track key) {
          <app-document-editor
            [embedded]="true"
            [content]="content()"
            (contentChange)="content.set($event)"
          />
        }

        @if (perms.canManage()) {
          <div class="flex flex-wrap items-center gap-2">
            <app-button
              [disabled]="!name().trim()"
              [loading]="saving()"
              (click)="save()"
              data-testid="template-save"
            >
              {{ 'documents.control.common.save' | transloco }}
            </app-button>
            <a routerLink="/documents/templates">
              <app-button type="button" variant="ghost">
                {{ 'documents.control.common.cancel' | transloco }}
              </app-button>
            </a>
          </div>
        }
      </div>
    </ng-template>

    @if (id(); as templateId) {
      @if (current(); as t) {
        <app-record-detail-layout
          entityType="document_template"
          [entityId]="templateId"
          [tabs]="tabs"
          [canEdit]="perms.canManage()"
          [includeAudit]="perms.canReadAudit()"
          backLink="/documents/templates"
          backLabelKey="documents.control.templates.back"
        >
          <div header>
            <p class="mb-1 text-[12.5px] text-fg-subtle">
              {{ t.document_type_name || ('documents.control.templates.anyType' | transloco) }}
            </p>
            <h1
              class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ t.name }}
            </h1>
          </div>
          <ng-container actions>
            @if (perms.canDraft()) {
              <app-button size="sm" (click)="useOpen.set(true)" data-testid="template-use">
                <app-icon name="plus" [size]="14" />
                {{ 'documents.control.templates.use' | transloco }}
              </app-button>
            }
            @if (perms.canManage()) {
              <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
                <app-icon name="trash" [size]="14" />
                <span class="sr-only sm:not-sr-only">{{
                  'documents.control.common.delete' | transloco
                }}</span>
              </app-button>
            }
          </ng-container>
          <ng-container [ngTemplateOutlet]="formTpl" />
          <ng-container aside>
            @if (perms.canReadStandards()) {
              <app-card>
                <app-supports-requirements entityType="document_template" [entityId]="templateId" />
              </app-card>
            }
          </ng-container>
        </app-record-detail-layout>

        <app-prompt-dialog
          [open]="useOpen()"
          [title]="'documents.control.templates.useTitle' | transloco"
          [message]="'documents.control.templates.useMessage' | transloco: { name: t.name }"
          [label]="'documents.control.fields.title' | transloco"
          [required]="true"
          [maxLength]="255"
          [confirmLabel]="'documents.control.templates.useConfirm' | transloco"
          [cancelLabel]="'documents.control.common.cancel' | transloco"
          [busy]="saving()"
          (confirmed)="useTemplate($event)"
          (cancelled)="useOpen.set(false)"
        />
        <app-confirm-dialog
          [open]="deleteOpen()"
          [title]="'documents.control.templates.deleteTitle' | transloco"
          [message]="'documents.control.templates.deleteMessage' | transloco: { name: t.name }"
          [confirmLabel]="'documents.control.common.delete' | transloco"
          [cancelLabel]="'documents.control.common.cancel' | transloco"
          [busy]="saving()"
          (confirmed)="remove()"
          (cancelled)="deleteOpen.set(false)"
        />
      } @else if (errorKey(); as key) {
        <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        </div>
      } @else {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'documents.control.common.loading' | transloco }}
        </p>
      }
    } @else {
      <div class="mx-auto max-w-[980px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
        <a
          routerLink="/documents/templates"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'documents.control.templates.back' | transloco }}
        </a>
        <h1
          class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        >
          {{ 'documents.control.templates.new' | transloco }}
        </h1>
        <ng-container [ngTemplateOutlet]="formTpl" />
      </div>
    }
  `,
})
export class TemplateFormPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  /** Set on `/documents/templates/:id`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly current = signal<DocumentTemplate | null>(null);
  protected readonly types = signal<readonly DocumentType[]>([]);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly typeId = signal('');
  protected readonly content = signal('');
  /** Bumped to re-create the editor with new content (an accepted AI draft). */
  protected readonly editorKey = signal(0);
  protected readonly saving = signal(false);
  protected readonly useOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly selectedTypeKey = computed(
    () => this.types().find((t) => t.id === this.typeId())?.key ?? '',
  );

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document_template',
      entityId: this.id() ?? null,
      view: this.id() ? 'detail' : 'new',
      title: this.current()?.name ?? this.language.translate('documents.control.templates.new'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  private load(orgId: string | null, id: string | undefined): void {
    if (!orgId) {
      return;
    }
    this.api.listTypes(orgId).subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    if (!id) {
      return;
    }
    this.api.getTemplate(orgId, id).subscribe({
      next: (t) => this.apply(t),
      error: (e: unknown) => this.errorKey.set(documentControlErrorKey(e)),
    });
  }

  private apply(t: DocumentTemplate): void {
    this.current.set(t);
    this.name.set(t.name);
    this.description.set(t.description ?? '');
    this.typeId.set(t.document_type_id ?? '');
    this.content.set(t.content ?? '');
    this.editorKey.update((k) => k + 1);
  }

  protected replaceContent(html: string): void {
    this.content.set(html);
    this.editorKey.update((k) => k + 1);
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.saving() || !this.name().trim()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    const body = {
      name: this.name().trim(),
      description: textOrNull(this.description()),
      document_type_id: this.typeId() || null,
      content: this.content(),
    };
    const id = this.id();
    const request = id
      ? this.api.updateTemplate(orgId, id, body)
      : this.api.createTemplate(orgId, body);
    request.subscribe({
      next: (t) => {
        this.saving.set(false);
        this.toasts.success('documents.control.common.savedToast');
        if (id) {
          this.current.set({ ...t, content: this.content() });
        } else {
          void this.router.navigate(['/documents/templates', t.id]);
        }
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }

  protected useTemplate(title: string): void {
    const orgId = this.perms.orgId();
    const id = this.id();
    if (!orgId || !id || !title.trim()) {
      return;
    }
    this.saving.set(true);
    this.api.createFromTemplate(orgId, id, { title: title.trim() }).subscribe({
      next: (doc) => {
        this.saving.set(false);
        this.useOpen.set(false);
        this.toasts.success('documents.createdToast');
        void this.router.navigate(['/documents', doc.id, 'edit']);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.useOpen.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const id = this.id();
    if (!orgId || !id) {
      return;
    }
    this.saving.set(true);
    this.api.deleteTemplate(orgId, id).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('documents.control.common.deletedToast');
        void this.router.navigateByUrl('/documents/templates');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.deleteOpen.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
