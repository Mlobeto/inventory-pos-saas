-- Permite registrar cobros de cuenta corriente sin poder editar clientes
INSERT INTO "Permission" ("id", "code", "module", "description")
VALUES (
  gen_random_uuid()::text,
  'customers:collect',
  'customers',
  'Registrar cobros de cuenta corriente'
)
ON CONFLICT ("code") DO NOTHING;

-- Los roles que ya veían el estado de cuenta pasan a poder cobrar
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, rp."roleId", collect."id"
FROM "RolePermission" rp
JOIN "Permission" reader
  ON reader."id" = rp."permissionId" AND reader."code" = 'customers:read'
CROSS JOIN "Permission" collect
WHERE collect."code" = 'customers:collect'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
