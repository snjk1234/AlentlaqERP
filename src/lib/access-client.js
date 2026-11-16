/* eslint @typescript-eslint/no-require-imports: "off" */
const crypto = require('crypto');
const fs = require('fs');
const odbc = require('odbc');
const path = require('path');
const { nextPaymentNumber, assignMissingPaymentNumbers } = require('./payment-numbers');

const field = (type, options = {}) => ({ type, ...options });
const timestamp = field('date', { nullable: false });
const id = field('text', { size: 50, nullable: false });
const text = (options = {}) => field('text', options);
const number = (options = {}) => field('number', options);
const integer = (options = {}) => field('integer', options);
const boolean = (options = {}) => field('boolean', options);

const models = {
  user: {
    table: 'User',
    fields: {
      id, username: text({ size: 100, nullable: false }), name: text({ nullable: false }),
      password: text({ nullable: false }), role: text({ nullable: false }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [['username']],
    relations: {
      orders: { model: 'order', many: true, foreignKey: 'userId' },
      orderReturns: { model: 'orderReturn', many: true, foreignKey: 'userId' }
    }
  },
  product: {
    table: 'Product',
    fields: {
      id, code: text({ nullable: false }), barcode: text(), name: text({ nullable: false }),
      type: text({ nullable: false }), gauge: text(), size: text({ nullable: false }),
      color: text(), length: text(), weight: text(), pricePerKilo: number({ nullable: true }),
      costPrice: number({ nullable: false }), markup: number({ nullable: false }),
      price: number({ nullable: false }), taxRate: number({ nullable: false }),
      stockQty: integer({ nullable: false }), minStockQty: integer({ nullable: false }),
      maxStockQty: integer({ nullable: false }), supplierId: text({ size: 50 }),
      imageUrl: text({ memo: true }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {
      pricePerKilo: 0, costPrice: 0, markup: 1.3, taxRate: 0.14, stockQty: 0,
      minStockQty: 10, maxStockQty: 1000
    },
    unique: [],
    foreignKeys: [{ field: 'supplierId', model: 'supplier' }],
    relations: {
      supplier: { model: 'supplier', foreignKey: 'supplierId' },
      orderItems: { model: 'orderItem', many: true, foreignKey: 'productId', onDelete: 'cascade' },
      orderReturnItems: { model: 'orderReturnItem', many: true, foreignKey: 'productId' },
      purchaseItems: { model: 'purchaseOrderItem', many: true, foreignKey: 'productId', onDelete: 'cascade' },
      customPrices: { model: 'customerPrice', many: true, foreignKey: 'productId', onDelete: 'cascade' },
      ceilingQuotas: { model: 'customerCeilingQuota', many: true, foreignKey: 'productId', onDelete: 'cascade' },
      supplierPrices: { model: 'supplierPrice', many: true, foreignKey: 'productId', onDelete: 'cascade' }
    }
  },
  category: {
    table: 'Category',
    fields: { id, name: text({ nullable: false }), },
    defaults: {},
    unique: [['name']],
    relations: {}
  },
  order: {
    table: 'Order',
    fields: {
      id, invoiceNumber: text({ nullable: false }), isQuotation: boolean({ nullable: false }),
      customerName: text(), customerId: text({ size: 50 }), totalAmount: number({ nullable: false }),
      taxAmount: number({ nullable: false }), netAmount: number({ nullable: false }),
      qrCode: text({ memo: true }), siteReceiptNumber: text(), receiverName: text(),
      invoiceType: text({ nullable: false }), status: text({ nullable: false }),
      userId: text({ size: 50, nullable: false }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { isQuotation: false, invoiceType: 'فاتورة ضريبية', status: 'COMPLETED' },
    unique: [['invoiceNumber']],
    foreignKeys: [
      { field: 'customerId', model: 'customer', nullable: true },
      { field: 'userId', model: 'user' }
    ],
    relations: {
      customer: { model: 'customer', foreignKey: 'customerId' },
      user: { model: 'user', foreignKey: 'userId' },
      items: { model: 'orderItem', many: true, foreignKey: 'orderId', onDelete: 'cascade' },
      orderReturns: { model: 'orderReturn', many: true, foreignKey: 'orderId' }
    }
  },
  customer: {
    table: 'Customer',
    fields: {
      id, name: text({ nullable: false }), location: text(), buildingsCount: integer({ nullable: false }),
      cr: text(), trn: text(), customerType: text({ nullable: false }), phone: text(),
      discount: number({ nullable: false }), openingBalance: number({ nullable: false }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { buildingsCount: 0, customerType: 'CASH', discount: 0, openingBalance: 0 },
    unique: [['name']],
    relations: {
      orders: { model: 'order', many: true, foreignKey: 'customerId' },
      orderReturns: { model: 'orderReturn', many: true, foreignKey: 'customerId' },
      payments: { model: 'payment', many: true, foreignKey: 'customerId' },
      discounts: { model: 'accountDiscount', many: true, foreignKey: 'customerId' },
      customPrices: { model: 'customerPrice', many: true, foreignKey: 'customerId', onDelete: 'cascade' },
      ceilingQuotas: { model: 'customerCeilingQuota', many: true, foreignKey: 'customerId', onDelete: 'cascade' }
    }
  },
  customerPrice: {
    table: 'CustomerPrice',
    fields: {
      id, customerId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
      price: number({ nullable: false }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [['customerId', 'productId']],
    foreignKeys: [
      { field: 'customerId', model: 'customer', onDelete: 'cascade' },
      { field: 'productId', model: 'product', onDelete: 'cascade' }
    ],
    relations: {
      customer: { model: 'customer', foreignKey: 'customerId' },
      product: { model: 'product', foreignKey: 'productId' }
    }
  },
  orderItem: {
    table: 'OrderItem',
    fields: {
      id, orderId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
      position: integer(), quantity: integer({ nullable: false }), unitPrice: number({ nullable: false }),
      taxAmount: number({ nullable: false }), total: number({ nullable: false })
    },
    defaults: {},
    unique: [],
    foreignKeys: [
      { field: 'orderId', model: 'order', onDelete: 'cascade' },
      { field: 'productId', model: 'product', onDelete: 'cascade' }
    ],
    relations: {
      order: { model: 'order', foreignKey: 'orderId' },
      product: { model: 'product', foreignKey: 'productId' },
      returnItems: { model: 'orderReturnItem', many: true, foreignKey: 'orderItemId' }
    }
  },
  orderReturn: {
    table: 'OrderReturn',
    fields: {
      id, returnNumber: text({ nullable: false }), orderId: text({ size: 50, nullable: false }),
      customerId: text({ size: 50 }), userId: text({ size: 50 }), totalAmount: number({ nullable: false }),
      taxAmount: number({ nullable: false }), netAmount: number({ nullable: false }),
      refundAmount: number({ nullable: false }), refundMethod: text({ nullable: false }),
      bankId: text({ size: 50 }), notes: text({ memo: true }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { refundAmount: 0, refundMethod: 'NONE' },
    unique: [['returnNumber']],
    foreignKeys: [
      { field: 'orderId', model: 'order' },
      { field: 'customerId', model: 'customer', nullable: true },
      { field: 'userId', model: 'user', nullable: true },
      { field: 'bankId', model: 'bank', nullable: true }
    ],
    relations: {
      order: { model: 'order', foreignKey: 'orderId' },
      customer: { model: 'customer', foreignKey: 'customerId' },
      user: { model: 'user', foreignKey: 'userId' },
      bank: { model: 'bank', foreignKey: 'bankId' },
      items: { model: 'orderReturnItem', many: true, foreignKey: 'orderReturnId', onDelete: 'cascade' }
    }
  },
  orderReturnItem: {
    table: 'OrderReturnItem',
    fields: {
      id, orderReturnId: text({ size: 50, nullable: false }), orderItemId: text({ size: 50, nullable: false }),
      productId: text({ size: 50, nullable: false }), quantity: integer({ nullable: false }),
      unitPrice: number({ nullable: false }), taxAmount: number({ nullable: false }), total: number({ nullable: false })
    },
    defaults: {},
    unique: [],
    foreignKeys: [
      { field: 'orderReturnId', model: 'orderReturn', onDelete: 'cascade' },
      { field: 'orderItemId', model: 'orderItem' },
      { field: 'productId', model: 'product' }
    ],
    relations: {
      orderReturn: { model: 'orderReturn', foreignKey: 'orderReturnId' },
      orderItem: { model: 'orderItem', foreignKey: 'orderItemId' },
      product: { model: 'product', foreignKey: 'productId' }
    }
  },
  bank: {
    table: 'Bank',
    fields: {
      id, name: text({ nullable: false }), accountNumber: text(), balance: number({ nullable: false }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { balance: 0 },
    unique: [['name']],
    relations: {
      expenses: { model: 'expensePayment', many: true, foreignKey: 'bankId' },
      payments: { model: 'payment', many: true, foreignKey: 'bankId' },
      orderReturns: { model: 'orderReturn', many: true, foreignKey: 'bankId' },
      generalExpenses: { model: 'generalExpense', many: true, foreignKey: 'bankId' }
    }
  },
  bankTransfer: {
    table: 'BankTransfer',
    fields: {
      id, transferNumber: text({ nullable: false }), requestId: text({ size: 50, nullable: false }),
      fromBankId: text({ size: 50, nullable: false }), toBankId: text({ size: 50, nullable: false }),
      fromBankName: text({ nullable: false }), toBankName: text({ nullable: false }),
      fromAccountNumber: text(), toAccountNumber: text(),
      amount: number({ nullable: false }), date: timestamp, reference: text(), notes: text({ memo: true }),
      status: text({ nullable: false }), reversalOf: text({ size: 50 }),
      createdBy: text({ size: 50, nullable: false }), createdByName: text({ nullable: false }),
      fromBalanceBefore: number({ nullable: false }), fromBalanceAfter: number({ nullable: false }),
      toBalanceBefore: number({ nullable: false }), toBalanceAfter: number({ nullable: false }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { status: 'POSTED' },
    unique: [['transferNumber'], ['requestId']],
    foreignKeys: [{ field: 'fromBankId', model: 'bank' }, { field: 'toBankId', model: 'bank' }],
    relations: {}
  },
  customerCeilingQuota: {
    table: 'CustomerCeilingQuota',
    fields: {
      id, customerId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
      buildingsCount: integer({ nullable: false }), floorsCount: integer({ nullable: false }),
      quantityPerFloor: integer({ nullable: false }), totalQuantity: integer({ nullable: false }),
      deliveredQuantity: integer({ nullable: false }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { floorsCount: 6, deliveredQuantity: 0 },
    unique: [['customerId', 'productId']],
    foreignKeys: [
      { field: 'customerId', model: 'customer', onDelete: 'cascade' },
      { field: 'productId', model: 'product', onDelete: 'cascade' }
    ],
  relations: {
    customer: { model: 'customer', foreignKey: 'customerId' },
    product: { model: 'product', foreignKey: 'productId' }
  }
},
supplierPrice: {
  table: 'SupplierPrice',
  fields: {
    id, supplierId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
    price: number({ nullable: false }), createdAt: timestamp, updatedAt: timestamp
  },
  defaults: {},
  unique: [['supplierId', 'productId']],
  foreignKeys: [
    { field: 'supplierId', model: 'supplier', onDelete: 'cascade' },
    { field: 'productId', model: 'product', onDelete: 'cascade' }
  ],
  relations: {
    supplier: { model: 'supplier', foreignKey: 'supplierId' },
    product: { model: 'product', foreignKey: 'productId' }
  }
},
payment: {
    table: 'Payment',
    fields: {
      id, customerId: text({ size: 50, nullable: false }), bankId: text({ size: 50, nullable: false }),
      amount: number({ nullable: false }), reference: text(), receiptNumber: text(),
      date: timestamp, notes: text({ memo: true }), correctionHistory: text({ memo: true }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [],
    foreignKeys: [
      { field: 'customerId', model: 'customer' },
      { field: 'bankId', model: 'bank' }
    ],
    relations: {
      customer: { model: 'customer', foreignKey: 'customerId' },
      bank: { model: 'bank', foreignKey: 'bankId' }
    }
  },
  supplier: {
    table: 'Supplier',
    fields: {
      id, name: text({ nullable: false }), phone: text(), address: text(), cr: text(), trn: text(),
      balance: number({ nullable: false }), openingBalance: number({ nullable: false }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { balance: 0, openingBalance: 0 },
    unique: [['name']],
    relations: {
      expenses: { model: 'expensePayment', many: true, foreignKey: 'supplierId' },
      discounts: { model: 'accountDiscount', many: true, foreignKey: 'supplierId' },
      purchaseOrders: { model: 'purchaseOrder', many: true, foreignKey: 'supplierId' },
      products: { model: 'product', many: true, foreignKey: 'supplierId' },
      supplierPrices: { model: 'supplierPrice', many: true, foreignKey: 'supplierId', onDelete: 'cascade' }
    }
  },
  purchaseOrder: {
    table: 'PurchaseOrder',
    fields: {
      id, billNumber: text({ nullable: false }), supplierId: text({ size: 50, nullable: false }),
      warehouseReceiptNumber: text(),
      invoiceType: text({ nullable: false }), totalAmount: number({ nullable: false }),
      taxAmount: number({ nullable: false }), netAmount: number({ nullable: false }),
      date: timestamp, createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { invoiceType: 'فاتورة ضريبية' },
    unique: [['billNumber']],
    foreignKeys: [{ field: 'supplierId', model: 'supplier' }],
    relations: {
      supplier: { model: 'supplier', foreignKey: 'supplierId' },
      items: { model: 'purchaseOrderItem', many: true, foreignKey: 'purchaseOrderId', onDelete: 'cascade' }
    }
  },
  purchaseOrderItem: {
    table: 'PurchaseOrderItem',
    fields: {
      id, purchaseOrderId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
      quantity: integer({ nullable: false }), unitCost: number({ nullable: false }),
      taxAmount: number({ nullable: false }), total: number({ nullable: false })
    },
    defaults: {},
    unique: [],
    foreignKeys: [
      { field: 'purchaseOrderId', model: 'purchaseOrder', onDelete: 'cascade' },
      { field: 'productId', model: 'product', onDelete: 'cascade' }
    ],
    relations: {
      purchaseOrder: { model: 'purchaseOrder', foreignKey: 'purchaseOrderId' },
      product: { model: 'product', foreignKey: 'productId' }
    }
  },
  expensePayment: {
    table: 'ExpensePayment',
    fields: {
      id, expenseNumber: text({ nullable: false }), supplierId: text({ size: 50, nullable: false }),
      bankId: text({ size: 50, nullable: false }), amount: number({ nullable: false }),
      reference: text(), date: timestamp, notes: text({ memo: true }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [['expenseNumber']],
    foreignKeys: [
      { field: 'supplierId', model: 'supplier' },
      { field: 'bankId', model: 'bank' }
    ],
    relations: {
      supplier: { model: 'supplier', foreignKey: 'supplierId' },
      bank: { model: 'bank', foreignKey: 'bankId' }
    }
  },
  expenseCategory: {
    table: 'ExpenseCategory',
    fields: { id, name: text({ nullable: false }), createdAt: timestamp, updatedAt: timestamp },
    defaults: {},
    unique: [['name']],
    relations: {
      expenses: { model: 'generalExpense', many: true, foreignKey: 'categoryId' }
    }
  },
  productOption: {
    table: 'ProductOption',
    fields: {
      id, kind: text({ size: 20, nullable: false }), value: text({ size: 100, nullable: false }),
      position: integer({ nullable: false }), createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { position: 0 }, unique: [['kind', 'value']], relations: {}
  },
  stocktakeSetting: {
    table: 'StocktakeSetting',
    fields: { id, passwordHash: text({ nullable: false }), createdAt: timestamp, updatedAt: timestamp },
    defaults: {}, unique: [], relations: {}
  },
  stocktake: {
    table: 'Stocktake',
    fields: {
      id, documentNumber: text({ nullable: false }), status: text({ nullable: false }),
      notes: text({ memo: true }), revision: integer({ nullable: false }),
      createdBy: text({ nullable: false }), approvedBy: text(), approvedAt: field('date'),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: { status: 'DRAFT', revision: 1 }, unique: [['documentNumber']],
    relations: { items: { model: 'stocktakeItem', many: true, foreignKey: 'stocktakeId', onDelete: 'cascade' } }
  },
  stocktakeItem: {
    table: 'StocktakeItem',
    fields: {
      id, stocktakeId: text({ size: 50, nullable: false }), productId: text({ size: 50, nullable: false }),
      position: integer({ nullable: false }), productLabel: text({ memo: true, nullable: false }),
      bookQty: integer({ nullable: false }), countedQty: integer(), unitCost: number()
    },
    defaults: {}, unique: [['stocktakeId', 'productId']],
    foreignKeys: [
      { field: 'stocktakeId', model: 'stocktake' },
      { field: 'productId', model: 'product' }
    ],
    relations: { stocktake: { model: 'stocktake', foreignKey: 'stocktakeId' } }
  },
  generalExpense: {
    table: 'GeneralExpense',
    fields: {
      id, expenseNumber: text({ nullable: false }), bankId: text({ size: 50, nullable: false }),
      categoryId: text({ size: 50, nullable: false }), amount: number({ nullable: false }),
      reference: text(), date: timestamp, notes: text({ memo: true }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [['expenseNumber']],
    foreignKeys: [
      { field: 'bankId', model: 'bank' },
      { field: 'categoryId', model: 'expenseCategory' }
    ],
    relations: {
      bank: { model: 'bank', foreignKey: 'bankId' },
      category: { model: 'expenseCategory', foreignKey: 'categoryId' }
    }
  },
  accountDiscount: {
    table: 'AccountDiscount',
    fields: {
      id, discountNumber: text({ nullable: false }), requestId: text({ size: 50, nullable: false }),
      kind: text({ nullable: false }), customerId: text({ size: 50 }), supplierId: text({ size: 50 }),
      amount: number({ nullable: false }), date: timestamp, notes: text({ memo: true }),
      createdAt: timestamp, updatedAt: timestamp
    },
    defaults: {},
    unique: [['discountNumber'], ['requestId']],
    foreignKeys: [
      { field: 'customerId', model: 'customer', nullable: true },
      { field: 'supplierId', model: 'supplier', nullable: true }
    ],
    relations: {
      customer: { model: 'customer', foreignKey: 'customerId' },
      supplier: { model: 'supplier', foreignKey: 'supplierId' }
    }
  }
};

const modelNames = Object.keys(models);
const poolKey = Symbol.for('alentlaq.access.poolState');
const poolState = globalThis[poolKey] || (globalThis[poolKey] = {});
const queueKey = Symbol.for('alentlaq.access.transactionQueue');
const transactionQueue = globalThis[queueKey] || (globalThis[queueKey] = { tail: Promise.resolve() });
const remoteTransactions = new Map();

function quoteIdentifier(value) {
  return `[${String(value).replace(/]/g, ']]')}]`;
}

function encodeText(value) {
  const textValue = String(value);
  if (textValue.includes('\0')) throw new Error('Access text values cannot contain NUL characters.');
  if (/^[\x20-\x7e]*$/.test(textValue)) return `'${textValue.replace(/'/g, "''")}'`;
  const codeUnits = [];
  for (let index = 0; index < textValue.length; index += 1) {
    codeUnits.push(`ChrW(${textValue.charCodeAt(index)})`);
  }
  return codeUnits.length ? codeUnits.join('&') : "''";
}

function encodeDate(value) {
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) throw new Error('Invalid date value for Access.');
  const iso = dateValue.toISOString();
  const date = iso.slice(0, 10).split('-');
  const time = iso.slice(11, 19);
  const milliseconds = Number(iso.slice(20, 23));
  const literal = `#${date[1]}/${date[2]}/${date[0]} ${time}#`;
  return milliseconds ? `(${literal} + ${milliseconds}/86400000)` : literal;
}

function encodeValue(value, fieldDefinition) {
  if (value === null || value === undefined) return 'NULL';
  switch (fieldDefinition?.type) {
    case 'text':
      if (!fieldDefinition.memo && String(value).length > (fieldDefinition.size || 255)) {
        throw new Error(`Text value exceeds the Access field length of ${fieldDefinition.size || 255}.`);
      }
      return encodeText(value);
    case 'date':
      return encodeDate(value);
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
    case 'integer':
    case 'number': {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) throw new Error('Invalid numeric value for Access.');
      if (fieldDefinition.type === 'integer' && !Number.isInteger(numericValue)) {
        throw new Error('Expected an integer value for Access.');
      }
      return String(numericValue);
    }
    default:
      throw new Error('Unsupported Access value type.');
  }
}

function getDbPath() {
  const configuredPath = process.env.ACCESS_DB_PATH;
  if (!configuredPath) {
    throw new Error('ACCESS_DB_PATH must point to the Access database file on the Windows host.');
  }
  const dbPath = path.resolve(configuredPath);
  if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) {
    throw new Error(`Access database file does not exist: ${dbPath}`);
  }
  return dbPath;
}

function connectionString() {
  return `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${getDbPath()};`;
}

function accessType(definition) {
  switch (definition.type) {
    case 'text':
      return definition.memo ? 'MEMO' : `TEXT(${definition.size || 255})`;
    case 'date':
      return 'DATETIME';
    case 'boolean':
      return 'YESNO';
    case 'integer':
      return 'LONG';
    case 'number':
      return 'DOUBLE';
    default:
      throw new Error('Unsupported Access column type.');
  }
}

function createTableSql(modelName) {
  const model = models[modelName];
  const columns = Object.entries(model.fields).map(([name, definition]) => {
    const nullability = definition.nullable === false ? ' NOT NULL' : '';
    return `${quoteIdentifier(name)} ${accessType(definition)}${nullability}`;
  });
  columns.push(`CONSTRAINT ${quoteIdentifier(`PK_${model.table}`)} PRIMARY KEY (${quoteIdentifier('id')})`);
  return `CREATE TABLE ${quoteIdentifier(model.table)} (${columns.join(', ')})`;
}

function indexSql(modelName, fieldNames, indexNumber) {
  const model = models[modelName];
  const field = fieldNames.map(quoteIdentifier).join(', ');
  return `CREATE UNIQUE INDEX ${quoteIdentifier(`UX_${model.table}_${indexNumber}`)} ON ${quoteIdentifier(model.table)} (${field})`;
}

function foreignKeySql(childName, foreignKey, number) {
  const child = models[childName];
  const parent = models[foreignKey.model];
  return `ALTER TABLE ${quoteIdentifier(child.table)} ADD CONSTRAINT ${quoteIdentifier(`FK_${child.table}_${number}`)} FOREIGN KEY (${quoteIdentifier(foreignKey.field)}) REFERENCES ${quoteIdentifier(parent.table)} (${quoteIdentifier('id')})`;
}

function normalizeError(error) {
  const state = error?.odbcErrors?.[0]?.state;
  const mapped = new Error(
    state === '23000'
      ? 'The record conflicts with a unique or relationship constraint.'
      : error?.message || 'Access database operation failed.'
  );
  if (state === '23000') mapped.code = 'P2002';
  else if (typeof error?.code === 'string') mapped.code = error.code;
  if (error?.odbcErrors) mapped.odbcErrors = error.odbcErrors;
  if (typeof error?.statusCode === 'number') mapped.statusCode = error.statusCode;
  return mapped;
}

async function ensureSchema() {
  // Separate Access connections can retain stale snapshots after a rollback.
  if (!poolState.pool) poolState.pool = await odbc.pool({ connectionString: connectionString(), maxSize: 1, initialSize: 1 });
  const connection = await poolState.pool.connect();
  try {
    const existingTables = await connection.tables(null, null, null, 'TABLE');
    const tableNames = new Set(existingTables.map((entry) => entry.TABLE_NAME));
    for (const modelName of modelNames) {
      const tableName = models[modelName].table;
      if (!tableNames.has(tableName)) {
        await connection.query(createTableSql(modelName));
      }
      for (const [indexNumber, fields] of models[modelName].unique.entries()) {
        try {
          await connection.query(indexSql(modelName, fields, indexNumber));
        } catch (error) {
          const firstState = error?.odbcErrors?.[0]?.state;
          if (firstState !== 'HYS11' && firstState !== '42S11') throw error;
        }
      }
    }
    const supplierColumns = await connection.columns(null, null, 'Supplier', null);
    if (!supplierColumns.some(column => column.COLUMN_NAME.toLowerCase() === 'openingbalance')) {
      await connection.query('ALTER TABLE [Supplier] ADD COLUMN [openingBalance] DOUBLE');
    }
    const paymentColumns = await connection.columns(null, null, 'Payment', null);
    if (!paymentColumns.some(column => column.COLUMN_NAME.toLowerCase() === 'correctionhistory')) {
      await connection.query('ALTER TABLE [Payment] ADD COLUMN [correctionHistory] MEMO');
    }
    const orderItemColumns = await connection.columns(null, null, 'OrderItem', null);
    if (!orderItemColumns.some(column => column.COLUMN_NAME.toLowerCase() === 'position')) {
      await connection.query('ALTER TABLE [OrderItem] ADD COLUMN [position] LONG');
    }
    const stocktakeItemColumns = await connection.columns(null, null, 'StocktakeItem', null);
    if (!stocktakeItemColumns.some(column => column.COLUMN_NAME.toLowerCase() === 'unitcost')) {
      await connection.query('ALTER TABLE [StocktakeItem] ADD COLUMN [unitCost] DOUBLE');
    }
    const purchaseOrderColumns = await connection.columns(null, null, 'PurchaseOrder', null);
    if (!purchaseOrderColumns.some(column => column.COLUMN_NAME.toLowerCase() === 'warehousereceiptnumber')) {
      await connection.query('ALTER TABLE [PurchaseOrder] ADD COLUMN [warehouseReceiptNumber] VARCHAR(255)');
    }
    await connection.beginTransaction();
    try {
      const customerPayments = await connection.query('SELECT [id], [receiptNumber] FROM [Payment] ORDER BY [createdAt], [date], [id]');
      await assignMissingPaymentNumbers(customerPayments, async (paymentId, receiptNumber) => {
        await connection.query(`UPDATE [Payment] SET [receiptNumber] = ${encodeText(receiptNumber)} WHERE [id] = ${encodeText(paymentId)}`);
      });
      const suppliers = await connection.query('SELECT [id], [balance] FROM [Supplier] WHERE [openingBalance] IS NULL');
      for (const supplier of suppliers) {
        const where = `[supplierId] = ${encodeText(supplier.id)}`;
        const purchases = await connection.query(`SELECT SUM([netAmount]) AS [total] FROM [PurchaseOrder] WHERE ${where}`);
        const payments = await connection.query(`SELECT SUM([amount]) AS [total] FROM [ExpensePayment] WHERE ${where}`);
        const discounts = await connection.query(`SELECT SUM([amount]) AS [total] FROM [AccountDiscount] WHERE ${where}`);
        const opening = Number(supplier.balance) - Number(purchases[0].total || 0)
          + Number(payments[0].total || 0) + Number(discounts[0].total || 0);
        await connection.query(`UPDATE [Supplier] SET [openingBalance] = ${encodeValue(opening, models.supplier.fields.openingBalance)} WHERE [id] = ${encodeText(supplier.id)}`);
      }
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Failed to roll back payment numbering and supplier opening balance migration:', rollbackError);
      }
      throw error;
    }
    let foreignKeyNumber = 0;
    for (const modelName of modelNames) {
      for (const foreignKey of models[modelName].foreignKeys || []) {
        try {
          await connection.query(foreignKeySql(modelName, foreignKey, foreignKeyNumber));
        } catch (error) {
          const firstState = error?.odbcErrors?.[0]?.state;
          if (firstState !== 'HYS11' && firstState !== '42S11' && firstState !== '42S01') throw error;
        }
        foreignKeyNumber += 1;
      }
    }
  } catch (error) {
    throw normalizeError(error);
  } finally {
    await connection.close();
  }
}

function ready() {
  if (!poolState.initialization) poolState.initialization = ensureSchema();
  return poolState.initialization;
}

function flattenWhere(modelName, where) {
  if (!where || typeof where !== 'object') return [];
  const model = models[modelName];
  const clauses = [];
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') {
      const nested = (Array.isArray(value) ? value : [value])
        .map((entry) => flattenWhere(modelName, entry))
        .filter((entry) => entry.length);
      if (nested.length) {
        const glue = key === 'AND' ? ' AND ' : ' OR ';
        clauses.push(`(${nested.map((entry) => entry.join(' AND ')).join(glue)})`);
      }
      continue;
    }
    if (key === 'NOT') {
      const nested = flattenWhere(modelName, value);
      if (nested.length) clauses.push(`NOT (${nested.join(' AND ')})`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(model.fields, key) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(model.fields, nestedKey)) {
          throw new Error(`Unsupported where field for ${modelName}: ${key}.${nestedKey}`);
        }
        clauses.push(...flattenWhere(modelName, { [nestedKey]: nestedValue }));
      }
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(model.fields, key)) {
      throw new Error(`Unsupported where field for ${modelName}: ${key}`);
    }
    const column = quoteIdentifier(key);
    const definition = model.fields[key];
    if (value === null) {
      clauses.push(`${column} IS NULL`);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      for (const [operator, operand] of Object.entries(value)) {
        if (operator === 'in' || operator === 'notIn') {
          const list = Array.isArray(operand) ? operand : [];
          if (!list.length) clauses.push(operator === 'in' ? '1=0' : '1=1');
          else clauses.push(`${column} ${operator === 'notIn' ? 'NOT ' : ''}IN (${list.map((item) => encodeValue(item, definition)).join(', ')})`);
        } else if (operator === 'not') {
          clauses.push(operand === null ? `${column} IS NOT NULL` : `${column} <> ${encodeValue(operand, definition)}`);
        } else {
          const comparison = { equals: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
          if (!comparison) throw new Error(`Unsupported where operator: ${operator}`);
          clauses.push(`${column} ${comparison} ${encodeValue(operand, definition)}`);
        }
      }
      continue;
    }
    clauses.push(`${column} = ${encodeValue(value, definition)}`);
  }
  return clauses;
}

function whereSql(modelName, where) {
  const clauses = flattenWhere(modelName, where);
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

function orderBySql(modelName, orderBy) {
  if (!orderBy) return '';
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  const fields = [];
  for (const entry of entries) {
    for (const [name, direction] of Object.entries(entry)) {
      if (!Object.prototype.hasOwnProperty.call(models[modelName].fields, name)) {
        throw new Error(`Unsupported order field for ${modelName}: ${name}`);
      }
      if (direction !== 'asc' && direction !== 'desc') throw new Error('Order direction must be asc or desc.');
      fields.push(`${quoteIdentifier(name)} ${direction.toUpperCase()}`);
    }
  }
  return fields.length ? ` ORDER BY ${fields.join(', ')}` : '';
}

function normalizeRow(modelName, row) {
  if (!row) return row;
  const normalized = {};
  for (const [name, definition] of Object.entries(models[modelName].fields)) {
    const value = definition.type === 'date' ? row[`__access_date_${name}`] : row[name];
    if (value === undefined) continue;
    if (definition.type === 'boolean') {
      normalized[name] = value === true || value === 1 || value === '1' || value === -1 || value === '-1';
    } else if (definition.type === 'integer' || definition.type === 'number') {
      normalized[name] = value === null ? null : Number(value);
    } else if (definition.type === 'date' && value !== null) {
      if (typeof value === 'number') {
        normalized[name] = new Date(Math.round(Date.UTC(1899, 11, 30) + value * 86400000));
      } else {
        const dateText = value instanceof Date ? value.toISOString() : String(value);
        const dateWithZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateText) ? dateText : `${dateText.replace(' ', 'T')}Z`;
        normalized[name] = new Date(dateWithZone);
      }
    } else {
      normalized[name] = value;
    }
  }
  return normalized;
}

function selectedRow(row, select) {
  if (!select) return row;
  const result = {};
  for (const [name, enabled] of Object.entries(select)) {
    if (enabled && Object.prototype.hasOwnProperty.call(row, name)) result[name] = row[name];
  }
  return result;
}

function defaultedData(modelName, input) {
  const model = models[modelName];
  const data = { ...(input || {}) };
  const now = new Date();
  if (data.id === undefined) data.id = crypto.randomUUID();
  if (model.fields.createdAt && data.createdAt === undefined) data.createdAt = now;
  if (model.fields.updatedAt && data.updatedAt === undefined) data.updatedAt = now;
  if (model.fields.date && data.date === undefined) data.date = now;
  for (const [name, value] of Object.entries(model.defaults)) {
    if (data[name] === undefined) data[name] = value;
  }
  return data;
}

function ensureField(modelName, name) {
  const definition = models[modelName].fields[name];
  if (!definition) throw new Error(`Unsupported data field for ${modelName}: ${name}`);
  return definition;
}

async function execute(connection, sql, parameters) {
  try {
    const target = connection || poolState.pool;
    return parameters === undefined
      ? await target.query(sql)
      : await target.query(sql, parameters);
  } catch (error) {
    throw normalizeError(error);
  }
}

async function executeRows(connection, modelName, sql) {
  const result = await execute(connection, sql);
  return Array.from(result, (row) => normalizeRow(modelName, row));
}

async function loadIncludes(connection, modelName, rows, include) {
  if (!include || !rows.length) return rows;
  const model = models[modelName];
  const output = rows.map((row) => ({ ...row }));
  for (const [relationName, relationOptions] of Object.entries(include)) {
    if (!relationOptions) continue;
    const relation = model.relations[relationName];
    if (!relation) throw new Error(`Unsupported relation for ${modelName}: ${relationName}`);
    const options = relationOptions === true ? {} : relationOptions;
    const targetName = relation.model;
    if (relation.many) {
      const sourceIds = [...new Set(rows.map((row) => row.id).filter((value) => value !== null && value !== undefined))];
      const baseWhere = options.where || {};
      const childWhere = { ...baseWhere, [relation.foreignKey]: { in: sourceIds } };
      const childRows = await findMany(connection, targetName, {
        where: childWhere,
        orderBy: options.orderBy,
        include: options.include
      });
      const bySource = new Map();
      for (const child of childRows) {
        const key = child[relation.foreignKey];
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key).push(child);
      }
      for (const row of output) {
        let related = bySource.get(row.id) || [];
        if (options.take !== undefined) related = related.slice(0, Math.max(0, Number(options.take)));
        row[relationName] = related;
      }
    } else {
      const foreignValues = [...new Set(rows.map((row) => row[relation.foreignKey]).filter((value) => value !== null && value !== undefined))];
      const relatedRows = foreignValues.length
        ? await findMany(connection, targetName, { where: { id: { in: foreignValues } }, include: options.include })
        : [];
      const relatedById = new Map(relatedRows.map((related) => [related.id, related]));
      for (const row of output) row[relationName] = row[relation.foreignKey] == null ? null : relatedById.get(row[relation.foreignKey]) || null;
    }
  }
  return output;
}

async function findMany(connection, modelName, args = {}) {
  const model = models[modelName];
  const take = args.take === undefined ? null : Math.max(0, Math.trunc(Number(args.take)));
  const top = take === null ? '' : ` TOP ${take}`;
  const columns = Object.entries(model.fields).map(([name, definition]) =>
    definition.type === 'date'
      ? `${definition.nullable === false ? `CDbl(${quoteIdentifier(name)})` : `(${quoteIdentifier(name)} - #12/30/1899#)`} AS ${quoteIdentifier(`__access_date_${name}`)}`
      : quoteIdentifier(name)
  );
  const orderBy = args.orderBy ?? (['orderItem', 'stocktakeItem'].includes(modelName) ? { position: 'asc' } : undefined);
  const sql = `SELECT${top} ${columns.join(', ')} FROM ${quoteIdentifier(model.table)}${whereSql(modelName, args.where)}${orderBySql(modelName, orderBy)}`;
  const rows = await executeRows(connection, modelName, sql);
  const included = await loadIncludes(connection, modelName, rows, args.include);
  return included.map((row) => selectedRow(row, args.select));
}

async function findOne(connection, modelName, args = {}) {
  const rows = await findMany(connection, modelName, { ...args, take: 1 });
  return rows[0] || null;
}

async function insert(connection, modelName, input, include) {
  const model = models[modelName];
  const data = defaultedData(modelName, input);
  if (modelName === 'payment' && !String(data.receiptNumber || '').trim()) {
    const payments = await connection.query('SELECT [receiptNumber] FROM [Payment]');
    data.receiptNumber = nextPaymentNumber(payments);
  }
  if (modelName === 'supplier') {
    data.openingBalance = Number(input?.openingBalance ?? input?.balance ?? 0);
    data.balance = data.openingBalance;
  }
  const nested = {};
  for (const relationName of Object.keys(model.relations)) {
    const relation = model.relations[relationName];
    if (relation.many && data[relationName] && typeof data[relationName] === 'object') {
      if (relation.model === 'accountDiscount') {
        throw new Error('يجب تسجيل سندات الخصم من خلال واجهتها المصرح بها.');
      }
      nested[relationName] = data[relationName].create;
      delete data[relationName];
    }
  }
  for (const name of Object.keys(data)) {
    if (!model.fields[name]) throw new Error(`Unsupported data field for ${modelName}: ${name}`);
  }
  const entries = Object.entries(data).filter(([name, value]) => value !== undefined && model.fields[name]);
  for (const [name] of entries) ensureField(modelName, name);
  if (!entries.length) throw new Error(`No data provided to create ${modelName}.`);
  const columns = entries.map(([name]) => quoteIdentifier(name)).join(', ');
  const values = entries.map(([name, value]) => encodeValue(value, ensureField(modelName, name))).join(', ');
  await execute(connection, `INSERT INTO ${quoteIdentifier(model.table)} (${columns}) VALUES (${values})`);

  for (const [relationName, children] of Object.entries(nested)) {
    const relation = model.relations[relationName];
    const list = Array.isArray(children) ? children : children ? [children] : [];
    for (const [position, child] of list.entries()) {
      await insert(connection, relation.model, {
        ...child,
        ...(modelName === 'order' && relationName === 'items' ? { position } : {}),
        [relation.foreignKey]: data.id
      }, undefined);
    }
  }

  const created = await findOne(connection, modelName, { where: { id: data.id }, include });
  if (!created) throw new Error(`Created ${modelName} record could not be read back.`);
  return created;
}

async function updateRecord(connection, modelName, where, input, include) {
  const model = models[modelName];
  const existing = await findOne(connection, modelName, { where });
  if (!existing) throw new Error(`Record not found in ${modelName}.`);
  const data = { ...(input || {}) };
  if (modelName === 'supplier' && data.openingBalance !== undefined) {
    const opening = Number(data.openingBalance);
    if (!Number.isFinite(opening)) throw new Error('Invalid supplier opening balance.');
    data.openingBalance = opening;
    data.balance = Number(existing.balance) + opening - Number(existing.openingBalance);
  }
  if (model.fields.updatedAt && data.updatedAt === undefined) data.updatedAt = new Date();
  const updates = [];
  for (const [name, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const definition = ensureField(modelName, name);
    const column = quoteIdentifier(name);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const operation = Object.entries(value)[0];
      if (operation && (operation[0] === 'increment' || operation[0] === 'decrement')) {
        if (definition.type !== 'number' && definition.type !== 'integer') {
          throw new Error(`Atomic numeric update is not supported for ${modelName}.${name}.`);
        }
        const amount = encodeValue(operation[1], definition);
        updates.push(`${column} = ${column} ${operation[0] === 'increment' ? '+' : '-'} ${amount}`);
        continue;
      }
      throw new Error(`Unsupported update operation for ${modelName}.${name}.`);
    }
    updates.push(`${column} = ${encodeValue(value, definition)}`);
  }
  if (updates.length) await execute(connection, `UPDATE ${quoteIdentifier(model.table)} SET ${updates.join(', ')}${whereSql(modelName, where)}`);
  return findOne(connection, modelName, { where: { id: existing.id }, include });
}

async function deleteRecord(connection, modelName, where) {
  const model = models[modelName];
  const existing = await findOne(connection, modelName, { where });
  if (!existing) throw new Error(`Record not found in ${modelName}.`);
  for (const childName of modelNames) {
    const child = models[childName];
    for (const foreignKey of child.foreignKeys || []) {
      if (foreignKey.model !== modelName || foreignKey.onDelete !== 'cascade') continue;
      const childRows = await findMany(connection, childName, { where: { [foreignKey.field]: existing.id } });
      for (const row of childRows) await deleteRecord(connection, childName, { id: row.id });
    }
  }
  await execute(connection, `DELETE FROM ${quoteIdentifier(model.table)}${whereSql(modelName, where)}`);
  return existing;
}

async function countRecords(connection, modelName, args = {}) {
  const result = await execute(connection, `SELECT COUNT(*) AS [recordCount] FROM ${quoteIdentifier(models[modelName].table)}${whereSql(modelName, args.where)}`);
  return Number(result[0]?.recordCount || 0);
}

function getDelegate(connection, modelName) {
  return {
    findMany: (args) => ready().then(() => findMany(connection, modelName, args)),
    findFirst: (args) => ready().then(() => findOne(connection, modelName, args)),
    findUnique: (args) => ready().then(() => findOne(connection, modelName, args)),
    count: (args) => ready().then(() => countRecords(connection, modelName, args)),
    create: (args) => runMutation(connection, (active) => insert(active, modelName, args?.data, args?.include)),
    update: (args) => runMutation(connection, (active) => updateRecord(active, modelName, args?.where, args?.data, args?.include)),
    delete: (args) => runMutation(connection, (active) => deleteRecord(active, modelName, args?.where)),
    upsert: (args) => runMutation(connection, async (active) => {
      const existing = await findOne(active, modelName, { where: args?.where });
      return existing
        ? updateRecord(active, modelName, args.where, args.update, args.include)
        : insert(active, modelName, args.create, args.include);
    })
  };
}

async function runMutation(connection, callback) {
  if (connection) return callback(connection);
  await ready();
  const queued = transactionQueue.tail.then(async () => {
    const active = await poolState.pool.connect();
    try {
      await active.beginTransaction();
      const result = await callback(active);
      await active.commit();
      return result;
    } catch (error) {
      try {
        await active.rollback();
      } catch (rollbackError) {
        console.error('Failed to roll back Access transaction:', rollbackError);
      }
      throw normalizeError(error);
    } finally {
      await active.close();
    }
  });
  transactionQueue.tail = queued.catch(() => undefined);
  return queued;
}

function createClient(connection = null) {
  const client = {};
  for (const modelName of modelNames) {
    client[modelName] = getDelegate(connection, modelName);
  }
  client.$transaction = async (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Access transactions require a callback function.');
    }
    return runMutation(null, async (active) => callback(createClient(active)));
  };
  client.$disconnect = async () => {
    if (poolState.pool) {
      await poolState.pool.close();
      poolState.pool = undefined;
      poolState.initialization = undefined;
    }
  };
  return client;
}

function createAccessClient() {
  return createClient();
}

async function beginRemoteTransaction() {
  await ready();
  const previous = transactionQueue.tail;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  transactionQueue.tail = previous.then(() => gate, () => gate);
  await previous;
  let connection;
  try {
    connection = await poolState.pool.connect();
    await connection.beginTransaction();
  } catch (error) {
    if (connection) await connection.close();
    release();
    throw normalizeError(error);
  }

  const transactionId = crypto.randomUUID();
  const transaction = { connection, release, timer: null };
  const expire = () => {
    rollbackRemoteTransaction(transactionId).catch((error) => {
      console.error('Failed to expire Access transaction:', error);
    });
  };
  transaction.timer = setTimeout(expire, 120000);
  transaction.timer.unref?.();
  remoteTransactions.set(transactionId, transaction);
  return transactionId;
}

function refreshRemoteTransaction(transaction) {
  clearTimeout(transaction.timer);
  transaction.timer = setTimeout(() => {
    for (const [transactionId, active] of remoteTransactions) {
      if (active === transaction) {
        rollbackRemoteTransaction(transactionId).catch((error) => {
          console.error('Failed to expire Access transaction:', error);
        });
        break;
      }
    }
  }, 120000);
  transaction.timer.unref?.();
}

async function runRemoteOperation(modelName, operation, args, transactionId) {
  if (!models[modelName]) throw new Error('Unknown Access model.');
  const supportedOperations = ['findMany', 'findFirst', 'findUnique', 'count', 'create', 'update', 'delete', 'upsert'];
  if (!supportedOperations.includes(operation)) throw new Error('Unsupported Access database operation.');
  const transaction = transactionId ? remoteTransactions.get(transactionId) : null;
  if (transactionId && !transaction) throw new Error('Access transaction is no longer active.');
  if (transaction) refreshRemoteTransaction(transaction);
  const client = createClient(transaction?.connection || null);
  return client[modelName][operation](args || {});
}

async function finishRemoteTransaction(transactionId, commit) {
  const transaction = remoteTransactions.get(transactionId);
  if (!transaction) throw new Error('Access transaction is no longer active.');
  remoteTransactions.delete(transactionId);
  clearTimeout(transaction.timer);
  try {
    if (commit) await transaction.connection.commit();
    else await transaction.connection.rollback();
  } catch (error) {
    throw normalizeError(error);
  } finally {
    try {
      await transaction.connection.close();
    } finally {
      transaction.release();
    }
  }
}

function commitRemoteTransaction(transactionId) {
  return finishRemoteTransaction(transactionId, true);
}

function rollbackRemoteTransaction(transactionId) {
  return finishRemoteTransaction(transactionId, false);
}

module.exports = {
  beginRemoteTransaction,
  commitRemoteTransaction,
  createAccessClient,
  encodeText,
  encodeValue,
  initializeAccessDatabase: ready,
  modelNames,
  models,
  rollbackRemoteTransaction,
  runRemoteOperation
};
