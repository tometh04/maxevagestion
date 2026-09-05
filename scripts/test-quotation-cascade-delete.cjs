// Run: node scripts/test-quotation-cascade-delete.cjs <path to @electric-sql/pglite> [--baseline]
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE TABLE quotations(id int PRIMARY KEY, status text);
      CREATE TABLE quotation_options(id int PRIMARY KEY, quotation_id int REFERENCES quotations ON DELETE CASCADE);
      CREATE TABLE quotation_items(id int PRIMARY KEY, quotation_id int REFERENCES quotations ON DELETE CASCADE,
        option_id int REFERENCES quotation_options ON DELETE CASCADE);
      CREATE TABLE issued_quotation_documents(id int PRIMARY KEY, quotation_id int REFERENCES quotations ON DELETE RESTRICT);
    `)
    const baseline = readFileSync('supabase/migrations/20260824000001_quotation_document_models.sql', 'utf8')
    const start = baseline.indexOf('CREATE OR REPLACE FUNCTION public.guard_closed_quotation_child_content()')
    await db.exec(baseline.slice(start, baseline.indexOf('\n$$;', start) + 4))
    await db.exec(`
      CREATE TRIGGER guard_options BEFORE INSERT OR UPDATE OR DELETE ON quotation_options
        FOR EACH ROW EXECUTE FUNCTION guard_closed_quotation_child_content();
      CREATE TRIGGER guard_items BEFORE INSERT OR UPDATE OR DELETE ON quotation_items
        FOR EACH ROW EXECUTE FUNCTION guard_closed_quotation_child_content();
    `)
    if (!process.argv.includes('--baseline')) {
      await db.exec(readFileSync('supabase/migrations/20260905220000_fix_quotation_child_cascade_delete.sql', 'utf8'))
    }
    await db.exec(`INSERT INTO quotations VALUES (1,'DRAFT'),(2,'DRAFT'),(3,'DRAFT');
      INSERT INTO quotation_options VALUES (1,1),(2,2),(3,3);
      INSERT INTO quotation_items VALUES (1,1,1),(2,2,2),(3,3,3);`)
    await db.exec('DELETE FROM quotations WHERE id=1')
    assert.equal((await db.query('SELECT * FROM quotation_options WHERE quotation_id=1')).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM quotation_items WHERE quotation_id=1')).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM quotations')).rows.length, 2)
    await db.exec("UPDATE quotations SET status='ACCEPTED' WHERE id=2")
    for (const table of ['quotation_options', 'quotation_items']) {
      await assert.rejects(db.exec(`DELETE FROM ${table} WHERE id=2`), /immutable after acceptance/)
      await assert.rejects(db.exec(`UPDATE ${table} SET quotation_id=3 WHERE id=2`), /immutable after acceptance/)
      await assert.rejects(db.exec(`INSERT INTO ${table}(id,quotation_id) VALUES (4,2)`), /immutable after acceptance/)
      await assert.rejects(db.exec(`INSERT INTO ${table}(id,quotation_id) VALUES (4,999)`), /parent not found/)
    }
    await db.exec('INSERT INTO issued_quotation_documents VALUES (3,3)')
    await assert.rejects(db.exec('DELETE FROM quotations WHERE id=3'), /foreign key constraint/)
    assert.equal((await db.query('SELECT * FROM quotation_items WHERE id=3')).rows.length, 1)
    await db.exec('DELETE FROM quotation_items WHERE id=3')
    assert.equal((await db.query('SELECT * FROM quotation_items WHERE id=3')).rows.length, 0)
    console.log('PASS: draft cascade, other quotations preserved, closed children protected, orphan writes blocked, issued documents preserved, direct draft edits allowed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
