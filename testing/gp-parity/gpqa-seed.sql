-- ONLY DEV localhost:3306/kpisdb. No existing user is changed.
-- QA-ONLY synthetic row
-- Password DEV: pasa via variable GPQA_PASSWORD al ejecutar el seed; hash bcrypt dev-only en la INSERT
START TRANSACTION;
INSERT INTO users(username,email,password,active,require_password_change)
SELECT 'gpqa.contador','gpqa.contador@example.invalid','HASH_BCRYPT_ELIMINADO_GPQA',1,0
WHERE DATABASE()='kpisdb' AND @@port=3306
AND NOT EXISTS(SELECT 1 FROM users WHERE username='gpqa.contador' OR email='gpqa.contador@example.invalid');
-- QA-ONLY synthetic row
INSERT INTO users(username,email,password,active,require_password_change)
SELECT 'gpqa.gerencia','gpqa.gerencia@example.invalid','HASH_BCRYPT_ELIMINADO_GPQA',1,0
WHERE DATABASE()='kpisdb' AND @@port=3306
AND NOT EXISTS(SELECT 1 FROM users WHERE username='gpqa.gerencia' OR email='gpqa.gerencia@example.invalid');
-- QA-ONLY synthetic row
INSERT IGNORE INTO user_roles(user_id,role_id)
SELECT u.id,r.id FROM users u JOIN roles r ON r.name=CASE u.username WHEN 'gpqa.contador' THEN 'USER' ELSE 'ADMIN' END
WHERE u.username IN ('gpqa.contador','gpqa.gerencia') AND u.email=CONCAT(u.username,'@example.invalid') AND DATABASE()='kpisdb' AND @@port=3306;
-- QA-ONLY synthetic row
INSERT IGNORE INTO usuario_acceso_nexa(usuario_id,otorgado_por,created_at)
SELECT id,'gpqa-phase1-20261015',NOW() FROM users
WHERE username IN ('gpqa.contador','gpqa.gerencia') AND email=CONCAT(username,'@example.invalid') AND DATABASE()='kpisdb' AND @@port=3306;
-- QA-ONLY synthetic row
INSERT IGNORE INTO presupuesto_usuario_empresa(usuario_id,empresa_id)
SELECT u.id,e.empresa_id FROM users u CROSS JOIN presupuesto_empresa_gp e
WHERE u.username IN ('gpqa.contador','gpqa.gerencia') AND u.email=CONCAT(u.username,'@example.invalid') AND e.empresa_id IN (91,92) AND DATABASE()='kpisdb' AND @@port=3306;
COMMIT;
