import {
  ChangeDetectionStrategy,
  Component,
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
  SIZE_BANDS,
} from '../../../core/modules/module.models';
import { ModulesApi } from '../../../core/modules/modules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { AskPanelService } from '../../ask/ask-panel.service';
import {
  GUIDE_CLAUSES,
  frameworkDescriptionKey,
  frameworkNameKey,
  frameworkShortKey,
} from '../frameworks';
import { ModulesGuide } from '../guide/modules-guide';
import {
  createProfileForm,
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
    FormField,
    Icon,
    ModulesGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = 'modules.profile';
    @let help = 'modules.guide.pages.profile.fields';
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <nav class="mb-2 text-[13px]" [attr.aria-label]="'modules.common.breadcrumb' | transloco">
        <a routerLink="/settings" class="font-semibold text-accent hover:underline">
          {{ 'nav.settings' | transloco }}
        </a>
      </nav>
      <div class="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ p + '.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ p + '.subtitle' | transloco }}</p>
          @if (profile()?.updated_at; as updated) {
            <p class="mt-1 text-[12.5px] text-fg-subtle">
              {{ p + '.lastUpdated' | transloco: { date: (updated | localDate) } }}
            </p>
          }
        </div>
        <app-button variant="secondary" size="sm" (click)="askAiRole()">
          <app-icon name="spark" [size]="15" />
          {{ p + '.askAiRole' | transloco }}
        </app-button>
      </div>

      <app-modules-guide class="mb-5 block" page="profile" [steps]="3" [clauses]="clauses" />

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-[14px] text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else if (loading()) {
        <app-card>
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else {
        <form class="flex flex-col gap-5" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <app-card>
            <h2 class="mb-3 text-[16px] font-bold text-fg">
              {{ p + '.sections.basics' | transloco }}
            </h2>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <app-form-field inputId="profile-industry" [label]="p + '.industry' | transloco">
                  <input
                    id="profile-industry"
                    type="text"
                    formControlName="industry"
                    maxlength="64"
                    aria-describedby="profile-industry-help"
                    autocomplete="off"
                  />
                </app-form-field>
                <p id="profile-industry-help" class="mt-1 text-[12px] text-fg-subtle">
                  {{ help + '.industry.help' | transloco }}
                </p>
              </div>
              <div>
                <app-form-field inputId="profile-size" [label]="p + '.sizeBand' | transloco">
                  <select id="profile-size" formControlName="size_band">
                    <option value="">{{ 'modules.common.notSet' | transloco }}</option>
                    @for (band of sizeBands; track band) {
                      <option [value]="band">{{ 'modules.sizeBands.' + band | transloco }}</option>
                    }
                  </select>
                </app-form-field>
              </div>
              <div class="md:col-span-2">
                <app-form-field inputId="profile-countries" [label]="p + '.countries' | transloco">
                  <input
                    id="profile-countries"
                    type="text"
                    formControlName="countries"
                    autocomplete="off"
                    [placeholder]="p + '.countriesPlaceholder' | transloco"
                    aria-describedby="profile-countries-help"
                  />
                </app-form-field>
                <p id="profile-countries-help" class="mt-1 text-[12px] text-fg-subtle">
                  {{ help + '.countries.help' | transloco }}
                </p>
                @if (form.controls.countries.invalid && form.controls.countries.touched) {
                  <p role="alert" class="mt-1 text-[12px] font-medium text-fail">
                    {{ p + '.errors.countries' | transloco }}
                  </p>
                }
              </div>
              <div class="md:col-span-2">
                <app-form-field
                  inputId="profile-description"
                  [label]="p + '.description' | transloco"
                >
                  <textarea
                    id="profile-description"
                    rows="4"
                    formControlName="description"
                    maxlength="5000"
                    aria-describedby="profile-description-help"
                  ></textarea>
                </app-form-field>
                <p id="profile-description-help" class="mt-1 text-[12px] text-fg-subtle">
                  {{ help + '.description.help' | transloco }}
                </p>
              </div>
            </div>
          </app-card>

          <app-card>
            <fieldset>
              <legend class="mb-1 text-[16px] font-bold text-fg">
                {{ p + '.sections.frameworks' | transloco }}
              </legend>
              <p class="mb-3 text-[12.5px] text-fg-subtle">
                {{ help + '.frameworks.help' | transloco }}
              </p>
              <div class="grid gap-2 sm:grid-cols-2" formGroupName="frameworks">
                @for (fw of frameworks; track fw) {
                  <label
                    class="flex cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      class="mt-1 accent-[var(--accent)]"
                      [formControlName]="fw"
                    />
                    <span>
                      <span class="block text-[13.5px] font-semibold text-fg">{{
                        frameworkNameKey(fw) | transloco
                      }}</span>
                      <span class="block text-[12.5px] text-fg-muted">{{
                        frameworkDescriptionKey(fw) | transloco
                      }}</span>
                    </span>
                  </label>
                }
              </div>
            </fieldset>
          </app-card>

          <app-card>
            <fieldset>
              <legend class="mb-1 text-[16px] font-bold text-fg">
                {{ p + '.aiActRole' | transloco }}
              </legend>
              <p class="mb-3 text-[12.5px] text-fg-subtle">
                {{ help + '.aiActRole.help' | transloco }}
              </p>
              <div class="grid gap-2 sm:grid-cols-2">
                @for (role of aiActRoles; track role) {
                  <label
                    class="flex cursor-pointer items-start gap-2.5 rounded-tile border border-border px-3 py-2.5 hover:bg-surface-2"
                  >
                    <input
                      type="radio"
                      class="mt-1 accent-[var(--accent)]"
                      formControlName="ai_act_role"
                      [value]="role"
                    />
                    <span>
                      <span class="block text-[13.5px] font-semibold text-fg">{{
                        'modules.aiActRoles.' + role + '.name' | transloco
                      }}</span>
                      <span class="block text-[12.5px] text-fg-muted">{{
                        'modules.aiActRoles.' + role + '.description' | transloco
                      }}</span>
                    </span>
                  </label>
                }
              </div>
            </fieldset>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[16px] font-bold text-fg">
                {{ p + '.sections.targets' | transloco }}
              </h2>
              <app-button variant="secondary" size="sm" (click)="addTarget()">
                <app-icon name="plus" [size]="14" /> {{ p + '.addTarget' | transloco }}
              </app-button>
            </div>
            <p class="mb-3 text-[12.5px] text-fg-subtle">
              {{ help + '.targets.help' | transloco }}
            </p>
            @if (form.controls.certification_targets.length === 0) {
              <p
                class="rounded-tile border border-dashed border-border px-3 py-4 text-center text-[13px] text-fg-muted"
              >
                {{ p + '.noTargets' | transloco }}
              </p>
            }
            <ul class="flex flex-col gap-3" formArrayName="certification_targets">
              @for (
                row of form.controls.certification_targets.controls;
                track row;
                let i = $index
              ) {
                <li
                  class="grid gap-3 rounded-tile border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
                  [formGroupName]="i"
                >
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
                    [inputId]="'target-date-' + i"
                    [label]="p + '.targetDate' | transloco"
                  >
                    <input [id]="'target-date-' + i" type="date" formControlName="target_date" />
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
                  <app-button variant="ghost" size="sm" (click)="removeTarget(i)">
                    {{ 'modules.common.remove' | transloco }}
                  </app-button>
                </li>
              }
            </ul>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[16px] font-bold text-fg">{{ p + '.sections.sites' | transloco }}</h2>
              <app-button variant="secondary" size="sm" (click)="addSite()">
                <app-icon name="plus" [size]="14" /> {{ p + '.addSite' | transloco }}
              </app-button>
            </div>
            <p class="mb-3 text-[12.5px] text-fg-subtle">{{ help + '.sites.help' | transloco }}</p>
            @if (form.controls.sites.length === 0) {
              <p
                class="rounded-tile border border-dashed border-border px-3 py-4 text-center text-[13px] text-fg-muted"
              >
                {{ p + '.noSites' | transloco }}
              </p>
            }
            <ul class="flex flex-col gap-3" formArrayName="sites">
              @for (row of form.controls.sites.controls; track row; let i = $index) {
                <li
                  class="grid gap-3 rounded-tile border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end"
                  [formGroupName]="i"
                >
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
                    [inputId]="'site-country-' + i"
                    [label]="p + '.siteCountry' | transloco"
                  >
                    <input
                      [id]="'site-country-' + i"
                      type="text"
                      formControlName="country"
                      maxlength="2"
                      autocomplete="off"
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
                  <app-form-field
                    [inputId]="'site-kind-' + i"
                    [label]="p + '.siteKind' | transloco"
                  >
                    <input
                      [id]="'site-kind-' + i"
                      type="text"
                      formControlName="kind"
                      maxlength="64"
                      [placeholder]="p + '.siteKindPlaceholder' | transloco"
                    />
                  </app-form-field>
                  <app-button variant="ghost" size="sm" (click)="removeSite(i)">
                    {{ 'modules.common.remove' | transloco }}
                  </app-button>
                  @if (row.invalid && row.touched) {
                    <p role="alert" class="text-[12px] font-medium text-fail sm:col-span-5">
                      {{ p + '.errors.site' | transloco }}
                    </p>
                  }
                </li>
              }
            </ul>
          </app-card>

          @if (error()) {
            <app-alert>{{ 'modules.profile.errors.save' | transloco }}</app-alert>
          }

          <div class="flex flex-wrap items-center justify-end gap-2">
            <app-button type="button" variant="ghost" (click)="reset()">{{
              'common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="saving()">{{
              'common.save' | transloco
            }}</app-button>
          </div>
        </form>
      }
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

  protected readonly clauses = GUIDE_CLAUSES.profile;
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

  constructor() {
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
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
