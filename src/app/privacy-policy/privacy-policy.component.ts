import { Component } from '@angular/core';

@Component({
  selector: 'app-privacy-policy',
  template: `
    <div class="container mx-auto p-4 pt-10 md:pt-40">
      <h1 class="text-3xl font-bold mb-4">سياسة الخصوصية</h1>
      <dir class="space-y-4 rtl">
        <p>
          نحن في مكتبة كنوز نلتزم بحماية خصوصيتك واحترام بياناتك الشخصية. يتم جمع المعلومات فقط لأغراض تحسين تجربتك وتقديم خدماتنا بشكل أفضل.
        </p>
        <p>
          لا نشارك معلوماتك مع أطراف ثالثة بدون موافقتك، ونستخدم أحدث التقنيات لضمان أمان بياناتك.
        </p>
        <p>
          يمكنك طلب تعديل أو حذف بياناتك في أي وقت من خلال التواصل معنا.
        </p>
        <p>
          باستخدامك لموقعنا، فإنك توافق على شروط سياسة الخصوصية هذه.
        </p>
      </dir>
    </div>
  `,
})
export class PrivacyPolicyComponent {}
