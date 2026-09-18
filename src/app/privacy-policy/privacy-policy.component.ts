import { Component } from '@angular/core';

@Component({
  selector: 'app-privacy-policy',
  template: `
    <div class="container mx-auto p-6 pt-10 md:pt-32 max-w-4xl dir-rtl">
      <h1 class="text-3xl font-bold mb-6 text-emerald-800">سياسة الخصوصية والتطبيقات</h1>
      <div class="space-y-6 text-gray-700 leading-relaxed text-right">
        
        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">1. مقدمة</h2>
          <p>
            نحن في <strong>knoozbook / مصحف وِرد</strong> نلتزم بحماية خصوصية مستخدمينا واحترام بياناتهم الشخصية. توضح سياسة الخصوصية هذه نوع البيانات التي نجمعها، وكيفية استخدامها، وحمايتها، وحقوقك المتعلقة بها.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">2. البيانات التي نجمعها والأذونات</h2>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>بيانات الحساب:</strong> مثل الاسم، والبريد الإلكتروني، وصورة الملف الشخصي عند التسجيل.</li>
            <li><strong>أذونات الصوت والميكروفون:</strong> تُستخدم فقط لخصائص التسجيل والتلاوة والحلقات القرآنية بطلب مباشر من المستخدم. لا يتم تسجيل أو استغلال الصوت في الخفاء.</li>
            <li><strong>أذونات التخزين والملفات:</strong> لتنزيل وتشغيل ملفات المصحف الصوتي والمحتوى التعليمي محلياً على جهازك.</li>
            <li><strong>معلومات الجهاز والإشعارات:</strong> لإرسال التنبيهات والأذكار والإشعار بالتحديثات الهامة.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">3. كيفية استخدام البيانات ومشاركتها</h2>
          <p>
            نستخدم البيانات فقط لتحسين الخدمة، وتخصيص تجربة المستخدم، وتقديم الدعم الفني. <strong>نؤكد بوضوح أننا لا نبيع ولا نشارك معلوماتك الشخصية مع أي أطراف ثالثة لأغراض تجارية أو إعلانية.</strong>
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">4. خصوصية بيانات بائعي أمازون (Amazon Seller Data)</h2>
          <p class="mb-3">
            عند استخدام خدمة التكامل مع أمازون (Amazon SP-API Integration)، نلتزم بالمعايير التالية لحماية بيانات البائعين:
          </p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>الوصول المحدود:</strong> نصل فقط إلى البيانات الضرورية لتقديم الخدمة (المنتجات، المخزون، الطلبات) وفقاً للأدوار (Roles) المصرح بها.</li>
            <li><strong>التشفير:</strong> جميع البيانات المنقولة مشفرة عبر TLS 1.2+ وتُخزن مشفرة باستخدام AES-256.</li>
            <li><strong>عدم تخزين بيانات الاعتماد:</strong> لا نخزن بيانات تسجيل الدخول الخاصة بأمازون. نستخدم نظام OAuth 2.0 الرسمي ونحتفظ فقط برموز الوصول (Access Tokens) المشفرة.</li>
            <li><strong>عدم المشاركة:</strong> لا نشارك بيانات بائعي أمازون مع أي طرف ثالث ولا نستخدمها لأي غرض خارج نطاق الخدمة المتفق عليها.</li>
            <li><strong>الاحتفاظ بالبيانات:</strong> نحتفظ ببيانات البائعين فقط طالما كان حسابهم نشطاً. عند إلغاء الربط أو حذف الحساب، يتم حذف جميع البيانات المرتبطة بأمازون.</li>
            <li><strong>سجلات الوصول:</strong> نحتفظ بسجلات مفصلة لجميع عمليات الوصول إلى بيانات أمازون لأغراض الأمان والمراجعة.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">5. الامتثال لسياسات أمازون</h2>
          <p class="mb-3">
            نلتزم بالكامل بسياسات أمازون التالية:
          </p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>سياسة حماية البيانات (Data Protection Policy - DPP):</strong> نطبق جميع متطلبات حماية البيانات الخاصة بأمازون.</li>
            <li><strong>سياسة الاستخدام المقبول (Acceptable Use Policy - AUP):</strong> نستخدم واجهات برمجة التطبيقات فقط للأغراض المصرح بها.</li>
            <li><strong>اتفاقية بوابة مزود الحلول (Solution Provider Portal Agreement):</strong> نلتزم بجميع شروط وأحكام الاتفاقية.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">6. الاستجابة للحوادث الأمنية</h2>
          <p class="mb-3">
            في حالة اكتشاف أي خرق أمني يتعلق ببيانات بائعي أمازون:
          </p>
          <ul class="list-disc list-inside space-y-2">
            <li>نقوم بإخطار أمازون فوراً وفقاً لسياسة حماية البيانات.</li>
            <li>نخطر البائعين المتأثرين خلال 72 ساعة.</li>
            <li>نتخذ إجراءات فورية لاحتواء الحادث ومنع تكراره.</li>
            <li>نوثق الحادث وإجراءات المعالجة بالكامل.</li>
          </ul>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">7. حذف الحساب والبيانات (Account & Data Deletion)</h2>
          <p>
            يحق لك في أي وقت طلب حذف حسابك وكافة البيانات المرتبطة به بشكل نهائي، بما في ذلك بيانات التكامل مع أمازون. يمكنك القيام بذلك عبر إعدادات الملف الشخصي داخل التطبيق أو من خلال التواصل معنا مباشرة عبر البريد الإلكتروني الموضح أدناه، وسيتم تنفيذ طلبك وحذف بياناتك بالكامل من خوادمنا خلال 30 يوماً.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">8. التواصل معنا</h2>
          <p>
            إذا كان لديك أي استفسار حول سياسة الخصوصية أو لحذف بياناتك، يرجى التواصل معنا عبر البريد الإلكتروني:
            <br/>
            <a href="mailto:support@knoozbook.com" class="text-emerald-600 underline font-semibold">support&#64;knoozbook.com</a>
          </p>
        </section>

      </div>
    </div>
  `,
})
export class PrivacyPolicyComponent { }
