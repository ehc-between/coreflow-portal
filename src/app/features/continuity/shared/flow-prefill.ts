import { FlowPrefillValues } from '../../../core/kit/connections.models';

/** A text value of a create-flow prefill ('' when absent or not a string). */
export function prefillText(values: FlowPrefillValues, key: string): string {
  const value = values[key];
  return typeof value === 'string' ? value : '';
}

/** A list of ids from a create-flow prefill (`bia_ids`). */
export function prefillIds(values: FlowPrefillValues, key: string): string[] {
  const value = values[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
