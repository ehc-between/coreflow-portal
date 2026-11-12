import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { RetentionDueItem, RetentionRule } from '../data/document-control.models';
import { portalLink } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

/** Look-ahead windows of the "due for disposition" report, in days. */
export const DUE_WINDOWS = [0, 30, 90, 365] as const;

export function matchesRule(rule: RetentionRule, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    [rule.name, rule.legal_basis ?? '', rule.description ?? ''].some((v) =>
      v.toLowerCase().includes(needle),
    )
  );
}

/**
 * Records retention (ISO HS 7.5.3, ISO 27001 A.5.33, GDPR art. 5): how long each
 * kind of record is kept, from which trigger, and what happens at the end — plus
 * the report of documents whose retention period has ended (managers only).
 */
@Component({
  selector: 'app-retention-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    TourStepDirective,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="documents.control.retention.title"
      scope="documents"
      page="retention"
      searchPlaceholderKey="documents.control.retention.searchPlaceholder"
      [query]="q()"
      [empty]="state() === 'ready' && rules().length === 0"
      (search)="q.set($event)"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="retention" lesson="retention-basics" tour="retention" />
      </div>
      @if (perms.canManage()) {
        <app-button toolbar size="sm" [appTourStep]="'documents-retention-new'" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'documents.control.retention.new' | transloco }}
        </app-button>
      }

      <div class="flex flex-col gap-5">
        <app-card [padded]="false">
          @switch (state()) {
            @case ('loading') {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'documents.control.common.loading' | transloco }}
              </p>
            }
            @case ('error') {
              <p class="py-10 text-center text-[14px] text-fail" role="alert">
                {{ 'documents.control.common.loadFailed' | transloco }}
              </p>
            }
            @default {
              @if (rows().length === 0) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'documents.control.filters.noMatch' | transloco }}
                </p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[640px] text-left text-[13px]">
                    <caption class="sr-only">
                      {{
                        'documents.control.retention.title' | transloco
                      }}
                    </caption>
                    <thead class="border-b border-border text-[12px] text-fg-muted">
                      <tr>
                        <th scope="col" class="px-4 py-2 font-semibold">
                          {{ 'documents.control.retention.fields.name' | transloco }}
                        </th>
                        <th scope="col" class="px-2 py-2 font-semibold">
                          {{ 'documents.control.retention.fields.period' | transloco }}
                        </th>
                        <th scope="col" class="px-2 py-2 font-semibold">
                          {{ 'documents.control.retention.fields.disposition' | transloco }}
                        </th>
                        <th scope="col" class="px-2 py-2 font-semibold">
                          {{ 'documents.control.retention.fields.usage' | transloco }}
                        </th>
                        <th scope="col" class="px-4 py-2 font-semibold">
                          {{ 'documents.control.fields.status' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      @for (r of rows(); track r.id) {
                        <tr class="align-top hover:bg-surface-2" data-testid="retention-row">
                          <td class="px-4 py-2.5">
                            <a
                              [routerLink]="['/documents/retention', r.id]"
                              class="font-semibold text-fg hover:underline"
                              >{{ r.name }}</a
                            >
                            <div class="mt-0.5 text-[12px] text-fg-subtle">
                              {{
                                'documents.control.retention.appliesTo.' + r.applies_to | transloco
                              }}
                              @if (r.legal_basis) {
                                · {{ r.legal_basis }}
                              }
                            </div>
                          </td>
                          <td class="px-2 py-2.5 text-fg-muted">
                            {{
                              'documents.control.retention.periodText'
                                | transloco
                                  : {
                                      count: r.retention_months,
                                      trigger:
                                        ('documents.control.retention.triggers.' + r.trigger
                                        | transloco),
                                    }
                            }}
                          </td>
                          <td class="px-2 py-2.5 text-fg-muted">
                            {{
                              'documents.control.retention.dispositions.' + r.disposition
                                | transloco
                            }}
                          </td>
                          <td class="px-2 py-2.5 text-fg-muted">{{ r.usage_count }}</td>
                          <td class="px-4 py-2.5">
                            <app-badge [tone]="r.active ? 'pass' : 'neutral'">{{
                              (r.active
                                ? 'documents.control.common.active'
                                : 'documents.control.common.inactive'
                              ) | transloco
                            }}</app-badge>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          }
        </app-card>

        @if (perms.canManage()) {
          <app-card [padded]="false">
            <div
              class="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2"
              [appTourStep]="'documents-retention-due'"
            >
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'documents.control.retention.dueTitle' | transloco }}
              </h2>
              <label class="sr-only" for="ret-window">{{
                'documents.control.retention.window' | transloco
              }}</label>
              <select
                id="ret-window"
                class="h-8 rounded-tile border border-border bg-bg px-2 text-[12.5px] text-fg"
                (change)="window.set(+$any($event.target).value)"
              >
                @for (w of windows; track w) {
                  <option [value]="w" [selected]="w === window()">
                    {{ 'documents.control.retention.windows.' + w | transloco }}
                  </option>
                }
              </select>
            </div>
            <p class="px-4 pb-2 text-[12.5px] text-fg-muted">
              {{ 'documents.control.retention.dueHint' | transloco }}
            </p>
            @if (dueState() === 'error') {
              <p class="px-4 pb-4 text-[13px] text-fail" role="alert">
                {{ 'documents.control.common.loadFailed' | transloco }}
              </p>
            } @else if (due().length === 0) {
              <p class="px-4 pb-4 text-[13px] text-fg-muted">
                {{ 'documents.control.retention.noneDue' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border border-t border-border">
                @for (d of due(); track d.kind + d.id) {
                  <li
                    class="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]"
                    data-testid="retention-due-row"
                  >
                    <span class="min-w-0 flex-1">
                      @if (link(d); as href) {
                        <a [routerLink]="href" class="font-semibold text-fg hover:underline">
                          @if (d.code) {
                            <span class="font-mono text-[12px] text-fg-subtle">{{ d.code }}</span>
                          }
                          {{ d.title }}
                        </a>
                      } @else {
                        <span class="font-semibold text-fg">{{ d.title }}</span>
                      }
                      @if (d.retention_rule; as rule) {
                        <span class="block text-[12px] text-fg-subtle">
                          {{ rule.name }} ·
                          {{
                            'documents.control.retention.dispositions.' + rule.disposition
                              | transloco
                          }}
                        </span>
                      }
                    </span>
                    <app-badge [tone]="d.overdue ? 'fail' : 'warn'">
                      {{
                        (d.overdue
                          ? 'documents.control.retention.endedOn'
                          : 'documents.control.retention.endsOn'
                        ) | transloco: { date: (d.retention_until | localDay) }
                      }}
                    </app-badge>
                  </li>
                }
              </ul>
            }
          </app-card>
        }
      </div>

      <app-teaching-empty
        empty
        scope="documents"
        page="retention"
        [showAction]="perms.canManage()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class RetentionListPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly windows = DUE_WINDOWS;
  protected readonly q = signal('');
  protected readonly rules = signal<readonly RetentionRule[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly window = signal<number>(30);
  protected readonly due = signal<readonly RetentionDueItem[]>([]);
  protected readonly dueState = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly rows = computed(() => this.rules().filter((r) => matchesRule(r, this.q())));

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'retention_rule',
      view: 'list',
      title: this.language.translate('documents.control.retention.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.state.set('loading');
        this.api.listRetentionRules(orgId).subscribe({
          next: (rules) => {
            this.rules.set(rules);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
    effect(() => {
      const orgId = this.perms.orgId();
      const within = this.window();
      if (!orgId || !this.perms.canManage()) {
        return;
      }
      untracked(() => {
        this.dueState.set('loading');
        this.api.retentionDue(orgId, within).subscribe({
          next: (r) => {
            this.due.set(r.items);
            this.dueState.set('ready');
          },
          error: () => this.dueState.set('error'),
        });
      });
    });
  }

  protected link(item: RetentionDueItem): string | null {
    return portalLink(item.url);
  }

  protected create(): void {
    void this.router.navigateByUrl('/documents/retention/new');
  }
}
