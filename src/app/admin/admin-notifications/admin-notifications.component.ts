import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // For ngModel
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPaperPlane, faBookOpen, faBell } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-admin-notifications',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './admin-notifications.component.html',
    styleUrls: ['./admin-notifications.component.css']
})
export class AdminNotificationsComponent implements OnInit {
    faPaperPlane = faPaperPlane;
    faBookOpen = faBookOpen;
    faBell = faBell;

    activeTab: 'manual' | 'library' = 'manual';
    libraryContent: any[] = [];

    // Manual Form
    manualTitle: string = '';
    manualBody: string = '';
    manualUserId: string = '';
    manualUrl: string = '/how-to-earn'; // Default action URL

    // Library Form
    selectedTemplateId: string = '';

    get selectedTemplate(): any {
        return this.libraryContent?.find(i => i.id === this.selectedTemplateId) || null;
    }

    statusMessage: string = '';
    isSending: boolean = false;

    constructor(private http: HttpClient) { }

    ngOnInit() {
        this.loadLibrary();
    }

    loadLibrary() {
        // In a real app, this would come from the backend. 
        // For now, we can hardcode the same JSON structure or fetch it if an endpoint exists.
        // We'll fetch from a new endpoint later or just mock it here for valid initial display.
        this.http.get(`${environment.apiBaseUrl}/notifications/library`).subscribe({
            next: (data: any) => {
                this.libraryContent = data.library || [];
            },
            error: (err) => {
                console.warn('Could not load library, using defaults', err);
                // Fallback library data matching backend structure
                this.libraryContent = [
                    { id: "streak_saver_1", title: "🔥 أنقذ التتابع الخاص بك!", body: "لم تقم بزيارتنا اليوم! افتح التطبيق الآن." },
                    { id: "daily_reward_1", title: "🎁 مكافأتك اليومية بانتظارك!", body: "سجل الدخول الآن واجمع عملاتك." }
                ];
            }
        });
    }

    sendManual() {
        if (!this.manualTitle || !this.manualBody) {
            this.statusMessage = 'Please fill in title and body.';
            return;
        }

        this.send(this.manualTitle, this.manualBody, this.manualUrl, this.manualUserId);
    }

    sendFromLibrary() {
        const template = this.libraryContent.find(t => t.id === this.selectedTemplateId);
        if (!template) return;

        // Allow overriding user ID in library mode too
        this.send(template.title, template.body, '/how-to-earn', this.manualUserId);
    }

    send(title: string, body: string, url: string, userId: string) {
        this.isSending = true;
        this.statusMessage = 'Sending...';

        const payload = {
            title,
            body,
            url,
            userId: userId || null // Null means broadcast to all
        };

        this.http.post(`${environment.apiBaseUrl}/notifications/admin/send`, payload).subscribe({
            next: (res: any) => {
                this.isSending = false;
                this.statusMessage = `Success! Sent to ${res.successCount} users.`;
            },
            error: (err) => {
                this.isSending = false;
                this.statusMessage = `Error: ${err.message}`;
            }
        });
    }
}
