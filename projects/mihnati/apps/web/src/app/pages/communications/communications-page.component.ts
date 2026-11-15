import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, NotificationItem, ConversationItem } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

export interface ChatContact {
  id: string;
  name: string;
  profession: string;
  avatarBg: string;
  avatarEmoji: string;
  lastMessage: string;
  lastTime: string;
  unreadCount?: number;
  online: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'them';
  text: string;
  time: string;
}

@Component({
  selector: 'app-communications-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './communications-page.component.html',
  styleUrls: ['./communications-page.component.css']
})
export class CommunicationsPageComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  readonly authService = inject(AuthService);

  notifications = signal<NotificationItem[]>([]);
  conversations = signal<ConversationItem[]>([]);

  // Mocked rich conversations matching ui-ux-overview.png
  contacts: ChatContact[] = [
    {
      id: 'c1',
      name: 'أحمد محمود',
      profession: 'سباك محترف',
      avatarBg: '#0284C7',
      avatarEmoji: '👨‍🔧',
      lastMessage: 'تمام يا فندم، متاح أكون عندك بعد الظهر إن شاء الله.',
      lastTime: '10:20 ص',
      unreadCount: 1,
      online: true
    },
    {
      id: 'c2',
      name: 'محمد علي',
      profession: 'حداد محترف',
      avatarBg: '#EA580C',
      avatarEmoji: '🧑‍🏭',
      lastMessage: 'تم تفصيل الباب وجاهز للتركيب غداً.',
      lastTime: 'منذ ساعة',
      online: false
    },
    {
      id: 'c3',
      name: 'علي حسن',
      profession: 'نجار محترف',
      avatarBg: '#16A34A',
      avatarEmoji: '🪚',
      lastMessage: 'شكراً لذوقك، في انتظار تأكيد موعد التسليم.',
      lastTime: 'منذ 3 ساعات',
      online: false
    }
  ];

  selectedContact = signal<ChatContact>(this.contacts[0]);

  // Messages thread matching ui-ux-overview.png
  messages = signal<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'me',
      text: 'السلام عليكم يا أسطى، هل تقدر تجيلي اليوم لمعاينة عطل السباكة؟',
      time: '10:15 ص'
    },
    {
      id: 'm2',
      sender: 'them',
      text: 'وعليكم السلام يا فندم، أهلاً بحضرتك. تمام متاح أكون عندك بعد الظهر إن شاء الله.',
      time: '10:18 ص'
    },
    {
      id: 'm3',
      sender: 'me',
      text: 'بالتأكيد، متاح لدينا التواجد من الساعة 2 ظهراً وحتى المساء، بانتظارك.',
      time: '10:20 ص'
    }
  ]);

  newMessageText = '';

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.loadNotifications();
    }
  }

  loadNotifications(): void {
    this.apiService.getNotifications().subscribe({
      next: (res) => this.notifications.set(res.data),
      error: () => this.notifications.set([])
    });
  }

  selectContact(contact: ChatContact): void {
    this.selectedContact.set(contact);
  }

  sendMessage(): void {
    if (!this.newMessageText.trim()) return;

    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      sender: 'me',
      text: this.newMessageText.trim(),
      time: 'الآن'
    };

    this.messages.update((list) => [...list, newMsg]);
    this.newMessageText = '';

    // Auto reply for demonstration
    setTimeout(() => {
      this.messages.update((list) => [
        ...list,
        {
          id: 'msg_reply_' + Date.now(),
          sender: 'them',
          text: 'تم الاستلام يا فندم، شكراً لتواصلك.',
          time: 'الآن'
        }
      ]);
    }, 1200);
  }
}
