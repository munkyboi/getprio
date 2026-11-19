/** One-shot fresh fixture bootstrap; never run against a retained or production database. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readPrivateArtifact,validateLocalSurfaceArtifact,verifyLocalSurfaceSource,verifyLocalSurfaceDatabase} from './helpers/localPlatformSurfaceGuard.mjs';
import {installLocalDemoNetworkGuard} from './helpers/localDemoNetworkGuard.mjs';
import {assertLocalDemoProvidersEmpty} from './helpers/localDemoProviderConfiguration.mjs';
export function assertQueueTypeFixtureTarget(artifact) {
 const identity=validateLocalSurfaceArtifact(artifact);
 if(identity.topology!=='queue_type_qa_20261026'||identity.profile!=='core'||!/^qt_[a-z0-9_]{4,14}$/.test(artifact.fixtureTag||''))throw new Error('Explicit fresh queue-type QA target required.');
 const secrets=[artifact.env.JWT_SECRET,artifact.env.CSRF_SECRET,artifact.env.DEVELOPER_API_KEY_PEPPER,artifact.env.MFA_ENCRYPTION_SECRET,artifact.env.MFA_RECOVERY_PEPPER];
 if(secrets.some(value=>typeof value!=="string"||value.length<32)||new Set(secrets).size!==secrets.length)throw new Error('Distinct fresh local auth and MFA secrets required.');
 return identity;
}
export async function bootstrapQueueTypeFixtures({artifact,client,dependencies:d,recordPrepared}) {
 const identity=assertQueueTypeFixtureTarget(artifact);
 await verifyLocalSurfaceDatabase(client,identity);
 await client.query('LOCK TABLE users,tenants,developer_accounts,developer_projects,developer_api_keys IN SHARE ROW EXCLUSIVE MODE');
 const counts=(await client.query(`SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM tenants)::int tenants,
 (SELECT count(*) FROM developer_accounts)::int accounts,(SELECT count(*) FROM developer_projects)::int projects,(SELECT count(*) FROM developer_api_keys)::int keys`)).rows[0];
 if(!counts||['users','tenants','accounts','projects','keys'].some(key=>Number(counts[key])!==0))throw new Error('Fresh empty isolated identity/domain tables required.');
 const fixtures=[];
 for(const planSlug of ['free','economical','pro',null]){
  const role=planSlug?'vendor':'platform_admin',suffix=planSlug||'admin';
  const username=`${artifact.fixtureTag}_${suffix}`;
  const password=d.password(),totpSecret=d.mfa.createTotpSecret();
  const user=await d.users.createUser({name:`Queue Type QA ${suffix}`,username,email:`${username}@example.invalid`,emailVerified:true,passwordHash:await d.hashPassword(password),passwordHashAlgorithm:'bcrypt',roles:[role],lastLoginProvider:'password'},{client});
  const factor=await d.factors.replacePendingTotpFactor(user._id,d.mfa.encryptSecret(totpSecret,d.mfaEncryptionSecret),{client});
  await d.factors.activateFactor(factor._id,{client});
  await d.users.updateUser(user._id,{mfaEnabled:true,mfaRequired:true},{client});
  const fixture={username,password,totpSecret,userId:String(user._id),role,planSlug};
  if(planSlug){
   const plan=await d.plans.findPlanBySlug(planSlug,{client});if(!plan)throw new Error('Required local plan defaults missing.');
   const tenant=await d.tenants.createTenant({name:`Queue Type QA ${suffix}`,slug:`${artifact.fixtureTag}-${suffix}`.replaceAll('_','-'),publicProfileEnabled:false,businessCategoryId:null},{client});
   await d.users.addTenantMembership(user._id,tenant._id,'owner',{client});
   await d.billing.createTenantSubscription({tenantId:String(tenant._id),planSlug,status:'active',provider:'manual',billingInterval:'monthly',currentPeriodStart:new Date(),currentPeriodEnd:new Date(Date.now()+30*86400000),entitlements:plan.entitlements,entitlementModelVersion:2,metadata:{fixtureTag:artifact.fixtureTag,localOnly:true}},{client});
   Object.assign(fixture,{tenantId:String(tenant._id),tenantSlug:tenant.slug,locationSlug:'main'});
  }
  await d.security.logSecurityEvent({userId:user._id,eventType:'local_queue_type_fixture_created',actorRole:role,metadata:{fixtureTag:artifact.fixtureTag,localOnly:true}},{client});
  fixtures.push(fixture);await recordPrepared({state:'prepared',tag:artifact.fixtureTag,fixtures});
 }
 return {state:'committed',tag:artifact.fixtureTag,fixtures};
}
export async function main(filename) {
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
 const artifact=readPrivateArtifact(filename,root);assertQueueTypeFixtureTarget(artifact);verifyLocalSurfaceSource(root,artifact.sourceManifest,artifact.manifestSha256);
 const output=artifact.fixtureCredentialsPath;
 if(typeof output!=='string'||!path.isAbsolute(output)||fs.realpathSync(path.dirname(output)).startsWith(root+path.sep)||path.dirname(output)===root)throw new Error('New private credential path outside source required.');
 const fd=fs.openSync(output,'wx',0o600);const write=value=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(value,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
 write({state:'preparing'});Object.assign(process.env,artifact.env);installLocalDemoNetworkGuard();
 let db;
 try{
  const env=require('../backend/src/config/env.js');assertLocalDemoProvidersEmpty(env);
  if(env.databaseUrl!==artifact.env.DATABASE_URL||env.localApiProfile!=='core'||env.mfaEncryptionSecret!==artifact.env.MFA_ENCRYPTION_SECRET||env.mfaRecoveryPepper!==artifact.env.MFA_RECOVERY_PEPPER)throw new Error('Effective fixture target mismatch.');
  db=require('../backend/src/config/db.js');
  const result=await db.withTransaction(client=>bootstrapQueueTypeFixtures({artifact,client,recordPrepared:write,dependencies:{
   users:require('../backend/src/repositories/users.js'),tenants:require('../backend/src/repositories/tenants.js'),plans:require('../backend/src/repositories/subscriptionPlans.js'),billing:require('../backend/src/repositories/billing.js'),factors:require('../backend/src/repositories/mfa.js'),mfa:require('../backend/src/services/mfaService.js'),security:require('../backend/src/services/securityEventService.js'),mfaEncryptionSecret:env.mfaEncryptionSecret,password:()=>crypto.randomBytes(30).toString('base64url'),hashPassword:value=>require('../backend/node_modules/bcryptjs').hash(value,10)
  }}));
  write(result);console.log('Fresh isolated queue-type fixtures created; credentials remain in private custody.');
 }catch(error){write({state:'failed'});throw new Error('Queue-type fixture bootstrap failed; retained targets were not authorized.');}
 finally{fs.closeSync(fd);await db?.pool.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){main(process.argv[2]).catch(()=>{console.error('Queue-type fixture bootstrap failed.');process.exitCode=1;});}
