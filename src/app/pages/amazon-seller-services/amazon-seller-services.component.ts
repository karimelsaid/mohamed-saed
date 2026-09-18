import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-amazon-seller-services',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Hero Section -->
    <section class="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 pt-10 md:pt-20">
      <!-- Animated Background -->
      <div class="absolute inset-0">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" style="animation-delay: 1s;"></div>
        <div class="absolute top-1/2 left-1/2 w-72 h-72 bg-purple-500/8 rounded-full blur-[100px] animate-pulse" style="animation-delay: 2s;"></div>
      </div>
      <!-- Grid Pattern -->
      <div class="absolute inset-0 opacity-[0.03]"
        style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 40px 40px;"></div>

      <div class="relative z-10 container mx-auto px-6 text-center">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-5 py-2 mb-8">
          <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          <span class="text-blue-300 text-sm font-medium">Amazon SP-API Certified Integration</span>
        </div>

        <h1 class="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-200 to-white">
            Knoozbook Amazon
          </span>
          <br>
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-200">
            Seller Integration Platform
          </span>
        </h1>

        <p class="text-lg md:text-xl text-blue-200/80 max-w-3xl mx-auto mb-10 leading-relaxed">
          Seamlessly connect your Amazon Seller account with Knoozbook marketplace.
          Sync products, manage inventory, process orders — all from one powerful dashboard.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="mailto:support@knoozbook.com?subject=Amazon Integration Inquiry"
            class="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-lg transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5">
            Get Started — Contact Us
          </a>
          <a href="#features"
            class="px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-semibold text-lg transition-all duration-300">
            Explore Features ↓
          </a>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-20 bg-gradient-to-b from-slate-50 to-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-blue-600 font-semibold text-sm uppercase tracking-widest">Platform Features</span>
          <h2 class="text-3xl md:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Everything You Need to Sell on Amazon
          </h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            Our Amazon integration tools empower sellers with real-time synchronization, inventory management, and order processing capabilities.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Feature 1: Product Sync -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">🔄</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Product Synchronization</h3>
            <p class="text-gray-600 leading-relaxed">
              Automatically sync your product catalog between Knoozbook and Amazon. Push products from your store to Amazon Seller Central, or import Amazon listings to your Knoozbook storefront.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Bi-directional product sync
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Bulk import/export support
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Automatic listing creation
              </li>
            </ul>
          </div>

          <!-- Feature 2: Inventory Management -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">📦</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Inventory Management</h3>
            <p class="text-gray-600 leading-relaxed">
              Keep inventory levels in sync across both platforms in real-time. Prevent overselling with automated stock updates and low-stock alerts.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Real-time stock synchronization
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Low stock notifications
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Multi-warehouse tracking
              </li>
            </ul>
          </div>

          <!-- Feature 3: Order Processing -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">📋</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Order Management</h3>
            <p class="text-gray-600 leading-relaxed">
              View and manage Amazon orders directly from your Knoozbook merchant dashboard. Track shipments, update order status, and handle returns efficiently.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Unified order dashboard
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Shipment tracking
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Returns management
              </li>
            </ul>
          </div>

          <!-- Feature 4: Price Management -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">💰</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Price & Catalog Updates</h3>
            <p class="text-gray-600 leading-relaxed">
              Update prices, descriptions, and product details across Amazon and Knoozbook simultaneously. Maintain consistency across all sales channels.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Bulk price updates
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Description synchronization
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Image management
              </li>
            </ul>
          </div>

          <!-- Feature 5: Reports & Analytics -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">📊</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Reports & Analytics</h3>
            <p class="text-gray-600 leading-relaxed">
              Access comprehensive sales reports combining data from both Amazon and Knoozbook. Make informed decisions with unified analytics.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Combined sales reports
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Performance metrics
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Export to CSV/PDF
              </li>
            </ul>
          </div>

          <!-- Feature 6: Secure OAuth -->
          <div class="group bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div class="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <span class="text-2xl">🔐</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 mb-3">Secure Authorization</h3>
            <p class="text-gray-600 leading-relaxed">
              Connect your Amazon account securely via OAuth 2.0. We never store your Amazon credentials. You can revoke access at any time from your Amazon Seller Central.
            </p>
            <ul class="mt-4 space-y-2">
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> OAuth 2.0 authorization
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> No password storage
              </li>
              <li class="flex items-center gap-2 text-sm text-gray-500">
                <span class="text-green-500">✓</span> Revocable access tokens
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works Section -->
    <section class="py-20 bg-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-blue-600 font-semibold text-sm uppercase tracking-widest">How It Works</span>
          <h2 class="text-3xl md:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Get Connected in 3 Simple Steps
          </h2>
        </div>

        <div class="max-w-4xl mx-auto">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Step 1 -->
            <div class="text-center relative">
              <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold shadow-lg shadow-blue-500/25">
                1
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Create a Merchant Account</h3>
              <p class="text-gray-600 text-sm">
                Sign up as a merchant on Knoozbook and set up your seller profile with your business details.
              </p>
              <!-- Arrow -->
              <div class="hidden md:block absolute top-8 left-[calc(100%-1rem)] w-8 text-blue-300 text-2xl">→</div>
            </div>

            <!-- Step 2 -->
            <div class="text-center relative">
              <div class="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold shadow-lg shadow-indigo-500/25">
                2
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Authorize Amazon Access</h3>
              <p class="text-gray-600 text-sm">
                Securely link your Amazon Seller Central account through Amazon's official OAuth flow. Your credentials stay with Amazon.
              </p>
              <!-- Arrow -->
              <div class="hidden md:block absolute top-8 left-[calc(100%-1rem)] w-8 text-blue-300 text-2xl">→</div>
            </div>

            <!-- Step 3 -->
            <div class="text-center">
              <div class="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold shadow-lg shadow-purple-500/25">
                3
              </div>
              <h3 class="text-lg font-bold text-slate-900 mb-2">Sync & Manage</h3>
              <p class="text-gray-600 text-sm">
                Start syncing products, managing inventory, and processing orders across both platforms from a single dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="py-20 bg-gradient-to-b from-gray-50 to-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-blue-600 font-semibold text-sm uppercase tracking-widest">Pricing</span>
          <h2 class="text-3xl md:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your business needs. Start free and upgrade as you grow.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <!-- Free Plan -->
          <div class="bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-lg transition-shadow">
            <div class="text-center mb-8">
              <h3 class="text-xl font-bold text-slate-900 mb-2">Starter</h3>
              <div class="text-4xl font-bold text-slate-900">Free</div>
              <p class="text-gray-500 text-sm mt-2">Perfect for getting started</p>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Up to 50 product syncs
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Basic inventory management
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Order notifications
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Email support
              </li>
            </ul>
            <a href="mailto:support@knoozbook.com?subject=Starter Plan Inquiry"
              class="block w-full py-3 text-center bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-xl font-semibold transition-colors">
              Get Started
            </a>
          </div>

          <!-- Pro Plan -->
          <div class="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl shadow-blue-500/20 transform md:scale-105">
            <div class="absolute top-4 right-4 bg-white/20 text-white text-xs px-3 py-1 rounded-full font-semibold">
              Most Popular
            </div>
            <div class="text-center mb-8">
              <h3 class="text-xl font-bold mb-2">Professional</h3>
              <div class="text-4xl font-bold">Contact Us</div>
              <p class="text-blue-200 text-sm mt-2">For growing businesses</p>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-center gap-3 text-blue-100 text-sm">
                <span class="font-bold">✓</span> Unlimited product syncs
              </li>
              <li class="flex items-center gap-3 text-blue-100 text-sm">
                <span class="font-bold">✓</span> Advanced inventory management
              </li>
              <li class="flex items-center gap-3 text-blue-100 text-sm">
                <span class="font-bold">✓</span> Full order management
              </li>
              <li class="flex items-center gap-3 text-blue-100 text-sm">
                <span class="font-bold">✓</span> Analytics & reports
              </li>
              <li class="flex items-center gap-3 text-blue-100 text-sm">
                <span class="font-bold">✓</span> Priority support
              </li>
            </ul>
            <a href="mailto:support@knoozbook.com?subject=Professional Plan Inquiry"
              class="block w-full py-3 text-center bg-white text-blue-700 rounded-xl font-semibold hover:bg-blue-50 transition-colors">
              Contact Sales
            </a>
          </div>

          <!-- Enterprise Plan -->
          <div class="bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-lg transition-shadow">
            <div class="text-center mb-8">
              <h3 class="text-xl font-bold text-slate-900 mb-2">Enterprise</h3>
              <div class="text-4xl font-bold text-slate-900">Custom</div>
              <p class="text-gray-500 text-sm mt-2">For large-scale sellers</p>
            </div>
            <ul class="space-y-3 mb-8">
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Everything in Professional
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Custom API integrations
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> Dedicated account manager
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> SLA guarantee
              </li>
              <li class="flex items-center gap-3 text-gray-600 text-sm">
                <span class="text-green-500 font-bold">✓</span> 24/7 support
              </li>
            </ul>
            <a href="mailto:support@knoozbook.com?subject=Enterprise Plan Inquiry"
              class="block w-full py-3 text-center bg-gray-100 hover:bg-gray-200 text-slate-900 rounded-xl font-semibold transition-colors">
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Data Security Section -->
    <section class="py-20 bg-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-blue-600 font-semibold text-sm uppercase tracking-widest">Security & Compliance</span>
          <h2 class="text-3xl md:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Your Data is Safe with Us
          </h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            We take data protection seriously and comply with Amazon's Data Protection Policy (DPP) and industry best practices.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          <div class="text-center p-6 bg-blue-50 rounded-2xl">
            <div class="text-3xl mb-4">🔒</div>
            <h4 class="font-bold text-slate-900 mb-2">Encrypted Data</h4>
            <p class="text-sm text-gray-600">All data is encrypted in transit (TLS 1.2+) and at rest using AES-256 encryption.</p>
          </div>
          <div class="text-center p-6 bg-green-50 rounded-2xl">
            <div class="text-3xl mb-4">🛡️</div>
            <h4 class="font-bold text-slate-900 mb-2">OAuth 2.0</h4>
            <p class="text-sm text-gray-600">We use Amazon's official OAuth 2.0 flow. We never store or have access to your Amazon login credentials.</p>
          </div>
          <div class="text-center p-6 bg-purple-50 rounded-2xl">
            <div class="text-3xl mb-4">📋</div>
            <h4 class="font-bold text-slate-900 mb-2">DPP Compliant</h4>
            <p class="text-sm text-gray-600">Full compliance with Amazon's Data Protection Policy and Acceptable Use Policy.</p>
          </div>
          <div class="text-center p-6 bg-amber-50 rounded-2xl">
            <div class="text-3xl mb-4">🗑️</div>
            <h4 class="font-bold text-slate-900 mb-2">Data Deletion</h4>
            <p class="text-sm text-gray-600">You can request deletion of all your data at any time. We process deletion requests within 30 days.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Contact Section -->
    <section id="contact" class="py-20 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 relative overflow-hidden">
      <div class="absolute inset-0 opacity-[0.03]"
        style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 32px 32px;"></div>

      <div class="container mx-auto px-6 relative z-10">
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Grow Your Business?
          </h2>
          <p class="text-lg text-blue-200/80 max-w-2xl mx-auto">
            Get in touch with our team to learn more about how Knoozbook can help you sell on Amazon.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <!-- Email -->
          <a href="mailto:support@knoozbook.com" class="group bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-8 text-center transition-all duration-300">
            <div class="text-4xl mb-4">✉️</div>
            <h3 class="text-white font-bold text-lg mb-2">Email Us</h3>
            <p class="text-blue-200/80 text-sm">support&#64;knoozbook.com</p>
          </a>

          <!-- Phone -->
          <a href="tel:+201094612729" class="group bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-8 text-center transition-all duration-300">
            <div class="text-4xl mb-4">📞</div>
            <h3 class="text-white font-bold text-lg mb-2">Call Us</h3>
            <p class="text-blue-200/80 text-sm" dir="ltr">+20 109 461 2729</p>
          </a>

          <!-- Location -->
          <div class="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div class="text-4xl mb-4">📍</div>
            <h3 class="text-white font-bold text-lg mb-2">Location</h3>
            <p class="text-blue-200/80 text-sm">Egypt</p>
          </div>
        </div>

        <div class="text-center mt-12">
          <p class="text-blue-300/60 text-sm">
            Knoozbook is a registered company. All services comply with
            <a href="https://developer-docs.amazon.com/sp-api/docs/policies-and-agreements" target="_blank" class="text-blue-400 hover:underline">
              Amazon's Policies and Agreements
            </a>.
          </p>
        </div>
      </div>
    </section>

    <!-- Arabic Section -->
    <section class="py-16 bg-gradient-to-b from-white to-gray-50" dir="rtl">
      <div class="container mx-auto px-6">
        <div class="max-w-4xl mx-auto">
          <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-slate-900 mb-4">خدمات التكامل مع أمازون</h2>
            <p class="text-lg text-gray-600">
              نوفر لتجار knoozbook إمكانية ربط حساباتهم على أمازون مع متجرهم بسهولة وأمان
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 class="font-bold text-lg text-slate-900 mb-3">🔄 مزامنة المنتجات</h3>
              <p class="text-gray-600 text-sm leading-relaxed">
                انقل منتجاتك بين knoozbook وأمازون تلقائياً. أضف منتجاتك إلى Amazon Seller Central مباشرة من لوحة التحكم أو استورد منتجاتك من أمازون إلى متجرك.
              </p>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 class="font-bold text-lg text-slate-900 mb-3">📦 إدارة المخزون</h3>
              <p class="text-gray-600 text-sm leading-relaxed">
                حافظ على تزامن المخزون بين المنصتين في الوقت الفعلي. تجنب مشاكل نفاد المخزون مع التحديثات والتنبيهات التلقائية.
              </p>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 class="font-bold text-lg text-slate-900 mb-3">📋 إدارة الطلبات</h3>
              <p class="text-gray-600 text-sm leading-relaxed">
                تابع وأدر طلبات أمازون مباشرة من لوحة تحكم knoozbook. تتبع الشحنات وحدث حالة الطلبات بسهولة.
              </p>
            </div>
            <div class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 class="font-bold text-lg text-slate-900 mb-3">🔐 اتصال آمن</h3>
              <p class="text-gray-600 text-sm leading-relaxed">
                نستخدم نظام OAuth 2.0 الرسمي من أمازون. لا نخزن بيانات تسجيل الدخول الخاصة بك. يمكنك إلغاء الوصول في أي وقت.
              </p>
            </div>
          </div>

          <div class="text-center mt-10">
            <a href="mailto:support@knoozbook.com?subject=استفسار عن خدمة التكامل مع أمازون"
              class="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-lg transition-all duration-300 hover:shadow-lg">
              تواصل معنا للبدء
            </a>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class AmazonSellerServicesComponent { }
