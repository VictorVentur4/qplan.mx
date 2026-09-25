const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const API = 'http://127.0.0.1:8000/api';
const r = []; const ok = (n,c,x='') => { r.push([c,n,x]); console.log(`${c?'  ✓':'  ✗'} ${n}${x?' — '+x:''}`); };

const visitas = async (token, dias=30) => {
  const res = await fetch(`${API}/admin/metrics/summary?dias=${dias}`, {headers:{Authorization:`Bearer ${token}`}});
  return res.json();
};

(async () => {
  const tok = (await (await fetch(`${API}/auth/login`, {method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@qplan.mx',password:'qplan1234'})})).json()).access_token;

  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

  console.log('\n── 1. UNA VISITA CUENTA UNA VEZ POR SESIÓN ──');
  {
    const antes = (await visitas(tok)).total_visitas;
    const ctx = await b.newContext({permissions:['geolocation'], geolocation:{latitude:18.92,longitude:-99.23}});
    const p = await ctx.newPage();
    // tres recargas en la MISMA sesión
    for (let i=0;i<3;i++){ await p.goto(BASE+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(1500); }
    await p.waitForTimeout(1500);
    const despues = (await visitas(tok)).total_visitas;
    ok('3 recargas = 1 visita', despues - antes === 1, `+${despues-antes}`);
    await ctx.close();
  }

  console.log('\n── 2. SESIONES DISTINTAS SÍ CUENTAN APARTE ──');
  {
    const antes = (await visitas(tok)).total_visitas;
    for (let i=0;i<3;i++){
      const ctx = await b.newContext({permissions:['geolocation'], geolocation:{latitude:18.92,longitude:-99.23}});
      const p = await ctx.newPage();
      await p.goto(BASE+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
      await ctx.close();
    }
    await new Promise(s=>setTimeout(s,1500));
    const despues = (await visitas(tok)).total_visitas;
    ok('3 sesiones = 3 visitas', despues - antes === 3, `+${despues-antes}`);
  }

  console.log('\n── 3. EL QR SE ATRIBUYE ──');
  // Se guarda fuera del bloque: la pantalla de métricas debe listar
  // justamente este código más abajo.
  const etiqueta = 'prueba-' + Math.random().toString(36).slice(2,8);
  {
    const ctx = await b.newContext({permissions:['geolocation'], geolocation:{latitude:18.92,longitude:-99.23}});
    const p = await ctx.newPage();
    await p.goto(`${BASE}/?c=18.92,-99.23&qr=${etiqueta}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(2500);
    const d = await visitas(tok);
    ok('la visita se atribuye al código', d.top_qr.some(q => q.qr_id === etiqueta), etiqueta);
    await ctx.close();
  }

  console.log('\n── 4. ABRIR UNA FICHA SE REGISTRA CON SU POSICIÓN ──');
  {
    const antes = (await visitas(tok)).total_vistas_negocios;
    const ctx = await b.newContext({permissions:['geolocation'], geolocation:{latitude:18.92,longitude:-99.23}});
    const p = await ctx.newPage();
    await p.goto(BASE+'/',{waitUntil:'networkidle'}); await p.waitForTimeout(2800);
    await p.locator('button', {hasText:'Ver más'}).first().click();
    await p.waitForTimeout(1500);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    // abrir la MISMA ficha otra vez no debe contar
    await p.locator('button', {hasText:'Ver más'}).first().click();
    await p.waitForTimeout(1800);
    const despues = (await visitas(tok)).total_vistas_negocios;
    ok('abrir dos veces la misma ficha = 1 vista', despues - antes === 1, `+${despues-antes}`);
    await ctx.close();
  }

  console.log('\n── 5. EL PANEL MUESTRA LAS MÉTRICAS ──');
  {
    const ctx = await b.newContext({viewport:{width:1440,height:1000}});
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(BASE+'/',{waitUntil:'networkidle'});
    await p.evaluate(()=>window.history.pushState({},'','/panel'));
    await p.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
    await p.waitForTimeout(1500);
    await p.fill('input[name="email"]','admin@qplan.mx');
    await p.fill('input[name="password"]','qplan1234');
    await p.click('button[type="submit"]');
    await p.waitForTimeout(3500);

    const t = await p.textContent('body');
    ok('la pestaña Métricas existe', t.includes('Métricas'));
    ok('abre en Métricas por defecto', t.includes('Visitas al sitio'));
    ok('muestra el total de fichas abiertas', t.includes('Fichas abiertas'));
    ok('separa QR de entrada directa', t.includes('Desde un QR') && t.includes('Entrada directa'));
    ok('dibuja la gráfica', await p.locator('svg[role="img"]').count() >= 1);
    ok('lista los negocios más vistos', t.includes('Negocios más vistos'));
    ok('muestra la posición promedio', t.includes('Posición promedio'));
    // Se busca el código generado en el paso 3, no uno fijo: así la prueba
    // no depende de qué datos tenga sembrados la base.
    ok('lista el origen de las visitas', t.includes(etiqueta), etiqueta);
    ok('advierte del sesgo por posición', t.includes('ganando por salir primero'));

    console.log('\n── 6. LA GRÁFICA TIENE VISTA DE TABLA ──');
    await p.locator('button[aria-label="Ver como tabla"]').first().click();
    await p.waitForTimeout(800);
    ok('se puede ver como tabla',
       await p.locator('button[aria-label="Ver como gráfica"]').count() > 0);
    await p.locator('button[aria-label="Ver como gráfica"]').first().click();
    await p.waitForTimeout(500);

    console.log('\n── 7. CAMBIAR EL RANGO RECARGA TODO ──');
    await p.locator('button[role="combobox"]').first().click();
    await p.waitForTimeout(600);
    await p.locator('[role="option"]', {hasText:'Últimos 7 días'}).first().click();
    await p.waitForTimeout(2000);
    ok('el rango de 7 días se aplica',
       (await p.textContent('body')).includes('Últimos 7 días'));

    console.log('\n── 8. DESCARGA DEL REPORTE ──');
    const descarga = p.waitForEvent('download', {timeout:15000}).catch(()=>null);
    await p.locator('table button[title*="reporte"]').first().click();
    const archivo = await descarga;
    ok('descarga el CSV del negocio', archivo !== null, archivo?.suggestedFilename());

    ok('sin errores de JavaScript', errs.length === 0, errs.slice(0,2).join(' | '));
    await ctx.close();
  }

  await b.close();
  const f = r.filter(x=>!x[0]);
  console.log(`\n${'═'.repeat(56)}\n  ${r.length-f.length}/${r.length} comprobaciones OK`);
  if (f.length) { console.log('  FALLARON:'); f.forEach(x=>console.log('   ✗ '+x[1]+(x[2]?' — '+x[2]:''))); }
  console.log('═'.repeat(56));
  process.exit(f.length?1:0);
})();
