import { Component, signal, ElementRef, ViewChild, AfterViewChecked, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, state, style, transition, animate, keyframes } from '@angular/animations';
import { ChatService } from './chat.service';
import { ChatResponse } from './chat.models';

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
  timestamp: Date;
  typing?: boolean;
}

interface QuickAction {
  label: string;
  query: string;
  icon: string;
}

@Component({
  selector: 'app-convex-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './convex-chatbot.component.html',
  styleUrls: ['./convex-chatbot.component.scss'],
  animations: [
    trigger('chatPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.4) translateY(40px)' }),
        animate('350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'scale(1) translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate('250ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'scale(0.4) translateY(40px)' })
        ),
      ]),
    ]),
    trigger('messageIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px) scale(0.95)' }),
        animate('300ms 50ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' })
        ),
      ]),
    ]),
    trigger('bubblePulse', [
      state('idle', style({ transform: 'scale(1)' })),
      state('pulse', style({ transform: 'scale(1)' })),
      transition('idle => pulse', [
        animate('600ms', keyframes([
          style({ transform: 'scale(1)', offset: 0 }),
          style({ transform: 'scale(1.15)', offset: 0.4 }),
          style({ transform: 'scale(0.95)', offset: 0.7 }),
          style({ transform: 'scale(1)', offset: 1 }),
        ])),
      ]),
    ]),
  ],
})
export class ConvexChatbotComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @Input() tramiteId: number | null = null;

  isOpen = signal(false);
  messages = signal<ChatMessage[]>([]);
  userInput = signal('');
  isTyping = signal(false);
  bubbleState = signal<'idle' | 'pulse'>('idle');
  hasBeenOpened = signal(false);
  unreadCount = signal(1);

  quickActions: QuickAction[] = [
    { label: 'Kg a Libras', query: '¿Cómo convierto kilogramos a libras?', icon: '⚖️' },
    { label: 'Litros a Galones', query: '¿Cómo convierto litros a galones?', icon: '🧪' },
    { label: 'Marcas de productos', query: '¿Qué productos hay en las órdenes de compra?', icon: '📊' },
    { label: 'Análisis productos', query: '¿Cuántas marcas de cada producto hay en las órdenes?', icon: '🔍' },
  ];

  private chatService = inject(ChatService);
  private shouldScroll = false;

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  toggleChat(): void {
    const opening = !this.isOpen();
    this.isOpen.set(opening);

    if (opening && !this.hasBeenOpened()) {
      this.hasBeenOpened.set(true);
      this.unreadCount.set(0);
      this.showWelcomeMessages();
    }

    if (opening) {
      this.unreadCount.set(0);
      this.bubbleState.set('idle');
    }
  }

  private showWelcomeMessages(): void {
    const welcomeMessages = [
      '¡Hola! 👋 Soy **ConveX**, tu asistente de conversión de unidades y análisis de productos.',
      'Puedo ayudarte a **convertir unidades** (kg, libras, litros, etc.) y también a **analizar productos** en las órdenes de compra: marcas, proveedores, cantidades y cumplimiento vs planeación.',
      'Escribe tu consulta o usa las acciones rápidas de abajo para comenzar. 🚀',
    ];

    this.isTyping.set(true);
    let delay = 400;

    welcomeMessages.forEach((msg, i) => {
      setTimeout(() => {
        this.messages.update((msgs) => [
          ...msgs,
          { from: 'bot', text: msg, timestamp: new Date() },
        ]);
        this.shouldScroll = true;

        if (i === welcomeMessages.length - 1) {
          this.isTyping.set(false);
        }
      }, delay);
      delay += 900;
    });
  }

  sendMessage(): void {
    const text = this.userInput().trim();
    if (!text) return;

    this.messages.update((msgs) => [
      ...msgs,
      { from: 'user', text, timestamp: new Date() },
    ]);
    this.userInput.set('');
    this.shouldScroll = true;

    this.sendToBackend(text);
  }

  onQuickAction(action: QuickAction): void {
    this.messages.update((msgs) => [
      ...msgs,
      { from: 'user', text: action.query, timestamp: new Date() },
    ]);
    this.shouldScroll = true;
    this.sendToBackend(action.query);
  }

  private sendToBackend(userText: string): void {
    this.isTyping.set(true);

    this.chatService.sendMessage(userText, undefined, this.tramiteId).subscribe({
      next: (response: ChatResponse) => {
        let reply = response.reply;

        if (response.intent === 'unit_conversion' && response.convertedValue != null) {
          reply += `\n\n📐 **${response.sourceValue} ${response.sourceUnit} → ${response.convertedValue} ${response.targetUnit}**`;
        }

        if (response.intent === 'product_analysis' && response.brandCount != null && response.brandCount > 0) {
          if (response.fulfillmentPercentage != null) {
            reply += `\n\n📈 Cumplimiento: **${response.fulfillmentPercentage.toFixed(1)}%**`;
          }
        }

        this.messages.update((msgs) => [
          ...msgs,
          { from: 'bot', text: reply, timestamp: new Date() },
        ]);
        this.isTyping.set(false);
        this.shouldScroll = true;
      },
      error: (err: Error) => {
        this.messages.update((msgs) => [
          ...msgs,
          { from: 'bot', text: `⚠️ ${err.message}`, timestamp: new Date() },
        ]);
        this.isTyping.set(false);
        this.shouldScroll = true;
      },
    });
  }

  formatMessage(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch (_) {}
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
