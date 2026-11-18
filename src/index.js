import { createConfig } from './config.js';
import { Store } from './storage.js';
import { Approvals } from './approvals.js';
import { startDashboard } from './dashboard.js';
import { createTools } from './tools.js';
import { runMcpStdio } from './mcp.js';

try {
  const config=createConfig({...process.env,MCP_PROJECT_ROOT:process.env.MCP_PROJECT_ROOT||process.argv[2]});
  const store=new Store(config);await store.init();
  const approvals=new Approvals(store);
  try {await startDashboard(config,store,approvals);}
  catch(error){console.error(`[MCP] Dashboard failed: ${error.message}. Commands requiring approval will not run.`);}
  const tools=createTools({config,store,approvals});
  console.error(`[MCP] Claude Free Code ${tools.length} tools ready; workspace ${config.root}`);
  runMcpStdio(tools);
} catch(error){console.error(`[MCP] Startup error: ${error.stack||error.message}`);process.exitCode=1;}
