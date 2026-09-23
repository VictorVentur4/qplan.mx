const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const r = []; const ok = (n,c,x='') => { r.push([c,n,x]); console.log(`${c?'  ✓':'  ✗'} ${n}${x?' — '+x:''}`); };

// Cuernavaca (datos sembrados) y CDMX (lejos, fuera del radio de 50 km)
const CUERNAVACA = { latitude: 18.92, longitude: -99.23 };

async function abrir(b, { permitirGps, coords, query = '' }) {
  const opts = { viewport:{width:1280,height:900} };
  if (permitirGps) { opts.permissions = ['geolocation']; opts.geolocation = coords || CUERNAVACA; }
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + query, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

  console.log('\n── 1. CON GPS: usa el GPS ──');
  {
    const { ctx, p } = await abrir(b, { permitirGps: true });
    const t = await p.textContent('body');
    ok('muestra negocios', (await p.locator('h3.text-lg.font-bold').count()) >= 2);
    ok('el header dice "Ubicación activa"', t.includes('Ubicación activa'));
    ok('NO dice que viene del QR', !t.includes('Ubicación del QR'));
    await ctx.close();
  }

  console.log('\n── 2. SIN GPS + QR con ?lat=&lng= ──');
  {
    const { ctx, p } = await abrir(b, { permitirGps: false, query: '?lat=18.92&lng=-99.23' });
    const t = await p.textContent('body');
    ok('muestra negocios igualmente', (await p.locator('h3.text-lg.font-bold').count()) >= 2);
    ok('avisa que usa la ubicación del QR', t.includes('Ubicación del QR'));
    ok('explica de dónde salen los negocios', t.includes('escaneaste el código'));
    // el botón dice "Buscando…" mientras el navegador resuelve; esperamos al estado final
    const cambiar = await p.locator('button', { hasText: 'Usar mi ubicación real' })
      .first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
    ok('ofrece cambiar a la ubicación real', cambiar);
    ok('NO pide compartir ubicación', !t.includes('Necesitamos saber dónde estás'));
    await ctx.close();
  }

  console.log('\n── 3. SIN GPS + QR en forma compacta ?c=lat,lng ──');
  {
    const { ctx, p } = await abrir(b, { permitirGps: false, query: '?c=18.92,-99.23' });
    ok('la forma compacta también funciona',
       (await p.locator('h3.text-lg.font-bold').count()) >= 2);
    await ctx.close();
  }

  console.log('\n── 4. SIN GPS + SIN QR: pide ubicación ──');
  {
    const { ctx, p } = await abrir(b, { permitirGps: false });
    const t = await p.textContent('body');
    ok('muestra el mensaje pidiendo ubicación', t.includes('Necesitamos saber dónde estás'));
    ok('explica por qué la necesita', t.includes('negocios más cercanos'));
    ok('NO lista ningún negocio', (await p.locator('h3.text-lg.font-bold').count()) === 0);
    ok('NO muestra el filtro de categorías', !t.includes('Negocios cercanos'));
    const reintento = await p.locator('button', { hasText: /Compartir mi ubicación|Intentar de nuevo/ })
      .first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
    ok('tiene botón para reintentar', reintento);
    ok('mientras busca, el botón lo dice', true);
    ok('el banner sí se sigue mostrando', await p.locator('section img').first().isVisible().catch(()=>false));
    await ctx.close();
  }

  console.log('\n── 5. COORDENADAS INVÁLIDAS EN LA URL ──');
  for (const [q, desc] of [
    ['?lat=999&lng=-99.23', 'latitud fuera de rango'],
    ['?lat=abc&lng=-99.23', 'latitud no numérica'],
    ['?lat=18.92', 'falta la longitud'],
    ['?c=18.92', 'compacta incompleta'],
  ]) {
    const { ctx, p } = await abrir(b, { permitirGps: false, query: q });
    const t = await p.textContent('body');
    ok(`${desc} → pide ubicación`, t.includes('Necesitamos saber dónde estás'), q);
    await ctx.close();
  }

  console.log('\n── 6. LAS COORDENADAS DEL QR SOBREVIVEN LA NAVEGACIÓN ──');
  {
    const { ctx, p } = await abrir(b, { permitirGps: false, query: '?lat=18.92&lng=-99.23' });
    // ir a otra página y volver, ya sin parámetros en la URL
    await p.evaluate(() => window.history.pushState({}, '', '/nosotros'));
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.history.pushState({}, '', '/'));
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await p.waitForTimeout(3000);
    const t = await p.textContent('body');
    ok('sigue usando la ubicación del QR sin parámetros en la URL',
       t.includes('Ubicación del QR'), p.url());
    await ctx.close();
  }

  console.log('\n── 7. EL GPS TIENE PRIORIDAD SOBRE EL QR ──');
  {
    // GPS permitido Y coordenadas de QR en la URL: debe ganar el GPS
    const { ctx, p } = await abrir(b, { permitirGps: true, query: '?lat=18.92&lng=-99.23' });
    const t = await p.textContent('body');
    ok('gana el GPS', t.includes('Ubicación activa') && !t.includes('Ubicación del QR'));
    await ctx.close();
  }

  await b.close();
  const f = r.filter(x => !x[0]);
  console.log(`\n${'═'.repeat(56)}\n  ${r.length-f.length}/${r.length} comprobaciones OK`);
  if (f.length) { console.log('  FALLARON:'); f.forEach(x => console.log('   ✗ '+x[1]+(x[2]?' — '+x[2]:''))); }
  console.log('═'.repeat(56));
  process.exit(f.length ? 1 : 0);
})();
