// Bootstrap is explicit and runs once only against an empty, nonce-owned NEW DB.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {readPrivateArtifact,validateLocalSurfaceArtifact,verifyLocalSurfaceSource,verifyLocalSurfaceDatabase} from './helpers/localPlatformSurfaceGuard.mjs';
import {installLocalDemoNetworkGuard} from './helpers/localDemoNetworkGuard.mjs';import {assertLocalDemoProvidersEmpty} from './helpers/localDemoProviderConfiguration.mjs';
import {bootstrapFreshSurfaceFixture} from './helpers/localPlatformSurfaceFixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const require=createRequire(import.meta.url);
if(!process.argv[2])throw new Error('Private local surface artifact required.');
const artifact=readPrivateArtifact(process.argv[2],root);const identity=validateLocalSurfaceArtifact(artifact);verifyLocalSurfaceSource(root,artifact.sourceManifest,artifact.manifestSha256);
const filename=path.resolve(artifact.fixtureCredentialsPath || '');
const realParent=fs.realpathSync(path.dirname(filename));
if(!artifact.fixtureCredentialsPath || filename.startsWith(root+path.sep) || realParent===root || realParent.startsWith(root+path.sep) || !/^[a-z0-9_]{4,18}$/.test(artifact.fixtureTag || ''))throw new Error('New private credential path and explicit fixture tag required.');
const fd=fs.openSync(filename,'wx',0o600);let privateResult={state:'preparing',profile:identity.profile};
function writePrivate(value){const text=JSON.stringify(value,null,2)+'\n';fs.ftruncateSync(fd,0);fs.writeSync(fd,text,0,'utf8');fs.fsyncSync(fd);}
writePrivate(privateResult);Object.assign(process.env,artifact.env);installLocalDemoNetworkGuard();
const env=require('../backend/src/config/env.js');assertLocalDemoProvidersEmpty(env);
if(env.databaseUrl!==artifact.env.DATABASE_URL || env.localApiProfile!==identity.profile || env.jwtSecret!==artifact.env.JWT_SECRET || env.csrfSecret!==artifact.env.CSRF_SECRET || env.developerApiKeyPepper!==artifact.env.DEVELOPER_API_KEY_PEPPER)throw new Error('Effective bootstrap configuration mismatch.');
const db=require('../backend/src/config/db.js');
try {
 const client=await db.pool.connect();try{await verifyLocalSurfaceDatabase(client,identity);}finally{client.release();}
 const result=await db.withTransaction(client=>bootstrapFreshSurfaceFixture({profile:identity.profile,tag:artifact.fixtureTag,password:crypto.randomBytes(30).toString('base64url'),client,
  dependencies:{users:require('../backend/src/repositories/users.js'),accounts:require('../backend/src/repositories/developerAccounts.js'),projects:require('../backend/src/repositories/developerProjects.js'),keys:require('../backend/src/services/developerApiKeyService.js'),security:require('../backend/src/services/securityEventService.js'),hashPassword:value=>require('../backend/node_modules/bcryptjs').hash(value,10)},
  recordPrepared:async value=>{privateResult={state:'prepared',...value};writePrivate(privateResult);}
 }));
 writePrivate({state:'committed',...result});console.log(`Local ${identity.profile} bootstrap complete; credentials remain private; no retained identities changed.`);
}catch{writePrivate({...privateResult,state:'failed'});console.error('Local fixture bootstrap failed; inspect the private custody artifact.');process.exitCode=1;}finally{fs.closeSync(fd);await db.pool.end();}
