import { getContracts, type ResolvedContract } from "./manifest";
import { fieldSignature } from "./contract";

export type DuplicateGroup = {
  kind: "identical" | "near-identical" | "subset";
  similarity: number;
  components: {
    name: string;
    sourcePath?: string;
    deployed: boolean;
    fieldCount: number;
  }[];
  sharedFields: string[];
  differingFields: string[];
  recommendation: string;
};

/** Jaccard similarity over the set of "name:type" pairs. */
export function similarity(a: ResolvedContract, b: ResolvedContract): number {
  const sa = new Set(a.fields.map((f) => `${f.name.toLowerCase()}:${f.type}`));
  const sb = new Set(b.fields.map((f) => `${f.name.toLowerCase()}:${f.type}`));
  if (sa.size === 0 && sb.size === 0) return 1;
  let shared = 0;
  for (const x of sa) if (sb.has(x)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

function fieldNames(c: ResolvedContract): Set<string> {
  return new Set(c.fields.map((f) => f.name.toLowerCase()));
}

function isSubset(a: ResolvedContract, b: ResolvedContract): boolean {
  const [sa, sb] = [fieldNames(a), fieldNames(b)];
  if (sa.size === 0 || sa.size >= sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

export async function findDuplicates(threshold = 0.7): Promise<DuplicateGroup[]> {
  return groupDuplicates(await getContracts(), threshold);
}

/** Pure grouping logic, separated from the Agent API call so it can be tested. */
export function groupDuplicates(
  contracts: ResolvedContract[],
  threshold = 0.7
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  // Pass 1 — exact structural matches, grouped by signature
  const bySignature = new Map<string, ResolvedContract[]>();
  for (const c of contracts) {
    const sig = fieldSignature(c);
    bySignature.set(sig, [...(bySignature.get(sig) ?? []), c]);
  }

  for (const [, group] of bySignature) {
    if (group.length < 2) continue;
    group.forEach((c) => seen.add(c.name));
    groups.push({
      kind: "identical",
      similarity: 1,
      components: group.map(summarise),
      sharedFields: group[0].fields.map((f) => f.name),
      differingFields: [],
      recommendation:
        `${group.length} components with an identical field signature. ` +
        `These are the same component. Keep the most-used one, migrate ` +
        `datasources, and delete the rest.`,
    });
  }

  // Pass 2 — near-identical and subset pairs
  for (let i = 0; i < contracts.length; i++) {
    for (let j = i + 1; j < contracts.length; j++) {
      const [a, b] = [contracts[i], contracts[j]];
      if (seen.has(a.name) && seen.has(b.name)) continue;

      const score = similarity(a, b);
      const subset = isSubset(a, b) || isSubset(b, a);
      if (score < threshold && !subset) continue;

      const na = fieldNames(a);
      const nb = fieldNames(b);
      const shared = [...na].filter((x) => nb.has(x));
      const differing = [
        ...[...na].filter((x) => !nb.has(x)),
        ...[...nb].filter((x) => !na.has(x)),
      ];

      groups.push({
        kind: subset ? "subset" : "near-identical",
        similarity: Number(score.toFixed(2)),
        components: [summarise(a), summarise(b)],
        sharedFields: shared,
        differingFields: differing,
        recommendation: subset
          ? `One component's fields are a strict subset of the other. ` +
            `Consider a single component with optional fields, or a ` +
            `rendering variant, instead of two renderings.`
          : `${Math.round(score * 100)}% field overlap, differing only in ` +
            `[${differing.join(", ")}]. Usually one component with optional ` +
            `fields plus a rendering parameter.`,
      });
    }
  }

  return groups.sort((x, y) => y.similarity - x.similarity);
}

function summarise(c: ResolvedContract) {
  return {
    name: c.name,
    sourcePath: c.sourcePath,
    deployed: c.deployed,
    fieldCount: c.fields.length,
  };
}
