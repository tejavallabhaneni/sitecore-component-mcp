import { z } from "zod";
import { getContracts, type ResolvedContract } from "./manifest";

export const PlannedComponentSchema = z.object({
  component: z.string(),
  placeholder: z.string(),
  fields: z.record(z.string(), z.string()),
  params: z.record(z.string(), z.string()).optional(),
});
export type PlannedComponent = z.infer<typeof PlannedComponentSchema>;

export type ValidationIssue = {
  severity: "error" | "warning";
  component: string;
  message: string;
  /** What "valid" looks like. This is what lets the agent self-correct. */
  fix?: string;
};

export async function validatePlan(
  plan: PlannedComponent[]
): Promise<ValidationIssue[]> {
  return checkPlan(plan, await getContracts());
}

/** Pure validation logic, separated from the Agent API call so it can be tested. */
export function checkPlan(
  plan: PlannedComponent[],
  contracts: ResolvedContract[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const counts = new Map<string, number>();

  if (plan.length === 0) {
    return [{ severity: "error", component: "-", message: "Plan is empty." }];
  }

  for (const item of plan) {
    const contract = contracts.find((c) => c.name === item.component);

    // 1 — does it exist at all?
    if (!contract) {
      const near = contracts
        .map((c) => c.name)
        .filter((n) => n.toLowerCase().includes(item.component.toLowerCase().slice(0, 5)));
      issues.push({
        severity: "error",
        component: item.component,
        message: `Component "${item.component}" does not exist.`,
        fix: near.length
          ? `Did you mean: ${near.join(", ")}? Call list_components.`
          : `Call list_components and choose a real one.`,
      });
      continue;
    }

    // 2 — is it deployed here?
    if (!contract.deployed) {
      issues.push({
        severity: "error",
        component: item.component,
        message: `"${item.component}" exists in source but is not deployed to this environment.`,
        fix: `Choose a deployed component, or deploy this one first.`,
      });
    }

    // 3 — legal placeholder?
    if (!contract.allowedPlaceholders.includes(item.placeholder)) {
      issues.push({
        severity: "error",
        component: item.component,
        message: `Not allowed in placeholder "${item.placeholder}".`,
        fix: `Allowed placeholders: ${contract.allowedPlaceholders.join(", ")}`,
      });
    }

    // 4 — design guidance on repetition
    counts.set(item.component, (counts.get(item.component) ?? 0) + 1);
    const used = counts.get(item.component)!;
    if (contract.maxPerPage && used > contract.maxPerPage) {
      issues.push({
        severity: "warning",
        component: item.component,
        message: `Used ${used} times; design guidance is max ${contract.maxPerPage}.`,
      });
    }

    // 5 — required fields present and non-empty
    for (const field of contract.fields.filter((f) => f.required)) {
      if (!item.fields[field.name]?.trim()) {
        issues.push({
          severity: "error",
          component: item.component,
          message: `Missing required field "${field.name}" (${field.type}).`,
          fix: field.guidance ?? `Provide a ${field.type} value.`,
        });
      }
    }

    // 6 — no invented field names
    const known = new Set(contract.fields.map((f) => f.name));
    for (const supplied of Object.keys(item.fields)) {
      if (!known.has(supplied)) {
        issues.push({
          severity: "error",
          component: item.component,
          message: `Field "${supplied}" does not exist on ${contract.name}.`,
          fix: `Valid fields: ${[...known].join(", ")}`,
        });
      }
    }

    // 7 — soft length limits
    for (const field of contract.fields) {
      const value = item.fields[field.name];
      if (field.maxLength && value && value.length > field.maxLength) {
        issues.push({
          severity: "warning",
          component: item.component,
          message: `"${field.name}" is ${value.length} chars, guidance is ${field.maxLength}.`,
          fix: field.guidance,
        });
      }
    }

    // 8 — constrained rendering parameters
    for (const [key, value] of Object.entries(item.params ?? {})) {
      const allowed = contract.params?.[key];
      if (allowed && !allowed.includes(value)) {
        issues.push({
          severity: "error",
          component: item.component,
          message: `Param "${key}" = "${value}" is invalid.`,
          fix: `Allowed: ${allowed.join(" | ")}`,
        });
      }
    }
  }

  return issues;
}

export function formatIssues(issues: ValidationIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error");
  const header = errors.length
    ? `${errors.length} error(s) — you MUST fix these and re-validate:`
    : `Warnings only. Safe to proceed, but review:`;

  return [
    header,
    ...issues.map(
      (i) =>
        `[${i.severity.toUpperCase()}] ${i.component}: ${i.message}` +
        (i.fix ? `\n  → ${i.fix}` : "")
    ),
  ].join("\n");
}
