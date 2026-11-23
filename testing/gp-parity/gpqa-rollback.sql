-- ONLY DEV localhost:3306/kpisdb; reverses Phase 1 synthetic identity rows.
-- Run before Phase 2 creates related business data, otherwise review dependencies first.
START TRANSACTION;
DELETE p FROM presupuesto_usuario_empresa p JOIN users u ON u.id=p.usuario_id JOIN usuario_acceso_nexa a ON a.usuario_id=u.id
WHERE u.username IN ('gpqa.contador','gpqa.gerencia') AND u.email=CONCAT(u.username,'@example.invalid') AND a.otorgado_por='gpqa-phase1-20261015' AND DATABASE()='kpisdb' AND @@port=3306;
DELETE r FROM user_roles r JOIN users u ON u.id=r.user_id JOIN usuario_acceso_nexa a ON a.usuario_id=u.id
WHERE u.username IN ('gpqa.contador','gpqa.gerencia') AND u.email=CONCAT(u.username,'@example.invalid') AND a.otorgado_por='gpqa-phase1-20261015' AND DATABASE()='kpisdb' AND @@port=3306;
DELETE a FROM usuario_acceso_nexa a JOIN users u ON u.id=a.usuario_id
WHERE u.username IN ('gpqa.contador','gpqa.gerencia') AND u.email=CONCAT(u.username,'@example.invalid') AND a.otorgado_por='gpqa-phase1-20261015' AND DATABASE()='kpisdb' AND @@port=3306;
DELETE FROM users WHERE username IN ('gpqa.contador','gpqa.gerencia') AND email=CONCAT(username,'@example.invalid') AND password='HASH_BCRYPT_ELIMINADO_GPQA' AND DATABASE()='kpisdb' AND @@port=3306;
COMMIT;
