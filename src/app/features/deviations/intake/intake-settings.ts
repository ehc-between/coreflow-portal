import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import { INTAKE_MODES, IntakeMode, IntakeSettings } from '../../../core/deviations/intake.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { QrCode, qrPath } from '../../../shared/qr-code/qr-code';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Switch } from '../../../shared/ui/switch/switch';
import { DEVIATIONS_ROOT_CRUMB, saveBlob } from '../deviation-display';
import { DeviationsNavService } from '../ui/deviations-nav';

/** The absolute URL of the public form for a settings `public_path`. */
export function publicUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&apos;',
  );
}

/** Break a text into lines of at most `width` characters (whole words). */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + ' ' + word).trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

/**
 * An A4 poster (SVG) for the notice board: a heading, a short explanation, the QR
 * code of the public form and its address. Made in the browser; the link never
 * leaves the page.
 */
export function posterSvg(opts: {
  readonly org: string;
  readonly title: string;
  readonly body: string;
  readonly scan: string;
  readonly url: string;
}): string {
  const qr = qrPath(opts.url);
  const qrSize = 360;
  const scale = qrSize / qr.size;
  const body = wrap(opts.body, 52)
    .map(
      (l, i) =>
        `<text x="297" y="${300 + i * 30}" font-size="22" text-anchor="middle" fill="#333">${escapeXml(l)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842" font-family="Helvetica, Arial, sans-serif">
<rect width="595" height="842" fill="#ffffff"/>
<text x="297" y="120" font-size="20" text-anchor="middle" fill="#555">${escapeXml(opts.org)}</text>
<text x="297" y="200" font-size="40" font-weight="bold" text-anchor="middle" fill="#111">${escapeXml(opts.title)}</text>
${body}
<g transform="translate(${(595 - qrSize) / 2} 420) scale(${scale})"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${qr.d}" fill="#000" shape-rendering="crispEdges"/></g>
<text x="297" y="815" font-size="16" text-anchor="middle" fill="#333">${escapeXml(opts.scan)}</text>
<text x="297" y="835" font-size="12" text-anchor="middle" fill="#555">${escapeXml(opts.url)}</text>
</svg>`;
}

/**
 * Settings of the org's anonymous / whistleblowing intake link
 * (`deviations:admin`): switch it on, choose anonymous or whistleblowing mode,
 * the deviation type reports default to, instructions shown on the form and
 * whether reporters may leave contact details. Shows the public link to share
 * and lets an admin rotate its token (the old link stops working).
 */
@Component({
  selector: 'app-intake-settings',
  imports: [
    FormsModule,
    TranslocoPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Switch,
    FieldHelp,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    QrCode,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.intake.settings.title"
        descriptionKey="deviations.intake.settings.subtitle"
        [breadcrumbs]="breadcrumbs"
        backLink="/deviations/intake"
      />
      <app-module-nav [items]="nav.items()" labelKey="modules.names.deviations" />
      <app-help-strip scope="deviations" page="intakeSettings" lesson="speaking-up" />

      <div class="max-w-[760px]">
        @if (loading()) {
          <app-loading-state [rows]="4" />
        } @else if (settings(); as current) {
          @for (warning of current.warnings ?? []; track warning) {
            <div class="mb-4" [attr.data-warning]="warning">
              <app-alert tone="info">{{
                'deviations.intake.warnings.' + warning | transloco
              }}</app-alert>
            </div>
          }
          @if (mode() === 'whistleblowing') {
            <div class="mb-4">
              <app-alert tone="info">{{
                'deviations.intake.settings.whistleblowingDuties' | transloco
              }}</app-alert>
            </div>
          }
          <form class="flex flex-col gap-5" (ngSubmit)="save()">
            <app-card>
              <div class="flex flex-col gap-4">
                <app-switch [checked]="enabled()" (checkedChange)="enabled.set($event)">
                  {{ 'deviations.intake.settings.enabled' | transloco }}
                </app-switch>

                <fieldset class="flex flex-col gap-2">
                  <legend
                    class="mb-1 flex items-center gap-1.5 text-ui font-semibold text-fg-muted"
                  >
                    {{ 'deviations.intake.settings.mode' | transloco }}
                    <app-field-help scope="deviations" page="intakeSettings" field="mode" />
                  </legend>
                  @for (option of modes; track option) {
                    <label
                      class="flex items-start gap-2 rounded-tile border border-border p-3 text-ui"
                    >
                      <input
                        type="radio"
                        name="mode"
                        [value]="option"
                        [ngModel]="mode()"
                        (ngModelChange)="mode.set($event)"
                        class="mt-0.5"
                      />
                      <span>
                        <span class="block font-semibold text-fg">{{
                          'deviations.intake.modes.' + option | transloco
                        }}</span>
                        <span class="block text-fg-muted">{{
                          'deviations.intake.modeHelp.' + option | transloco
                        }}</span>
                      </span>
                    </label>
                  }
                </fieldset>

                <div class="flex flex-col gap-1.5 sm:max-w-[60%]">
                  <label for="intake-type" class="text-ui font-semibold text-fg-muted">
                    {{ 'deviations.intake.settings.defaultType' | transloco }}
                  </label>
                  <select
                    id="intake-type"
                    name="defaultType"
                    [ngModel]="defaultTypeId()"
                    (ngModelChange)="defaultTypeId.set($event)"
                    class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  >
                    <option value="">
                      {{ 'deviations.intake.settings.noDefaultType' | transloco }}
                    </option>
                    @for (type of types(); track type.id) {
                      <option [value]="type.id">{{ type.name }}</option>
                    }
                  </select>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label for="intake-instructions" class="text-ui font-semibold text-fg-muted">
                    {{ 'deviations.intake.settings.instructions' | transloco }}
                  </label>
                  <textarea
                    id="intake-instructions"
                    name="instructions"
                    rows="4"
                    maxlength="4000"
                    [ngModel]="instructions()"
                    (ngModelChange)="instructions.set($event)"
                    [placeholder]="'deviations.intake.settings.instructionsPlaceholder' | transloco"
                    class="w-full rounded-tile border border-border bg-bg px-3 py-2.5 text-ui text-fg outline-none focus:border-accent"
                  ></textarea>
                </div>

                <app-switch [checked]="allowContact()" (checkedChange)="allowContact.set($event)">
                  {{ 'deviations.intake.settings.allowContact' | transloco }}
                </app-switch>
              </div>
            </app-card>

            <div class="flex items-center justify-end gap-2">
              <app-button type="submit" [loading]="saving()">
                <app-icon name="check" [size]="15" />
                {{ 'deviations.intake.settings.save' | transloco }}
              </app-button>
            </div>
          </form>

          <app-card class="mt-6 block">
            <h2 class="mb-2 font-display text-section font-bold tracking-[-0.02em] text-fg">
              {{ 'deviations.intake.settings.linkTitle' | transloco }}
            </h2>
            @if (!current.enabled) {
              <app-alert tone="info">{{
                'deviations.intake.settings.linkOff' | transloco
              }}</app-alert>
            }
            <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label for="intake-link" class="sr-only">{{
                'deviations.intake.settings.linkTitle' | transloco
              }}</label>
              <input
                id="intake-link"
                type="text"
                readonly
                [value]="link()"
                class="h-10 min-w-0 flex-1 rounded-tile border border-border bg-surface-2 px-3 font-mono text-meta text-fg"
                data-testid="intake-link"
              />
              <div class="flex gap-2">
                <app-button variant="secondary" size="sm" (click)="copy()">
                  {{ 'deviations.intake.settings.copy' | transloco }}
                </app-button>
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="!current.updated_at"
                  (click)="confirmRotate.set(true)"
                >
                  {{ 'deviations.intake.settings.rotate' | transloco }}
                </app-button>
              </div>
            </div>
            <p class="mt-2 text-meta text-fg-muted">
              {{ 'deviations.intake.settings.privacyNote' | transloco }}
            </p>
            <div
              class="mt-4 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center"
            >
              <app-qr-code
                [value]="link()"
                [pixels]="132"
                [label]="'deviations.intake.settings.qrLabel' | transloco"
              />
              <div class="flex min-w-0 flex-col gap-2">
                <p class="text-ui text-fg-muted">
                  {{ 'deviations.intake.settings.posterHint' | transloco }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <app-button
                    variant="secondary"
                    size="sm"
                    (click)="downloadPoster()"
                    data-testid="poster"
                  >
                    <app-icon name="upload" [size]="14" class="rotate-180" />
                    {{ 'deviations.intake.settings.poster' | transloco }}
                  </app-button>
                  @if (current.enabled) {
                    <a [href]="link()" target="_blank" rel="noopener" tabindex="-1">
                      <app-button variant="ghost" size="sm">
                        {{ 'deviations.intake.settings.preview' | transloco }}
                      </app-button>
                    </a>
                  }
                </div>
              </div>
            </div>
          </app-card>

          <app-confirm-dialog
            [open]="confirmRotate()"
            [busy]="rotating()"
            [title]="'deviations.intake.settings.rotateTitle' | transloco"
            [message]="'deviations.intake.settings.rotateConfirm' | transloco"
            [confirmLabel]="'deviations.intake.settings.rotate' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            (confirmed)="rotate()"
            (cancelled)="confirmRotate.set(false)"
          />
        }
      </div>
    </div>
  `,
})
export class IntakeSettingsPage {
  private readonly api = inject(DeviationIntakeApi);
  private readonly deviations = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);
  private readonly language = inject(LanguageService);
  protected readonly nav = inject(DeviationsNavService);
  protected readonly breadcrumbs = [
    DEVIATIONS_ROOT_CRUMB,
    { labelKey: 'deviations.intake.inbox.title', link: '/deviations/intake' },
    { labelKey: 'deviations.intake.settings.title' },
  ];

  protected readonly modes = INTAKE_MODES;
  protected readonly settings = signal<IntakeSettings | null>(null);
  protected readonly types = signal<readonly DeviationType[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly rotating = signal(false);
  protected readonly confirmRotate = signal(false);

  protected readonly enabled = signal(false);
  protected readonly mode = signal<IntakeMode>('anonymous');
  protected readonly defaultTypeId = signal('');
  protected readonly instructions = signal('');
  protected readonly allowContact = signal(true);

  protected readonly link = computed(() => {
    const current = this.settings();
    const origin = this.document.location?.origin ?? '';
    return current ? publicUrl(origin, current.public_path) : '';
  });

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      view: 'settings',
      title: this.language.translate('deviations.intake.settings.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .saveSettings(orgId, {
        enabled: this.enabled(),
        mode: this.mode(),
        default_type_id: this.defaultTypeId() || null,
        instructions: this.instructions().trim() || null,
        allow_contact: this.allowContact(),
      })
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.apply(saved);
          this.notifications.success('deviations.intake.settings.savedToast');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          notifyDeviationError(this.notifications, error);
        },
      });
  }

  protected rotate(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.rotating()) {
      return;
    }
    this.rotating.set(true);
    this.api.rotateToken(orgId).subscribe({
      next: (saved) => {
        this.rotating.set(false);
        this.confirmRotate.set(false);
        this.apply(saved);
        this.notifications.success('deviations.intake.settings.rotatedToast');
      },
      error: (error: unknown) => {
        this.rotating.set(false);
        this.confirmRotate.set(false);
        notifyDeviationError(this.notifications, error);
      },
    });
  }

  /** Download an A4 poster with the QR code for the notice board (finding 31). */
  protected downloadPoster(): void {
    const t = (key: string) => this.language.translate(key);
    const whistle = this.mode() === 'whistleblowing';
    const svg = posterSvg({
      org: this.selectedOrg.currentOrg()?.name ?? '',
      title: t(
        whistle ? 'deviations.intake.poster.titleWhistle' : 'deviations.intake.poster.title',
      ),
      body: t(whistle ? 'deviations.intake.poster.bodyWhistle' : 'deviations.intake.poster.body'),
      scan: t('deviations.intake.poster.scan'),
      url: this.link(),
    });
    saveBlob(
      new Blob([svg], { type: 'image/svg+xml' }),
      `${t('deviations.intake.poster.file')}.svg`,
    );
  }

  protected copy(): void {
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (!clipboard) {
      return;
    }
    clipboard.writeText(this.link()).then(
      () => this.notifications.success('deviations.intake.settings.copiedToast'),
      () => undefined,
    );
  }

  private apply(settings: IntakeSettings): void {
    this.settings.set(settings);
    this.enabled.set(settings.enabled);
    this.mode.set(settings.mode === 'whistleblowing' ? 'whistleblowing' : 'anonymous');
    this.defaultTypeId.set(settings.default_type_id ?? '');
    this.instructions.set(settings.instructions ?? '');
    this.allowContact.set(settings.allow_contact);
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.deviations.listTypes(orgId).subscribe({
      next: (types) => this.types.set(types.filter((t) => t.is_active)),
    });
    this.api.getSettings(orgId).subscribe({
      next: (settings) => {
        this.apply(settings);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
