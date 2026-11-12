import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { DocumentSummary } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import { AudienceEntry, CampaignCreate } from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { endOfDay, textOrNull } from '../shared/document-control-display';
import { AudienceEditor } from './audience-editor';

/** The create body of the campaign form. */
export function campaignBody(form: {
  readonly documentId: string;
  readonly title: string;
  readonly message: string;
  readonly requireAck: boolean;
  readonly audience: readonly AudienceEntry[];
  readonly due: string;
  readonly launch: boolean;
}): CampaignCreate {
  return {
    document_id: form.documentId,
    title: textOrNull(form.title),
    message: textOrNull(form.message),
    require_acknowledgement: form.requireAck,
    audience: form.audience,
    due_at: endOfDay(form.due),
    launch: form.launch,
  };
}

/**
 * New distribution campaign: pick an approved document, the audience and a due
 * date, then save it as a draft or launch it straight away (which sends the
 * current approved revision and gives every recipient a task).
 */
@Component({
  selector: 'app-campaign-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    DocumentsPageGuide,
    AudienceEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/documents/campaigns"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'documents.control.campaigns.back' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'documents.control.campaigns.new' | transloco }}
      </h1>
      <app-documents-page-guide class="mb-4" page="campaignForm" />

      @if (errorKey(); as key) {
        <app-alert class="mb-4 block" tone="error">{{ key | transloco }}</app-alert>
      }

      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save(false)">
        <app-card>
          <div class="flex flex-col gap-4">
            <app-form-field
              inputId="camp-document"
              [label]="'documents.control.campaigns.fields.document' | transloco"
            >
              <select
                id="camp-document"
                required
                (change)="documentId.set($any($event.target).value)"
                data-testid="campaign-document"
              >
                <option value="" [selected]="!documentId()">
                  {{ 'documents.control.campaigns.chooseDocument' | transloco }}
                </option>
                @for (d of documents(); track d.id) {
                  <option [value]="d.id" [selected]="d.id === documentId()">
                    {{ d.doc_code }} · {{ d.title }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help scope="documents" page="campaignForm" field="document" />
            @if (documentsLoaded() && documents().length === 0) {
              <p class="text-[12.5px] text-fg-muted">
                {{ 'documents.control.campaigns.noApproved' | transloco }}
              </p>
            }

            <app-form-field
              inputId="camp-title"
              [label]="'documents.control.campaigns.fields.titleOptional' | transloco"
            >
              <input
                id="camp-title"
                type="text"
                maxlength="255"
                [value]="title()"
                (input)="title.set($any($event.target).value)"
              />
            </app-form-field>

            <div>
              <div class="flex items-center gap-1.5">
                <app-form-field
                  class="flex-1"
                  inputId="camp-message"
                  [label]="'documents.control.campaigns.fields.message' | transloco"
                >
                  <textarea
                    id="camp-message"
                    rows="3"
                    maxlength="4000"
                    [value]="message()"
                    (input)="message.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-ask-about
                  class="mt-5"
                  [prompt]="'documents.control.campaigns.askMessage' | transloco"
                  field="message"
                />
              </div>
            </div>

            <label class="inline-flex items-start gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="mt-0.5"
                [checked]="requireAck()"
                (change)="requireAck.set($any($event.target).checked)"
              />
              <span>
                {{ 'documents.control.campaigns.fields.requireAck' | transloco }}
                <span class="block text-[12px] text-fg-subtle">
                  {{ 'documents.control.campaigns.requireAckHint' | transloco }}
                </span>
              </span>
            </label>

            <app-form-field
              inputId="camp-due"
              [label]="'documents.control.campaigns.fields.due' | transloco"
            >
              <input
                id="camp-due"
                type="date"
                [value]="due()"
                (input)="due.set($any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="documents" page="campaignForm" field="due" />
          </div>
        </app-card>

        <app-card>
          <app-audience-editor [value]="audience()" (valueChange)="audience.set($event)" />
          <app-field-help scope="documents" page="campaignForm" field="audience" />
        </app-card>

        <div class="flex flex-wrap items-center gap-2">
          <app-button
            [disabled]="!canLaunch()"
            [loading]="busy() === 'launch'"
            (click)="save(true)"
            data-testid="campaign-launch"
          >
            {{ 'documents.control.campaigns.saveAndLaunch' | transloco }}
          </app-button>
          <app-button
            type="submit"
            variant="secondary"
            [disabled]="!documentId()"
            [loading]="busy() === 'draft'"
            data-testid="campaign-save-draft"
          >
            {{ 'documents.control.campaigns.saveDraft' | transloco }}
          </app-button>
          <a routerLink="/documents/campaigns">
            <app-button type="button" variant="ghost">
              {{ 'documents.control.common.cancel' | transloco }}
            </app-button>
          </a>
        </div>
      </form>
    </div>
  `,
})
export class CampaignFormPage {
  private readonly api = inject(DocumentControlApi);
  private readonly documentsApi = inject(DocumentsApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  /** `?document=<id>` preselects the document (from the document page). */
  readonly document = input<string | undefined>(undefined);

  protected readonly documents = signal<readonly DocumentSummary[]>([]);
  protected readonly documentsLoaded = signal(false);
  protected readonly documentId = linkedSignal(() => this.document() ?? '');
  protected readonly title = signal('');
  protected readonly message = signal('');
  protected readonly requireAck = signal(true);
  protected readonly due = signal('');
  protected readonly audience = signal<readonly AudienceEntry[]>([]);
  protected readonly busy = signal<'draft' | 'launch' | null>(null);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly canLaunch = computed(
    () => !!this.documentId() && this.audience().length > 0 && !this.busy(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'distribution_campaign',
      view: 'new',
      title: this.language.translate('documents.control.campaigns.new'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      if (!orgId) {
        return;
      }
      untracked(() =>
        this.documentsApi.list(orgId, { status: 'approved' }).subscribe({
          next: (docs) => {
            this.documents.set(docs);
            this.documentsLoaded.set(true);
          },
          error: () => this.documentsLoaded.set(true),
        }),
      );
    });
  }

  protected save(launch: boolean): void {
    const orgId = this.perms.orgId();
    if (!orgId || !this.documentId() || this.busy() || (launch && !this.canLaunch())) {
      return;
    }
    this.busy.set(launch ? 'launch' : 'draft');
    this.errorKey.set(null);
    const body = campaignBody({
      documentId: this.documentId(),
      title: this.title(),
      message: this.message(),
      requireAck: this.requireAck(),
      audience: this.audience(),
      due: this.due(),
      launch,
    });
    this.api.createCampaign(orgId, body).subscribe({
      next: (campaign) => {
        this.busy.set(null);
        this.toasts.success(
          launch
            ? 'documents.control.campaigns.launchedToast'
            : 'documents.control.campaigns.createdToast',
          { count: campaign.stats.total, skipped: campaign.skipped },
        );
        void this.router.navigate(['/documents/campaigns', campaign.id]);
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
