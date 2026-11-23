/**
 * One-shot handoff for member multi-select directory pages (folder/file
 * visibility, support roster): the directory screen stashes the pick, the
 * calling form collects it when focus returns.
 * `undefined` means no pick was made yet.
 */

export type MemberSelection = {
  context: string;
  ids: string[];
};

let pending: MemberSelection | undefined = undefined;

export function setPendingMemberSelection(pick: MemberSelection): void {
  pending = pick;
}

export function takePendingMemberSelection(
  context: string,
): string[] | undefined {
  if (!pending || pending.context !== context) return undefined;
  const out = pending.ids;
  pending = undefined;
  return out;
}
