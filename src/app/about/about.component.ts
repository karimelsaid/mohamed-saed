import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  imports: [RouterModule],
  template: `
    <div class="container mx-auto p-4 pt-10 md:pt-40 max-w-4xl">
      <h1 class="text-3xl font-bold mb-6 text-emerald-800">عن الموقع</h1>
      <div class="space-y-6 rtl text-gray-700 leading-relaxed">

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">من نحن</h2>
          <p>
            knoozbook هي منصة إلكترونية متخصصة في توفير مجموعة واسعة من الكتب المتنوعة التي تلبي اهتمامات المستخدمين المختلفة.
          </p>
          <p class="mt-3">
            تتميز المكتبة بسهولة البحث والتصفح، وتوفير تجربة مستخدم مريحة وآمنة، مع إمكانية شراء الكتب بسهولة وبأسعار تنافسية.
          </p>
          <p class="mt-3">
            تهدف knoozbook إلى إثراء المعرفة وتسهيل الوصول إلى المصادر التعليمية والثقافية لجميع المستخدمين.
          </p>
          <p class="mt-3">
            يمكن للمستخدمين الاستفادة من المكتبة من خلال البحث عن الكتب، قراءة المراجعات، وإجراء عمليات الشراء بكل سهولة وأمان.
          </p>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
          <h2 class="text-xl font-semibold mb-3 text-blue-700">خدمات التجار وتكامل أمازون</h2>
          <p>
            بالإضافة إلى كونها مكتبة إلكترونية، تقدم knoozbook <strong>خدمات تكامل متقدمة لبائعي أمازون</strong> من خلال منصة Amazon Selling Partner API (SP-API).
          </p>
          <p class="mt-3">
            نتيح للتجار المسجلين على منصتنا ربط حساباتهم على Amazon Seller Central بمتجرهم على knoozbook، مما يوفر لهم:
          </p>
          <ul class="list-disc list-inside mt-3 space-y-2 text-gray-600">
            <li><strong>مزامنة المنتجات:</strong> نقل المنتجات بين knoozbook وأمازون في الاتجاهين تلقائياً</li>
            <li><strong>إدارة المخزون:</strong> تزامن المخزون في الوقت الفعلي لتجنب مشاكل نفاد المخزون</li>
            <li><strong>إدارة الطلبات:</strong> متابعة وإدارة طلبات أمازون من لوحة تحكم واحدة</li>
            <li><strong>تحديث الأسعار والبيانات:</strong> تحديث الأسعار والأوصاف عبر جميع قنوات البيع</li>
            <li><strong>تقارير وتحليلات:</strong> تقارير مبيعات شاملة تجمع بيانات المنصتين</li>
          </ul>
          <p class="mt-4">
            نستخدم نظام OAuth 2.0 الرسمي من أمازون لضمان أعلى مستويات الأمان. لا نخزن بيانات تسجيل الدخول الخاصة بالتجار ونلتزم بسياسات حماية البيانات الخاصة بأمازون.
          </p>
          <div class="mt-4">
            <a routerLink="/amazon-integration" class="text-blue-600 hover:text-blue-800 font-semibold underline">
              تعرف على المزيد عن خدمات التكامل مع أمازون ←
            </a>
          </div>
        </section>

        <section class="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
          <h2 class="text-xl font-semibold mb-3 text-emerald-700">تواصل معنا</h2>
          <p>
            إذا كان لديك أي استفسار أو اقتراح، يمكنك التواصل معنا عبر:
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
export class AboutComponent { }
