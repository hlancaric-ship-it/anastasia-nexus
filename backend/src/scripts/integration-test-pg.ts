import { Client } from 'pg';

const pgConfig = {
  host: 'localhost',
  port: 5432,
  database: 'anastasia_dev_wave1',
  user: process.env.USER || 'lucky',
  password: ''
};

async function runTests() {
  const results: Array<{test: string; pass: boolean; details: string}> = [];
  let client: Client | null = null;

  try {
    client = new Client(pgConfig);
    await client.connect();
    console.log('PostgreSQL připojení úspěšné');

    // 1. Ověření sloupce tenant_id
    console.log('\n=== 1. Ověření sloupce tenant_id ===');
    const columnQuery = `SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'entitlement' AND column_name = 'tenant_id'`;
    const columnResult = await client.query(columnQuery);
    const hasTenantColumn = columnResult.rows.length > 0;
    console.log('  tenant_id existuje:', hasTenantColumn);
    if (hasTenantColumn) {
      console.log('  Type:', columnResult.rows[0].data_type);
      console.log('  Default:', columnResult.rows[0].column_default);
    }
    results.push({
      test: '1. Sloupec tenant_id',
      pass: hasTenantColumn,
      details: hasTenantColumn ? 'Přítomný' : 'CHYBÍ'
    });

    // 2. Ověření unikátního indexu na (tenant_id, dedupe_key)
    console.log('\n=== 2. Unikátní index tenant_id + dedupe_key ===');
    const indexQuery = `SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'entitlement' 
      AND indexdef LIKE '%tenant_id%' 
      AND indexdef LIKE '%dedupe_key%'
      AND indexdef LIKE '%UNIQUE%'`;
    const indexResult = await client.query(indexQuery);
    const hasTenantDedupeIndex = indexResult.rows.length > 0;
    console.log('  Index existuje:', hasTenantDedupeIndex);
    if (hasTenantDedupeIndex) {
      console.log('  Definice:', indexResult.rows[0].indexdef);
    }
    results.push({
      test: '2. Unikátní index (tenant_id, dedupe_key)',
      pass: hasTenantDedupeIndex,
      details: hasTenantDedupeIndex ? 'Vytvořen' : 'CHYBÍ'
    });

    // 3. Test tenant izolace: různé tenanty se stejným dedupe_key
    console.log('\n=== 3. Tenant izolace (stejný dedupe_key, různé tenanty) ===');
    const timestamp = Date.now();
    const tenantA = 'test_tenant_A_' + timestamp;
    const tenantB = 'test_tenant_B_' + timestamp;
    const dedupeKey = 'shared_key_' + timestamp;
    const customerA = 'cust_' + tenantA;
    const customerB = 'cust_' + tenantB;
    const product = 'prod_test_tenant_' + timestamp;

    // Vytvoření zákazníků
    await client.query(
      'INSERT INTO customer (id, email, first_name, last_name, has_account, created_at, updated_at) VALUES ($1, $2, $3, $4, true, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
      [customerA, tenantA + '@test.com', 'Test', 'A']
    );
    await client.query(
      'INSERT INTO customer (id, email, first_name, last_name, has_account, created_at, updated_at) VALUES ($1, $2, $3, $4, true, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
      [customerB, tenantB + '@test.com', 'Test', 'B']
    );
    console.log('  Tenant A:', tenantA);
    console.log('  Tenant B:', tenantB);

    // Vložení entitlementu pro tenant A
    try {
      await client.query(
        `INSERT INTO entitlement (id, tenant_id, customer_id, product_id, variant_id, order_id, status, source, granted_at, granted_by, dedupe_key, metadata, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, NOW(), 'integration_test', $7, '{}', NOW(), NOW())`,
        ['ent_' + tenantA, tenantA, customerA, product, 'active', 'order', dedupeKey]
      );
      console.log('  Tenant A: Vloženo OK');
      
      // Vložení entitlementu pro tenant B se stejným dedupe_key
      try {
        await client.query(
          `INSERT INTO entitlement (id, tenant_id, customer_id, product_id, variant_id, order_id, status, source, granted_at, granted_by, dedupe_key, metadata, created_at, updated_at) 
          VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, NOW(), 'integration_test', $7, '{}', NOW(), NOW())`,
          ['ent_' + tenantB, tenantB, customerB, product, 'active', 'order', dedupeKey]
        );
        console.log('  Tenant B: Vloženo OK (tenant izolace funguje)');
        results.push({
          test: '3. Tenant izolace (stejný dedupe_key)',
          pass: true,
          details: 'Oba tenanty vytvořily'
        });
      } catch (e2: any) {
        console.log('  Tenant B: CHYBA -', e2.code);
        results.push({
          test: '3. Tenant izolace (stejný dedupe_key)',
          pass: false,
          details: 'Tenant B selhal: ' + e2.code
        });
      }
    } catch (e1: any) {
      console.log('  Tenant A: CHYBA -', e1.code);
      results.push({
        test: '3. Tenant izolace (stejný dedupe_key)',
        pass: false,
        details: 'Tenant A selhal: ' + e1.code
      });
    }

    // 4. Test duplicitního vložení ve stejném tenantovi (mělo selhat)
    console.log('\n=== 4. Duplicitní vložení ve stejném tenantovi ===');
    const dupKey = 'dup_test_' + timestamp;
    try {
      await client.query(
        `INSERT INTO entitlement (id, tenant_id, customer_id, product_id, variant_id, order_id, status, source, granted_at, granted_by, dedupe_key, metadata, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, NOW(), 'integration_test', $7, '{}', NOW(), NOW())`,
        ['ent_dup_1', tenantA, customerA, product, 'active', 'order', dupKey]
      );
      await client.query(
        `INSERT INTO entitlement (id, tenant_id, customer_id, product_id, variant_id, order_id, status, source, granted_at, granted_by, dedupe_key, metadata, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, NOW(), 'integration_test', $7, '{}', NOW(), NOW())`,
        ['ent_dup_2', tenantA, customerA, product, 'active', 'order', dupKey]
      );
      results.push({
        test: '4. Duplicitní vložení (stejný tenant)',
        pass: false,
        details: 'Duplicitní vložení úspěšné (mělo selhat)'
      });
    } catch (e: any) {
      if (e.code === '23505') {
        console.log('  Duplicitní vložení odmítnuto (23505)');
        results.push({
          test: '4. Duplicitní vložení (stejný tenant)',
          pass: true,
          details: 'UNIQUE_VIOLATION (23505) - tenant izolace funguje'
        });
      } else {
        results.push({
          test: '4. Duplicitní vložení (stejný tenant)',
          pass: false,
          details: 'Neočekávaná chyba: ' + e.code
        });
      }
    }

    // 5. Test vyhledávání s tenant_id
    console.log('\n=== 5. Vyhledávání s tenant_id ===');
    const resultA = await client.query(
      'SELECT id, tenant_id FROM entitlement WHERE tenant_id = $1 AND dedupe_key = $2',
      [tenantA, dedupeKey]
    );
    const resultB = await client.query(
      'SELECT id, tenant_id FROM entitlement WHERE tenant_id = $1 AND dedupe_key = $2',
      [tenantB, dedupeKey]
    );
    console.log('  Tenant A nalezeno:', resultA.rowCount);
    console.log('  Tenant B nalezeno:', resultB.rowCount);
    results.push({
      test: '5. Vyhledávání s tenant_id',
      pass: resultA.rowCount === 1 && resultB.rowCount === 1,
      details: 'A:' + resultA.rowCount + ', B:' + resultB.rowCount
    });

    // 6. Čistota databáze
    console.log('\n=== 6. Čistota databáze ===');
    await client.query("DELETE FROM entitlement WHERE tenant_id LIKE 'test_tenant_%'");
    await client.query("DELETE FROM customer WHERE id LIKE 'cust_test_tenant_%'");
    console.log('  ✓ Testovací data smazána');

  } catch (e: any) {
    console.error('Kritická chyba:', e);
    results.push({
      test: 'Kritická chyba',
      pass: false,
      details: e.message
    });
  } finally {
    if (client) await client.end();
  }

  return results;
}

runTests().then(results => {
  console.log('\n\n=== VÝSLEDKY INTEGRAČNÍHO TESTU ===');
  let passCount = 0;
  results.forEach(r => {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log('[' + status + '] ' + r.test);
    console.log('  ' + r.details);
    if (r.pass) passCount++;
  });
  console.log('\nCelkem: ' + passCount + '/' + results.length + ' PASS');
  process.exit(passCount === results.length ? 0 : 1);
}).catch(e => {
  console.error('Fatalní chyba:', e);
  process.exit(1);
});
