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

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">4. حذف الحساب والبيانات (Account & Data Deletion)</h2>
          <p>
            يحق لك في أي وقت طلب حذف حسابك وكافة البيانات المرتبطة به بشكل نهائي. يمكنك القيام بذلك عبر إعدادات الملف الشخصي داخل التطبيق أو من خلال التواصل معنا مباشرة عبر البريد الإلكتروني الموضح أدناه، وسيتم تنفيذ طلبك وحذف بياناتك بالكامل من خوادمنا خلال 30 يوماً.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">5. التواصل معنا</h2>
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
