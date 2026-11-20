import { getSitecoreToken } from "./auth";

const BASE = `https://${process.env.SITECORE_ENV_HOST}`;

/**
 * Agent API v2.0 changed paths in May 2026 and removed the
 * personalization v1.0 endpoints in August. Keep every path here so a
 * version bump is a one-file diff instead of a grep across the repo.
 *
 * Verify against the OpenAPI definition — don't trust this table:
 * https://api-docs.sitecore.com/sai/agent-api
 */
export const ENDPOINTS = {
  listComponents: "/agent/v2/components",
  getComponent: (id: string) => `/agent/v2/components/${id}`,
  createDatasource: "/agent/v2/components/datasources",
  listSites: "/agent/v2/sites",
  createPage: "/agent/v2/pages",
  getPage: (id: string) => `/agent/v2/pages/${id}`,
  addComponent: (pageId: string) => `/agent/v2/pages/${pageId}/components`,
  getJob: (jobId: string) => `/agent/v2/jobs/${jobId}`,
  revertJob: (jobId: string) => `/agent/v2/jobs/${jobId}/revert`,
} as const;

export class AgentApiError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    readonly body: string
  ) {
    super(`Agent API ${status} on ${endpoint}: ${body.slice(0, 400)}`);
    this.name = "AgentApiError";
  }
}

export async function agentApi<T>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getSitecoreToken();

  const res = await fetch(`${BASE}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new AgentApiError(res.status, endpoint, await res.text());
  }

  // 204 on some revert responses
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
