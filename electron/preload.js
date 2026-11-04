const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Native Prisma Database IPC bridges
  getProducts: () => ipcRenderer.invoke('get-products'),
  createProduct: (productData) => ipcRenderer.invoke('create-product', productData),
  updateProduct: (productData) => ipcRenderer.invoke('update-product', productData),
  
  getCustomers: () => ipcRenderer.invoke('get-customers'),
  createCustomer: (customerData) => ipcRenderer.invoke('create-customer', customerData),
  updateCustomer: (customerData) => ipcRenderer.invoke('update-customer', customerData),
  saveCustomerPrices: (data) => ipcRenderer.invoke('save-customer-prices', data),
  
  createOrder: (orderData) => ipcRenderer.invoke('create-order', orderData),
  createOrderReturn: (returnData) => ipcRenderer.invoke('create-order-return', returnData),
  createAccountDiscount: (discountData) => ipcRenderer.invoke('create-account-discount', discountData),
  getOrders: () => ipcRenderer.invoke('get-orders'),
  
  getBanks: () => ipcRenderer.invoke('get-banks'),
  createBank: (bankData) => ipcRenderer.invoke('create-bank', bankData),
  updateBank: (bankData) => ipcRenderer.invoke('update-bank', bankData),
  
  getPayments: () => ipcRenderer.invoke('get-payments'),
  createPayment: (paymentData) => ipcRenderer.invoke('create-payment', paymentData),
  
  getSuppliers: () => ipcRenderer.invoke('get-suppliers'),
  createSupplier: (supplierData) => ipcRenderer.invoke('create-supplier', supplierData),
  updateSupplier: (supplierData) => ipcRenderer.invoke('update-supplier', supplierData),
  
  getPurchases: () => ipcRenderer.invoke('get-purchases'),
  createPurchase: (purchaseData) => ipcRenderer.invoke('create-purchase', purchaseData),
  
  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  createExpense: (expenseData) => ipcRenderer.invoke('create-expense', expenseData),
  
  getExpenseCategories: () => ipcRenderer.invoke('get-expense-categories'),
  createExpenseCategory: (categoryData) => ipcRenderer.invoke('create-expense-category', categoryData),
  
  getGeneralExpenses: () => ipcRenderer.invoke('get-general-expenses'),
  createGeneralExpense: (expenseData) => ipcRenderer.invoke('create-general-expense', expenseData),
  
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  getUsers: () => ipcRenderer.invoke('get-users'),
  changePassword: (data) => ipcRenderer.invoke('change-password', data),
  
  getCustomerCeilings: (customerId) => ipcRenderer.invoke('get-customer-ceilings', customerId),
  createCustomerCeiling: (data) => ipcRenderer.invoke('create-customer-ceiling', data),
  deleteCustomerCeiling: (quotaId) => ipcRenderer.invoke('delete-customer-ceiling', quotaId),
  deleteOrder: (orderId) => ipcRenderer.invoke('delete-order', orderId),
});
