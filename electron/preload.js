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
  
  createOrder: (orderData) => ipcRenderer.invoke('create-order', orderData),
  getOrders: () => ipcRenderer.invoke('get-orders'),
  
  getBanks: () => ipcRenderer.invoke('get-banks'),
  createBank: (bankData) => ipcRenderer.invoke('create-bank', bankData),
  
  getPayments: () => ipcRenderer.invoke('get-payments'),
  createPayment: (paymentData) => ipcRenderer.invoke('create-payment', paymentData),
  
  getSuppliers: () => ipcRenderer.invoke('get-suppliers'),
  createSupplier: (supplierData) => ipcRenderer.invoke('create-supplier', supplierData),
  updateSupplier: (supplierData) => ipcRenderer.invoke('update-supplier', supplierData),
  
  getPurchases: () => ipcRenderer.invoke('get-purchases'),
  createPurchase: (purchaseData) => ipcRenderer.invoke('create-purchase', purchaseData),
  
  getExpenses: () => ipcRenderer.invoke('get-expenses'),
  createExpense: (expenseData) => ipcRenderer.invoke('create-expense', expenseData),
  
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  getUsers: () => ipcRenderer.invoke('get-users'),
  changePassword: (data) => ipcRenderer.invoke('change-password', data),
});
