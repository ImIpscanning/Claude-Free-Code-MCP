import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createConfig } from '../src/config.js';
import { resolvePath } from '../src/paths.js';
import { Store } from '../src/storage.js';
import { Approvals } from '../src/approvals.js';
import { createTools } from '../src/tools.js';

async function setup(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cfcm-test-'));
  const root=path.join(dir,'project');await fs.mkdir(root);
  const config=createConfig({MCP_PROJECT_ROOT:root,MCP_DATA_DIR:path.join(dir,'state'),MCP_DASHBOARD_PORT:'0'});
  const store=new Store(config);await store.init();
  const approvals=new Approvals(store);const tools=createTools({config,store,approvals});
  const call=async(name,args={})=>{
    const tool=tools.find(x=>x.name===name);assert.ok(tool,`Tool ${name} exists`);
    const response=await tool.handler(args);
    return JSON.parse(response.content[0].text);
  };
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return {dir,root,config,store,approvals,tools,call};
}
async function pending(approvals){
  for(let i=0;i<100;i++){const p=approvals.list()[0];if(p)return p;await new Promise(r=>setTimeout(r,10));}
  throw Error('Approval not enqueued');
}

test('tools are available with schemas and MCP hints',async t=>{
  const {tools,call}=await setup(t);
  assert.ok(tools.length>=25);
  assert.equal(new Set(tools.map(x=>x.name)).size,tools.length);
  for(const tool of tools){assert.equal(tool.inputSchema.type,'object');assert.ok(tool.description);assert.equal(typeof tool.annotations.readOnlyHint,'boolean');}
  const info=await call('workspace_info');assert.ok(info.workspace);
});

test('path guards: traversal, absolute, symlinks and .git writes blocked',async t=>{
  const {root}=await setup(t);
  await assert.rejects(resolvePath(root,'../../escape',{writing:true}),/outside/);
  await assert.rejects(resolvePath(root,'/etc/passwd'),/Absolute/);
  await assert.rejects(resolvePath(root,'C:\\Users\\not-ours'),/Absolute/);
  await assert.rejects(resolvePath(root,'.git/config',{writing:true}),/blocked/);
  await fs.mkdir(path.join(root,'sub'));
  await fs.symlink(os.tmpdir(),path.join(root,'sub','link'));
  await assert.rejects(resolvePath(root,'sub/link/strange.txt'),/Symlink/);
});

test('create, find, read, preview, edit and undo a file',async t=>{
  const {root,store,approvals,call}=await setup(t);
  const created=await call('write_file',{file:'src/greet.js',content:'alpha\nbeta\n'});
  assert.equal(created.written,'src/greet.js');
  await assert.rejects(call('write_file',{file:'src/greet.js',content:'oops'}),/File exists/);
  const read=await call('read_file',{file:'src/greet.js'});
  assert.match(read.content,/1: alpha/);
  const files=await call('glob_files',{glob:'**/*.js'});
  assert.deepEqual(files.matches,['src/greet.js']);
  const search=await call('search_code',{query:'beTA'});
  assert.equal(search.matches[0].line,2);
  const preview=await call('preview_replace',{file:'src/greet.js',search:'beta',replacement:'gamma'});
  assert.equal(preview.sha256,read.sha256);
  const edited=await call('replace_exact',{file:'src/greet.js',search:'beta',replacement:'gamma',expectedSha256:read.sha256});
  assert.equal(await fs.readFile(path.join(root,'src/greet.js'),'utf8'),'alpha\ngamma\n');
  await assert.rejects(call('replace_exact',{file:'src/greet.js',search:'alpha',replacement:'x',expectedSha256:read.sha256}),/changed/);
  const restoration=call('restore_snapshot',{snapshotId:edited.snapshotId});
  const p=await pending(approvals);assert.equal(p.op,'restore_snapshot');await approvals.decide(p.id,'approve');
  const restored=await restoration;assert.ok(restored.undoSnapshotId);
  assert.equal(await fs.readFile(path.join(root,'src/greet.js'),'utf8'),'alpha\nbeta\n');
  const snaps=await store.snapshots('src/greet.js');assert.ok(snaps.length>=3);
});

test('non-overlapping multi-line edits update expected content',async t=>{
  const {root,call}=await setup(t);
  await call('write_file',{file:'readme.txt',content:'one\ntwo\nthree\nfour'});
  const edited=await call('edit_lines',{file:'readme.txt',edits:[
    {startLine:2,endLine:2,replacement:'2A\n2B'},
    {startLine:4,endLine:4,replacement:'FOUR'}
  ]});
  assert.equal(edited.newLineCount,5);
  assert.equal(await fs.readFile(path.join(root,'readme.txt'),'utf8'),'one\n2A\n2B\nthree\nFOUR');
  await assert.rejects(call('edit_lines',{file:'readme.txt',edits:[{startLine:1,endLine:2,replacement:'x'},{startLine:2,endLine:4,replacement:'y'}]}),/overlapping/);
});

test('commands require an independent local approval and remember exact signature',async t=>{
  const {approvals,call,store}=await setup(t);
  let finished=false;
  const run=call('run_command',{command:'node',args:['-e','process.stdout.write("approved")'],reason:'Verify execution permissions'}).then(x=>{finished=true;return x});
  const p=await pending(approvals);
  assert.equal(p.op,'run_command');assert.equal(finished,false);
  await approvals.decide(p.id,'always');
  const res=await run;
  assert.equal(res.exitCode,0);assert.equal(res.stdout,'approved');
  assert.equal((await store.json('trusted.json',[])).length,1);
  const again=await call('run_command',{command:'node',args:['-e','process.stdout.write("approved")'],reason:'Verify execution permissions'});
  assert.equal(again.stdout,'approved');
  const denied=call('run_command',{command:'node',args:['-e','process.stdout.write("different")'],reason:'Verify different command approval'});
  const p2=await pending(approvals);await approvals.decide(p2.id,'deny');
  await assert.rejects(denied,/NOT executed/);
  assert.equal(approvals.list().length,0);
});

test('checkpoints, plans and notes persist in workspace state',async t=>{
  const {call,store}=await setup(t);
  const p=await call('plan_create',{goal:'Compile a Java project',steps:['Inspect sources','Run tests','Fix failures']});
  assert.equal(p.steps.length,3);
  const updated=await call('plan_update',{step:1,status:'done',note:'Done'});
  assert.equal(updated.steps[0].status,'done');
  await call('project_notes_write',{text:'Java 21 and Paper 1.21.4'});
  await call('checkpoint_save',{title:'Before usage limit',summary:'Inspected files',nextSteps:['Run tests']});
  const context=await call('resume_context');
  assert.equal(context.plan.steps[0].status,'done');
  assert.match(context.notes,/Java 21/);
  assert.equal(context.checkpoint.title,'Before usage limit');
  assert.ok((await store.recentAudit(10)).length>0);
});

test('file deletion rejects nonempty directories and requires approval',async t=>{
  const {root,call,approvals}=await setup(t);
  await call('write_file',{file:'folder/a.txt',content:'safe'});
  await assert.rejects(call('delete_path',{file:'folder'}),/non-empty/);
  const attempted=call('delete_path',{file:'folder/a.txt'});
  const p=await pending(approvals);assert.equal(p.op,'delete_path');
  await approvals.decide(p.id,'approve');
  const deleted=await attempted;assert.equal(deleted.restorable,true);
  await assert.rejects(fs.readFile(path.join(root,'folder/a.txt')),/ENOENT/);
});
