#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'release-evidence', 'pre-upload');
const manifestPath = path.join(outDir, 'upload-manifest.json');
const checksumPath = path.join(outDir, 'upload-manifest.sha256');
const verify = process.argv.includes('--verify');
const ignore = new Set(['node_modules', '.git', 'dist']);
const ignoredFiles = new Set([
  'release-evidence/pre-upload/upload-manifest.json',
  'release-evidence/pre-upload/upload-manifest.sha256'
]);
function sha256(buf){return createHash('sha256').update(buf).digest('hex')}
function walk(dir){
  const out=[];
  for(const name of readdirSync(dir).sort()){
    if(ignore.has(name)) continue;
    const full=path.join(dir,name);
    const rel=path.relative(root,full).replace(/\\/g,'/');
    if(ignoredFiles.has(rel)) continue;
    const st=statSync(full);
    if(st.isDirectory()) out.push(...walk(full));
    else if(st.isFile()) out.push({path:rel, bytes:st.size, sha256:sha256(readFileSync(full))});
  }
  return out;
}
function build(){
  const files=walk(root);
  return { generatedAt:new Date().toISOString(), schema:'mwasalat-upload-manifest/v1', fileCount:files.length, totalBytes:files.reduce((s,f)=>s+f.bytes,0), files };
}
mkdirSync(outDir,{recursive:true});
if(verify){
  if(!existsSync(manifestPath)) throw new Error('upload manifest missing; run npm run generate:upload-manifest first');
  const old=JSON.parse(readFileSync(manifestPath,'utf8'));
  const now=build();
  const byOld=new Map(old.files.map(f=>[f.path,f]));
  const byNow=new Map(now.files.map(f=>[f.path,f]));
  const missing=[]; const changed=[]; const added=[];
  for(const [p,f] of byOld){
    if(!byNow.has(p)) missing.push(p);
    else if(byNow.get(p).sha256!==f.sha256 || byNow.get(p).bytes!==f.bytes) changed.push(p);
  }
  for(const [p] of byNow){ if(!byOld.has(p)) added.push(p); }
  const ok=missing.length===0 && changed.length===0 && added.length===0;
  const result={ok, checkedAt:new Date().toISOString(), diff:{missing,changed,added}, expectedFileCount:old.fileCount, actualFileCount:now.fileCount};
  console.log(JSON.stringify(result,null,2));
  process.exit(ok?0:1);
}
const manifest=build();
const json=JSON.stringify(manifest,null,2)+'\n';
writeFileSync(manifestPath,json);
writeFileSync(checksumPath,sha256(Buffer.from(json))+'  upload-manifest.json\n');
console.log(JSON.stringify({fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,manifestSha256:sha256(Buffer.from(json))},null,2));
