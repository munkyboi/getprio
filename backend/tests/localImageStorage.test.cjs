require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const {
  createLocalImageStorage,
  rootFor,
} = require("../src/services/localImageStorage");
const adminUrl = process.env.LOCAL_POOL_READ_TEST_ADMIN_URL;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
test(
  "guarded local images persist actual bytes with public/private and actor boundaries",
  { skip: !adminUrl },
  async (t) => {
    const adminTarget = new URL(adminUrl);
    assert.equal(adminTarget.hostname, "127.0.0.1");
    assert.ok(["/postgres", "/getprio_test"].includes(adminTarget.pathname));
    const name = `getprio_local_pool_demo_${randomUUID().replaceAll("-", "")}`;
    const target = new URL(adminUrl);
    target.pathname = `/${name}`;
    const admin = new Pool({ connectionString: adminUrl });
    let pool;
    const keys = [
      "DATABASE_URL",
      "NODE_ENV",
      "LOCAL_POOL_DEMO_ENABLED",
      "LOCAL_IMAGE_STORAGE_ENABLED",
      "SERVER_URL",
    ];
    const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const root = rootFor(name);
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      pool = new Pool({ connectionString: target.href });
      Object.assign(process.env, {
        DATABASE_URL: target.href,
        NODE_ENV: "test",
        LOCAL_POOL_DEMO_ENABLED: "1",
        LOCAL_IMAGE_STORAGE_ENABLED: "1",
        SERVER_URL: "http://127.0.0.1:5007",
      });
      await pool.query(`CREATE TABLE store_locations(id bigint,tenant_id bigint,slug text);
   CREATE TABLE local_pool_demo_scopes(tenant_id bigint,location_id bigint,fixture_key text);
   CREATE TABLE users(id bigint,deletion_requested_at timestamptz,platform_access_suspended_at timestamptz);
   CREATE TABLE tenant_memberships(user_id bigint,tenant_id bigint,is_active boolean);
   CREATE TABLE bookings(id bigint,tenant_id bigint,location_id bigint,customer_user_id bigint,payment_proof_object_key text);
   INSERT INTO store_locations VALUES(10,1,'courts'),(20,2,'other');
   INSERT INTO local_pool_demo_scopes VALUES(1,10,'four-court-v1');
   INSERT INTO users VALUES(5,NULL,NULL),(6,NULL,NULL),(8,NULL,NULL);
   INSERT INTO tenant_memberships VALUES(5,1,TRUE),(6,2,TRUE);
   INSERT INTO bookings VALUES(7,1,10,5,NULL),(8,1,10,8,NULL);`);
      let limit = 200 * 1024;
      const storage = createLocalImageStorage({
        pool,
        assertSize: async (size) => {
          if (size < 1 || size > limit)
            throw Object.assign(new Error("Image too large"), {
              statusCode: 400,
            });
        },
      });
      const input = {
        tenant: { _id: "1" },
        location: { _id: "10", slug: "courts" },
        contentType: "image/png",
        body: png,
      };
      let asset;
      await t.test(
        "public location and tenant-default assets persist across adapter instances",
        async () => {
          asset = await storage.store(input);
          const id = asset.publicUrl.split("/").at(-1);
          assert.deepEqual((await storage.read(id)).body, png);
          assert.deepEqual(
            (await createLocalImageStorage({ pool }).read(id)).body,
            png,
          );
          assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
          assert.equal(
            (await fs.stat(path.join(root, `${id}.image`))).mode & 0o777,
            0o600,
          );
          const tenantAsset = await storage.store({ ...input, location: null });
          assert.ok(tenantAsset.publicUrl);
        },
      );
      await t.test(
        "off, production, wrong DB, missing marker, wrong location and invalid bytes fail closed",
        async () => {
          process.env.LOCAL_IMAGE_STORAGE_ENABLED = "0";
          assert.equal(await storage.store(input), null);
          process.env.LOCAL_IMAGE_STORAGE_ENABLED = "1";
          process.env.NODE_ENV = "production";
          assert.equal(await storage.store(input), null);
          process.env.NODE_ENV = "test";
          process.env.DATABASE_URL = target.href.replace(
            name,
            "getprio_local_pool_demo_other",
          );
          await assert.rejects(storage.store(input), { statusCode: 503 });
          process.env.DATABASE_URL = target.href;
          await assert.rejects(
            storage.store({
              ...input,
              tenant: { _id: "2" },
              location: { slug: "other" },
            }),
            { statusCode: 503 },
          );
          await assert.rejects(
            storage.store({ ...input, location: { slug: "invented" } }),
            { statusCode: 503 },
          );
          await assert.rejects(
            storage.store({ ...input, body: Buffer.from("<svg>") }),
            { statusCode: 400 },
          );
          limit = 1;
          await assert.rejects(storage.store(input), { statusCode: 400 });
          limit = 200 * 1024;
          process.env.SERVER_URL = "https://example.com";
          await assert.rejects(storage.store(input), { statusCode: 503 });
          process.env.SERVER_URL = "http://127.0.0.1:5007";
        },
      );
      await t.test(
        "avatar requires current fixture membership and deleted/suspended actors lose image access",
        async () => {
          const avatar = await storage.store({
            user: { _id: "5" },
            contentType: "image/png",
            body: png,
          });
          const id = avatar.publicUrl.split("/").at(-1);
          assert.deepEqual((await storage.read(id)).body, png);
          await assert.rejects(
            storage.store({
              user: { _id: "6" },
              contentType: "image/png",
              body: png,
            }),
            { statusCode: 503 },
          );
          await pool.query(
            "UPDATE users SET deletion_requested_at=now() WHERE id=5",
          );
          await assert.rejects(storage.read(id));
          await assert.rejects(
            storage.store({
              user: { _id: "5" },
              contentType: "image/png",
              body: png,
            }),
          );
          await pool.query(
            "UPDATE users SET deletion_requested_at=NULL WHERE id=5; UPDATE tenant_memberships SET is_active=FALSE WHERE user_id=5",
          );
          assert.deepEqual((await storage.read(id)).body, png);
          await pool.query("UPDATE bookings SET customer_user_id=8 WHERE id=7");
          await assert.rejects(storage.read(id));
          await pool.query(
            "UPDATE bookings SET customer_user_id=5 WHERE id=7; UPDATE tenant_memberships SET is_active=TRUE WHERE user_id=5",
          );
        },
      );
      await t.test(
        "fixture customer avatar works without vendor membership and unexpected storage errors are sanitized",
        async () => {
          const avatar = await storage.store({
            user: { _id: "8" },
            contentType: "image/png",
            body: png,
          });
          assert.ok(avatar.publicUrl);
          const broken = createLocalImageStorage({
            pool: {
              connect: async () => {
                throw new Error("secret /tmp/path database failure");
              },
            },
            assertSize: async () => {},
          });
          await assert.rejects(
            broken.store(input),
            (error) =>
              error.statusCode === 503 &&
              error.code === "IMAGE_UPLOAD_UNAVAILABLE" &&
              !error.message.includes("secret"),
          );
        },
      );
      await t.test(
        "proof stays private before and after submit; only valid current saved booking capability reads bytes",
        async () => {
          const booking = {
            _id: "7",
            tenantId: "1",
            locationId: "10",
            customerUserId: "5",
            paymentProofObjectKey:
              "payment-proofs/tenants/1/bookings/7/proof.png",
          };
          const proof = await storage.store({
            booking,
            objectKey: booking.paymentProofObjectKey,
            contentType: "image/png",
            body: png,
          });
          assert.equal(proof.publicUrl, null);
          const { createHash } = require("node:crypto");
          const id = createHash("sha256")
            .update(proof.objectKey)
            .digest("hex")
            .slice(0, 48);
          await assert.rejects(storage.read(id), { statusCode: 404 });
          await assert.rejects(storage.proofAccess(booking), {
            statusCode: 404,
          });
          await pool.query(
            "UPDATE bookings SET payment_proof_object_key=$1 WHERE id=7",
            [proof.objectKey],
          );
          const url = new URL(await storage.proofAccess(booking));
          const access = Object.fromEntries(url.searchParams);
          assert.deepEqual((await storage.read(id, access)).body, png);
          await assert.rejects(
            storage.read(id, { ...access, signature: "0".repeat(64) }),
            { statusCode: 404 },
          );
          await assert.rejects(
            storage.read(id, { ...access, expires: String(Date.now() - 1000) }),
            { statusCode: 404 },
          );
          await assert.rejects(
            createLocalImageStorage({ pool }).read(id, access),
            { statusCode: 404 },
          );
          await assert.rejects(
            storage.store({
              booking: { ...booking, customerUserId: "6" },
              objectKey: "bad",
              contentType: "image/png",
              body: png,
            }),
            { statusCode: 503 },
          );
          await pool.query(
            "UPDATE bookings SET payment_proof_object_key=NULL WHERE id=7",
          );
          await assert.rejects(storage.read(id, access), { statusCode: 404 });
        },
      );
      await t.test(
        "actual loopback HTTP public reader cannot expose private proof, signed reader rejects tampering",
        async () => {
          const express = require("express");
          const {
            createLocalImageRouter,
          } = require("../src/routes/localImageRoutes");
          const app = express();
          app.use(
            "/api/local-image-assets",
            createLocalImageRouter({ read: storage.read }),
          );
          app.use((error, req, res, next) =>
            res
              .status(error.statusCode || 500)
              .json({ message: error.message }),
          );
          const server = await new Promise((resolve) => {
            const instance = app.listen(0, "127.0.0.1", () =>
              resolve(instance),
            );
          });
          const origin = `http://127.0.0.1:${server.address().port}`;
          try {
            const response = await fetch(
              `${origin}${new URL(asset.publicUrl).pathname}`,
            );
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.equal(
              response.headers.get("cross-origin-resource-policy"),
              "cross-origin",
            );
            assert.equal(response.headers.get("content-security-policy"), null);
            assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
            const booking = {
              _id: "7",
              paymentProofObjectKey:
                "payment-proofs/tenants/1/bookings/7/proof.png",
            };
            await pool.query(
              "UPDATE bookings SET payment_proof_object_key=$1 WHERE id=7",
              [booking.paymentProofObjectKey],
            );
            const url = new URL(await storage.proofAccess(booking)),
              id = url.pathname.split("/").at(-1);
            assert.equal(
              (await fetch(`${origin}/api/local-image-assets/${id}`)).status,
              404,
            );
            assert.equal(
              (await fetch(`${origin}${url.pathname}${url.search}`)).status,
              200,
            );
            assert.equal((await fetch(`${origin}${url.pathname}`)).status, 404);
            process.env.LOCAL_IMAGE_STORAGE_ENABLED = "0";
            assert.equal(
              (await fetch(`${origin}${new URL(asset.publicUrl).pathname}`))
                .status,
              404,
            );
            process.env.LOCAL_IMAGE_STORAGE_ENABLED = "1";
          } finally {
            await new Promise((resolve) => server.close(resolve));
          }
        },
      );
      await t.test(
        "tamper, symlinks and removed fixture marker deny reads",
        async () => {
          const id = asset.publicUrl.split("/").at(-1),
            file = path.join(root, `${id}.image`);
          await fs.writeFile(file, Buffer.concat([png, Buffer.from("tamper")]));
          await assert.rejects(storage.read(id), { statusCode: 404 });
          await fs.unlink(file);
          await fs.symlink("/etc/hosts", file);
          await assert.rejects(storage.read(id), { statusCode: 404 });
          await fs.unlink(file);
          const fresh = await storage.store(input);
          await pool.query("DELETE FROM local_pool_demo_scopes");
          await assert.rejects(
            storage.read(fresh.publicUrl.split("/").at(-1)),
            { statusCode: 404 },
          );
          await assert.rejects(storage.store(input), { statusCode: 503 });
        },
      );
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
      await fs.rm(root, { recursive: true, force: true });
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  },
);

test('dedicated QR draft scope stores real bytes for same-tenant new/unmarked location without relaxing generic image guard',async()=>{
 const {runInNewContext}=require('node:vm'),{createRequire}=require('node:module');
 const file=require.resolve('../src/services/localImageStorage'),real=createRequire(file);
 const name=`getprio_local_pool_demo_qr_unit_${randomUUID().replaceAll('-','')}`;
 const state={anchors:[{tenant_id:'1',location_id:'10'}],authorized:true,marker:true,transaction:false,authChecks:0,queries:[]};
 const client={query:async(sql,args)=>{state.queries.push({sql,args});if(sql==='BEGIN READ ONLY'){state.transaction=true;return {rows:[]};}if(sql==='COMMIT'||sql==='ROLLBACK'){state.transaction=false;return {rows:[]};}
  if(sql.includes('SELECT s.tenant_id::text,s.location_id::text'))return {rows:state.anchors};
  if(sql.startsWith('SELECT id FROM store_locations'))return {rows:args[0]==='1'&&args[1]==='11'&&args[2]==='new-mandaue'?[{id:'11'}]:[]};
  if(sql.includes('SELECT l.tenant_id::text'))return {rows:[]};
  throw Error('Unexpected query');},release:()=>{}};
 const module={exports:{}};
 runInNewContext(await fs.readFile(file,'utf8'),{module,exports:module.exports,Buffer,URL,process:{env:{LOCAL_IMAGE_STORAGE_ENABLED:'1',SERVER_URL:'http://127.0.0.1:5009'},getuid:()=>process.getuid()},require:dep=>dep==='./localPoolDemoScope'?{localPoolDemoConfiguration:()=>({databaseName:name}),readLocalPoolDemoScope:async(_client,scope)=>state.marker&&scope.tenantId==='1'&&scope.locationId==='10'}:dep==='./imageUploadPolicy'?{assertImageUploadSize:async()=>{}}:dep==='./vendorQueueTransactionService'?{readAuthorizedVendorQueueActor:async(_client,scope,permission)=>{assert.equal(state.transaction,true);assert.equal(permission,'tenant.location.manage');assert.equal(scope.tenantId,'1');assert.equal(scope.locationId,'10');assert.equal(scope.actorUserId,'5');state.authChecks++;return state.authorized?{tenantMemberships:[{role:'owner'}]}:null;}}:real(dep)},{filename:file});
 const storage=module.exports.createLocalImageStorage({pool:{connect:async()=>client},assertSize:async()=>{}});
 const root=module.exports.rootFor(name);const input={tenant:{_id:'1'},location:{slug:'new-mandaue'},actorUserId:'5',contentType:'image/png',body:png};
 try{
  // The old/generic seam still rejects an unsaved slug. The dedicated path is
  // narrower in purpose and separately revalidates location-management access.
  await assert.rejects(storage.store(input),{statusCode:503});
  const asset=await storage.storePaymentQr(input);assert.equal(state.authChecks,1);assert.ok(asset.publicUrl.startsWith('http://127.0.0.1:5009/api/local-image-assets/'));
  const id=asset.publicUrl.split('/').at(-1),metadata=JSON.parse(await fs.readFile(path.join(root,`${id}.json`),'utf8'));
  assert.equal(metadata.tenantId,'1');assert.equal(metadata.locationId,'10');assert.equal(metadata.assetPurpose,'location-payment-qr');assert.equal(metadata.requestedLocationSlug,'new-mandaue');assert.equal(metadata.visibility,'public');
  assert.deepEqual(Buffer.from((await storage.read(id)).body),png);
  const metadataFile=path.join(root,`${id}.json`);
  const {assetPurpose,requestedLocationSlug,...legacyMetadata}=metadata;
  await fs.writeFile(metadataFile,JSON.stringify(legacyMetadata));
  assert.deepEqual(Buffer.from((await storage.read(id)).body),png);
  for(const malformed of [
    {...metadata,assetPurpose:'other-purpose'},
    {...legacyMetadata,requestedLocationSlug},
    {...legacyMetadata,assetPurpose},
    {...metadata,requestedLocationSlug:null},
    {...metadata,requestedLocationSlug:123},
    {...metadata,requestedLocationSlug:''},
    {...metadata,requestedLocationSlug:'../foreign'},
    {...metadata,requestedLocationSlug:'Uppercase'},
    {...metadata,requestedLocationSlug:'a'.repeat(161)},
    {...metadata,visibility:'private'},
  ]){
    await fs.writeFile(metadataFile,JSON.stringify(malformed));
    await assert.rejects(storage.read(id),{statusCode:404});
  }
  await fs.writeFile(metadataFile,JSON.stringify(metadata));
  assert.deepEqual(Buffer.from((await storage.read(id)).body),png);
  const existing=await storage.storePaymentQr({...input,location:{_id:'11',slug:'new-mandaue'}});assert.ok(existing.publicUrl);assert.equal(state.authChecks,2);
  await assert.rejects(storage.storePaymentQr({...input,tenant:{_id:'2'}}),{statusCode:503});
  await assert.rejects(storage.storePaymentQr({...input,location:{_id:'99',slug:'foreign'}}),{statusCode:503});
  for(const bad of [{actorUserId:null},{location:{slug:'../bad'}},{location:{slug:''}},{booking:{_id:'8'}},{user:{_id:'5'}},{objectKey:'proof'}])await assert.rejects(storage.storePaymentQr({...input,...bad}),{statusCode:503});
  state.authorized=false;await assert.rejects(storage.storePaymentQr(input),{statusCode:403,code:'NOT_AUTHORIZED'});state.authorized=true;
  state.anchors=[];await assert.rejects(storage.storePaymentQr(input),{statusCode:503});
  state.anchors=[{tenant_id:'1',location_id:'10'},{tenant_id:'1',location_id:'12'}];await assert.rejects(storage.storePaymentQr(input),{statusCode:503});
  state.anchors=[{tenant_id:'1',location_id:'10'}];state.marker=false;await assert.rejects(storage.storePaymentQr(input),{statusCode:503});await assert.rejects(storage.read(id),{statusCode:404});
  assert.ok(state.queries.every(({sql})=>!/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/iu.test(sql)));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('both QR upload routes pass authenticated actor; upload service forwards it only to local QR adapter',async()=>{
 const {readFileSync}=require('node:fs'),{loadModuleWithMocks}=require('./helpers/loadModuleWithMocks.cjs');
 const source=readFileSync(require.resolve('../src/routes/vendorRoutes'),'utf8');
 assert.equal((source.match(/locationPaymentQrUploadService\.uploadBinary\(\{\s*actorUserId: req\.user\._id,/g)||[]).length,2);
 let captured;
 const service=loadModuleWithMocks(require.resolve('../src/services/locationPaymentQrUploadService'),{'./localImageStorage':{storeLocalPaymentQr:async input=>{captured=input;return {publicUrl:'http://127.0.0.1:5009/api/local-image-assets/test'};}},'./imageUploadPolicy':{assertImageUploadSize:async()=>{}},'../config/env':{}});
 const result=await service.uploadBinary({tenant:{_id:'1'},location:{slug:'draft'},actorUserId:'5',body:{contentType:'image/png'},fileBuffer:png});assert.equal(captured.actorUserId,'5');assert.equal(result.asset.publicUrl,'http://127.0.0.1:5009/api/local-image-assets/test');
});
