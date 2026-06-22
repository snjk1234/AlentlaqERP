const { PrismaClient } = require('../src/generated/client');
const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.customer.deleteMany({});

  // 1. Create Default Users
  await prisma.user.create({
    data: {
      username: 'admin',
      name: 'مدير النظام',
      password: 'admin',
      role: 'ADMIN',
    },
  });

  await prisma.user.create({
    data: {
      username: 'cashier',
      name: 'كاشير الانطلاق',
      password: '123',
      role: 'CASHIER',
    },
  });

  // 2. Create Categories
  await prisma.category.create({ data: { name: 'مواسير UPVC' } });
  await prisma.category.create({ data: { name: 'خراطيم حريق' } });
  await prisma.category.create({ data: { name: 'إكسسوارات وبواطات' } });

  // 3. Create Default Customers (From Success Partners of Al-entlaq Profile)
  const customers = [
    { name: 'عميل نقدي', phone: 'غير محدد', email: 'cash@al-entlaq.com', address: 'مبيعات مباشرة', trn: '' },
    { name: 'شركة المقاولون العرب', phone: '022345678', email: 'info@arabco.com', address: 'القاهرة - مدينة نصر', trn: '310122345600003' },
    { name: 'أوراسكوم للإنشاءات', phone: '0224611111', email: 'contact@orascom.com', address: 'الجيزة - أبراج نايل سيتي', trn: '320011223300003' },
    { name: 'السويدي إليكتريك', phone: '0227599700', email: 'sales@elsewedy.com', address: 'القاهرة الجديدة - التجمع الخامس', trn: '330044556600003' },
    { name: 'مجموعة الرواد للإنشاء والتعمير', phone: '01044556677', email: 'info@alrowad-group.com', address: 'القاهرة - التجمع الأول', trn: '300456123000003' },
    { name: 'شركة البدر للمقاولات العامة', phone: '01288776655', email: 'contact@bdr-const.com', address: 'الإسكندرية - سموحة', trn: '340055667700003' },
    { name: 'شركة السلام للمقاولات العامة', phone: '01199887766', email: 'info@elsalam.com', address: 'المنصورة - شارع المشاية', trn: '350066778800003' },
    { name: 'شركة الفيوم للمقاولات العامة', phone: '01544332211', email: 'info@fayoum-const.com', address: 'الفيوم - وسط البلد', trn: '360077889900003' },
    { name: 'شركة طيبة للمقاولات', phone: '01022334455', email: 'contact@tiba-const.com', address: 'طنطا - شارع البحر', trn: '370088990000003' },
    { name: 'شركة الأقصى للمقاولات والتطوير', phone: '01211223344', email: 'sales@alaqsa-co.com', address: 'الزقازيق - حي الزهور', trn: '380099001100003' },
    { name: 'شركة الفتح للمقاولات والاستيراد', phone: '01133445566', email: 'info@alfath-import.com', address: 'دمياط - المنطقة الصناعية', trn: '390011223300003' },
    { name: 'شركة الغرابلي للأعمال الهندسية', phone: '0225167890', email: 'info@gharably.com', address: 'المعادي - القاهرة', trn: '300223344500003' },
    { name: 'شركة الوليد للمقاولات والاستثمار', phone: '01055667788', email: 'info@elwaleed-const.com', address: 'الجيزة - المهندسين', trn: '300778899000003' },
    { name: 'شركة العثمان للمقاولات', phone: '01144332211', email: 'contact@alothman.com', address: 'العاشر من رمضان', trn: '300889911000003' },
    { name: 'الجيزة العامة للمقاولات', phone: '0237604455', email: 'info@giza-general.com', address: 'الجيزة - الدقي', trn: '300990022000003' },
    { name: 'شركة ساش للتصميمات والمقاولات', phone: '01015519188', email: 'info@sash-engineering.com', address: 'العاشر من رمضان - الأردنية', trn: '300112255000003' },
    { name: 'شركة سند للتجارة والمقاولات العامة', phone: '0553181428', email: 'info@sanad-co.com', address: 'الشرقية - كفر صقر', trn: '300223355000003' },
    { name: 'شركة الرواد للمقاولات والتوريدات', phone: '01001113989', email: 'info@alrowad-supplies.com', address: 'الغربية - طنطا', trn: '300445577000003' },
    { name: 'شركة الأمل للمقاولات العمومية', phone: '0482599999', email: 'info@alamal-const.com', address: 'المنوفية - شبين الكوم', trn: '300556688000003' }
  ];

  for (const customer of customers) {
    const isCashOnly = customer.name === 'عميل نقدي';
    await prisma.customer.create({
      data: {
        name: customer.name,
        phone: customer.phone,
        location: customer.address || '',
        trn: customer.trn || '',
        cr: isCashOnly ? '' : '1010' + Math.floor(100000 + Math.random() * 900000),
        buildingsCount: isCashOnly ? 0 : Math.floor(Math.random() * 15) + 1,
        customerType: isCashOnly ? 'CASH' : (Math.random() > 0.4 ? 'CREDIT' : 'CASH'),
        discount: isCashOnly ? 0 : [0, 5, 8, 10, 12, 15][Math.floor(Math.random() * 6)]
      }
    });
  }

  // 4. Create Products (Comprehensive list from Al-entlaq Profile with length, weight, markup, maxStockQty)
  const products = [
    // --- 1. UPVC Pipes (Light Gauge - سمك خفيف) ---
    { code: '3020', name: 'ماسورة UPVC سمك خفيف 20مم', type: 'PIPE', gauge: 'Light Gauge', size: '20 mm', color: 'أبيض', length: '6 m', weight: '1.30 kg', costPrice: 32.0, markup: 40.0, price: 45.0, stockQty: 600, minStockQty: 50, maxStockQty: 1000 },
    { code: '3021', name: 'ماسورة UPVC سمك خفيف 25مم', type: 'PIPE', gauge: 'Light Gauge', size: '25 mm', color: 'أبيض', length: '6 m', weight: '1.45 kg', costPrice: 40.0, markup: 37.0, price: 55.0, stockQty: 500, minStockQty: 50, maxStockQty: 1000 },
    { code: '3022', name: 'ماسورة UPVC سمك خفيف 32مم', type: 'PIPE', gauge: 'Light Gauge', size: '32 mm', color: 'أبيض', length: '6 m', weight: '2.70 kg', costPrice: 52.0, markup: 44.0, price: 75.0, stockQty: 400, minStockQty: 50, maxStockQty: 1000 },
    { code: '3023', name: 'ماسورة UPVC سمك خفيف 40مم', type: 'PIPE', gauge: 'Light Gauge', size: '40 mm', color: 'أبيض', length: '6 m', weight: '2.10 kg', costPrice: 70.0, markup: 35.0, price: 95.0, stockQty: 300, minStockQty: 40, maxStockQty: 800 },
    { code: '3024', name: 'ماسورة UPVC سمك خفيف 50مم', type: 'PIPE', gauge: 'Light Gauge', size: '50 mm', color: 'أبيض', length: '6 m', weight: '2.45 kg', costPrice: 95.0, markup: 36.0, price: 130.0, stockQty: 250, minStockQty: 30, maxStockQty: 600 },
    { code: '3025', name: 'ماسورة UPVC سمك خفيف 63مم', type: 'PIPE', gauge: 'Light Gauge', size: '63 mm', color: 'أبيض', length: '6 m', weight: '3.00 kg', costPrice: 130.0, markup: 38.0, price: 180.0, stockQty: 200, minStockQty: 30, maxStockQty: 500 },

    // --- 2. UPVC Pipes (Medium Gauge - سمك متوسط) ---
    { code: '3026', name: 'ماسورة UPVC سمك متوسط 20مم', type: 'PIPE', gauge: 'Medium Gauge', size: '20 mm', color: 'أبيض', length: '6 m', weight: '1.55 kg', costPrice: 44.0, markup: 36.0, price: 60.0, stockQty: 500, minStockQty: 50, maxStockQty: 1000 },
    { code: '3027', name: 'ماسورة UPVC سمك متوسط 25مم', type: 'PIPE', gauge: 'Medium Gauge', size: '25 mm', color: 'أبيض', length: '6 m', weight: '1.80 kg', costPrice: 54.0, markup: 38.0, price: 75.0, stockQty: 450, minStockQty: 50, maxStockQty: 1000 },
    { code: '3028', name: 'ماسورة UPVC سمك متوسط 32مم', type: 'PIPE', gauge: 'Medium Gauge', size: '32 mm', color: 'أبيض', length: '6 m', weight: '2.10 kg', costPrice: 72.0, markup: 38.0, price: 100.0, stockQty: 350, minStockQty: 40, maxStockQty: 800 },
    { code: '3029', name: 'ماسورة UPVC سمك متوسط 40مم', type: 'PIPE', gauge: 'Medium Gauge', size: '40 mm', color: 'أبيض', length: '6 m', weight: '2.30 kg', costPrice: 90.0, markup: 38.0, price: 125.0, stockQty: 300, minStockQty: 30, maxStockQty: 600 },
    { code: '3030', name: 'ماسورة UPVC سمك متوسط 50مم', type: 'PIPE', gauge: 'Medium Gauge', size: '50 mm', color: 'أبيض', length: '6 m', weight: '2.85 kg', costPrice: 125.0, markup: 36.0, price: 170.0, stockQty: 250, minStockQty: 30, maxStockQty: 500 },

    // --- 3. UPVC Pipes (Heavy Gauge - سمك ثقيل) ---
    { code: '3031', name: 'ماسورة UPVC سمك ثقيل 20مم', type: 'PIPE', gauge: 'Heavy Gauge', size: '20 mm', color: 'أبيض', length: '6 m', weight: '1.80 kg', costPrice: 58.0, markup: 37.0, price: 80.0, stockQty: 400, minStockQty: 50, maxStockQty: 1000 },
    { code: '3032', name: 'ماسورة UPVC سمك ثقيل 25مم', type: 'PIPE', gauge: 'Heavy Gauge', size: '25 mm', color: 'أبيض', length: '6 m', weight: '1.90 kg', costPrice: 72.0, markup: 38.0, price: 100.0, stockQty: 350, minStockQty: 50, maxStockQty: 1000 },
    { code: '3033', name: 'ماسورة UPVC سمك ثقيل 32مم', type: 'PIPE', gauge: 'Heavy Gauge', size: '32 mm', color: 'أبيض', length: '6 m', weight: '2.50 kg', costPrice: 94.0, markup: 38.0, price: 130.0, stockQty: 300, minStockQty: 40, maxStockQty: 800 },
    { code: '3034', name: 'ماسورة UPVC سمك ثقيل 40مم', type: 'PIPE', gauge: 'Heavy Gauge', size: '40 mm', color: 'أبيض', length: '6 m', weight: '2.80 kg', costPrice: 120.0, markup: 37.0, price: 165.0, stockQty: 250, minStockQty: 30, maxStockQty: 600 },
    { code: '3035', name: 'ماسورة UPVC سمك ثقيل 50مم', type: 'PIPE', gauge: 'Heavy Gauge', size: '50 mm', color: 'أبيض', length: '6 m', weight: '3.40 kg', costPrice: 160.0, markup: 37.0, price: 220.0, stockQty: 200, minStockQty: 30, maxStockQty: 500 },

    // --- 4. UPVC Pipes (Extra Heavy Gauge - سمك ثقيل جداً) ---
    { code: '3036', name: 'ماسورة UPVC سمك ثقيل جداً 20مم', type: 'PIPE', gauge: 'Extra Heavy', size: '20 mm', color: 'أبيض', length: '6 m', weight: '2.10 kg', costPrice: 70.0, markup: 35.0, price: 95.0, stockQty: 250, minStockQty: 30, maxStockQty: 500 },
    { code: '3037', name: 'ماسورة UPVC سمك ثقيل جداً 25مم', type: 'PIPE', gauge: 'Extra Heavy', size: '25 mm', color: 'أبيض', length: '6 m', weight: '2.20 kg', costPrice: 88.0, markup: 36.0, price: 120.0, stockQty: 200, minStockQty: 30, maxStockQty: 500 },

    // --- 5. Fire Resistant Hoses (خراطيم مقاومة للحريق) ---
    { code: '2113', name: 'خرطوم حريق مرن رمادي 13مم', type: 'HOSE', gauge: 'Standard Sizes', size: '13 mm', color: 'رمادي', length: '45 m', weight: '5.05 kg', costPrice: 70.0, markup: 35.0, price: 95.0, stockQty: 200, minStockQty: 30, maxStockQty: 500 },
    { code: '2116', name: 'خرطوم حريق مرن رمادي 16مم', type: 'HOSE', gauge: 'Standard Sizes', size: '16 mm', color: 'رمادي', length: '45 m', weight: '5.20 kg', costPrice: 90.0, markup: 33.0, price: 120.0, stockQty: 180, minStockQty: 30, maxStockQty: 500 },
    { code: '2119', name: 'خرطوم حريق مرن رمادي 19مم', type: 'HOSE', gauge: 'Standard Sizes', size: '19 mm', color: 'رمادي', length: '45 m', weight: '6.50 kg', costPrice: 105.0, markup: 33.0, price: 140.0, stockQty: 150, minStockQty: 25, maxStockQty: 400 },
    { code: '2123', name: 'خرطوم حريق مرن رمادي 23مم', type: 'HOSE', gauge: 'Standard Sizes', size: '23 mm', color: 'رمادي', length: '45 m', weight: '8.10 kg', costPrice: 135.0, markup: 33.0, price: 180.0, stockQty: 120, minStockQty: 25, maxStockQty: 400 },
    { code: '2129', name: 'خرطوم حريق مرن رمادي 29مم', type: 'HOSE', gauge: 'Standard Sizes', size: '29 mm', color: 'رمادي', length: '45 m', weight: '10.20 kg', costPrice: 180.0, markup: 33.0, price: 240.0, stockQty: 100, minStockQty: 20, maxStockQty: 300 },
    { code: '2136', name: 'خرطوم حريق مرن رمادي 36مم', type: 'HOSE', gauge: 'Standard Sizes', size: '36 mm', color: 'رمادي', length: '22 m', weight: '13.00 kg', costPrice: 220.0, markup: 31.0, price: 290.0, stockQty: 80, minStockQty: 15, maxStockQty: 200 },
    { code: '2146', name: 'خرطوم حريق مرن رمادي 46مم', type: 'HOSE', gauge: 'Standard Sizes', size: '46 mm', color: 'رمادي', length: '25 m', weight: '13.20 kg', costPrice: 280.0, markup: 32.0, price: 370.0, stockQty: 60, minStockQty: 15, maxStockQty: 200 },

    // --- 6. Polyethylene Electric Hoses (خراطيم بولي إيثيلين كهرباء) ---
    { code: '1015', name: 'خرطوم بولي إيثيلين كهرباء 13مم', type: 'HOSE', gauge: 'Polyethylene', size: '13 mm', color: 'أورانج', length: '45 m', weight: '4.50 kg', costPrice: 50.0, markup: 40.0, price: 70.0, stockQty: 300, minStockQty: 30, maxStockQty: 500 },
    { code: '1016', name: 'خرطوم بولي إيثيلين كهرباء 16مم', type: 'HOSE', gauge: 'Polyethylene', size: '16 mm', color: 'أورانج', length: '45 m', weight: '5.10 kg', costPrice: 65.0, markup: 38.0, price: 90.0, stockQty: 250, minStockQty: 30, maxStockQty: 500 },
    { code: '1017', name: 'خرطوم بولي إيثيلين كهرباء 19مم', type: 'HOSE', gauge: 'Polyethylene', size: '19 mm', color: 'أورانج', length: '45 m', weight: '6.20 kg', costPrice: 85.0, markup: 35.0, price: 115.0, stockQty: 200, minStockQty: 25, maxStockQty: 400 },
    { code: '1018', name: 'خرطوم بولي إيثيلين كهرباء 23مم', type: 'HOSE', gauge: 'Polyethylene', size: '23 mm', color: 'أورانج', length: '45 m', weight: '8.00 kg', costPrice: 110.0, markup: 36.0, price: 150.0, stockQty: 180, minStockQty: 25, maxStockQty: 400 },
    { code: '1019', name: 'خرطوم بولي إيثيلين كهرباء 29مم', type: 'HOSE', gauge: 'Polyethylene', size: '29 mm', color: 'أورانج', length: '45 m', weight: '9.80 kg', costPrice: 150.0, markup: 33.0, price: 200.0, stockQty: 150, minStockQty: 20, maxStockQty: 300 },
    { code: '1020', name: 'خرطوم بولي إيثيلين كهرباء 36مم', type: 'HOSE', gauge: 'Polyethylene', size: '36 mm', color: 'أورانج', length: '22 m', weight: '12.00 kg', costPrice: 200.0, markup: 35.0, price: 270.0, stockQty: 100, minStockQty: 15, maxStockQty: 200 },

    // --- 7. Bending Springs (سوست تركيب مواسير) ---
    { code: '2080', name: 'سوستة تركيب مواسير خفيف 20مم', type: 'ACCESSORY', gauge: 'Bending Spring', size: '20 mm', color: 'أسود', length: 'N/A', weight: '0.30 kg', costPrice: 25.0, markup: 40.0, price: 35.0, stockQty: 300, minStockQty: 20, maxStockQty: 500 },
    { code: '2081', name: 'سوستة تركيب مواسير خفيف 25مم', type: 'ACCESSORY', gauge: 'Bending Spring', size: '25 mm', color: 'أسود', length: 'N/A', weight: '0.40 kg', costPrice: 30.0, markup: 40.0, price: 42.0, stockQty: 250, minStockQty: 20, maxStockQty: 500 },
    { code: '2084', name: 'سوستة تركيب مواسير متوسط 20مم', type: 'ACCESSORY', gauge: 'Bending Spring', size: '20 mm', color: 'فضي', length: 'N/A', weight: '0.35 kg', costPrice: 28.0, markup: 42.0, price: 40.0, stockQty: 200, minStockQty: 20, maxStockQty: 400 },
    { code: '2085', name: 'سوستة تركيب مواسير متوسط 25مم', type: 'ACCESSORY', gauge: 'Bending Spring', size: '25 mm', color: 'فضي', length: 'N/A', weight: '0.45 kg', costPrice: 32.0, markup: 40.0, price: 45.0, stockQty: 150, minStockQty: 20, maxStockQty: 400 },

    // --- 8. Circular Fireproof Boxes (بواطات دائرية ضد الحريق) ---
    { code: '2200', name: 'بواط دائري نهاية مضاد للحريق 20مم', type: 'ACCESSORY', gauge: 'Circular Box', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.08 kg', costPrice: 10.0, markup: 50.0, price: 15.0, stockQty: 1000, minStockQty: 100, maxStockQty: 2000 },
    { code: '2201', name: 'بواط دائري نهاية مضاد للحريق 25مم', type: 'ACCESSORY', gauge: 'Circular Box', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.10 kg', costPrice: 12.0, markup: 50.0, price: 18.0, stockQty: 900, minStockQty: 100, maxStockQty: 2000 },
    { code: '2202', name: 'بواط دائري إمتداد مضاد للحريق 20مم', type: 'ACCESSORY', gauge: 'Circular Box', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.09 kg', costPrice: 12.0, markup: 50.0, price: 18.0, stockQty: 950, minStockQty: 100, maxStockQty: 2000 },
    { code: '2203', name: 'بواط دائري إمتداد مضاد للحريق 25مم', type: 'ACCESSORY', gauge: 'Circular Box', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.11 kg', costPrice: 14.0, markup: 42.0, price: 20.0, stockQty: 800, minStockQty: 100, maxStockQty: 1500 },

    // --- 9. Clamps and Sockets (أفايز وجلب) ---
    { code: '2050', name: 'أفيز بدون قاعدة UPVC 20مم', type: 'ACCESSORY', gauge: 'Clamp', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.01 kg', costPrice: 3.0, markup: 66.0, price: 5.0, stockQty: 3000, minStockQty: 200, maxStockQty: 5000 },
    { code: '2051', name: 'أفيز بدون قاعدة UPVC 25مم', type: 'ACCESSORY', gauge: 'Clamp', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.015 kg', costPrice: 3.5, markup: 71.0, price: 6.0, stockQty: 2500, minStockQty: 200, maxStockQty: 4000 },
    { code: '2055', name: 'أفيز بقاعدة UPVC 20مم', type: 'ACCESSORY', gauge: 'Clamp', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.015 kg', costPrice: 4.5, markup: 55.0, price: 7.0, stockQty: 2500, minStockQty: 200, maxStockQty: 4000 },
    { code: '2056', name: 'أفيز بقاعدة UPVC 25مم', type: 'ACCESSORY', gauge: 'Clamp', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.02 kg', costPrice: 5.0, markup: 60.0, price: 8.0, stockQty: 2000, minStockQty: 200, maxStockQty: 3500 },
    { code: '2060', name: 'جلبة عادية UPVC 20مم', type: 'ACCESSORY', gauge: 'Socket', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.03 kg', costPrice: 5.5, markup: 45.0, price: 8.0, stockQty: 1500, minStockQty: 150, maxStockQty: 3000 },
    { code: '2061', name: 'جلبة عادية UPVC 25مم', type: 'ACCESSORY', gauge: 'Socket', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.04 kg', costPrice: 6.5, markup: 53.0, price: 10.0, stockQty: 1200, minStockQty: 150, maxStockQty: 2500 },
    { code: '2066', name: 'كوع UPVC 20مم', type: 'ACCESSORY', gauge: 'Elbow', size: '20 mm', color: 'أبيض', length: 'N/A', weight: '0.05 kg', costPrice: 7.0, markup: 42.0, price: 10.0, stockQty: 1200, minStockQty: 150, maxStockQty: 2500 },
    { code: '2067', name: 'كوع UPVC 25مم', type: 'ACCESSORY', gauge: 'Elbow', size: '25 mm', color: 'أبيض', length: 'N/A', weight: '0.06 kg', costPrice: 8.5, markup: 41.0, price: 12.0, stockQty: 1000, minStockQty: 150, maxStockQty: 2000 }
  ];

  for (const product of products) {
    await prisma.product.create({
      data: product,
    });
  }

  console.log('Seed completed successfully with Al-entlaq Profile data (Updated fields)!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
