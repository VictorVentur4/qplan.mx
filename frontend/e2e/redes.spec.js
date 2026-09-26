/**
 * Comprobaciones de navegador: redes sociales, enlace a mapas y horario 24 h.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
const results = [];
const ok = (n, c, extra = '') => {
  results.push([c, n, extra]);
  console.log(`${c ? '  ✓' : '  ✗'} ${n}${extra ? ' — ' + extra : ''}`);
};

async function goto(page, path) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (path !== '/') {
    await page.evaluate((p) => window.history.pushState({}, '', p), path);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(1200);
  }
}

async function abrirNegocio(page, nombre) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  // Se busca la tarjeta por su botón "Ver más": el banner publicitario
  // también es un rounded-3xl y puede llevar el nombre del negocio.
  const card = page
    .locator('[class*="rounded-3xl"]')
    .filter({ hasText: nombre })
    .filter({ has: page.locator('button', { hasText: 'Ver más' }) })
    .last();
  await card.scrollIntoViewIfNeeded();
  await card.locator('button', { hasText: 'Ver más' }).first().click();
  await page.waitForSelector('[data-testid="business-modal"]', { timeout: 8000 });
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 18.92, longitude: -99.23 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  await goto(page, '/');
  await page.waitForTimeout(2500);

  console.log('\n── 1. REDES SOCIALES EN EL DETALLE ──');
  await abrirNegocio(page, 'Cafe Central');

  const bloque = page.locator('[data-testid="social-links"]');
  ok('se muestra el bloque de redes', await bloque.count() > 0);

  const enlaces = await bloque.locator('a').evaluateAll(
    (as) => as.map((a) => ({ href: a.href, texto: a.textContent.trim(), target: a.target }))
  );
  console.log('    ', JSON.stringify(enlaces));

  ok('el enlace de WhatsApp usa wa.me con lada',
     enlaces.some(e => e.href === 'https://wa.me/527773124480'));
  ok('el enlace de Instagram apunta al usuario',
     enlaces.some(e => e.href.startsWith('https://instagram.com/cafecentral.cva')));
  ok('el enlace de Facebook apunta a la página',
     enlaces.some(e => e.href.startsWith('https://facebook.com/CafeCentralCuernavaca')));
  ok('el teléfono se muestra formateado',
     enlaces.some(e => e.texto.includes('+52 777 312 4480')), enlaces.map(e => e.texto).join(' | '));
  ok('las redes abren en otra pestaña', enlaces.every(e => e.target === '_blank'));

  console.log('\n── 2. LA DIRECCIÓN LLEVA AL MAPA CON LAS COORDENADAS ──');
  const dir = page.locator('[data-testid="direccion-mapa"] a');
  const hrefMapa = await dir.getAttribute('href');
  ok('la dirección es un enlace', Boolean(hrefMapa), hrefMapa || '(sin enlace)');
  ok('el enlace lleva las coordenadas exactas del negocio',
     hrefMapa === 'https://www.google.com/maps/search/?api=1&query=18.9215,-99.234', hrefMapa);
  ok('avisa a dónde va',
     (await page.textContent('[data-testid="direccion-mapa"]')).includes('Ver en Google Maps'));

  console.log('\n── 3. UN NEGOCIO SIN REDES NO MUESTRA NADA ──');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await abrirNegocio(page, 'Gasolinera Del Valle');
  ok('no se dibuja el bloque de redes',
     await page.locator('[data-testid="social-links"]').count() === 0);
  ok('tampoco aparece el título "Redes sociales"',
     !(await page.textContent('[data-testid="business-modal"]')).includes('Redes sociales'));

  console.log('\n── 4. NEGOCIO ABIERTO 24 HORAS ──');
  ok('muestra el bloque de 24 horas',
     await page.locator('[data-testid="horario-24h"]').count() > 0);
  const t24 = await page.textContent('[data-testid="business-modal"]');
  ok('dice "Abierto las 24 horas"', t24.includes('Abierto las 24 horas'));
  ok('NO lista los siete días', !/Lunes[\s\S]*Martes[\s\S]*Miércoles/.test(t24));
  ok('no aparece ningún rango de horas', !/\d{2}:\d{2}\s*–\s*\d{2}:\d{2}/.test(t24));

  console.log('\n── 5. NEGOCIO CON HORARIO NORMAL SIGUE IGUAL ──');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await abrirNegocio(page, 'Panadería La Espiga');
  const tn = await page.textContent('[data-testid="business-modal"]');
  ok('lista los días de la semana', tn.includes('Lunes') && tn.includes('Domingo'));
  ok('muestra el rango de horas', tn.includes('06:00 – 20:00'));
  ok('no dice 24 horas', !tn.includes('Abierto las 24 horas'));
  ok('solo muestra las redes que sí tiene',
     (await page.locator('[data-testid="social-links"] a').count()) === 1);

  console.log('\n── 6. MEZCLA: 24 H ALGUNOS DÍAS ──');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await abrirNegocio(page, 'Hotel Jardín Real');
  const tm = await page.textContent('[data-testid="business-modal"]');
  ok('lista los días (no colapsa)', tm.includes('Lunes') && tm.includes('Sábado'));
  ok('el día de 24 h dice "24 horas"', tm.includes('24 horas'));
  ok('el día normal muestra su rango', tm.includes('07:00 – 23:00'));

  console.log('\n── 7. EL FORMULARIO DEL ADMIN ──');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await goto(page, '/panel');
  await page.fill('input[name="email"]', 'admin@qplan.mx');
  await page.fill('input[name="password"]', 'qplan1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.locator('button[role="tab"]', { hasText: 'Negocios' }).click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'Agregar negocio' }).first().click();
  await page.waitForTimeout(1200);

  // Los campos se identifican por aria-label: el texto va en el placeholder,
  // que no aparece en textContent.
  const camposRed = [];
  for (const r of ['WhatsApp', 'Instagram', 'Facebook']) {
    camposRed.push(await page.locator(`input[aria-label="${r}"]`).count());
  }
  ok('el formulario pide las tres redes', camposRed.every(n => n === 1),
     `whatsapp/instagram/facebook: ${camposRed.join('/')}`);

  // Un botón de 24 h por cada día abierto. El horario por defecto abre de
  // lunes a viernes, así que son 5, no 7.
  const abiertos = await page.locator('button[role="switch"][data-state="checked"]').count();
  const botones24 = await page.locator('button', { hasText: /^24 h$/ }).count();
  ok('hay un botón de 24 h por cada día abierto', botones24 === abiertos && abiertos > 0,
     `${botones24} botones / ${abiertos} días abiertos`);
  ok('tiene el atajo de semana completa',
     await page.locator('button', { hasText: 'Abierto 24 h' }).count() > 0);

  console.log('\n── 8. EL ATAJO DE 24 H APAGA LAS HORAS ──');
  const antes = await page.locator('input[type="time"]').count();
  await page.locator('button', { hasText: 'Abierto 24 h' }).first().click();
  await page.waitForTimeout(700);
  const despues = await page.locator('input[type="time"]').count();
  ok('desaparecen los campos de hora', antes > 0 && despues === 0, `${antes} → ${despues}`);
  ok('aparece el texto de 24 horas en cada día',
     (await page.locator('text=Abierto las 24 horas').count()) >= 7);
  await page.locator('button', { hasText: 'Abierto 24 h' }).first().click();
  await page.waitForTimeout(700);
  ok('se puede volver atrás', (await page.locator('input[type="time"]').count()) > 0);

  console.log('\n── 9. ERRORES DE CONSOLA ──');
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
