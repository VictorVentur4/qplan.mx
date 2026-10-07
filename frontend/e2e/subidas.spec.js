/**
 * Comprobaciones de navegador: ajustes de la API de imágenes, subida con
 * vista previa, y selector de coordenadas con mapa.
 *
 * Requiere la API falsa de imágenes en http://127.0.0.1:8099 (php_falso.py).
 * Los mosaicos de OpenStreetMap no se cargan en este entorno, así que las
 * pruebas del mapa comprueban el comportamiento, no la imagen de fondo.
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'http://localhost:3000';
const results = [];
const ok = (n, c, extra = '') => {
  results.push([c, n, extra]);
  console.log(`${c ? '  ✓' : '  ✗'} ${n}${extra ? ' — ' + extra : ''}`);
};

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

async function entrar(p, ruta = '/panel') {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate((r) => window.history.pushState({}, '', r), ruta);
  await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
  await p.waitForTimeout(1300);
}

async function login(p) {
  await entrar(p, '/panel');
  await p.fill('input[name="email"]', 'admin@qplan.mx');
  await p.fill('input[name="password"]', 'qplan1234');
  await p.click('button[type="submit"]');
  await p.waitForTimeout(3200);
}

const irA = async (p, tab) => {
  await p.locator('button[role="tab"]', { hasText: tab }).click();
  await p.waitForTimeout(1400);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 950 },
    geolocation: { latitude: 18.9242, longitude: -99.2216 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));

  await login(page);

  console.log('\n── 1. LA PESTAÑA DE AJUSTES ──');
  await irA(page, 'Ajustes');
  ok('existe la pestaña Ajustes',
     await page.locator('[data-testid="ajustes-subidas"]').count() > 0);
  ok('pide la dirección de la API',
     await page.locator('[data-testid="campo-endpoint"]').count() > 0);
  ok('la llave se escribe oculta',
     await page.locator('[data-testid="campo-llave"]').getAttribute('type') === 'password');

  console.log('\n── 2. CONFIGURAR DESDE EL PANEL, SIN TOCAR ARCHIVOS ──');
  await page.fill('[data-testid="campo-endpoint"]', 'http://127.0.0.1:8099/subir');
  await page.fill('[data-testid="campo-llave"]', 'llave-de-prueba-123');
  await page.fill('[data-testid="campo-maxkb"]', '2048');
  const sw = page.locator('button[role="switch"]').first();
  if (await sw.getAttribute('data-state') !== 'checked') await sw.click();
  await page.locator('button', { hasText: 'Guardar' }).first().click();
  await page.waitForTimeout(1800);

  const cuerpo = await page.textContent('body');
  ok('confirma que la llave quedó configurada', cuerpo.includes('configurada'));
  ok('solo muestra una pista de la llave, nunca completa',
     cuerpo.includes('••••') && !cuerpo.includes('llave-de-prueba-123'));

  console.log('\n── 3. PROBAR CONEXIÓN ──');
  await page.locator('[data-testid="boton-probar"]').click();
  await page.waitForSelector('[data-testid="resultado-prueba"]', { timeout: 15000 });
  const res = await page.textContent('[data-testid="resultado-prueba"]');
  ok('reporta que la conexión funciona', res.includes('La conexión funciona'), res.slice(0, 80));
  // Se comprueba que haya detectado UNA url, no un dominio concreto: el de
  // la API simulada puede cambiar y eso no dice nada del código.
  ok('muestra la URL detectada', /URL detectada:\s*https?:\/\/\S+/.test(res));
  ok('muestra la respuesta cruda para diagnosticar', res.includes('"ok"'));
  ok('avisa que pidió comprimir', res.includes('2048 KB'), res.match(/comprimir[^.]*/)?.[0] || '');

  console.log('\n── 4. LA LLAVE NO VIAJA AL NAVEGADOR ──');
  const expuesta = await page.evaluate(async () => {
    const t = localStorage.token;
    const r = await fetch('http://localhost:8000/api/admin/settings/uploads',
                          { headers: { Authorization: 'Bearer ' + t } });
    return JSON.stringify(await r.json());
  });
  ok('la API no devuelve la llave', !expuesta.includes('llave-de-prueba-123'), expuesta.slice(0, 120));

  console.log('\n── 5. SUBIR EL LOGOTIPO ──');
  await irA(page, 'Negocios');
  await page.locator('button', { hasText: 'Agregar negocio' }).first().click();
  await page.waitForTimeout(1600);

  ok('el logotipo ya no se pide como URL suelta',
     (await page.textContent('form')).includes('Logotipo'));
  ok('hay zona de imagen con vista previa',
     await page.locator('[data-testid="zona-imagen"]').count() > 0);

  const entradas = page.locator('input[type="file"]');
  await entradas.first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('[data-testid="subida-exitosa"]', { timeout: 20000 });
  ok('avisa que la subida fue exitosa', true);
  ok('muestra cuánto comprimió la API',
     await page.locator('[data-testid="compresion"]').count() > 0,
     (await page.textContent('[data-testid="compresion"]').catch(() => '')).trim());

  const src = await page.locator('[data-testid="zona-imagen"] img').getAttribute('src');
  ok('la vista previa ya no es el archivo local, sino la URL del servidor',
     !!src && /^https?:\/\//.test(src) && !src.startsWith('data:'), src);

  console.log('\n── 6. EL BOTÓN DE CÁMARA EXISTE Y ABRE LA CÁMARA ──');
  const capturas = await page.locator('input[type="file"][capture]').count();
  ok('hay entradas con capture para la cámara del celular', capturas >= 2, `${capturas}`);

  console.log('\n── 7. GALERÍA: VARIAS FOTOS DE UN JALÓN ──');
  const galeria = page.locator('input[type="file"][multiple]').first();
  await galeria.setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
    { name: 'c.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.waitForSelector('[data-testid="galeria-exitosa"]', { timeout: 30000 });
  const txtGal = await page.textContent('[data-testid="galeria-exitosa"]');
  ok('confirma cuántas imágenes se subieron', txtGal.includes('3'), txtGal.trim());
  ok('el contador llega a 3 de 5', (await page.textContent('form')).includes('3 de 5'));

  console.log('\n── 8. RECHAZA ARCHIVOS QUE NO SON IMAGEN ──');
  await entradas.first().setInputFiles({
    name: 'malo.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await page.waitForTimeout(1200);
  ok('muestra el error sin subir nada',
     await page.locator('[data-testid="error-subida"]').count() > 0);
  const err = await page.textContent('[data-testid="error-subida"]');
  ok('el mensaje dice qué formatos sí acepta', err.includes('JPG'), err.trim());

  console.log('\n── 9. SELECTOR DE COORDENADAS ──');
  ok('el mapa está en el formulario',
     await page.locator('[data-testid="mapa-selector"]').count() > 0);
  ok('tiene el botón «Estoy aquí»',
     await page.locator('[data-testid="estoy-aqui"]').count() > 0);

  const leer = async () => ({
    lat: Number(await page.locator('input[type="number"]').nth(0).inputValue()),
    lng: Number(await page.locator('input[type="number"]').nth(1).inputValue()),
  });

  console.log('\n── 10. «ESTOY AQUÍ» TOMA EL GPS ──');
  await page.locator('[data-testid="estoy-aqui"]').click();
  await page.waitForTimeout(2500);
  const gps = await leer();
  ok('la latitud viene del GPS', Math.abs(gps.lat - 18.9242) < 0.001, String(gps.lat));
  ok('la longitud viene del GPS', Math.abs(gps.lng + 99.2216) < 0.001, String(gps.lng));

  console.log('\n── 11. PEGAR COORDENADAS DE GOOGLE MAPS ──');
  await page.fill('[data-testid="pegar-coords"]', '18.918500, -99.234100');
  await page.locator('button', { hasText: /^Ir$/ }).first().click();
  await page.waitForTimeout(1200);
  const peg = await leer();
  ok('se aplican las coordenadas pegadas',
     Math.abs(peg.lat - 18.9185) < 1e-4 && Math.abs(peg.lng + 99.2341) < 1e-4,
     `${peg.lat}, ${peg.lng}`);

  await page.fill('[data-testid="pegar-coords"]', 'esto no son coordenadas');
  await page.locator('button', { hasText: /^Ir$/ }).first().click();
  await page.waitForTimeout(900);
  ok('avisa cuando el texto pegado no sirve',
     await page.locator('[data-testid="aviso-mapa"]').count() > 0);

  console.log('\n── 12. TOCAR EL MAPA MUEVE EL PIN ──');
  const antes = await leer();
  const caja = await page.locator('[data-testid="mapa-selector"]').boundingBox();
  await page.mouse.click(caja.x + caja.width * 0.68, caja.y + caja.height * 0.34);
  await page.waitForTimeout(1200);
  const despues = await leer();
  ok('las coordenadas cambian al tocar el mapa',
     despues.lat !== antes.lat || despues.lng !== antes.lng,
     `${antes.lat},${antes.lng} → ${despues.lat},${despues.lng}`);
  ok('siguen siendo coordenadas válidas',
     Math.abs(despues.lat) <= 90 && Math.abs(despues.lng) <= 180);

  console.log('\n── 13. GUARDAR EL NEGOCIO COMPLETO ──');
  // Se localiza cada campo por su etiqueta, no por posición: el formulario
  // va a seguir creciendo y una prueba por índice se rompe sola.
  const porEtiqueta = (texto) =>
    page.locator('.space-y-2', { has: page.locator(`label:text-is("${texto}")`) })
        .locator('input, textarea').first();

  await porEtiqueta('Nombre').fill('Negocio desde el celular');
  await porEtiqueta('Descripción').fill('Alta con foto subida y coordenadas puestas en el mapa.');
  await porEtiqueta('Dirección').fill('Av. de prueba 1, Centro');

  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(3200);

  const dialogoAbierto = await page.locator('[role="dialog"]').count() > 0;
  ok('el formulario se cierra al guardar', !dialogoAbierto);

  const guardado = await page.textContent('body');
  ok('el negocio aparece en el listado', guardado.includes('Negocio desde el celular'));

  // Y lo importante: que lo subido y lo marcado en el mapa quedaran guardados.
  const enApi = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8000/api/businesses');
    const b = (await r.json()).find(x => x.name === 'Negocio desde el celular');
    return b ? { logo: b.logo, imgs: (b.images || []).length, lat: b.latitude, lng: b.longitude } : null;
  });
  ok('guardó el logotipo subido',
     !!enApi && /^https?:\/\//.test(String(enApi.logo)), JSON.stringify(enApi));
  ok('guardó las 3 fotos de la galería', !!enApi && enApi.imgs === 3);
  ok('guardó las coordenadas del mapa',
     !!enApi && Math.abs(enApi.lat - 18.9189) < 0.01 && Math.abs(enApi.lng + 99.2329) < 0.01,
     enApi ? `${enApi.lat}, ${enApi.lng}` : '');

  console.log('\n── 14. ERRORES DE CONSOLA ──');
  const reales = errores.filter(e => !/favicon|404|ERR_|Download the React|tile\.openstreetmap/i.test(e));
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
