import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-terms-conditions',
  imports: [RouterModule],
  template: `
    <div class="container mx-auto p-6 pt-10 md:pt-32 max-w-4xl dir-rtl">
      <h1 class="text-3xl font-bold mb-6 text-emerald-800">الشروط والأحكام</h1>
      <div class="space-y-6 text-gray-700 leading-relaxed text-right">

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">1. شروط الاستخدام العامة</h2>
          <p>
            مرحبًا بكم في knoozbook. باستخدامك لهذا الموقع، فإنك توافق على الالتزام بالشروط والأحكام التالية:
          </p>
          <ul class="list-disc list-inside mt-3 space-y-2 text-gray-600">
            <li>جميع المحتويات المعروضة هي ملك لأصحابها ولا تتحمل المكتبة مسؤولية أي انتهاك لحقوق الملكية الفكرية.</li>
            <li>يُمنع استخدام الموقع لأي أغراض غير قانونية أو مخالفة للأخلاق العامة.</li>
            <li>نحتفظ بالحق في تعديل أو تحديث هذه الشروط في أي وقت دون إشعار مسبق.</li>
            <li>المستخدم مسؤول عن الحفاظ على سرية معلومات حسابه وعدم مشاركتها مع الآخرين.</li>
            <li>لا نضمن توفر الموقع بشكل دائم أو خلوه من الأخطاء التقنية.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">2. شروط خدمة التكامل مع أمازون</h2>
          <p class="mb-3">
            عند استخدام خدمة التكامل مع أمازون (Amazon SP-API Integration) على knoozbook، تنطبق الشروط الإضافية التالية:
          </p>
          <ul class="list-disc list-inside space-y-2 text-gray-600">
            <li><strong>حساب أمازون:</strong> يجب أن يكون لديك حساب بائع نشط على Amazon Seller Central لاستخدام خدمة التكامل.</li>
            <li><strong>التفويض:</strong> بربط حسابك على أمازون، أنت تفوض knoozbook بالوصول إلى بيانات حسابك (المنتجات، المخزون، الطلبات) وفقاً للصلاحيات المحددة.</li>
            <li><strong>المسؤولية:</strong> أنت مسؤول عن دقة البيانات التي تزامنها بين المنصتين وعن الالتزام بسياسات أمازون للبائعين.</li>
            <li><strong>إلغاء الربط:</strong> يمكنك إلغاء ربط حسابك على أمازون في أي وقت من إعدادات حسابك على knoozbook أو من Amazon Seller Central.</li>
            <li><strong>عدم الضمان:</strong> نبذل قصارى جهدنا لضمان دقة المزامنة، لكننا لا نتحمل مسؤولية أي خسائر ناتجة عن تأخير أو أخطاء في المزامنة.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">3. الامتثال لسياسات أمازون</h2>
          <p class="mb-3">
            باستخدام خدمة التكامل مع أمازون، توافق على:
          </p>
          <ul class="list-disc list-inside space-y-2 text-gray-600">
            <li>الالتزام بـ <strong>سياسة الاستخدام المقبول (AUP)</strong> الخاصة بأمازون.</li>
            <li>الالتزام بـ <strong>سياسة حماية البيانات (DPP)</strong> الخاصة بأمازون.</li>
            <li>الالتزام بـ <strong>اتفاقية بوابة مزود الحلول</strong> الخاصة بأمازون.</li>
            <li>عدم استخدام بيانات أمازون لأي أغراض غير مصرح بها.</li>
            <li>عدم مشاركة بيانات أمازون مع أي أطراف ثالثة.</li>
          </ul>
          <p class="mt-3">
            يمكنك مراجعة سياسات أمازون الكاملة من خلال 
            <a href="https://developer-docs.amazon.com/sp-api/docs/policies-and-agreements" target="_blank" class="text-blue-600 underline font-semibold">صفحة السياسات والاتفاقيات</a>.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">4. حماية البيانات</h2>
          <p>
            نلتزم بحماية بياناتك وبيانات حسابك على أمازون وفقاً لسياسة الخصوصية الخاصة بنا. لمزيد من التفاصيل، يرجى مراجعة 
            <a routerLink="/سياسة-الخصوصية" class="text-emerald-600 underline font-semibold">سياسة الخصوصية</a>.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">5. التواصل</h2>
          <p>
            إذا لم توافق على هذه الشروط، يرجى عدم استخدام الموقع أو خدمة التكامل مع أمازون. لأي استفسارات، تواصل معنا عبر:
          </p>
          <ul class="mt-3 space-y-2 text-gray-600">
            <li>📧 البريد الإلكتروني: <a href="mailto:support@knoozbook.com" class="text-emerald-600 underline font-semibold">support&#64;knoozbook.com</a></li>
            <li>📞 الهاتف: <span dir="ltr">+20 109 461 2729</span></li>
          </ul>
        </section>

      </div>
    </div>
  `,
})
export class TermsConditionsComponent { }
