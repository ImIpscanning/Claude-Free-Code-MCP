import readline from 'node:readline';
import { VERSION } from './config.js';

/** Small stdio JSON-RPC MCP transport. Uses Node core only, no npm install needed. */
export function runMcpStdio(tools) {
  const lookup=new Map(tools.map(t=>[t.name,t]));
  const send = obj => process.stdout.write(JSON.stringify(obj)+'\n');
  const textError = message => ({content:[{type:'text',text:String(message)}],isError:true,resultType:'complete'});
  async function receive(message) {
    if(!message||typeof message!=='object'||Array.isArray(message))return;
    if(!Object.hasOwn(message,'id'))return; // notifications
    const id=message.id;
    const method=message.method;
    try {
      let value;
      if(method==='initialize') {
        const clientProtocol=message.params?.protocolVersion;
        // Negotiate a known supported protocol version. Tools used here are valid in both.
        const protocolVersion=['2026-07-28','2025-11-25','2025-06-18','2025-03-26'].includes(clientProtocol)?clientProtocol:'2025-11-25';
        value={protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:'claude-free-code-mcp',version:VERSION}};
      } else if(method==='ping')value={};
      else if(method==='tools/list')value={tools:tools.map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations}))};
      else if(method==='tools/call') {
        const tool=lookup.get(message.params?.name);
        if(!tool)throw new Error('Unknown tool');
        try { value=await tool.handler(message.params?.arguments??{}); value.resultType='complete'; }
        catch(e) { value=textError(e.message);console.error(`[MCP tool ${tool.name}] ${e.stack||e.message}`); }
      } else {
        send({jsonrpc:'2.0',id,error:{code:-32601,message:`Method not found: ${method}`}});return;
      }
      send({jsonrpc:'2.0',id,result:value});
    } catch(e) {
      send({jsonrpc:'2.0',id,error:{code:-32603,message:e.message}});
      console.error('[MCP internal error]',e.stack||e.message);
    }
  }
  const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  input.on('line',line=>{if(!line.trim())return;try{const msg=JSON.parse(line);void receive(msg);}catch(e){console.error('Invalid JSON-RPC input:',e.message);}});
  input.on('close',()=>process.exit(0));
}
