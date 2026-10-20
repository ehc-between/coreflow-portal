import { DeviationEvent } from '../../core/deviations/deviation.models';
import { actionStatusLabelKey, statusLabelKey } from './deviation-enums';

/** Synchronous translator (key + params → text), e.g. `LanguageService.translate`. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Resolves a user / department id to a display name (undefined when unknown). */
export type SubjectNameLookup = (subjectType: string, id: string) => string | undefined;

/** A timeline row's localised text. */
export interface EventText {
  readonly summary: string;
  readonly detail: string | null;
}

/** Event kinds the backend writes to a deviation's trail. */
export const EVENT_KINDS = [
  'created',
  'updated',
  'status_changed',
  'closed',
  'deleted',
  'action_added',
  'action_updated',
  'action_removed',
  'access_granted',
  'access_revoked',
  // Legacy (pre-coded API): grant / revoke / removal shared these kinds.
  'access_changed',
] as const;

/** Field names the backend lists in an `updated` event's `detail.fields`. */
export const EVENT_FIELD_NAMES = [
  'title',
  'description',
  'standards',
  'clauses',
  'tags',
  'severity',
  'source',
  'root_cause',
  'root_cause_method',
  'due_at',
  'data',
  'owner',
  'department',
  'visibility',
  'status',
] as const;

const ACTION_KINDS = ['containment', 'corrective', 'preventive'];

/** i18n key for the noun form of an action kind ("Corrective action" / "Korrigerende tiltak"). */
export function actionNounKey(kind: string | undefined): string {
  return `deviations.actions.kindNoun.${kind && ACTION_KINDS.includes(kind) ? kind : 'unknown'}`;
}

/** i18n key for a field name in an `updated` event. Unknown names return null. */
export function eventFieldKey(field: string): string | null {
  return (EVENT_FIELD_NAMES as readonly string[]).includes(field)
    ? `deviations.events.fields.${field}`
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * The backend's action summaries carry the kind only in English text
 * ("Corrective action updated (done)"); recover it when `detail.kind` is absent.
 */
function actionKindFrom(event: DeviationEvent): string | undefined {
  const fromDetail = str(event.detail?.['kind']);
  if (fromDetail) {
    return fromDetail;
  }
  const match = /^(containment|corrective|preventive)\b/i.exec(event.summary ?? '');
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Localise a deviation audit-trail event from its `kind` and structured
 * `detail`, instead of showing the backend's English `summary`. Unknown kinds
 * fall back to the backend summary as-is.
 */
export function describeEvent(
  event: DeviationEvent,
  t: Translate,
  subjectName: SubjectNameLookup = () => undefined,
): EventText {
  const detail = event.detail ?? {};
  switch (event.kind) {
    case 'created':
      return { summary: t('deviations.events.created'), detail: null };
    case 'deleted':
      return { summary: t('deviations.events.deleted'), detail: null };
    case 'status':
    case 'status_change':
    case 'status_changed':
    case 'closed': {
      const from = str(detail['from']);
      const to = str(detail['to']);
      const reason = str(detail['reason']);
      return {
        summary:
          from && to
            ? t('deviations.events.statusChanged', {
                from: t(statusLabelKey(from)),
                to: t(statusLabelKey(to)),
              })
            : t('deviations.events.statusChangedGeneric'),
        detail: reason ? t('deviations.events.reason', { reason }) : null,
      };
    }
    case 'updated': {
      const fields = Array.isArray(detail['fields'])
        ? (detail['fields'] as unknown[]).filter((f): f is string => typeof f === 'string')
        : null;
      if (fields === null) {
        return {
          summary: t(
            event.summary === 'No changes'
              ? 'deviations.events.noChanges'
              : 'deviations.events.updated',
          ),
          detail: null,
        };
      }
      if (fields.length === 0) {
        return { summary: t('deviations.events.noChanges'), detail: null };
      }
      const names = fields.map((f) => {
        const key = eventFieldKey(f);
        return key ? t(key) : f.replace(/_/g, ' ');
      });
      return {
        summary: t('deviations.events.updatedFields', { fields: names.join(', ') }),
        detail: null,
      };
    }
    case 'action_added':
      return {
        summary: t('deviations.events.actionAdded', {
          action: t(actionNounKey(actionKindFrom(event))),
        }),
        detail: null,
      };
    case 'action_removed':
      return {
        summary: t('deviations.events.actionRemoved', {
          action: t(actionNounKey(actionKindFrom(event))),
        }),
        detail: null,
      };
    case 'action_updated': {
      const action = t(actionNounKey(actionKindFrom(event)));
      const status = str(detail['status']);
      const fields = Array.isArray(detail['fields']) ? (detail['fields'] as unknown[]) : null;
      // Current API: `fields` lists what changed; only call out the status
      // when it is among them. Legacy API: `status` alone, no `fields`.
      if (status && (fields === null || fields.includes('status'))) {
        return {
          summary: t('deviations.events.actionStatus', {
            action,
            status: t(actionStatusLabelKey(status)),
          }),
          detail: null,
        };
      }
      // Legacy API logged a removal as action_updated with only an action_id.
      const removed = fields === null && !status && /\bremoved\b/i.test(event.summary ?? '');
      return {
        summary: t(
          removed ? 'deviations.events.actionRemoved' : 'deviations.events.actionUpdated',
          { action },
        ),
        detail: null,
      };
    }
    case 'access_granted':
    case 'access_revoked':
    case 'access_changed': {
      const subjectType = str(detail['subject_type']);
      const subjectId = str(detail['subject_id']);
      if (!subjectType) {
        return { summary: t('deviations.events.accessChanged'), detail: null };
      }
      const subject =
        (subjectId && subjectName(subjectType, subjectId)) ||
        t(
          subjectType === 'department'
            ? 'deviations.events.subject.department'
            : 'deviations.events.subject.user',
        );
      const level = str(detail['level']);
      const levelLabel = t(level === 'edit' ? 'deviations.access.edit' : 'deviations.access.view');
      // Legacy access_changed: a level means granted, none means revoked.
      const revoked =
        event.kind === 'access_revoked' || (event.kind === 'access_changed' && !level);
      if (revoked) {
        return { summary: t('deviations.events.accessRevoked', { subject }), detail: null };
      }
      const previous = str(detail['previous_level']);
      return {
        summary: t(
          previous && previous !== level
            ? 'deviations.events.accessLevelChanged'
            : 'deviations.events.accessGranted',
          { subject, level: levelLabel },
        ),
        detail: null,
      };
    }
    default:
      // Unknown kind: the backend's own (English) summary is the best we have.
      return { summary: event.summary, detail: null };
  }
}
