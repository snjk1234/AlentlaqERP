const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createRemoteClient } = require('../src/lib/remote-client');
const { saveCustomerPrices } = require('../src/lib/customer-prices');
const { saveSupplierPrices } = require('../src/lib/supplier-prices');
const { correctPayment } = require('../src/lib/payment-corrections');
const { editDocument, editQuotation, normalizeWarehouseReceiptNumber } = require('../src/lib/document-edits');
const { invoiceQrText } = require('../src/lib/invoice-qr');

// Register 'app' as a standard and secure scheme supporting fetch
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let prisma = null;
const authenticatedUsers = new Map();

function readServerConfig() {
  const configDirectory = path.join(app.getPath('appData'), 'AlEntlaqPOS');
  fs.mkdirSync(configDirectory, { recursive: true });
  const configPath = path.join(configDirectory, 'server.json');
  let savedConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      throw new Error(`Could not read the POS server configuration at ${configPath}: ${error.message}`);
    }
  } else {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: 'http://127.0.0.1:3000',
      apiToken: ''
    }, null, 2));
  }

  return {
    serverUrl: process.env.POS_SERVER_URL || savedConfig.serverUrl || 'http://127.0.0.1:3000',
    apiToken: process.env.POS_API_TOKEN || savedConfig.apiToken || ''
  };
}

function initializeDatabase() {
  prisma = createRemoteClient(readServerConfig);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    frame: false, // Frameless window
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#111827',
  });

  if (isDev) {
    // ELECTRON_START_URL is set by scripts/electron-dev.js to the dedicated dev
    // port, so development never collides with the production host on port 3000.
    mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://-/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native IPC database endpoints
ipcMain.handle('get-products', async () => {
  try {
    return await prisma.product.findMany({
      include: { supplier: true },
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    throw err;
  }
});

ipcMain.handle('create-product', async (event, productData) => {
  try {
    // Check for uniqueness based on (code, type, size, color, gauge, weight)
    const existingProducts = await prisma.product.findMany({
      where: { code: productData.code }
    });
    
    if (existingProducts.length > 0) {
      const isDuplicate = existingProducts.some(p => 
        (p.supplierId || null) === (productData.supplierId || null) &&
        (p.type || null) === (productData.type || null) &&
        (p.size || null) === (productData.size || null) &&
        (p.color || null) === (productData.color || null) &&
        (p.gauge || null) === (productData.gauge || null) &&
        (p.weight || null) === (productData.weight || null)
      );
      if (isDuplicate) {
        throw new Error('هذا الكود مسجل مسبقاً بنفس المواصفات لنفس المورد. قم بتغيير المواصفات أو المورد أو تغيير الكود.');
      }
    }

    return await prisma.product.create({
      data: {
        code: productData.code,
        barcode: (productData.barcode && productData.barcode.trim() !== '') ? productData.barcode.trim() : null,
        name: productData.name,
        type: productData.type,
        gauge: productData.gauge || null,
        size: productData.size,
        color: productData.color || null,
        length: productData.length || null,
        weight: productData.weight || null,
        costPrice: Number(productData.costPrice) || 0,
        markup: Number(productData.markup) || 30,
        price: Number(productData.price) || 0,
        taxRate: Number(productData.taxRate) || 0.14,
        stockQty: Number(productData.stockQty) || 0,
        minStockQty: Number(productData.minStockQty) || 10,
        maxStockQty: Number(productData.maxStockQty) || 1000,
        pricePerKilo: Number(productData.pricePerKilo) || 0,
        supplierId: productData.supplierId || null
      }
    });
  } catch (err) {
    console.error('Error creating product:', err);
    if (err.code === 'P2002') {
      throw new Error('كود الصنف أو الباركود مسجل بالفعل لصنف آخر. يرجى مراجعته وتغييره.');
    }
    throw err;
  }
});

ipcMain.handle('update-product', async (event, productData) => {
  const { id, ...data } = productData;
  try {
    if (Object.keys(data).length === 1 && data.imageUrl !== undefined) {
      if (!id || typeof data.imageUrl !== 'string' || data.imageUrl.length > 2800000
        || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(data.imageUrl)) {
        throw new Error('ملف الصورة غير صالح أو يتجاوز الحجم المسموح');
      }
      return await prisma.product.update({ where: { id }, data: { imageUrl: data.imageUrl } });
    }
    if (data.code) {
      const existingProducts = await prisma.product.findMany({
        where: { code: data.code, id: { not: id } }
      });
      
      if (existingProducts.length > 0) {
        const isDuplicate = existingProducts.some(p => 
          (p.supplierId || null) === (data.supplierId || null) &&
          (p.type || null) === (data.type || null) &&
          (p.size || null) === (data.size || null) &&
          (p.color || null) === (data.color || null) &&
          (p.gauge || null) === (data.gauge || null) &&
          (p.weight || null) === (data.weight || null)
        );
        if (isDuplicate) {
          throw new Error('هذا الكود مسجل مسبقاً بنفس المواصفات لنفس المورد. قم بتغيير المواصفات أو المورد أو تغيير الكود.');
        }
      }
    }

    return await prisma.product.update({
      where: { id },
      data: {
        code: data.code,
        barcode: (data.barcode !== undefined) ? ((data.barcode && data.barcode.trim() !== '') ? data.barcode.trim() : null) : undefined,
        name: data.name,
        type: data.type,
        gauge: data.gauge || null,
        size: data.size,
        color: data.color || null,
        length: data.length !== undefined ? data.length : undefined,
        weight: data.weight !== undefined ? data.weight : undefined,
        costPrice: data.costPrice !== undefined ? Number(data.costPrice) : undefined,
        markup: data.markup !== undefined ? Number(data.markup) : undefined,
        price: data.price !== undefined ? Number(data.price) : undefined,
        taxRate: data.taxRate !== undefined ? Number(data.taxRate) : undefined,
        stockQty: data.stockQty !== undefined ? Number(data.stockQty) : undefined,
        minStockQty: data.minStockQty !== undefined ? Number(data.minStockQty) : undefined,
        maxStockQty: data.maxStockQty !== undefined ? Number(data.maxStockQty) : undefined,
        pricePerKilo: data.pricePerKilo !== undefined ? Number(data.pricePerKilo) : undefined,
        imageUrl: data.imageUrl !== undefined ? data.imageUrl : undefined,
        supplierId: data.supplierId || null
      }
    });
  } catch (err) {
    console.error('Error updating product:', err);
    if (err.code === 'P2002') {
      throw new Error('كود الصنف أو الباركود مسجل بالفعل لصنف آخر. يرجى مراجعته وتغييره.');
    }
    throw err;
  }
});

ipcMain.handle('get-customers', async () => {
  try {
    return await prisma.customer.findMany({
      include: {
        customPrices: true,
        discounts: true,
        payments: {
          include: {
            bank: true
          },
          orderBy: {
            date: 'desc'
          }
        },
        orders: {
          include: {
            items: {
              include: {
                product: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        orderReturns: {
          include: {
            order: true,
            bank: true,
            items: { include: { product: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    throw err;
  }
});

ipcMain.handle('save-customer-prices', async (event, data) => {
  try {
    return await saveCustomerPrices(prisma, data?.customerId, data?.prices);
  } catch (err) {
    console.error('Error saving customer prices:', err);
    throw err;
  }
});

ipcMain.handle('create-customer', async (event, customerData) => {
  try {
    return await prisma.customer.create({
      data: {
        name: customerData.name,
        phone: customerData.phone || null,
        location: customerData.location || null,
        buildingsCount: Number(customerData.buildingsCount) || 0,
        cr: customerData.cr || null,
        trn: customerData.trn || null,
        customerType: customerData.customerType || 'CASH',
        discount: Number(customerData.discount) || 0,
        openingBalance: Number(customerData.openingBalance) || 0
      }
    });
  } catch (err) {
    console.error('Error creating customer:', err);
    throw err;
  }
});

ipcMain.handle('update-customer', async (event, customerData) => {
  const { id, name, phone, location, buildingsCount, cr, trn, customerType, discount } = customerData;
  try {
    return await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone: phone || null,
        location: location || null,
        buildingsCount: buildingsCount !== undefined ? Number(buildingsCount) : undefined,
        cr: cr || null,
        trn: trn || null,
        customerType: customerType || undefined,
        discount: discount !== undefined ? Number(discount) : undefined,
        openingBalance: customerData.openingBalance !== undefined ? Number(customerData.openingBalance) : undefined
      }
    });
  } catch (err) {
    console.error('Error updating customer:', err);
    throw err;
  }
});

ipcMain.handle('create-order', async (event, orderData) => {
  const { customerName, customerId, isQuotation, items, userId, siteReceiptNumber, receiverName, purchaseOrderNumber, invoiceType, linkedQuotationId } = orderData;
  try {
    const productIds = items.map(item => item.productId);
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    let totalAmount = 0;
    let taxAmount = 0;

    const orderItemsData = items.map(item => {
      const product = dbProducts.find(p => p.id === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : product.price;
      const itemTotal = Number((unitPrice * item.quantity).toFixed(2));
      const itemTax = (invoiceType === 'فاتورة' || invoiceType === 'فاتورة مبسطة') ? 0 : Number((itemTotal * product.taxRate).toFixed(2));
      const lineTotal = Number((itemTotal + itemTax).toFixed(2));

      totalAmount += itemTotal;
      taxAmount += itemTax;

      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: unitPrice,
        taxAmount: itemTax,
        total: lineTotal
      };
    });

    const netAmount = Number((totalAmount + taxAmount).toFixed(2));

    const timestamp = new Date().toISOString();

    const count = await prisma.order.count();
    const prefix = isQuotation ? 'QT-' : 'INV-';
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const qrCode = !isQuotation ? invoiceQrText({
      invoiceNumber, issuedAt: timestamp, totalAmount: netAmount.toFixed(2), taxAmount: taxAmount.toFixed(2)
    }) : null;

    let finalUserId = userId;
    if (!finalUserId) {
      let defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            username: 'admin',
            name: 'مدير النظام',
            password: 'admin',
            role: 'ADMIN'
          }
        });
      }
      finalUserId = defaultUser.id;
    }

    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          invoiceNumber,
          isQuotation: !!isQuotation,
          customerName: customerName || 'عميل نقدي',
          customerId: customerId || null,
          totalAmount,
          taxAmount,
          netAmount,
          qrCode,
          siteReceiptNumber: siteReceiptNumber || null,
          receiverName: receiverName || null,
          purchaseOrderNumber: purchaseOrderNumber || null,
          invoiceType: invoiceType || 'فاتورة ضريبية',
          userId: finalUserId,
          status: !isQuotation ? 'COMPLETED' : 'PENDING',
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      });

      if (!isQuotation) {
        for (const item of items) {
          // Re-read stock inside the transaction to block concurrent overselling.
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product || Number(product.stockQty) < Number(item.quantity)) {
            throw new Error(`المخزون المتاح من الصنف ${product?.name || item.productId} لا يكفي (المتاح ${Number(product?.stockQty) || 0}). يمكن حفظ عرض سعر أو تعديل الكمية.`);
          }
        }
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.quantity } }
          });

          if (customerId) {
            const quota = await tx.customerCeilingQuota.findUnique({
              where: { customerId_productId: { customerId, productId: item.productId } }
            });
            if (quota) {
              await tx.customerCeilingQuota.update({
                where: { id: quota.id },
                data: { deliveredQuantity: { increment: item.quantity } }
              });
            }
          }
        }
      }

      if (linkedQuotationId && !isQuotation) {
        await tx.order.update({
          where: { id: linkedQuotationId },
          data: { status: 'CONVERTED' }
        });
      }

      return order;
    }, {
      timeout: 20000 // 20 seconds timeout for the remote host transaction
    });
  } catch (err) {
    console.error('Error creating order native:', err);
    throw err;
  }
});

// Banks IPC
ipcMain.handle('get-banks', async () => {
  try {
    return await prisma.bank.findMany({
      include: {
        payments: {
          orderBy: { date: 'desc' },
          take: 5
        }
      },
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching banks:', err);
    throw err;
  }
});

ipcMain.handle('get-orders', async () => {
  try {
    return await prisma.order.findMany({
      include: {
        customer: true,
        orderReturns: { include: { bank: true, items: { include: { product: true } } } },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    throw err;
  }
});

ipcMain.handle('create-order-return', async (event, returnData) => {
  try {
    return await prisma.createOrderReturn(returnData);
  } catch (err) {
    console.error('Error creating order return:', err);
    throw err;
  }
});

ipcMain.handle('create-bank', async (event, bankData) => {
  try {
    const name = typeof bankData.name === 'string' ? bankData.name.trim() : '';
    if (!name) throw new Error('يرجى إدخال اسم البنك / الخزينة.');
    return await prisma.bank.create({
      data: {
        name,
        accountNumber: bankData.accountNumber || null,
        balance: Number(bankData.balance) || 0
      }
    });
  } catch (err) {
    console.error('Error creating bank:', err);
    if (err.code === 'P2002') {
      throw new Error('يوجد بنك / خزينة مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.');
    }
    throw err;
  }
});

ipcMain.handle('update-bank', async (event, bankData) => {
  try {
    if (typeof bankData.id !== 'string' || !bankData.id.trim()) {
      throw new Error('Bank ID is required.');
    }
    const name = typeof bankData.name === 'string' ? bankData.name.trim() : '';
    if (!name) throw new Error('يرجى إدخال اسم البنك / الخزينة.');
    return await prisma.bank.update({
      where: { id: bankData.id },
      data: {
        name,
        accountNumber: bankData.accountNumber || null,
        balance: Number(bankData.balance) || 0
      }
    });
  } catch (err) {
    console.error('Error updating bank:', err);
    if (err.code === 'P2002') {
      throw new Error('يوجد بنك / خزينة مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.');
    }
    throw err;
  }
});

// Payments IPC
ipcMain.handle('get-payments', async () => {
  try {
    return await prisma.payment.findMany({
      include: {
        customer: true,
        bank: true
      },
      orderBy: { date: 'desc' }
    });
  } catch (err) {
    console.error('Error fetching payments:', err);
    throw err;
  }
});

ipcMain.handle('create-payment', async (event, paymentData) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          customerId: paymentData.customerId,
          bankId: paymentData.bankId,
          amount: Number(paymentData.amount),
          reference: paymentData.reference || null,
          notes: paymentData.notes || null
        },
        include: {
          customer: true,
          bank: true
        }
      });

      // Update bank balance
      await tx.bank.update({
        where: { id: paymentData.bankId },
        data: {
          balance: { increment: Number(paymentData.amount) }
        }
      });

      return payment;
    }, { timeout: 20000, maxWait: 20000 });
  } catch (err) {
    console.error('Error creating payment:', err);
    throw err;
  }
});

ipcMain.handle('update-payment', async (event, paymentData) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') {
      const error = new Error('تصويب الدفعات متاح لمدير النظام فقط.');
      error.statusCode = 403;
      throw error;
    }
    const payment = await correctPayment(prisma, { ...paymentData, userId: user.id });
    if (!payment) throw new Error('سند القبض المطلوب غير موجود.');
    return payment;
  } catch (err) {
    console.error('Error correcting payment:', err);
    throw err;
  }
});

// Suppliers IPC
ipcMain.handle('get-suppliers', async () => {
  try {
    return await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        discounts: true,
        supplierPrices: true,
        purchaseOrders: {
          include: { items: { include: { product: true } } }
        },
        expenses: {
          include: { bank: true }
        }
      }
    });
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    throw err;
  }
});

ipcMain.handle('create-supplier', async (event, supplierData) => {
  try {
    return await prisma.supplier.create({
      data: {
        name: supplierData.name,
        phone: supplierData.phone || null,
        address: supplierData.address || null,
        cr: supplierData.cr || null,
        trn: supplierData.trn || null,
        openingBalance: Number(supplierData.openingBalance ?? supplierData.balance) || 0
      }
    });
  } catch (err) {
    console.error('Error creating supplier:', err);
    throw err;
  }
});

ipcMain.handle('update-supplier', async (event, supplierData) => {
  const { id, name, phone, address, cr, trn, openingBalance } = supplierData;
  try {
    return await prisma.supplier.update({
      where: { id },
      data: {
        name,
        phone: phone || null,
        address: address || null,
        cr: cr || null,
        trn: trn || null,
        openingBalance: openingBalance !== undefined ? Number(openingBalance) : undefined
      }
    });
  } catch (err) {
    console.error('Error updating supplier:', err);
    throw err;
  }
});

// Purchases IPC
ipcMain.handle('get-purchases', async () => {
  try {
    return await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      }
    });
  } catch (err) {
    console.error('Error fetching purchases:', err);
    throw err;
  }
});

ipcMain.handle('create-purchase', async (event, purchaseData) => {
  const { billNumber, supplierId, invoiceType, items } = purchaseData;
  try {
    const warehouseReceiptNumber = normalizeWarehouseReceiptNumber(purchaseData.warehouseReceiptNumber);
    return await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let taxAmount = 0;
      const orderItemsData = [];

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const cost = Number(item.unitCost) || product.costPrice;
        const qty = Number(item.quantity) || 1;
        const isVat = invoiceType !== 'فاتورة';
        const taxRate = isVat ? (product.taxRate || 0.14) : 0;

        const totalCost = cost * qty;
        const itemTax = totalCost * taxRate;
        const totalWithTax = totalCost + itemTax;

        totalAmount += totalCost;
        taxAmount += itemTax;

        orderItemsData.push({
          productId: item.productId,
          quantity: qty,
          unitCost: cost,
          taxAmount: itemTax,
          total: totalWithTax
        });

        // Update stock and costPrice/price
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { increment: qty },
            costPrice: cost,
            price: cost * (1 + (product.markup / 100))
          }
        });
      }

      const netAmount = totalAmount + taxAmount;

      // Update Supplier balance
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: netAmount } }
      });

      return await tx.purchaseOrder.create({
        data: {
          billNumber,
          warehouseReceiptNumber,
          supplierId,
          invoiceType: invoiceType || 'فاتورة ضريبية',
          totalAmount,
          taxAmount,
          netAmount,
          items: { create: orderItemsData }
        },
        include: {
          supplier: true,
          items: { include: { product: true } }
        }
      });
    }, { timeout: 20000, maxWait: 20000 });
  } catch (err) {
    console.error('Error creating purchase order native:', err);
    throw err;
  }
});

for (const [channel, kind] of [
  ['update-purchase', 'purchase'],
  ['update-expense', 'expense'],
  ['update-general-expense', 'generalExpense']
]) {
  ipcMain.handle(channel, async (event, data) => {
    try {
      const user = authenticatedUsers.get(event.sender.id);
      if (user?.role !== 'ADMIN') throw new Error('تعديل المستندات متاح لمدير النظام فقط.');
      return await editDocument(prisma, kind, { ...data, userId: user.id });
    } catch (error) {
      console.error(`Error updating ${kind}:`, error);
      throw error;
    }
  });
}

ipcMain.handle('quotation-costs', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') throw new Error('تحليل أرباح عرض السعر متاح للمدير فقط.');
    return await prisma.quotationCosts(data, user.sessionToken);
  } catch (error) {
    console.error('Quotation cost lookup failed:', error);
    throw error;
  }
});

ipcMain.handle('update-invoice-details', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') throw new Error('تعديل بيانات الفاتورة متاح للمدير فقط.');
    return await prisma.editInvoiceDetails(data, user.sessionToken);
  } catch (error) {
    console.error('Invoice detail correction failed:', error);
    throw error;
  }
});

ipcMain.handle('update-invoice-items', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') throw new Error('تعديل أصناف الفاتورة متاح للمدير فقط.');
    return await prisma.editInvoiceItems(data, user.sessionToken);
  } catch (error) {
    console.error('Invoice items edit failed:', error);
    throw error;
  }
});

ipcMain.handle('update-quotation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') throw new Error('تعديل عرض السعر متاح للمدير فقط.');
    return await editQuotation(prisma, { ...data, userId: user.id });
  } catch (error) {
    console.error('Error editing quotation:', error);
    throw error;
  }
});

// Expenses IPC
ipcMain.handle('get-expenses', async () => {
  try {
    return await prisma.expensePayment.findMany({
      include: {
        supplier: true,
        bank: true
      },
      orderBy: { date: 'desc' }
    });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    throw err;
  }
});

ipcMain.handle('create-expense', async (event, expenseData) => {
  const { supplierId, bankId, amount, notes, reference } = expenseData;
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.expensePayment.count();
      const expenseNumber = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const expense = await tx.expensePayment.create({
        data: {
          expenseNumber,
          supplierId,
          bankId,
          amount: Number(amount),
          reference: reference || null,
          notes: notes || null
        },
        include: {
          supplier: true,
          bank: true
        }
      });

      // Update supplier balance (decrease supplier debt / credit)
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { decrement: Number(amount) } }
      });

      // Decrement bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: { balance: { decrement: Number(amount) } }
      });

      return expense;
    }, { timeout: 20000, maxWait: 20000 });
  } catch (err) {
    console.error('Error creating expense payment native:', err);
    throw err;
  }
});

// General Expenses IPC
ipcMain.handle('get-expense-categories', async () => {
  try {
    return await prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching expense categories:', err);
    throw err;
  }
});

ipcMain.handle('production-reset-operation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') throw new Error('تفريغ البيانات متاح للمدير فقط. سجّل الدخول مجددًا.');
    return await prisma.productionResetOperation(data, user.sessionToken);
  } catch (err) {
    console.error('Production reset failed:', err);
    throw err;
  }
});

ipcMain.handle('expense-category-operation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (!user) throw new Error('سجّل الدخول مجددًا.');
    if (data?.action !== 'list' && user.role !== 'ADMIN') throw new Error('إدارة تصنيفات المصروفات متاحة للمدير فقط.');
    return await prisma.expenseCategoryOperation(data, user.sessionToken);
  } catch (err) {
    console.error('Expense category operation failed:', err);
    throw err;
  }
});

ipcMain.handle('get-general-expenses', async () => {
  try {
    return await prisma.generalExpense.findMany({
      include: {
        category: true,
        bank: true
      },
      orderBy: { date: 'desc' }
    });
  } catch (err) {
    console.error('Error fetching general expenses:', err);
    throw err;
  }
});

ipcMain.handle('create-general-expense', async (event, expenseData) => {
  const { categoryId, bankId, amount, notes, reference } = expenseData;
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.generalExpense.count();
      const expenseNumber = `GEXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const expense = await tx.generalExpense.create({
        data: {
          expenseNumber,
          categoryId,
          bankId,
          amount: Number(amount),
          reference: reference || null,
          notes: notes || null
        },
        include: {
          category: true,
          bank: true
        }
      });

      // Decrement bank balance
      await tx.bank.update({
        where: { id: bankId },
        data: { balance: { decrement: Number(amount) } }
      });

      return expense;
    }, { timeout: 20000, maxWait: 20000 });
  } catch (err) {
    console.error('Error creating general expense native:', err);
    throw err;
  }
});

// Users Management IPC
ipcMain.handle('login', async (event, { username, password }) => {
  try {
    const user = await prisma.login({ username: username.toLowerCase().trim(), password });
    const authenticatedUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      sessionToken: user.sessionToken
    };
    authenticatedUsers.set(event.sender.id, authenticatedUser);
    return authenticatedUser;
  } catch (err) {
    console.error('Login error:', err);
    throw err;
  }
});

ipcMain.handle('create-account-discount', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    const allowed = data?.kind === 'ALLOWED' && ['ADMIN', 'CASHIER'].includes(user?.role)
      || data?.kind === 'EARNED' && ['ADMIN', 'STOREKEEPER'].includes(user?.role);
    if (!allowed) throw new Error('لا تملك صلاحية تسجيل هذا النوع من الخصم. سجّل الدخول مجددًا.');
    return await prisma.createAccountDiscount(data, user.sessionToken);
  } catch (error) {
    console.error('Account discount creation failed:', error);
    throw error;
  }
});

ipcMain.handle('stocktake-operation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (!user || !['ADMIN', 'STOREKEEPER'].includes(user.role)) {
      throw new Error('الجرد متاح للمدير وأمين المخزن فقط. سجّل الدخول مجددًا.');
    }
    return await prisma.stocktakeOperation(data, user.sessionToken);
  } catch (error) {
    console.error('Stocktake operation failed:', error);
    throw error;
  }
});

ipcMain.handle('product-option-operation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (!user) throw new Error('سجّل الدخول مجددًا.');
    if (data?.action !== 'list' && user.role !== 'ADMIN') throw new Error('إدارة خيارات الأصناف متاحة للمدير فقط.');
    return await prisma.productOptionOperation(data, user.sessionToken);
  } catch (error) {
    console.error('Product option operation failed:', error);
    throw error;
  }
});

ipcMain.handle('bank-transfer-operation', async (event, data) => {
  try {
    const user = authenticatedUsers.get(event.sender.id);
    if (user?.role !== 'ADMIN') return { error: 'التحويلات بين الحسابات متاحة للمدير فقط. سجّل الدخول مجددًا.', statusCode: 403 };
    const result = await prisma.bankTransferOperation(data, user.sessionToken);
    return { data: result };
  } catch (error) {
    console.error('Bank transfer operation failed:', error);
    return { error: error.message, statusCode: error.statusCode || 500 };
  }
});

ipcMain.handle('logout', (event) => {
  authenticatedUsers.delete(event.sender.id);
});

ipcMain.handle('get-users', async () => {
  try {
    return await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true
      }
    });
  } catch (err) {
    console.error('Error getting users:', err);
    throw err;
  }
});

ipcMain.handle('change-password', async (event, { userId, newPassword }) => {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { password: newPassword }
    });
    return user;
  } catch (error) {
    console.error('change password error:', error);
    throw error;
  }
});

// Ceiling Quotas IPC
ipcMain.handle('get-customer-ceilings', async (event, customerId) => {
  try {
    return await prisma.customerCeilingQuota.findMany({
      where: { customerId },
      include: { product: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('get-customer-ceilings error:', error);
    throw error;
  }
});

ipcMain.handle('create-customer-ceiling', async (event, data) => {
  try {
    const { customerId, productId, buildingsCount, floorsCount, quantityPerFloor } = data;
    const totalQuantity = Number(buildingsCount) * Number(floorsCount || 6) * Number(quantityPerFloor);

    const existing = await prisma.customerCeilingQuota.findUnique({
      where: { customerId_productId: { customerId, productId } }
    });

    if (existing) {
      return await prisma.customerCeilingQuota.update({
        where: { id: existing.id },
        data: {
          buildingsCount: Number(buildingsCount),
          floorsCount: Number(floorsCount || 6),
          quantityPerFloor: Number(quantityPerFloor),
          totalQuantity
        },
        include: { product: true }
      });
    }

    return await prisma.customerCeilingQuota.create({
      data: {
        customerId,
        productId,
        buildingsCount: Number(buildingsCount),
        floorsCount: Number(floorsCount || 6),
        quantityPerFloor: Number(quantityPerFloor),
        totalQuantity,
        deliveredQuantity: 0
      },
      include: { product: true }
    });
  } catch (error) {
    console.error('create-customer-ceiling error:', error);
    throw error;
  }
});

ipcMain.handle('delete-customer-ceiling', async (event, quotaId) => {
  try {
    await prisma.customerCeilingQuota.delete({ where: { id: quotaId } });
    return { success: true };
  } catch (error) {
    console.error('delete-customer-ceiling error:', error);
    throw error;
  }
});

ipcMain.handle('save-supplier-prices', async (event, data) => {
  try {
    return await saveSupplierPrices(prisma, data?.supplierId, data?.prices);
  } catch (err) {
    console.error('Error saving supplier prices:', err);
    throw err;
  }
});

ipcMain.handle('delete-order', async (event, orderId) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) throw new Error('Order not found');
    if (await prisma.orderReturn.count({ where: { orderId: order.id } })) {
      throw new Error('لا يمكن حذف فاتورة لها مرتجعات مسجلة.');
    }

    // 1. Revert stock and ceilings
    if (!order.isQuotation && order.status !== 'RETURNED') {
      for (const item of order.items) {
        // Revert stock
        await prisma.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } }
        });

        // Revert ceiling
        if (order.customerId) {
          const quota = await prisma.customerCeilingQuota.findUnique({
            where: { customerId_productId: { customerId: order.customerId, productId: item.productId } }
          });
          if (quota) {
            await prisma.customerCeilingQuota.update({
              where: { id: quota.id },
              data: { deliveredQuantity: { decrement: item.quantity } }
            });
          }
        }
      }
    }

    // 2. Delete Order
    await prisma.order.delete({ where: { id: orderId } });
    return { success: true };
  } catch (error) {
    console.error('delete-order error:', error);
    throw error;
  }
});

// Custom Titlebar Commands
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow?.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

app.whenReady().then(() => {
  // Register protocol handler for app://
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      const decodedPath = decodeURIComponent(url.pathname);
      const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath;
      const filePath = path.join(__dirname, '../out', relativePath);
      
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return net.fetch('file:///' + filePath.replace(/\\/g, '/'));
      } else {
        return net.fetch('file:///' + path.join(__dirname, '../out/index.html').replace(/\\/g, '/'));
      }
    } catch (err) {
      console.error('Failed to handle app protocol request:', err);
      return new Response('Internal Error', { status: 500 });
    }
  });

  initializeDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
