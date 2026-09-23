const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const r = []; const ok = (n,c,x='') => { r.push([c,n,x]); console.log(`${c?'  ✓':'  ✗'} ${n}${x?' — '+x:''}`); };

async function goto(page, path) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (path !== '/') {
    await page.evaluate((p) => window.history.pushState({}, '', p), path);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(1400);
  }
}

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const ctx = await b.newContext({ geolocation:{latitude:18.92,longitude:-99.23}, permissions:['geolocation'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  console.log('\n── 1. EL VISITANTE NO VE "INGRESAR" ──');
  await goto(p,'/'); await p.waitForTimeout(2500);
  const body = await p.textContent('body');
  ok('no aparece la palabra "Ingresar"', !body.includes('Ingresar'));
  ok('no hay enlace visible al panel', !body.includes('Iniciar Sesión'));
  ok('el menú hamburguesa está presente',
     await p.locator('button[aria-label="Abrir menú"]').count() === 1);

  console.log('\n── 2. EL MENÚ HAMBURGUESA ──');
  await p.click('button[aria-label="Abrir menú"]');
  await p.waitForTimeout(800);
  const menu = await p.textContent('nav[aria-label="Menú principal"]');
  ok('tiene "¿Qué es Qplan?"', menu.includes('¿Qué es Qplan?'));
  ok('tiene "Nosotros"', menu.includes('Nosotros'));
  ok('tiene "Contacto"', menu.includes('Contacto'));

  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  ok('cierra con Escape', await p.locator('nav[aria-label="Menú principal"]').count() === 0);

  console.log('\n── 3. NAVEGACIÓN DEL MENÚ ──');
  for (const [texto, esperado] of [
    ['¿Qué es Qplan?', '/que-es-qplan'],
    ['Nosotros', '/nosotros'],
    ['Contacto', '/contacto'],
  ]) {
    await goto(p,'/'); await p.waitForTimeout(1800);
    await p.click('button[aria-label="Abrir menú"]'); await p.waitForTimeout(700);
    await p.locator('nav[aria-label="Menú principal"] button', { hasText: texto }).first().click();
    await p.waitForTimeout(1300);
    ok(`"${texto}" lleva a ${esperado}`, p.url().includes(esperado), p.url());
    const t = await p.textContent('body');
    ok(`  la página tiene contenido`, t.length > 600, `${t.length} caracteres`);
  }

  console.log('\n── 4. /panel ES EL ACCESO ──');
  await goto(p,'/panel'); await p.waitForTimeout(1600);
  const panel = await p.textContent('body');
  ok('/panel muestra el formulario de acceso', panel.includes('Acceso al panel'));
  ok('dice para quién es', panel.includes('administradores y dueños'));
  ok('NO ofrece registrarse', !panel.includes('Regístrate'));

  console.log('\n── 5. /login REDIRIGE A /panel ──');
  await goto(p,'/login'); await p.waitForTimeout(1600);
  ok('la ruta vieja redirige', p.url().includes('/panel'), p.url());

  console.log('\n── 6. LOGIN DE ADMIN DESDE /panel ──');
  await goto(p,'/panel'); await p.waitForTimeout(1500);
  await p.fill('input[name="email"]','admin@qplan.mx');
  await p.fill('input[name="password"]','qplan1234');
  await p.click('button[type="submit"]');
  await p.waitForTimeout(3000);
  ok('el admin entra a /admin', p.url().includes('/admin'), p.url());

  console.log('\n── 7. YA LOGUEADO, VE SU ATAJO ──');
  await goto(p,'/'); await p.waitForTimeout(2500);
  const conSesion = await p.textContent('body');
  ok('el admin sí ve su botón de panel', conSesion.includes('Admin'));
  ok('el menú sigue disponible',
     await p.locator('button[aria-label="Abrir menú"]').count() === 1);

  console.log('\n── 8. RUTA INEXISTENTE ──');
  await goto(p,'/pagina-que-no-existe'); await p.waitForTimeout(1500);
  ok('redirige al inicio', p.url().endsWith('/'), p.url());

  console.log('\n── 9. MÓVIL ──');
  const m = await b.newContext({viewport:{width:390,height:844},
    geolocation:{latitude:18.92,longitude:-99.23}, permissions:['geolocation']});
  const mp = await m.newPage();
  await mp.goto(BASE+'/',{waitUntil:'networkidle'}); await mp.waitForTimeout(2500);
  ok('el menú se ve en móvil',
     await mp.locator('button[aria-label="Abrir menú"]').isVisible());
  await mp.click('button[aria-label="Abrir menú"]'); await mp.waitForTimeout(800);
  ok('el panel abre a pantalla completa en móvil',
     await mp.locator('nav[aria-label="Menú principal"]').isVisible());

  ok('sin errores de JavaScript', errs.length === 0, errs.slice(0,2).join(' | '));

  await b.close();
  const f = r.filter(x => !x[0]);
  console.log(`\n${'═'.repeat(56)}\n  ${r.length-f.length}/${r.length} comprobaciones OK`);
  if (f.length) { console.log('  FALLARON:'); f.forEach(x => console.log('   ✗ '+x[1]+(x[2]?' — '+x[2]:''))); }
  console.log('═'.repeat(56));
  process.exit(f.length ? 1 : 0);
})();
