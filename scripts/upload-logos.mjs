import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Security P0: env vars en vez de hardcodes (repo público).
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: faltan env vars SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  // 1. Crear bucket público si no existe
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === 'public-assets');

  if (!exists) {
    const { error } = await supabase.storage.createBucket('public-assets', { public: true });
    if (error) console.error('Bucket error:', error.message);
    else console.log('Bucket public-assets creado');
  } else {
    console.log('Bucket public-assets ya existe');
  }

  // 2. Subir logo-white-2.png
  const white = fs.readFileSync(path.join(root, 'public/logo-white-2.png'));
  const { error: e1 } = await supabase.storage
    .from('public-assets')
    .upload('logo-white-2.png', white, { contentType: 'image/png', upsert: true });
  if (e1) console.error('Upload white error:', e1.message);
  else console.log('logo-white-2.png subido');

  // 3. Subir logo-black-2.png
  const black = fs.readFileSync(path.join(root, 'public/logo-black-2.png'));
  const { error: e2 } = await supabase.storage
    .from('public-assets')
    .upload('logo-black-2.png', black, { contentType: 'image/png', upsert: true });
  if (e2) console.error('Upload black error:', e2.message);
  else console.log('logo-black-2.png subido');

  // 4. Mostrar URLs públicas
  const { data: url1 } = supabase.storage.from('public-assets').getPublicUrl('logo-white-2.png');
  const { data: url2 } = supabase.storage.from('public-assets').getPublicUrl('logo-black-2.png');
  console.log('\nURLs públicas:');
  console.log('White:', url1.publicUrl);
  console.log('Black:', url2.publicUrl);
}

main().catch(e => console.error(e));
