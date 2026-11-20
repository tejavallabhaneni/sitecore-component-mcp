import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getContracts, getOrphanedRenderings } from "@/lib/manifest";
import { findDuplicates } from "@/lib/duplicates";
import { validatePlan, formatIssues, PlannedComponentSchema } from "@/lib/validate";
import { buildPage } from "@/lib/build";
import { agentApi, ENDPOINTS } from "@/lib/sitecore/agent-api";

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  ...(isError ? { isError: true } : {}),
});

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_components",
      {
        title: "List available components",
        description:
          "Returns every component in this project's library with a " +
          "one-line description and its allowed placeholders. ALWAYS call " +
          "this before planning a page. Never invent a component name.",
        inputSchema: z.object({
          placeholder: z
            .string()
            .optional()
            .describe("Filter to components legal in this placeholder"),
        }),
      },
      async ({ placeholder }) => {
        const all = await getContracts();
        const list = placeholder
          ? all.filter((c) => c.allowedPlaceholders.includes(placeholder))
          : all;

        if (list.length === 0) {
          return text(`No components are allowed in "${placeholder}".`, true);
        }

        return text(
          list
            .filter((c) => c.deployed)
            .map(
              (c) =>
                `${c.name} — ${c.description} ` +
                `[placeholders: ${c.allowedPlaceholders.join(", ")}]`
            )
            .join("\n")
        );
      }
    );

    server.registerTool(
      "get_component_contract",
      {
        title: "Get a component's full field contract",
        description:
          "Returns exact field names, Sitecore field types, which fields " +
          "are required, length guidance, and allowed parameter values. " +
          "Call this for every component you intend to use, before " +
          "writing any content.",
        inputSchema: z.object({ name: z.string() }),
      },
      async ({ name }) => {
        const all = await getContracts();
        const found = all.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        if (!found) {
          return text(
            `No component named "${name}". Available: ` +
              all.map((c) => c.name).join(", "),
            true
          );
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(found, null, 2) }],
          structuredContent: found,
        };
      }
    );

    server.registerTool(
      "find_duplicate_components",
      {
        title: "Audit the library for duplicate components",
        description:
          "Groups components by field signature to surface identical, " +
          "near-identical, and subset duplicates. Use when asked to audit " +
          "the component library, before adding a new component, or when " +
          "unsure which of several similar components to use.",
        inputSchema: z.object({
          threshold: z.number().min(0).max(1).default(0.7),
        }),
      },
      async ({ threshold }) => {
        const groups = await findDuplicates(threshold);
        if (groups.length === 0) {
          return text(`No duplicates above ${threshold} similarity.`);
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }],
          structuredContent: { groups },
        };
      }
    );

    server.registerTool(
      "find_orphaned_renderings",
      {
        title: "Renderings in Sitecore with no source component",
        description:
          "Lists renderings deployed to the environment that have no " +
          "matching component file in the repo. Cleanup candidates.",
        inputSchema: z.object({}),
      },
      async () => {
        const orphans = await getOrphanedRenderings();
        return text(
          orphans.length
            ? `${orphans.length} orphaned:\n${orphans.join("\n")}`
            : "No orphaned renderings."
        );
      }
    );

    server.registerTool(
      "validate_page_plan",
      {
        title: "Validate a page plan before building",
        description:
          "MANDATORY before build_page. Checks that components exist, are " +
          "deployed, sit in legal placeholders, have all required fields, " +
          "use only real field names, and respect length and parameter " +
          "constraints. Returns structured issues with fixes. Fix every " +
          "error and call this again before building.",
        inputSchema: z.object({ plan: z.array(PlannedComponentSchema) }),
      },
      async ({ plan }) => {
        const issues = await validatePlan(plan);
        if (issues.length === 0) {
          return text("Plan is valid. Proceed to build_page.");
        }
        const hasErrors = issues.some((i) => i.severity === "error");
        return text(formatIssues(issues), hasErrors);
      }
    );

    server.registerTool(
      "build_page",
      {
        title: "Create a page from a validated plan",
        description:
          "Creates the page and adds every component. Only call after " +
          "validate_page_plan returns no errors. Returns job IDs — keep " +
          "them; revert_job undoes any operation.",
        inputSchema: z.object({
          name: z.string(),
          parentPath: z.string(),
          plan: z.array(PlannedComponentSchema),
        }),
      },
      async (input) => {
        const r = await buildPage(input);
        return text(
          `Created ${r.path}\n\n` +
            `Job IDs — revert newest first:\n` +
            r.jobIds.slice().reverse().map((id) => `  ${id}`).join("\n")
        );
      }
    );

    server.registerTool(
      "revert_job",
      {
        title: "Undo an Agent API operation",
        description:
          "Reverts a previously executed job by ID. When undoing a page " +
          "build, revert in reverse order — components before the page.",
        inputSchema: z.object({ jobId: z.string() }),
      },
      async ({ jobId }) => {
        await agentApi(ENDPOINTS.revertJob(jobId), { method: "POST" });
        return text(`Reverted job ${jobId}.`);
      }
    );
  },
  {
    serverInfo: { name: "sitecore-component-mcp", version: "0.1.0" },
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);

// Cold start + OAuth + component fetch can take several seconds.
export const maxDuration = 60;

export { handler as GET, handler as POST, handler as DELETE };
