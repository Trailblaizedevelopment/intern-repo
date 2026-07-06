import { linearConnector } from './connectors/linear';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './connectors/types';

export type { ConnectorContext } from './connectors/types';

/** Linear is the sole ticket/work-item source for Brain. */
const CONNECTORS: BrainConnector[] = [linearConnector];

/** Tool name → connector id (built on first listTools call per run). */
const toolRouting = new Map<string, string>();

function parseConnectorFromToolName(toolName: string): { connectorId: string; toolName: string } | null {
  const routed = toolRouting.get(toolName);
  if (routed) return { connectorId: routed, toolName };

  for (const c of CONNECTORS) {
    if (toolName.startsWith(`${c.id}_`)) {
      return { connectorId: c.id, toolName };
    }
  }
  return null;
}

export function getConnectors(): BrainConnector[] {
  return CONNECTORS;
}

export interface ConnectorStatus {
  id: string;
  label: string;
  kind: string;
  available: boolean;
  toolCount: number;
}

/** Status summary for Dev Console / debug endpoint. */
export async function getConnectorStatus(ctx: ConnectorContext): Promise<ConnectorStatus[]> {
  const statuses: ConnectorStatus[] = [];
  for (const c of CONNECTORS) {
    const tools = c.isAvailable() ? await c.listTools(ctx) : [];
    statuses.push({
      id: c.id,
      label: c.label,
      kind: c.kind,
      available: c.isAvailable(),
      toolCount: tools.length,
    });
  }
  return statuses;
}

/**
 * Aggregate tools from all available connectors for the Anthropic tool list.
 * Rebuilds routing map each call (per agent run).
 */
export async function listAllTools(ctx: ConnectorContext): Promise<ConnectorTool[]> {
  toolRouting.clear();
  const all: ConnectorTool[] = [];

  for (const connector of CONNECTORS) {
    if (!connector.isAvailable()) continue;
    try {
      const tools = await connector.listTools(ctx);
      for (const t of tools) {
        toolRouting.set(t.name, connector.id);
        all.push(t);
      }
    } catch (err) {
      console.error(`[brain/router] listTools failed for ${connector.id}:`, err);
    }
  }

  return all;
}

export async function callConnectorTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ConnectorContext
): Promise<ConnectorCallResult & { connectorId?: string }> {
  const route = parseConnectorFromToolName(toolName);
  if (!route) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  const connector = CONNECTORS.find(c => c.id === route.connectorId);
  if (!connector) {
    return { ok: false, error: `Connector not found: ${route.connectorId}` };
  }

  const result = await connector.callTool(route.toolName, input, ctx);
  return { ...result, connectorId: connector.id };
}

/** Anthropic Messages API `tools` array. */
export async function getAnthropicTools(ctx: ConnectorContext) {
  const tools = await listAllTools(ctx);
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
