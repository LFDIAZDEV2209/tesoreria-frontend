import {
  animate,
  animateChild,
  query,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';

/**
 * Set de animaciones del Gestor Presupuestal — alineadas con el lenguaje de
 * Nexa (transform + opacity, tiempos cortos, cubic-bezier estándar).
 */
export const gpStagger = trigger('gpStagger', [
  transition(':enter', [
    query('.gp-item', [
      style({ opacity: 0, transform: 'translateY(14px)' }),
      stagger(22, [
        animate('240ms cubic-bezier(0.4,0,0.2,1)',
          style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ], { optional: true }),
    query('@*', animateChild(), { optional: true }),
  ]),
]);

export const gpPop = trigger('gpPop', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.96) translateY(10px)' }),
    animate('220ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 1, transform: 'scale(1) translateY(0)' })),
  ]),
  transition(':leave', [
    animate('160ms ease-in', style({ opacity: 0, transform: 'scale(0.98)' })),
  ]),
]);

export const gpBackdrop = trigger('gpBackdrop', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('180ms ease-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0 })),
  ]),
]);

/* Sin animar `height`: expandir un panel grande fuerza layout en cada frame.
   fade + translateY corre en el compositor y se siente igual de fluido. */
export const gpExpander = trigger('gpExpander', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(10px)' }),
    animate('220ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
  transition(':leave', [
    animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(6px)' })),
  ]),
]);

export const gpFilaTabla = trigger('gpFilaTabla', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-8px)' }),
    animate('{{ tiempo }}ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 1, transform: 'translateX(0)' })),
  ], { params: { tiempo: 200 } }),
]);

/**
 * Despliegue suave para acordeones de tablas: altura + opacidad con
 * easing de salida (unfold) y entrada (collapse), sin saltos de scroll.
 * Duraciones cortas: animar `height` de tablas grandes fuerza layout
 * por frame, así que se mantiene breve.
 */
export const gpUnfold = trigger('gpUnfold', [
  transition(':enter', [
    style({ height: 0, opacity: 0 }),
    animate('280ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    animate('180ms ease-in',
      style({ height: 0, opacity: 0 })),
  ]),
]);

/**
 * Despliegue/colapso de las secciones del rail: la tabla se ABRE desde
 * cero (altura + opacidad) al entrar y se PLEGa al salir — el mismo
 * gesto de acordeón de la bandeja, con curvas suaves.
 */
export const gpDespliegue = trigger('gpDespliegue', [
  transition(':enter', [
    style({ height: 0, opacity: 0, overflow: 'hidden' }),
    animate('340ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    style({ overflow: 'hidden' }),
    animate('260ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ height: 0, opacity: 0 })),
  ]),
]);

/**
 * Cambio de contenido dentro de un panel (rail de secciones → tabla):
 * entra subiendo con fade, sale bajando con fade. Sin escala para no
 * distorsionar tablas anchas.
 */
export const gpSwap = trigger('gpSwap', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(10px)' }),
    animate('220ms cubic-bezier(0.4,0,0.2,1)',
      style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
  transition(':leave', [
    animate('140ms ease-in',
      style({ opacity: 0, transform: 'translateY(-6px)' })),
  ]),
]);

/**
 * Despliegue/colapso de dropdowns (selector de empresa, menús flotantes):
 * entra con escala + caída suave, sale con fade rápido.
 */
export const gpDropdown = trigger('gpDropdown', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.96) translateY(-6px)' }),
    animate('200ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ opacity: 1, transform: 'scale(1) translateY(0)' })),
  ]),
  transition(':leave', [
    animate('140ms cubic-bezier(0.4, 0, 1, 1)',
      style({ opacity: 0, transform: 'scale(0.97) translateY(-4px)' })),
  ]),
]);

/** Fade escalonado para los ítems de una lista desplegable. */
export const gpListItem = trigger('gpListItem', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-6px)' }),
    animate('{{ tiempo }}ms cubic-bezier(0.4, 0, 0.2, 1)',
      style({ opacity: 1, transform: 'translateX(0)' })),
  ], { params: { tiempo: 180 } }),
]);

/**
 * Anillo de progreso circular (SVG): dibuja el arco desde 0 hasta el
 * porcentaje objetivo. `desde`/`hasta` son valores de stroke-dashoffset
 * (C = circunferencia del círculo = arco vacío; 0 = arco completo).
 */
export const gpAnillo = trigger('gpAnillo', [
  transition(':enter', [
    style({ 'stroke-dashoffset': '{{ desde }}' }),
    animate('1200ms 250ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ 'stroke-dashoffset': '{{ hasta }}' })),
  ], { params: { desde: 264, hasta: 0 } }),
]);
