import { SelectBuscableDirective } from '../../../../../core/ui/select-buscable/select-buscable.directive';
import { Component, Input, OnInit, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-mesa-ayuda-fields',
  standalone: true,
  imports: [SelectBuscableDirective, CommonModule, ReactiveFormsModule],
  templateUrl: './mesa-ayuda-fields.component.html',
  styleUrls: ['../_shared-form.scss']
})
export class MesaAyudaFieldsComponent implements OnInit {
  @Input() formGroup!: FormGroup;
  /** Formulario principal de la solicitud (paso 1: datos del solicitante) */
  @Input() solicitudForm!: FormGroup;

  // ── Datos del solicitante (read-only, del paso 1) ──
  solicitanteNombre = signal('');
  solicitanteCargo = signal('');
  solicitanteCorreo = signal('');
  solicitanteTelefono = signal('');

  // ── Datos organizacionales (read-only, del paso 1) ──
  orgNombreEmpresa = signal('');
  orgArea = signal('');

  // ── Opciones de catálogos ──
  tiposEmpresa = [
    { value: 'BANCA_FINANZAS', label: 'Banca / Finanzas', icon: '🏦' },
    { value: 'ENERGIA', label: 'Energía', icon: '⚡' },
    { value: 'COMERCIO', label: 'Comercio', icon: '🛒' },
    { value: 'MANUFACTURA', label: 'Manufactura', icon: '🏭' },
    { value: 'SALUD', label: 'Salud', icon: '🏥' },
    { value: 'LOGISTICA', label: 'Logística', icon: '🚚' },
    { value: 'TECNOLOGIA', label: 'Tecnología', icon: '💻' },
    { value: 'EDUCACION', label: 'Educación', icon: '🎓' },
    { value: 'GOBIERNO', label: 'Gobierno', icon: '🏛️' },
    { value: 'OTRO', label: 'Otro', icon: '📋' }
  ];

  ciudadesColombia = [
    'Bogotá D.C.', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
    'Bucaramanga', 'Cúcuta', 'Pereira', 'Santa Marta', 'Ibagué',
    'Manizales', 'Villavicencio', 'Pasto', 'Montería', 'Neiva',
    'Armenia', 'Valledupar', 'Popayán', 'Sincelejo', 'Tunja',
    'Florencia', 'Riohacha', 'Quibdó', 'Yopal', 'Mocoa',
    'San Andrés', 'Leticia', 'Mitú', 'Inírida', 'Puerto Carreño',
    'Arauca', 'San José del Guaviare'
  ];

  tiposSolicitud = [
    { value: 'HARDWARE', label: 'Hardware', icon: '🖥️' },
    { value: 'SOFTWARE', label: 'Software', icon: '💿' },
    { value: 'ACCESOS', label: 'Accesos / Permisos', icon: '🔐' },
    { value: 'RED', label: 'Red / Conectividad', icon: '🌐' },
    { value: 'IMPRESORAS', label: 'Impresoras', icon: '🖨️' },
    { value: 'CORREO', label: 'Correo Electrónico', icon: '📧' },
    { value: 'ERP', label: 'ERP / Aplicativos', icon: '⚙️' },
    { value: 'SEGURIDAD', label: 'Seguridad', icon: '🛡️' },
    { value: 'TELEFONIA', label: 'Telefonía', icon: '📱' },
    { value: 'OTRO', label: 'Otro', icon: '📌' }
  ];

  subClasificaciones: { [key: string]: { value: string; label: string }[] } = {
    HARDWARE: [
      { value: 'COMPUTADOR_NO_ENCIENDE', label: 'Computador no enciende' },
      { value: 'PANTALLA_DAÑADA', label: 'Pantalla dañada' },
      { value: 'TECLADO_MOUSE', label: 'Problemas con teclado/mouse' },
      { value: 'BATERIA', label: 'Problemas de batería' },
      { value: 'COMPONENTE_DEFECTUOSO', label: 'Componente defectuoso' },
      { value: 'OTRO_HARDWARE', label: 'Otro problema de hardware' }
    ],
    SOFTWARE: [
      { value: 'INSTALACION', label: 'Instalación de software' },
      { value: 'ACTUALIZACION', label: 'Actualización requerida' },
      { value: 'ERROR_APLICACION', label: 'Error en aplicación' },
      { value: 'LICENCIA', label: 'Problema de licencia' },
      { value: 'DESINSTALACION', label: 'Desinstalación' },
      { value: 'OTRO_SOFTWARE', label: 'Otro problema de software' }
    ],
    ACCESOS: [
      { value: 'NUEVO_ACCESO', label: 'Solicitud de nuevo acceso' },
      { value: 'MODIFICACION_PERMISOS', label: 'Modificación de permisos' },
      { value: 'RESETEO_CONTRASEÑA', label: 'Reseteo de contraseña' },
      { value: 'BLOQUEO_CUENTA', label: 'Cuenta bloqueada' },
      { value: 'BAJA_ACCESOS', label: 'Baja de accesos' },
      { value: 'OTRO_ACCESOS', label: 'Otro problema de accesos' }
    ],
    RED: [
      { value: 'SIN_INTERNET', label: 'Sin conexión a internet' },
      { value: 'CONEXION_LENTA', label: 'Conexión lenta' },
      { value: 'VPN', label: 'Problema con VPN' },
      { value: 'WIFI', label: 'Problema con WiFi' },
      { value: 'CABLE_RED', label: 'Problema de cableado' },
      { value: 'OTRO_RED', label: 'Otro problema de red' }
    ],
    IMPRESORAS: [
      { value: 'NO_IMPRIME', label: 'No imprime' },
      { value: 'ATASCOS', label: 'Atascos de papel' },
      { value: 'CALIDAD_IMPRESION', label: 'Mala calidad de impresión' },
      { value: 'CONFIGURACION_IMPRESORA', label: 'Configuración' },
      { value: 'ESCANER', label: 'Problema con escáner' },
      { value: 'OTRO_IMPRESORAS', label: 'Otro problema de impresora' }
    ],
    CORREO: [
      { value: 'NO_ENVIA', label: 'No envía correos' },
      { value: 'NO_RECIBE', label: 'No recibe correos' },
      { value: 'CONFIGURACION_OUTLOOK', label: 'Configuración de Outlook' },
      { value: 'CALENDARIO', label: 'Problema con calendario' },
      { value: 'FIRMA', label: 'Configuración de firma' },
      { value: 'OTRO_CORREO', label: 'Otro problema de correo' }
    ],
    ERP: [
      { value: 'ERROR_SAP', label: 'Error en SAP' },
      { value: 'ERROR_ORACLE', label: 'Error en Oracle' },
      { value: 'REPORTE', label: 'Problema con reportes' },
      { value: 'DATOS_INCORRECTOS', label: 'Datos incorrectos' },
      { value: 'LENTITUD_SISTEMA', label: 'Sistema lento' },
      { value: 'OTRO_ERP', label: 'Otro problema de ERP' }
    ],
    SEGURIDAD: [
      { value: 'VIRUS_MALWARE', label: 'Virus / Malware' },
      { value: 'PHISHING', label: 'Correo sospechoso / Phishing' },
      { value: 'FUGA_INFORMACION', label: 'Posible fuga de información' },
      { value: 'ANTIVIRUS', label: 'Problema con antivirus' },
      { value: 'OTRO_SEGURIDAD', label: 'Otro problema de seguridad' }
    ],
    TELEFONIA: [
      { value: 'SIN_TONO', label: 'Sin tono' },
      { value: 'NO_RECIBE_LLAMADAS', label: 'No recibe llamadas' },
      { value: 'EXTENSION', label: 'Configuración de extensión' },
      { value: 'OTRO_TELEFONIA', label: 'Otro problema de telefonía' }
    ],
    OTRO: [
      { value: 'CONSULTA_GENERAL', label: 'Consulta general' },
      { value: 'SOLICITUD_GENERAL', label: 'Solicitud general' },
      { value: 'OTRO_GENERAL', label: 'Otro' }
    ]
  };

  urgencias = [
    { value: 'BAJA', label: 'Baja — Puede esperar', icon: '🟢', color: '#10b981' },
    { value: 'MEDIA', label: 'Media — Afecta productividad', icon: '🟡', color: '#f59e0b' },
    { value: 'ALTA', label: 'Alta — Trabajo detenido', icon: '🟠', color: '#f97316' },
    { value: 'CRITICA', label: 'Crítica — Operación detenida', icon: '🔴', color: '#ef4444' }
  ];

  impactos = [
    { value: 'INDIVIDUAL', label: 'Individual — Solo me afecta', icon: '👤' },
    { value: 'AREA', label: 'Área — Afecta a mi equipo/área', icon: '👥' },
    { value: 'EMPRESA', label: 'Empresa — Afecta a toda la empresa', icon: '🏢' }
  ];

  // ── Señales de estado ──
  tipoSolicitudSeleccionado = signal<string>('');
  subClasificacionesFiltradas = signal<{ value: string; label: string }[]>([]);
  archivoAdjunto = signal<File | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {}

  ngOnInit(): void {
    // Auto-generate ticket number and timestamp
    if (!this.formGroup.get('numeroTicket')?.value) {
      const ticketNum = 'TK-' + Date.now().toString().slice(-8);
      this.formGroup.get('numeroTicket')?.setValue(ticketNum);
    }
    if (!this.formGroup.get('fechaHoraCreacion')?.value) {
      this.formGroup.get('fechaHoraCreacion')?.setValue(
        new Date().toISOString().slice(0, 16)
      );
    }

    // Sincronizar datos del solicitante desde el paso 1
    this.syncSolicitanteData();
    this.syncOrganizacionalData();
    this.disableReadonlyControls();

    // Escuchar cambios del formulario principal
    if (this.solicitudForm) {
      this.solicitudForm.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.syncSolicitanteData();
          this.syncOrganizacionalData();
        });
    }
  }

  /** Sincronizar datos del solicitante desde el paso 1 */
  private syncSolicitanteData(): void {
    if (!this.solicitudForm) return;
    const nombre = this.solicitudForm.get('nombre')?.value || '';
    const cargo = this.solicitudForm.get('cargo')?.value || '';
    const correo = this.solicitudForm.get('correoElectronico')?.value || '';
    const telefono = this.solicitudForm.get('telefonoContacto')?.value || '';

    this.solicitanteNombre.set(nombre);
    this.solicitanteCargo.set(cargo);
    this.solicitanteCorreo.set(correo);
    this.solicitanteTelefono.set(telefono);

    // Guardar en el formGroup de datos adicionales
    this.formGroup.patchValue({
      nombreCompleto: nombre,
      cargo: cargo,
      correoElectronico: correo,
      telefono: telefono
    }, { emitEvent: false });
  }

  /** Sincronizar datos organizacionales desde el paso 1 */
  private syncOrganizacionalData(): void {
    if (!this.solicitudForm) return;

    const empresa = this.solicitudForm.get('empresaCentroCostos')?.value || '';
    const area = this.solicitudForm.get('areaDepartamento')?.value || '';

    this.orgNombreEmpresa.set(empresa);
    this.orgArea.set(area);

    this.formGroup.patchValue({
      nombreEmpresa: empresa,
      oficinaArea: area,
    }, { emitEvent: false });
  }

  /** Bloquear campos que deben venir del perfil del usuario */
  private disableReadonlyControls(): void {
    [
      'nombreEmpresa',
      'nit',
      'nombreCompleto',
      'cargo',
      'correoElectronico',
      'telefono',
    ].forEach((controlName) => {
      this.formGroup.get(controlName)?.disable({ emitEvent: false });
    });
  }

  /** Seleccionar opción en chips */
  selectOption(controlName: string, value: string): void {
    this.formGroup.get(controlName)?.setValue(value);
    
    // Si cambia el tipo de solicitud, actualizar sub-clasificaciones
    if (controlName === 'tipoSolicitud') {
      this.tipoSolicitudSeleccionado.set(value);
      this.subClasificacionesFiltradas.set(this.subClasificaciones[value] || []);
      this.formGroup.get('subClasificacion')?.setValue('');
    }
  }

  /** Toggle para sede/complejo */
  toggleTieneSedeComplejo(): void {
    const current = this.formGroup.get('tieneSedeComplejo')?.value;
    this.formGroup.get('tieneSedeComplejo')?.setValue(!current);
  }

  /** Manejo de archivo adjunto */
  onArchivoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.archivoAdjunto.set(file);
      this.formGroup.get('archivoAdjuntoUrl')?.setValue(file.name);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDropArchivo(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.archivoAdjunto.set(file);
      this.formGroup.get('archivoAdjuntoUrl')?.setValue(file.name);
    }
  }

  removeArchivo(event: Event): void {
    event.stopPropagation();
    this.archivoAdjunto.set(null);
    this.formGroup.get('archivoAdjuntoUrl')?.setValue('');
  }
}
