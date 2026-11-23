-- Read-only inventory. Run ONLY localhost:3306/kpisdb.
SELECT DATABASE() AS db, @@hostname AS server, @@port AS port;
SELECT u.id,u.username,u.email,CAST(u.active AS UNSIGNED) AS active,
 CAST(u.require_password_change AS UNSIGNED) AS require_password_change,
 GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) AS roles,
 GROUP_CONCAT(DISTINCT p.empresa_id ORDER BY p.empresa_id) AS empresas,
 MAX(a.usuario_id IS NOT NULL) AS acceso_nexa
FROM users u
LEFT JOIN user_roles ur ON ur.user_id=u.id
LEFT JOIN roles r ON r.id=ur.role_id
LEFT JOIN presupuesto_usuario_empresa p ON p.usuario_id=u.id
LEFT JOIN usuario_acceso_nexa a ON a.usuario_id=u.id
WHERE u.username REGEXP 'qa|contador|gerencia|superadmin' OR r.name IN ('ADMIN','SUPER_ADMIN')
GROUP BY u.id;
SELECT id,name FROM roles WHERE name IN ('USER','ADMIN');
SELECT * FROM presupuesto_empresa_gp WHERE empresa_id IN (91,92);
SELECT * FROM presupuesto_empresa_gp_mapeo WHERE empresa_id IN (91,92);
