import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkPlan, formatIssues } from "../lib/validate";
import { groupDuplicates } from "../lib/duplicates";
import { fieldSignature, type ComponentContract } from "../lib/contract";
import type { ResolvedContract } from "../lib/manifest";

const root = path.resolve(__dirname, "..");

const promoSplit: ResolvedContract = {
  name: "PromoSplit",
  description: "Two-column promo",
  allowedPlaceholders: ["main", "promo-zone"],
  maxPerPage: 3,
  params: { variant: ["image-left", "image-right", "stacked"] },
  deployed: true,
  fields: [
    { name: "Eyebrow", type: "Single-Line Text", required: false, maxLength: 24 },
    { name: "Heading", type: "Single-Line Text", required: true, maxLength: 60, guidance: "Keep it tight." },
    { name: "Body", type: "Rich Text", required: true, maxLength: 220 },
    { name: "Image", type: "Image", required: true },
    { name: "PrimaryCta", type: "General Link", required: true },
    { name: "SecondaryCta", type: "General Link", required: false },
  ],
};

const validFields = {
  Heading: "Summer sale",
  Body: "<p>Up to 40% off.</p>",
  Image: "summer.jpg",
  PrimaryCta: "/summer",
};

describe("checkPlan", () => {
  it("accepts a valid plan", () => {
    const issues = checkPlan(
      [{ component: "PromoSplit", placeholder: "main", fields: validFields, params: { variant: "stacked" } }],
      [promoSplit]
    );
    expect(issues).toEqual([]);
  });

  it("rejects an empty plan", () => {
    expect(checkPlan([], [promoSplit])[0].message).toBe("Plan is empty.");
  });

  it("suggests close names for an unknown component", () => {
    const [issue] = checkPlan(
      [{ component: "Promo", placeholder: "main", fields: {} }],
      [promoSplit]
    );
    expect(issue.severity).toBe("error");
    expect(issue.fix).toContain("PromoSplit");
  });

  it("flags undeployed components, bad placeholders, missing and invented fields, and bad params", () => {
    const issues = checkPlan(
      [
        {
          component: "PromoSplit",
          placeholder: "header",
          fields: { Title: "x", Body: "y", Image: "z", PrimaryCta: "/" },
          params: { variant: "full-bleed" },
        },
      ],
      [{ ...promoSplit, deployed: false }]
    );
    const messages = issues.map((i) => i.message).join("\n");
    expect(messages).toContain("not deployed");
    expect(messages).toContain('Not allowed in placeholder "header"');
    expect(messages).toContain('Missing required field "Heading"');
    expect(messages).toContain('Field "Title" does not exist on PromoSplit');
    expect(messages).toContain('Param "variant" = "full-bleed" is invalid');
    expect(issues.every((i) => i.severity === "error")).toBe(true);

    const missing = issues.find((i) => i.message.includes('"Heading"'));
    expect(missing?.fix).toBe("Keep it tight.");
  });

  it("warns, but does not error, on length and repetition", () => {
    const item = {
      component: "PromoSplit",
      placeholder: "main",
      fields: { ...validFields, Heading: "x".repeat(61) },
    };
    const issues = checkPlan([item, item, item, item], [promoSplit]);
    expect(issues.some((i) => i.severity === "error")).toBe(false);
    expect(issues.some((i) => i.message.includes("Used 4 times"))).toBe(true);
    expect(issues.some((i) => i.message.includes("61 chars"))).toBe(true);
    expect(formatIssues(issues)).toMatch(/^Warnings only/);
  });
});

describe("groupDuplicates", () => {
  const rename = (name: string, extra: Partial<ResolvedContract> = {}) => ({
    ...promoSplit,
    name,
    ...extra,
  });

  it("groups identical field signatures regardless of name", () => {
    const groups = groupDuplicates([promoSplit, rename("PromoBanner"), rename("CampaignPromo")]);
    expect(groups[0].kind).toBe("identical");
    expect(groups[0].components.map((c) => c.name)).toEqual([
      "PromoSplit",
      "PromoBanner",
      "CampaignPromo",
    ]);
  });

  it("finds near-identical and subset pairs", () => {
    // Swaps Image for VideoUrl: 5 of 7 distinct fields shared.
    const video = rename("PromoVideo", {
      fields: [
        ...promoSplit.fields.filter((f) => f.name !== "Image"),
        { name: "VideoUrl", type: "Single-Line Text", required: true },
      ],
    });
    const near = groupDuplicates([promoSplit, video], 0.7).find(
      (g) => g.kind === "near-identical"
    );
    expect(near?.differingFields).toEqual(["image", "videourl"]);
    expect(near?.similarity).toBe(0.71);

    // Adding one optional field makes the smaller component a strict subset.
    const withExtra = rename("PromoExtra", {
      fields: [...promoSplit.fields, { name: "Badge", type: "Single-Line Text", required: false }],
    });
    const subset = groupDuplicates([promoSplit, withExtra], 0.7);
    expect(subset[0].kind).toBe("subset");
    expect(subset[0].differingFields).toEqual(["badge"]);
  });

  it("returns nothing for unrelated components", () => {
    const other = rename("Accordion", {
      fields: [{ name: "Items", type: "Multilist", required: true }],
    });
    expect(groupDuplicates([promoSplit, other])).toEqual([]);
  });

  it("uses an order-independent signature", () => {
    const reversed: ComponentContract = { ...promoSplit, fields: [...promoSplit.fields].reverse() };
    expect(fieldSignature(reversed)).toBe(fieldSignature(promoSplit));
  });
});

describe("generate-manifest", () => {
  it("extracts contracts from JSS components", () => {
    const work = mkdtempSync(path.join(tmpdir(), "manifest-"));
    cpSync(path.join(root, "test/fixtures"), path.join(work, "app"), { recursive: true });

    const output = execFileSync(
      path.join(root, "node_modules/.bin/tsx"),
      [path.join(root, "scripts/generate-manifest.ts")],
      {
        cwd: work,
        env: { ...process.env, JSS_COMPONENTS_PATH: path.join(work, "app/src/components") },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    expect(output).toContain("Extracted 3 component contracts");

    const manifest = JSON.parse(
      readFileSync(path.join(work, "generated/manifest.json"), "utf8")
    ) as ComponentContract[];
    expect(manifest.map((c) => c.name)).toEqual(["PromoBanner", "PromoSplit", "TextBlock"]);

    const promo = manifest.find((c) => c.name === "PromoSplit")!;
    expect(promo.allowedPlaceholders).toEqual(["main", "promo-zone"]);
    expect(promo.maxPerPage).toBe(3);
    expect(promo.params).toEqual({ variant: ["image-left", "image-right", "stacked"] });
    expect(promo.fields.find((f) => f.name === "Heading")).toMatchObject({
      type: "Single-Line Text",
      required: true,
      maxLength: 60,
      guidance: "Two-line clamp on mobile — keep it tight.",
    });
    expect(promo.fields.find((f) => f.name === "Body")?.type).toBe("Rich Text");
    expect(promo.fields.find((f) => f.name === "SecondaryCta")?.required).toBe(false);

    // No @placeholder tag falls back to "main"; unmapped types fall back to text.
    const text = manifest.find((c) => c.name === "TextBlock")!;
    expect(text.allowedPlaceholders).toEqual(["main"]);
    expect(text.fields.find((f) => f.name === "Theme")?.type).toBe("Single-Line Text");

    // PromoBanner and PromoSplit are the same component under two names.
    const resolved = manifest.map((c) => ({ ...c, deployed: true }));
    expect(groupDuplicates(resolved)[0]).toMatchObject({ kind: "identical" });
  }, 60_000);
});
