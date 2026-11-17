import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, map } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { internalLink } from '../../core/search/internal-link';
import { StandardsApi } from '../../core/standards/standards-api';
import {
  applicabilitySource,
  checklistItems,
  effectiveStatus,
  isDerivedNotApplicable,
  localized,
  standardsErrorKey,
  statusLabelKey,
  statusTone,
} from '../../core/standards/standards-data';
import {
  RequirementPatch,
  CoverageOverride,
  EvidenceLink,
  EvidencingType,
  RequirementDetail,
  RequirementEvidence,
} from '../../core/standards/standards.models';
import { EntityChip } from '../../shared/kit/entity-chip';
import { fieldLabelKey } from '../../shared/requirement-links/supports-requirements';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EvidencePick, EvidencePicker, PickerType, moduleName } from './evidence-picker';

/** Status choices for the manual override ('' = automatic, from the evidence). */
const OVERRIDE_OPTIONS: readonly ('' | CoverageOverride)[] = [
  '',
  'covered',
  'partial',
  'not_started',
];

/** Confirmed evidence of one module. */
export interface ModuleEvidence {
  readonly module: string;
  readonly links: readonly EvidenceLink[];
}

/** Confirmed links grouped by module, in the order of `by_module` (most evidence first). */
export function evidenceByModule(evidence: RequirementEvidence | null): ModuleEvidence[] {
  if (!evidence) {
    return [];
  }
  const confirmed = evidence.links.filter((l) => l.status === 'confirmed');
  const order = new Map(evidence.by_module.map((m, i) => [m.module, i] as const));
  const groups = new Map<string, EvidenceLink[]>();
  for (const link of confirmed) {
    const module = link.entity.module ?? 'other';
    const list = groups.get(module);
    if (list) {
      list.push(link);
    } else {
      groups.set(module, [link]);
    }
  }
  return [...groups]
    .map(([module, links]) => ({ module, links }))
    .sort((a, b) => (order.get(a.module) ?? 999) - (order.get(b.module) ?? 999));
}

/**
 * One requirement of a standard (expanded inside a workspace requirement row,
 * `embedded`): our requirement text and evidence checklist, then its
 * evidence from every module (`GET standard-requirements/{ref}/evidence`),
 * grouped by module, with AI suggestions to confirm / reject. "Kan
 * dokumenteres med" lists the record types that usually evidence it, each
 * with "Opprett" (the new-record form, prefilled from this requirement) and
 * "Koble eksisterende". With `standards:manage` the user can also link any
 * record and assess the requirement (applicability + justification, manual
 * status + note). Emits `updated` with the patched requirement and
 * `linksChanged` after any evidence change (the server recomputes the status).
 */
@Component({
  selector: 'app-requirement-card',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    EntityChip,
    FormField,
    Icon,
    EvidencePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let req = requirement();
    <div
      [id]="embedded() ? null : anchorId()"
      class="scroll-mt-6 rounded-card"
      [class.ring-2]="highlighted()"
      [class.ring-accent]="highlighted()"
    >
      @if (embedded()) {
        <ng-container [ngTemplateOutlet]="body" />
      } @else {
        <app-card><ng-container [ngTemplateOutlet]="body" /></app-card>
      }
    </div>

    <ng-template #body>
      @if (!embedded()) {
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <app-badge [tone]="tone()">{{ statusKey() | transloco }}</app-badge>
          @if (req.status_override) {
            <app-badge tone="neutral">{{ 'standards.requirement.manual' | transloco }}</app-badge>
          }
          @if (derivedNotApplicable()) {
            <app-badge tone="neutral">{{ 'standards.requirement.derived' | transloco }}</app-badge>
          }
        </div>
        <p class="text-body text-fg">{{ text(req.text) }}</p>
      }

      @if (checklist().length > 0) {
        <div [class.mt-3]="!embedded()">
          <div class="mb-1 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase">
            {{ 'standards.requirement.evidenceExamples' | transloco }}
          </div>
          <ul class="flex flex-col gap-1">
            @for (item of checklist(); track $index) {
              <li class="flex gap-2 text-ui text-fg-muted">
                <span class="mt-0.5 flex flex-none text-fg-subtle"
                  ><app-icon name="checkcircle" [size]="14"
                /></span>
                {{ item }}
              </li>
            }
          </ul>
        </div>
      }

      @if (derivedNotApplicable()) {
        <div
          class="mt-3 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted"
          data-testid="derived-not-applicable"
        >
          <p>
            <span class="font-semibold text-fg">{{
              'standards.requirement.derivedTitle' | transloco
            }}</span>
            @if (derivedReason(); as reason) {
              · {{ reason }}
            }
          </p>
          <p class="mt-1">{{ 'standards.requirement.derivedHint' | transloco }}</p>
          @if (canManage()) {
            <div class="mt-2">
              <app-button
                size="sm"
                variant="secondary"
                [loading]="applicabilitySaving()"
                data-testid="mark-applicable"
                (click)="setApplicability(true)"
              >
                {{ 'standards.requirement.markApplicable' | transloco }}
              </app-button>
            </div>
          }
        </div>
      } @else if (overridesDerivation()) {
        <div
          class="mt-3 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted"
          data-testid="applicability-overridden"
        >
          <p>
            {{
              (req.derived_applicable
                ? 'standards.requirement.overriddenApplies'
                : 'standards.requirement.overriddenNotApplies'
              ) | transloco
            }}
            @if (derivedReason(); as reason) {
              {{ reason }}
            }
          </p>
          @if (canManage()) {
            <div class="mt-2">
              <app-button
                size="sm"
                variant="ghost"
                [loading]="applicabilitySaving()"
                data-testid="reset-applicability"
                (click)="setApplicability(null)"
              >
                {{ 'standards.requirement.resetDerived' | transloco }}
              </app-button>
            </div>
          }
        </div>
      }
      @if (applicabilityError()) {
        <p class="mt-2 text-[12.5px] text-fail" role="alert">
          {{ 'standards.requirement.applicabilityError' | transloco }}
        </p>
      }

      @if (!req.applicable && req.justification) {
        <p class="mt-3 rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          <span class="font-semibold text-fg">{{
            'standards.requirement.justification' | transloco
          }}</span>
          {{ req.justification }}
        </p>
      }
      @if (req.note) {
        <p class="mt-2 rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          <span class="font-semibold text-fg">{{ 'standards.requirement.note' | transloco }}</span>
          {{ req.note }}
        </p>
      }

      <!-- Suggestions (pending review): above the evidence -->
      @if (suggestions().length > 0) {
        <div
          class="mt-4 rounded-tile border border-dashed border-accent-border bg-accent-soft/30 px-3 py-2.5"
          data-testid="ai-suggestions"
        >
          <h3 class="flex items-center gap-1.5 text-ui font-bold text-fg">
            <span class="flex text-accent"><app-icon name="spark" [size]="14" /></span>
            {{ 'standards.reqs.card.suggestions' | transloco: { count: suggestions().length } }}
          </h3>
          <p class="mt-0.5 mb-2 text-meta text-fg-muted">
            {{ 'standards.suggestions.hint' | transloco }}
          </p>
          <ul class="flex flex-col gap-2">
            @for (link of suggestions(); track link.id) {
              <li class="rounded-tile border border-accent-border bg-surface px-3 py-2">
                <div class="flex flex-wrap items-start gap-2">
                  <span class="min-w-0 flex-1">
                    <app-entity-chip [ref]="link.entity" />
                    <span class="mt-0.5 block text-micro text-fg-subtle">
                      {{
                        originKey(link)
                          | transloco: { field: (fieldKey(link.origin_field) | transloco) }
                      }}
                      @if (link.confidence !== null) {
                        ·
                        {{
                          'standards.suggestions.confidence'
                            | transloco: { pct: confidencePct(link.confidence) }
                        }}
                      }
                    </span>
                    @if (link.rationale) {
                      <span class="mt-0.5 block text-meta text-fg-muted">{{ link.rationale }}</span>
                    }
                  </span>
                  @if (canManage()) {
                    <span class="flex flex-none gap-1">
                      <app-button
                        size="sm"
                        variant="secondary"
                        [disabled]="busy()"
                        (click)="confirmLink(link)"
                      >
                        <app-icon name="check" [size]="13" />
                        {{ 'standards.suggestions.confirm' | transloco }}
                      </app-button>
                      <app-button
                        size="sm"
                        variant="ghost"
                        [disabled]="busy()"
                        (click)="rejectLink(link)"
                      >
                        {{ 'standards.suggestions.reject' | transloco }}
                      </app-button>
                    </span>
                  }
                </div>
              </li>
            }
          </ul>
        </div>
      }

      <!-- Evidence from every module -->
      <div class="mt-4" data-testid="requirement-evidence">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <h3 class="text-ui font-bold text-fg">
            {{ 'standards.reqs.card.evidenceTitle' | transloco }}
            @if (confirmedCount() > 0) {
              <span class="ml-1 font-normal text-fg-subtle">({{ confirmedCount() }})</span>
            }
          </h3>
          @if (canManage() && !picking()) {
            <button
              type="button"
              class="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
              data-testid="add-evidence"
              (click)="openPicker(null)"
            >
              <app-icon name="plus" [size]="13" />
              {{ 'standards.evidence.add' | transloco }}
            </button>
          }
        </div>
        @if (picking()) {
          <div class="mb-2">
            <app-evidence-picker
              [types]="pickerTypes()"
              [initialType]="pickerType()"
              [exclude]="linkedKeys()"
              (picked)="addLink($event)"
              (cancelled)="picking.set(false)"
            />
          </div>
        }
        @if (evidenceLoading()) {
          <p class="text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (evidenceError()) {
          <p class="text-meta text-fail" role="alert">
            {{ 'standards.reqs.card.loadError' | transloco }}
          </p>
        } @else if (groups().length === 0) {
          <p class="text-meta text-fg-muted">{{ 'standards.evidence.none' | transloco }}</p>
        } @else {
          <div class="flex flex-col gap-3">
            @for (group of groups(); track group.module) {
              <div data-testid="evidence-module">
                <div class="mb-1 text-micro font-bold tracking-wide text-fg-subtle uppercase">
                  {{ moduleLabel(group.module) }} · {{ group.links.length }}
                </div>
                <ul class="flex flex-col divide-y divide-border">
                  @for (link of group.links; track link.id) {
                    <li class="flex items-center gap-2 py-1.5">
                      <span class="min-w-0 flex-1">
                        <app-entity-chip [ref]="link.entity" />
                        <span class="block text-micro text-fg-subtle">
                          {{
                            originKey(link)
                              | transloco: { field: (fieldKey(link.origin_field) | transloco) }
                          }}
                        </span>
                      </span>
                      @if (canManage() && link.origin !== 'field') {
                        <button
                          type="button"
                          class="flex flex-none rounded-lg p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                          [attr.aria-label]="
                            'standards.evidence.remove' | transloco: { name: link.entity.title }
                          "
                          [disabled]="busy()"
                          (click)="removeLink(link)"
                        >
                          <app-icon name="x" [size]="14" />
                        </button>
                      } @else if (link.origin === 'field') {
                        <span
                          class="flex flex-none p-1.5 text-fg-subtle"
                          [title]="'standards.reqs.fromFieldHint' | transloco"
                          ><app-icon name="lock" [size]="13"
                        /></span>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </div>

      <!-- What could evidence it -->
      @if (evidencingTypes().length > 0) {
        <div class="mt-4" data-testid="can-be-evidenced-by">
          <h3 class="mb-1 text-ui font-bold text-fg">
            {{ 'standards.reqs.card.canBeEvidencedBy' | transloco }}
          </h3>
          <p class="mb-1.5 text-meta text-fg-muted">
            {{ 'standards.reqs.card.canBeEvidencedByHint' | transloco }}
          </p>
          <ul class="flex flex-col gap-1">
            @for (t of evidencingTypes(); track t.entity_type) {
              <li
                class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile border border-border bg-surface px-2.5 py-1.5"
                data-testid="evidencing-type"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-ui font-medium text-fg">{{ typeLabel(t) }}</span>
                  <span class="block text-micro text-fg-subtle">
                    {{ moduleLabel(t.module) }}
                    @if (!t.enabled) {
                      · {{ 'standards.support.moduleOff' | transloco }}
                    }
                  </span>
                </span>
                @if (t.enabled) {
                  @if (createLink(t); as target) {
                    <a
                      [href]="t.create_url"
                      class="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-meta font-semibold text-fg hover:border-border-strong hover:bg-surface-2"
                      data-testid="create-evidence"
                      (click)="navigate($event, target)"
                    >
                      <app-icon name="plus" [size]="12" />
                      {{ 'standards.reqs.card.create' | transloco }}
                    </a>
                  }
                  @if (canManage()) {
                    <button
                      type="button"
                      class="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-meta font-semibold text-accent hover:bg-accent-soft"
                      data-testid="link-existing"
                      (click)="openPicker(t.entity_type)"
                    >
                      <app-icon name="link" [size]="12" />
                      {{ 'standards.reqs.card.linkExisting' | transloco }}
                    </button>
                  }
                }
              </li>
            }
          </ul>
        </div>
      }

      @if (linkError()) {
        <p class="mt-2 text-meta text-fail" role="alert">
          {{ 'standards.evidence.error' | transloco }}
        </p>
      }

      <!-- Extra content from the host (the workspace row projects its AI help here) -->
      <ng-content />

      <!-- Assessment -->
      @if (canManage()) {
        <div class="mt-4 border-t border-border pt-3">
          @if (!editing()) {
            <button
              type="button"
              class="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
              (click)="startEdit()"
            >
              <app-icon name="sliders" [size]="13" />
              {{ 'standards.requirement.assess' | transloco }}
            </button>
          } @else {
            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-2 text-ui text-fg">
                <input
                  type="checkbox"
                  [ngModel]="formApplicable()"
                  (ngModelChange)="formApplicable.set($event)"
                />
                {{ 'standards.requirement.applicable' | transloco }}
              </label>
              @if (!formApplicable() && keepsDerivedNotApplicable()) {
                <p class="-mt-1 text-[12px] text-fg-muted">
                  {{ 'standards.requirement.derivedEditHint' | transloco }}
                </p>
              } @else if (!formApplicable()) {
                <app-form-field
                  [label]="'standards.requirement.justification' | transloco"
                  [inputId]="anchorId() + '-just'"
                >
                  <textarea
                    [id]="anchorId() + '-just'"
                    rows="2"
                    [ngModel]="formJustification()"
                    (ngModelChange)="formJustification.set($event)"
                  ></textarea>
                </app-form-field>
                @if (justificationMissing()) {
                  <p class="-mt-2 text-meta text-fail" role="alert">
                    {{ 'standards.requirement.justificationRequired' | transloco }}
                  </p>
                }
              } @else {
                <app-form-field
                  [label]="'standards.requirement.manualStatus' | transloco"
                  [inputId]="anchorId() + '-status'"
                >
                  <select
                    [id]="anchorId() + '-status'"
                    [ngModel]="formOverride()"
                    (ngModelChange)="formOverride.set($event)"
                  >
                    @for (option of overrideOptions; track option) {
                      <option [value]="option">
                        {{
                          (option ? statusLabelKey(option) : 'standards.requirement.automatic')
                            | transloco
                        }}
                      </option>
                    }
                  </select>
                </app-form-field>
              }
              <app-form-field
                [label]="'standards.requirement.note' | transloco"
                [inputId]="anchorId() + '-note'"
              >
                <textarea
                  [id]="anchorId() + '-note'"
                  rows="2"
                  [ngModel]="formNote()"
                  (ngModelChange)="formNote.set($event)"
                ></textarea>
              </app-form-field>
              @if (saveError(); as key) {
                <p class="text-meta text-fail" role="alert">
                  {{ key | transloco }}
                </p>
              }
              <div class="flex justify-end gap-2">
                <app-button variant="ghost" size="sm" (click)="editing.set(false)">
                  {{ 'standards.requirement.cancel' | transloco }}
                </app-button>
                <app-button size="sm" [loading]="saving()" (click)="save()">
                  {{ 'standards.requirement.save' | transloco }}
                </app-button>
              </div>
            </div>
          }
        </div>
      }
    </ng-template>
  `,
})
export class RequirementCard {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly router = inject(Router);

  readonly requirement = input.required<RequirementDetail>();
  readonly canManage = input(false);
  readonly highlighted = input(false);
  /**
   * Inside a requirement row of the standards workspace: no card frame and no
   * header (the row already shows the ref, status and text).
   */
  readonly embedded = input(false);

  readonly updated = output<RequirementDetail>();
  readonly linksChanged = output<void>();

  protected readonly evidence = signal<RequirementEvidence | null>(null);
  protected readonly evidenceLoading = signal(true);
  protected readonly evidenceError = signal(false);
  protected readonly busy = signal(false);
  protected readonly linkError = signal(false);
  protected readonly picking = signal(false);
  protected readonly pickerType = signal<string | null>(null);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  /** i18n key explaining a failed save, or null. */
  protected readonly saveError = signal<string | null>(null);
  protected readonly formApplicable = signal(true);
  protected readonly formJustification = signal('');
  protected readonly formOverride = signal<'' | CoverageOverride>('');
  protected readonly formNote = signal('');
  protected readonly justificationMissing = signal(false);
  /** The quick "mark applicable" / "use the derived value" actions. */
  protected readonly applicabilitySaving = signal(false);
  protected readonly applicabilityError = signal(false);

  /** EU AI Act: not applicable because of the derivation, not an org decision. */
  protected readonly derivedNotApplicable = computed(() =>
    isDerivedNotApplicable(this.requirement()),
  );
  /** EU AI Act: the org decided itself where a derived value exists (can be reset). */
  protected readonly overridesDerivation = computed(() => {
    const req = this.requirement();
    return applicabilitySource(req) === 'manual' && typeof req.derived_applicable === 'boolean';
  });
  protected readonly derivedReason = computed(() =>
    localized(this.requirement().derived_reason, this.language.active()),
  );
  /**
   * In the editor: the box is still unticked on a derived not-applicable point,
   * so saving leaves applicability to the derivation (no justification needed).
   */
  protected readonly keepsDerivedNotApplicable = computed(
    () => this.derivedNotApplicable() && !this.formApplicable(),
  );

  protected readonly overrideOptions = OVERRIDE_OPTIONS;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly fieldKey = fieldLabelKey;

  /** The ref alone, so a patched requirement object (same ref) does not reload the evidence. */
  private readonly ref = computed(() => this.requirement().ref);
  protected readonly anchorId = computed(() => requirementAnchorId(this.requirement().ref));
  protected readonly status = computed(() => effectiveStatus(this.requirement()));
  protected readonly statusKey = computed(() => statusLabelKey(this.status()));
  protected readonly tone = computed(() => statusTone(this.status()));
  protected readonly checklist = computed(() =>
    checklistItems(this.requirement().evidence_examples, this.language.active()),
  );
  protected readonly groups = computed(() => evidenceByModule(this.evidence()));
  protected readonly confirmedCount = computed(
    () => this.evidence()?.links.filter((l) => l.status === 'confirmed').length ?? 0,
  );
  protected readonly suggestions = computed(
    () => this.evidence()?.links.filter((l) => l.status === 'suggested') ?? [],
  );
  /** Enabled modules first, so what the org can act on comes first. */
  protected readonly evidencingTypes = computed(() =>
    [...(this.evidence()?.can_be_evidenced_by ?? [])].sort(
      (a, b) => Number(b.enabled) - Number(a.enabled),
    ),
  );
  protected readonly pickerTypes = computed<readonly PickerType[]>(() =>
    this.evidencingTypes()
      .filter((t) => t.enabled)
      .map((t) => ({ entity_type: t.entity_type, label_key: t.label_key })),
  );
  protected readonly linkedKeys = computed(
    () =>
      new Set(
        (this.evidence()?.links ?? [])
          .filter((l) => l.status !== 'rejected')
          .map((l) => `${l.entity.entity_type}:${l.entity.entity_id}`),
      ) as ReadonlySet<string>,
  );

  private sub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const ref = this.ref();
      // Reload when the language changes too: labels and titles come localised.
      this.language.active();
      untracked(() => this.loadEvidence(orgId, ref, true));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected text(value: RequirementDetail['text']): string {
    return localized(value, this.language.active());
  }

  protected moduleLabel(module: string): string {
    return moduleName(module, (key) => this.language.translate(key));
  }

  protected typeLabel(t: EvidencingType): string {
    return this.entityTypes.label(t.entity_type, t.label_key);
  }

  /** "Fra feltet «Kontroller»", "Foreslått av KI", "Lagt til manuelt", … */
  protected originKey(link: EvidenceLink): string {
    return `standards.reqs.origin.${link.origin}`;
  }

  protected confidencePct(confidence: number): number {
    return Math.round(confidence * 100);
  }

  /** In-app link of "Opprett", or null when the type has no create page / no permission. */
  protected createLink(t: EvidencingType): string | null {
    if (!t.create_url || t.can_create === false) {
      return null;
    }
    return internalLink(t.create_url) ? t.create_url : null;
  }

  protected navigate(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(url);
  }

  protected openPicker(type: string | null): void {
    this.pickerType.set(type);
    this.picking.set(true);
  }

  protected addLink(pick: EvidencePick): void {
    this.mutate((orgId) =>
      this.api
        .createLink(orgId, {
          requirement_ref: this.requirement().ref,
          entity_type: pick.entity_type,
          entity_id: pick.entity_id,
        })
        .pipe(map(() => undefined)),
    );
    this.picking.set(false);
  }

  protected confirmLink(link: EvidenceLink): void {
    this.mutate((orgId) => this.api.confirmLink(orgId, link.id).pipe(map(() => undefined)));
  }

  protected rejectLink(link: EvidenceLink): void {
    this.mutate((orgId) => this.api.rejectLink(orgId, link.id).pipe(map(() => undefined)));
  }

  protected removeLink(link: EvidenceLink): void {
    this.mutate((orgId) => this.api.deleteLink(orgId, link.id));
  }

  protected startEdit(): void {
    const req = this.requirement();
    this.formApplicable.set(req.applicable);
    this.formJustification.set(req.justification ?? '');
    this.formOverride.set(req.status_override ?? '');
    this.formNote.set(req.note ?? '');
    this.justificationMissing.set(false);
    this.saveError.set(null);
    this.editing.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const req = this.requirement();
    const applicable = this.formApplicable();
    const justification = this.formJustification().trim();
    // Only send an applicability decision when the user made one: an unchanged
    // box would otherwise turn a default / derived value into a manual decision.
    const decides =
      applicable !== req.applicable || (!applicable && applicabilitySource(req) === 'manual');
    if (decides && !applicable && !justification) {
      this.justificationMissing.set(true);
      return;
    }
    this.justificationMissing.set(false);
    this.saving.set(true);
    this.saveError.set(null);
    const patch: RequirementPatch = {
      ...(decides ? { applicable, justification: applicable ? null : justification } : {}),
      status_override: applicable ? this.formOverride() || null : null,
      note: this.formNote().trim() || null,
    };
    this.api.updateRequirement(orgId, req.ref, patch).subscribe({
      next: (req) => {
        this.saving.set(false);
        this.editing.set(false);
        this.updated.emit(req);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(standardsErrorKey(err, 'save'));
      },
    });
  }

  /**
   * EU AI Act quick actions: `true` marks a derived not-applicable point as
   * applicable (the org's own, audited decision); `null` clears the org's
   * decision so the derived value applies again.
   */
  protected setApplicability(applicable: true | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.applicabilitySaving()) {
      return;
    }
    this.applicabilitySaving.set(true);
    this.applicabilityError.set(false);
    this.api.updateRequirement(orgId, this.requirement().ref, { applicable }).subscribe({
      next: (req) => {
        this.applicabilitySaving.set(false);
        this.editing.set(false);
        this.updated.emit(req);
      },
      error: () => {
        this.applicabilitySaving.set(false);
        this.applicabilityError.set(true);
      },
    });
  }

  private mutate(call: (orgId: string) => Observable<void>): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.linkError.set(false);
    call(orgId).subscribe({
      next: () => {
        this.busy.set(false);
        this.linksChanged.emit();
        this.loadEvidence(orgId, this.requirement().ref, false);
      },
      error: () => {
        this.busy.set(false);
        this.linkError.set(true);
      },
    });
  }

  private loadEvidence(orgId: string | null, ref: string, spinner: boolean): void {
    this.sub?.unsubscribe();
    this.evidenceError.set(false);
    if (!orgId) {
      this.evidenceLoading.set(false);
      return;
    }
    if (spinner) {
      this.evidenceLoading.set(true);
    }
    this.sub = this.api.requirementEvidence(orgId, ref).subscribe({
      next: (evidence) => {
        this.evidence.set(evidence);
        this.evidenceLoading.set(false);
      },
      error: () => {
        this.evidenceLoading.set(false);
        this.evidenceError.set(true);
      },
    });
  }
}

/** DOM id for a requirement's card (refs may contain characters invalid in ids). */
export function requirementAnchorId(ref: string): string {
  return `req-${ref.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}
