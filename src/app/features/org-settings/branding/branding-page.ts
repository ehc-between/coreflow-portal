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
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { OutputsApi } from '../../../core/outputs/outputs-api';
import {
  Branding,
  BrandingUpdate,
  CLASSIFICATIONS,
  Classification,
  FOOTER_MAX_LENGTH,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  OUTPUT_LANGS,
  OutputLang,
} from '../../../core/outputs/outputs.models';
import { OUTPUTS_SCOPE, outputErrorKey } from '../../../shared/outputs/output-display';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';

const HEX = /^#[0-9a-fA-F]{6}$/;

interface Form {
  readonly accent: string;
  readonly footer: string;
  readonly classification: string;
  readonly lang: string;
}

function formOf(b: Branding): Form {
  return {
    accent: b.accent_color ?? '',
    footer: b.footer_text ?? '',
    classification: b.classification ?? '',
    lang: b.default_lang ?? '',
  };
}

/**
 * Settings → Merkevare (U11): the logo, accent colour, footer text, default
 * classification and default language of every generated PDF and Word file
 * (the shared document chrome). Needs `org:manage`.
 */
@Component({
  selector: 'app-branding-page',
  imports: [
    TranslocoPipe,
    Alert,
    Button,
    ErrorState,
    FormActions,
    FormField,
    FormSection,
    Icon,
    LoadingState,
    PageHeader,
  ],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="outputs.branding.title"
        descriptionKey="outputs.branding.description"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'outputs.branding.title' },
        ]"
      />

      @if (loadError()) {
        <app-error-state (retry)="reload()" />
      } @else if (!branding()) {
        <app-loading-state [rows]="5" />
      } @else {
        <app-form-section
          [title]="'outputs.branding.logo' | transloco"
          [description]="'outputs.branding.logoHint' | transloco"
          data-testid="branding-logo"
        >
          <div class="flex flex-wrap items-center gap-4 sm:col-span-2">
            <div
              class="flex h-16 w-40 items-center justify-center rounded-tile border border-dashed border-border bg-surface-2"
            >
              @if (logoUrl(); as url) {
                <img
                  [src]="url"
                  [alt]="'outputs.branding.logoAlt' | transloco"
                  class="max-h-14 max-w-36 object-contain"
                />
              } @else {
                <span class="text-meta text-fg-subtle">{{
                  'outputs.branding.noLogo' | transloco
                }}</span>
              }
            </div>
            <div class="flex flex-wrap gap-2">
              <label
                class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-surface px-4 text-ui font-semibold text-fg hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent"
              >
                <app-icon name="upload" [size]="15" />
                {{
                  (branding()!.has_logo
                    ? 'outputs.branding.replaceLogo'
                    : 'outputs.branding.uploadLogo'
                  ) | transloco
                }}
                <input
                  type="file"
                  class="sr-only"
                  accept="image/png,image/jpeg"
                  data-testid="branding-logo-input"
                  (change)="pickLogo($event)"
                />
              </label>
              @if (branding()!.has_logo) {
                <app-button
                  variant="ghost"
                  [loading]="logoBusy()"
                  (click)="removeLogo()"
                  data-testid="branding-logo-remove"
                >
                  {{ 'outputs.branding.removeLogo' | transloco }}
                </app-button>
              }
            </div>
          </div>
          @if (logoError(); as key) {
            <p
              class="text-meta font-medium text-fail-ink sm:col-span-2"
              role="alert"
              data-testid="branding-logo-error"
            >
              {{ key | transloco }}
            </p>
          }
        </app-form-section>

        <form
          class="mt-5 flex flex-col gap-5"
          (submit)="$event.preventDefault(); save()"
          data-testid="branding-form"
        >
          <app-form-section
            [title]="'outputs.branding.documentTitle' | transloco"
            [description]="'outputs.branding.documentHint' | transloco"
          >
            <app-form-field
              [label]="'outputs.branding.accent' | transloco"
              inputId="branding-accent"
              [error]="accentInvalid() ? ('outputs.branding.accentInvalid' | transloco) : ''"
            >
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  class="cf-bare h-10 w-12 shrink-0 cursor-pointer rounded-tile border border-border bg-surface p-1"
                  [attr.aria-label]="'outputs.branding.accent' | transloco"
                  [value]="form().accent || branding()!.default_accent"
                  (input)="patch({ accent: asValue($event) })"
                />
                <input
                  id="branding-accent"
                  type="text"
                  maxlength="7"
                  class="font-mono"
                  [placeholder]="branding()!.default_accent"
                  [value]="form().accent"
                  (input)="patch({ accent: asValue($event) })"
                  data-testid="branding-accent"
                />
              </div>
            </app-form-field>
            <app-form-field
              [label]="'outputs.branding.classification' | transloco"
              inputId="branding-classification"
            >
              <select
                id="branding-classification"
                [value]="form().classification"
                (change)="patch({ classification: asValue($event) })"
                data-testid="branding-classification"
              >
                <option value="">{{ 'outputs.branding.none' | transloco }}</option>
                @for (c of classifications; track c) {
                  <option [value]="c" [selected]="c === form().classification">
                    {{ 'outputs.classification.' + c | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              span="full"
              [label]="'outputs.branding.footer' | transloco"
              inputId="branding-footer"
              [hint]="
                'outputs.branding.footerHint'
                  | transloco: { count: form().footer.length, max: footerMax }
              "
            >
              <textarea
                id="branding-footer"
                rows="2"
                [attr.maxlength]="footerMax"
                [value]="form().footer"
                (input)="patch({ footer: asValue($event) })"
                data-testid="branding-footer"
              ></textarea>
            </app-form-field>
            <app-form-field [label]="'outputs.branding.lang' | transloco" inputId="branding-lang">
              <select
                id="branding-lang"
                [value]="form().lang"
                (change)="patch({ lang: asValue($event) })"
                data-testid="branding-lang"
              >
                <option value="">{{ 'outputs.branding.langAuto' | transloco }}</option>
                @for (l of langs; track l) {
                  <option [value]="l" [selected]="l === form().lang">
                    {{ 'outputs.langs.' + l | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </app-form-section>

          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <app-form-actions>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="!dirty() || accentInvalid()"
              data-testid="branding-save"
            >
              {{ 'outputs.branding.save' | transloco }}
            </app-button>
          </app-form-actions>
        </form>
      }
    </div>
  `,
})
export class BrandingPage {
  private readonly api = inject(OutputsApi);
  private readonly notifications = inject(NotificationService);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly classifications = CLASSIFICATIONS;
  protected readonly langs = OUTPUT_LANGS;
  protected readonly footerMax = FOOTER_MAX_LENGTH;

  protected readonly branding = signal<Branding | null>(null);
  protected readonly form = signal<Form>({ accent: '', footer: '', classification: '', lang: '' });
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly logoBusy = signal(false);
  protected readonly logoError = signal<string | null>(null);
  protected readonly logoUrl = signal<string | null>(null);
  private readonly reloads = signal(0);

  protected readonly accentInvalid = computed(() => {
    const accent = this.form().accent.trim();
    return accent !== '' && !HEX.test(accent);
  });
  protected readonly dirty = computed(() => {
    const b = this.branding();
    return !!b && JSON.stringify(formOf(b)) !== JSON.stringify(this.trimmed());
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.reloads();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId));
    });
    inject(DestroyRef).onDestroy(() => this.setLogoUrl(null));
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  private load(orgId: string): void {
    this.loadError.set(false);
    this.api.branding(orgId).subscribe({
      next: (b) => this.apply(orgId, b),
      error: () => this.loadError.set(true),
    });
  }

  private apply(orgId: string, b: Branding): void {
    this.branding.set(b);
    this.form.set(formOf(b));
    if (b.has_logo) {
      // The logo needs the bearer, so it is fetched as a blob, not an <img src> URL.
      this.api.logo(orgId).subscribe({
        next: (blob) => this.setLogoUrl(URL.createObjectURL(blob)),
        error: () => this.setLogoUrl(null),
      });
    } else {
      this.setLogoUrl(null);
    }
  }

  private setLogoUrl(url: string | null): void {
    const old = this.logoUrl();
    if (old) {
      URL.revokeObjectURL(old);
    }
    this.logoUrl.set(url);
  }

  private trimmed(): Form {
    const f = this.form();
    return { ...f, accent: f.accent.trim(), footer: f.footer.trim() };
  }

  protected patch(change: Partial<Form>): void {
    this.form.update((f) => ({ ...f, ...change }));
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const b = this.branding();
    if (!orgId || !b || !this.dirty() || this.accentInvalid()) {
      return;
    }
    const before = formOf(b);
    const after = this.trimmed();
    const body: { -readonly [K in keyof BrandingUpdate]: BrandingUpdate[K] } = {};
    if (after.accent !== before.accent) {
      body.accent_color = after.accent || null;
    }
    if (after.footer !== before.footer) {
      body.footer_text = after.footer || null;
    }
    if (after.classification !== before.classification) {
      body.classification = (after.classification || null) as Classification | null;
    }
    if (after.lang !== before.lang) {
      body.default_lang = (after.lang || null) as OutputLang | null;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api.updateBranding(orgId, body).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.branding.set(saved);
        this.form.set(formOf(saved));
        this.notifications.success('outputs.branding.saved');
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(outputErrorKey(err));
      },
    });
  }

  protected pickLogo(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    const orgId = this.selectedOrg.currentOrgId();
    if (!file || !orgId) {
      return;
    }
    this.logoError.set(null);
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      this.logoError.set('outputs.errors.unsupported_logo_type');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.logoError.set('outputs.errors.logo_too_large');
      return;
    }
    this.logoBusy.set(true);
    this.api.uploadLogo(orgId, file).subscribe({
      next: (saved) => {
        this.logoBusy.set(false);
        this.apply(orgId, saved);
        this.notifications.success('outputs.branding.logoSaved');
      },
      error: (err) => {
        this.logoBusy.set(false);
        this.logoError.set(outputErrorKey(err));
      },
    });
  }

  protected removeLogo(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.logoBusy.set(true);
    this.logoError.set(null);
    this.api.deleteLogo(orgId).subscribe({
      next: (saved) => {
        this.logoBusy.set(false);
        this.apply(orgId, saved);
      },
      error: (err) => {
        this.logoBusy.set(false);
        this.logoError.set(outputErrorKey(err));
      },
    });
  }
}
