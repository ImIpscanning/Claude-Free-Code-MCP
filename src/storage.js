import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { LIMITS } from './config.js';

export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

async function atomicWrite(file, content, {exclusive = false} = {}) {
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  if (exclusive) return fs.writeFile(file,content,{flag:'wx',mode:0o600});
  const tmp = path.join(path.dirname(file), `.tmp-${process.pid}-${crypto.randomUUID()}`);
  try { await fs.writeFile(tmp,content,{mode:0o600}); await fs.rename(tmp,file); }
  finally { await fs.rm(tmp,{force:true}).catch(()=>{}); }
}

export class Store {
  constructor(config) { this.config=config; this.dir=config.workspaceStateDir; this.locks=new Map(); }
  async init() { await fs.mkdir(this.dir,{recursive:true,mode:0o700}); await fs.mkdir(path.join(this.dir,'snapshots'),{recursive:true,mode:0o700}); await this.writeJson('workspace.json',{root:this.config.root,lastStarted:new Date().toISOString()}); }
  async json(name, fallback) {
    try { return JSON.parse(await fs.readFile(path.join(this.dir,name),'utf8')); }
    catch(e) { if (e.code==='ENOENT') return fallback; throw e; }
  }
  async writeJson(name,data) { return atomicWrite(path.join(this.dir,name),JSON.stringify(data,null,2)+'\n'); }
  async audit(action, details={}) {
    const event = {at:new Date().toISOString(),action,...details};
    await fs.appendFile(path.join(this.dir,'audit.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
  }
  async recentAudit(n=30) {
    try { const data=await fs.readFile(path.join(this.dir,'audit.jsonl'),'utf8'); return data.trim().split('\n').slice(-n).map(s=>JSON.parse(s)).reverse(); }
    catch(e) { if (e.code==='ENOENT') return []; throw e; }
  }
  async withLock(key, callback) {
    const previous=this.locks.get(key)||Promise.resolve();
    let release;
    const current=new Promise(r=>release=r);
    this.locks.set(key,current);
    await previous;
    try { return await callback(); }
    finally { release(); if (this.locks.get(key)===current) this.locks.delete(key); }
  }
  async writeFileWithSnapshot(abs, rel, newContent, expectedHash) {
    return this.withLock(abs, async()=>{
      let oldText=null;
      try { oldText=await fs.readFile(abs); }
      catch(e) { if (e.code!=='ENOENT') throw e; }
      if (oldText?.length > LIMITS.fileBytes) throw new Error('Existing file too large to snapshot');
      if (newContent?.length > LIMITS.writeBytes) throw new Error('New file too large');
      const beforeHash = oldText===null?null:sha256(oldText);
      if (expectedHash !== undefined && (beforeHash||'')!==expectedHash) throw new Error(`File changed since last read (current sha256: ${beforeHash||'(missing)'})`);
      const afterHash = newContent===null?null:sha256(newContent);
      const id = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
      const snapshot = {id,path:rel,at:new Date().toISOString(),beforeHash,afterHash,created:oldText===null,deleted:newContent===null};
      // Persist original before mutating; snapshots remain available for manual undo.
      if (oldText!==null) await atomicWrite(path.join(this.dir,'snapshots',`${id}.before`),oldText);
      if (newContent===null) await fs.unlink(abs);
      else await atomicWrite(abs,newContent);
      await this.withLock('__snapshot_index',async()=>{
        const list=await this.json('snapshots.json',[]);
        list.push(snapshot);
        if (list.length>LIMITS.maxSnapshots) {
          const removed=list.splice(0,list.length-LIMITS.maxSnapshots);
          for (const prior of removed) await fs.rm(path.join(this.dir,'snapshots',`${prior.id}.before`),{force:true});
        }
        await this.writeJson('snapshots.json',list);
      });
      await this.audit('file_change',{path:rel,snapshot:id,beforeHash,afterHash});
      return snapshot;
    });
  }
  async snapshots(rel=null) { const s=await this.json('snapshots.json',[]); return s.filter(x=>!rel||x.path===rel).reverse(); }
  async snapshotById(id) {return (await this.json('snapshots.json',[])).find(s=>s.id===id)||null;}
  async restoreSnapshot(id, abs) {
    const item=await this.snapshotById(id);
    if (!item) throw new Error('Unknown snapshot');
    let current=null;
    try {current=await fs.readFile(abs);} catch(e){if(e.code!=='ENOENT') throw e;}
    if ((current===null?null:sha256(current))!==item.afterHash) throw new Error('File changed after snapshot; refusing unsafe restore');
    const previous=item.created?null:await fs.readFile(path.join(this.dir,'snapshots',`${id}.before`));
    const undo=await this.writeFileWithSnapshot(abs,item.path,previous,item.afterHash||'');
    await this.audit('restore_snapshot',{snapshot:id,undoSnapshot:undo.id});
    return undo;
  }
}

export async function secretToken(config) {
  await fs.mkdir(config.dataDir,{recursive:true,mode:0o700});
  const file=path.join(config.dataDir,'dashboard-token');
  try { return (await fs.readFile(file,'utf8')).trim(); }
  catch (e) { if(e.code!=='ENOENT') throw e; }
  const token=crypto.randomBytes(32).toString('hex');
  try {await atomicWrite(file,token+'\n',{exclusive:true}); return token;}
  catch(e){if(e.code==='EEXIST') return (await fs.readFile(file,'utf8')).trim(); throw e;}
}
