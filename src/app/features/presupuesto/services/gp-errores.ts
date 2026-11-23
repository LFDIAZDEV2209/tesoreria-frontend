/**
 * Traduce cualquier error HTTP del Gestor Presupuestal a un mensaje claro
 * para el usuario final.
 *
 * Regla de oro: los mensajes de negocio que envía el backend (validaciones,
 * conflictos de estado, permisos) se muestran tal cual; los detalles técnicos
 * (Hibernate, SQL, stacks de Java, HTML de proxy) NUNCA llegan a la pantalla:
 * se reemplazan por una explicación entendible y una acción sugerida.
 */

const TECNICO = new RegExp(
  [
    'could not initialize proxy', 'no session', 'lazyinitialization',
    'hibernate', 'org\\.hibernate', 'jakarta\\.persistence', 'javax\\.persistence',
    'java\\.', 'javax\\.', 'jakarta\\.', '\\bat [a-z]+\\.[a-z0-9_.$]+\\(',
    'sqlexception', 'sqlsyntaxerror', 'jdbc', 'constraintviolation',
    'nullpointerexception', 'stacktrace', 'caused by:', 'nested exception',
    'http failure', 'httperrorresponse', 'networkerror', 'err_connection',
    '<html', '<!doctype', 'whitelabel error',
  ].join('|'),
  'i',
);

const GENERICO =
  'No pudimos completar la operación. Intenta de nuevo en unos segundos; si el problema continúa, avisa al administrador.';

const SIN_CONEXION =
  'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.';

const POR_ESTADO: Record<number, string> = {
  0: SIN_CONEXION,
  400: 'Revisa los datos ingresados: hay algo que el servidor no pudo validar.',
  401: 'Tu sesión expiró o no es válida. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permisos para realizar esta acción. Si crees que es un error, solicítalo a un administrador.',
  404: 'No encontramos la información solicitada. Puede que haya sido eliminada o pertenezca a otra empresa.',
  408: 'La operación tardó demasiado y se canceló. Intenta de nuevo.',
  409: 'La operación no se pudo completar porque el estado del registro cambió. Actualiza la información e intenta de nuevo.',
  413: 'El archivo es demasiado grande. Reduce su tamaño e intenta de nuevo.',
  422: 'Los datos no cumplen las reglas de negocio. Revisa la información e intenta de nuevo.',
  429: 'Hiciste demasiadas solicitudes seguidas. Espera unos segundos e intenta de nuevo.',
  500: 'Ocurrió un problema en el servidor al procesar la operación. Intenta de nuevo; si persiste, avisa al administrador.',
  502: 'El servidor no está disponible en este momento. Intenta de nuevo en unos minutos.',
  503: 'El servicio está en mantenimiento o sobrecargado. Intenta de nuevo en unos minutos.',
  504: 'El servidor tardó demasiado en responder. Intenta de nuevo en unos minutos.',
};

/** Un detalle del backend se muestra solo si parece escrito para una persona. */
function esMensajeHumano(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const texto = valor.trim();
  if (texto.length < 6 || texto.length > 280) return false;
  if (/[\n\r\t]/.test(texto)) return false;
  if (/^(internal server error|bad request|unauthorized|forbidden|not found|conflict|error)$/i.test(texto)) return false;
  return !TECNICO.test(texto);
}

function detalleDe(e: any): string | null {
  const data = e?.error ?? e?.response?.data;
  if (typeof data === 'string') return esMensajeHumano(data) ? data.trim() : null;
  if (Array.isArray(data?.detail)) {
    const partes = data.detail
      .map((d: any) => (typeof d?.msg === 'string' ? d.msg : null))
      .filter((m: string | null): m is string => !!m);
    return partes.length ? partes.join('. ') : null;
  }
  for (const candidato of [data?.detail, data?.message, data?.error, e?.message]) {
    if (esMensajeHumano(candidato)) return candidato.trim();
  }
  return null;
}

/**
 * @param e        error HTTP (HttpErrorResponse) o Error cualquiera.
 * @param respaldo mensaje propio de la pantalla cuando no hay uno mejor.
 */
export function mensajeError(e: any, respaldo?: string): string {
  if (!e) return respaldo ?? GENERICO;
  if (e?.name === 'TimeoutError' || e?.name === 'TimeoutErrorImpl') return POR_ESTADO[408];

  const detalle = detalleDe(e);
  if (detalle) return detalle;

  const estado = Number(e?.status ?? e?.error?.status);
  if (Number.isFinite(estado)) {
    if (POR_ESTADO[estado]) return POR_ESTADO[estado];
    if (estado >= 500) return POR_ESTADO[500];
  }
  return respaldo ?? GENERICO;
}
