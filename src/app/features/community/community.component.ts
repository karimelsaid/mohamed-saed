import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUsers, faPlus, faLink, faUserGraduate, faLock, faCheckCircle, faInfoCircle, faMars, faVenus, faSearch, faArrowRight, faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { HalaqaService, Halaqa } from '../../core/services/halaqa.service';
import { AuthService } from '../../auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
    selector: 'app-community',
    standalone: true,
    imports: [CommonModule, FormsModule, FontAwesomeModule],
    templateUrl: './community.component.html',
    styleUrls: ['./community.component.css']
})
export class CommunityComponent implements OnInit {
    faUsers = faUsers;
    faPlus = faPlus;
    faLink = faLink;
    faUserGraduate = faUserGraduate;
    faLock = faLock;
    faCheckCircle = faCheckCircle;
    faInfoCircle = faInfoCircle;
    faMars = faMars;
    faVenus = faVenus;
    faSearch = faSearch;
    faArrowRight = faArrowRight;
    faShareAlt = faShareAlt;

    availableHalaqas: Halaqa[] = [];
    userGender: string = '';
    userId: string = '';
    inviteCode: string = '';

    showCreateModal = false;
    newHalaqa = {
        name: '',
        description: '',
        maxMembers: 20
    };

    message = '';
    isLoading = false;

    constructor(
        private halaqaService: HalaqaService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private location: Location
    ) { }

    ngOnInit(): void {
        this.authService.user$.subscribe((user: any) => {
            if (user) {
                this.userId = user.id || user._id;
                this.userGender = user.gender || '';
                if (this.userGender) {
                    this.loadHalaqas();
                }
            } else {
                // Use relative navigation so it works in both main app and Mushaf
                this.router.navigate(['../login'], {
                    relativeTo: this.route,
                    queryParams: { returnUrl: this.router.url },
                    replaceUrl: true
                });
            }
        });
    }

    goBack() {
        if (window.history.length > 1) {
            this.location.back();
        } else {
            this.router.navigate(['/']);
        }
    }

    openDetails(id: string) {
        this.router.navigate([id], { relativeTo: this.route });
    }

    loadHalaqas() {
        this.isLoading = true;
        this.halaqaService.getAvailableHalaqas(this.userGender).subscribe({
            next: (res) => {
                this.availableHalaqas = res.data;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading halaqas', err);
                this.isLoading = false;
            }
        });
    }

    shareInviteCode(event: Event, code?: string) {
        event.stopPropagation();
        if (!code) return;

        if (navigator.share) {
            navigator.share({
                title: 'انضم لحلقتي في تطبيق كـنـوز',
                text: `كود الانضمام: ${code}`,
                url: window.location.origin
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(code).then(() => {
                this.message = '✅ تم نسخ كود الدعوة!';
                setTimeout(() => this.message = '', 3000);
            });
        }
    }

    joinByCode() {
        if (!this.inviteCode) return;
        this.message = '';
        this.halaqaService.joinHalaqa(this.userId, this.inviteCode).subscribe({
            next: (res) => {
                this.message = '✅ تم الانضمام للحلقة بنجاح!';
                this.inviteCode = '';
                this.loadHalaqas();
            },
            error: (err) => {
                this.message = `❌ ${err.error.message || 'فشل الانضمام'}`;
            }
        });
    }

    createHalaqa() {
        if (!this.newHalaqa.name) return;
        this.isLoading = true;
        this.halaqaService.createHalaqa({
            ...this.newHalaqa,
            leaderId: this.userId
        }).subscribe({
            next: (res) => {
                this.message = '✅ تم إنشاء الحلقة بنجاح!';
                this.showCreateModal = false;
                this.newHalaqa = { name: '', description: '', maxMembers: 20 };
                this.loadHalaqas();
                this.isLoading = false;
            },
            error: (err) => {
                this.message = `❌ ${err.error.message || 'فشل الإنشاء'}`;
                this.isLoading = false;
            }
        });
    }
}
