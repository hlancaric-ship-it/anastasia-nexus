import test from 'node:test';
import assert from 'node:assert/strict';
import {publicBuildConfig} from '../src/lib/build-config.mjs';
const valid={ANASTASIA_API_ORIGIN:'http://127.0.0.1:9100',ANASTASIA_PUBLISHABLE_KEY:'pk_synthetic',ANASTASIA_REGION_ID:'reg_synthetic',ANASTASIA_STRIPE_PUBLISHABLE_KEY:'pk_test_synthetic'};
test('plain or partially configured build fails before any filesystem write',()=>{
 assert.throws(()=>publicBuildConfig({}),/Existing dist was not changed/);
 for(const name of Object.keys(valid)){const env={...valid};delete env[name];assert.throws(()=>publicBuildConfig(env),/Connected build requires/);}
});
test('offline fixture builds are explicit and cannot mix customer connection settings',()=>{
 assert.equal(publicBuildConfig({ANASTASIA_OFFLINE_FIXTURES:'1'}).offline,true);
 assert.equal(publicBuildConfig({ANASTASIA_OFFLINE_FIXTURES:'1'}).publishableKey,'');
 assert.throws(()=>publicBuildConfig({...valid,ANASTASIA_OFFLINE_FIXTURES:'1'}),/cannot be combined/);
});
test('accepts only public keys and an origin without credentials or remote cleartext',()=>{
 const r=publicBuildConfig(valid);assert.equal(r.apiBaseUrl,valid.ANASTASIA_API_ORIGIN);assert.equal(r.stripePublishableKey,valid.ANASTASIA_STRIPE_PUBLISHABLE_KEY);
 for(const origin of ['http://remote.example','https://user:password@example.test','https://example.test/path','https://example.test?token=x'])assert.throws(()=>publicBuildConfig({...valid,ANASTASIA_API_ORIGIN:origin}));
 for(const name of ['ANASTASIA_PUBLISHABLE_KEY','ANASTASIA_STRIPE_PUBLISHABLE_KEY'])assert.throws(()=>publicBuildConfig({...valid,[name]:'sk_test_never_public'}));
});
test('a plain CLI build preserves an existing connected dist/config.mjs byte for byte',async()=>{
 const {readFile}=await import('node:fs/promises'),{spawnSync}=await import('node:child_process');
 const file=new URL('../dist/config.mjs',import.meta.url);
 const before=await readFile(file).catch(()=>null);
 const env={...process.env};for(const name of Object.keys(valid))delete env[name];delete env.ANASTASIA_OFFLINE_FIXTURES;
 const result=spawnSync(process.execPath,[new URL('../build.mjs',import.meta.url).pathname],{env,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Existing dist was not changed/);
 const after=await readFile(file).catch(()=>null);assert.deepEqual(after,before);
});
