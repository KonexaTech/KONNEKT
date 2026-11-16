// Offline, staging-only packaging. Export/restore SQL and provider Auth must use
// supported owner procedures. This command never connects to a database.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants,openSync,closeSync } from 'node:fs';
import { lstat,readFile,writeFile,readdir,mkdir,mkdtemp,rm,copyFile,chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const PROJECT='oiwtfkgrnpzirghbsvim',FORMAT='konnekt-staging-backup-v1',MAX_BYTES=256*1024*1024;
const REQUIRED=['schema.sql','data.sql','roles.sql','auth.sql','storage-manifest.json','configuration.json'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safePath=path=>typeof path==='string'&&path.length>0&&!path.includes('\\')&&!path.includes('\0')&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!path.includes(':');
async function absent(path){try{await lstat(path);}catch(e){if(e.code==='ENOENT')return;throw e;}throw new Error('Destination already exists; refusing to overwrite it.');}
async function passphrase(file){
 const info=await lstat(file);
 if(!info.isFile()||(info.mode&0o077)!==0)throw new Error('Use an owner-only regular passphrase file (chmod 600).');
 const value=(await readFile(file,'utf8')).replace(/\r?\n$/,'');
 if(value.length<20||/[\r\n\0]/.test(value))throw new Error('Use one private passphrase of at least 20 characters.');
}
async function walk(root,relative=''){
 const results=[];
 for(const name of (await readdir(join(root,relative))).sort()){
  const path=relative?relative+'/'+name:name;if(!safePath(path))throw new Error('Unsupported backup filename.');
  const info=await lstat(join(root,path));
  if(info.isDirectory())results.push(...await walk(root,path));
  else if(info.isFile())results.push(path);else throw new Error('Backup exports cannot contain symlinks or special files.');
 }
 return results;
}
function validate(bundle){
 if(bundle.format!==FORMAT||bundle.projectRef!==PROJECT||!Array.isArray(bundle.files)||bundle.files.length>10000)throw new Error('Not a supported konnekt-staging backup.');
 const files=new Map();let total=0;
 for(const f of bundle.files){
  if(!safePath(f.path)||files.has(f.path)||typeof f.base64!=='string')throw new Error('Invalid or duplicate backup path.');
  const bytes=Buffer.from(f.base64,'base64');total+=bytes.length;
  if(bytes.toString('base64')!==f.base64||bytes.length!==f.bytes||digest(bytes)!==f.sha256||total>MAX_BYTES)throw new Error('Backup content, size or hash verification failed.');
  files.set(f.path,bytes);
 }
 for(const path of REQUIRED)if(!files.get(path)?.length)throw new Error('Backup is missing a required export component.');
 let storage,configuration;
 try{storage=JSON.parse(files.get('storage-manifest.json'));configuration=JSON.parse(files.get('configuration.json'));}catch{throw new Error('Invalid export manifest; contents are not logged.');}
 if(configuration.projectRef!==PROJECT||!Array.isArray(storage))throw new Error('Export configuration must identify the existing staging project.');
 const objects=new Set();
 for(const object of storage){
  if(typeof object.bucket!=='string'||!object.bucket||typeof object.name!=='string'||!object.name||typeof object.file!=='string'||!object.file.startsWith('storage/')||!files.has(object.file))throw new Error('Storage export is missing media bytes.');
  const id=JSON.stringify([object.bucket,object.name]);if(objects.has(id))throw new Error('Duplicate storage object in export.');objects.add(id);
 }
 return files;
}
function gpg(args,passFile,home){
 const fd=openSync(passFile,'r');
 try{execFileSync('gpg',['--homedir',home,'--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd','3',...args],{stdio:['ignore','pipe','pipe',fd]});}
 catch(error){throw new Error('Encrypted backup operation failed: wrong passphrase, damaged archive or unavailable GnuPG. No restore destination was overwritten.',{cause:error});}
 finally{closeSync(fd);}
}
export async function sealStagingBackup({sourceDirectory,archiveFile,passphraseFile}){
 await absent(archiveFile);await passphrase(passphraseFile);
 if(!(await lstat(sourceDirectory)).isDirectory())throw new Error('Select a real export directory.');
 const bundle={format:FORMAT,projectRef:PROJECT,createdAt:new Date().toISOString(),files:[]};let total=0;
 for(const path of await walk(sourceDirectory)){
  const info=await lstat(join(sourceDirectory,path));total+=info.size;
  if(total>MAX_BYTES)throw new Error('This staging bundle supports up to 256 MiB; use a reviewed segmented backup for larger exports.');
  const bytes=await readFile(join(sourceDirectory,path));bundle.files.push({path,bytes:bytes.length,sha256:digest(bytes),base64:bytes.toString('base64')});
 }
 const verifiedFiles=validate(bundle);
 const scratch=await mkdtemp(join(tmpdir(),'konnekt-backup-'));
 try{
  const plain=join(scratch,'bundle.json'),encrypted=join(scratch,'bundle.gpg');
  await writeFile(plain,JSON.stringify(bundle),{mode:0o600});
  gpg(['--symmetric','--cipher-algo','AES256','--output',encrypted,plain],passphraseFile,scratch);
  await copyFile(encrypted,archiveFile,constants.COPYFILE_EXCL);await chmod(archiveFile,0o600);
  return {status:'ENCRYPTED_EXPORT_BUNDLE',fileCount:bundle.files.length,storageObjects:JSON.parse(verifiedFiles.get('storage-manifest.json').toString('utf8')).length};
 }finally{await rm(scratch,{recursive:true,force:true});}
}
export async function openStagingBackup({archiveFile,outputDirectory,passphraseFile}){
 await absent(outputDirectory);await passphrase(passphraseFile);
 const scratch=await mkdtemp(join(tmpdir(),'konnekt-restore-'));let created=false;
 try{
  const plain=join(scratch,'bundle.json');gpg(['--output',plain,'--decrypt',archiveFile],passphraseFile,scratch);
  if((await lstat(plain)).size>Math.ceil(MAX_BYTES*1.5))throw new Error('Backup envelope exceeds the staging restore limit.');
  let bundle;try{bundle=JSON.parse(await readFile(plain,'utf8'));}catch{throw new Error('Invalid decrypted backup format; contents are not logged.');}
  const files=validate(bundle);
  await mkdir(outputDirectory,{mode:0o700});created=true;
  for(const [path,bytes] of files){const target=join(outputDirectory,path);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,bytes,{flag:'wx',mode:0o600});}
  return {status:'VERIFIED_EXPORTS_RESTORED',fileCount:files.size,databaseRestored:false};
 }catch(error){if(created)await rm(outputDirectory,{recursive:true,force:true});throw error;}
 finally{await rm(scratch,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [command,input,output]=process.argv.slice(2);if(!['seal','open'].includes(command)||!input||!output||!process.env.KONNEKT_BACKUP_PASSPHRASE_FILE)throw new Error('Usage: backup-bundle.mjs seal EXPORT_DIRECTORY ARCHIVE.gpg.local | open ARCHIVE.gpg.local NEW_DIRECTORY.local; set KONNEKT_BACKUP_PASSPHRASE_FILE privately.');
  if(!output.endsWith('.local'))throw new Error('Use an ignored private .local output path outside shared/public storage.');
  const result=command==='seal'?await sealStagingBackup({sourceDirectory:input,archiveFile:output,passphraseFile:process.env.KONNEKT_BACKUP_PASSPHRASE_FILE}):await openStagingBackup({archiveFile:input,outputDirectory:output,passphraseFile:process.env.KONNEKT_BACKUP_PASSPHRASE_FILE});
  console.log(JSON.stringify(result));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
