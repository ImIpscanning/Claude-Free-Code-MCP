import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { LIMITS, VERSION } from './config.js';
import { resolvePath, toRel, walk, readTextLimited } from './paths.js';
import { sha256 } from './storage.js';
import { runProcess, TASKS, ALLOWED_COMMANDS, isReadOnlyTask } from './process.js';

const str = (description, extra = {}) => ({type:'string',description,...extra});
const integer = (description,extra={})=>({type:'integer',description,...extra});
const bool = (description)=>({type:'boolean',description});
const array = (description,items,extra={})=>({type:'array',items,description,...extra});
const shape = (properties, required = []) => ({type:'object',properties,required,additionalProperties:false});
const result = value => ({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value,null,2)}]});
const limitText = (txt,n=20000)=>txt.length>n?txt.slice(0,n)+'\n... [truncated]':txt;
const assertString = (value,name,min=0,max=2000000)=>{
  if(typeof value!=='string'||value.length<min||value.length>max) throw new Error(`${name} must be a string of ${min}..${max} characters`);
  return value;
};
const assertInt = (value,name,min,max)=>{
  if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
};
const globToRegexp = pattern => {
  assertString(pattern,'glob',1,200);
  let s='^';
  for(let i=0;i<pattern.length;i++){
    const c=pattern[i];
    if(c==='*') {if(pattern[i+1]==='*') {i++;if(pattern[i+1]==='/'){i++;s+='(?:.*/)?';}else s+='.*';}else s+='[^/]*';}
    else if(c==='?') s+='[^/]';
    else s+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return new RegExp(s+'$','i');
};
const getFile = async(root,file,writing=false)=>resolvePath(root,assertString(file,'file',1,2048),{writing,allowRoot:false});
const safeRelative = async(root,file,writing=false)=>toRel(root,await getFile(root,file,writing));
const git = (cwd,args,timeoutSeconds=25)=>runProcess({command:'git',args,cwd,timeoutSeconds,outputBytes:LIMITS.outputBytes});

export function createTools({config,store,approvals}) {
  const {root}=config;
  const defs=[];
  const register=(name,description,inputSchema,handler,annotations={})=>defs.push({name,description,inputSchema,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false,...annotations},handler});
  const approval = async(op,params,opts={})=>{
    const a=await approvals.request(op,params,opts);
    if(!a.allowed)throw new Error(`Action NOT executed: ${a.source}. Open the local approval panel with npm run panel.`);
  };
  const readCurrent = async abs =>readTextLimited(abs,LIMITS.fileBytes);
  const record = async(action,params)=>store.audit(action,params);

  register('workspace_info','Show project root, project type, configured execution limits and capabilities.',shape({}),async()=>{
    const known=['package.json','pom.xml','build.gradle','build.gradle.kts','Cargo.toml','pyproject.toml','requirements.txt','go.mod','composer.json'];
    const manifest=[];
    for(const name of known){try{await fs.stat(path.join(root,name));manifest.push(name)}catch{}}
    let scripts={};
    if(manifest.includes('package.json')) {
      try {const pkg=JSON.parse((await readCurrent(path.join(root,'package.json'))).text);scripts=pkg.scripts||{};}catch{}
    }
    return result({name:'Claude Free Code MCP',version:VERSION,workspace:root,manifest,scripts,limits:LIMITS,dashboard:'Run npm run panel from the MCP folder after Claude Desktop starts the server',note:'Local MCP tools use Claude Desktop conversation limits; they do not unlock paid Claude Code.'});
  },{readOnlyHint:true,destructiveHint:false});

  register('project_tree','List a bounded directory tree. Excludes heavy dependency directories by default.',shape({directory:str('Relative folder to scan',{default:'.'}),maxDepth:integer('Maximum nesting, 1..20',{default:5}),includeHidden:bool('Include hidden entries',{default:false})}),async(a)=>{
    const directory=a.directory??'.'; await resolvePath(root,directory);
    const {items,truncated}=await walk(root,directory,{maxEntries:LIMITS.maxEntries,maxDepth:a.maxDepth??5,hidden:a.includeHidden??false});
    return result({entries:items,truncated});
  },{readOnlyHint:true,destructiveHint:false});

  register('glob_files','Find files matching a glob such as src/**/*.js, *.json or **/test*.py.',shape({glob:str('Relative glob pattern'),directory:str('Search subdirectory',{default:'.'}),limit:integer('1..500',{default:100})},['glob']),async(a)=>{
    const regex=globToRegexp(a.glob); const from=a.directory??'.';await resolvePath(root,from);
    const {items,truncated}=await walk(root,from,{maxEntries:LIMITS.maxEntries,maxDepth:25});
    const base=from==='.'?'':from.replaceAll('\\','/').replace(/\/$/,'')+'/';
    const matches=items.filter(x=>x.type==='file'&&regex.test(x.path.startsWith(base)?x.path.slice(base.length):x.path));
    const limit=assertInt(a.limit??100,'limit',1,500);
    return result({matches:matches.slice(0,limit).map(x=>x.path),count:matches.length,truncated:truncated||matches.length>limit});
  },{readOnlyHint:true,destructiveHint:false});

  register('search_code','Search text in workspace source files, with line numbers, bounded results and total bytes.',shape({query:str('Literal search text'),directory:str('Relative directory',{default:'.'}),caseSensitive:bool('Case-sensitive search',{default:false}),glob:str('Optional glob filter, e.g. **/*.js',{default:'**/*'}),limit:integer('Maximum matches 1..150',{default:60})},['query']),async(a)=>{
    const query=assertString(a.query,'query',1,500), dir=a.directory??'.'; await resolvePath(root,dir);
    const limit=assertInt(a.limit??60,'limit',1,LIMITS.maxSearchMatches);
    const files=(await walk(root,dir,{maxEntries:LIMITS.maxEntries,maxDepth:25}));
    const pattern=globToRegexp(a.glob??'**/*');
    let bytesScanned=0,filesSearched=0;const matches=[];
    const needle=a.caseSensitive?query:query.toLocaleLowerCase();
    for(const ent of files.items){
      if(ent.type!=='file'||!pattern.test(ent.path))continue;
      const abs=await resolvePath(root,ent.path);
      let read;
      try{read=await readTextLimited(abs,LIMITS.searchFileBytes);}catch{continue;}
      if(bytesScanned+read.bytes>LIMITS.searchTotalBytes)break;
      bytesScanned+=read.bytes;filesSearched++;
      const lines=read.text.split(/\r?\n/);
      for(let i=0;i<lines.length;i++){
        if((a.caseSensitive?lines[i]:lines[i].toLocaleLowerCase()).includes(needle)){
          matches.push({file:ent.path,line:i+1,text:limitText(lines[i].trim(),300)});
          if(matches.length>=limit) return result({matches,filesSearched,bytesScanned,truncated:true});
        }
      }
    }
    return result({matches,filesSearched,bytesScanned,truncated:files.truncated||bytesScanned>=LIMITS.searchTotalBytes});
  },{readOnlyHint:true,destructiveHint:false});

  register('read_file','Read a UTF-8 source file by line range, including a SHA-256 concurrency token.',shape({file:str('Relative file path'),startLine:integer('First line, 1-based',{default:1}),maxLines:integer('Number of lines, 1..600',{default:250})},['file']),async(a)=>{
    const abs=await getFile(root,a.file);
    const {text,bytes}=await readCurrent(abs);
    const lines=text.split(/\r?\n/),start=assertInt(a.startLine??1,'startLine',1,10000000),max=assertInt(a.maxLines??250,'maxLines',1,600);
    return result({file:toRel(root,abs),sha256:sha256(text),bytes,totalLines:lines.length,startLine:start,
      content:lines.slice(start-1,start-1+max).map((line,i)=>`${start+i}: ${line}`).join('\n'),hasMore:start-1+max<lines.length});
  },{readOnlyHint:true,destructiveHint:false});

  register('read_files','Read up to 8 UTF-8 files, capped at 40 KB each for context gathering.',shape({files:array('Relative file paths',str('File'),{maxItems:8,minItems:1})},['files']),async(a)=>{
    if(!Array.isArray(a.files)||a.files.length<1||a.files.length>8)throw new Error('files must contain 1..8 entries');
    const results=[];
    for(const rel of a.files){try{const abs=await getFile(root,rel);const {text}=await readTextLimited(abs,40*1024);results.push({file:rel,sha256:sha256(text),text});}
      catch(e){results.push({file:rel,error:e.message});}}
    return result(results);
  },{readOnlyHint:true,destructiveHint:false});

  register('preview_replace','Preview a unique exact-string replacement without modifying the file.',shape({file:str('Relative file'),search:str('Exact original text'),replacement:str('Replacement text')},['file','search','replacement']),async(a)=>{
    const {text}=await readCurrent(await getFile(root,a.file));
    const needle=assertString(a.search,'search',1,1000000);const count=text.split(needle).length-1;
    if(count!==1)throw new Error(`Expected exactly one match, found ${count}`);
    return result({file:a.file,sha256:sha256(text),matchCount:count,before:limitText(needle,3000),after:limitText(a.replacement,3000),newSha256:sha256(text.replace(needle,a.replacement))});
  },{readOnlyHint:true,destructiveHint:false});

  register('write_file','Create a UTF-8 file. Overwriting an existing file requires overwrite=true. Changes get snapshots.',shape({file:str('Relative file path'),content:str('UTF-8 file content'),overwrite:bool('Permit replacement of existing file',{default:false}),expectedSha256:str('Optional expected SHA-256 (empty if not existing)')},['file','content']),async(a)=>{
    const abs=await getFile(root,a.file,true), content=assertString(a.content,'content',0,LIMITS.writeBytes);
    await fs.mkdir(path.dirname(abs),{recursive:true});
    let exists=false;try{await fs.stat(abs);exists=true}catch(e){if(e.code!=='ENOENT')throw e;}
    if(exists && a.overwrite!==true)throw new Error('File exists. Set overwrite=true and consider expectedSha256 to avoid accidental changes.');
    if(!exists && a.expectedSha256 && a.expectedSha256!=='')throw new Error('Expected file does not exist');
    const snapshot=await store.writeFileWithSnapshot(abs,toRel(root,abs),Buffer.from(content,'utf8'),a.expectedSha256);
    return result({written:a.file,bytes:Buffer.byteLength(content),sha256:snapshot.afterHash,snapshotId:snapshot.id});
  });

  register('replace_exact','Replace exactly one occurrence of text. Uses atomic write with undo snapshot.',shape({file:str('Relative file'),search:str('Exact text to find'),replacement:str('New text'),expectedSha256:str('Optional optimistic concurrency SHA-256')},['file','search','replacement']),async(a)=>{
    const abs=await getFile(root,a.file,true);const {text}=await readCurrent(abs);
    const needle=assertString(a.search,'search',1,1000000);const count=text.split(needle).length-1;
    if(count!==1)throw new Error(`Exactly one match required; found ${count}`);
    const next=text.replace(needle,assertString(a.replacement,'replacement'));
    const snapshot=await store.writeFileWithSnapshot(abs,toRel(root,abs),Buffer.from(next),a.expectedSha256??sha256(text));
    return result({updated:a.file,sha256:snapshot.afterHash,snapshotId:snapshot.id});
  });

  register('edit_lines','Apply multiple non-overlapping 1-based line edits atomically, with snapshot and optional expectedSha256.',shape({file:str('Relative file'),edits:array('Line edits',shape({startLine:integer('First line, 1-based'),endLine:integer('Last line, inclusive; startLine-1 to insert'),replacement:str('Replacement lines, may be empty')},['startLine','endLine','replacement']),{minItems:1,maxItems:30}),expectedSha256:str('Optional SHA-256 of the version being edited')},['file','edits']),async(a)=>{
    if(!Array.isArray(a.edits)||a.edits.length<1||a.edits.length>30)throw new Error('1..30 edits required');
    const abs=await getFile(root,a.file,true);const {text}=await readCurrent(abs);
    const separator=text.includes('\r\n')?'\r\n':'\n';let lines=text.split(/\r?\n/);
    const edits=a.edits.map(e=>({start:e.startLine,end:e.endLine,replacement:assertString(e.replacement,'replacement')})).sort((x,y)=>x.start-y.start);
    let lastEnd=0;
    for(const edit of edits){
      assertInt(edit.start,'startLine',1,lines.length+1);assertInt(edit.end,'endLine',0,lines.length);
      if(edit.end<edit.start-1||edit.start<=lastEnd)throw new Error('Invalid or overlapping line edits');
      lastEnd=Math.max(lastEnd,edit.end,edit.start-1);
    }
    for(const edit of edits.reverse()){
      const replacement=edit.replacement===''?[]:edit.replacement.split(/\r?\n/);
      lines.splice(edit.start-1,edit.end-edit.start+1,...replacement);
    }
    const next=lines.join(separator);
    const snapshot=await store.writeFileWithSnapshot(abs,toRel(root,abs),Buffer.from(next),a.expectedSha256??sha256(text));
    return result({updated:a.file,sha256:snapshot.afterHash,snapshotId:snapshot.id,newLineCount:lines.length});
  });

  register('make_directory','Create a folder inside the workspace.',shape({directory:str('Relative folder path')},['directory']),async(a)=>{
    const dir=await resolvePath(root,a.directory,{writing:true,allowRoot:false});
    await fs.mkdir(dir,{recursive:true});await record('mkdir',{directory:toRel(root,dir)});
    return result({created:toRel(root,dir)});
  },{destructiveHint:false});

  register('move_path','Move/rename a workspace file or folder, after approval in the local panel. No overwrites.',shape({from:str('Source relative path'),to:str('Destination relative path')},['from','to']),async(a)=>{
    const from=await getFile(root,a.from,true),to=await getFile(root,a.to,true);
    if(to.startsWith(from+path.sep))throw new Error('Cannot move a folder inside itself');
    try{await fs.lstat(to);throw new Error('Destination already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
    await approval('move_path',{from:toRel(root,from),to:toRel(root,to)},{rememberable:false});
    await resolvePath(root,a.from,{writing:true,allowRoot:false});await resolvePath(root,a.to,{writing:true,allowRoot:false});
    await fs.mkdir(path.dirname(to),{recursive:true});await fs.rename(from,to);
    await record('move_path',{from:a.from,to:a.to});return result({moved:a.from,to:a.to});
  });

  register('delete_path','Delete a regular file (with undo snapshot) or an EMPTY folder. Requires approval; recursive deletion is disabled.',shape({file:str('File or empty folder to delete')},['file']),async(a)=>{
    const abs=await getFile(root,a.file,true);const st=await fs.lstat(abs);
    if(st.isSymbolicLink())throw new Error('Symlink rejected');
    if(!st.isFile()&&!st.isDirectory())throw new Error('Unsupported file type');
    if(st.isDirectory()&&(await fs.readdir(abs)).length)throw new Error('Refusing to delete non-empty directory');
    await approval('delete_path',{file:toRel(root,abs),kind:st.isFile()?'file':'empty-folder'},{rememberable:false});
    await resolvePath(root,a.file,{writing:true,allowRoot:false});
    if(st.isDirectory()){await fs.rmdir(abs);await record('rmdir',{file:a.file});return result({deleted:a.file,type:'empty-folder'});}
    const snap=await store.writeFileWithSnapshot(abs,toRel(root,abs),null);
    return result({deleted:a.file,snapshotId:snap.id,restorable:true});
  });

  register('list_snapshots','See available undo snapshots for file changes.',shape({file:str('Optional file path'),limit:integer('Max snapshots 1..100',{default:30})}),async(a)=>{
    if(a.file)await getFile(root,a.file);
    const items=await store.snapshots(a.file||null);
    return result(items.slice(0,assertInt(a.limit??30,'limit',1,100)));
  },{readOnlyHint:true,destructiveHint:false});

  register('restore_snapshot','Restore a saved pre-edit version if the current hash still matches the snapshot. Requires local approval.',shape({snapshotId:str('Snapshot ID')},['snapshotId']),async(a)=>{
    const snap=await store.snapshotById(assertString(a.snapshotId,'snapshotId',1,100));
    if(!snap)throw new Error('Snapshot not found');
    const abs=await getFile(root,snap.path,true);
    await approval('restore_snapshot',{snapshotId:snap.id,file:snap.path},{rememberable:false});
    await resolvePath(root,snap.path,{writing:true,allowRoot:false});
    const s=await store.restoreSnapshot(snap.id,abs);return result({restored:snap.path,undoSnapshotId:s.id});
  });

  register('git_status','Read Git status and current branch.',shape({}),async()=>result(await git(root,['status','--short','--branch'])),{readOnlyHint:true,destructiveHint:false});
  register('git_diff','Read unstaged or staged Git diffs; outputs are limited to 96 KB.',shape({staged:bool('Show staged changes',{default:false}),file:str('Optional file path')}),async(a)=>{
    const args=['diff',...(a.staged?['--cached']:[]),'--'];if(a.file)args.push(await safeRelative(root,a.file));
    return result(await git(root,args));
  },{readOnlyHint:true,destructiveHint:false});
  register('git_log','Read recent commits.',shape({count:integer('Number of commits, 1..30',{default:10})}),async(a)=>result(await git(root,['log',`-${assertInt(a.count??10,'count',1,30)}`,'--date=short','--pretty=format:%h %ad %s'])),{readOnlyHint:true,destructiveHint:false});
  register('git_branches','List local Git branches.',shape({}),async()=>result(await git(root,['branch','--list'])),{readOnlyHint:true,destructiveHint:false});

  register('git_stage','Stage selected workspace file paths. Requires GUI approval.',shape({files:array('Relative files to stage',str('File'),{minItems:1,maxItems:25})},['files']),async(a)=>{
    if(!Array.isArray(a.files)||a.files.length<1||a.files.length>25)throw new Error('1..25 paths required');
    const files=[];for(const name of a.files)files.push(await safeRelative(root,name));
    await approval('git_stage',{files});const r=await git(root,['add','--',...files]);await record('git_stage',{files,exitCode:r.exitCode});return result(r);
  });
  register('git_commit','Create a Git commit with an explicit message; requires GUI approval. Hooks may execute.',shape({message:str('Commit message, maximum 300 chars')},['message']),async(a)=>{
    const message=assertString(a.message,'message',1,300);
    await approval('git_commit',{message});const r=await git(root,['commit','-m',message],60);await record('git_commit',{message,exitCode:r.exitCode});return result(r);
  });

  register('git_remote','View Git remotes without changing repository settings.',shape({}),async()=>result(await git(root,['remote','-v'])),{readOnlyHint:true,destructiveHint:false});
  register('git_create_branch','Create and switch to a new local Git branch after local approval.',shape({branch:str('New branch name')},['branch']),async(a)=>{
    const branch=assertString(a.branch,'branch',1,100);
    if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)||branch.includes('..')||branch.includes('//')||branch.endsWith('.lock'))throw new Error('Invalid branch name');
    await approval('git_create_branch',{branch});const r=await git(root,['switch','-c',branch]);await record('git_create_branch',{branch,exitCode:r.exitCode});return result(r);
  });
  register('github_repo_view','Show GitHub repository metadata through optional authenticated gh CLI.',shape({}),async()=>result(await runProcess({command:'gh',args:['repo','view','--json','name,owner,url,description,defaultBranchRef'],cwd:root,timeoutSeconds:25})),{readOnlyHint:true,destructiveHint:false,openWorldHint:true});
  register('github_pr_list','List GitHub pull requests in the current repository using gh CLI (requires gh auth).',shape({limit:integer('1..40',{default:15})}),async(a)=>result(await runProcess({command:'gh',args:['pr','list','--limit',String(assertInt(a.limit??15,'limit',1,40))],cwd:root,timeoutSeconds:25})),{readOnlyHint:true,destructiveHint:false,openWorldHint:true});
  register('github_issue_list','List GitHub issues in the current repository using gh CLI (requires gh auth).',shape({limit:integer('1..40',{default:15})}),async(a)=>result(await runProcess({command:'gh',args:['issue','list','--limit',String(assertInt(a.limit??15,'limit',1,40))],cwd:root,timeoutSeconds:25})),{readOnlyHint:true,destructiveHint:false,openWorldHint:true});
  register('github_pr_create','Open a GitHub pull request using gh CLI. Requires local approval. Assumes branch has been pushed.',shape({title:str('PR title'),body:str('PR description'),base:str('Base branch, e.g. main',{default:'main'})},['title','body']),async(a)=>{
    const title=assertString(a.title,'title',1,160),body=assertString(a.body,'body',0,12000),base=assertString(a.base??'main','base',1,100);
    if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base))throw new Error('Invalid base branch');
    await approval('github_pr_create',{title,body,base},{rememberable:false});
    const r=await runProcess({command:'gh',args:['pr','create','--title',title,'--body',body,'--base',base],cwd:root,timeoutSeconds:45});
    await record('github_pr_create',{title,base,exitCode:r.exitCode});return result(r);
  },{openWorldHint:true});

  register('command_catalog' ,'List allowed executable names and predefined development tasks. Every executable task requires local approval.',shape({}),async()=>result({commands:ALLOWED_COMMANDS,tasks:TASKS,policy:'No shell interpolation is added. A command only runs after local panel approval (unless its exact signature was trusted there).'}),{readOnlyHint:true,destructiveHint:false});
  register('run_task','Execute a predefined npm or git task; build/test/lint/format/typecheck require local human approval.',shape({task:str('Task name',{enum:Object.keys(TASKS)}),timeoutSeconds:integer('Maximum duration in seconds 1..180',{default:90})},['task']),async(a)=>{
    if(!Object.hasOwn(TASKS,a.task))throw new Error('Unknown task');
    const def=TASKS[a.task],timeoutSeconds=assertInt(a.timeoutSeconds??90,'timeoutSeconds',1,180);
    if(!isReadOnlyTask(a.task))await approval('run_task',{task:a.task,command:def.command,args:def.args,cwd:root});
    const r=await runProcess({...def,cwd:root,timeoutSeconds});await record('run_task',{task:a.task,exitCode:r.exitCode,timedOut:r.timedOut});return result(r);
  });
  register('run_command','Run a chosen developer executable using argument-array (no implicit shell), workspace cwd, timeout and human approval.',shape({command:str('Executable from command_catalog',{enum:ALLOWED_COMMANDS}),args:array('Argument strings',str('Argument'),{maxItems:40}),cwd:str('Relative working directory',{default:'.'}),timeoutSeconds:integer('1..180 seconds',{default:60}),reason:str('Explain why this command is necessary')},['command','args','reason']),async(a)=>{
    if(!ALLOWED_COMMANDS.includes(a.command))throw new Error('Executable not allowed');
    assertString(a.reason,'reason',5,500);
    const cwd=await resolvePath(root,a.cwd??'.');
    const args=a.args;if(!Array.isArray(args)||args.length>LIMITS.maxArgs||args.some(s=>typeof s!=='string'||s.length>4000))throw new Error('Invalid arguments');
    const timeoutSeconds=assertInt(a.timeoutSeconds??60,'timeoutSeconds',1,180);
    await approval('run_command',{command:a.command,args,cwd:toRel(root,cwd),reason:a.reason},{rememberable:true});
    const r=await runProcess({command:a.command,args,cwd,timeoutSeconds});
    await record('run_command',{command:a.command,args,cwd:toRel(root,cwd),exitCode:r.exitCode,timedOut:r.timedOut});return result(r);
  });

  register('plan_create','Create or replace a local project plan with up to 30 steps, visible in the dashboard.',shape({goal:str('Overall project objective'),steps:array('Task descriptions',str('Step'),{minItems:1,maxItems:30})},['goal','steps']),async(a)=>{
    const goal=assertString(a.goal,'goal',1,1000);
    if(!Array.isArray(a.steps)||a.steps.length<1||a.steps.length>30)throw new Error('1..30 steps required');
    const steps=a.steps.map((s,i)=>({id:i+1,title:assertString(s,'step',1,500),status:'todo',note:''}));
    const plan={id:crypto.randomUUID(),goal,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),steps};
    await store.writeJson('plan.json',plan);await record('plan_create',{goal,steps:steps.length});return result(plan);
  },{destructiveHint:false});
  register('plan_update','Update step status and notes in an existing project plan.',shape({step:integer('1-based step number'),status:str('todo, doing, done or blocked',{enum:['todo','doing','done','blocked']}),note:str('Optional progress note',{default:''})},['step','status']),async(a)=>{
    const plan=await store.json('plan.json',null);if(!plan)throw new Error('Create a plan first');
    const idx=assertInt(a.step,'step',1,plan.steps.length)-1;
    if(!['todo','doing','done','blocked'].includes(a.status))throw new Error('Invalid status');
    plan.steps[idx].status=a.status;plan.steps[idx].note=assertString(a.note??'','note',0,2000);plan.updatedAt=new Date().toISOString();
    await store.writeJson('plan.json',plan);await record('plan_update',{step:a.step,status:a.status});return result(plan);
  },{destructiveHint:false});
  register('plan_get','Read the current persisted task plan.',shape({}),async()=>result(await store.json('plan.json',null)),{readOnlyHint:true,destructiveHint:false});

  register('project_notes_read','Read local project instructions/notes persisted outside the workspace.',shape({}),async()=>result({notes:(await store.json('notes.json',{text:''})).text}),{readOnlyHint:true,destructiveHint:false});
  register('project_notes_write','Save project-specific coding instructions and conventions. Does not alter source files.',shape({text:str('Project notes, up to 12,000 chars')},['text']),async(a)=>{
    const text=assertString(a.text,'text',0,12000);await store.writeJson('notes.json',{text,updatedAt:new Date().toISOString()});await record('project_notes_write',{characters:text.length});return result({saved:true,characters:text.length});
  },{destructiveHint:false});

  register('checkpoint_save','Save a restart/resume checkpoint for when Claude Free reaches its conversation limit.',shape({title:str('Short checkpoint title'),summary:str('Completed work, current blockers and relevant context'),nextSteps:array('Actions to do on resume',str('Action'),{maxItems:20})},['title','summary','nextSteps']),async(a)=>{
    const title=assertString(a.title,'title',1,150),summary=assertString(a.summary,'summary',1,12000);
    if(!Array.isArray(a.nextSteps)||a.nextSteps.length>20)throw new Error('Maximum 20 next steps');
    const nextSteps=a.nextSteps.map(s=>assertString(s,'nextStep',1,500));
    const item={id:crypto.randomUUID(),at:new Date().toISOString(),title,summary,nextSteps};
    const items=await store.json('checkpoints.json',[]);items.push(item);
    await store.writeJson('checkpoints.json',items.slice(-40));await record('checkpoint_save',{title,id:item.id});return result(item);
  },{destructiveHint:false});
  register('checkpoint_list','List saved context checkpoints across Claude conversations.',shape({limit:integer('1..40',{default:12})}),async(a)=>{
    const items=await store.json('checkpoints.json',[]);return result(items.slice(-assertInt(a.limit??12,'limit',1,40)).reverse().map(({id,at,title})=>({id,at,title})));
  },{readOnlyHint:true,destructiveHint:false});
  register('checkpoint_read','Read a saved checkpoint by ID, or the most recent one.',shape({id:str('Optional checkpoint id; newest by default')}),async(a)=>{
    const items=await store.json('checkpoints.json',[]);return result((a.id?items.find(x=>x.id===a.id):items.at(-1))||null);
  },{readOnlyHint:true,destructiveHint:false});
  register('resume_context','Read notes, current plan, recent checkpoint and Git status to help resume after a free-tier limit.',shape({}),async()=>{
    const checkpoints=await store.json('checkpoints.json',[]);
    return result({workspace:root,notes:(await store.json('notes.json',{text:''})).text,plan:await store.json('plan.json',null),checkpoint:checkpoints.at(-1)||null,gitStatus:await git(root,['status','--short','--branch'])});
  },{readOnlyHint:true,destructiveHint:false});
  register('audit_recent','Inspect recent local operations and approval decisions.',shape({count:integer('Recent events 1..80',{default:30})}),async(a)=>result(await store.recentAudit(assertInt(a.count??30,'count',1,80))),{readOnlyHint:true,destructiveHint:false});
  return defs;
}
