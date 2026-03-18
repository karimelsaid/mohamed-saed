import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { Share } from '@capacitor/share';
import { HalaqaService, Halaqa } from '../../core/services/halaqa.service';
import { AuthService } from '../../auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { 
    faUsers, faPlus, faLink, faUserGraduate, faLock, 
    faCheckCircle, faInfoCircle, faMars, faVenus, 
    faSearch, faArrowRight, faShareAlt 
} from '@fortawesome/free-solid-svg-icons';

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
    myHalaqas: any[] = [];
    userGender: string = '';
    userId: string = '';
    inviteCode: string = '';

    // Search and Pagination
    searchTerm: string = '';
    currentPage: number = 1;
    itemsPerPage: number = 10;
    totalPages: number = 1;
    totalItems: number = 0;

    showCreateModal = false;
    newHalaqa = {
        name: '',
        description: '',
        maxMembers: 20
    };

    message = '';
    isLoading = false;
    selectedGender: string = '';

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
                this.userId = (user.id || user._id)?.toString();
                this.userGender = user.gender || '';
                this.loadHalaqas();
            } else {
                this.router.navigate(['/login'], {
                    queryParams: { returnUrl: '/community' }
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

        this.halaqaService.getAvailableHalaqas(
            this.userGender,
            this.userId,
            this.searchTerm,
            this.currentPage,
            this.itemsPerPage
        ).subscribe({
            next: (res) => {
                this.availableHalaqas = res.data;
                if (res.pagination) {
                    this.totalItems = res.pagination.total;
                    this.totalPages = res.pagination.pages;
                }
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Error loading halaqas', err);
                this.isLoading = false;
            }
        });

        if (this.currentPage === 1 && !this.searchTerm) {
            this.halaqaService.getMyHalaqas(this.userId).subscribe({
                next: (res) => {
                    this.myHalaqas = res.data;
                },
                error: (err) => {
                    console.error('Error loading my halaqas', err);
                }
            });
        }
    }

    onSearch() {
        this.currentPage = 1;
        this.loadHalaqas();
    }

    onPageChange(page: number) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.loadHalaqas();
    }

    async shareInviteCode(event: Event, code?: string) {
        event.stopPropagation();
        if (!code) return;

        try {
            await Share.share({
                title: 'انضم لحلقتي في تطبيق كـنـوز',
                text: `كود الانضمام للحلقة: ${code}`,
                url: 'https://knoozbook.com',
                dialogTitle: 'مشاركة كود الانضمام',
            });
        } catch (err) {
            if (navigator.share) {
                navigator.share({
                    title: 'انضم لحلقتي في تطبيق كـنـوز',
                    text: `كود الانضمام: ${code}`,
                }).catch(() => this.copyToClipboard(code));
            } else {
                this.copyToClipboard(code);
            }
        }
    }

    private copyToClipboard(code: string) {
        navigator.clipboard.writeText(code).then(() => {
            this.message = '✅ تم نسخ كود الدعوة!';
            setTimeout(() => this.message = '', 3000);
        });
    }

    joinByCode() {
        if (!this.inviteCode) return;
        this.message = '';
        this.isLoading = true;
        this.halaqaService.joinHalaqa(this.userId, this.inviteCode).subscribe({
            next: (res) => {
                this.message = '✅ تم الانضمام للحلقة بنجاح! جاري توجيهك...';
                this.inviteCode = '';
                this.loadHalaqas();
                setTimeout(() => {
                    if (res.data?._id) {
                        this.openDetails(res.data._id);
                    }
                }, 1500);
            },
            error: (err) => {
                this.isLoading = false;
                this.message = `❌ ${err.error.message || 'فشل الانضمام'}`;
            }
        });
    }

    createHalaqa() {
        if (!this.newHalaqa.name) return;

        this.isLoading = true;
        this.halaqaService.createHalaqa({
            ...this.newHalaqa,
            leaderId: this.userId,
            gender: this.selectedGender || this.userGender
        }).subscribe({
            next: (res) => {
                this.message = '✅ تم إنشاء الحلقة بنجاح!';
                this.showCreateModal = false;
                this.newHalaqa = { name: '', description: '', maxMembers: 20 };
                this.selectedGender = '';
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
