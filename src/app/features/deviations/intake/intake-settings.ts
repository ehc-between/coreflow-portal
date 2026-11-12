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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { DeviationType } from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import { INTAKE_MODES, IntakeMode, IntakeSettings } from '../../../core/deviations/intake.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { DeviationPageGuide } from '../guide/deviation-page-guide';

/** The absolute URL of the public form for a settings `public_path`. */
export function publicUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
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
    RouterLink,
    TranslocoPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Switch,
    FieldHelp,
    DeviationPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/deviations/intake"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.intake.backToInbox' | transloco }}
      </a>
      <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg sm:text-[26px]">
        {{ 'deviations.intake.settings.title' | transloco }}
      </h1>
      <p class="mt-1.5 mb-4 text-[14px] text-fg-muted">
        {{ 'deviations.intake.settings.subtitle' | transloco }}
      </p>

      <app-deviation-page-guide class="mb-5" page="intakeSettings" lesson="speaking-up" />

      @if (loading()) {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else if (settings(); as current) {
        <form class="flex flex-col gap-5" (ngSubmit)="save()">
          <app-card>
            <div class="flex flex-col gap-4">
              <app-switch [checked]="enabled()" (checkedChange)="enabled.set($event)">
                {{ 'deviations.intake.settings.enabled' | transloco }}
              </app-switch>

              <fieldset class="flex flex-col gap-2">
                <legend
                  class="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted"
                >
                  {{ 'deviations.intake.settings.mode' | transloco }}
                  <app-field-help scope="deviations" page="intakeSettings" field="mode" />
                </legend>
                @for (option of modes; track option) {
                  <label
                    class="flex items-start gap-2 rounded-tile border border-border p-3 text-[13px]"
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
                <label for="intake-type" class="text-[13px] font-semibold text-fg-muted">
                  {{ 'deviations.intake.settings.defaultType' | transloco }}
                </label>
                <select
                  id="intake-type"
                  name="defaultType"
                  [ngModel]="defaultTypeId()"
                  (ngModelChange)="defaultTypeId.set($event)"
                  class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
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
                <label for="intake-instructions" class="text-[13px] font-semibold text-fg-muted">
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
                  class="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
                ></textarea>
              </div>

              <app-switch [checked]="allowContact()" (checkedChange)="allowContact.set($event)">
                {{ 'deviations.intake.settings.allowContact' | transloco }}
              </app-switch>
            </div>
          </app-card>

          <div class="flex items-center gap-2">
            <app-button type="submit" [loading]="saving()">
              {{ 'deviations.intake.settings.save' | transloco }}
            </app-button>
          </div>
        </form>

        <app-card class="mt-5">
          <h2 class="mb-2 font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
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
              class="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 font-mono text-[12.5px] text-fg"
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
          <p class="mt-2 text-[12.5px] text-fg-muted">
            {{ 'deviations.intake.settings.privacyNote' | transloco }}
          </p>
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
  `,
})
export class IntakeSettingsPage {
  private readonly api = inject(DeviationIntakeApi);
  private readonly deviations = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

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
    providePageContext(() => ({ module: 'deviations', view: 'settings' }));
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
