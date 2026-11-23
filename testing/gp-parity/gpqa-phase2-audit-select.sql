-- SELECT only, DEV localhost:3306/kpisdb; excludes other agents using the same QA account.
SELECT id,empresa_id,usuario_id,usuario_nombre,accion,entidad,detalle,created_at
FROM presupuesto_auditoria
WHERE usuario_nombre IN ('gpqa.contador','gpqa.gerencia')
AND (detalle LIKE '%GPQA-%' OR detalle REGEXP 'pago=(470[3-9]|4710)([^0-9]|$)' OR detalle LIKE 'periodo=2027%')
ORDER BY id;
