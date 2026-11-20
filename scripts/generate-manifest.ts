import { Node, Project, SyntaxKind, JSDoc, SourceFile } from "ts-morph";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ComponentContract, SitecoreFieldType } from "../lib/contract";

/** JSS field type → Sitecore field type. Extend as your library grows. */
const TYPE_MAP: Record<string, SitecoreFieldType> = {
  "Field<string>": "Single-Line Text",
  "Field<boolean>": "Checkbox",
  "Field<number>": "Number",
  "Field<Date>": "Date",
  TextField: "Single-Line Text",
  RichTextField: "Rich Text",
  RichText: "Rich Text",
  ImageField: "Image",
  LinkField: "General Link",
  DateField: "Date",
  NumberField: "Number",
  CheckboxField: "Checkbox",
};

/** Read a single @tag value as a number, e.g. `@maxLength 60`. */
function numberTag(doc: JSDoc | undefined, tag: string): number | undefined {
  const raw = doc
    ?.getTags()
    .find((t) => t.getTagName() === tag)
    ?.getCommentText()
    ?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Read every occurrence of a repeatable @tag, e.g. `@placeholder main`. */
function tagValues(doc: JSDoc | undefined, tag: string): string[] {
  return (doc?.getTags() ?? [])
    .filter((t) => t.getTagName() === tag)
    .map((t) => t.getCommentText()?.trim())
    .filter((v): v is string => Boolean(v));
}

/**
 * Parse `@param variant a | b | c` into { variant: ["a","b","c"] }.
 *
 * TypeScript parses @param as a JSDocParameterTag: the parameter name
 * ("variant") is held separately and getCommentText() returns only
 * "a | b | c", so the name has to be read from the tag itself.
 */
function paramTags(doc: JSDoc | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const tag of doc?.getTags() ?? []) {
    if (tag.getTagName() !== "param") continue;
    const comment = tag.getCommentText()?.trim() ?? "";
    let name: string | undefined;
    let rest = comment;
    if (Node.isJSDocParameterTag(tag)) {
      name = tag.getName();
    } else {
      name = comment.split(/\s+/)[0];
      rest = comment.slice(name.length).trim();
    }
    const values = rest.split("|").map((v) => v.trim()).filter(Boolean);
    if (name && values.length) out[name] = values;
  }
  return out;
}

/** Strip @tags from a JSDoc comment so descriptions stay clean. */
function describe(doc: JSDoc | undefined, fallback: string): string {
  const text = doc?.getCommentText()?.replace(/\s+/g, " ").trim();
  return text && text.length > 0 ? text : fallback;
}

function extract(file: SourceFile): ComponentContract | null {
  const componentName = path.basename(file.getFilePath(), ".tsx");

  const fieldsType =
    file.getTypeAlias(`${componentName}Fields`) ??
    file.getInterface(`${componentName}Fields`);
  if (!fieldsType) return null;

  const typeDoc = fieldsType.getJsDocs()[0];

  const fields = fieldsType
    .getDescendantsOfKind(SyntaxKind.PropertySignature)
    .map((prop) => {
      const raw = prop.getTypeNode()?.getText().replace(/\s/g, "") ?? "";
      const doc = prop.getJsDocs()[0];
      const mapped = TYPE_MAP[raw];

      if (!mapped) {
        console.warn(
          `  ! ${componentName}.${prop.getName()}: unmapped type "${raw}" ` +
            `— defaulting to Single-Line Text`
        );
      }

      return {
        name: prop.getName(),
        type: mapped ?? ("Single-Line Text" as SitecoreFieldType),
        required: !prop.hasQuestionToken(),
        maxLength: numberTag(doc, "maxLength"),
        guidance: describe(doc, "") || undefined,
      };
    });

  const placeholders = tagValues(typeDoc, "placeholder");
  if (placeholders.length === 0) {
    console.warn(`  ! ${componentName}: no @placeholder tag — defaulting to "main"`);
  }

  return {
    name: componentName,
    description: describe(typeDoc, `${componentName} component`),
    allowedPlaceholders: placeholders.length ? placeholders : ["main"],
    maxPerPage: numberTag(typeDoc, "maxPerPage"),
    params: Object.keys(paramTags(typeDoc)).length ? paramTags(typeDoc) : undefined,
    fields,
    sourcePath: path.relative(process.cwd(), file.getFilePath()),
  };
}

function main() {
  const componentsPath = process.env.JSS_COMPONENTS_PATH;
  if (!componentsPath) throw new Error("JSS_COMPONENTS_PATH is not set");

  const project = new Project({
    tsConfigFilePath: path.join(componentsPath, "../../tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(`${componentsPath}/**/*.tsx`);

  const contracts = project
    .getSourceFiles()
    .map(extract)
    .filter((c): c is ComponentContract => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  mkdirSync(path.join(process.cwd(), "generated"), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), "generated/manifest.json"),
    JSON.stringify(contracts, null, 2) + "\n"
  );

  console.log(`✓ Extracted ${contracts.length} component contracts`);
}

main();
