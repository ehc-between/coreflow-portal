import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  AI_ACT_ROLES,
  CERTIFICATION_STATUSES,
  FRAMEWORK_KEYS,
  OrgProfile,
  ProfileStandard,
  SIZE_BANDS,
} from '../../../core/modules/module.models';
import { providePageContext } from '../../../core/ai/page-context';
import { CountryPicker } from '../../../shared/ui/country-picker/country-picker';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ModulesApi } from '../../../core/modules/modules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import { frameworkDescriptionKey, frameworkNameKey, frameworkShortKey } from '../frameworks';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import {
  PROFILE_COUNTRY_CODES,
  SITE_KINDS,
  createProfileForm,
  parseCountries,
  patchProfileForm,
  readProfileForm,
  selectedFrameworks,
  siteGroup,
  targetGroup,
} from './profile-form';

/**
 * Settings → Organisation profile (`org:manage`): industry, size, countries,
 * sites, the frameworks in scope, certification targets, the AI Act role and a
 * short description. The profile drives the setup wizard's module
 * recommendations and gives the assistant context about the organisation.
 */
@Component({
  selector: 'app-org-profile',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Alert,
    Button,
    Card,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    LoadingState,
    Icon,
    HelpStrip,
    WhyItMatters,
    CountryPicker,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = 'modules.profile';
    @let help = 'modules.guide.pages.profile.fields';
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="p + '.title'"
        [descriptionKey]="p + '.subtitle'"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: p + '.title' },
        ]"
      >
        @if (profile()?.updated_at; as updated) {
          <p meta class="text-meta text-fg-subtle">
            {{ p + '.lastUpdated' | transloco: { date: (updated | localDate) } }}
          </p>
        }
        <app-button secondary variant="secondary" size="sm" (click)="askAiRole()">
          <app-icon name="spark" [size]="15" />
          {{ p + '.askAiRole' | transloco }}
        </app-button>
      </app-page-header>

      <app-help-strip scope="settings" page="profile" />

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-body text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (loading()) {
        <app-loading-state [rows]="5" />
      } @else {
        <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <app-form-section
            [title]="p + '.sections.basics' | transloco"
            [description]="p + '.sections.basicsHint' | transloco"
          >
            <app-form-field
              inputId="profile-industry"
              [label]="p + '.industry' | transloco"
              [hint]="help + '.industry.help' | transloco"
            >
              <input
                id="profile-industry"
                type="text"
                formControlName="industry"
                maxlength="64"
                autocomplete="off"
              />
            </app-form-field>
            <app-form-field inputId="profile-size" [label]="p + '.sizeBand' | transloco">
              <select id="profile-size" formControlName="size_band">
                <option value="">{{ 'modules.common.notSet' | transloco }}</option>
                @for (band of sizeBands; track band) {
                  <option [value]="band">{{ 'modules.sizeBands.' + band | transloco }}</option>
                }
              </select>
            </app-form-field>
            <app-form-field
              span="full"
              inputId="profile-countries"
              [label]="p + '.countries' | transloco"
              [hint]="help + '.countries.help' | transloco"
              [error]="
                form.controls.countries.invalid && form.controls.countries.touched
                  ? (p + '.errors.countries' | transloco)
                  : ''
              "
            >
              <app-country-picker
                inputId="profile-countries"
                [options]="countryCodes"
                [value]="countryList()"
                [label]="p + '.countries' | transloco"
                (valueChange)="setCountries($event)"
              />
            </app-form-field>
            <app-form-field
              span="full"
              inputId="profile-description"
              [label]="p + '.description' | transloco"
              [hint]="help + '.description.help' | transloco"
            >
              <textarea
                id="profile-description"
                rows="4"
                formControlName="description"
                maxlength="5000"
              ></textarea>
            </app-form-field>
            <app-form-field inputId="profile-orgnr" [label]="p + '.orgNumber' | transloco">
              <input
                id="profile-orgnr"
                type="text"
                formControlName="org_number"
                maxlength="32"
                inputmode="numeric"
                autocomplete="off"
              />
            </app-form-field>
            <app-form-field inputId="profile-address" [label]="p + '.address' | transloco">
              <input
                id="profile-address"
                type="text"
                formControlName="address"
                maxlength="500"
                autocomplete="street-address"
              />
            </app-form-field>
            <app-form-field
              span="full"
              inputId="profile-products"
              [label]="p + '.productsServices' | transloco"
              [hint]="p + '.factsHint' | transloco"
            >
              <textarea
                id="profile-products"
                rows="3"
                formControlName="products_services"
                maxlength="5000"
              ></textarea>
            </app-form-field>
          </app-form-section>

          <section
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-border bg-surface px-4 py-3.5 shadow-card sm:px-5"
          >
            <div class="min-w-0 flex-1 basis-[min(100%,320px)]">
              <h2 class="font-display text-card font-bold text-fg">
                {{ p + '.scopeTitle' | transloco }}
              </h2>
              <p class="mt-0.5 max-w-[68ch] text-meta leading-snug text-fg-muted">
                {{ p + '.scopeBody' | transloco }}
              </p>
            </div>
            <a
              routerLink="/context/scopes"
              class="inline-flex min-h-8 items-center text-ui font-semibold text-accent hover:underline"
              data-testid="profile-scope-link"
              >{{ p + '.scopeLink' | transloco }}</a
            >
          </section>

          <app-form-section
            [title]="p + '.sections.frameworks' | transloco"
            [description]="help + '.frameworks.help' | transloco"
          >
            <fieldset class="min-w-0 sm:col-span-2">
              <legend class="sr-only">{{ p + '.sections.frameworks' | transloco }}</legend>
              <div class="grid gap-2 sm:grid-cols-2" formGroupName="frameworks">
                @for (fw of frameworks; track fw) {
                  <label
                    class="flex h-full cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      class="mt-1 accent-[var(--accent)]"
                      [formControlName]="fw"
                    />
                    <span class="min-w-0">
                      <span class="block text-ui font-semibold text-fg">{{
                        frameworkNameKey(fw) | transloco
                      }}</span>
                      <span class="block text-meta text-fg-muted">{{
                        frameworkDescriptionKey(fw) | transloco
                      }}</span>
                      @if (standardOf(fw); as std) {
                        @if (std.standard_enabled && std.standard_key) {
                          <a
                            class="mt-1 inline-flex text-meta font-semibold text-accent hover:underline"
                            [routerLink]="['/standards', std.standard_key]"
                            data-testid="profile-standard-link"
                            >{{ p + '.standardOn' | transloco }}</a
                          >
                        } @else if (!std.available) {
                          <span class="mt-1 block text-meta text-fg-subtle">{{
                            p + '.standardUnavailable' | transloco
                          }}</span>
                        } @else {
                          <span class="mt-1 block text-meta text-fg-subtle">{{
                            p + '.standardOff' | transloco
                          }}</span>
                        }
                      }
                    </span>
                  </label>
                }
              </div>
              <p class="mt-3 text-meta leading-snug text-fg-subtle">
                {{ p + '.frameworksSync' | transloco }}
                <a routerLink="/standards" class="font-semibold text-accent hover:underline">{{
                  p + '.openStandards' | transloco
                }}</a>
              </p>
            </fieldset>
          </app-form-section>

          <app-form-section
            [title]="p + '.aiActRole' | transloco"
            [description]="help + '.aiActRole.help' | transloco"
          >
            <fieldset class="min-w-0 sm:col-span-2">
              <legend class="sr-only">{{ p + '.aiActRole' | transloco }}</legend>
              <div class="grid gap-2 sm:grid-cols-2">
                @for (role of aiActRoles; track role) {
                  <label
                    class="flex h-full cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                  >
                    <input
                      type="radio"
                      class="mt-1 accent-[var(--accent)]"
                      formControlName="ai_act_role"
                      [value]="role"
                    />
                    <span class="min-w-0">
                      <span class="block text-ui font-semibold text-fg">{{
                        'modules.aiActRoles.' + role + '.name' | transloco
                      }}</span>
                      <span class="block text-meta text-fg-muted">{{
                        'modules.aiActRoles.' + role + '.description' | transloco
                      }}</span>
                    </span>
                  </label>
                }
              </div>
            </fieldset>
          </app-form-section>

          <app-form-section
            [title]="p + '.sections.targets' | transloco"
            [description]="help + '.targets.help' | transloco"
          >
            <p
              class="flex flex-wrap items-center gap-x-2 rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted sm:col-span-2"
              data-testid="profile-certificates-link"
            >
              {{ p + '.certificatesLive' | transloco }}
              <a
                routerLink="/audits/certifications"
                class="font-semibold text-accent hover:underline"
                >{{ p + '.openCertificates' | transloco }}</a
              >
            </p>
            <div class="flex flex-col gap-3 sm:col-span-2">
              @if (form.controls.certification_targets.length === 0) {
                <p
                  class="rounded-tile border border-dashed border-border px-3 py-4 text-center text-ui text-fg-muted"
                >
                  {{ p + '.noTargets' | transloco }}
                </p>
              }
              <ol class="flex flex-col gap-3 empty:hidden" formArrayName="certification_targets">
                @for (
                  row of form.controls.certification_targets.controls;
                  track row;
                  let i = $index
                ) {
                  <li class="rounded-tile border border-border p-3 sm:p-4" [formGroupName]="i">
                    <div class="flex items-start gap-2">
                      <span
                        class="mt-8 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-2 text-micro font-bold text-fg-muted"
                        aria-hidden="true"
                        >{{ i + 1 }}</span
                      >
                      <div class="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <app-form-field
                          [inputId]="'target-fw-' + i"
                          [label]="p + '.targetFramework' | transloco"
                        >
                          <select [id]="'target-fw-' + i" formControlName="framework">
                            @for (fw of frameworks; track fw) {
                              <option [value]="fw">{{ frameworkShortKey(fw) | transloco }}</option>
                            }
                          </select>
                        </app-form-field>
                        <app-form-field
                          [inputId]="'target-status-' + i"
                          [label]="p + '.targetStatus' | transloco"
                        >
                          <select [id]="'target-status-' + i" formControlName="status">
                            @for (status of statuses; track status) {
                              <option [value]="status">
                                {{ 'modules.certificationStatus.' + status | transloco }}
                              </option>
                            }
                          </select>
                        </app-form-field>
                        <app-form-field
                          [inputId]="'target-date-' + i"
                          [label]="p + '.targetDate' | transloco"
                        >
                          <app-date-input
                            [inputId]="'target-date-' + i"
                            formControlName="target_date"
                          />
                        </app-form-field>
                        <app-form-field
                          [inputId]="'target-body-' + i"
                          [label]="p + '.certificationBody' | transloco"
                        >
                          <input
                            [id]="'target-body-' + i"
                            type="text"
                            formControlName="certification_body"
                            maxlength="200"
                          />
                        </app-form-field>
                      </div>
                      <span class="mt-7">
                        <app-button
                          variant="ghost"
                          size="sm"
                          [attr.aria-label]="'modules.common.remove' | transloco"
                          [attr.title]="'modules.common.remove' | transloco"
                          (click)="removeTarget(i)"
                        >
                          <app-icon name="trash" [size]="14" />
                        </app-button>
                      </span>
                    </div>
                  </li>
                }
              </ol>
              <div>
                <app-button variant="secondary" size="sm" (click)="addTarget()">
                  <app-icon name="plus" [size]="14" /> {{ p + '.addTarget' | transloco }}
                </app-button>
              </div>
            </div>
          </app-form-section>

          <app-form-section
            [title]="p + '.sections.sites' | transloco"
            [description]="help + '.sites.help' | transloco"
          >
            <div class="flex flex-col gap-3 sm:col-span-2">
              @if (form.controls.sites.length === 0) {
                <p
                  class="rounded-tile border border-dashed border-border px-3 py-4 text-center text-ui text-fg-muted"
                >
                  {{ p + '.noSites' | transloco }}
                </p>
              }
              <ol class="flex flex-col gap-3 empty:hidden" formArrayName="sites">
                @for (row of form.controls.sites.controls; track row; let i = $index) {
                  <li class="rounded-tile border border-border p-3 sm:p-4" [formGroupName]="i">
                    <div class="flex items-start gap-2">
                      <span
                        class="mt-8 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-2 text-micro font-bold text-fg-muted"
                        aria-hidden="true"
                        >{{ i + 1 }}</span
                      >
                      <div class="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <app-form-field
                          [inputId]="'site-name-' + i"
                          [label]="p + '.siteName' | transloco"
                        >
                          <input
                            [id]="'site-name-' + i"
                            type="text"
                            formControlName="name"
                            maxlength="200"
                          />
                        </app-form-field>
                        <app-form-field
                          [inputId]="'site-kind-' + i"
                          [label]="p + '.siteKind' | transloco"
                        >
                          <select [id]="'site-kind-' + i" formControlName="kind">
                            <option value="">{{ p + '.siteKindNone' | transloco }}</option>
                            @for (kind of siteKinds; track kind) {
                              <option [value]="kind">
                                {{ p + '.siteKinds.' + kind | transloco }}
                              </option>
                            }
                            @if (row.controls.kind.value && !isKnownKind(row.controls.kind.value)) {
                              <option [value]="row.controls.kind.value">
                                {{ row.controls.kind.value }}
                              </option>
                            }
                          </select>
                        </app-form-field>
                        <app-form-field
                          [inputId]="'site-country-' + i"
                          [label]="p + '.siteCountry' | transloco"
                        >
                          <app-country-picker
                            [inputId]="'site-country-' + i"
                            [multiple]="false"
                            [options]="countryCodes"
                            [value]="row.controls.country.value ? [row.controls.country.value] : []"
                            (valueChange)="setSiteCountry(i, $event[0] ?? '')"
                          />
                        </app-form-field>
                        <app-form-field
                          [inputId]="'site-city-' + i"
                          [label]="p + '.siteCity' | transloco"
                        >
                          <input
                            [id]="'site-city-' + i"
                            type="text"
                            formControlName="city"
                            maxlength="200"
                          />
                        </app-form-field>
                        @if (row.invalid && row.touched) {
                          <p role="alert" class="text-meta font-medium text-fail-ink sm:col-span-2">
                            {{ p + '.errors.site' | transloco }}
                          </p>
                        }
                      </div>
                      <span class="mt-7">
                        <app-button
                          variant="ghost"
                          size="sm"
                          [attr.aria-label]="'modules.common.remove' | transloco"
                          [attr.title]="'modules.common.remove' | transloco"
                          (click)="removeSite(i)"
                        >
                          <app-icon name="trash" [size]="14" />
                        </app-button>
                      </span>
                    </div>
                  </li>
                }
              </ol>
              <div>
                <app-button variant="secondary" size="sm" (click)="addSite()">
                  <app-icon name="plus" [size]="14" /> {{ p + '.addSite' | transloco }}
                </app-button>
              </div>
            </div>
          </app-form-section>

          @if (error()) {
            <app-alert>{{ 'modules.profile.errors.save' | transloco }}</app-alert>
          }

          <app-form-actions
            [message]="form.invalid && form.touched ? (p + '.errors.fix' | transloco) : ''"
          >
            <app-button type="button" variant="secondary" (click)="reset()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">{{
              'common.save' | transloco
            }}</app-button>
          </app-form-actions>
        </form>
      }

      <app-why-it-matters class="mt-6 block" scope="settings" page="profile" />
    </div>
  `,
})
export class OrgProfilePage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ModulesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly ask = inject(AskPanelService);

  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly sizeBands = SIZE_BANDS;
  protected readonly aiActRoles = AI_ACT_ROLES;
  protected readonly statuses = CERTIFICATION_STATUSES;
  protected readonly frameworkShortKey = frameworkShortKey;
  protected readonly frameworkNameKey = frameworkNameKey;
  protected readonly frameworkDescriptionKey = frameworkDescriptionKey;

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly profile = signal<OrgProfile | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);

  protected readonly form = createProfileForm(this.fb);
  protected readonly countryCodes = PROFILE_COUNTRY_CODES;
  protected readonly siteKinds = SITE_KINDS;
  /** Bumped when the countries control changes, so the picker re-reads it. */
  private readonly countriesRevision = signal(0);
  protected readonly countryList = computed(() => {
    this.countriesRevision();
    return parseCountries(this.form.controls.countries.value);
  });

  protected standardOf(framework: string): ProfileStandard | null {
    return this.profile()?.standards?.find((s) => s.framework === framework) ?? null;
  }

  protected setCountries(codes: readonly string[]): void {
    this.form.controls.countries.setValue(codes.join(', '));
    this.form.controls.countries.markAsDirty();
    this.countriesRevision.update((n) => n + 1);
  }

  protected setSiteCountry(index: number, code: string): void {
    const control = this.form.controls.sites.at(index)?.controls.country;
    control?.setValue(code);
    control?.markAsDirty();
  }

  protected isKnownKind(kind: string): boolean {
    return (SITE_KINDS as readonly string[]).includes(kind);
  }

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'org_profile',
      view: 'settings',
      title: this.transloco.translate('modules.profile.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.profile.set(null);
        if (orgId) {
          this.load(orgId);
        }
      });
    });
  }

  protected addSite(): void {
    this.form.controls.sites.push(siteGroup(this.fb));
  }

  protected removeSite(index: number): void {
    this.form.controls.sites.removeAt(index);
    this.form.markAsDirty();
  }

  protected addTarget(): void {
    const group = targetGroup(this.fb);
    const chosen = selectedFrameworks(this.form)[0];
    if (chosen) {
      group.controls.framework.setValue(chosen);
    }
    this.form.controls.certification_targets.push(group);
  }

  protected removeTarget(index: number): void {
    this.form.controls.certification_targets.removeAt(index);
    this.form.markAsDirty();
  }

  protected reset(): void {
    const profile = this.profile();
    if (profile) {
      patchProfileForm(this.fb, this.form, profile);
      this.form.markAsPristine();
      this.error.set(false);
    }
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(false);
    this.api.updateProfile(orgId, readProfileForm(this.form)).subscribe({
      next: (profile) => {
        this.saving.set(false);
        this.profile.set(profile);
        patchProfileForm(this.fb, this.form, profile);
        this.form.markAsPristine();
        this.countriesRevision.update((n) => n + 1);
        this.notifications.success('modules.profile.savedToast');
      },
      error: () => {
        this.saving.set(false);
        this.error.set(true);
      },
    });
  }

  protected askAiRole(): void {
    const value = readProfileForm(this.form);
    this.ask.showWith(
      this.transloco.translate('modules.profile.askAiRolePrompt', {
        industry: value.industry ?? '-',
        role: this.transloco.translate(`modules.aiActRoles.${value.ai_act_role}.name`),
      }),
    );
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.api.getProfile(orgId).subscribe({
      next: (profile) => {
        if (this.orgId() !== orgId) {
          return;
        }
        this.profile.set(profile);
        patchProfileForm(this.fb, this.form, profile);
        this.form.markAsPristine();
        this.countriesRevision.update((n) => n + 1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
