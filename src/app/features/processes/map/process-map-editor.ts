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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ROLE_KEYS, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import {
  addEdge,
  addLane,
  addNode,
  canAddLane,
  canAddNode,
  emptyMap,
  mapIssues,
  moveLane,
  moveNode,
  normaliseMap,
  readingOrder,
  removeEdge,
  removeLane,
  removeNode,
  sameMap,
  updateEdge,
  updateLane,
  updateNode,
} from '../data/map-model';
import { nodeTypeKey } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import {
  MAP_NODE_TYPES,
  MapNode,
  MapNodeType,
  PROCESS_ENTITY_TYPE,
  PROCESS_MODULE,
  ProcessDetail,
  ProcessMap,
} from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import { NodeMove, ProcessMapCanvas } from './process-map-canvas';

const HISTORY_LIMIT = 50;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/**
 * The visual process-map editor (`/processes/:id/map`, needs `processes:write`):
 * swimlanes (role or department per lane), steps by type, labelled connections
 * (decision branches), links from steps to procedures and sub-processes, undo /
 * redo, modelling hints, a text alternative of the drawing, and an AI button that
 * drafts a laid-out map from a description or an existing procedure. Saving sends
 * the whole map with an optional change reason (the process keeps every version
 * in its revision history).
 */
@Component({
  selector: 'app-process-map-editor',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    SlideOver,
    ProcessMapCanvas,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
  template: `
    <div class="mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (process(); as p) {
        <a
          [routerLink]="['/processes', p.id]"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'processes.map.back' | transloco }}
        </a>
        <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-mono text-[12px] text-fg-subtle">{{ p.code }}</p>
            <h1
              class="font-display text-[22px] font-bold tracking-[-0.03em] text-fg sm:text-[24px]"
            >
              {{ 'processes.map.title' | transloco: { title: p.title } }}
            </h1>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'processes.map.version' | transloco: { version: p.map_version } }}
              @if (dirty()) {
                <app-badge tone="warn" class="ml-2">{{
                  'processes.map.unsaved' | transloco
                }}</app-badge>
              }
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <app-tour-button scope="processes" tour="map" />
            <app-button
              variant="secondary"
              size="sm"
              appTourStep="processes-map-generate"
              (click)="generateOpen.set(true)"
            >
              <app-icon name="spark" [size]="15" />
              {{ 'processes.map.generate.open' | transloco }}
            </app-button>
            <app-button
              size="sm"
              [disabled]="!dirty() || saving() || !canEdit()"
              [loading]="saving()"
              (click)="save()"
              data-testid="map-save"
            >
              <app-icon name="check" [size]="15" />
              {{ 'processes.map.save' | transloco }}
            </app-button>
          </div>
        </header>

        <app-guide-intro class="mb-3" scope="processes" page="map" />

        @if (!canEdit()) {
          <app-alert tone="info" class="mb-3">{{ 'processes.map.readOnly' | transloco }}</app-alert>
        }

        <div
          class="mb-3 flex flex-wrap items-center gap-1.5"
          role="toolbar"
          [attr.aria-label]="'processes.map.toolbar' | transloco"
          appTourStep="processes-map-palette"
        >
          @for (type of nodeTypes; track type) {
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-semibold text-fg hover:border-accent disabled:opacity-50"
              [disabled]="!canEdit() || !canAddStep()"
              (click)="addStep(type)"
              [attr.data-testid]="'add-' + type"
            >
              <app-icon name="plus" [size]="13" />
              {{ nodeTypeKey(type) | transloco }}
            </button>
          }
          <span class="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true"></span>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-semibold text-fg hover:border-accent disabled:opacity-50"
            [disabled]="!canEdit() || !canAddSwimlane()"
            (click)="addSwimlane()"
            data-testid="add-lane"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'processes.map.addLane' | transloco }}
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12.5px] font-semibold disabled:opacity-50"
            [class]="
              connectFrom()
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-fg hover:border-accent'
            "
            [disabled]="!canEdit() || !selectedNode()"
            [attr.aria-pressed]="connectFrom() !== null"
            (click)="toggleConnect()"
            data-testid="connect"
          >
            <app-icon name="arrow" [size]="13" />
            {{ (connectFrom() ? 'processes.map.connecting' : 'processes.map.connect') | transloco }}
          </button>
          <span class="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true"></span>
          <app-button
            variant="ghost"
            size="sm"
            [disabled]="past().length === 0"
            (click)="undo()"
            data-testid="undo"
          >
            {{ 'processes.map.undo' | transloco }}
          </app-button>
          <app-button
            variant="ghost"
            size="sm"
            [disabled]="future().length === 0"
            (click)="redo()"
            data-testid="redo"
          >
            {{ 'processes.map.redo' | transloco }}
          </app-button>
          <span class="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              class="h-8 w-8 rounded-[8px] border border-border bg-surface text-[15px] font-bold text-fg disabled:opacity-40"
              [disabled]="zoomIndex() === 0"
              [attr.aria-label]="'processes.map.zoomOut' | transloco"
              (click)="zoomIndex.set(zoomIndex() - 1)"
            >
              −
            </button>
            <span class="w-12 text-center text-[12px] text-fg-muted" aria-live="polite">
              {{ zoomPercent() }}%
            </span>
            <button
              type="button"
              class="h-8 w-8 rounded-[8px] border border-border bg-surface text-[15px] font-bold text-fg disabled:opacity-40"
              [disabled]="zoomIndex() === zoomSteps.length - 1"
              [attr.aria-label]="'processes.map.zoomIn' | transloco"
              (click)="zoomIndex.set(zoomIndex() + 1)"
            >
              +
            </button>
          </span>
        </div>

        @if (connectFrom()) {
          <p class="mb-2 text-[12.5px] text-accent" role="status">
            {{ 'processes.map.connectHint' | transloco }}
          </p>
        }
        <p class="sr-only" aria-live="polite">{{ announcement() }}</p>

        <div class="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div class="min-w-0 flex-1">
            @if (map().nodes.length === 0 && map().lanes.length === 0) {
              <app-card>
                <div class="py-8 text-center" data-testid="map-empty">
                  <h2 class="font-display text-[16px] font-bold text-fg">
                    {{ 'processes.map.empty.title' | transloco }}
                  </h2>
                  <p class="mx-auto mt-1 max-w-md text-[13px] text-fg-muted">
                    {{ 'processes.map.empty.body' | transloco }}
                  </p>
                  <div class="mt-4 flex flex-wrap justify-center gap-2">
                    <app-button size="sm" [disabled]="!canEdit()" (click)="startTemplate()">
                      {{ 'processes.map.empty.start' | transloco }}
                    </app-button>
                    <app-button variant="secondary" size="sm" (click)="generateOpen.set(true)">
                      <app-icon name="spark" [size]="15" />
                      {{ 'processes.map.generate.open' | transloco }}
                    </app-button>
                  </div>
                </div>
              </app-card>
            } @else {
              <app-process-map-canvas
                [map]="map()"
                [editable]="canEdit()"
                [selectedId]="selectedNodeId() ?? selectedEdgeId()"
                [connectFrom]="connectFrom()"
                [highlightIds]="highlightIds()"
                [zoom]="zoom()"
                maxHeight="70vh"
                (nodeSelected)="onNodeSelected($event)"
                (edgeSelected)="selectEdge($event)"
                (backgroundClicked)="clearSelection()"
                (dragStarted)="checkpoint()"
                (nodeMove)="onNodeMove($event)"
                (deleteRequested)="deleteStep($event)"
              />
            }

            @if (issues().length > 0) {
              <app-card class="mt-3">
                <h2 class="mb-2 text-[13px] font-bold text-fg">
                  {{ 'processes.map.issues.title' | transloco }}
                </h2>
                <ul
                  class="flex flex-col gap-1 text-[12.5px] text-fg-muted"
                  data-testid="map-issues"
                >
                  @for (issue of issues(); track issue.key) {
                    <li class="flex items-start gap-1.5">
                      <span class="mt-0.5 text-warn"><app-icon name="alert" [size]="13" /></span>
                      {{
                        'processes.map.issues.' + issue.key
                          | transloco: { count: issue.nodeIds.length }
                      }}
                    </li>
                  }
                </ul>
              </app-card>
            }

            <details class="mt-3 rounded-[12px] border border-border bg-surface px-4 py-3">
              <summary class="cursor-pointer text-[13px] font-semibold text-fg">
                {{ 'processes.map.textAlternative' | transloco }}
              </summary>
              <ol class="mt-2 list-decimal pl-5 text-[13px] text-fg-muted">
                @for (n of stepsInOrder(); track n.id) {
                  <li>
                    <button
                      type="button"
                      class="text-left hover:text-fg"
                      (click)="onNodeSelected(n.id)"
                    >
                      {{ n.label || (nodeTypeKey(n.type) | transloco) }}
                      ({{ nodeTypeKey(n.type) | transloco }})
                    </button>
                    @if (nextLabels(n.id); as next) {
                      <span class="text-fg-subtle"> → {{ next }} </span>
                    }
                  </li>
                }
              </ol>
            </details>
          </div>

          <aside class="flex w-full flex-col gap-3 xl:w-[320px] xl:flex-none">
            @if (selectedNode(); as node) {
              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="text-[14px] font-bold text-fg">
                    {{ 'processes.map.step.title' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'processes.map.step.askPrompt' | transloco: { label: node.label }"
                    field="map"
                  />
                </div>
                <div class="flex flex-col gap-3" data-testid="step-panel">
                  <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                    {{ 'processes.map.step.label' | transloco }}
                    <input
                      class="cf-input"
                      [ngModel]="node.label"
                      (ngModelChange)="patchNode(node.id, { label: $event })"
                      (focus)="checkpoint()"
                      maxlength="200"
                      [disabled]="!canEdit()"
                      data-testid="step-label"
                    />
                  </label>
                  <app-field-help scope="processes" page="map" field="stepType" />
                  <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                    {{ 'processes.map.step.type' | transloco }}
                    <select
                      class="cf-input"
                      [ngModel]="node.type"
                      (ngModelChange)="commit(updateNodeFn(node.id, { type: $event }))"
                      [disabled]="!canEdit()"
                    >
                      @for (type of nodeTypes; track type) {
                        <option [value]="type">{{ nodeTypeKey(type) | transloco }}</option>
                      }
                    </select>
                  </label>
                  @if (map().lanes.length > 0) {
                    <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                      {{ 'processes.map.step.lane' | transloco }}
                      <select
                        class="cf-input"
                        [ngModel]="node.lane_id ?? ''"
                        (ngModelChange)="commit(updateNodeFn(node.id, { lane_id: $event || null }))"
                        [disabled]="!canEdit()"
                      >
                        @for (lane of map().lanes; track lane.id) {
                          <option [value]="lane.id">{{ lane.label || lane.id }}</option>
                        }
                      </select>
                    </label>
                  }
                  <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                    {{ 'processes.map.step.description' | transloco }}
                    <textarea
                      class="cf-input"
                      rows="3"
                      maxlength="2000"
                      [ngModel]="node.description ?? ''"
                      (ngModelChange)="patchNode(node.id, { description: $event || null })"
                      (focus)="checkpoint()"
                      [disabled]="!canEdit()"
                    ></textarea>
                  </label>
                  @if (references.canReadDocuments()) {
                    <app-field-help scope="processes" page="map" field="procedure" />
                    <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                      {{ 'processes.map.step.procedure' | transloco }}
                      <select
                        class="cf-input"
                        [ngModel]="node.document_id ?? ''"
                        (ngModelChange)="
                          commit(updateNodeFn(node.id, { document_id: $event || null }))
                        "
                        [disabled]="!canEdit()"
                        data-testid="step-document"
                      >
                        <option value="">{{ 'processes.map.step.noProcedure' | transloco }}</option>
                        @for (doc of references.documents(); track doc.id) {
                          <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
                        }
                      </select>
                    </label>
                    @if (node.document_id) {
                      <a
                        [routerLink]="['/documents', node.document_id]"
                        class="text-[12.5px] font-semibold text-accent hover:underline"
                      >
                        {{ 'processes.map.step.openProcedure' | transloco }}
                      </a>
                    }
                  }
                  @if (node.type === 'subprocess') {
                    <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                      {{ 'processes.map.step.subprocess' | transloco }}
                      <select
                        class="cf-input"
                        [ngModel]="node.process_id ?? ''"
                        (ngModelChange)="
                          commit(updateNodeFn(node.id, { process_id: $event || null }))
                        "
                        [disabled]="!canEdit()"
                      >
                        <option value="">
                          {{ 'processes.map.step.noSubprocess' | transloco }}
                        </option>
                        @for (other of otherProcesses(); track other.id) {
                          <option [value]="other.id">{{ other.code }} · {{ other.title }}</option>
                        }
                      </select>
                    </label>
                    @if (node.process_id) {
                      <a
                        [routerLink]="['/processes', node.process_id]"
                        class="text-[12.5px] font-semibold text-accent hover:underline"
                      >
                        {{ 'processes.map.step.openSubprocess' | transloco }}
                      </a>
                    }
                  }
                  @if (canEdit()) {
                    <div class="flex flex-wrap gap-2 pt-1">
                      <app-button variant="secondary" size="sm" (click)="toggleConnect()">
                        <app-icon name="arrow" [size]="14" />
                        {{ 'processes.map.connect' | transloco }}
                      </app-button>
                      <app-button
                        variant="danger"
                        size="sm"
                        (click)="deleteStep(node.id)"
                        data-testid="step-delete"
                      >
                        <app-icon name="trash" [size]="14" />
                        {{ 'processes.map.step.delete' | transloco }}
                      </app-button>
                    </div>
                  }
                </div>
              </app-card>
            } @else if (selectedEdge(); as edge) {
              <app-card>
                <h2 class="mb-3 text-[14px] font-bold text-fg">
                  {{ 'processes.map.connection.title' | transloco }}
                </h2>
                <p class="mb-3 text-[12.5px] text-fg-muted">
                  {{
                    'processes.map.connection.between'
                      | transloco: { from: nodeLabel(edge.source), to: nodeLabel(edge.target) }
                  }}
                </p>
                <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                  {{ 'processes.map.connection.label' | transloco }}
                  <input
                    class="cf-input"
                    maxlength="200"
                    [placeholder]="'processes.map.connection.labelPlaceholder' | transloco"
                    [ngModel]="edge.label ?? ''"
                    (ngModelChange)="patchEdge(edge.id, $event)"
                    (focus)="checkpoint()"
                    [disabled]="!canEdit()"
                    data-testid="edge-label"
                  />
                </label>
                @if (canEdit()) {
                  <div class="mt-3">
                    <app-button variant="danger" size="sm" (click)="deleteEdge(edge.id)">
                      <app-icon name="trash" [size]="14" />
                      {{ 'processes.map.connection.delete' | transloco }}
                    </app-button>
                  </div>
                }
              </app-card>
            } @else {
              <app-card>
                <p class="text-[12.5px] text-fg-muted">
                  {{ 'processes.map.selectHint' | transloco }}
                </p>
              </app-card>
            }

            <app-card>
              <div class="mb-2 flex items-center justify-between gap-2">
                <h2 class="text-[14px] font-bold text-fg">
                  {{ 'processes.map.lanes.title' | transloco }}
                </h2>
              </div>
              <app-field-help scope="processes" page="map" field="lanes" />
              @for (lane of map().lanes; track lane.id; let i = $index; let last = $last) {
                <div class="mt-2 rounded-[10px] border border-border p-2" data-testid="lane-row">
                  <div class="flex items-center gap-1">
                    <input
                      class="cf-input min-w-0 flex-1"
                      maxlength="200"
                      [attr.aria-label]="'processes.map.lanes.name' | transloco: { n: i + 1 }"
                      [ngModel]="lane.label"
                      (ngModelChange)="patchLane(lane.id, { label: $event })"
                      (focus)="checkpoint()"
                      [disabled]="!canEdit()"
                    />
                    <button
                      type="button"
                      class="h-8 w-8 rounded-[8px] text-fg-muted hover:bg-surface-2 disabled:opacity-30"
                      [disabled]="!canEdit() || i === 0"
                      [attr.aria-label]="'processes.map.lanes.up' | transloco: { name: lane.label }"
                      (click)="commit(moveLaneFn(lane.id, -1))"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="h-8 w-8 rounded-[8px] text-fg-muted hover:bg-surface-2 disabled:opacity-30"
                      [disabled]="!canEdit() || last"
                      [attr.aria-label]="
                        'processes.map.lanes.down' | transloco: { name: lane.label }
                      "
                      (click)="commit(moveLaneFn(lane.id, 1))"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="flex h-8 w-8 items-center justify-center rounded-[8px] text-fg-subtle hover:text-fail disabled:opacity-30"
                      [disabled]="!canEdit()"
                      [attr.aria-label]="
                        'processes.map.lanes.remove' | transloco: { name: lane.label }
                      "
                      (click)="commit(removeLaneFn(lane.id))"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </div>
                  <div class="mt-1.5 grid grid-cols-2 gap-1.5">
                    <select
                      class="cf-input"
                      [attr.aria-label]="'processes.map.lanes.role' | transloco"
                      [ngModel]="lane.role_key ?? ''"
                      (ngModelChange)="commit(updateLaneFn(lane.id, { role_key: $event || null }))"
                      [disabled]="!canEdit()"
                    >
                      <option value="">{{ 'processes.map.lanes.noRole' | transloco }}</option>
                      @for (role of roleKeys; track role) {
                        <option [value]="role">{{ roleNameKey(role) | transloco }}</option>
                      }
                    </select>
                    <select
                      class="cf-input"
                      [attr.aria-label]="'processes.map.lanes.department' | transloco"
                      [ngModel]="lane.department_id ?? ''"
                      (ngModelChange)="
                        commit(updateLaneFn(lane.id, { department_id: $event || null }))
                      "
                      [disabled]="!canEdit()"
                    >
                      <option value="">
                        {{ 'processes.map.lanes.noDepartment' | transloco }}
                      </option>
                      @for (dept of references.departments(); track dept.id) {
                        <option [value]="dept.id">{{ dept.name }}</option>
                      }
                    </select>
                  </div>
                </div>
              } @empty {
                <p class="mt-2 text-[12.5px] text-fg-muted">
                  {{ 'processes.map.lanes.empty' | transloco }}
                </p>
              }
            </app-card>

            @if (canEdit()) {
              <app-card>
                <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
                  {{ 'processes.fields.changeReason' | transloco }}
                  <input
                    class="cf-input"
                    maxlength="1000"
                    [placeholder]="'processes.map.changeReasonPlaceholder' | transloco"
                    [(ngModel)]="changeReason"
                    data-testid="map-change-reason"
                  />
                </label>
              </app-card>
            }
            <app-why-it-matters scope="processes" page="map" />
          </aside>
        </div>
      } @else if (loadError(); as err) {
        <app-alert tone="error">{{ err | transloco }}</app-alert>
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      }
    </div>

    <app-slide-over
      [open]="generateOpen()"
      [title]="'processes.map.generate.title' | transloco"
      [subtitle]="'processes.map.generate.subtitle' | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      (closed)="generateOpen.set(false)"
    >
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'processes.map.generate.description' | transloco }}
          <textarea
            class="cf-input"
            rows="8"
            maxlength="8000"
            [placeholder]="'processes.map.generate.descriptionPlaceholder' | transloco"
            [(ngModel)]="generateDescription"
            data-testid="generate-description"
          ></textarea>
        </label>
        @if (references.canReadDocuments()) {
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'processes.map.generate.document' | transloco }}
            <select class="cf-input" [(ngModel)]="generateDocumentId">
              <option value="">{{ 'processes.map.generate.noDocument' | transloco }}</option>
              @for (doc of references.documents(); track doc.id) {
                <option [value]="doc.id">{{ doc.doc_code }} · {{ doc.title }}</option>
              }
            </select>
          </label>
        }
        <p class="text-[12px] text-fg-subtle">{{ 'processes.map.generate.note' | transloco }}</p>
        <div>
          <app-ai-assist-button
            assist="processes.generate_map"
            labelKey="processes.map.generate.run"
            variant="primary"
            size="md"
            [input]="generateInput()"
            [entityType]="entityType"
            [entityId]="id()"
            (result)="onGenerated($event)"
          />
        </div>
      </div>
    </app-slide-over>

    <app-confirm-dialog
      [open]="pendingGenerated() !== null"
      [title]="'processes.map.generate.replaceTitle' | transloco"
      [message]="'processes.map.generate.replaceMessage' | transloco"
      [confirmLabel]="'processes.map.generate.replace' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      (confirmed)="applyGenerated()"
      (cancelled)="pendingGenerated.set(null)"
    />
  `,
  styles: [
    `
      .cf-input {
        width: 100%;
        min-height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        font-weight: 400;
        padding: 6px 10px;
        outline: none;
      }
      .cf-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ProcessMapEditor {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly references = inject(ProcessReferences);

  readonly id = input.required<string>();

  protected readonly entityType = PROCESS_ENTITY_TYPE;
  protected readonly nodeTypes = MAP_NODE_TYPES;
  protected readonly nodeTypeKey = nodeTypeKey;
  protected readonly roleKeys = ROLE_KEYS;
  protected readonly roleNameKey = roleNameKey;
  protected readonly zoomSteps = ZOOM_STEPS;

  protected readonly process = signal<ProcessDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly map = signal<ProcessMap>(emptyMap());
  private readonly baseline = signal<ProcessMap>(emptyMap());
  protected readonly past = signal<readonly ProcessMap[]>([]);
  protected readonly future = signal<readonly ProcessMap[]>([]);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly connectFrom = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly zoomIndex = signal(2);
  protected readonly generateOpen = signal(false);
  protected readonly pendingGenerated = signal<ProcessMap | null>(null);
  protected readonly announcement = signal('');
  protected changeReason = '';
  protected generateDescription = '';
  protected generateDocumentId = '';

  protected readonly canEdit = computed(() => this.process()?.can_edit ?? false);
  protected readonly dirty = computed(() => !sameMap(this.map(), this.baseline()));
  protected readonly zoom = computed(() => ZOOM_STEPS[this.zoomIndex()]);
  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly canAddStep = computed(() => canAddNode(this.map()));
  protected readonly canAddSwimlane = computed(() => canAddLane(this.map()));
  protected readonly issues = computed(() => mapIssues(this.map()));
  protected readonly highlightIds = computed(() => this.issues().flatMap((i) => i.nodeIds));
  protected readonly stepsInOrder = computed(() => readingOrder(this.map()));
  protected readonly selectedNode = computed(
    () => this.map().nodes.find((n) => n.id === this.selectedNodeId()) ?? null,
  );
  protected readonly selectedEdge = computed(
    () => this.map().edges.find((e) => e.id === this.selectedEdgeId()) ?? null,
  );
  protected readonly otherProcesses = computed(() =>
    this.references.processes().filter((p) => p.id !== this.id()),
  );

  constructor() {
    providePageContext(() => {
      const p = this.process();
      return {
        module: PROCESS_MODULE,
        entityType: PROCESS_ENTITY_TYPE,
        entityId: this.id(),
        view: 'edit',
        title: p ? `${p.code} ${p.title}` : null,
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!orgId || !id) {
        return;
      }
      untracked(() => this.load(orgId, id));
    });
  }

  private load(orgId: string, id: string): void {
    this.loadError.set(null);
    this.references.ensurePeople();
    this.references.ensureDocuments();
    this.references.ensureProcesses();
    this.api.get(orgId, id).subscribe({
      next: (process) => {
        const map = normaliseMap(process.map);
        this.process.set(process);
        this.map.set(map);
        this.baseline.set(map);
        this.past.set([]);
        this.future.set([]);
        this.clearSelection();
      },
      error: (error) => this.loadError.set(processErrorKey(error)),
    });
  }

  /** Whether the user may leave (asks when there are unsaved changes). */
  canLeave(): boolean {
    return !this.dirty() || window.confirm(this.language.translate('processes.map.leaveConfirm'));
  }

  // --- history -------------------------------------------------------------------------

  /** Records the current map as an undo step (before a drag or a typing session). */
  protected checkpoint(): void {
    const current = this.map();
    const past = this.past();
    if (past.length > 0 && sameMap(past[past.length - 1], current)) {
      return;
    }
    this.past.set([...past, current].slice(-HISTORY_LIMIT));
    this.future.set([]);
  }

  /** Applies an edit as one undoable step. */
  protected commit(next: ProcessMap): void {
    if (sameMap(next, this.map())) {
      return;
    }
    this.checkpoint();
    this.map.set(next);
  }

  protected undo(): void {
    const past = this.past();
    if (past.length === 0) {
      return;
    }
    this.future.set([this.map(), ...this.future()].slice(0, HISTORY_LIMIT));
    this.map.set(past[past.length - 1]);
    this.past.set(past.slice(0, -1));
    this.dropStaleSelection();
  }

  protected redo(): void {
    const [next, ...rest] = this.future();
    if (!next) {
      return;
    }
    this.past.set([...this.past(), this.map()].slice(-HISTORY_LIMIT));
    this.map.set(next);
    this.future.set(rest);
    this.dropStaleSelection();
  }

  private dropStaleSelection(): void {
    if (!this.selectedNode()) {
      this.selectedNodeId.set(null);
    }
    if (!this.selectedEdge()) {
      this.selectedEdgeId.set(null);
    }
  }

  // --- edits (the *Fn helpers return the next map for `commit`) ------------------------

  protected updateNodeFn(id: string, patch: Partial<MapNode>): ProcessMap {
    return updateNode(this.map(), id, patch);
  }

  protected updateLaneFn(
    id: string,
    patch: { role_key?: string | null; department_id?: string | null },
  ): ProcessMap {
    return updateLane(this.map(), id, patch);
  }

  protected moveLaneFn(id: string, delta: -1 | 1): ProcessMap {
    return moveLane(this.map(), id, delta);
  }

  protected removeLaneFn(id: string): ProcessMap {
    return removeLane(this.map(), id);
  }

  /** Typing edits (one checkpoint on focus, no step per keystroke). */
  protected patchNode(id: string, patch: Partial<MapNode>): void {
    this.map.set(updateNode(this.map(), id, patch));
  }

  protected patchEdge(id: string, label: string): void {
    this.map.set(updateEdge(this.map(), id, { label: label || null }));
  }

  protected patchLane(id: string, patch: { label: string }): void {
    this.map.set(updateLane(this.map(), id, patch));
  }

  protected addStep(type: MapNodeType): void {
    const laneId = this.selectedNode()?.lane_id ?? null;
    const label =
      type === 'start' || type === 'end' ? this.language.translate(nodeTypeKey(type)) : '';
    const { map, node } = addNode(this.map(), type, label, laneId);
    if (!node) {
      return;
    }
    const from = this.selectedNode();
    let next = map;
    if (from && type !== 'start' && from.type !== 'end') {
      next = addEdge(map, from.id, node.id).map;
    }
    this.commit(next);
    this.selectNode(node.id);
    this.announce('processes.map.announce.added', {
      type: this.language.translate(nodeTypeKey(type)),
    });
  }

  protected addSwimlane(): void {
    const label = this.language.translate('processes.map.lanes.defaultName', {
      n: this.map().lanes.length + 1,
    });
    const { map, lane } = addLane(this.map(), label);
    if (lane) {
      this.commit(map);
      this.announce('processes.map.announce.laneAdded', { name: label });
    }
  }

  /** A minimal start -> task -> end flow in one lane, to edit from. */
  protected startTemplate(): void {
    const t = (key: string) => this.language.translate(key);
    let map = addLane(emptyMap(), t('processes.map.template.lane')).map;
    const start = addNode(map, 'start', t('processes.map.nodeTypes.start'));
    map = start.map;
    const task = addNode(map, 'task', t('processes.map.template.task'));
    map = task.map;
    const end = addNode(map, 'end', t('processes.map.nodeTypes.end'));
    map = end.map;
    map = addEdge(map, start.node!.id, task.node!.id).map;
    map = addEdge(map, task.node!.id, end.node!.id).map;
    this.commit(map);
    this.selectNode(task.node!.id);
  }

  protected deleteStep(id: string): void {
    this.commit(removeNode(this.map(), id));
    if (this.selectedNodeId() === id) {
      this.selectedNodeId.set(null);
    }
    if (this.connectFrom() === id) {
      this.connectFrom.set(null);
    }
    this.announce('processes.map.announce.removed');
  }

  protected deleteEdge(id: string): void {
    this.commit(removeEdge(this.map(), id));
    this.selectedEdgeId.set(null);
  }

  protected onNodeMove(move: NodeMove): void {
    this.map.set(moveNode(this.map(), move.id, move.x, move.y));
  }

  // --- selection / connecting -------------------------------------------------------------

  protected onNodeSelected(id: string): void {
    const from = this.connectFrom();
    if (from && from !== id && this.canEdit()) {
      const { map, result } = addEdge(this.map(), from, id);
      this.connectFrom.set(null);
      if (result === 'ok') {
        this.commit(map);
        this.announce('processes.map.announce.connected', {
          from: this.nodeLabel(from),
          to: this.nodeLabel(id),
        });
      } else {
        this.notifications.warning(`processes.map.connectErrors.${result}`);
      }
    }
    this.selectNode(id);
  }

  private selectNode(id: string): void {
    this.selectedEdgeId.set(null);
    this.selectedNodeId.set(id);
  }

  protected selectEdge(id: string): void {
    this.connectFrom.set(null);
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(id);
  }

  protected clearSelection(): void {
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.connectFrom.set(null);
  }

  protected toggleConnect(): void {
    const node = this.selectedNode();
    this.connectFrom.set(this.connectFrom() || !node ? null : node.id);
  }

  protected nodeLabel(id: string): string {
    const node = this.map().nodes.find((n) => n.id === id);
    if (!node) {
      return id;
    }
    return node.label || this.language.translate(nodeTypeKey(node.type));
  }

  protected nextLabels(id: string): string {
    return this.map()
      .edges.filter((e) => e.source === id)
      .map((e) => (e.label ? `${this.nodeLabel(e.target)} (${e.label})` : this.nodeLabel(e.target)))
      .join(', ');
  }

  private announce(key: string, params?: Record<string, unknown>): void {
    this.announcement.set(this.language.translate(key, params));
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    } else if (event.key === 'Escape' && this.connectFrom()) {
      this.connectFrom.set(null);
    }
  }

  // --- generate / save ----------------------------------------------------------------------

  protected generateInput(): Record<string, unknown> {
    return {
      description: this.generateDescription.trim() || undefined,
      document_id: this.generateDocumentId || undefined,
      process_id: this.id(),
    };
  }

  protected onGenerated(data: unknown): void {
    const generated = normaliseMap(data);
    if (generated.nodes.length === 0) {
      this.notifications.error('processes.map.generate.emptyResult');
      return;
    }
    this.generateOpen.set(false);
    if (this.map().nodes.length === 0) {
      this.pendingGenerated.set(generated);
      this.applyGenerated();
    } else {
      this.pendingGenerated.set(generated);
    }
  }

  protected applyGenerated(): void {
    const generated = this.pendingGenerated();
    this.pendingGenerated.set(null);
    if (!generated) {
      return;
    }
    this.commit(generated);
    this.clearSelection();
    this.notifications.info('processes.map.generate.applied');
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const process = this.process();
    if (!orgId || !process || this.saving()) {
      return;
    }
    this.saving.set(true);
    const map = this.map();
    this.api.saveMap(orgId, process.id, map, this.changeReason.trim() || null).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.process.set(saved);
        this.baseline.set(map);
        this.changeReason = '';
        this.notifications.success('processes.notices.mapSaved', { version: saved.map_version });
      },
      error: (error) => {
        this.saving.set(false);
        this.notifications.error(processErrorKey(error));
      },
    });
  }
}
