import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { secretToken } from './storage.js';

const headers={
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};
function reply(res,code,body,type='application/json; charset=utf-8') {res.writeHead(code,{...headers,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(body):body);}
async function readBody(req) {
  let body='';
  for await(const piece of req){body+=piece.toString('utf8');if(body.length>16000)throw new Error('Request too large');}
  return JSON.parse(body||'{}');
}
export async function startDashboard(config,store,approvals){
  const token=await secretToken(config);
  const dashboard=http.createServer(async (req,res)=>{
    try {
      const host=req.headers.host;
      const expectedPort=dashboard.address()?.port;
      if(host!==`127.0.0.1:${expectedPort}`) return reply(res,403,{error:'Invalid Host'});
      const url=new URL(req.url,`http://127.0.0.1:${expectedPort}`);
      const candidate=req.headers.authorization?.replace(/^Bearer /,'') || url.searchParams.get('token');
      if(candidate!==token) return reply(res,401,{error:'Access denied. Run npm run panel to get the private link.'});
      if(req.method==='POST'&&req.headers.origin!==`http://127.0.0.1:${expectedPort}`) return reply(res,403,{error:'Invalid Origin'});
      if(req.method==='GET'&&url.pathname==='/') return reply(res,200,PANEL_HTML,'text/html; charset=utf-8');
      if(req.method==='GET'&&url.pathname==='/api/state') return reply(res,200,{
        root:config.root,version:'1.0.0',pending:approvals.list(),trusted:await approvals.trusted(),
        audit:await store.recentAudit(40),checkpoints:(await store.json('checkpoints.json',[])).slice(-10).reverse(),
        plan:await store.json('plan.json',null),port:expectedPort
      });
      if(req.method==='POST'&&url.pathname==='/api/decide') {const b=await readBody(req);await approvals.decide(b.id,b.decision);return reply(res,200,{ok:true});}
      if(req.method==='POST'&&url.pathname==='/api/revoke') {const b=await readBody(req);await approvals.revoke(b.key);return reply(res,200,{ok:true});}
      return reply(res,404,{error:'Not found'});
    } catch(error){return reply(res,400,{error:error.message});}
  });
  try {
    await new Promise((resolve,reject)=>{dashboard.once('error',reject);dashboard.listen(config.panelPort,'127.0.0.1',resolve);});
  } catch(e) {
    if(e.code!=='EADDRINUSE') throw e;
    await new Promise((resolve,reject)=>{dashboard.once('error',reject);dashboard.listen(0,'127.0.0.1',resolve);});
  }
  const port=dashboard.address().port;
  await fs.writeFile(path.join(store.dir,'panel.json'),JSON.stringify({pid:process.pid,port,at:new Date().toISOString()}),{mode:0o600});
  console.error(`[Claude Free Code MCP] Panel de permisos: http://127.0.0.1:${port}/ (ejecuta npm run panel para obtener el enlace)`);
  return {dashboard,port};
}

const PANEL_HTML = String.raw`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claude Free Code · Panel</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0c1020;color:#f0f3ff}
*{box-sizing:border-box}body{margin:0 auto;padding:28px 22px;max-width:1150px}h1{margin:0;font-size:26px}h2{font-size:18px;margin:0 0 16px}small,.muted{color:#a7b2ca}header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:26px}.pill{padding:8px 12px;border-radius:20px;background:#183c35;color:#7ee4c9;font-size:13px}
.layout{display:grid;grid-template-columns:1.3fr 1fr;gap:18px}@media(max-width:800px){.layout{grid-template-columns:1fr}}
section{border:1px solid #28334b;border-radius:14px;background:#131a2c;padding:20px;margin-bottom:18px}section.wide{grid-column:1/-1}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1121;padding:12px;border-radius:8px;font-size:12px;max-height:240px;overflow:auto}button{border:0;border-radius:9px;padding:10px 12px;background:#33415f;color:white;cursor:pointer;font-weight:600;margin:4px 4px 0 0}button:hover{filter:brightness(1.2)}button.yes{background:#187b64}button.no{background:#9c3948}button:disabled{opacity:.5;cursor:wait}
.entry{border:1px solid #2f3d58;padding:13px;border-radius:10px;margin:10px 0}.entry strong{display:block;margin:0 0 7px}.scroll{max-height:480px;overflow:auto}.path{word-break:break-all;font-family:monospace;font-size:12px;color:#8ebfff}p{line-height:1.5}code{color:#b5d3ff}.status{min-height:20px}
</style></head><body><header><div><h1>Claude Free Code MCP</h1><p class="muted">Panel local de aprobación, historial y progreso · Solo 127.0.0.1</p><p id="root" class="path"></p></div><span class="pill">● Servicio local activo</span></header>
<div class="layout"><section><h2>Solicitudes pendientes</h2><p class="muted">Revisa cada comando antes de permitirlo. «Siempre» recuerda la combinación exacta de comando y argumentos.</p><div id="pending" class="scroll"></div></section>
<section><h2>Autorizaciones guardadas</h2><div id="trusted" class="scroll"></div></section>
<section><h2>Plan y checkpoints</h2><div id="plan"></div><div id="checkpoints"></div></section>
<section><h2>Historial de acciones</h2><div id="audit" class="scroll"></div></section></div><p id="status" class="status muted"></p>
<script>
const url = new URL(location.href); const token=url.searchParams.get('token')||sessionStorage.getItem('cfcm_token');
if(token){sessionStorage.setItem('cfcm_token',token);history.replaceState(null,'',location.pathname)}
else{document.getElementById('status').textContent='Enlace sin acceso. Ejecuta npm run panel y abre la URL que aparece.'}
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el};
const el=(id)=>document.getElementById(id);const clear=id=>el(id).replaceChildren();
async function call(path,data){const options={headers:{Authorization:'Bearer '+token}};if(data){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}const r=await fetch(path,options);const x=await r.json();if(!r.ok)throw Error(x.error||'Error HTTP '+r.status);return x}
function entry(parent,title,body){const div=make('div',undefined,'entry');div.append(make('strong',title));if(body!==undefined)div.append(make('pre',typeof body==='string'?body:JSON.stringify(body,null,2)));parent.append(div);return div}
async function act(path,data){try{await call(path,data);el('status').textContent='Actualizado';await refresh()}catch(e){el('status').textContent=e.message}}
async function refresh(){if(!token)return;try{
  const s=await call('/api/state');el('root').textContent=s.root;
  clear('pending');if(!s.pending.length)el('pending').append(make('p','No hay solicitudes pendientes.','muted'));
  for(const item of s.pending){const d=entry(el('pending'),item.op,item.params);d.append(make('small','Caduca: '+new Date(item.expiresAt).toLocaleTimeString()));
    for(const [label,choice,cl] of [['Aprobar una vez','approve','yes'],['Rechazar','deny','no'],...(item.rememberable?[['Confiar siempre','always','']]:[])]){
      const b=make('button',label,cl);b.onclick=()=>act('/api/decide',{id:item.id,decision:choice});d.append(b)
    }
  }
  clear('trusted');if(!s.trusted.length)el('trusted').append(make('p','Todavía no hay permisos permanentes.','muted'));
  for(const t of s.trusted){const d=entry(el('trusted'),t.op,t.params);const b=make('button','Revocar','no');b.onclick=()=>act('/api/revoke',{key:t.key});d.append(b)}
  clear('plan');if(s.plan)entry(el('plan'),'Plan activo',s.plan);else el('plan').append(make('p','No hay plan activo.','muted'));
  clear('checkpoints');for(const c of s.checkpoints)entry(el('checkpoints'),new Date(c.at).toLocaleString()+' · '+c.title,c.summary);
  clear('audit');for(const a of s.audit)entry(el('audit'),a.action+' · '+new Date(a.at).toLocaleString(),a);
}catch(e){el('status').textContent=e.message}}
refresh();setInterval(refresh,2000);
</script></body></html>`;
