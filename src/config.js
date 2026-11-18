import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const VERSION = '1.0.0';
export const LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  writeBytes: 2 * 1024 * 1024,
  searchFileBytes: 512 * 1024,
  searchTotalBytes: 18 * 1024 * 1024,
  outputBytes: 96 * 1024,
  maxEntries: 2000,
  maxSearchMatches: 150,
  maxSnapshots: 100,
  maxArgs: 40,
});

export function createConfig(env = process.env) {
  const rawRoot = path.resolve(env.MCP_PROJECT_ROOT || process.cwd());
  if (!fs.existsSync(rawRoot) || !fs.statSync(rawRoot).isDirectory()) {
    throw new Error(`MCP_PROJECT_ROOT must point to an existing directory: ${rawRoot}`);
  }
  const root = fs.realpathSync(rawRoot);
  const dataDir = path.resolve(env.MCP_DATA_DIR || path.join(os.homedir(), '.claude-free-code-mcp'));
  const workspaceId = crypto.createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 20);
  const workspaceStateDir = path.join(dataDir, 'workspaces', workspaceId);
  const panelPort = Number(env.MCP_DASHBOARD_PORT ?? 8765);
  if (!Number.isInteger(panelPort) || panelPort < 0 || panelPort > 65535) throw new Error('Invalid MCP_DASHBOARD_PORT');
  return { root, dataDir, workspaceId, workspaceStateDir, panelPort };
}

export function publicRoot(root) {
  return root;
}
