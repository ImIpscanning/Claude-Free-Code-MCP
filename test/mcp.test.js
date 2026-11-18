import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Test the real newline-delimited MCP stdio protocol, not merely internal functions.
test('MCP initialize, tools/list and tools/call work end-to-end',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cfcm-stdio-'));
  const child=spawn(process.execPath,['src/index.js'],{cwd:path.resolve('.'),env:{...process.env,MCP_PROJECT_ROOT:dir,MCP_DATA_DIR:path.join(dir,'state'),MCP_DASHBOARD_PORT:'0'},stdio:['pipe','pipe','pipe']});
  t.after(async()=>{child.kill();await fs.rm(dir,{recursive:true,force:true})});
  let buffered='';const queue=[];const waiters=[];
  child.stdout.on('data',chunk=>{
    buffered+=chunk.toString('utf8');
    let idx;
    while((idx=buffered.indexOf('\n'))>=0){const line=buffered.slice(0,idx);buffered=buffered.slice(idx+1);const msg=JSON.parse(line);const pending=waiters.shift();if(pending)pending(msg);else queue.push(msg);}
  });
  const get=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{waiters.push(resolve);setTimeout(()=>reject(new Error('MCP did not respond')),4000).unref()});
  const send=(id,method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  send(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1.0.0'}});
  const initialized=await get();assert.equal(initialized.id,1);assert.equal(initialized.result.serverInfo.name,'claude-free-code-mcp');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  send(2,'tools/list',{});const tools=await get();assert.ok(tools.result.tools.length>=25);
  send(3,'tools/call',{name:'write_file',arguments:{file:'hello.txt',content:'Hi from MCP'}});const written=await get();assert.equal(JSON.parse(written.result.content[0].text).written,'hello.txt');
  send(4,'tools/call',{name:'read_file',arguments:{file:'hello.txt'}});const read=await get();assert.match(JSON.parse(read.result.content[0].text).content,/Hi from MCP/);
  send(5,'tools/call',{name:'read_file',arguments:{file:'../../outside'}});const rejected=await get();assert.equal(rejected.result.isError,true);
});

test('MCPB manifest points to the Node entrypoint and a configurable workspace',async()=>{
  const manifest=JSON.parse(await fs.readFile('manifest.json','utf8'));
  assert.equal(manifest.manifest_version,'0.3');
  assert.equal(manifest.server.type,'node');
  assert.equal(manifest.server.entry_point,'src/index.js');
  assert.match(manifest.server.mcp_config.args.at(-1),/user_config.project_root/);
  assert.equal(manifest.user_config.project_root.type,'directory');
  const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
  assert.equal(pkg.type,'module');
});
