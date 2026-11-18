import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.js';

export const ALLOWED_COMMANDS = Object.freeze(['node','npm','git','python','python3','java','javac','mvn','gradle','go','cargo','rustc','dotnet','tsc','gh','powershell','pwsh','cmd','bash','sh']);

function npmOnWindows() {
  const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),path.join(path.dirname(process.execPath),'..','node_modules','npm','bin','npm-cli.js')];
  return candidates.find(p=>p && p.endsWith('.js') && fs.existsSync(p));
}

function normalizeCommand(cmd, args) {
  if (process.platform==='win32' && cmd==='npm') {
    const cli=npmOnWindows();
    if (!cli) throw new Error('npm-cli.js not found. Run from a Node.js installation with npm.');
    return [process.execPath,[cli,...args]];
  }
  // Windows cmd.exe supports arguments through /c but is never invoked implicitly.
  if (process.platform==='win32' && ['mvn','gradle','tsc'].includes(cmd)) {
    throw new Error(`${cmd} .cmd wrappers require a custom setup; use a Node/Java entrypoint or a manually approved cmd command.`);
  }
  return [cmd,args];
}

export async function runProcess({command,args=[],cwd,timeoutSeconds=60,outputBytes=LIMITS.outputBytes}) {
  if (!ALLOWED_COMMANDS.includes(command)) throw new Error('Executable not in allowlist');
  if (!Array.isArray(args) || args.length > LIMITS.maxArgs || args.some(x=>typeof x!=='string'||x.length>4000||x.includes('\0'))) throw new Error('Invalid argument array');
  if (!Number.isInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>180) throw new Error('Timeout must be 1..180 seconds');
  const [program,finalArgs]=normalizeCommand(command,args);
  return new Promise(resolve=>{
    let stdout='',stderr='',truncated=false,timedOut=false,settled=false;
    const started=Date.now();
    const proc=spawn(program,finalArgs,{cwd,shell:false,windowsHide:true,env:{...process.env,CI:'true',NO_COLOR:'1'}});
    const append=(key,chunk)=>{
      const data=chunk.toString('utf8');
      const current=key==='stdout'?stdout:stderr;
      const remain=outputBytes-Buffer.byteLength(stdout)-Buffer.byteLength(stderr);
      if(remain<=0) {truncated=true; return;}
      const slice=Buffer.from(data).subarray(0,remain).toString('utf8');
      if(key==='stdout') stdout=current+slice; else stderr=current+slice;
      if(slice.length<data.length) truncated=true;
    };
    proc.stdout?.on('data',b=>append('stdout',b));
    proc.stderr?.on('data',b=>append('stderr',b));
    const timer=setTimeout(()=>{timedOut=true;proc.kill('SIGTERM');setTimeout(()=>proc.kill('SIGKILL'),1500).unref();},timeoutSeconds*1000); timer.unref();
    function finish(result){if(settled)return;settled=true;clearTimeout(timer);resolve({command,args,elapsedMs:Date.now()-started,stdout,stderr,truncated,timedOut,...result});}
    proc.on('error',err=>finish({exitCode:null,error:err.message}));
    proc.on('close',(code,signal)=>finish({exitCode:code,signal:signal||null}));
  });
}

export const TASKS = Object.freeze({
  test:{command:'npm',args:['test']},
  build:{command:'npm',args:['run','build']},
  lint:{command:'npm',args:['run','lint']},
  format:{command:'npm',args:['run','format']},
  typecheck:{command:'npm',args:['run','typecheck']},
  'git-status':{command:'git',args:['status','--short','--branch']},
  'git-diff':{command:'git',args:['diff','--']},
});

export const isReadOnlyTask = task => task==='git-status'||task==='git-diff';
