/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { distributionOperation } = require('./distributions');

function databaseFor(role) {
  const product = {
    id: 'product-1', code: 'P-1', barcode: '12345', name: 'اسم الصنف بعد تعديل البطاقة', type: 'مواسير',
    size: '20', gauge: 'ثقيل', color: 'أزرق', length: '6م', weight: '5كجم',
    price: 150, taxRate: 0.14, stockQty: 20, reservedQty: 4,
    supplier: { name: 'المورد الأول' }
  };
  const document = {
    id: 'distribution-1', documentNumber: 'DST-00000001', customerId: 'customer-1',
    customerName: 'العميل الأول', status: 'APPROVED', revision: 1, notes: '',
    items: [{
      id: 'distribution-item-1', productId: product.id,
      productLabel: 'الكود: P-1 | الباركود: 12345 | الصنف: صنف اختبار | النوع: مواسير | المقاس: 20 | الدرجة: ثقيل | اللون: أزرق | الطول: 6م | الوزن: 5كجم | المورد: المورد الأول',
      quantity: 3, shippedQuantity: 1, invoicedQuantity: 0, unitPrice: 120,
      taxRate: 0.14, isCancelled: false
    }],
    revisions: [], dispatches: []
  };
  const tx = {
    user: { findUnique: async () => ({ id: 'user-1', name: 'المستخدم', role }) },
    distribution: { findMany: async () => [document] },
    customer: { findMany: async () => [{ id: 'customer-1', name: 'العميل الأول', discount: 0 }] },
    product: { findMany: async () => [product] }
  };
  return { $transaction: callback => callback(tx) };
}

function panelFunctions(names, context = {}, filename = path.join(__dirname, '..', 'components', 'DistributionPanel.tsx')) {
  const source = fs.readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile('DistributionPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const snippets = [];
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) snippets.push(node.getText(tree));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      snippets.push(`const ${node.getText(tree)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(snippets.length, names.length);
  vm.runInNewContext(ts.transpileModule(`${snippets.join('\n')}\nexposed = { ${names.join(', ')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  return context.exposed;
}

test('shipping identity distinguishes pending, partial and complete independently of invoicing', () => {
  const { shippingState } = panelFunctions(['shippingState']);
  const line = { quantity: 5, shippedQuantity: 0 };
  assert.equal(shippingState([line]), 'PENDING');
  assert.equal(shippingState([{ ...line, shippedQuantity: 2 }]), 'PARTIAL');
  assert.equal(shippingState([{ ...line, shippedQuantity: 5 }, line]), 'PARTIAL');
  assert.equal(shippingState([{ ...line, shippedQuantity: 5, invoicedQuantity: 1 }]), 'SHIPPED');
  assert.equal(shippingState([
    { ...line, shippedQuantity: 5 }, { quantity: 50, shippedQuantity: 1, isCancelled: true }
  ]), 'SHIPPED');
});

test('preparing the cart includes only unbilled shipments and never creates an invoice', async () => {
  const requests = [];
  let error;
  let prepared;
  let closed = false;
  const { invoice, invoiceLines } = panelFunctions(['invoice', 'invoiceLines'], {
    invoiceType: 'فاتورة ضريبية',
    setError: value => { error = value; },
    setInvoiceSelection() {}, setShowModal: value => { closed = !value; },
    operation: async payload => { requests.push(payload); },
    onPrepareInvoice: draft => { prepared = draft; return true; }
  });
  const entries = [{
    id: 'd1', status: 'PARTIALLY_INVOICED', customerId: 'c1', customerName: 'Customer',
    items: [
      { id: 'l1', shippedQuantity: 5, invoicedQuantity: 2 },
      { id: 'unshipped', shippedQuantity: 0, invoicedQuantity: 0 },
      { id: 'billed', shippedQuantity: 2, invoicedQuantity: 2 },
      { id: 'cancelled', shippedQuantity: 1, invoicedQuantity: 0, isCancelled: true }
    ]
  }, {
    id: 'd2', status: 'SHIPPED', customerId: 'c1', customerName: 'Customer',
    items: [{ id: 'l2', shippedQuantity: 4, invoicedQuantity: 0 }]
  }];
  await invoice(entries);
  assert.equal(requests.length, 0);
  assert.equal(prepared.customerId, 'c1');
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.items.map(({ distributionItemId, quantity }) => ({ distributionItemId, quantity })))), [
    { distributionItemId: 'l1', quantity: 3 },
    { distributionItemId: 'cancelled', quantity: 1 },
    { distributionItemId: 'l2', quantity: 4 }
  ]);
  assert.equal(closed, true);
  await invoice([{ ...entries[0], items: [] }]);
  assert.match(error, /لا توجد كميات مشحونة غير مفوترة/);
  await invoice([entries[0], { ...entries[1], customerId: 'other' }]);
  assert.match(error, /للعميل نفسه/);
  assert.equal(requests.length, 0);
  assert.equal(invoiceLines([{ ...entries[0], status: 'DRAFT' }]).length, 0);
});

test('invoice checkboxes allow multiple distributions for one customer and reject mixing customers', () => {
  const entries = [{ id: 'd1', customerId: 'c1' }, { id: 'd2', customerId: 'c1' }, { id: 'd3', customerId: 'c2' }];
  let error;
  const context = {
    invoiceSelection: [], selectedForInvoice: [],
    setError: value => { error = value; },
    setInvoiceSelection: update => {
      context.invoiceSelection = update(context.invoiceSelection);
      context.selectedForInvoice = entries.filter(entry => context.invoiceSelection.includes(entry.id));
    }
  };
  const { toggleInvoiceSelection } = panelFunctions(['toggleInvoiceSelection'], context);
  toggleInvoiceSelection(entries[0]);
  toggleInvoiceSelection(entries[1]);
  assert.deepEqual(Array.from(context.invoiceSelection), ['d1', 'd2']);
  toggleInvoiceSelection(entries[2]);
  assert.match(error, /العميل نفسه/);
  assert.deepEqual(Array.from(context.invoiceSelection), ['d1', 'd2']);
  toggleInvoiceSelection(entries[0]);
  assert.deepEqual(Array.from(context.invoiceSelection), ['d2']);
});

test('moving shipments into the cart preserves prices, navigates to POS and confirms replacing a filled cart', () => {
  const draft = {
    customerId: 'c1', customerName: 'Customer', invoiceType: 'فاتورة',
    documents: [{ id: 'd1', revision: 1 }],
    items: [{ distributionItemId: 'l1', productId: 'p1', quantity: 3,
      unitPrice: 75, taxRate: 0.1, productLabel: 'Pipe' }]
  };
  let cart;
  let storedDraft;
  let tab;
  let confirmed = false;
  let cleared = 0;
  const { prepareDistributionInvoice } = panelFunctions(['prepareDistributionInvoice'], {
    cart: [{ id: 'old' }], submitting: false,
    window: { confirm: () => confirmed },
    clearCart: () => { cleared += 1; },
    setDistributionDraft: value => { storedDraft = value; },
    setCart: value => { cart = value; },
    setSelectedCustomerId() {}, setCustomerSearch() {}, setInvoiceType() {}, setEditingCartPriceId() {},
    setActiveTab: value => { tab = value; }
  }, path.join(__dirname, '..', 'app', 'page.tsx'));
  assert.equal(prepareDistributionInvoice(draft), false);
  assert.equal(cleared, 0);
  confirmed = true;
  assert.equal(prepareDistributionInvoice(draft), true);
  assert.equal(cleared, 1);
  assert.equal(storedDraft, draft);
  assert.equal(tab, 'POS');
  assert.equal(cart[0].id, 'l1');
  assert.equal(cart[0].qty, 3);
  assert.equal(cart[0].price, 75);
  assert.equal(cart[0].tax, 7.5);
  assert.equal(cart[0].isManualPrice, true);
});

test('cart checkout uses distribution API with receipt metadata rather than ordinary stock deduction', async () => {
  const requests = [];
  let saved;
  let cleared = 0;
  const alerts = [];
  const context = {
    cart: [{ id: 'l1', qty: 3, price: 75 }],
    products: [{ id: 'p1', stockQty: 3, reservedQty: 3 }],
    distributionDraft: {
      customerId: 'c1', documents: [{ id: 'd1', revision: 1 }],
      items: [{ distributionItemId: 'l1', quantity: 3 }]
    },
    submitting: false, selectedCustomer: { id: 'c1', name: 'Customer' },
    siteReceiptNumber: ' SITE-1 ', receiverName: ' Receiver ', purchaseOrderNumber: ' PO-1 ',
    invoiceType: 'فاتورة ضريبية', linkedQuotationId: null,
    currentUser: { role: 'ADMIN' }, distributionRequestId: { current: null },
    crypto: require('node:crypto').webcrypto,
    window: { electronAPI: { distributionOperation: async input => {
      requests.push(input);
      return { order: { id: 'order-1', qrCode: null } };
    } } },
    setSubmitting() {}, setInvoice: value => { saved = value; }, setShowQuotationPricing() {},
    setQrCodeUrl() {}, setShowModal() {},
    clearCart: () => { cleared += 1; }, fetchProducts() {}, fetchInvoices() {}, fetchCustomers() {},
    alert: value => alerts.push(value)
  };
  const { handleCheckout } = panelFunctions(['handleCheckout'], context, path.join(__dirname, '..', 'app', 'page.tsx'));
  await handleCheckout(false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, 'invoice');
  assert.equal(requests[0].siteReceiptNumber, 'SITE-1');
  assert.equal(requests[0].purchaseOrderNumber, 'PO-1');
  assert.equal(requests[0].receiverName, 'Receiver');
  assert.equal(requests[0].items[0].quantity, 3);
  assert.equal(saved.id, 'order-1');
  assert.equal(cleared, 1);
  assert.deepEqual(alerts, []);
});

function invoiceDatabase() {
  const items = [{
    id: 'l1', distributionId: 'd1', productId: 'p1', productLabel: 'Pipe',
    quantity: 8, shippedQuantity: 5, invoicedQuantity: 2, unitPrice: 100, taxRate: 0.14
  }, {
    id: 'l2', distributionId: 'd2', productId: 'p1', productLabel: 'Pipe',
    quantity: 4, shippedQuantity: 4, invoicedQuantity: 0, unitPrice: 150, taxRate: 0.14
  }];
  const documents = items.map((item, index) => ({
    id: item.distributionId, documentNumber: `DST-${index + 1}`,
    customerId: 'c1', customerName: 'Customer', revision: 1,
    status: index === 0 ? 'PARTIALLY_INVOICED' : 'SHIPPED', items: [item]
  }));
  const product = { id: 'p1', stockQty: 20, reservedQty: 10 };
  const orders = [{ id: 'old-order', totalAmount: 200 }];
  const invoices = [];
  const allocations = [];
  const revisions = [];
  const tx = {
    user: { findUnique: async () => ({ id: 'admin', name: 'Admin', role: 'ADMIN' }) },
    customer: { findUnique: async () => ({ id: 'c1', name: 'Customer' }) },
    distribution: {
      findUnique: async ({ where }) => structuredClone(documents.find(document => document.id === where.id)),
      update: async ({ where, data }) => Object.assign(documents.find(document => document.id === where.id), data)
    },
    distributionItem: {
      findUnique: async ({ where }) => structuredClone(items.find(item => item.id === where.id)),
      update: async ({ where, data }) => Object.assign(items.find(item => item.id === where.id), data)
    },
    product: {
      findUnique: async () => ({ ...product }),
      update: async ({ data }) => {
        product.stockQty -= data.stockQty.decrement;
        product.reservedQty -= data.reservedQty.decrement;
      }
    },
    order: {
      count: async () => orders.length,
      create: async ({ data }) => {
        const order = {
          ...data, id: `order-${orders.length}`,
          items: data.items.create.map((item, index) => ({ ...item, id: `oi-${index}` }))
        };
        orders.push(order);
        return structuredClone(order);
      }
    },
    distributionInvoice: {
      findUnique: async ({ where }) => {
        const invoice = invoices.find(record => record.requestId === where.requestId);
        return invoice ? { ...invoice, order: orders.find(order => order.id === invoice.orderId) } : null;
      },
      create: async ({ data }) => {
        const invoice = { ...data, id: `invoice-${invoices.length}` };
        invoices.push(invoice);
        return invoice;
      }
    },
    distributionInvoiceItem: { create: async ({ data }) => allocations.push(data) },
    distributionRevision: { create: async ({ data }) => revisions.push(data) },
    customerCeilingQuota: { findUnique: async () => null }
  };
  return { database: { $transaction: callback => callback(tx) }, documents, items, product, orders, allocations, revisions };
}

test('combined invoice creates one order and advances each distribution and its history exactly once', async () => {
  const state = invoiceDatabase();
  const { invoiceLines } = panelFunctions(['invoiceLines']);
  const input = {
    action: 'invoice', requestId: 'distribution-request-0001', invoiceType: 'فاتورة ضريبية',
    items: invoiceLines(state.documents),
    documents: state.documents.map(({ id, revision }) => ({ id, revision })),
    customerId: 'c1', siteReceiptNumber: 'SITE-123', receiverName: 'Receiver',
    purchaseOrderNumber: 'PO-456'
  };
  const result = await distributionOperation(state.database, 'admin', input);
  assert.equal(result.replayed, false);
  assert.equal(state.orders.length, 2);
  assert.equal(result.order.totalAmount, 900);
  assert.equal(result.order.taxAmount, 126);
  assert.equal(result.order.netAmount, 1026);
  assert.equal(result.order.siteReceiptNumber, 'SITE-123');
  assert.equal(result.order.purchaseOrderNumber, 'PO-456');
  assert.equal(result.order.receiverName, 'Receiver');
  assert.deepEqual(state.orders[0], { id: 'old-order', totalAmount: 200 });
  assert.equal(state.product.stockQty, 13);
  assert.equal(state.product.reservedQty, 3);
  assert.deepEqual(state.items.map(item => item.invoicedQuantity), [5, 4]);
  assert.deepEqual(state.documents.map(document => document.status), ['PARTIALLY_INVOICED', 'INVOICED']);
  assert.deepEqual(state.allocations.map(item => item.quantity), [3, 4]);
  assert.equal(state.allocations[0].distributionInvoiceId, state.allocations[1].distributionInvoiceId);
  assert.equal(JSON.parse(state.revisions[0].beforeSnapshot).items[0].invoicedQuantity, 2);
  assert.equal(JSON.parse(state.revisions[0].afterSnapshot).items[0].invoicedQuantity, 5);
  assert.equal(JSON.parse(state.revisions[1].beforeSnapshot).items[0].invoicedQuantity, 0);
  assert.equal(JSON.parse(state.revisions[1].afterSnapshot).items[0].invoicedQuantity, 4);
  const replay = await distributionOperation(state.database, 'admin', input);
  assert.equal(replay.replayed, true);
  assert.equal(state.orders.length, 2);
  assert.equal(state.product.stockQty, 13);
  await assert.rejects(distributionOperation(state.database, 'admin', {
    ...input, requestId: 'distribution-request-0002'
  }), /تغيرت التوزيعة/);
  await assert.rejects(distributionOperation(state.database, 'admin', {
    ...input, purchaseOrderNumber: 'DIFFERENT'
  }), /معرّف الطلب مستخدم/);
});

test('cart checkout rejects a distribution changed after preparing without writing an invoice', async () => {
  const state = invoiceDatabase();
  const { invoiceLines } = panelFunctions(['invoiceLines']);
  await assert.rejects(distributionOperation(state.database, 'admin', {
    action: 'invoice', requestId: 'distribution-request-0001', invoiceType: 'فاتورة',
    customerId: 'c1', documents: [{ id: 'd1', revision: 0 }, { id: 'd2', revision: 1 }],
    items: invoiceLines(state.documents)
  }), /تغيرت التوزيعة/);
  assert.equal(state.orders.length, 1);
  assert.equal(state.product.stockQty, 20);
});
test('combined invoice rejects different customers before creating an order', async () => {
  const state = invoiceDatabase();
  state.documents[1].customerId = 'c2';
  const { invoiceLines } = panelFunctions(['invoiceLines']);
  await assert.rejects(distributionOperation(state.database, 'admin', {
    action: 'invoice', requestId: 'distribution-request-0001', invoiceType: 'فاتورة',
    items: invoiceLines(state.documents)
  }), /العميل نفسه/);
  assert.equal(state.orders.length, 1);
  assert.equal(state.product.stockQty, 20);
});

test('distribution list includes the complete product details for printing and viewing', async () => {
  const result = await distributionOperation(databaseFor('ADMIN'), 'user-1', { action: 'list' });
  const item = result.documents[0].items[0];
  assert.deepEqual(item.productDetails, {
    code: 'P-1', barcode: '12345', name: 'صنف اختبار', type: 'مواسير',
    size: '20', gauge: 'ثقيل', color: 'أزرق', length: '6م', weight: '5كجم',
    supplierName: 'المورد الأول'
  });
  assert.equal(result.products[0].availableQty, 16);
});

test('distribution list hides all price fields from storekeepers', async () => {
  const result = await distributionOperation(databaseFor('STOREKEEPER'), 'user-1', { action: 'list' });
  const item = result.documents[0].items[0];
  assert.equal(Object.hasOwn(item, 'unitPrice'), false);
  assert.equal(Object.hasOwn(item, 'taxRate'), false);
  assert.equal(Object.hasOwn(item.productDetails, 'price'), false);
  assert.equal(Object.hasOwn(item.productDetails, 'taxRate'), false);
  assert.equal(Object.hasOwn(result.products[0], 'price'), false);
  assert.equal(Object.hasOwn(result.products[0], 'taxRate'), false);
  assert.equal(item.productDetails.supplierName, 'المورد الأول');
});

test('editing an approved distribution preserves prior activity, updates reservations and records revisions', async () => {
  const product = { id: 'p1', code: 'P1', name: 'Pipe', stockQty: 20, reservedQty: 6 };
  const item = {
    id: 'line-1', distributionId: 'd1', productId: 'p1', productLabel: 'Pipe',
    position: 0, quantity: 8, shippedQuantity: 3, invoicedQuantity: 2,
    unitPrice: 100, taxRate: 0.14, isCancelled: false
  };
  const document = {
    id: 'd1', documentNumber: 'DST-1', customerId: 'old-customer',
    customerName: 'Old customer', status: 'PARTIALLY_INVOICED', revision: 1,
    notes: '', items: [item]
  };
  const revisions = [];
  const tx = {
    user: { findUnique: async () => ({ id: 'admin', name: 'Admin', role: 'ADMIN' }) },
    customer: { findUnique: async () => ({ id: 'new-customer', name: 'New customer' }) },
    distribution: {
      findUnique: async () => structuredClone(document),
      update: async ({ data }) => Object.assign(document, data)
    },
    distributionItem: {
      update: async ({ data }) => Object.assign(item, data)
    },
    product: {
      findUnique: async () => ({ ...product }),
      update: async ({ data }) => { product.reservedQty += data.reservedQty.increment; }
    },
    distributionRevision: { create: async ({ data }) => revisions.push(data) }
  };
  const database = { $transaction: callback => callback(tx) };
  const payload = {
    action: 'save', id: 'd1', revision: 1, customerId: 'new-customer', notes: 'Updated',
    items: [{ productId: 'p1', quantity: 10, unitPrice: 150, taxRate: 0.1 }]
  };
  await distributionOperation(database, 'admin', payload);
  assert.equal(item.shippedQuantity, 3);
  assert.equal(item.invoicedQuantity, 2);
  assert.equal(item.quantity, 10);
  assert.equal(item.unitPrice, 150);
  assert.equal(product.reservedQty, 8);
  assert.equal(product.stockQty, 20);
  assert.equal(document.customerId, 'new-customer');
  assert.equal(document.revision, 2);
  assert.equal(document.notes, 'Updated');
  assert.equal(JSON.parse(revisions[0].beforeSnapshot).items[0].unitPrice, 100);
  assert.equal(JSON.parse(revisions[0].afterSnapshot).items[0].unitPrice, 150);
  await distributionOperation(database, 'admin', {
    ...payload, revision: 2, items: [{ ...payload.items[0], quantity: 3 }]
  });
  assert.equal(product.reservedQty, 1);
  assert.equal(item.shippedQuantity, 3);
  assert.equal(item.invoicedQuantity, 2);
  assert.equal(document.revision, 3);
  await assert.rejects(distributionOperation(database, 'admin', {
    ...payload, revision: 3, items: [{ ...payload.items[0], quantity: 2 }]
  }), /لا يمكن خفض كمية/);
  await assert.rejects(distributionOperation(database, 'admin', payload), /عُدلت التوزيعة/);
  await assert.rejects(distributionOperation(database, 'admin', {
    ...payload, revision: 3, items: [{ ...payload.items[0], quantity: 30 }]
  }), /المتاح/);
});

test('approved distributions open in operational mode and allow an explicit admin edit mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'DistributionPanel.tsx'), 'utf8');
  const tree = ts.createSourceFile('DistributionPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const snippets = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'editable') {
      snippets.push(`evaluate = (canEdit, selected, editing) => ${node.initializer.getText(tree)};`);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'selectDocument') {
      snippets.push(`select = ${node.initializer.getText(tree)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  let lines;
  let editing = true;
  const context = {
    canEdit: true, EMPTY_LINE: { productId: '', quantity: '', unitPrice: '', taxRate: '0.14' },
    setLines: value => { lines = value; }, setEditing: value => { editing = value; },
    setSelectedId() {}, setCustomerId() {}, setNotes() {}, setDispatchQuantities() {},
    setShowModal() {}, setError() {}
  };
  vm.runInNewContext(ts.transpileModule(snippets.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
  const document = { id: 'd1', status: 'APPROVED', items: [{ productId: 'p1', quantity: 5 }] };
  context.select(document);
  assert.equal(editing, false);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].productId, '');
  assert.equal(context.evaluate(true, document, false), false);
  assert.equal(context.evaluate(true, document, true), true);
  assert.equal(context.evaluate(false, document, true), false);
  assert.equal(context.evaluate(true, { status: 'DRAFT' }, false), true);
});

test('removing distribution rows keeps the remaining quantities and a trailing input row', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'DistributionPanel.tsx'), 'utf8');
  const tree = ts.createSourceFile('DistributionPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const script = ['EMPTY_LINE', 'removeLine']
    .map(name => `const ${declarations.get(name).getText(tree)};`).join('\n');
  let lines = [
    { productId: 'first', quantity: '3', unitPrice: '50', taxRate: '0.14' },
    { productId: 'second', quantity: '2', unitPrice: '100', taxRate: '0.14' },
    { productId: '', quantity: '', unitPrice: '', taxRate: '0.14' }
  ];
  const context = {
    setLines: update => { lines = update(lines); },
    setError: () => {},
    remove: null
  };
  vm.runInNewContext(ts.transpileModule(`${script}\nremove = removeLine;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);

  context.remove(0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].productId, 'second');
  assert.equal(lines[0].quantity, '2');
  assert.equal(lines[1].productId, '');
  context.remove(1);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].productId, '');
  context.remove(0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].productId, '');
});

test('individual distribution print puts document metadata outside compact product rows', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'DistributionPanel.tsx'), 'utf8');
  const tree = ts.createSourceFile('DistributionPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['printReport', 'detailValues', 'calculateTotals', 'roundMoney', 'statusLabels']);
  const snippets = [];
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree));
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.has(node.name.text)) {
      snippets.push(`const ${node.getText(tree)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const role of ['ADMIN', 'STOREKEEPER']) {
    let report;
    const context = {
      user: { role },
      products: [{ id: 'p1', availableQty: 7 }],
      onPrintTable: value => { report = value; },
      formatMoney: value => Number(value).toFixed(2),
      print: null
    };
    vm.runInNewContext(ts.transpileModule(`${snippets.join('\n')}\nprint = printReport;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText, context);
    context.print({
      documentNumber: 'DST-1', customerName: 'Customer', status: 'APPROVED',
      createdAt: '2026-11-19T10:00:00Z', notes: 'Notes',
      items: [{ productId: 'p1', productDetails: { code: 'P1', name: 'Pipe' },
        quantity: 2, unitPrice: 100, taxRate: 0.14 }]
    });
    assert.equal(report.metadata[0].value, 'DST-1');
    assert.equal(report.metadata[1].value, 'Customer');
    assert.equal(report.issuedAt, '2026-11-19T10:00:00Z');
    assert.equal(report.rows[0][0], 'P1 | Pipe');
    assert.equal(report.notes, 'Notes');
    if (role === 'ADMIN') {
      assert.equal(report.rows[0][1], 7);
      assert.equal(report.rows[0][2], 2);
      assert.equal(report.headers.length, 5);
      assert.equal(report.rows[0][4], '200.00');
      assert.equal(report.totals[2].value, '228.00 ج.م');
    } else {
      assert.equal(report.headers.length, 2);
      assert.equal(report.rows[0].length, 2);
      assert.equal(report.rows[0][1], 2);
      assert.equal(report.headers.includes('الكمية المتاحة'), false);
      assert.equal(report.totals, undefined);
    }
  }
});
