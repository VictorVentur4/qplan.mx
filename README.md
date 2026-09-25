# Qplan.mx

Directorio B2B de negocios con geolocalización, categorías administrables y
banners publicitarios.

## Stack

| Capa          | Tecnología                                                  |
|---------------|-------------------------------------------------------------|
| Backend       | FastAPI (Python) + `asyncpg`                                |
| Base de datos | **PostgreSQL (Supabase)**                                   |
| Frontend      | React 19 + Create React App (CRACO) + Tailwind + shadcn/ui  |
| Auth          | JWT (`pyjwt`) + `passlib`/`bcrypt`                          |

## Roles

| Rol              | Qué ve                                                              |
|------------------|---------------------------------------------------------------------|
| *(visitante)*    | Home: banner, negocios cercanos y filtro por categoría               |
| `user`           | Lo mismo, con sesión iniciada                                        |
| `business_owner` | `/negocio` — únicamente su propio negocio, que puede editar          |
| `admin`          | `/admin` — todos los negocios, categorías, amenidades, banners y usuarios |

## Ubicación del usuario y códigos QR

La home resuelve la ubicación con esta prioridad:

1. **GPS del navegador**, si el usuario lo comparte.
2. **Coordenadas del código QR**, tomadas de la URL.
3. **Ninguna**: se muestra un aviso pidiendo la ubicación. No se listan negocios.

No existe una ciudad de respaldo. Mostrar negocios de otro lado como si
fueran cercanos engaña al usuario, así que se prefiere no mostrar nada.

### Formato de la URL del QR

Dos formas equivalentes:

```
https://qplan.mx/?lat=18.9261&lng=-99.2308
https://qplan.mx/?c=18.9261,-99.2308
```

La segunda genera un QR más pequeño y por tanto más fácil de escanear.
También se aceptan `latitude`/`longitude` y `lon`/`long` como alias.

Las coordenadas se validan: la latitud debe estar entre -90 y 90 y la
longitud entre -180 y 180. Si vienen mal, se ignoran y se pide la ubicación.

Una vez leídas se guardan en `sessionStorage`, así que sobreviven aunque el
usuario navegue a otra página y vuelva sin los parámetros en la URL.

> **La geolocalización exige HTTPS.** En `http://` el navegador la bloquea sin
> excepción (salvo en `localhost`). Si el sitio no está en HTTPS, todos los
> visitantes caerán al caso 3.

## Métricas (Fase 1)

Contadores agregados por día. **No se guarda un registro por visita**, ni
coordenadas GPS, ni IP, ni identificador de usuario: solo cuántas veces pasó
cada cosa y con qué código QR. Así el dato no es personal y el crecimiento es
plano — medido con 30 días y 6,860 visitas, las dos tablas ocupan **192 kB**,
o sea unos 2.3 MB al año a ese ritmo.

### Qué se cuenta

| Métrica | Cuándo |
|---|---|
| Visita al sitio | Una vez por sesión del navegador |
| Ficha de negocio abierta | Una vez por negocio y por sesión, con su posición en la lista |

La deduplicación por sesión vive en `frontend/src/lib/analytics.js`. Si alguien
recarga cinco veces, cuenta una. Eso hace que «vistas» signifique personas y no
eventos, y reduce las escrituras drásticamente.

### Atribuir un QR

Agrega `?qr=identificador` a la URL del código, junto con las coordenadas:

```
https://qplan.mx/?c=18.9261,-99.2308&qr=hotel-centro-01
```

El panel muestra entonces qué colocación genera más visitas. El identificador
admite minúsculas, números, guion y guion bajo, hasta 60 caracteres; si viene
mal formado se ignora y la visita cuenta como entrada directa.

### Zona horaria

Los días se cortan con `REPORT_TIMEZONE` (por omisión `America/Mexico_City`).
Con UTC, una visita de las 7 de la tarde en México caería en el día siguiente.

### Reporte para el dueño

En el panel, pestaña Métricas, cada negocio tiene un botón de descarga que
genera un CSV con el detalle diario del periodo seleccionado. Está pensado para
mandárselo al dueño cuando lo pida; los dueños **no** tienen acceso al panel de
métricas.

### Limitación conocida

El endpoint `/api/track` es público y sin autenticación, como tiene que ser
para que lo llame cualquier visitante. Alguien decidido podría inflar los
contadores con un script. Para un directorio local el riesgo es bajo y el costo
de evitarlo (captcha, rate limiting con almacén) no se justifica todavía, pero
conviene saberlo antes de tomar decisiones comerciales con estos números.

## Compartir un negocio

El detalle de cada negocio tiene un botón de compartir que genera
`https://qplan.mx/lugar/{id}`. En móvil abre la hoja nativa del sistema
(Web Share API); en escritorio copia el enlace al portapapeles.

Quien recibe el enlace ve la ficha **sin que se le pida la ubicación**, esté
donde esté. Solo al cerrar el detalle se le pide, y entonces ve los negocios
cercanos a él. Pedirla antes haría que el diálogo del navegador saltara encima
del contenido que vino a ver.

> **Requisito de despliegue: el servidor debe reescribir todas las rutas a
> `index.html`.** Es una SPA con React Router; sin esa regla, entrar directo a
> `/lugar/{id}` devuelve 404 y el enlace compartido no sirve para nada.
> En Netlify o Vercel es la configuración por defecto; en Nginx es
> `try_files $uri /index.html;`, y en Apache un `.htaccess` con `FallbackResource`.
> `frontend/e2e/` incluye `spa_server.py`, un servidor de prueba que hace esa
> reescritura para poder verificarlo en local.

### Limitación: vista previa en WhatsApp

Al pegar el enlace en WhatsApp o Facebook no aparecerá el nombre ni la foto del
negocio, sino una vista previa genérica. El motivo es que los rastreadores de
esas plataformas no ejecutan JavaScript, y las etiquetas Open Graph de una SPA
se generan del lado del cliente.

Resolverlo requiere que algo del lado del servidor devuelva HTML con las
etiquetas correctas para esos rastreadores. No está hecho.

## Rutas del frontend

| Ruta | Quién entra | Qué es |
|------|-------------|--------|
| `/` | Todos | Home pública |
| `/que-es-qplan`, `/nosotros`, `/contacto` | Todos | Páginas del menú hamburguesa |
| `/lugar/{id}` | Todos | **Enlace compartible de un negocio.** Abre su ficha sin exigir ubicación |
| `/panel` | Admin y dueños | **Acceso al sistema.** No está enlazado desde la home: se entra por URL |
| `/login` | — | Redirige a `/panel` |
| `/register` | — | Existe pero no está enlazada. Reservada para la fase 2 de auto-registro |
| `/admin` | Solo `admin` | Panel de administración |
| `/negocio` | `business_owner` y `admin` | Panel del dueño |

El visitante **no ve ningún botón de ingresar**: es una decisión de producto,
el acceso es privado y se comparte por URL con quien corresponde.

El alcance del dueño lo impone el **backend** en `GET`/`PUT /me/business`,
que filtra por `owner_id`. La pantalla no es la que restringe: aunque alguien
manipule el frontend, la API solo le devuelve su propio negocio.

Un dueño **no** puede reasignar su negocio a otra persona ni reactivarlo si el
admin lo desactivó: esos campos no existen en el modelo `OwnBusinessUpdate`.

## Comprobar qué versión corre

```
http://localhost:8000/api/
```

Devuelve la versión, las funciones incluidas y el número de rutas:

```json
{
  "version": "2.3.0",
  "funciones": ["roles", "categorias", "amenidades", "metricas", "compartir"],
  "rutas": 36
}
```

También reporta si faltan migraciones:

```json
{ "esquema_al_dia": false,
  "migraciones_pendientes": [
    { "migracion": "migration_002_horarios_amenidades.sql",
      "falta": ["tabla amenities", "columna businesses.hours_schedule"] }
  ] }
```

Lo mismo se imprime en la consola de uvicorn al arrancar, con un aviso
imposible de pasar por alto. **Una migración olvidada ya no se manifiesta
como un error 500 suelto**, que es lo difícil de diagnosticar.

Si el frontend pide algo que el backend no tiene, el panel lo avisa con un
mensaje explícito en vez de quedarse en blanco. Aun así, conviene verificar
esto **antes** de depurar cualquier cosa rara: la causa más común de un
comportamiento inexplicable es que el backend y el frontend vengan de
entregas distintas.

| Rutas | Versión |
|-------|---------|
| 36 | 2.3.0 — métricas y compartir |
| 32 | horarios y amenidades |
| 27 | enfoque B2B |
| 21 | original de Emergent |

## Puesta en marcha

### 1. Variables de entorno

```bash
cp .env.example .env    # rellena DATABASE_URL, JWT_SECRET, CORS_ORIGINS
```

`frontend/.env` apunta al backend:

```
REACT_APP_BACKEND_URL=http://localhost:8000
```

> **CORS:** `CORS_ORIGINS` debe coincidir *exactamente* con el origen desde el
> que se sirve el front. `http://localhost:3000` y `http://127.0.0.1:3000` son
> orígenes distintos para el navegador.

### 2. Base de datos

- **Instalación nueva:** ejecuta `backend/sql/schema.sql`.
- **Base existente:** ejecuta `backend/sql/migration_001_b2b.sql`
  (ver *Migración* abajo).

### 3. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Documentación interactiva en `http://localhost:8000/docs`.

Para un PostgreSQL local sin SSL, añade `DB_SSL=disable` al `.env`.
Supabase sí requiere SSL, así que en producción se deja como está.

### 4. Frontend

```bash
cd frontend
yarn install
yarn start        # http://localhost:3000
```

## Migración

`backend/sql/migration_001_b2b.sql` transforma el esquema anterior:

1. Crea la tabla `categories` y la siembra con las categorías en uso.
2. Añade `users.role` y lo rellena desde `is_admin`, que luego elimina.
3. Garantiza un negocio por dueño con un índice único.
4. Convierte `businesses.type` en una llave foránea al catálogo.
5. **Elimina** `municipalities` y la columna `municipality_id`.
6. **Elimina** `qr_codes`.

Los pasos 5 y 6 **borran datos de forma irreversible**. Haz un backup en
Supabase → Database → Backups antes de ejecutarla. Va dentro de una
transacción: si algo falla, no se aplica nada.

Cualquier categoría que exista en tus negocios y no esté en el catálogo base
se da de alta **desactivada**, para que el `FOREIGN KEY` no falle y ningún
negocio se pierda. Revísalas después en el panel.

## Endpoints

### Públicos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/` | Health check |
| GET | `/api/categories` | Categorías activas |
| GET | `/api/businesses` | Negocios. Sin `type` devuelve **todos** |
| GET | `/api/businesses/{id}` | Detalle |
| GET | `/api/banners` | Banners activos |

Parámetros de `/api/businesses`: `type`, `lat`, `lng`, `radius` (km, 50 por
defecto). Con `lat`/`lng` calcula distancias por Haversine y ordena de más
cerca a más lejos.

### Autenticación
`POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me`

### Dueño de negocio
`GET /api/me/business` · `PUT /api/me/business`

### Admin
| Método | Ruta |
|--------|------|
| GET | `/api/admin/stats` |
| GET, POST, PUT, PATCH | `/api/admin/businesses[...]` |
| GET, POST, PUT, DELETE | `/api/admin/categories[...]` |
| GET, POST, PUT, DELETE | `/api/admin/banners[...]` |
| GET, PATCH | `/api/admin/users[...]` |

Los negocios se **desactivan**, no se borran: `PATCH /admin/businesses/{id}/toggle`.
Una categoría con negocios asignados no se puede eliminar (responde 409);
se oculta con `is_active`.

## Categorías

Viven en la base de datos y se administran desde `/admin` → pestaña
*Categorías*. El campo `icon` guarda el nombre de un icono de `lucide-react`;
`frontend/src/constants/businessTypes.js` traduce ese nombre al componente.
Para ofrecer un icono nuevo, agrégalo al `ICON_MAP` de ese archivo.

El `slug` no se puede cambiar una vez creado: los negocios lo referencian.

## Pruebas

**Backend** (26 pruebas de integración contra un PostgreSQL real):

```bash
createdb qplan_test
psql -d qplan_test -f backend/sql/schema.sql
DATABASE_URL=postgresql://.../qplan_test DB_SSL=disable pytest backend/tests/ -v
```

**Navegador** (26 comprobaciones de los flujos completos):

```bash
cd frontend && yarn build
npx serve -s build -l 3000        # o cualquier servidor estático
node e2e/flujos.spec.js           # requiere: npm i playwright
```

La suite e2e necesita la API corriendo con datos sembrados y usuarios de
prueba con contraseña `qplan1234`. Sirve como criterio de aceptación de lo
que pidió el negocio: banner visible, negocios cercanos, filtro por
categoría, modal de detalle, y que cada rol vea exactamente lo que le toca.

## Fase 2: auto-registro de negocios

Ya está implementado y **apagado**. Para encenderlo:

```
ALLOW_BUSINESS_SELF_REGISTRATION=true
```

Con el interruptor activo, `POST /api/business/register` deja que un usuario
registre su propio negocio, que nace **inactivo** hasta que el admin lo
apruebe con el toggle del panel. Apagado, ese endpoint responde 403.

## Pendientes conocidos

- **El filtrado por distancia se hace en Python, no en SQL.** `/api/businesses`
  trae todos los negocios activos y luego filtra por radio en memoria. Con
  pocos cientos de registros da igual; a partir de unos miles conviene mover
  el cálculo a PostGIS o a un índice geoespacial.
- **No hay favicon.** `frontend/public/` solo tiene `index.html`, así que el
  navegador pide `/favicon.ico` y recibe un 404 inofensivo.
- **Las coordenadas por defecto son el Zócalo de la CDMX** (19.4326, -99.1332),
  tanto en el respaldo de geolocalización como en el alta de negocios. Si Qplan
  opera en otra ciudad, hay que cambiarlas en `HomePage.jsx` y
  `BusinessFormModal.jsx`.
- **No hay recuperación de contraseña.** Si un dueño la olvida, hoy solo el
  admin puede resolverlo por fuera de la aplicación.
