import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Iconos de trazo del diseño Nexa, compartidos por las pantallas del Gestor. */
@Component({
  selector: 'app-gp-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [style.width.px]="size" [style.height.px]="size"
         fill="none" stroke="currentColor" [attr.stroke-width]="strokeWidth"
         stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"
         aria-hidden="true">
      <ng-container [ngSwitch]="name">
        <ng-container *ngSwitchCase="'plus'"><path d="M5 12h14"/><path d="M12 5v14"/></ng-container>
        <ng-container *ngSwitchCase="'minus'"><path d="M5 12h14"/></ng-container>
        <ng-container *ngSwitchCase="'balance'"><path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/></ng-container>
        <ng-container *ngSwitchCase="'sun'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></ng-container>
        <ng-container *ngSwitchCase="'moon'"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></ng-container>
        <ng-container *ngSwitchCase="'contrast'"><path d="M12 2v2"/><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"/><path d="M16 12a4 4 0 0 0-4-4"/><path d="m19 5-1.256 1.256"/><path d="M20 12h2"/></ng-container>
        <ng-container *ngSwitchCase="'logout'"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></ng-container>
        <ng-container *ngSwitchCase="'chevron-up'"><path d="m18 15-6-6-6 6"/></ng-container>
        <ng-container *ngSwitchCase="'eye'"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></ng-container>
        <ng-container *ngSwitchCase="'file'"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></ng-container>
        <ng-container *ngSwitchCase="'wallet'"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></ng-container>
        <ng-container *ngSwitchCase="'coins'"><circle cx="8" cy="8" r="5"/><path d="M18.09 10.37A6 6 0 1110.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/></ng-container>
        <ng-container *ngSwitchCase="'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></ng-container>
        <ng-container *ngSwitchCase="'credit-card'"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></ng-container>
        <ng-container *ngSwitchCase="'calendar'"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></ng-container>
        <ng-container *ngSwitchCase="'waves'"><path d="M2 12c1.73 0 2.61-1.5 4.5-1.5S9.77 12 11.5 12 14.27 10.5 16.2 10.5 19.1 12 22 12M2 18c1.73 0 2.61-1.5 4.5-1.5S9.77 18 11.5 18 14.27 16.5 16.2 16.5 19.1 18 22 18"/></ng-container>
        <ng-container *ngSwitchCase="'users'"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></ng-container>
        <ng-container *ngSwitchCase="'sigma'"><path d="M18 8V6a2 2 0 00-2-2H6a2 2 0 00-1.06 3.71L11 12 4.94 16.29A2 2 0 006 20h10a2 2 0 002-2v-2"/><path d="M15 12h6"/></ng-container>
        <ng-container *ngSwitchCase="'receipt'"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zm2 5h12M6 11h12M6 15h9"/></ng-container>
        <ng-container *ngSwitchCase="'trending'"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></ng-container>
        <ng-container *ngSwitchCase="'check'"><path d="M20 6L9 17l-5-5"/></ng-container>
        <ng-container *ngSwitchCase="'shield'"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></ng-container>
        <ng-container *ngSwitchCase="'chart'"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></ng-container>
        <ng-container *ngSwitchCase="'bank'"><path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7zM12 3v0"/></ng-container>
        <ng-container *ngSwitchCase="'alert'"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></ng-container>
        <ng-container *ngSwitchCase="'search'"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></ng-container>
        <ng-container *ngSwitchCase="'x'"><path d="M18 6L6 18M6 6l12 12"/></ng-container>
        <ng-container *ngSwitchCase="'chevron'"><path d="M9 18l6-6-6-6"/></ng-container>
        <ng-container *ngSwitchCase="'chevron-down'"><path d="M6 9l6 6 6-6"/></ng-container>
        <ng-container *ngSwitchCase="'arrow-left'"><path d="M19 12H5M12 19l-7-7 7-7"/></ng-container>
        <ng-container *ngSwitchCase="'arrow-right'"><path d="M5 12h14M12 5l7 7-7 7"/></ng-container>
        <ng-container *ngSwitchCase="'edit'"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></ng-container>
        <ng-container *ngSwitchCase="'trash'"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></ng-container>
        <ng-container *ngSwitchCase="'download'"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></ng-container>
        <ng-container *ngSwitchCase="'upload'"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></ng-container>
        <ng-container *ngSwitchCase="'filter'"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></ng-container>
        <ng-container *ngSwitchCase="'layers'"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></ng-container>
        <ng-container *ngSwitchCase="'building'"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M12 10h.01"/></ng-container>
        <ng-container *ngSwitchCase="'suitcase'"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></ng-container>
        <ng-container *ngSwitchCase="'calculator'"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M12 10h.01M16 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></ng-container>
        <ng-container *ngSwitchCase="'layout-dashboard'"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></ng-container>
        <ng-container *ngSwitchCase="'refresh'"><path d="M21 12a9 9 0 11-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></ng-container>
        <ng-container *ngSwitchCase="'alert-circle'"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></ng-container>
        <ng-container *ngSwitchCase="'bar-chart-2'"><path d="M18 20V10M12 20V4M6 20v-6"/></ng-container>
        <ng-container *ngSwitchCase="'pie-chart'"><path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/></ng-container>
        <ng-container *ngSwitchCase="'activity'"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></ng-container>
        <ng-container *ngSwitchCase="'sparkles'"><path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9L12 3z"/><path d="M19 15l.9 2.6L22 18.5l-2.1.9L19 22l-.9-2.6L16 18.5l2.1-.9L19 15z"/></ng-container>
        <ng-container *ngSwitchCase="'eraser'"><path d="M20 20H7L3 16a2 2 0 010-2.8l7.2-7.2a2 2 0 012.8 0l5 5a2 2 0 010 2.8L11 21"/><path d="M7 21l-3-3"/></ng-container>
        <ng-container *ngSwitchCase="'calendar-range'"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M17 14h-6M13 18H7M7 14h.01M17 18h.01"/></ng-container>
        <ng-container *ngSwitchCase="'copy'"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></ng-container>
        <ng-container *ngSwitchCase="'ban'"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></ng-container>
        <ng-container *ngSwitchCase="'key'"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></ng-container>
        <ng-container *ngSwitchCase="'user'"><path d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></ng-container>
        <ng-container *ngSwitchCase="'message-square'"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></ng-container>
        <ng-container *ngSwitchCase="'calendar-clock'"><path d="M16 14v2.2l1.6 1"/><path d="M16 2v4"/><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M3 10h5"/><path d="M8 2v4"/><circle cx="16" cy="16" r="6"/></ng-container>
        <ng-container *ngSwitchCase="'calendar-days'"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></ng-container>
        <ng-container *ngSwitchCase="'hand-coins'"><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/></ng-container>
        <ng-container *ngSwitchCase="'settings-2'"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></ng-container>
        <ng-container *ngSwitchCase="'circle-user'"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></ng-container>
        <ng-container *ngSwitchCase="'user-cog'"><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m14.305 16.53.923-.382"/><path d="m15.228 13.852-.923-.383"/><path d="m16.852 12.228-.383-.923"/><path d="m16.852 17.772-.383.924"/><path d="m19.148 12.228.383-.923"/><path d="m19.53 18.696-.382-.924"/><path d="m20.772 13.852.924-.383"/><path d="m20.772 16.148.924.383"/><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/></ng-container>
        <ng-container *ngSwitchCase="'warehouse'"><path d="M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11"/><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z"/><path d="M6 13h12"/><path d="M6 17h12"/></ng-container>
        <ng-container *ngSwitchCase="'tags'"><path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"/><path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/><circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/></ng-container>
        <ng-container *ngSwitchCase="'scroll-text'"><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></ng-container>
        <ng-container *ngSwitchCase="'file-down'"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></ng-container>
        <ng-container *ngSwitchCase="'file-spreadsheet'"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/></ng-container>
        <ng-container *ngSwitchCase="'people'"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></ng-container>
        <ng-container *ngSwitchCase="'bell'"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></ng-container>
        <ng-container *ngSwitchCase="'check-check'"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></ng-container>
        <ng-container *ngSwitchCase="'inbox'"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></ng-container>
      </ng-container>
    </svg>
  `,
})
export class GpIconComponent {
  @Input() name = 'file';
  @Input() size = 20;
  @Input() strokeWidth = 1.8;
}
