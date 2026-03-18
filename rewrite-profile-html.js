const fs = require('fs');
const path = require('path');

const htmlPath = 'd:\\My projects\\Kenouz\\src\\app\\auth\\user-profile\\user-profile.component.html';
const content = fs.readFileSync(htmlPath, 'utf8');
const lines = content.split('\n');

function getLines(start, end) {
    return lines.slice(start - 1, end).join('\n');
}

const postsFeedTemplate = getLines(1, 121);
const coverPhotoWrapper = getLines(127, 142);
const profileInfoBanner = getLines(144, 202);
const statsCard = getLines(209, 228);
const aboutCard = getLines(230, 240);
const coinsCard = getLines(428, 445);
const cashWalletCard = getLines(448, 465);

const postCreationBox = getLines(245, 256);
const feedHeader = getLines(258, 259);
const postsOutlet = getLines(261, 262);

const profileSettingsTab = getLines(469, 640);
const codeBox = getLines(648, 674);
const howRequestsWork = getLines(678, 705);
const achievementsTab = getLines(708, 726);

const modalsections = getLines(744, 867);

const newContent = `${postsFeedTemplate}

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 pt-24 pb-12 px-4 sm:px-6 lg:px-8 rtl" dir="rtl">
    ${coverPhotoWrapper}

    ${profileInfoBanner}

    <!-- Profile Navigation Tabs -->
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
       <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-2 flex overflow-x-auto gap-2 custom-scrollbar">
          <button (click)="switchTab('posts')" [ngClass]="activeTab === 'posts' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap outline-none">
             <fa-icon [icon]="faQuoteRight"></fa-icon> المنشورات
          </button>
          <button *ngIf="isOwnProfile" (click)="switchTab('profile')" [ngClass]="activeTab === 'profile' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap outline-none">
             <fa-icon [icon]="faEdit"></fa-icon> تعديل البيانات
          </button>
          <button *ngIf="isOwnProfile" (click)="switchTab('achievements')" [ngClass]="activeTab === 'achievements' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap outline-none">
             <fa-icon [icon]="faTrophy"></fa-icon> إنجازاتي
          </button>
          <button *ngIf="isOwnProfile" (click)="switchTab('referrals')" [ngClass]="activeTab === 'referrals' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap outline-none">
             <fa-icon [icon]="faUsers"></fa-icon> دعوة الأصدقاء
          </button>
          <div *ngIf="isOwnProfile" class="h-8 w-px bg-gray-200 dark:bg-gray-700 my-auto mx-2 flex-shrink-0 hidden sm:block"></div>
          <button *ngIf="isOwnProfile" (click)="enableNotifications()" [disabled]="isEnablingNotifications || notificationsEnabled" [ngClass]="notificationsEnabled ? 'text-green-600' : 'text-gray-500 hover:text-blue-500'" class="flex items-center gap-2 px-4 py-3 font-bold transition-all whitespace-nowrap flex-shrink-0 outline-none">
             <fa-icon [icon]="notificationsEnabled ? faCheckCircle : faBell" [class.animate-pulse]="isEnablingNotifications"></fa-icon>
             <span class="hidden sm:inline">{{ notificationsEnabled ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات' }}</span>
          </button>
          <button *ngIf="isOwnProfile" (click)="logout()" class="flex items-center gap-2 px-4 py-3 text-red-500 hover:text-red-700 font-bold transition-all whitespace-nowrap flex-shrink-0 mr-auto outline-none">
             <fa-icon [icon]="faSignOutAlt"></fa-icon> خروج
          </button>
       </div>
    </div>

    <!-- Two Column Layout: Feed/Stats and Content -->
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
      
      <!-- Right Col (Stats & Info) -->
      <div class="lg:col-span-1 space-y-6 order-2 lg:order-1">
${statsCard}
${aboutCard}

         <!-- Hero Card: Coins & Wallet (Only when referrals or achievements active) -->
         <div *ngIf="isOwnProfile && (activeTab === 'referrals' || activeTab === 'achievements')" class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
${coinsCard}
${cashWalletCard}
         </div>
      </div>

      <!-- Left Col (Main Content) -->
      <div class="lg:col-span-2 space-y-6 order-1 lg:order-2">
         
         <!-- Tab: Posts -->
         <ng-container *ngIf="activeTab === 'posts'">
            <div class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
${postCreationBox}
${feedHeader}
${postsOutlet}
            </div>
         </ng-container>

         <!-- Tab: Profile Settings -->
         <ng-container *ngIf="activeTab === 'profile'">
${profileSettingsTab}
         </ng-container>

         <!-- Tab: Referrals -->
         <ng-container *ngIf="activeTab === 'referrals'">
            <div class="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
${codeBox}
${howRequestsWork}
            </div>
         </ng-container>

         <!-- Tab: Achievements -->
         <ng-container *ngIf="activeTab === 'achievements'">
${achievementsTab}
         </ng-container>

      </div>
    </div>
</div>

`;

fs.writeFileSync(htmlPath, newContent);
console.log('HTML file successfully rewritten!');
