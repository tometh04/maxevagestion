// Run with a temporary PGlite installation, without adding a product dependency:
// node scripts/test-provider-reservations-sql.cjs <absolute path to @electric-sql/pglite>
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT null::uuid';
      CREATE FUNCTION public.user_org_ids() RETURNS SETOF uuid LANGUAGE sql AS 'SELECT null::uuid';
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE agencies(id uuid PRIMARY KEY,org_id uuid,name text);
      CREATE TABLE users(id uuid PRIMARY KEY,org_id uuid,role text,name text);
      CREATE TABLE user_agencies(user_id uuid,agency_id uuid);
      CREATE TABLE operations(id uuid PRIMARY KEY,org_id uuid,agency_id uuid,seller_id uuid,file_code text);
      CREATE TABLE quotations(id uuid PRIMARY KEY,org_id uuid,agency_id uuid,operation_id uuid);
    `)
    await db.exec(readFileSync('supabase/migrations/20260901220001_quotation_provider_bookings.sql','utf8'))
    await db.exec(readFileSync('supabase/migrations/20260905180000_provider_reservations.sql','utf8'))
    const org = '11111111-1111-4111-8111-111111111111'
    const agency = '22222222-2222-4222-8222-222222222222'
    const user = '33333333-3333-4333-8333-333333333333'
    const operation = '44444444-4444-4444-8444-444444444444'
    const quotation = '55555555-5555-4555-8555-555555555555'
    await db.exec(`INSERT INTO organizations VALUES ('${org}'); INSERT INTO agencies VALUES ('${agency}','${org}','Agencia A');
      INSERT INTO users VALUES ('${user}','${org}','SELLER','Vendedora');
      INSERT INTO operations VALUES ('${operation}','${org}','${agency}','${user}','FILE-001');
      INSERT INTO quotations VALUES ('${quotation}','${org}','${agency}','${operation}');`)
    const request = { holder: { name: 'Ada' }, travellers: [{ name: 'Ada', surnames: ['Lovelace'] }], items: [{ client_item_id: 'a',product:'flights' },{client_item_id:'b',product:'hotels'}] }
    const result = { items: [{ client_item_id:'a',product:'flights',booking_id:'bkg_01',status:'confirmed',detail:{status:'ONRQ',locator:'ABC',priceTotal:'100.00',priceCurrency:'USD'} },{client_item_id:'b',product:'hotels',status:'failed'}] }
    await db.query(`INSERT INTO quotation_provider_bookings(org_id,agency_id,quotation_id,operation_id,request_id,remote_job_id,created_by,request_snapshot,result)
      VALUES ($1,$2,$3,$4,gen_random_uuid(),gen_random_uuid(),$5,$6,$7)`,[org,agency,quotation,operation,user,request,result])
    const rows = (await db.query('SELECT * FROM provider_reservations ORDER BY item_id')).rows
    assert.equal(rows.length,2)
    assert.equal(rows[0].status,'ONRQ')
    assert.equal(rows[1].status,'FAILED')
    assert.equal(rows[0].price_total,'100.00')
    assert.equal(rows[0].passengers_summary,'Ada Lovelace')
    assert.equal(rows[0].passenger_count,1)
    assert.match(rows[0].search_text,/Ada Lovelace/)
    await db.exec(`UPDATE operations SET seller_id=null WHERE id='${operation}'`)
    assert.equal((await db.query('SELECT seller_id FROM provider_reservations LIMIT 1')).rows[0].seller_id,null)
    await assert.rejects(db.exec(`UPDATE quotation_provider_bookings SET agency_id='${user}'`),/scope mismatch/)
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.query('SELECT * FROM quotation_provider_bookings'),/permission denied/)
    await assert.rejects(db.query('SELECT * FROM provider_reservations'),/permission denied/)
    await db.exec('RESET ROLE')
    console.log('PASS: SQL migration, per-item rows, provider status, passenger summary, live seller scope, tenant trigger and private grants')
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
