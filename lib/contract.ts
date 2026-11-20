import { z } from "zod";

/** The Sitecore field types we know how to map from JSS. */
export const SitecoreFieldType = z.enum([
  "Single-Line Text",
  "Multi-Line Text",
  "Rich Text",
  "Image",
  "General Link",
  "Checkbox",
  "Droplink",
  "Droptree",
  "Multilist",
  "Treelist",
  "Date",
  "Datetime",
  "Number",
  "Integer",
]);
export type SitecoreFieldType = z.infer<typeof SitecoreFieldType>;

export const FieldContract = z.object({
  /** Exact Sitecore field name. Case matters. */
  name: z.string(),
  type: SitecoreFieldType,
  required: z.boolean(),
  /**
   * Soft limit. Sitecore does not enforce this — your layout does.
   * Violations are warnings, never errors.
   */
  maxLength: z.number().int().positive().optional(),
  /** Free text the model reads and respects. Write it for a human. */
  guidance: z.string().optional(),
  /** For Droplink / constrained fields. */
  allowedValues: z.array(z.string()).optional(),
});
export type FieldContract = z.infer<typeof FieldContract>;

export const ComponentContract = z.object({
  name: z.string(),
  description: z.string(),
  /** Resolved from the Agent API at runtime, not from source. */
  renderingId: z.string().optional(),
  datasourceTemplate: z.string().optional(),
  /** Empty array means "nowhere" — treat as a config error. */
  allowedPlaceholders: z.array(z.string()),
  maxPerPage: z.number().int().positive().optional(),
  fields: z.array(FieldContract),
  /** Rendering parameters with constrained values. */
  params: z.record(z.string(), z.array(z.string())).optional(),
  /** Relative path in the repo. Used by the duplicate report. */
  sourcePath: z.string().optional(),
  /** A known-good example — few-shot prompting via tool response. */
  example: z.record(z.string(), z.unknown()).optional(),
});
export type ComponentContract = z.infer<typeof ComponentContract>;

/**
 * A stable, order-independent signature of a component's shape.
 * Two components with the same signature are structurally identical
 * regardless of what they're called.
 */
export function fieldSignature(c: ComponentContract): string {
  return c.fields
    .map((f) => `${f.name.toLowerCase()}:${f.type}:${f.required ? 1 : 0}`)
    .sort()
    .join("|");
}
