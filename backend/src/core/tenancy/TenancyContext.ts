/**
 * TenancyContext
 *
 * Define los tipos que representan el contexto de tenant resuelto
 * y cómo se adjunta al request de Express.
 *
 * El tenant se resuelve UNA SOLA VEZ por request (en el middleware de tenancy)
 * y queda disponible como req.tenantId para todos los handlers siguientes.
 *
 * ESTRATEGIA DE RESOLUCIÓN (en orden de prioridad):
 *
 * 1. JWT Access Token (método primario):
 *    - El JWT contiene el campo `tenantId` dentro del payload.
 *    - Al autenticar con /auth/login, el servidor incluye el tenantId
 *      del usuario en el token.
 *    - Todos los requests autenticados llevan este token en
 *      Authorization: Bearer <token>.
 *    - Esto garantiza que el tenantId proviene de una fuente firmada
 *      y no puede ser alterado por el cliente.
 *
 * 2. Header X-Tenant-Slug (método secundario para login):
 *    - El endpoint /auth/login es público (no requiere JWT).
 *    - Para saber a qué tenant pertenece el usuario que intenta loguear,
 *      el frontend envía el slug del tenant en el header X-Tenant-Slug
 *      o como campo en el body del login.
 *    - El AuthService resuelve el tenant antes de validar credenciales.
 *
 * 3. Subdomain (preparado para multi-tenant web futuro):
 *    - El resolver puede extraer el tenant del host HTTP:
 *      acme.myapp.com → slug = "acme"
 *    - No activo por defecto en desarrollo.
 *
 * INVARIANTE CRÍTICA:
 * - Ninguna consulta de negocio se ejecuta sin tenantId resuelto.
 * - Los repositorios SIEMPRE reciben tenantId como parámetro explícito.
 * - No existe ningún "acceso global" a entidades de negocio sin tenant.
 */

export interface TenancyContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}
