-- ONLY DEV localhost:3306/kpisdb. QA-ONLY synthetic row
-- P7 movement: a new anticipo for a previous month; no existing movement touched.
START TRANSACTION;
INSERT INTO presupuesto_movimiento(empresa_id,modulo,cuenta_puc,nit,nombre,categoria,comprobante,fecha,detalle,debito,credito,saldo,periodo_registro,created_at)
SELECT 91,'anticipos','1330','GPQA008P7','GPQA-008 anticipo sintético','OTROS','GPQA-008-P7-20261015','15/09/2026','QA-ONLY synthetic row',1234.56,0,1234.56,'2026-09',NOW()
WHERE DATABASE()='kpisdb' AND @@port=3306 AND NOT EXISTS(SELECT 1 FROM presupuesto_movimiento WHERE empresa_id=91 AND comprobante='GPQA-008-P7-20261015' AND nit='GPQA008P7');
COMMIT;
SELECT id,empresa_id,modulo,nit,comprobante,periodo_registro,saldo FROM presupuesto_movimiento WHERE empresa_id=91 AND comprobante='GPQA-008-P7-20261015' AND nit='GPQA008P7';
