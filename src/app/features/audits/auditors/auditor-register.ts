import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { Attachments } from '../../../shared/attachments/attachments';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { fromDateInput, planStatusBadge, textOrNull, toDateInput } from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import { AuditorProfile, AuditorProfileInput, EntityRef, ListResponse } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditField } from '../shared/audit-field';
import { AuditsNav } from '../shared/audits-nav';
import { AuditChoiceCheckboxes, Choice } from '../shared/choice-checkboxes';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { AuditRecordSelect } from '../shared/record-picker';
import { AuditUserSelect } from '../shared/user-select';
import { DateInput } from '../../../shared/ui/date-input/date-input';

export interface ProfileFormValue {
  userId: string;
  frameworks: string[];
  lead: boolean;
  qualifications: string;
  trained: string;
  validUntil: string;
  courses: EntityRef[];
  active: boolean;
}

export function emptyProfileForm(): ProfileFormValue {
  return {
    userId: '',
    frameworks: [],
    lead: false,
    qualifications: '',
    trained: '',
    validUntil: '',
    courses: [],
    active: true,
  };
}

export function profileFormToInput(v: ProfileFormValue, editing: boolean): AuditorProfileInput {
  return {
    ...(editing ? {} : { user_id: v.userId }),
    frameworks: v.frameworks,
    lead_auditor: v.lead,
    qualifications: textOrNull(v.qualifications),
    trained_at: fromDateInput(v.trained),
    valid_until: fromDateInput(v.validUntil),
    course_ids: v.courses.map((c) => c.entity_id),
    active: v.active,
  };
}

/** The courses of a profile as entity refs (titles from its training records when known). */
export function profileCourses(p: AuditorProfile): EntityRef[] {
  const known = new Map((p.training ?? []).map((t) => [t.course.id, t.course]));
  return (p.course_ids ?? []).map((id) => {
    const c = known.get(id);
    return {
      entity_type: 'course',
      entity_id: id,
      title: c?.title ?? id.slice(0, 8),
      code: c?.code ?? null,
      url: c?.url ?? null,
      status: null,
      module: 'training',
      label_key: 'modules.entities.course',
    };
  });
}

/** How valid the qualification is right now: expired, inactive or valid. */
export function profileState(p: AuditorProfile): 'expired' | 'inactive' | 'active' {
  if (p.expired) {
    return 'expired';
  }
  return p.active ? 'active' : 'inactive';
}

/**
 * `/audits/auditors`: the auditor competence register (ISO 19011 7) — who may audit
 * which standards, who may lead, the training that qualifies them (from the
 * Training module, so "valid until" follows the training record), their People
 * profile and the audits they have done. Certificates can be attached. Assigning
 * an internal auditor checks this register. Changing it needs `audits:manage`.
 * `?profile=<id>` opens one profile.
 */
@Component({
  selector: 'app-audit-auditor-register',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Attachments,
    TeachingEmpty,
    WhyItMatters,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    HelpStrip,
    Icon,
    PageHeader,
    SlideOver,
    StatusBadge,
    AuditField,
    AuditsNav,
    AuditChoiceCheckboxes,
    AuditLoadState,
    AuditRecordSelect,
    AuditUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="audits.auditors.title"
        descriptionKey="audits.auditors.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.audits', link: '/audits' },
          { labelKey: 'audits.auditors.title' },
        ]"
      >
        @if (access.canManage()) {
          <app-button primary (click)="openNew()">
            <app-icon name="plus" [size]="14" />
            {{ 'audits.auditors.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-audits-nav />
      <app-help-strip scope="audits" page="auditors" lesson="audit-team" />

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label class="sr-only" for="aud-framework">{{
          'audits.fields.framework' | transloco
        }}</label>
        <select
          id="aud-framework"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="framework.set($any($event.target).value)"
        >
          <option value="">{{ 'audits.filters.anyFramework' | transloco }}</option>
          @for (k of frameworkOptions(); track k) {
            <option [value]="k" [selected]="framework() === k">
              {{ 'audits.frameworks.' + k | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex h-10 items-center gap-1.5 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="activeOnly()"
            (change)="activeOnly.set($any($event.target).checked)"
          />
          {{ 'audits.auditors.activeOnly' | transloco }}
        </label>
      </div>

      @if (isEmpty()) {
        <app-card>
          <app-teaching-empty
            scope="audits"
            page="auditors"
            [showAction]="access.canManage()"
            (action)="openNew()"
          />
        </app-card>
      } @else {
        <app-card [padded]="false">
          <app-audit-load-state [state]="data.state()" [rows]="4" (retry)="load()" />
          @if (data.state() === 'ready') {
            @if (rows().length) {
              <ul
                class="divide-y divide-border"
                [attr.aria-label]="'audits.auditors.title' | transloco"
              >
                @for (p of rows(); track p.id) {
                  @let st = state(p);
                  <li
                    class="relative flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface-2"
                  >
                    <div class="min-w-0 flex-1 basis-[240px]">
                      <button
                        type="button"
                        class="text-left text-body font-semibold text-fg after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-tile focus-visible:after:ring-2 focus-visible:after:ring-accent"
                        (click)="openProfile(p)"
                        [attr.data-testid]="'auditor-' + p.id"
                      >
                        {{ p.user.name || ('audits.common.someone' | transloco) }}
                      </button>
                      <p class="text-meta text-fg-muted">
                        {{ frameworksText(p) || ('audits.auditors.noFrameworks' | transloco) }}
                      </p>
                      @if (p.training?.length) {
                        <p class="mt-0.5 text-meta text-fg-muted">
                          {{
                            'audits.auditors.trainingCount'
                              | transloco: { count: p.training!.length }
                          }}
                        </p>
                      }
                    </div>
                    <div class="flex flex-wrap items-center gap-1.5">
                      @if (p.lead_auditor) {
                        <app-badge tone="accent">{{
                          'audits.auditors.lead' | transloco
                        }}</app-badge>
                      }
                      <app-status-badge
                        meaning="lifecycle"
                        [value]="
                          st === 'active' ? 'active' : st === 'expired' ? 'expiring' : 'archived'
                        "
                        [labelKey]="'audits.auditors.' + st"
                      />
                    </div>
                    <span class="text-meta whitespace-nowrap text-fg-muted">
                      {{
                        'audits.auditors.validUntilShort'
                          | transloco
                            : {
                                date:
                                  (validUntil(p) | localDay) || ('common.empty.notSet' | transloco),
                              }
                      }}
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <app-empty-state
                icon="search"
                titleKey="ui.empty.noResults"
                ctaKey="audits.filters.clear"
                ctaVariant="secondary"
                [compact]="true"
                (cta)="framework.set(''); activeOnly.set(false)"
              />
            }
          }
        </app-card>
      }

      <div class="mt-8"><app-why-it-matters scope="audits" page="auditors" /></div>
    </div>

    <app-slide-over
      [open]="!!viewing()"
      [title]="viewing()?.user?.name ?? ''"
      [subtitle]="'audits.auditors.profileTitle' | transloco"
      [closeLabel]="'audits.common.close' | transloco"
      [width]="520"
      (closed)="closeProfile()"
    >
      @if (viewing(); as p) {
        @let st = state(p);
        <div class="flex flex-col gap-5" data-testid="auditor-profile">
          <div class="flex flex-wrap items-center gap-1.5">
            @if (p.lead_auditor) {
              <app-badge tone="accent">{{ 'audits.auditors.lead' | transloco }}</app-badge>
            }
            <app-status-badge
              meaning="lifecycle"
              [value]="st === 'active' ? 'active' : st === 'expired' ? 'expiring' : 'archived'"
              [labelKey]="'audits.auditors.' + st"
            />
            @if (p.employee; as e) {
              <a
                [routerLink]="e.url"
                class="ml-auto inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
              >
                <app-icon name="people" [size]="14" />
                {{ 'audits.auditors.openPerson' | transloco }}
              </a>
            }
          </div>
          <dl class="grid grid-cols-2 gap-3 text-ui">
            <div class="col-span-2">
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'audits.fields.frameworks' | transloco }}
              </dt>
              <dd class="text-fg">
                {{ frameworksText(p) || ('audits.auditors.noFrameworks' | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'audits.auditors.trainedAt' | transloco }}
              </dt>
              <dd class="text-fg">
                {{ (p.trained_at | localDay) || ('common.empty.notSet' | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'audits.auditors.validUntil' | transloco }}
              </dt>
              <dd class="text-fg">
                {{ (validUntil(p) | localDay) || ('common.empty.notSet' | transloco) }}
                @if (p.derived_valid_until) {
                  <span class="block text-meta text-fg-muted">{{
                    'audits.auditors.fromTraining' | transloco
                  }}</span>
                }
              </dd>
            </div>
            @if (p.qualifications) {
              <div class="col-span-2">
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'audits.auditors.qualifications' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ p.qualifications }}</dd>
              </div>
            }
          </dl>

          <section>
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{ 'audits.auditors.training' | transloco }}
            </h3>
            <ul class="divide-y divide-border">
              @for (t of p.training ?? []; track t.course.id) {
                <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                  <a
                    [routerLink]="t.course.url"
                    class="min-w-0 flex-1 font-semibold text-fg hover:text-accent"
                  >
                    @if (t.course.code) {
                      <span class="font-mono text-meta font-normal text-fg-subtle">{{
                        t.course.code
                      }}</span>
                    }
                    {{ t.course.title }}
                  </a>
                  <span class="text-meta text-fg-muted">
                    {{
                      t.completed_at
                        ? ('audits.auditors.completed'
                          | transloco: { date: (t.completed_at | localDay) })
                        : ('audits.auditors.notCompleted' | transloco)
                    }}
                  </span>
                  @if (t.expires_at) {
                    <span class="text-meta text-fg-muted">
                      {{
                        'audits.auditors.expires' | transloco: { date: (t.expires_at | localDay) }
                      }}
                    </span>
                  }
                </li>
              } @empty {
                <li class="py-2 text-meta text-fg-muted">
                  {{ 'audits.auditors.noTraining' | transloco }}
                </li>
              }
            </ul>
          </section>

          <section>
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{
                'audits.auditors.auditsPerformed'
                  | transloco
                    : {
                        total: p.audits_performed?.total ?? 0,
                        closed: p.audits_performed?.closed ?? 0,
                      }
              }}
            </h3>
            <ul class="divide-y divide-border">
              @for (a of p.audits_performed?.recent ?? []; track a.id) {
                @let ab = planBadge(a.status);
                <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                  <a
                    [routerLink]="['/audits/plans', a.id]"
                    class="min-w-0 flex-1 font-semibold text-fg hover:text-accent"
                  >
                    <span class="font-mono text-meta font-normal text-fg-subtle">{{ a.code }}</span>
                    {{ a.title }}
                  </a>
                  <app-status-badge
                    [meaning]="ab.meaning"
                    [value]="ab.value"
                    [labelKey]="ab.labelKey"
                  />
                </li>
              } @empty {
                <li class="py-2 text-meta text-fg-muted">
                  {{ 'audits.auditors.noAudits' | transloco }}
                </li>
              }
            </ul>
          </section>

          <section>
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{ 'audits.auditors.certificates' | transloco }}
            </h3>
            <app-attachments
              entityType="audit_auditor_profile"
              [entityId]="p.id"
              [canEdit]="access.canManage()"
              [compact]="true"
            />
          </section>

          @if (access.canManage()) {
            <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <app-button variant="ghost" (click)="deleting.set(p)">
                {{ 'audits.common.remove' | transloco }}
              </app-button>
              <app-button variant="secondary" (click)="openEdit(p)">
                {{ 'audits.common.edit' | transloco }}
              </app-button>
            </div>
          }
        </div>
      }
    </app-slide-over>

    <app-slide-over
      [open]="editorOpen()"
      [title]="(editing() ? 'audits.auditors.editTitle' : 'audits.auditors.newTitle') | transloco"
      [closeLabel]="'audits.common.close' | transloco"
      [width]="520"
      (closed)="editorOpen.set(false)"
    >
      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
        @if (!editing()) {
          <app-audit-field inputId="ap-user" labelKey="audits.auditors.person" [required]="true">
            <app-audit-user-select
              inputId="ap-user"
              noneLabelKey="audits.common.choose"
              [required]="true"
              [value]="f().userId"
              (valueChange)="patch({ userId: $event })"
            />
          </app-audit-field>
        } @else {
          <p class="text-body font-semibold text-fg">{{ editing()!.user.name }}</p>
        }
        <app-audit-choice-checkboxes
          [legend]="'audits.fields.frameworks' | transloco"
          [choices]="frameworkChoices()"
          [selected]="f().frameworks"
          (selectedChange)="patch({ frameworks: $event })"
        />
        <div>
          <label
            class="flex h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="f().lead"
              (change)="patch({ lead: $any($event.target).checked })"
            />
            {{ 'audits.auditors.leadQualified' | transloco }}
          </label>
        </div>
        <app-audit-field
          inputId="ap-courses"
          labelKey="audits.auditors.courses"
          helpPage="auditors"
          helpField="courses"
          [plain]="true"
        >
          <app-audit-record-select
            inputId="ap-courses"
            [types]="['course']"
            [max]="20"
            labelKey="audits.auditors.courses"
            placeholderKey="audits.auditors.searchCourses"
            [value]="f().courses"
            (valueChange)="patch({ courses: $event })"
          />
          <span hint>{{ 'audits.auditors.coursesHint' | transloco }}</span>
        </app-audit-field>
        <app-audit-field
          inputId="ap-qual"
          labelKey="audits.auditors.qualifications"
          helpPage="auditors"
          helpField="qualifications"
        >
          <textarea
            id="ap-qual"
            rows="3"
            [value]="f().qualifications"
            (input)="patch({ qualifications: $any($event.target).value })"
          ></textarea>
        </app-audit-field>
        <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
          <app-audit-field inputId="ap-trained" labelKey="audits.auditors.trainedAt">
            <app-date-input
              inputId="ap-trained"
              [value]="f().trained"
              (valueChange)="patch({ trained: $event ?? '' })"
            />
          </app-audit-field>
          <app-audit-field inputId="ap-valid" labelKey="audits.auditors.validUntil">
            <app-date-input
              inputId="ap-valid"
              [value]="f().validUntil"
              (valueChange)="patch({ validUntil: $event ?? '' })"
            />
          </app-audit-field>
        </div>
        <label
          class="flex h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="f().active"
            (change)="patch({ active: $any($event.target).checked })"
          />
          {{ 'audits.auditors.activeLabel' | transloco }}
        </label>
        <div class="flex justify-end gap-2 border-t border-border pt-4">
          <app-button variant="secondary" (click)="editorOpen.set(false)">{{
            'audits.common.cancel' | transloco
          }}</app-button>
          <app-button
            type="submit"
            [loading]="saving.busy()"
            [disabled]="!valid() || saving.busy()"
          >
            {{ 'audits.common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'audits.auditors.removeTitle' | transloco"
      [message]="
        'audits.auditors.removeMessage' | transloco: { name: deleting()?.user?.name ?? '' }
      "
      [confirmLabel]="'audits.common.remove' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class AuditorRegister {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(AuditFrameworks);
  protected readonly access = inject(AuditAccess);

  protected readonly lang = this.language.active;
  protected readonly planBadge = planStatusBadge;
  protected readonly state = profileState;
  protected readonly data = loadable<ListResponse<AuditorProfile>>();
  protected readonly saving = mutator();
  protected readonly framework = signal('');
  protected readonly activeOnly = signal(false);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<AuditorProfile | null>(null);
  protected readonly deleting = signal<AuditorProfile | null>(null);
  private readonly profileId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('profile'),
  );
  protected readonly f = signal<ProfileFormValue>(emptyProfileForm());

  protected readonly frameworkOptions = computed(() =>
    this.frameworks.options(this.framework() ? [this.framework()] : []),
  );
  protected readonly frameworkChoices = computed<readonly Choice[]>(() =>
    this.frameworks
      .options(this.f().frameworks)
      .map((k) => ({ value: k, label: `audits.frameworks.${k}` })),
  );
  protected readonly rows = computed(() => this.data.value()?.items ?? []);
  protected readonly viewing = computed(
    () => this.rows().find((p) => p.id === this.profileId()) ?? null,
  );
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.framework() &&
      !this.activeOnly(),
  );
  protected readonly valid = computed(() => !!this.editing() || !!this.f().userId);

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: this.viewing() ? 'audit_auditor_profile' : null,
      entityId: this.viewing()?.id ?? null,
      view: this.viewing() ? 'detail' : 'list',
      title: this.viewing()?.user.name ?? this.language.translate('audits.auditors.title'),
    }));
    effect(() => {
      this.access.orgId();
      this.framework();
      this.activeOnly();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(
        this.api.listProfiles(orgId, {
          framework: this.framework() || undefined,
          active: this.activeOnly() ? true : undefined,
          limit: 200,
        }),
        true,
      );
    }
  }

  protected frameworksText(p: AuditorProfile): string {
    return p.frameworks.map((f) => this.language.translate(`audits.frameworks.${f}`)).join(', ');
  }

  protected validUntil(p: AuditorProfile): string | null {
    return p.derived_valid_until ?? p.valid_until;
  }

  protected patch(change: Partial<ProfileFormValue>): void {
    this.f.update((v) => ({ ...v, ...change }));
  }

  protected openProfile(p: AuditorProfile): void {
    this.profileId.set(p.id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { profile: p.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected closeProfile(): void {
    this.profileId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { profile: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openNew(): void {
    this.editing.set(null);
    this.f.set(emptyProfileForm());
    this.editorOpen.set(true);
  }

  protected openEdit(p: AuditorProfile): void {
    this.editing.set(p);
    this.f.set({
      userId: p.user.id,
      frameworks: [...p.frameworks],
      lead: p.lead_auditor,
      qualifications: p.qualifications ?? '',
      trained: toDateInput(p.trained_at),
      validUntil: toDateInput(p.valid_until),
      courses: profileCourses(p),
      active: p.active,
    });
    this.closeProfile();
    this.editorOpen.set(true);
  }

  protected save(): void {
    const orgId = this.access.orgId();
    if (!orgId || !this.valid()) {
      return;
    }
    const editing = this.editing();
    const body = profileFormToInput(this.f(), !!editing);
    this.saving.run(
      editing
        ? this.api.updateProfile(orgId, editing.id, body)
        : this.api.createProfile(orgId, body),
      {
        success: 'audits.notices.profileSaved',
        next: () => {
          this.editorOpen.set(false);
          this.load();
        },
      },
    );
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    const target = this.deleting();
    if (!orgId || !target) {
      return;
    }
    this.saving.run(this.api.deleteProfile(orgId, target.id), {
      success: 'audits.notices.profileRemoved',
      next: () => {
        this.deleting.set(null);
        this.closeProfile();
        this.load();
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }
}
