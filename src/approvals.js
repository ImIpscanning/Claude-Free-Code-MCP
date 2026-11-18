import crypto from 'node:crypto';

export class Approvals {
  constructor(store){ this.store=store; this.pending=new Map(); }
  fingerprint(op,params) { return crypto.createHash('sha256').update(JSON.stringify({op,params:Object.fromEntries(Object.entries(params).filter(([k])=>k!=='reason'))})).digest('hex'); }
  async request(op,params,{rememberable=true,timeoutMs=120000}={}) {
    const key=this.fingerprint(op,params);
    if (rememberable) {
      const remembered=await this.store.json('trusted.json',[]);
      if(remembered.some(x=>x.key===key)) return {allowed:true,source:'trusted'};
    }
    const id=crypto.randomUUID();
    const request={id,key,op,params,rememberable,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+timeoutMs).toISOString()};
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);
        this.store.audit('approval_timeout',{op}).catch(()=>{});
        resolve({allowed:false,source:'timeout'});
      },timeoutMs);
      this.pending.set(id,{request,resolve,timer});
    });
  }
  list(){return [...this.pending.values()].map(x=>x.request);}
  async decide(id,decision) {
    const entry=this.pending.get(id);
    if(!entry) throw new Error('Approval request expired or missing');
    if(!['approve','deny','always'].includes(decision)) throw new Error('Unknown decision');
    if(decision==='always'&&!entry.request.rememberable) throw new Error('This action cannot be trusted permanently');
    this.pending.delete(id); clearTimeout(entry.timer);
    if(decision==='always') {
      const trusted=await this.store.json('trusted.json',[]);
      if(!trusted.some(x=>x.key===entry.request.key)) trusted.push({key:entry.request.key,op:entry.request.op,params:entry.request.params,createdAt:new Date().toISOString()});
      await this.store.writeJson('trusted.json',trusted);
    }
    await this.store.audit('approval_decision',{op:entry.request.op,decision});
    entry.resolve({allowed:decision!=='deny',source:decision});
  }
  async trusted(){return this.store.json('trusted.json',[]);}
  async revoke(key){ const items=await this.trusted(); const next=items.filter(x=>x.key!==key); if(next.length===items.length)throw new Error('Unknown trusted action'); await this.store.writeJson('trusted.json',next); await this.store.audit('approval_revoke',{key}); }
}
