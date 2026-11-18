import path from 'node:path';
import fs from 'node:fs/promises';
import { createConfig } from './config.js';
import { secretToken } from './storage.js';

// Find any active local panel, not only the current working directory.
const config=createConfig({...process.env,MCP_PROJECT_ROOT:process.env.MCP_PROJECT_ROOT||process.argv[2]||process.cwd()});
const token=await secretToken(config);
const base=path.join(config.dataDir,'workspaces');
let found=0;
for(const entry of await fs.readdir(base,{withFileTypes:true}).catch(()=>[])){
  if(!entry.isDirectory())continue;
  const dir=path.join(base,entry.name);
  try {
    const [{port},{root}]=await Promise.all([
      fs.readFile(path.join(dir,'panel.json'),'utf8').then(JSON.parse),
      fs.readFile(path.join(dir,'workspace.json'),'utf8').then(JSON.parse)]);
    const url=`http://127.0.0.1:${port}`;
    const resp=await fetch(url+'/api/state',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(650)});
    if(!resp.ok)continue;
    const data=await resp.json();if(data.root!==root)continue;
    console.log(`\nProyecto: ${root}\nPanel privado: ${url}/?token=${token}`);found++;
  } catch{ /* stale or offline panel */ }
}
if(!found){console.error('No hay paneles activos. Abre Claude Desktop y verifica que el MCP esté iniciado.');process.exitCode=1;}
else console.log('\nNo compartas estos enlaces: permiten aprobar comandos en tu equipo.');
