import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AdminAuthGuard implements CanActivate {

    constructor(private router: Router) { }

    canActivate(): boolean {
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
