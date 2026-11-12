import { dueAtFromDay } from '../../../shared/tasks/task-display';
import { ExtractedObligation, ObligationCreate } from './contract.models';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An obligation task from an extracted obligation: the title, the party and the
 * recurrence hint as description (a person turns that into a real schedule), and
 * the due date when the extraction found a calendar day.
 */
export function obligationFromExtraction(o: ExtractedObligation): ObligationCreate {
  const notes = [o.party?.trim(), o.recurring?.trim()].filter(Boolean).join(' · ');
  const due = o.due_date?.trim() ?? '';
  return {
    title: o.title.trim().slice(0, 255),
    description: notes || null,
    due_at: ISO_DAY.test(due) ? dueAtFromDay(due) : null,
  };
}
