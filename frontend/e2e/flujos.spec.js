const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
const results = [];
let publicos = 0;
const p2CountRows = async (page) => page.locator('table tbody tr').count();
const ok = (n, c, extra = '') => { results.push([c, n, extra]); console.log(`${c ? '  ✓' : '  ✗'} ${n}${extra ? ' — ' + extra : ''}`); };

// El build sirve una SPA desde http.server, que no reescribe rutas.
// Entramos siempre por "/" y navegamos con el router.
async function goto(page, path) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (path !== '/') {
    await page.evaluate((p) => window.history.pushState({}, '', p), path);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(1200);
  }
}

async function login(page, email) {
  await goto(page, '/panel');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'qplan1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    geolocation: { latitude: 18.92, longitude: -99.23 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('\n── HOME (visitante) ──');
  await goto(page, '/');
  await page.waitForTimeout(2500);

  ok('el banner publicitario se muestra',
     await page.locator('section img').first().isVisible().catch(() => false));

  const cards = await page.locator('h3.text-lg.font-bold').count();
  publicos = cards;
  ok('se listan los negocios cercanos', cards >= 2, `${cards} tarjetas`);

  const body = await page.textContent('body');
  ok('el filtro arranca en "Todos"', body.includes('Todos'));
  ok('se ven negocios de más de una categoría',
     body.includes('Cafe Central') && body.includes('Tacos El Paso'));

  console.log('\n── FILTRO POR CATEGORÍA ──');
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(600);
  const opciones = await page.locator('[role="option"]').allTextContents();
  ok('las categorías vienen de la base de datos',
     opciones.some(o => o.includes('Cafeterías')) && opciones.some(o => o.includes('Restaurantes')),
     opciones.join(' / '));
  ok('las categorías ocultas no aparecen', !opciones.some(o => o.toLowerCase().includes('municipal')));

  await page.locator('[role="option"]', { hasText: 'Cafeterías' }).first().click();
  await page.waitForTimeout(2000);
  const txtCafe = await page.textContent('body');
  ok('al filtrar solo quedan las cafeterías',
     txtCafe.includes('Cafe Central') && !txtCafe.includes('Tacos El Paso'));

  ok('las tarjetas muestran iconos de amenidades',
     await page.locator('span[title="WiFi"]').count() > 0);

  console.log('\n── MODAL DE DETALLE ──');
  await page.locator('button', { hasText: 'Ver más' }).first().click();
  await page.waitForTimeout(1200);
  ok('el modal de detalle abre', await page.locator('[data-testid="business-modal"]').count() > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  console.log('\n── LOGIN COMO DUEÑO DE NEGOCIO ──');
  await login(page, 'cafe@qplan.mx');
  ok('el dueño aterriza en su panel', page.url().includes('/negocio'), page.url());
  const dueno = await page.textContent('body');
  ok('ve el nombre de su negocio', dueno.includes('Cafe Central'));
  ok('NO ve negocios de otros', !dueno.includes('Tacos El Paso'));
  ok('no tiene acceso al panel de admin', !dueno.includes('Panel de administración'));

  console.log('\n── EL DUEÑO EDITA SU NEGOCIO ──');
  await page.locator('button', { hasText: 'Editar' }).first().click();
  await page.waitForTimeout(1200);
  const nuevaDesc = 'Descripción editada desde el navegador ' + Date.now();
  await page.fill('textarea', nuevaDesc);
  await page.locator('button[type="submit"]', { hasText: 'Guardar' }).click();
  await page.waitForTimeout(2500);
  ok('el cambio del dueño persiste', (await page.textContent('body')).includes(nuevaDesc));

  console.log('\n── UN DUEÑO NO PUEDE ENTRAR A /admin ──');
  await goto(page, '/admin');
  await page.waitForTimeout(1500);
  ok('se le expulsa del panel de admin',
     !(await page.textContent('body')).includes('Panel de administración'));

  console.log('\n── LOGIN COMO ADMIN ──');
  await ctx.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, 'admin@qplan.mx');
  ok('el admin aterriza en /admin', page.url().includes('/admin'), page.url());

  const admin = await page.textContent('body');
  ok('ve TODOS los negocios', admin.includes('Cafe Central') && admin.includes('Tacos El Paso'));
  await page.locator('button[role="tab"]', { hasText: 'Negocios' }).click();
  await page.waitForTimeout(1500);
  const filasAdmin = await p2CountRows(page);
  ok('ve al menos tantos negocios como el público', filasAdmin >= publicos,
     `${filasAdmin} en admin vs ${publicos} públicos`);
  ok('el resumen muestra estadísticas', admin.includes('Negocios activos'));
  ok('están todas las pestañas',
     ['Métricas', 'Negocios', 'Categorías', 'Amenidades', 'Banners', 'Usuarios']
       .every(t => admin.includes(t)));

  console.log('\n── ADMIN: FILTRO POR CATEGORÍA ──');
  // el panel abre en Métricas, así que primero vamos a Negocios
  await page.locator('button[role="tab"]', { hasText: 'Negocios' }).click();
  await page.waitForTimeout(1200);
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[role="option"]', { hasText: 'Restaurantes' }).first().click();
  await page.waitForTimeout(1200);
  const filtrado = await page.textContent('body');
  ok('el filtro del panel funciona',
     filtrado.includes('Tacos El Paso') && !filtrado.includes('Cafe Central'));

  console.log('\n── ADMIN: DESACTIVAR NEGOCIO ──');
  const confirmar = async () => {
    const boton = page.locator('button', { hasText: 'Confirmar' });
    await boton.waitFor({ state: 'visible', timeout: 10000 });
    await boton.click();
    // esperar a que el diálogo se cierre antes de seguir
    await boton.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
  };

  await page.locator('table button').nth(1).click();
  await page.waitForTimeout(900);
  ok('pide confirmación antes de desactivar',
     (await page.textContent('body')).includes('¿Desactivar negocio?'));
  await confirmar();
  ok('el negocio queda inactivo',
     (await page.textContent('body')).includes('Inactivo'));
  // revertir
  await page.locator('table button').nth(1).click();
  await page.waitForTimeout(900);
  await confirmar();

  console.log('\n── ADMIN: PESTAÑA CATEGORÍAS ──');
  await page.locator('button[role="tab"]', { hasText: 'Categorías' }).click();
  await page.waitForTimeout(1200);
  const cats = await page.textContent('body');
  ok('lista las categorías con su conteo', cats.includes('Cafeterías') && cats.includes('restaurant'));
  ok('permite agregar una categoría',
     await page.locator('button', { hasText: 'Agregar categoría' }).count() > 0);

  console.log('\n── ADMIN: PESTAÑA USUARIOS ──');
  await page.locator('button[role="tab"]', { hasText: 'Usuarios' }).click();
  await page.waitForTimeout(1200);
  const us = await page.textContent('body');
  ok('lista usuarios con su rol y negocio',
     us.includes('admin@qplan.mx') && us.includes('Dueño de negocio'));

  console.log('\n── ERRORES DE CONSOLA ──');
  const reales = errors.filter(e => !/favicon|404|ERR_/i.test(e));
  ok('sin errores de JavaScript', reales.length === 0, reales.slice(0, 3).join(' | '));

  await browser.close();

  const fallidos = results.filter(r => !r[0]);
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  ${results.length - fallidos.length}/${results.length} comprobaciones OK`);
  if (fallidos.length) {
    console.log('  FALLARON:');
    fallidos.forEach(f => console.log('   ✗ ' + f[1] + (f[2] ? ' — ' + f[2] : '')));
  }
  console.log('═'.repeat(58));
  process.exit(fallidos.length ? 1 : 0);
})();
