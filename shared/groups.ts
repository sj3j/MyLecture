/**
 * Group / subgroup helpers, shared by the app and the promotion script.
 *
 * A subgroup is a group letter followed by a 1-based index: "A1", "C2".
 * The same value is stored in two unsynced places - `students.subgroup` (drives
 * the admin roster and its filters) and `users.group` (gates the whole app; see
 * src/App.tsx, which forces the onboarding screen when it is missing). Anything
 * that assigns a group has to write both.
 *
 * Structurally compatible with StageGroupConfig in src/types.ts, declared
 * locally so shared/ never imports from src/.
 */

export interface GroupConfigLike {
  groups: { id: string; subgroupCount: number }[];
}

/** Matches DEFAULT_GROUP_CONFIG in src/types.ts - groups A..D, 4 subgroups each. */
export const FALLBACK_GROUP_CONFIG: GroupConfigLike = {
  groups: ['A', 'B', 'C', 'D'].map(id => ({ id, subgroupCount: 4 })),
};

/** "C2" -> { group: 'C', index: 2 }. Returns null for blank/malformed values. */
export function parseSubgroup(raw?: string | null): { group: string; index: number } | null {
  const value = (raw || '').trim().toUpperCase();
  const match = value.match(/^([A-Z])(\d+)$/);
  if (!match) return null;
  return { group: match[1], index: parseInt(match[2], 10) };
}

/** Every subgroup a stage's config permits, e.g. ['A1','A2','B1',...]. */
export function subgroupOptions(config: GroupConfigLike): string[] {
  return config.groups.flatMap(g =>
    Array.from({ length: g.subgroupCount }, (_, i) => `${g.id}${i + 1}`),
  );
}

/** Does this stage's config actually contain that subgroup? */
export function isValidSubgroup(config: GroupConfigLike, raw?: string | null): boolean {
  const parsed = parseSubgroup(raw);
  if (!parsed) return false;
  const group = config.groups.find(g => g.id === parsed.group);
  return !!group && parsed.index >= 1 && parsed.index <= group.subgroupCount;
}

/** Normalises to canonical form ("c2" -> "C2"), or null when unparseable. */
export function normalizeSubgroup(raw?: string | null): string | null {
  const parsed = parseSubgroup(raw);
  return parsed ? `${parsed.group}${parsed.index}` : null;
}
