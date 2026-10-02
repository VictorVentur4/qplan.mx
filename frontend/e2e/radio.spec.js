/**
 * Comprobaciones de navegador del selector de distancia.
 *
 * Los negocios están sembrados a 0.4, 1.8, 3.6, 7.2, 12.4, 17.5 y 24 km
 * del punto de referencia, así que cada opción del selector tiene un
 * número de resultados esperado y verificable.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const results = [];
const ok = (n, c, extra = '') => {
  results.push([c, n, extra]);
  console.log(`${c ? '  ✓' : '  ✗'} ${n}${extra ? ' — ' + extra : ''}`);
};

const ESPERADO = { 1: 1, 5: 3, 10: 4, 15: 5, 20: 6 };

const tarjetas = (p) => p.locator('h3.text-lg.font-bold').count();

async function elegirRadio(p, km) {
  // Si hay un modal abierto, intercepta los clics: se cierra primero.
  if (await p.locator('[data-testid="business-modal"]').count()) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
  }
  await p.locator('[data-testid="selector-radio"]').click();
  await p.waitForTimeout(500);
  await p.locator('[role="option"]', { hasText: new RegExp(`^${km} km`) }).first().click();
  await p.waitForTimeout(1800);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const nuevoCtx = () => browser.newContext({
    viewport: { width: 1280, height: 950 },
    geolocation: { latitude: 18.92, longitude: -99.23 },
    permissions: ['geolocation'],
  });

  let ctx = await nuevoCtx();
  let page = await ctx.newPage();
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);

  console.log('\n── 1. ARRANCA EN 5 KM ──');
  ok('el selector existe', await page.locator('[data-testid="selector-radio"]').count() > 0);
  const inicial = await page.textContent('[data-testid="selector-radio"]');
  ok('viene preseleccionado en 5 km', inicial.includes('5 km'), inicial.trim());
  ok('se listan los 3 negocios que caben en 5 km',
     await tarjetas(page) === ESPERADO[5], `${await tarjetas(page)} tarjetas`);
  ok('el subtítulo dice la distancia',
     (await page.textContent('body')).includes('a 5 km de ti'));

  console.log('\n── 2. CADA OPCIÓN FILTRA ──');
  for (const km of [1, 10, 15, 20]) {
    await elegirRadio(page, km);
    const n = await tarjetas(page);
    ok(`${km} km → ${ESPERADO[km]} negocios`, n === ESPERADO[km], `salieron ${n}`);
  }

  console.log('\n── 3. EL DE 24 KM NUNCA SALE ──');
  ok('el negocio a 24 km queda fuera incluso en el máximo',
     !(await page.textContent('body')).includes('Balneario Las Huertas'));

  console.log('\n── 4. LA ELECCIÓN SE RECUERDA ──');
  await elegirRadio(page, 10);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
  const tras = await page.textContent('[data-testid="selector-radio"]');
  ok('tras recargar sigue en 10 km', tras.includes('10 km'), tras.trim());
  ok('y muestra los negocios de 10 km', await tarjetas(page) === ESPERADO[10]);

  console.log('\n── 5. SIN RESULTADOS OFRECE AMPLIAR ──');
  // Farmacias: la única está a 7.2 km, así que a 1 km no hay ninguna.
  await elegirRadio(page, 1);
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[role="option"]', { hasText: 'Farmacias' }).first().click();
  await page.waitForTimeout(1800);

  ok('aparece el estado vacío',
     await page.locator('[data-testid="sin-resultados"]').count() > 0);
  const vacio = await page.textContent('[data-testid="sin-resultados"]');
  ok('el mensaje dice qué se buscó y a qué distancia',
     vacio.includes('farmacias') && vacio.includes('1 km'), vacio.replace(/\s+/g, ' ').trim());
  ok('ofrece el siguiente salto',
     await page.locator('[data-testid="ampliar-radio"]').count() > 0);

  const boton = await page.textContent('[data-testid="ampliar-radio"]');
  ok('el botón propone 5 km', boton.includes('5 km'), boton.trim());
  await page.locator('[data-testid="ampliar-radio"]').click();
  await page.waitForTimeout(2000);
  ok('al ampliar, el selector queda en 5 km',
     (await page.textContent('[data-testid="selector-radio"]')).includes('5 km'));

  // A 5 km sigue sin haber farmacias; el botón debe proponer ahora 10.
  const boton2 = await page.textContent('[data-testid="ampliar-radio"]').catch(() => '');
  ok('y vuelve a ofrecer el siguiente salto', boton2.includes('10 km'), boton2.trim());
  await page.locator('[data-testid="ampliar-radio"]').click();
  await page.waitForTimeout(2000);
  ok('a 10 km sí aparece la farmacia',
     (await page.textContent('body')).includes('Farmacia San Rafael'));
  ok('ya no se ofrece ampliar cuando hay resultados',
     await page.locator('[data-testid="ampliar-radio"]').count() === 0);

  console.log('\n── 6. EN EL MÁXIMO NO SE OFRECE AMPLIAR ──');
  await elegirRadio(page, 20);
  await page.locator('button[role="combobox"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[role="option"]', { hasText: 'Transporte' }).first().click();
  await page.waitForTimeout(1800);
  ok('sin resultados y en el tope, no hay botón de ampliar',
     await page.locator('[data-testid="sin-resultados"]').count() > 0 &&
     await page.locator('[data-testid="ampliar-radio"]').count() === 0);

  console.log('\n── 7. LO DE LA ENTREGA ANTERIOR SIGUE FUNCIONANDO ──');
  await ctx.close();
  ctx = await nuevoCtx();
  page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);

  const abrir = async (nombre) => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    const card = page.locator('[class*="rounded-3xl"]').filter({ hasText: nombre })
      .filter({ has: page.locator('button', { hasText: 'Ver más' }) }).last();
    await card.scrollIntoViewIfNeeded();
    await card.locator('button', { hasText: 'Ver más' }).first().click();
    await page.waitForSelector('[data-testid="business-modal"]');
    await page.waitForTimeout(700);
  };

  await abrir('Cafe Central');
  const enlaces = await page.locator('[data-testid="social-links"] a')
    .evaluateAll(as => as.map(a => a.href));
  ok('las redes sociales siguen ahí',
     enlaces.some(h => h.includes('wa.me/527773124480')) &&
     enlaces.some(h => h.includes('instagram.com/cafecentral.cva')) &&
     enlaces.some(h => h.includes('facebook.com/CafeCentralCuernavaca')),
     enlaces.join(' '));
  const mapa = await page.locator('[data-testid="direccion-mapa"] a').getAttribute('href');
  ok('la dirección sigue llevando al mapa con coordenadas',
     mapa && mapa.includes('maps/search/?api=1&query=18.92'), mapa);

  await elegirRadio(page, 10);
  await abrir('Farmacia San Rafael');
  ok('el horario de 24 horas sigue colapsado',
     await page.locator('[data-testid="horario-24h"]').count() > 0);
  ok('dice "Abierto las 24 horas"',
     (await page.textContent('[data-testid="business-modal"]')).includes('Abierto las 24 horas'));

  console.log('\n── 8. ERRORES DE CONSOLA ──');
  const reales = errores.filter(e => !/favicon|404|ERR_|Download the React/i.test(e));
  ok('sin errores de JavaScript', reales.length === 0, reales.slice(0, 3).join(' | '));

  await browser.close();
  const malos = results.filter(r => !r[0]);
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  ${results.length - malos.length}/${results.length} comprobaciones OK`);
  if (malos.length) {
    console.log('  FALLARON:');
    malos.forEach(f => console.log('   ✗ ' + f[1] + (f[2] ? ' — ' + f[2] : '')));
  }
  console.log('═'.repeat(58));
  process.exit(malos.length ? 1 : 0);
})();
