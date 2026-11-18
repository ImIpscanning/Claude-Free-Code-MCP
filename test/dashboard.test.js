import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createConfig } from '../src/config.js';
import { Store,secretToken } from '../src/storage.js';
import { Approvals } from '../src/approvals.js';
import { startDashboard } from '../src/dashboard.js';

test('private panel: loopback listener, token check, origin check and approval decisions',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cfcm-panel-'));await fs.mkdir(path.join(dir,'project'));
  const config=createConfig({MCP_PROJECT_ROOT:path.join(dir,'project'),MCP_DATA_DIR:path.join(dir,'state'),MCP_DASHBOARD_PORT:'0'});
  const store=new Store(config);await store.init();const approvals=new Approvals(store);
  const {dashboard,port}=await startDashboard(config,store,approvals);
  t.after(async()=>{await new Promise(r=>dashboard.close(r));await fs.rm(dir,{recursive:true,force:true})});
  const token=await secretToken(config);const url=`http://127.0.0.1:${port}`;
  const noAuth=await fetch(url+'/api/state');assert.equal(noAuth.status,401);
  const headers={Authorization:'Bearer '+token};
  const state=await fetch(url+'/api/state',{headers});assert.equal(state.status,200);
  const result=await state.json();assert.equal(result.pending.length,0);
  const open=await fetch(url+`/?token=${token}`);assert.equal(open.status,200);assert.match(await open.text(),/Solicitudes pendientes/);
  const request=approvals.request('test',{command:'node'});
  let p; for(let i=0;i<100;i++){p=approvals.list()[0];if(p)break;await new Promise(r=>setTimeout(r,10));} assert.ok(p);
  const badOrigin=await fetch(url+'/api/decide',{method:'POST',headers:{...headers,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({id:p.id,decision:'approve'})});
  assert.equal(badOrigin.status,403);
  const approved=await fetch(url+'/api/decide',{method:'POST',headers:{...headers,origin:url,'content-type':'application/json'},body:JSON.stringify({id:p.id,decision:'approve'})});
  assert.equal(approved.status,200);assert.deepEqual(await request,{allowed:true,source:'approve'});
});
