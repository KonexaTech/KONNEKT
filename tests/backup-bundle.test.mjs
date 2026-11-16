import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,stat,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealStagingBackup,openStagingBackup } from '../scripts/ops/backup-bundle.mjs';
import { PGlite } from '@electric-sql/pglite';
const projectRef='oiwtfkgrnpzirghbsvim';

test('encrypted staging export restores SQL and exact media bytes; wrong passphrase, damaged archive, existing target and missing media fail safely',async()=>{
 const root=await mkdtemp(join(tmpdir(),'konnekt-backup-test-'));const source=join(root,'exports');
 const pass=join(root,'passphrase.local'),wrong=join(root,'wrong.local'),archive=join(root,'backup.gpg.local');
 try{
  await mkdir(join(source,'storage'),{recursive:true,mode:0o700});
  await writeFile(pass,'disposable fixture passphrase only\n',{mode:0o600});await writeFile(wrong,'different disposable fixture passphrase\n',{mode:0o600});
  const content={
   'schema.sql':'create table fixture_messages(id integer primary key,body text);',
   'data.sql':"insert into fixture_messages values(1,'fixture encrypted message bytes');",
   'roles.sql':'-- disposable role fixture; not a provider export',
   'auth.sql':'-- disposable Auth fixture; no real identities',
   'configuration.json':JSON.stringify({projectRef,fixtureOnly:true}),
   'storage-manifest.json':JSON.stringify([{bucket:'private',name:'chat/user/file.enc',file:'storage/file.enc'}]),
   'storage/file.enc':Buffer.from([0,255,17,92,33,1,0]),
  };
  for(const [path,bytes] of Object.entries(content))await writeFile(join(source,path),bytes,{mode:0o600});
  const sealed=await sealStagingBackup({sourceDirectory:source,archiveFile:archive,passphraseFile:pass});assert.equal(sealed.storageObjects,1);assert.equal((await stat(archive)).mode&0o777,0o600);
  assert(!(await readFile(archive)).includes(Buffer.from('fixture encrypted message bytes')));
  const badTarget=join(root,'bad.local');await assert.rejects(openStagingBackup({archiveFile:archive,outputDirectory:badTarget,passphraseFile:wrong}),/wrong passphrase/);await assert.rejects(stat(badTarget),/ENOENT/);
  const target=join(root,'restored.local');const restored=await openStagingBackup({archiveFile:archive,outputDirectory:target,passphraseFile:pass});assert.equal(restored.databaseRestored,false);
  for(const [path,bytes] of Object.entries(content))assert.deepEqual(await readFile(join(target,path)),Buffer.from(bytes));
  const db=new PGlite();try{await db.exec(await readFile(join(target,'schema.sql'),'utf8'));await db.exec(await readFile(join(target,'data.sql'),'utf8'));assert.equal((await db.query('select body from fixture_messages where id=1')).rows[0].body,'fixture encrypted message bytes');}finally{await db.close();}
  await assert.rejects(openStagingBackup({archiveFile:archive,outputDirectory:target,passphraseFile:pass}),/already exists/);
  const damaged=join(root,'damaged.gpg.local');const data=await readFile(archive);await writeFile(damaged,data.subarray(0,Math.floor(data.length/2)));
  await assert.rejects(openStagingBackup({archiveFile:damaged,outputDirectory:join(root,'damaged.local'),passphraseFile:pass}),/damaged archive/);
  await rm(join(source,'storage/file.enc'));await assert.rejects(sealStagingBackup({sourceDirectory:source,archiveFile:join(root,'missing.local'),passphraseFile:pass}),/missing media/);
  await symlink(pass,join(source,'private-link'));await assert.rejects(sealStagingBackup({sourceDirectory:source,archiveFile:join(root,'symlink.local'),passphraseFile:pass}),/symlink/);
 }finally{await rm(root,{recursive:true,force:true});}
});
