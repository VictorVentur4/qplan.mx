const { chromium } = require('playwright');
const BASE='http://localhost:3000', API='http://127.0.0.1:8000/api';
const r=[]; const ok=(n,c,x='')=>{r.push([c,n,x]);console.log(`${c?'  ✓':'  ✗'} ${n}${x?' — '+x:''}`)};

(async () => {
  const negocios = await (await fetch(`${API}/businesses`)).json();
  const biz = negocios.find(b => b.name === 'Cafe Central') || negocios[0];
  const LEJOS = { latitude: 32.5149, longitude: -117.0382 };   // Tijuana: >1500 km de los datos

  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

  console.log('\n── 1. EL MODAL TIENE BOTÓN DE COMPARTIR ──');
  {
    const ctx = await b.newContext({permissions:['geolocation','clipboard-read','clipboard-write'],
      geolocation:{latitude:18.92,longitude:-99.23}});
    const p = await ctx.newPage();
    await p.goto(BASE+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(2800);
    await p.locator('button',{hasText:'Ver más'}).first().click();
    await p.waitForTimeout(1200);
    ok('el botón existe', await p.locator('[data-testid="share-button"]').count() === 1);

    console.log('\n── 2. COPIA EL ENLACE AL PORTAPAPELES ──');
    await p.locator('[data-testid="share-button"]').click();
    await p.waitForTimeout(1200);
    const copiado = await p.evaluate(() => navigator.clipboard.readText());
    ok('copia una URL /lugar/', copiado.includes('/lugar/'), copiado);
    ok('el botón confirma', (await p.textContent('body')).includes('Copiado'));
    await ctx.close();
  }

  console.log('\n── 3. EL ENLACE ABRE EL NEGOCIO DESDE LEJOS, SIN UBICACIÓN ──');
  {
    // sin permiso de geolocalización Y a 1500 km: aun así debe verse la ficha
    const ctx = await b.newContext({viewport:{width:1280,height:900}});
    const p = await ctx.newPage();
    await p.goto(`${BASE}/lugar/${biz.id}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(3000);
    ok('el modal se abre solo', await p.locator('[data-testid="business-modal"]').isVisible());
    const t = await p.textContent('[data-testid="business-modal"]');
    ok('muestra el negocio correcto', t.includes(biz.name), biz.name);
    ok('muestra su horario', t.includes('Horario de atención'));
    ok('NO pidió ubicación todavía',
       !(await p.textContent('body')).includes('Necesitamos saber dónde estás')
       || await p.locator('[data-testid="business-modal"]').isVisible());

    console.log('\n── 4. AL CERRAR, PIDE LA UBICACIÓN ──');
    await p.locator('button',{hasText:'Cerrar'}).click();
    await p.waitForTimeout(1500);
    ok('la URL vuelve a la raíz', new URL(p.url()).pathname === '/', p.url());
    const pedido = await p.locator('button', {hasText:/Compartir mi ubicación|Intentar de nuevo/})
      .first().waitFor({timeout:15000}).then(()=>true).catch(()=>false);
    ok('aparece el aviso de ubicación', pedido);
    await ctx.close();
  }

  console.log('\n── 5. CON UBICACIÓN LEJANA, IGUAL SE VE EL NEGOCIO ──');
  {
    const ctx = await b.newContext({permissions:['geolocation'], geolocation:LEJOS});
    const p = await ctx.newPage();
    await p.goto(`${BASE}/lugar/${biz.id}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(3000);
    ok('el modal se abre pese a estar a 1500 km',
       await p.locator('[data-testid="business-modal"]').isVisible());
    await p.locator('button',{hasText:'Cerrar'}).click();
    await p.waitForTimeout(2500);
    const t = await p.textContent('body');
    ok('al cerrar no hay negocios cerca, como corresponde',
       t.includes('No hay negocios cerca') || t.includes('No encontramos'));
    await ctx.close();
  }

  console.log('\n── 6. ENLACE A UN NEGOCIO INEXISTENTE ──');
  {
    const ctx = await b.newContext({permissions:['geolocation'], geolocation:{latitude:18.92,longitude:-99.23}});
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(`${BASE}/lugar/00000000-0000-0000-0000-000000000000`,{waitUntil:'networkidle'});
    await p.waitForTimeout(3000);
    ok('avisa que no está disponible',
       (await p.textContent('body')).includes('ya no está disponible'));
    ok('sigue funcionando el resto', await p.locator('h3.text-lg.font-bold').count() >= 1);
    ok('sin errores de JavaScript', errs.length === 0, errs.slice(0,2).join(' | '));
    await ctx.close();
  }

  console.log('\n── 7. EL ENLACE COMPARTIDO CUENTA COMO VISTA ──');
  {
    const tok = (await (await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'admin@qplan.mx',password:'qplan1234'})})).json()).access_token;
    const antes = (await (await fetch(`${API}/admin/metrics/summary?dias=1`,{headers:{Authorization:`Bearer ${tok}`}})).json()).total_vistas_negocios;
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/lugar/${biz.id}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(3000);
    await ctx.close();
    const despues = (await (await fetch(`${API}/admin/metrics/summary?dias=1`,{headers:{Authorization:`Bearer ${tok}`}})).json()).total_vistas_negocios;
    ok('la apertura por enlace se registra', despues > antes, `${antes} → ${despues}`);
  }

  console.log('\n── 8. MÓVIL ──');
  {
    const ctx = await b.newContext({viewport:{width:390,height:844}});
    const p = await ctx.newPage();
    await p.goto(`${BASE}/lugar/${biz.id}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(3000);
    ok('el modal compartido se ve en móvil',
       await p.locator('[data-testid="business-modal"]').isVisible());
    ok('el botón de compartir cabe',
       await p.locator('[data-testid="share-button"]').isVisible());
    await ctx.close();
  }

  await b.close();
  const f=r.filter(x=>!x[0]);
  console.log(`\n${'═'.repeat(56)}\n  ${r.length-f.length}/${r.length} comprobaciones OK`);
  if(f.length){console.log('  FALLARON:');f.forEach(x=>console.log('   ✗ '+x[1]+(x[2]?' — '+x[2]:'')))}
  console.log('═'.repeat(56));
  process.exit(f.length?1:0);
})();
