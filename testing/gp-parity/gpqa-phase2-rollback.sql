-- PREPARED, NOT EXECUTED. DEV localhost:3306/kpisdb ONLY.
-- QA-ONLY synthetic row cleanup. Never calls S3; preserve the object key in qa-data.md.
-- Default is ROLLBACK. Review affected rows before explicitly replacing it with COMMIT.
-- Preserve audit and users: these identities are now also used by other agents.
START TRANSACTION;
SET @gpqa_dev = (DATABASE()='kpisdb' AND @@port=3306);
DELETE FROM presupuesto_anticipo_legalizacion
WHERE @gpqa_dev AND id=1 AND empresa_id=91 AND movimiento_id=13363
AND archivo_nombre='GPQA-P7-20261015-1.pdf' AND creado_por='gpqa.contador'
AND archivo_s3_key='anticipos/legalizaciones/91/13363/0eb74a38-f107-4ffa-bd82-bc9479bb268e';
SELECT ROW_COUNT() AS own_legalizacion_removed;
DELETE p FROM presupuesto_pago_proyectado p
WHERE @gpqa_dev AND p.empresa_id=91 AND p.id IN (4703,4704,4705,4706,4707,4708,4709,4710)
AND p.nombre LIKE 'GPQA-008-20261015 %' AND p.creado_por='gpqa.contador'
AND p.notas LIKE 'QA-ONLY synthetic row%' AND p.movimiento_id IS NULL AND p.movimiento_origen_id IS NULL
AND NOT EXISTS(SELECT 1 FROM egreso_registrado e WHERE e.pago_proyectado_id=p.id);
SELECT ROW_COUNT() AS own_payments_removed;
DELETE m FROM presupuesto_movimiento m
WHERE @gpqa_dev AND m.id=13363 AND m.empresa_id=91 AND m.nit='GPQA008P7'
AND m.comprobante='GPQA-008-P7-20261015' AND m.detalle='QA-ONLY synthetic row'
AND NOT EXISTS(SELECT 1 FROM presupuesto_anticipo_legalizacion l WHERE l.movimiento_id=m.id AND l.empresa_id=m.empresa_id)
AND NOT EXISTS(SELECT 1 FROM presupuesto_pago_proyectado p WHERE (p.movimiento_id=m.id OR p.movimiento_origen_id=m.id) AND p.empresa_id=m.empresa_id);
SELECT ROW_COUNT() AS own_anticipo_removed;
-- Refuse period cleanup if anyone added business data, or changed this exact control row.
SET @gpqa_empty_month = NOT EXISTS(SELECT 1 FROM presupuesto_pago_proyectado WHERE empresa_id=91 AND (fecha_proyectada LIKE '2027-01%' OR fecha_pago_real LIKE '2027-01%'))
AND NOT EXISTS(SELECT 1 FROM presupuesto_movimiento WHERE empresa_id=91 AND periodo_registro='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_periodo WHERE periodo='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_panorama_fila WHERE periodo='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_estado_transicion WHERE periodo='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_historico WHERE periodo='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_historico_cierre WHERE periodo='2027-01')
AND NOT EXISTS(SELECT 1 FROM presupuesto_sync_control WHERE periodo='2027-01');
DELETE FROM presupuesto_mes_control WHERE @gpqa_dev AND @gpqa_empty_month
AND empresa_id=91 AND periodo='2027-01' AND creado_por='gpqa.contador'
AND creado_en='2026-10-15 21:29:48.141251' AND aprobado=0;
SELECT ROW_COUNT() AS own_month_control_removed;
DELETE FROM presupuesto_panorama_periodo WHERE @gpqa_dev AND @gpqa_empty_month
AND periodo='2027-01' AND creado_por='gpqa.contador' AND creado_en='2026-10-15 16:29:48.134947'
AND NOT EXISTS(SELECT 1 FROM presupuesto_mes_control WHERE periodo='2027-01');
SELECT ROW_COUNT() AS own_global_month_removed;
DELETE FROM presupuesto_panorama_anio WHERE @gpqa_dev AND anio=2027
AND creado_por='gpqa.contador' AND creado_en='2026-10-15 16:29:48.011957'
AND NOT EXISTS(SELECT 1 FROM presupuesto_panorama_periodo WHERE periodo LIKE '2027-%')
AND NOT EXISTS(SELECT 1 FROM presupuesto_mes_control WHERE periodo LIKE '2027-%')
AND NOT EXISTS(SELECT 1 FROM presupuesto_movimiento WHERE periodo_registro LIKE '2027-%')
AND NOT EXISTS(SELECT 1 FROM presupuesto_pago_proyectado WHERE fecha_proyectada LIKE '2027-%')
AND NOT EXISTS(SELECT 1 FROM presupuesto_periodo WHERE periodo LIKE '2027-%')
AND NOT EXISTS(SELECT 1 FROM presupuesto_panorama_fila WHERE periodo LIKE '2027-%');
SELECT ROW_COUNT() AS own_year_removed;
SELECT periodo AS remaining_active_month FROM presupuesto_mes_control WHERE empresa_id=91 ORDER BY creado_en DESC,periodo DESC LIMIT 1;
ROLLBACK;
