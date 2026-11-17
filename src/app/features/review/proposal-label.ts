import { Proposal, ProposalDetail } from '../../core/documents/document.models';
import { labelText } from '../../shared/requirement-links/requirement-label';

/**
 * "ISO 9001 · 7.5.1" for the requirement a proposed draft was written for, from
 * the server's readable label (in the request language). Null when the proposal
 * names no requirement or the label is missing: the raw ref is never shown.
 */
export function proposalRequirementText(
  proposal: Pick<Proposal | ProposalDetail, 'requirement_label'>,
): string | null {
  const label = proposal.requirement_label;
  if (!label?.short || !label.number) {
    return null;
  }
  return labelText(label.short, label.number);
}
