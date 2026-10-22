import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture(fn){
 const root=mkdtempSync(join(tmpdir(),'anastasia-deploy-test-'));
 try{
  for(const dir of ['ops/test-predani','bin','storefront-prototype/dist'])mkdirSync(join(root,dir),{recursive:true});
  copyFileSync(new URL('./deploy.sh',import.meta.url),join(root,'ops/test-predani/deploy.sh'));
  const run=(args,extra={})=>spawnSync('bash',[join(root,'ops/test-predani/deploy.sh'),...args],{encoding:'utf8',env:{PATH:join(root,'bin')+':'+process.env.PATH,...extra}});
  fn(root,run);
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('failed build preserves the existing connected storefront',()=>fixture((root,run)=>{
 writeFileSync(join(root,'storefront-prototype/dist/config.mjs'),'existing connected config');
 writeFileSync(join(root,'storefront-prototype/build.mjs'),'throw Error("invalid configuration")');
 const result=run([],{
  ANASTASIA_API_ORIGIN:'https://backend.example.test',ANASTASIA_PUBLISHABLE_KEY:'invalid',
  ANASTASIA_REGION_ID:'reg_test',ANASTASIA_STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',
 });
 assert.notEqual(result.status,0);
 assert.equal(readFileSync(join(root,'storefront-prototype/dist/config.mjs'),'utf8'),'existing connected config');
}));
for(const mode of ['unavailable','live','missing','test'])test(`smoke handles ${mode} configuration`,()=>fixture((root,run)=>{
 writeFileSync(join(root,'bin/curl'),`#!/usr/bin/env bash
case "\${*: -1}" in
 */config.mjs)
 case "$CONFIG_MODE" in
 unavailable) exit 22;;
 live) echo 'stripePublishableKey: pk_live_fixture';;
 missing) echo 'export default {}';;
 test) echo 'stripePublishableKey: pk_test_fixture';;
 esac;;
 */robots.txt) echo 'Disallow: /';;
 *) printf 'HTTP/2 200\\nx-robots-tag: noindex\\ncontent-security-policy: default-src self\\n';;
esac
`,{mode:0o700});
 const result=run(['--smoke'],{CONFIG_MODE:mode});
 assert.equal(result.status,mode==='test'?0:1,result.stdout+result.stderr);
 assert.equal(result.stdout.includes('SMOKE_OK'),mode==='test');
}));
