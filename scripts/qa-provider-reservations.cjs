// Isolated UI harness: real components/styles, synthetic data, no auth or provider calls.
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const { chromium } = require('playwright')

async function main() {
  const output = path.resolve('tmp/reservations-qa')
  await fs.mkdir(output, { recursive: true })
  const row = { id:'11111111-1111-4111-8111-111111111111',booking_id:'22222222-2222-4222-8222-222222222222',agency_id:'agency',quotation_id:'quotation',operation_id:'operation',seller_id:'seller',file_code:'VIB-2026-0042',agency_name:'Agencia de prueba',seller_name:'María Pérez',job_status:'CONFIRMED',created_at:'2026-09-05T12:00:00Z',synced_at:new Date().toISOString(),wholesaler:'DELFOS',item_id:'flight',product:'flights',external_id:'bkg_DEMO',locator:'ABC123',status:'CNFD',reference:'Viaje familiar',contact_name:'Ana García',destination:'MAD',travel_date:'2026-11-10T18:00:00Z',price_total:'2450.00',price_currency:'USD',last_ticket_date:'2026-09-07T18:00:00Z',passenger_count:2,passengers_summary:'Ana García, Luis García' }
  const initial = { rows:[row], total:1, page:1, pageSize:25 }
  const passenger = { name:'Ana',surnames:['García'],type:'ADT',birthDate:'1990-05-12',documents:[{type:'Pasaporte',number:'TEST-PASSPORT-001',nationality:'AR',country:'AR',expiryDate:'2030-05-12'}] }
  const detail = { id:'bkg_DEMO',type:'flight',provider:'lleego',status:'CNFD',locator:'ABC123',agencyId:'delfos-agency',agencyName:'Vibook',priceTotal:'2450.00',priceCurrency:'USD',createdAt:'2026-09-05T12:00:00Z',travellersRequest:[passenger],travellersProviderEcho:[passenger],holderRequest:{name:'Ana',surnames:['García'],contact:{mails:['ana@example.com'],phones:[{countryPref:'+54',number:'1112345678'}]}},itinerary:{segments:[{origin:'EZE',dest:'MAD',carrier:'IB',flightNumber:'102',cabin:'Economy',departureDateTime:'2026-11-10T18:00:00',arrivalDateTime:'2026-11-11T12:00:00'}]},manualServices:[],fareBreakdown:{fares:[{passengerType:'ADT',quantity:2,currency:'USD',base:'2000.00',totalTaxes:'450.00',total:'2450.00'}],taxes:[]}}
  const payload = { reservation:row,item:{client_item_id:'flight',product:'flights',status:'confirmed',booking_id:'bkg_DEMO',detail,detail_checked_at:new Date().toISOString()},request:null }
  const entry = path.join(output,'entry.jsx')
  await fs.writeFile(entry, `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ReservationsPage} from '${path.resolve('components/operations/reservations-page.tsx').replaceAll('\\','/')}'; import {ReservationDetailPage} from '${path.resolve('components/operations/reservation-detail-page.tsx').replaceAll('\\','/')}'; const initial=${JSON.stringify(initial)}; if(location.search.includes('empty')){initial.rows=[];initial.total=0;} createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-screen-2xl p-4 md:p-8">{location.pathname.includes('/detail')?<ReservationDetailPage id="${row.id}"/>:<ReservationsPage initial={initial}/>}</main>);`)
  await esbuild.build({entryPoints:[entry],bundle:true,outfile:path.join(output,'app.js'),jsx:'automatic',tsconfig:path.resolve('tsconfig.json'),define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'ui-harness',setup(build){
    build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}))
    build.onResolve({filter:/^@\/lib\/analytics\/view-tracking$/},()=>({path:'analytics',namespace:'qa'}))
    build.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='link'?`import React from 'react'; export default function Link({children,...props}){return React.createElement('a',props,children)}`:'export function trackViewOpened(){}',loader:'js',resolveDir:process.cwd()}))
  }}]})
  const css = await postcss([tailwind(require(path.resolve('tailwind.config.js')))]).process(await fs.readFile('app/globals.css','utf8'), {from:path.resolve('app/globals.css')})
  await fs.writeFile(path.join(output,'app.css'),css.css)
  const server = http.createServer(async(req,res)=>{
    const asset=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null
    res.setHeader('Content-Type',asset?.endsWith('css')?'text/css':asset?'text/javascript':'text/html')
    res.end(asset?await fs.readFile(path.join(output,asset)):'<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const browser = await chromium.launch({headless:true})
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    let mode='normal';let searched=''
    await page.route('**/api/**',async route=>{
      const req=route.request(); const url=new URL(req.url()); searched=url.searchParams.get('q')||searched
      if(req.method()==='POST')return route.fulfill({json:{data:{updated:1,failed:0}}})
      if(mode==='error')return route.fulfill({status:502,json:{error:'No se pudo cargar la reserva. Volvé a intentarlo.'}})
      if(mode==='loading')await new Promise(resolve=>setTimeout(resolve,1000))
      return route.fulfill({json:{data:url.pathname.endsWith(row.id)?payload:initial}})
    })
    const base=`http://127.0.0.1:${server.address().port}`
    await page.goto(base);await page.getByRole('link',{name:'ABC123'}).waitFor()
    await page.screenshot({path:path.join(output,'list-desktop.png'),fullPage:true})
    await page.getByLabel('Buscar reserva').fill('Ana');await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('link',{name:'ABC123'}).waitFor();assert.equal(searched,'Ana')
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'list-mobile.png'),fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
    mode='loading';await page.goto(`${base}/detail`);await page.getByLabel('Cargando reserva').waitFor();mode='normal'
    await page.getByRole('tab',{name:'Pasajeros y titular'}).click()
    await page.getByText('TEST-PASSPORT-001').first().waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
    await page.screenshot({path:path.join(output,'passengers-mobile.png'),fullPage:true})
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.classList.add('dark'))
    await page.screenshot({path:path.join(output,'passengers-dark.png'),fullPage:true})
    for(const name of ['Servicios','Importes y condiciones','Adicionales','Historial'])await page.getByRole('tab',{name,exact:true}).click()
    mode='error';await page.goto(`${base}/detail`);await page.getByRole('alert').waitFor();mode='normal';await page.getByRole('button',{name:'Actualizar ficha'}).click();await page.getByRole('tab',{name:'General',exact:true}).waitFor()
    await page.goto(`${base}/?empty`);await page.getByText('Todavía no hay reservas').waitFor()
    assert.deepEqual(errors,[])
    console.log('PASS: desktop/mobile, dark mode, passenger documents, all tabs, search, loading, empty, error recovery, no page errors')
    console.log(output)
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
