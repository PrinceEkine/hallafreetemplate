/**
 * One-shot handoff for the task assignee directory: the directory screen
 * stashes the picks, the task form collects them when focus returns.
 * `undefined` means no pick was made; an empty list clears to nobody.
 */

export type AssigneePick = { userId: string; name: string };

let pending: AssigneePick[] | undefined = undefined;

export function setPendingAssignees(picks: AssigneePick[]): void {
  pending = picks;
}

export function takePendingAssignees(): AssigneePick[] | undefined {
  const out = pending;
  pending = undefined;
  return out;
}
