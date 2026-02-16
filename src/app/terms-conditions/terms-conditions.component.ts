import { Component } from '@angular/core';

@Component({
  selector: 'app-terms-conditions',
  template: `
    <div class="container mx-auto p-4 pt-10 md:pt-40">
      <h1 class="text-3xl font-bold mb-4">الشروط والأحكام</h1>
      <div class="space-y-4 rtl">
        <p>
          مرحبًا بكم في مكتبة كنوز. باستخدامك لهذا الموقع، فإنك توافق على الالتزام بالشروط والأحكام التالية:
        </p>
        <ul class="list-disc list-inside mb-4 space-y-2 text-gray-700 dark:text-gray-300">
          <li>جميع المحتويات المعروضة هي ملك لأصحابها ولا تتحمل المكتبة مسؤولية أي انتهاك لحقوق الملكية الفكرية.</li>
          <li>يُمنع استخدام الموقع لأي أغراض غير قانونية أو مخالفة للأخلاق العامة.</li>
          <li>نحتفظ بالحق في تعديل أو تحديث هذه الشروط في أي وقت دون إشعار مسبق.</li>
          <li>المستخدم مسؤول عن الحفاظ على سرية معلومات حسابه وعدم مشاركتها مع الآخرين.</li>
          <li>لا نضمن توفر الموقع بشكل دائم أو خلوه من الأخطاء التقنية.</li>
        </ul>
        <p>
          إذا لم توافق على هذه الشروط، يرجى عدم استخدام الموقع.
        </p>
      </div>
    </div>
  `,
})
export class TermsConditionsComponent {}
