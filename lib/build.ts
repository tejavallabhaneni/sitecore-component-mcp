import { agentApi, ENDPOINTS } from "./sitecore/agent-api";
import { validatePlan, type PlannedComponent } from "./validate";

export type BuildResult = {
  pageId: string;
  path: string;
  jobIds: string[];
};

export async function buildPage(input: {
  name: string;
  parentPath: string;
  plan: PlannedComponent[];
}): Promise<BuildResult> {
  if (process.env.ALLOW_PRODUCTION_WRITES !== "true") {
    const host = process.env.SITECORE_ENV_HOST ?? "";
    if (!/dev|qa|uat|staging/i.test(host)) {
      throw new Error(
        `Refusing to write to "${host}". Set ALLOW_PRODUCTION_WRITES=true ` +
          `if this is intentional.`
      );
    }
  }

  // Belt and braces — never trust that the agent called validate first
  const issues = await validatePlan(input.plan);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) {
    throw new Error(
      `Refusing to build — ${errors.length} validation error(s):\n` +
        errors.map((e) => `${e.component}: ${e.message}`).join("\n")
    );
  }

  const page = await agentApi<{ id: string; path: string; jobId: string }>(
    ENDPOINTS.createPage,
    {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        parentPath: input.parentPath,
      }),
    }
  );

  const jobIds = [page.jobId];

  for (const item of input.plan) {
    const res = await agentApi<{ jobId: string }>(
      ENDPOINTS.addComponent(page.id),
      {
        method: "POST",
        body: JSON.stringify({
          componentName: item.component,
          placeholder: item.placeholder,
          fields: item.fields,
          parameters: item.params,
        }),
      }
    );
    jobIds.push(res.jobId);
  }

  return { pageId: page.id, path: page.path, jobIds };
}
