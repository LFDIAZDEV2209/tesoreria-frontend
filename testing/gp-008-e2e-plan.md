# GP-008 P7–P10 — plan E2E (gpqa)

Estado: **Fase 1, diseño**. Ejecutar Fase 2 solamente cuando el coordinador lo indique y los cambios FE/BE estén disponibles. Fuente de verdad: `../../gp-008-p7a10/brief-herdr.md`. Backend localhost:8081, frontend localhost:4202, DB DEV localhost:3306/kpisdb. Harness Node `node --test`, Playwright 1.58.2, Chromium headless; sesiones reales de UI por rol, cero mocks de API.

## Criterios duros comunes

- Cada test exige status exacto, shape de respuesta y valor persistido por GET posterior; una pantalla visible o un 200 no basta. Fallos de precondición son BLOCKED/FAIL explícitos, nunca un pass vacío.
- Comparaciones monetarias en centavos enteros a partir de decimal (sin floats ni tolerancias amplias). UI colombiana: quitar símbolo COP/espacios, puntos de miles, convertir coma decimal. Para UI que redondea a pesos, exigir exactamente el redondeo documentado y comparar API interna en centavos; registrar pérdida de precisión visual.
- Antes de operar registrar empresa, periodo, rol, ID sintético y snapshot API. Luego UI = API = persistencia esperada. Recargar página, repetir GET y confirmar. Capturar screenshot, URL, método/status y diferencias; redactar claves y URL S3 firmada.
- Probar contador y gerencia en contextos separados. Petición sin X-User-Name → 401; contador fuera de asignación → 403. No sustituir contador por superadmin para ocultar permisos faltantes.
- Fallar con cualquier pageerror, error de carga visible o 5xx relevante. Esperar respuestas y DOM, no sleeps arbitrarios. Orden de escenarios y cleanup secuencial para no contaminar sumas.

## Matriz de casos

| Caso | Preparación y acciones | Asserts duros |
|---|---|---|
| P7-01 anticipo anterior | Anticipo sintético septiembre 2026; octubre activo. Capturar saldo/soportes. Desde Anticipos seleccionar mes anterior, abrir legalización, subir PDF con observación GPQA-008-P7 y valor conocido. | POST `/api/gp/anticipos/legalizaciones` 2xx conforme contrato; ID nuevo, empresa/movimiento/valor/usuario/fecha exactos. GET contiene el nuevo ID una sola vez. UI muestra el mismo documento; saldo API y UI antes=después (evidencia no altera saldo). |
| P7-02 histórico y archivo | Subir segundo PDF al mismo movimiento, recargar y abrir ambos soportes. | Dos IDs distintos preservados; orden/fecha/autor consistentes. GET `/{id}/archivo` devuelve URL temporal; descargar desde almacenamiento DEV, status 200, MIME PDF, cabecera `%PDF-`, hash SHA-256 igual al fixture; preview sin error. Auditoría contiene ambas operaciones y actor. |
| P7-03 validación | Archivo texto con nombre PDF, PDF vacío, tamaño máximo+1 byte y empresa no asignada. | UI y API rechazan según contrato 4xx (fijar 400/413 con BE), ningún soporte/auditoría de éxito ni objeto huérfano. No aceptar 500. PDF bajo límite funciona. |
| P8-01 edición anterior | Crear proyectado sintético MANUAL septiembre, PROYECTADO, aprobado=false, no pagado. En Provisiones cambiar fecha, valor, nit/nombre, concepto, notas y sección. Repetir IMPORTADO. | PUT `/api/presupuesto/pagos-proyectados/{id}` y alias GP permiten; GET refleja cada campo. Total API aumenta por delta exacto y UI coincide. Sigue editable aunque el mes anterior no sea activo. Auditoría identifica ID, actor y antes/después. |
| P8-02 eliminación | Otro proyectado no aprobado anterior. Eliminar desde UI con confirmación. | DELETE exitoso; estado persistido CANCELADO (eliminación lógica), desaparece del listado activo tras reload. Total disminuye exactamente por el valor anterior; auditoría una vez. |
| P8-03 aprobado sano | Fixture propio aprobado y PROYECTADO, sin inconsistencias ni pago; snapshot completo antes. UI indica motivo y oculta/deshabilita editar/eliminar. Enviar PUT y DELETE directos con identidad válida. | Ambos **409** con JSON `{code,message}` no vacío, message español; snapshot y totales idénticos; no mutación/auditoría de éxito. Probar ruta canónica y alias GP. Nunca usar registro real aprobado. |
| P8-04 ejecutado | Fixture propio PAGADO/ejecutado, con relaciones coherentes. Intentar editar/eliminar. | Ambos 409, motivo visible, sin cambios. Verificar también aprobado=false pero ejecutado: backend protege por estado. |
| P9-01 seis módulos | Por cada proveedores, anticipos, cuentas-pagar, cuentas-cobrar, impuestos, Provisiones: datos sintéticos en septiembre/octubre y segundo año, importes no nulos distintos, dos terceros y débito/crédito/saldo con signos. Alternar Mes → Todos los meses → Mes. | La vista mensual conserva el mes elegido y filas/total. Consolidado llama `/api/gp/{modulo}/anual?empresaId=&anio=`; Provisiones `/api/gp/pagos-proyectados/provisiones/anual`. Sin `vistaMes`/`periodoConsulta` residuales. Meses ordenados sin duplicados y columnas exactas; total por tercero y gran total UI=API en cada métrica visible. |
| P9-02 reconciliación independiente | Para cada mes del consolidado consultar API mensual de módulo con `vistaMes=true&periodoConsulta=YYYY-MM` y mismo alcance empresa. Completar todas las páginas; Provisiones agrupar por fecha_proyectada, no fecha de creación. | Para cada métrica: suma filas del mes = `totalesMes[mes]` = suma API mensual = total UI mensual. Suma valores por tercero = `totalAnio`; suma totalesMes = `totalGeneral` = total UI consolidado. Validar las celdas, no solo el total general. |
| P9-03 filtros/alcance | Cambiar año, quitar anio, cambiar empresa asignada, volver a mensual; buscar tercero; incluir >1 página y mes sin datos. | Sin anio incluye todos los años disponibles; sin mezcla de empresa, sin doble conteo ni truncamiento de páginas. Ceros y negativos correctos; totales responden al filtro conforme semántica documentada. Comparación con `/api/gp/presupuesto/mensual` cuando su sección/métrica sea equivalente; documentar el mapeo, nunca sumar acumulados como movimientos. |
| P10-01 contador crea | Login gpqa.contador, empresa asignada; elegir año/mes sintéticos no existentes sin colisionar con trabajo de otros agentes. Crear desde Creación de periodos (`POST /api/gp/periodos/anios` y `/{periodo}`). | 2xx, año/mes en GET selección y UI; usuario sigue rol contador y permiso abrir_periodos=true; empresa correcta. Creación repetida no duplica. Empresa fuera de alcance se rechaza 403 sin filas nuevas. |
| P10-02 navegación | Navegar meses creados y anteriores mediante controles UI. | Selección y peticiones coinciden con YYYY-MM elegido, sin mostrar datos del mes previo; API y UI totales exactos por mes. Reload conserva selección según contrato. |
| P10-03 historial | Editar registro propio; abrir Historial y filtrar empresa/periodo/usuario. Revisar también crear/editar/eliminar proyectado, legalizar, importar, crear/abrir/aprobar mes. | GET `/api/presupuesto/auditoria` contiene acción, entidad/ID, actor, fecha acotada por inicio/fin y valores previos/nuevos; UI muestra el mismo registro. Filtros excluyen empresa/mes/actor alternos. Operación rechazada no aparece como exitosa. Toda mutación del brief debe tener evidencia, no inferir cobertura de una sola edición. |

## Regresión mínima

- Login real: ruta `/login`, POST `/api/auth/login` a origen 4202 y proxy 8081; auth estado 200 con usuario/rol correcto. Anónimo devuelve 401; UI guard protege presupuesto y `/auth/change-password-required`. Carrusel de login carga sus tres imágenes y cambia slide.
- Pagos proyectados: `/presupuesto/pagos-proyectados`, listado API exitoso y tabla o vacío explícito coherente con respuesta; conteo/paginación y total UI vs resumen API; nunca aceptar una pantalla vacía por 500.
- Proveedores: enlace y título visibles; API del módulo 200, tabla/estado vacío coincide con API; total UI vs suma de filas equivalentes, completar páginas.

Corrección del coordinador: “casetas” y fragmentos sobre FTP eran ruido del prompt y quedan descartados; no generan casos, bloqueos ni requisitos nuevos. Alcance funcional único P7–P10.

## Fixture PDF y destino de almacenamiento

`gp-parity/gpqa-pdf.mjs` genera `fixtures/gpqa-legalizacion.pdf` con contenido sintético y calcula su SHA-256. Usar `setInputFiles` real en Fase 2. El código actual usa S3 + URL presigned. Confirmar destino DEV aislado antes del upload. La validación end-to-end exige bytes reales; mocks no califican. Preservar IDs y claves de objetos creados para reversión exclusiva de QA.

## Evidencia y salida

Fase 1 genera inventario SQL, cuentas con reversión, smoke, reporte JSON y capturas bajo `gp-parity/artifacts/gpqa`. Fase 2 agregará manifiesto de datos, matrices por rol/módulo, diferencias monetarias, auditoría y cleanup. No se ejecutan mutaciones P7–P10 hasta instrucción del coordinador. Compilación fuente corresponde a BE/FE; QA no declara los cambios nuevos aprobados por un smoke verde.
