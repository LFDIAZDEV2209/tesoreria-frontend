-- DEV localhost:3306/kpisdb ONLY. QA-ONLY synthetic row
-- Simulated executed state; no bank/egreso/movement operation is performed.
START TRANSACTION;
INSERT INTO presupuesto_pago_proyectado(empresa_id,nit,nombre,categoria,modulo_origen,concepto,monto_proyectado,fecha_proyectada,estado,fecha_pago_real,aprobado,creado_por,notas,created_at)
SELECT 91,'GPQA008executed','GPQA-008-20261015 executed','OTROS','manual','GPQA-008 proy. executed fixture',1234.56,'2027-01-15','pagado','2027-01-15',1,'gpqa.contador','QA-ONLY synthetic row; simulated executed state',NOW()
WHERE DATABASE()='kpisdb' AND @@port=3306 AND NOT EXISTS(SELECT 1 FROM presupuesto_pago_proyectado WHERE empresa_id=91 AND nombre='GPQA-008-20261015 executed' AND nit='GPQA008executed');
COMMIT;
SELECT id,empresa_id,nombre,estado,monto_proyectado FROM presupuesto_pago_proyectado WHERE empresa_id=91 AND nombre='GPQA-008-20261015 executed' AND nit='GPQA008executed';
