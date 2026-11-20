import rawManifest from "@/generated/manifest.json";
import { agentApi, ENDPOINTS } from "./sitecore/agent-api";
import type { ComponentContract } from "./contract";

type SitecoreRendering = {
  id: string;
  name: string;
  datasourceTemplateId?: string;
};

export type ResolvedContract = ComponentContract & {
  /** Present in source AND deployed to this environment. */
  deployed: boolean;
};

let cache: { data: ResolvedContract[]; at: number } | null = null;
const TTL_MS = 5 * 60_000;

export async function getContracts(): Promise<ResolvedContract[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const { components } = await agentApi<{ components: SitecoreRendering[] }>(
    ENDPOINTS.listComponents
  );
  const byName = new Map(components.map((c) => [c.name, c]));

  const data = (rawManifest as ComponentContract[]).map((contract) => {
    const rendering = byName.get(contract.name);
    return {
      ...contract,
      renderingId: rendering?.id,
      datasourceTemplate: rendering?.datasourceTemplateId,
      deployed: Boolean(rendering),
      description: rendering
        ? contract.description
        : `${contract.description} [NOT DEPLOYED to this environment — do not use]`,
    };
  });

  cache = { data, at: Date.now() };
  return data;
}

/** Renderings Sitecore has that your repo has never heard of. */
export async function getOrphanedRenderings(): Promise<string[]> {
  const { components } = await agentApi<{ components: SitecoreRendering[] }>(
    ENDPOINTS.listComponents
  );
  const known = new Set((rawManifest as ComponentContract[]).map((c) => c.name));
  return components.map((c) => c.name).filter((n) => !known.has(n));
}
