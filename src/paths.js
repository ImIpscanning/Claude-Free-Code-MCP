import fs from 'node:fs/promises';
import path from 'node:path';

const prohibitedSegments = new Set(['.git']);

/** Resolve a relative workspace path. No absolute paths, traversal, or symlink components. */
export async function resolvePath(root, relative = '.', { writing = false, allowRoot = true } = {}) {
  if (typeof relative !== 'string' || relative.includes('\0') || relative.length > 4096) throw new Error('Invalid path');
  if (path.isAbsolute(relative) || path.win32.isAbsolute(relative)) throw new Error('Absolute paths are not allowed');
  const resolved = path.resolve(root, relative);
  const inside = resolved === root || resolved.startsWith(root + path.sep);
  if (!inside || (!allowRoot && resolved === root)) throw new Error('Path outside workspace or root not allowed');
  const segments = path.relative(root, resolved).split(path.sep).filter(Boolean);
  if (writing && segments.some(s => prohibitedSegments.has(s.toLowerCase()))) throw new Error('Editing .git internals is blocked; use Git tools');
  let p = root;
  for (const segment of segments) {
    p = path.join(p, segment);
    try {
      const st = await fs.lstat(p);
      if (st.isSymbolicLink()) throw new Error(`Symlink paths are blocked: ${relative}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return resolved;
}

export function toRel(root, abs) { return path.relative(root, abs).split(path.sep).join('/') || '.'; }

export const IGNORE_DIRS = new Set(['.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', 'target', '.venv', 'venv', '.cache', '.turbo', '.gradle', 'coverage']);

export async function walk(root, start = '.', opts = {}) {
  const maxEntries = Math.min(opts.maxEntries ?? 1200, 2000);
  const maxDepth = Math.min(opts.maxDepth ?? 12, 30);
  const base = await resolvePath(root, start);
  const items = [];
  const stack = [{ dir: base, depth: 0 }];
  while (stack.length && items.length < maxEntries) {
    const {dir, depth} = stack.pop();
    let entries;
    try { entries = await fs.readdir(dir, {withFileTypes:true}); }
    catch (e) { if (e.code === 'EACCES') continue; throw e; }
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for (const e of entries) {
      if (items.length >= maxEntries) break;
      if (e.isSymbolicLink()) continue;
      if (!opts.hidden && e.name.startsWith('.')) continue;
      if (e.isDirectory() && !opts.includeIgnored && IGNORE_DIRS.has(e.name)) continue;
      const abs = path.join(dir,e.name);
      const rel = toRel(root,abs);
      items.push({path:rel, type:e.isDirectory()?'directory':e.isFile()?'file':'other', depth:depth+1});
      if (e.isDirectory() && depth < maxDepth && !rel.includes('/.git/')) stack.push({dir:abs,depth:depth+1});
    }
  }
  return {items, truncated: stack.length>0 || items.length>=maxEntries};
}

export async function readTextLimited(file, maxSize) {
  const st = await fs.stat(file);
  if (!st.isFile()) throw new Error('Not a regular file');
  if (st.size > maxSize) throw new Error(`File too large (${st.size} bytes, maximum ${maxSize})`);
  const bytes = await fs.readFile(file);
  if (bytes.includes(0)) throw new Error('Binary file is not supported by text tools');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  return {text,bytes:bytes.length};
}
