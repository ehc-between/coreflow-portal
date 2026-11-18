import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, catchError, finalize, map, of, tap } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { EntityRefDto } from '../entities/entity.models';
import {
  CompleteFlowRequest,
  CompleteFlowResponse,
  CreateFlowItem,
  FlowPrefillValues,
  PrefillResponse,
  REQUIREMENT_FLOW_PREFIX,
} from './connections.models';
import { EntityTypesService } from './entity-types.service';
import { KitApi } from './kit-api';
import { kitErrorKey } from './kit-errors';

/** Query parameter carrying the signed flow token on a new-record form. */
export const FLOW_PARAM = 'flow';
/** Query parameter of "create the record that documents this requirement" forms (P1). */
export const FROM_REQUIREMENT_PARAM = 'fromRequirement';

const STORAGE_PREFIX = 'coreflow.flow.';
/** Tokens are valid for one hour on the server; forget local state a little earlier. */
const MAX_AGE_MS = 55 * 60 * 1000;
/** If no form has consumed the flow this long after arriving, explain it in a toast. */
const HINT_DELAY_MS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A create-from-here flow in progress: the new form reads it, saving completes it. */
export interface FlowContext {
  readonly key: string;
  /** Signed flow token; null for a plain `?fromRequirement=` form without one. */
  readonly token: string | null;
  readonly targetType: string;
  /** The new-form URL the flow navigated to (path and query). */
  readonly targetRoute: string;
  /** Form values in the target create-DTO's field names, plus `from` / `requirement`. */
  readonly prefill: FlowPrefillValues;
  /** The record the new one is created from (null for requirement flows). */
  readonly source: EntityRefDto | null;
  /** The requirement the new record documents (requirement flows). */
  readonly requirementRef: string | null;
  readonly startedAt: number;
}

interface StoredFlow extends FlowContext {
  readonly orgId: string;
}

/** A flow that finished: the new record is saved and linked back to its source. */
export interface FlowCompletion {
  readonly key: string;
  /** The flow token (null for a plain `?fromRequirement=` form). */
  readonly token: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly source: EntityRefDto | null;
}

/** Options of {@link CreateFlowService.start}. */
export interface StartFlowOptions {
  /**
   * Values that replace the server's prefill (e.g. the title of a SWOT factor
   * instead of the analysis title). `from` and `requirement` are kept.
   */
  readonly prefill?: Readonly<Record<string, unknown>>;
  /** Called with the flow token once the flow is underway (before navigating). */
  readonly onStarted?: (token: string) => void;
}

/**
 * "Create from here" (P4, polish plan 2.5). A source record offers flows such as
 * "deviation → risk"; starting one asks the backend for prefill values and a
 * signed token, then opens the target's new-form with `?flow=<token>`.
 *
 * New forms integrate in two lines:
 *
 *   readonly flow = inject(CreateFlowService).consume(inject(ActivatedRoute), { targetType: 'risk' });
 *   // when flow() is set: patchFromPrefill(this.form, flow.prefill)
 *   // after a successful create:
 *   this.flows.complete(created.id).subscribe();
 *
 * `complete()` links the new record back to its source (origin `flow`), copies the
 * source's confirmed requirement links as suggestions and shows "Koblet til AVV-12".
 * `?fromRequirement=<ref>` forms are handled the same way (a confirmed
 * requirement link is written instead of a record link).
 *
 * Forms that have not integrated yet still get the link: when the user leaves the
 * flow's new-form for the detail page of a just-created record of the target type
 * (`/risk/risks/new` → `/risk/risks/<id>`), the flow is completed automatically.
 */
@Injectable({ providedIn: 'root' })
export class CreateFlowService {
  private readonly api = inject(KitApi);
  private readonly router = inject(Router);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly document = inject(DOCUMENT);

  /** Key of the flow being started (for a loading state on the menu item). */
  readonly starting = signal<string | null>(null);

  private readonly completions = new Subject<FlowCompletion>();
  /**
   * Every flow that completed (the link was written). Root services use it to do
   * follow-up work that outlives the source page, e.g. attaching the new record
   * to the SWOT factor it was created from.
   */
  readonly completed: Observable<FlowCompletion> = this.completions.asObservable();

  private active: StoredFlow | null = null;
  /** Tokens whose completion is in flight or done (never complete twice). */
  private readonly completing = new Set<string>();
  /** Whether a form has called `consume()` for the active flow. */
  private consumed = false;
  private previousPath: string | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.active = this.restoreLatest();
    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.onNavigated(event.urlAfterRedirects);
      }
    });
    this.previousPath = pathOf(this.router.url);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      if (this.hintTimer) {
        clearTimeout(this.hintTimer);
      }
    });
  }

  /**
   * Start a flow: fetch the prefill and token, then open the new-form. For a
   * requirement flow pass `{ ref }` as the source. Resolves to false (with a toast)
   * when the backend refuses.
   */
  start(
    flow: CreateFlowItem | string,
    sourceType: string,
    source: string | { readonly id?: string | null; readonly ref?: string | null },
    options: StartFlowOptions = {},
  ): Promise<boolean> {
    const orgId = this.selectedOrg.currentOrgId();
    const key = typeof flow === 'string' ? flow : flow.key;
    if (!orgId || this.starting() !== null) {
      return Promise.resolve(false);
    }
    const sourceId = typeof source === 'string' ? source : (source.id ?? null);
    const sourceRef = typeof source === 'string' ? null : (source.ref ?? null);
    this.starting.set(key);
    return new Promise<boolean>((resolve) => {
      this.api
        .prefillFlow(orgId, key, { sourceId, sourceRef })
        .pipe(finalize(() => this.starting.set(null)))
        .subscribe({
          next: (response) => {
            const res = withPrefill(response, options.prefill);
            const ctx = this.remember(orgId, res, sourceType === 'standard_requirement');
            options.onStarted?.(res.token);
            this.consumed = false;
            void this.router.navigateByUrl(ctx.targetRoute).then((ok) => {
              if (ok && pathOf(this.router.url) !== pathOf(ctx.targetRoute)) {
                // The app redirected away (the form is not there yet): say so
                // instead of leaving the user on an unrelated page.
                this.forget(ctx);
                this.notifications.warning('kit.flows.formMissing');
                resolve(false);
                return;
              }
              if (ok) {
                this.scheduleHint(ctx);
              }
              resolve(ok);
            });
          },
          error: (error: unknown) => {
            this.notifications.error(kitErrorKey(error));
            resolve(false);
          },
        });
    });
  }

  /**
   * The flow a new-form was opened with (`?flow=` or `?fromRequirement=`), or null.
   * Restores it after a reload (re-reading the prefill from the token) and makes
   * it the flow `complete()` finishes. `targetType` is needed for
   * `?fromRequirement=` forms opened without a token (P1's create links).
   */
  consume(
    route: ActivatedRoute,
    options: { readonly targetType?: string } = {},
  ): Signal<FlowContext | null> {
    const result = signal<FlowContext | null>(null);
    const orgId = this.selectedOrg.currentOrgId();
    const params = route.snapshot.queryParamMap;
    const token = params.get(FLOW_PARAM);
    const requirementRef = params.get(FROM_REQUIREMENT_PARAM);
    this.consumed = true;
    if (!orgId || (!token && !requirementRef)) {
      return result.asReadonly();
    }
    if (token) {
      const known = this.lookup(token, orgId);
      if (known) {
        this.active = known;
        result.set(known);
        return result.asReadonly();
      }
      // A reload or a new tab: the token says which flow and source; refetch the values.
      const claims = decodeClaims(token);
      if (claims?.key) {
        this.api
          .prefillFlow(orgId, claims.key, {
            sourceId: claims.ref ? null : (claims.sid ?? null),
            sourceRef: claims.ref ?? null,
          })
          .subscribe({
            next: (res) => {
              const ctx = this.remember(orgId, res, !!claims.ref);
              result.set(ctx);
            },
            error: () => result.set(null),
          });
      }
      return result.asReadonly();
    }
    // `?fromRequirement=<ref>` without a token.
    const targetType = options.targetType ?? null;
    const base: StoredFlow = {
      orgId,
      key: targetType ? `${REQUIREMENT_FLOW_PREFIX}${targetType}` : REQUIREMENT_FLOW_PREFIX,
      token: null,
      targetType: targetType ?? '',
      targetRoute: this.router.url,
      prefill: {},
      source: null,
      requirementRef,
      startedAt: Date.now(),
    };
    this.active = base;
    result.set(base);
    if (targetType && requirementRef) {
      // Best effort: the requirement's number and title for the form's banner.
      this.api
        .prefillFlow(orgId, base.key, { sourceRef: requirementRef })
        .pipe(catchError(() => of(null)))
        .subscribe((res) => {
          if (res && this.active === base) {
            const ctx: StoredFlow = { ...base, prefill: res.prefill, token: res.token };
            this.active = ctx;
            this.store(ctx);
            result.set(ctx);
          }
        });
    }
    return result.asReadonly();
  }

  /** The flow in progress (started or consumed), if any. */
  current(): FlowContext | null {
    const ctx = this.active;
    return ctx && this.fresh(ctx) && ctx.orgId === this.selectedOrg.currentOrgId() ? ctx : null;
  }

  /**
   * Link the just-created record to the flow's source. Call right after a
   * successful create; emits null when there is no flow in progress (so forms can
   * call it unconditionally). Shows a toast either way it ends.
   */
  complete(targetId: string, targetType?: string): Observable<CompleteFlowResponse | null> {
    const ctx = this.current();
    const orgId = this.selectedOrg.currentOrgId();
    if (!ctx || !orgId) {
      return of(null);
    }
    const marker = ctx.token ?? `${ctx.requirementRef}:${targetId}`;
    if (this.completing.has(marker)) {
      return of(null);
    }
    let body: CompleteFlowRequest;
    if (ctx.token) {
      body = { target_id: targetId, token: ctx.token };
    } else if (ctx.requirementRef && (targetType || ctx.targetType)) {
      body = {
        target_id: targetId,
        requirement_ref: ctx.requirementRef,
        target_type: targetType || ctx.targetType,
      };
    } else {
      return of(null);
    }
    this.completing.add(marker);
    return this.api.completeFlow(orgId, body).pipe(
      tap((res) => {
        this.forget(ctx);
        this.announce(res);
        this.completions.next({
          key: ctx.key,
          token: ctx.token,
          targetType: (targetType || ctx.targetType) ?? '',
          targetId,
          source: ctx.source,
        });
      }),
      map((res): CompleteFlowResponse | null => res),
      catchError((error: unknown) => {
        this.forget(ctx);
        if (!(error instanceof HttpErrorResponse && error.status === 409)) {
          // 409 = already linked: nothing to tell.
          this.notifications.warning('kit.flows.linkFailed', {
            name: ctx.source?.code || ctx.source?.title || '',
          });
        }
        return of(null);
      }),
    );
  }

  /** Drop the flow in progress (e.g. the user cancelled the form). */
  cancel(): void {
    if (this.active) {
      this.forget(this.active);
    }
  }

  // --- internals ------------------------------------------------------------------

  private announce(res: CompleteFlowResponse): void {
    if (res.requirement_link_id) {
      this.notifications.success('kit.flows.requirementLinkedToast');
      return;
    }
    const source = res.source;
    if (!source) {
      return;
    }
    const name = source.code || source.title;
    if (res.requirement_suggestions > 0) {
      this.notifications.success('kit.flows.linkedToastWithSuggestions', {
        name,
        count: res.requirement_suggestions,
      });
    } else {
      this.notifications.success('kit.flows.linkedToast', { name });
    }
  }

  /**
   * Auto-complete for forms that do not call `complete()` themselves: leaving the
   * flow's new-form for `<list path>/<new id>` means the record was just created.
   */
  private onNavigated(url: string): void {
    const path = pathOf(url);
    const previous = this.previousPath;
    this.previousPath = path;
    const ctx = this.current();
    if (!ctx || !previous) {
      return;
    }
    const formPath = pathOf(ctx.targetRoute);
    if (path === formPath) {
      return;
    }
    if (previous === formPath && formPath.endsWith('/new')) {
      const base = formPath.slice(0, -'/new'.length);
      const rest = path.startsWith(base + '/') ? path.slice(base.length + 1) : '';
      const id = rest.split('/')[0];
      if (id && UUID.test(id) && (!ctx.source || ctx.source.entity_id !== id)) {
        this.complete(id).subscribe();
        return;
      }
    }
    if (previous === formPath) {
      // Left the form without creating anything: the flow is over.
      this.forget(ctx);
    }
  }

  private scheduleHint(ctx: FlowContext): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
    }
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      if (
        this.consumed ||
        this.active?.token !== ctx.token ||
        !pathOf(ctx.targetRoute).endsWith('/new')
      ) {
        // A form that reads the flow shows its own banner; forms on a parent's
        // page (treatments, evaluations) open themselves.
        return;
      }
      const type = this.entityTypes.label(ctx.targetType);
      this.fillUnintegratedForm(ctx, 0);
      if (ctx.source) {
        this.notifications.info('kit.flows.arrivedHint', {
          type,
          name: ctx.source.code || ctx.source.title,
        });
      } else if (ctx.requirementRef) {
        this.notifications.info('kit.flows.arrivedRequirementHint', { type });
      }
    }, HINT_DELAY_MS);
  }

  /**
   * Fallback prefill for new-forms that do not call `consume()` yet: put the
   * flow's plain text values (title, description, …) into the matching empty
   * text inputs (`formControlName`, `name` or an id ending in `-<field>`) and let the form
   * pick them up through its normal input event. Selects, dates and anything
   * the user already typed are left alone. Retries briefly while the form loads.
   */
  private fillUnintegratedForm(ctx: FlowContext, attempt: number): void {
    const root = this.document.querySelector('main') ?? this.document.body;
    let found = 0;
    for (const [field, value] of Object.entries(ctx.prefill)) {
      if (typeof value !== 'string' || !value || !/^[a-z_]+$/.test(field)) {
        continue;
      }
      const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        [`formcontrolname="${field}"`, `name="${field}"`, `id$="-${field}"`]
          .map((attr) => `input[${attr}], textarea[${attr}]`)
          .join(', '),
      );
      if (!el) {
        continue;
      }
      found++;
      const textual = el instanceof HTMLTextAreaElement || ['text', 'search', ''].includes(el.type);
      if (textual && !el.value && !el.disabled && !el.readOnly) {
        el.value = value.slice(0, el.maxLength > 0 ? el.maxLength : value.length);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (found === 0 && attempt < 6 && this.active?.token === ctx.token) {
      setTimeout(() => this.fillUnintegratedForm(ctx, attempt + 1), 400);
    }
  }

  private remember(orgId: string, res: PrefillResponse, fromRequirement: boolean): StoredFlow {
    const requirementRef =
      res.prefill.requirement?.ref ??
      (fromRequirement || res.key.startsWith(REQUIREMENT_FLOW_PREFIX)
        ? (new URLSearchParams(res.target_route.split('?')[1] ?? '').get(FROM_REQUIREMENT_PARAM) ??
          null)
        : null);
    const ctx: StoredFlow = {
      orgId,
      key: res.key,
      token: res.token,
      targetType: res.target_type,
      targetRoute: withParam(res.target_route, FLOW_PARAM, res.token),
      prefill: res.prefill,
      source: res.source,
      requirementRef,
      startedAt: Date.now(),
    };
    this.active = ctx;
    this.store(ctx);
    return ctx;
  }

  private lookup(token: string, orgId: string): StoredFlow | null {
    if (this.active?.token === token && this.active.orgId === orgId) {
      return this.active;
    }
    const stored = readStored(token);
    return stored && stored.orgId === orgId && this.fresh(stored) ? stored : null;
  }

  private fresh(ctx: FlowContext): boolean {
    return Date.now() - ctx.startedAt < MAX_AGE_MS;
  }

  private store(ctx: StoredFlow): void {
    if (!ctx.token) {
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_PREFIX + ctx.token.slice(-24), JSON.stringify(ctx));
      sessionStorage.setItem(STORAGE_PREFIX + 'latest', ctx.token.slice(-24));
    } catch {
      // Storage unavailable (private mode): the flow still works in this tab.
    }
  }

  private forget(ctx: FlowContext): void {
    if (this.active === ctx || (ctx.token && this.active?.token === ctx.token)) {
      this.active = null;
    }
    if (!ctx.token) {
      return;
    }
    try {
      sessionStorage.removeItem(STORAGE_PREFIX + ctx.token.slice(-24));
      if (sessionStorage.getItem(STORAGE_PREFIX + 'latest') === ctx.token.slice(-24)) {
        sessionStorage.removeItem(STORAGE_PREFIX + 'latest');
      }
    } catch {
      // ignore
    }
  }

  private restoreLatest(): StoredFlow | null {
    try {
      const id = sessionStorage.getItem(STORAGE_PREFIX + 'latest');
      const raw = id ? sessionStorage.getItem(STORAGE_PREFIX + id) : null;
      const ctx = raw ? (JSON.parse(raw) as StoredFlow) : null;
      return ctx && this.fresh(ctx) ? ctx : null;
    } catch {
      return null;
    }
  }
}

/**
 * Patch a reactive form with flow prefill values: only controls that exist and
 * are still empty, so nothing the user typed is overwritten. Nested groups are
 * patched recursively; `from` and `requirement` are never form values.
 */
export function patchFromPrefill(form: FormGroup, prefill: FlowPrefillValues): void {
  for (const [field, value] of Object.entries(prefill)) {
    if (field === 'from' || field === 'requirement' || value === undefined || value === null) {
      continue;
    }
    const control: AbstractControl | null = form.get(field);
    if (!control) {
      continue;
    }
    if (control instanceof FormGroup && typeof value === 'object' && !Array.isArray(value)) {
      patchFromPrefill(control, value as FlowPrefillValues);
      continue;
    }
    const currentValue: unknown = control.value;
    const empty =
      currentValue === null ||
      currentValue === undefined ||
      currentValue === '' ||
      (Array.isArray(currentValue) && currentValue.length === 0);
    if (empty) {
      control.setValue(value);
      control.markAsDirty();
    }
  }
}

/** A prefill response with caller overrides applied (`from` / `requirement` are kept). */
export function withPrefill(
  res: PrefillResponse,
  overrides: Readonly<Record<string, unknown>> | null | undefined,
): PrefillResponse {
  if (!overrides) {
    return res;
  }
  const extra = Object.fromEntries(
    Object.entries(overrides).filter(
      ([key, value]) => key !== 'from' && key !== 'requirement' && value !== undefined,
    ),
  );
  return { ...res, prefill: { ...res.prefill, ...extra } };
}

/** The claims of a flow token (read only to recover after a reload; the server verifies it). */
export function decodeClaims(
  token: string,
): { key?: string; sid?: string; st?: string; ref?: string } | null {
  const part = token.split('.')[1];
  if (!part) {
    return null;
  }
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return {
      key: str(claims['key']),
      sid: str(claims['sid']),
      st: str(claims['st']),
      ref: str(claims['ref']),
    };
  } catch {
    return null;
  }
}

function readStored(token: string): StoredFlow | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + token.slice(-24));
    const ctx = raw ? (JSON.parse(raw) as StoredFlow) : null;
    return ctx && ctx.token === token ? ctx : null;
  } catch {
    return null;
  }
}

/** `/risk/risks/new?x=1#y` → `/risk/risks/new`. */
export function pathOf(url: string): string {
  const path = url.split(/[?#]/)[0] || '/';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Add or replace one query parameter of an app URL. */
export function withParam(url: string, name: string, value: string): string {
  const [beforeHash, hash] = url.split('#');
  const [path, query] = beforeHash.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set(name, value);
  return `${path}?${params.toString()}${hash ? '#' + hash : ''}`;
}
