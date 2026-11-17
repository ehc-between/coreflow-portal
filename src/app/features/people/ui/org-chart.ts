import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { PeopleApi } from '../data/people-api';
import { OrgChartNode } from '../data/people.models';

/** A node of the reporting tree with its children. */
export interface OrgTreeNode {
  readonly node: OrgChartNode;
  readonly children: readonly OrgTreeNode[];
}

/**
 * The positions as a tree built from "reports to" (roots: positions that report to
 * no one, or to a position not in the list). Cycles cannot happen (the backend
 * refuses them), but a visited set keeps the build safe anyway.
 */
export function buildOrgTree(nodes: readonly OrgChartNode[]): readonly OrgTreeNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string | null, OrgChartNode[]>();
  for (const n of nodes) {
    const parent = n.reports_to_id && ids.has(n.reports_to_id) ? n.reports_to_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), n]);
  }
  const seen = new Set<string>();
  const build = (parent: string | null): OrgTreeNode[] => {
    const level = (byParent.get(parent) ?? [])
      .filter((n) => !seen.has(n.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const n of level) {
      seen.add(n.id);
    }
    return level.map((n) => ({ node: n, children: build(n.id) }));
  };
  return build(null);
}

/**
 * "Organisasjonskart" (HS 5.3 roles, responsibilities and authorities): positions as
 * a reporting tree with the people who hold each one. Plain nested lists, so it works
 * with a keyboard, a screen reader and on a phone.
 */
@Component({
  selector: 'app-people-org-chart',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, ErrorState, LoadingState, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <app-loading-state [rows]="4" />
      }
      @case ('error') {
        <app-error-state (retry)="load()" />
      }
      @default {
        @if (tree().length === 0) {
          <p class="px-4 py-10 text-center text-body text-fg-muted">
            {{ 'people.orgChart.empty' | transloco }}
          </p>
        } @else {
          <ul class="flex flex-col gap-2 p-4" data-testid="org-chart">
            @for (item of tree(); track item.node.id) {
              <ng-container
                [ngTemplateOutlet]="branch"
                [ngTemplateOutletContext]="{ $implicit: item }"
              />
            }
          </ul>
        }
      }
    }

    <ng-template #branch let-item>
      <li>
        <div class="rounded-tile border border-border bg-surface px-3 py-2">
          <p class="flex flex-wrap items-center gap-2">
            <a
              [routerLink]="item.node.url"
              class="text-body font-semibold text-fg hover:underline"
              >{{ item.node.title }}</a
            >
            @if (item.node.risk_level === 'high') {
              <app-status-badge meaning="severity" value="high" labelKey="people.riskLevels.high" />
            }
          </p>
          <p class="text-meta text-fg-muted">
            @for (h of item.node.holders; track h.id; let last = $last) {
              <a [routerLink]="h.url" class="hover:underline">{{ h.name }}</a
              >{{ last ? '' : ', ' }}
            } @empty {
              {{ 'people.orgChart.vacant' | transloco }}
            }
          </p>
        </div>
        @if (item.children.length) {
          <ul class="mt-2 ml-4 flex flex-col gap-2 border-l border-border pl-4">
            @for (child of item.children; track child.node.id) {
              <ng-container
                [ngTemplateOutlet]="branch"
                [ngTemplateOutletContext]="{ $implicit: child }"
              />
            }
          </ul>
        }
      </li>
    </ng-template>
  `,
})
export class OrgChart {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Bump to reload. */
  readonly refresh = input(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  private readonly nodes = signal<readonly OrgChartNode[]>([]);
  protected readonly tree = computed(() => buildOrgTree(this.nodes()));

  constructor() {
    effect(() => {
      this.selectedOrg.currentOrgId();
      this.refresh();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.orgChart(orgId).subscribe({
      next: (chart) => {
        this.nodes.set(chart.nodes);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
