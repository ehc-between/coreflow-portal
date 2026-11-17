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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { PeopleField } from './ui/people-field';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';
import { PeopleApi } from './data/people-api';
import { textOrNull } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import {
  COMPETENCE_CATEGORIES,
  Competence,
  CompetenceCategory,
  CompetenceFields,
  RECORD_STATUSES,
  RecordStatus,
} from './data/people.models';

export interface CompetenceFormValue {
  readonly name: string;
  readonly category: CompetenceCategory;
  readonly description: string;
  /** Months as typed ('' = does not expire). */
  readonly validity_months: string;
  readonly status: RecordStatus;
}

export function toCompetenceFields(v: CompetenceFormValue): CompetenceFields {
  const months = Number.parseInt(v.validity_months, 10);
  return {
    name: v.name.trim(),
    category: v.category,
    description: textOrNull(v.description),
    validity_months: Number.isFinite(months) && months > 0 ? months : null,
  };
}

/** Whether the validity field holds a valid value (blank, or 1-240 whole months). */
export function validityOk(value: string): boolean {
  if (!value.trim()) {
    return true;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 240;
}

/**
 * Create (`/people/competences/new`) or edit (`/people/competences/:id/edit`) a
 * competence in the catalogue: name, category, description and how long an
 * assessment stays valid (certificates, refresher training).
 */
@Component({
  selector: 'app-people-competence-editor',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    EmptyState,
    HelpStrip,
    LoadingState,
    PageHeader,
    PeopleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7 sm:pb-12">
      <app-page-header
        [title]="
          id()
            ? ('people.competenceForm.editTitle' | transloco: { name: original()?.name ?? '' })
            : null
        "
        [titleKey]="id() ? null : 'people.competenceForm.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink"
      />
      <app-help-strip scope="people" page="competenceForm" lesson="competence-basics" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            ctaKey="people.common.backToCompetences"
            ctaLink="/people/competences"
          />
        }
        @default {
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
            <p class="text-meta text-fg-muted">{{ 'people.form.requiredNote' | transloco }}</p>
            <app-card>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <app-people-field
                    labelKey="people.fields.name"
                    inputId="cf-c-name"
                    page="competenceForm"
                    [required]="true"
                  >
                    <input
                      id="cf-c-name"
                      type="text"
                      maxlength="200"
                      required
                      [value]="form().name"
                      (input)="set('name', $any($event.target).value)"
                      [attr.aria-invalid]="attempted() && !form().name.trim()"
                      data-testid="competence-name"
                    />
                  </app-people-field>
                  @if (attempted() && !form().name.trim()) {
                    <p class="mt-1 text-meta text-fail" role="alert">
                      {{ 'people.competenceForm.nameRequired' | transloco }}
                    </p>
                  }
                </div>
                <div>
                  <app-people-field
                    labelKey="people.fields.category"
                    inputId="cf-c-cat"
                    page="competenceForm"
                    help="category"
                  >
                    <select id="cf-c-cat" (change)="set('category', $any($event.target).value)">
                      @for (c of categories; track c) {
                        <option [value]="c" [selected]="form().category === c">
                          {{ 'people.categories.' + c | transloco }}
                        </option>
                      }
                    </select>
                  </app-people-field>
                </div>
                <div>
                  <app-people-field
                    labelKey="people.fields.validityMonths"
                    inputId="cf-c-valid"
                    page="competenceForm"
                    help="validity_months"
                  >
                    <input
                      id="cf-c-valid"
                      type="number"
                      min="1"
                      max="240"
                      inputmode="numeric"
                      [value]="form().validity_months"
                      (input)="set('validity_months', $any($event.target).value)"
                      [attr.aria-invalid]="!validity()"
                    />
                  </app-people-field>
                  @if (!validity()) {
                    <p class="mt-1 text-meta text-fail">
                      {{ 'people.competenceForm.validityRange' | transloco }}
                    </p>
                  }
                </div>
                <div class="sm:col-span-2">
                  <app-people-field
                    labelKey="people.fields.description"
                    inputId="cf-c-desc"
                    page="competenceForm"
                  >
                    <textarea
                      id="cf-c-desc"
                      rows="3"
                      maxlength="20000"
                      [value]="form().description"
                      (input)="set('description', $any($event.target).value)"
                    ></textarea>
                  </app-people-field>
                </div>
                @if (id()) {
                  <app-people-field
                    labelKey="people.fields.status"
                    inputId="cf-c-status"
                    page="competenceForm"
                  >
                    <select id="cf-c-status" (change)="set('status', $any($event.target).value)">
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="form().status === s">
                          {{ 'people.recordStatus.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-people-field>
                  <app-people-field
                    labelKey="people.form.changeReason"
                    inputId="cf-c-reason"
                    page="competenceForm"
                  >
                    <input
                      id="cf-c-reason"
                      type="text"
                      maxlength="1000"
                      [value]="changeReason()"
                      (input)="changeReason.set($any($event.target).value)"
                    />
                  </app-people-field>
                }
              </div>
            </app-card>
            <div
              class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <app-button variant="ghost" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button
                type="submit"
                [loading]="saving()"
                [disabled]="saving()"
                data-testid="competence-save"
              >
                {{ (id() ? 'common.save' : 'people.competenceForm.create') | transloco }}
              </app-button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class CompetenceEditor {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly lookups = inject(PeopleLookups);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>(undefined);

  protected readonly categories = COMPETENCE_CATEGORIES;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly original = signal<Competence | null>(null);
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly breadcrumbs = computed(() => {
    const c = this.original();
    const id = this.id();
    return [
      PEOPLE_ROOT,
      { labelKey: 'people.competences.title', link: '/people/competences' },
      ...(id && c ? [{ label: c.name, link: ['/people/competences', id] }] : []),
      { labelKey: id ? 'people.common.edit' : 'people.competenceForm.newTitle' },
    ];
  });
  protected readonly form = signal<CompetenceFormValue>({
    name: '',
    category: 'skill',
    description: '',
    validity_months: '',
    status: 'active',
  });
  private seed: CompetenceFormValue = this.form();
  protected readonly changeReason = signal('');
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly validity = computed(() => validityOk(this.form().validity_months));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'competence',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.name ?? this.language.translate('people.competenceForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (id) {
        untracked(() => this.load(orgId, id));
      }
    });
  }

  protected set<K extends keyof CompetenceFormValue>(key: K, value: CompetenceFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || !this.form().name.trim() || !this.validity()) {
      return;
    }
    const id = this.id();
    this.saving.set(true);
    if (id) {
      const before: Record<string, unknown> = {
        ...toCompetenceFields(this.seed),
        status: this.seed.status,
      };
      const after: Record<string, unknown> = {
        ...toCompetenceFields(this.form()),
        status: this.form().status,
      };
      const body: Record<string, unknown> = {};
      for (const key of Object.keys(after)) {
        if (after[key] !== before[key]) {
          body[key] = after[key];
        }
      }
      if (Object.keys(body).length === 0) {
        this.saving.set(false);
        this.notifications.info('people.notices.noChanges');
        this.cancel();
        return;
      }
      if (this.changeReason().trim()) {
        body['change_reason'] = this.changeReason().trim();
      }
      this.api.updateCompetence(orgId, id, body).subscribe({
        next: () => this.done(id, 'people.notices.saved'),
        error: (error: unknown) => this.failed(error),
      });
      return;
    }
    this.api.createCompetence(orgId, toCompetenceFields(this.form())).subscribe({
      next: (c) => this.done(c.id, 'people.notices.competenceCreated'),
      error: (error: unknown) => this.failed(error),
    });
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/people/competences', id] : ['/people/competences']);
  }

  private done(id: string, key: string): void {
    this.saving.set(false);
    this.lookups.invalidate();
    this.notifications.success(key);
    void this.router.navigate(['/people/competences', id]);
  }

  private failed(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(peopleErrorKey(error));
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getCompetence(orgId, id).subscribe({
      next: (c) => {
        const value: CompetenceFormValue = {
          name: c.name,
          category: c.category,
          description: c.description ?? '',
          validity_months: c.validity_months ? String(c.validity_months) : '',
          status: c.status,
        };
        this.original.set(c);
        this.seed = value;
        this.form.set(value);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
