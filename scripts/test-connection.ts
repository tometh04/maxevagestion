import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.join(__dirname, '../.env.local') })

console.log('START')
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  console.log('Querying...')
  const { count, error } = await supabase
    .from('operations')
    .select('id', { count: 'exact', head: true })

  console.log('Count:', count, 'Error:', error?.message || 'none')
  process.exit(0)
}

test()
