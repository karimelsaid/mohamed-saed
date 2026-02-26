import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class AdminAuthGuard implements CanActivate {

    constructor(
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) { }

    canActivate(): boolean {
        if (!isPlatformBrowser(this.platformId)) {
            return true; // Allow rendering on server if necessary, or return false to skip
        }

        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && user.role === 'admin') {
                    return true;
                }
            } catch (e) {
                console.error('Error parsing user from localStorage:', e);
            }
        }

        // Not an admin or not logged in
        alert('ليس لديك صلاحية للوصول لهذا المحتوى.');
        this.router.navigate(['/']); // Redirect to home
        return false;
    }
}
