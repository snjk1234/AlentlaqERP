const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('../src/generated/client');

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

async function seedUsers() {
  try {
    const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!adminExists) {
      await prisma.user.create({
        data: {
          username: 'admin',
          name: 'مدير النظام',
          password: 'pos62026',
          role: 'ADMIN'
        }
      });
    } else if (adminExists.password === 'admin') {
      await prisma.user.update({
        where: { username: 'admin' },
        data: { password: 'pos62026' }
      });
    }

    const cashierExists = await prisma.user.findUnique({ where: { username: 'cashier' } });
    if (!cashierExists) {
      await prisma.user.create({
        data: {
          username: 'cashier',
          name: 'كاشير الانطلاق',
          password: '123456',
          role: 'CASHIER'
        }
      });
    }

    const storekeeperExists = await prisma.user.findUnique({ where: { username: 'storekeeper' } });
    if (!storekeeperExists) {
      await prisma.user.create({
        data: {
          username: 'storekeeper',
          name: 'أمين المخزن',
          password: '123456',
          role: 'STOREKEEPER'
        }
      });
    }
  } catch (err) {
    console.error('Error seeding users:', err);
  }
}

// Initialize Database Connection to Supabase / PostgreSQL
function initializeDatabase() {
  let databaseUrl = process.env.DATABASE_URL;

  // Read from .env file if process.env.DATABASE_URL is not set (typical in dev/prod builds)
  const envPath = path.join(__dirname, '../.env');
  if (!databaseUrl && fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
      if (match) {
        databaseUrl = match[1];
      }
    } catch (err) {
      console.error('Failed to read .env file:', err);
    }
  }

  if (!databaseUrl) {
    console.error('CRITICAL: DATABASE_URL is not set in environment or .env file!');
  }

  // Create Prisma client pointing to online database
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  seedUsers().catch(console.error);
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
    mainWindow.loadURL('http://localhost:3000');
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

// ZATCA QR Code Helper (TLV format)
function generateZatcaQrCode(sellerName, trn, timestamp, totalAmount, vatAmount) {
  const getTlv = (tag, value) => {
    const valueBuffer = Buffer.from(value, 'utf-8');
    const tagBuffer = Buffer.from([tag]);
    const lengthBuffer = Buffer.from([valueBuffer.length]);
    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
  };

  const tag1 = getTlv(1, sellerName);
  const tag2 = getTlv(2, trn);
  const tag3 = getTlv(3, timestamp);
  const tag4 = getTlv(4, totalAmount);
  const tag5 = getTlv(5, vatAmount);

  return Buffer.concat([tag1, tag2, tag3, tag4, tag5]).toString('base64');
}

// Native IPC database endpoints
ipcMain.handle('get-products', async () => {
  try {
    return await prisma.product.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    throw err;
  }
});

ipcMain.handle('create-product', async (event, productData) => {
  try {
    return await prisma.product.create({
      data: {
        code: productData.code,
        barcode: productData.barcode || null,
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
        maxStockQty: Number(productData.maxStockQty) || 1000
      }
    });
  } catch (err) {
    console.error('Error creating product:', err);
    throw err;
  }
});

ipcMain.handle('update-product', async (event, productData) => {
  const { id, ...data } = productData;
  try {
    return await prisma.product.update({
      where: { id },
      data: {
        code: data.code,
        barcode: data.barcode || null,
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
        maxStockQty: data.maxStockQty !== undefined ? Number(data.maxStockQty) : undefined
      }
    });
  } catch (err) {
    console.error('Error updating product:', err);
    throw err;
  }
});

ipcMain.handle('get-customers', async () => {
  try {
    return await prisma.customer.findMany({
      include: {
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
        }
      },
      orderBy: { name: 'asc' }
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
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
        discount: Number(customerData.discount) || 0
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
        discount: discount !== undefined ? Number(discount) : undefined
      }
    });
  } catch (err) {
    console.error('Error updating customer:', err);
    throw err;
  }
});

ipcMain.handle('create-order', async (event, orderData) => {
  const { customerName, customerId, isQuotation, items, userId } = orderData;
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
      const itemTax = Number((itemTotal * product.taxRate).toFixed(2));
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

    // ZATCA details
    const sellerName = 'شركة الإنطلاق لتصنيع وتوريد الخراطيم والمواسير';
    const trn = '310122345600003';
    const timestamp = new Date().toISOString();
    
    let qrCodeBase64 = null;
    if (!isQuotation) {
      qrCodeBase64 = generateZatcaQrCode(
        sellerName,
        trn,
        timestamp,
        netAmount.toFixed(2),
        taxAmount.toFixed(2)
      );
    }

    const count = await prisma.order.count();
    const prefix = isQuotation ? 'QT-' : 'INV-';
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

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
          qrCode: qrCodeBase64,
          userId: finalUserId,
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
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.quantity } }
          });
        }
      }

      return order;
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

ipcMain.handle('create-bank', async (event, bankData) => {
  try {
    return await prisma.bank.create({
      data: {
        name: bankData.name,
        accountNumber: bankData.accountNumber || null,
        balance: Number(bankData.balance) || 0
      }
    });
  } catch (err) {
    console.error('Error creating bank:', err);
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
    });
  } catch (err) {
    console.error('Error creating payment:', err);
    throw err;
  }
});

// Suppliers IPC
ipcMain.handle('get-suppliers', async () => {
  try {
    return await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        purchaseOrders: true,
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
        balance: Number(supplierData.balance) || 0
      }
    });
  } catch (err) {
    console.error('Error creating supplier:', err);
    throw err;
  }
});

ipcMain.handle('update-supplier', async (event, supplierData) => {
  const { id, name, phone, address, cr, trn, balance } = supplierData;
  try {
    return await prisma.supplier.update({
      where: { id },
      data: {
        name,
        phone: phone || null,
        address: address || null,
        cr: cr || null,
        trn: trn || null,
        balance: balance !== undefined ? Number(balance) : undefined
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
  const { billNumber, supplierId, items } = purchaseData;
  try {
    return await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let taxAmount = 0;
      const orderItemsData = [];

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const cost = Number(item.unitCost) || product.costPrice;
        const qty = Number(item.quantity) || 1;
        const taxRate = product.taxRate || 0.14;

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
          supplierId,
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
    });
  } catch (err) {
    console.error('Error creating purchase order native:', err);
    throw err;
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
    });
  } catch (err) {
    console.error('Error creating expense payment native:', err);
    throw err;
  }
});

// Users Management IPC
ipcMain.handle('login', async (event, { username, password }) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        username: username.toLowerCase().trim()
      }
    });
    if (!user) {
      throw new Error('المستخدم غير موجود!');
    }
    if (user.password !== password) {
      throw new Error('كلمة المرور غير صحيحة!');
    }
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  } catch (err) {
    console.error('Login error:', err);
    throw err;
  }
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
    await prisma.user.update({
      where: { id: userId },
      data: { password: newPassword }
    });
    return { success: true };
  } catch (err) {
    console.error('Error changing password:', err);
    throw err;
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
