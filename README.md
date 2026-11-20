# sitecore-component-mcp

A component-aware MCP server for SitecoreAI. It gives AI agents (Cursor, Claude Code, any MCP client) the real contracts of your JSS components, finds duplicate components in your library, and validates a page plan before anything is written through the SitecoreAI Agent API.

This is the companion code for the article **[Your Agent Doesn't Know Your Components](https://sitecore-component-mcp.vercel.app)**, which explains every file step by step.

## The problem

Marketer MCP and the Agent API know Sitecore primitives: renderings, placeholders, field types. They don't know the layer you own: which fields are required, how long a heading can be, which placeholders a component is allowed in, or that `PromoSplit` and `PromoBanner` are the same component under two names. An agent without that knowledge picks components by name match and invents field names.

## What it does

| Tool | Purpose |
| --- | --- |
| `list_components` | One line per deployed component, with allowed placeholders |
| `get_component_contract` | Exact fields, types, required flags, length guidance, allowed params |
| `find_duplicate_components` | Groups identical, near-identical and subset components by field signature |
| `find_orphaned_renderings` | Renderings in Sitecore with no matching component in source |
| `validate_page_plan` | Checks a plan and returns each issue with a `fix` the agent can act on |
| `build_page` | Creates the page and components after validating again on the server |
| `revert_job` | Undoes an Agent API operation by job ID |

Contracts come from your JSS source at build time. `scripts/generate-manifest.ts` uses ts-morph to read each `<ComponentName>Fields` type and its JSDoc tags:

```tsx
/**
 * Two-column promotional block.
 * @placeholder main
 * @placeholder promo-zone
 * @maxPerPage 3
 * @param variant image-left | image-right | stacked
 */
export type PromoSplitFields = {
  /** Two-line clamp on mobile — keep it tight. @maxLength 60 */
  Heading: Field<string>;
  Body: RichTextField;
  /** Omit unless there's a genuine secondary action. */
  SecondaryCta?: LinkField;
};
```

At runtime the manifest is reconciled with the renderings the Agent API reports, so the agent only sees components that are actually deployed to the environment.

## Getting started

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local   # fill in your values
export JSS_COMPONENTS_PATH=./example/src/components   # or your JSS app's components folder
npm run dev
```

`npm run manifest` regenerates `generated/manifest.json`. `npm run manifest:check` fails if the committed manifest is out of date, which is useful in CI.

### Environment variables

| Variable | Description |
| --- | --- |
| `SITECORE_CLIENT_ID` / `SITECORE_CLIENT_SECRET` | Environment automation client (SitecoreAI Deploy → Credentials) |
| `SITECORE_ENV_HOST` | Authoring environment host name |
| `JSS_COMPONENTS_PATH` | Path to your JSS components folder |
| `MCP_SHARED_SECRET` | Bearer token required on `/api/mcp` |
| `ALLOW_PRODUCTION_WRITES` | `build_page` refuses hosts without dev/qa/uat/staging in the name unless this is `true` |

### Connect a client

Cursor (`.cursor/mcp.json` is included):

```json
{ "mcpServers": { "sitecore-components": { "url": "http://localhost:3000/api/mcp" } } }
```

Claude Code:

```bash
claude mcp add --transport http sitecore-components http://localhost:3000/api/mcp \
  --header "Authorization: Bearer $MCP_SHARED_SECRET"
```

## Before you point it at a real environment

- **Check the Agent API paths.** Every endpoint is in `lib/sitecore/agent-api.ts`. Verify them, and the request bodies in `lib/build.ts`, against the [Agent API OpenAPI definition](https://api-docs.sitecore.com/sai/agent-api) for your environment.
- **Start on a non-production environment.** Keep `ALLOW_PRODUCTION_WRITES=false`.
- **The shared secret is a minimum.** For anything outside your team, use OAuth 2.1 as the MCP spec requires (`withMcpAuth` in mcp-handler).

## Tests

```bash
npm test          # validation, duplicate detection and manifest extraction
npm run typecheck
```

## Differences from the article

- Uses mcp-handler 2.x: the route lives at `app/api/mcp/route.ts` and `maxDuration` is a route segment export, because 2.x leaves routing to Next.js.
- Fixes `@param` parsing in the extractor. TypeScript keeps a `@param` tag's name separate from its comment, so the article's version recorded `image-left` as the parameter name instead of `variant`.
- Validation and duplicate grouping are split into pure functions (`checkPlan`, `groupDuplicates`) so they can be tested without the Agent API.

## License

MIT © Teja Vallabhaneni
