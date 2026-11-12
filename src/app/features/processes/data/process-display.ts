import { BadgeTone } from '../../../shared/ui/badge/badge';
import { MapNodeType, ProcessCategory, ProcessStatus } from './process.models';

export function statusKey(status: ProcessStatus | string): string {
  return `processes.status.${status}`;
}

export function statusTone(status: ProcessStatus | string): BadgeTone {
  switch (status) {
    case 'active':
      return 'pass';
    case 'retired':
      return 'neutral';
    default:
      return 'info';
  }
}

export function categoryKey(category: ProcessCategory | string): string {
  return `processes.category.${category}`;
}

export function categoryTone(category: ProcessCategory | string): BadgeTone {
  switch (category) {
    case 'management':
      return 'accent';
    case 'support':
      return 'neutral';
    default:
      return 'info';
  }
}

export function nodeTypeKey(type: MapNodeType | string): string {
  return `processes.map.nodeTypes.${type}`;
}

/** A naive-UTC ISO datetime from a `yyyy-mm-dd` date input (null when empty). */
export function dateInputToIso(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : null;
}

/** The `yyyy-mm-dd` part of an ISO datetime, for a date input. */
export function isoToDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}
