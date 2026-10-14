#!/usr/bin/env python3
"""Run real Medusa HTTP/persistence checks in a newly created synthetic PG cluster."""
import json
import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--booking-only', action='store_true', help='Run booking HTTP checks with the same isolated infrastructure')
parser.add_argument('--gift-voucher-only', action='store_true', help='Run only the K8 gift voucher HTTP checks with the same isolated infrastructure')
args = parser.parse_args()
backend = repo / 'backend'
evidence_out = os.environ.get('WAVE1_EVIDENCE_OUT')
if evidence_out:
    evidence_out = Path(evidence_out).resolve()
    if not evidence_out.is_relative_to(repo / 'ci-evidence'):
        raise SystemExit('Evidence output must stay inside the checkout ci-evidence directory')
# No inherited DB, cloud, mail, Stripe or NEXUS credentials.
env = {k: os.environ[k] for k in ('PATH', 'TMPDIR', 'LANG', 'HOME', 'USER', 'LOGNAME') if k in os.environ}
env.update({'NODE_ENV': 'test', 'MEDUSA_TELEMETRY_DISABLED': 'true', 'NO_COLOR': '1'})
env['WAVE1_BOOKING_ONLY'] = '1' if args.booking_only else '0'
env['WAVE1_GIFT_VOUCHER_ONLY'] = '1' if args.gift_voucher_only else '0'
env.update({'MEDIA_TOKEN_SECRET': 'synthetic-media-signing-secret-for-local-tests-only', 'MEDIA_DELIVERY_BASE_URL': 'https://media.example.test', 'OPS_INGEST_SECRET': 'synthetic-ops-ingest-secret-for-local-tests-only'})
for name in ('initdb', 'pg_ctl', 'node'):
    if not shutil.which(name, path=env.get('PATH')):
        raise SystemExit(f'Missing local prerequisite: {name}')
# Medusa loadEnv must have nothing to load in this isolated worktree.
if any(p.name != '.env.template' for p in backend.glob('.env*')):
    raise SystemExit('Refusing backend checkout containing environment files')
root = Path(tempfile.mkdtemp(prefix='wave1-safeorder-'))
os.chmod(root, 0o700)
pg_data = root / 'pg'
sock = root / 'socket'
sock.mkdir(mode=0o700)
(root / 'synthetic-only.marker').write_text('ANASTASIA Wave 1 P0 synthetic local verification\n')
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    pg_port = listener.getsockname()[1]
worker = None
pg_started = False
try:
    with (root / 'initdb.log').open('w') as log:
        subprocess.run(['initdb', '-D', str(pg_data), '-U', 'wave1_synthetic', '--auth=trust', '--encoding=UTF8', '--no-locale'], env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    subprocess.run(['pg_ctl', '-D', str(pg_data), '-l', str(root / 'postgres.log'), '-o', f'-h 127.0.0.1 -p {pg_port} -k {sock}', '-w', 'start'], env=env, check=True)
    pg_started = True
    bundle = root / 'worker.mjs'
    subprocess.run([str(repo / 'nexus/node_modules/.bin/esbuild'), str(repo / 'nexus/workers/api/index.ts'), '--bundle', '--platform=node', '--format=esm', f'--outfile={bundle}'], env=env, check=True)
    bridge = root / 'http-worker.mjs'
    bridge.write_text('''import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import worker from './worker.mjs';
let mode = 'normal';
let redirectRequests = 0;
const bindings = { ENVIRONMENT: 'test', HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_API_KEY: 'synthetic-service-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', MEDUSA_PRICING_POLICY_JSON: JSON.stringify({loyaltyTiers:{},brandLimits:{},categoryLimits:{},brandSaleDiscounts:{}}), DB: {prepare(){throw new Error('Unexpected voucher DB access')}} };
const server = createServer(async (incoming, outgoing) => {
 try {
  const chunks=[]; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  if(incoming.url === '/synthetic-control' && incoming.method === 'POST') {
   mode=JSON.parse(body).mode; outgoing.writeHead(200, {'content-type':'application/json'}); outgoing.end('{}'); return;
  }
  if(incoming.url === '/synthetic-stats') {
   outgoing.writeHead(200, {'content-type':'application/json'}); outgoing.end(JSON.stringify({redirectRequests})); return;
  }
  if(incoming.url === '/synthetic-pricing-redirect-target') {
   redirectRequests++; outgoing.writeHead(200, {'content-type':'application/json'}); outgoing.end(JSON.stringify({ok:true,tenantId:'anastasia',calculated:{finalPrice:0,appliedRules:[],rejected:[]}})); return;
  }
  const headers=new Headers(); for(const [key,value] of Object.entries(incoming.headers)) if(value !== undefined) headers.set(key, Array.isArray(value)?value.join(','):value);
  const request=new Request(`http://127.0.0.1${incoming.url}`, {method: incoming.method,headers,body: incoming.method==='GET'?undefined:body});
  const safeorder=incoming.url.startsWith('/api/nexus/safeorder');
  const pricing=incoming.url.startsWith('/api/nexus/pricing');
  let response;
  if(safeorder && mode==='unavailable') response=new Response('{}',{status:503});
  else if(safeorder && mode==='malformed') response=new Response('{',{status:200});
  else if(pricing && mode==='pricing-redirect') response=new Response(null,{status:307,headers:{location:'/synthetic-pricing-redirect-target'}});
  else if(pricing && mode==='pricing-malformed') response=new Response('synthetic-private@example.test',{status:200});
  else response=await worker.fetch(request, safeorder && mode==='unauthorized'?{...bindings,MEDUSA_PRICING_API_KEY:'different-synthetic-key'}:bindings,{waitUntil(){}});
  if(pricing && ['pricing-tenant','pricing-change'].includes(mode)) {
   const payload=await response.json();
   if(mode==='pricing-tenant') payload.tenantId='other';
   else payload.calculated.finalPrice=1;
   response=new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
  }
  outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(await response.text());
 } catch {outgoing.writeHead(500);outgoing.end('{}');}
});
server.listen(0,'127.0.0.1',()=>writeFileSync(new URL('./worker-ready.json',import.meta.url),JSON.stringify({port:server.address().port})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
''')
    worker_log = (root / 'worker.log').open('w')
    worker = subprocess.Popen(['node', str(bridge)], env=env, stdout=worker_log, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + 20
    while not (root / 'worker-ready.json').exists():
        if worker.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError('Synthetic Worker bridge failed to start; inspect local worker.log')
        time.sleep(0.1)
    readiness = json.loads((root / 'worker-ready.json').read_text())
    worker_base = f'http://127.0.0.1:{readiness["port"]}'
    env.update({'DB_HOST': 'localhost', 'DB_PORT': str(pg_port), 'DB_USERNAME': 'wave1_synthetic', 'DB_PASSWORD': '', 'DB_TEMP_NAME': 'anastasia_dev_wave1', 'DATABASE_URL': f'postgres://wave1_synthetic@127.0.0.1:{pg_port}/anastasia_dev_wave1', 'WAVE1_PG_DATA': str(pg_data), 'WAVE1_SYNTHETIC_ROOT': str(root), 'WAVE1_WORKER_BASE': worker_base, 'NEXUS_PRICING_URL': worker_base + '/api/nexus/pricing', 'NEXUS_SAFEORDER_URL': worker_base + '/api/nexus/safeorder', 'NEXUS_PRICING_API_KEY': 'synthetic-service-key', 'NEXUS_TENANT_ID': 'anastasia', 'JWT_SECRET': 'synthetic-test-jwt-secret-only', 'COOKIE_SECRET': 'synthetic-test-cookie-secret-only', 'TEST_TYPE': 'integration:http', 'NODE_OPTIONS': '--experimental-vm-modules --dns-result-order=ipv4first'})
    print(f'Synthetic evidence directory: {root}', flush=True)
    with (root / 'medusa-test.log').open('w') as test_log:
        result = subprocess.run([str(backend / 'node_modules/.bin/jest'), '--runInBand', '--forceExit', '--runTestsByPath', 'integration-tests/http/safeorder-persistence.spec.ts'], cwd=backend, env=env, stdout=test_log, stderr=subprocess.STDOUT, timeout=900)
    print('\n'.join((root / 'medusa-test.log').read_text().splitlines()[-14:]), flush=True)
    raise SystemExit(result.returncode)
finally:
    if worker:
        worker.terminate()
        try: worker.wait(timeout=10)
        except subprocess.TimeoutExpired: worker.kill(); worker.wait()
    if pg_started:
        subprocess.run(['pg_ctl', '-D', str(pg_data), '-m', 'fast', '-w', 'stop'], env=env, check=True)
    if evidence_out:
        evidence_out.mkdir(parents=True, exist_ok=True)
        for name in ('medusa-persistence-evidence.json', 'medusa-test.log', 'worker.log'):
            if (root / name).exists():
                shutil.copyfile(root / name, evidence_out / name)
    print(f'Preserved synthetic evidence directory: {root}', flush=True)
