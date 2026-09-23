# Qplan.mx — Documento de producto

> Estado al 21 de septiembre de 2026. Este documento describe lo que la
> aplicación **hace hoy**, no lo que se planeó alguna vez.

## Qué es

Directorio B2B de negocios con geolocalización. El visitante abre qplan.mx,
ve un banner publicitario y los negocios más cercanos a su ubicación, con un
filtro por categoría y una ficha de detalle por negocio.

El modelo de negocio es **B2B**: Qplan vende presencia a los negocios. Cada
negocio puede tener un usuario dueño que administra su propia ficha.

## Decisiones tomadas

| Decisión | Fecha | Razón |
|----------|-------|-------|
| Base de datos: PostgreSQL en Supabase | — | Ya estaba en producción |
| Eliminar municipios | 21 sep 2026 | El producto se enfoca a negocios, no a gobiernos |
| Eliminar códigos QR | 21 sep 2026 | Módulo incompleto (solo lectura) y atado a municipios |
| Categorías en base de datos | 21 sep 2026 | Deben poder crearse y editarse sin tocar código |
| Tres roles en lugar de `is_admin` | 21 sep 2026 | Hace falta distinguir al dueño de negocio |
| El admin da de alta los negocios | 21 sep 2026 | Control de calidad del catálogo al inicio |
| Auto-registro implementado pero apagado | 21 sep 2026 | Se encenderá cuando el catálogo madure |

## Roles

1. **Visitante** — descubre negocios cercanos. No necesita cuenta.
2. **Usuario** (`user`) — igual que el visitante, con sesión iniciada.
3. **Dueño de negocio** (`business_owner`) — edita únicamente su propia ficha
   en `/negocio`. No puede reasignar su negocio ni reactivarlo.
4. **Administrador** (`admin`) — administra negocios, categorías, banners y
   usuarios en `/admin`.

El alcance del dueño lo impone la API filtrando por `owner_id`, no la
interfaz.

## Alcance actual

### Terminado
- [x] Home con banner en carrusel, geolocalización y distancia (Haversine)
- [x] Filtro por categoría, con «Todos» por defecto
- [x] Tarjeta de negocio y modal de detalle
- [x] Registro y login con JWT
- [x] Panel de administración: negocios, categorías, banners, usuarios
- [x] Panel del dueño de negocio
- [x] Desactivación de negocios en lugar de borrado
- [x] Categorías administrables desde el panel

### Siguiente (P1)
- [ ] Búsqueda por nombre de negocio
- [ ] Recuperación de contraseña
- [ ] Carga de imágenes (hoy solo se aceptan URLs)
- [ ] Encender el auto-registro de negocios con flujo de aprobación

### Más adelante (P2)
- [ ] Favoritos del usuario
- [ ] Reseñas y calificaciones de usuarios reales
- [ ] Integración con mapas
- [ ] Filtrado geoespacial en SQL (PostGIS) al crecer el catálogo
- [ ] PWA

## Identidad visual

Tema oscuro. Fondo `#050505`, superficie `#0A0A0A`, acento
**Electric Lime `#CCFF00`**, texto secundario `#A3A3A3`, bordes `#262626`.

## Fuera de alcance

- Municipios y cualquier funcionalidad dirigida a gobiernos
- Códigos QR
- Pagos o suscripciones dentro de la aplicación
