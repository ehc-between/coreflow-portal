import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { PrivacyApi } from './data/privacy-api';
import {
  PERM_MANAGE,
  PrivacySettings,
  PrivacySettingsBody,
  SETTINGS_FIELDS,
  SettingsField,
} from './data/privacy.models';
import { privacyError } from './data/privacy-errors';
import { privacyPermissions } from './privacy-nav';
import { ModuleConfigNav } from '../../shared/ui/module-config-nav/module-config-nav';
import { moduleConfigCrumbs } from '../../core/modules/module-config';

/** Long texts (address, representative) get a text area. */
const MULTILINE = new Set<SettingsField>(['controller_contact', 'representative']);

/**
 * Privacy settings (`/settings/modules/privacy`): who the controller is and how to reach the
 * data protection officer (Art. 13(1)(a)-(b), 30(1)(a), 37). They head the exported
 * record of processing and the privacy notices, and the overview's "start here"
 * counts them as the first step. Read by every privacy reader; changed by
 * `privacy:manage`.
 */
@Component({
  selector: 'app-privacy-settings',
  imports: [
    TranslocoPipe,
    FieldHelp,
    Alert,
    Button,
    Card,
    ErrorState,
    FormField,
    HelpStrip,
    LoadingState,
    ModuleConfigNav,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="privacy.settings.title"
        descriptionKey="privacy.settings.subtitle"
        [breadcrumbs]="breadcrumbs"
      />
      <app-module-config-nav module="privacy" />
      <app-help-strip scope="privacy" page="settings" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            @for (group of groups; track group.key) {
              <app-card>
                <h2 class="mb-4 font-display text-section font-bold text-fg">
                  {{ 'privacy.settings.sections.' + group.key | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  @for (f of group.fields; track f) {
                    <div [class.sm:col-span-2]="multiline(f)">
                      <app-form-field [inputId]="'cf-ps-' + f">
                        <div class="flex flex-wrap items-center gap-x-1.5">
                          <label [for]="'cf-ps-' + f" class="text-ui font-semibold text-fg-muted">
                            {{ 'privacy.settings.fields.' + f | transloco }}
                          </label>
                          <app-field-help scope="privacy" page="settings" [field]="f" />
                        </div>
                        @if (multiline(f)) {
                          <textarea
                            [id]="'cf-ps-' + f"
                            rows="3"
                            maxlength="10000"
                            [readOnly]="!canManage()"
                            [value]="value(f)"
                            (input)="set(f, $any($event.target).value)"
                            [attr.data-testid]="'settings-' + f"
                          ></textarea>
                        } @else {
                          <input
                            [id]="'cf-ps-' + f"
                            [type]="
                              f === 'dpo_email' ? 'email' : f === 'dpo_phone' ? 'tel' : 'text'
                            "
                            [attr.maxlength]="f === 'dpo_phone' ? 64 : 255"
                            [readOnly]="!canManage()"
                            [value]="value(f)"
                            (input)="set(f, $any($event.target).value)"
                            [attr.data-testid]="'settings-' + f"
                          />
                        }
                      </app-form-field>
                    </div>
                  }
                </div>
              </app-card>
            }

            @if (error(); as e) {
              <app-alert tone="error" data-testid="settings-error">{{ e | transloco }}</app-alert>
            }
            @if (canManage()) {
              <div class="flex justify-end">
                <app-button
                  type="submit"
                  [loading]="busy()"
                  [disabled]="!dirty()"
                  data-testid="settings-save"
                >
                  {{ 'privacy.settings.save' | transloco }}
                </app-button>
              </div>
            } @else {
              <p class="text-meta text-fg-subtle">{{ 'privacy.settings.readOnly' | transloco }}</p>
            }
          </form>
        }
      }
    </div>
  `,
})
export class PrivacySettingsPage {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);
  private readonly perms = privacyPermissions();

  protected readonly breadcrumbs: readonly Breadcrumb[] = [
    ...moduleConfigCrumbs('privacy'),
    { labelKey: 'privacy.settings.title' },
  ];
  protected readonly groups: readonly { key: string; fields: readonly SettingsField[] }[] = [
    { key: 'controller', fields: ['controller_name', 'controller_contact', 'representative'] },
    { key: 'dpo', fields: ['dpo_name', 'dpo_email', 'dpo_phone'] },
  ];

  protected readonly canManage = computed(() => this.perms().has(PERM_MANAGE));
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly stored = signal<PrivacySettings | null>(null);
  private readonly draft = signal<Partial<Record<SettingsField, string>>>({});
  protected readonly dirty = computed(() =>
    SETTINGS_FIELDS.some((f) => (this.draft()[f] ?? '') !== (this.stored()?.[f] ?? '')),
  );

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    providePageContext(() => ({
      module: 'privacy',
      view: 'settings',
      title: this.language.translate('privacy.settings.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected multiline(f: SettingsField): boolean {
    return MULTILINE.has(f);
  }

  protected value(f: SettingsField): string {
    return this.draft()[f] ?? '';
  }

  protected set(f: SettingsField, value: string): void {
    this.draft.update((d) => ({ ...d, [f]: value }));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  private apply(s: PrivacySettings): void {
    this.stored.set(s);
    const draft: Partial<Record<SettingsField, string>> = {};
    for (const f of SETTINGS_FIELDS) {
      draft[f] = s[f] ?? '';
    }
    this.draft.set(draft);
  }

  private load(orgId: string | null): void {
    this.sub.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = this.api.settings(orgId).subscribe({
      next: (s) => {
        this.apply(s);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy() || !this.canManage()) {
      return;
    }
    const body: Record<string, string | null> = {};
    for (const f of SETTINGS_FIELDS) {
      const next = (this.draft()[f] ?? '').trim();
      if (next !== (this.stored()?.[f] ?? '')) {
        body[f] = next || null;
      }
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.saveSettings(orgId, body as PrivacySettingsBody).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.apply(s);
        this.notify.success('privacy.settings.saved');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(privacyError(err).key);
      },
    });
  }
}
