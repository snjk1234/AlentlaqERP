"use client";

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  ShoppingCartIcon,
  TruckIcon,
  ShoppingBagIcon,
  ReceiptIcon, 
  SearchIcon, 
  Trash2Icon, 
  PauseCircleIcon,
  CheckCircle2Icon,
  PackageSearchIcon,
  PrinterIcon,
  FlameIcon,
  PipetteIcon,
  BoxIcon,
  Loader2Icon,
  XIcon,
  MinusIcon,
  SquareIcon,
  UsersIcon,
  PlusIcon,
  BuildingIcon,
  BanknoteIcon,
  FileTextIcon,
  PencilIcon,
  PackageIcon,
  TrendingUpIcon,
  DollarSignIcon,
  PercentIcon,
  LandmarkIcon
} from 'lucide-react';

const getProductImage = (type: string) => {
  switch (type) {
    case 'PIPE':
      return '/images/pipes.png';
    case 'HOSE':
      return '/images/hoses.png';
    case 'ACCESSORY':
      return '/images/accessories.png';
    default:
      return '/images/pipes.png';
  }
};

const getCategoryNameAr = (type: string) => {
  switch (type) {
    case 'PIPE':
      return 'مواسير UPVC';
    case 'HOSE':
      return 'خراطيم حريق';
    case 'ACCESSORY':
      return 'إكسسوارات وبواطات';
    default:
      return 'أخرى';
  }
};

const getCategoryBadgeClass = (type: string) => {
  switch (type) {
    case 'PIPE':
      return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
    case 'HOSE':
      return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    case 'ACCESSORY':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
  }
};

const getProductDescription = (type: string, name: string) => {
  if (type === 'PIPE') {
    return 'مواسير الإنطلاق UPVC مصنعة بأعلى معايير الجودة لمقاومة الصدمات والضغط الميكانيكي، ومصممة خصيصاً لتمديدات شبكات الكهرباء ومقاومة للأحماض والقلويات والحرائق.';
  } else if (type === 'HOSE') {
    return 'خراطيم الإنطلاق المرنة المقاومة للحريق ومصممة خصيصاً لتحمل درجات الحرارة العالية وسهولة الانحناء والتمديد داخل الجدران والأسقف الخرسانية والجبسية.';
  } else {
    return `إكسسوارات وقطع غيار ${name} من مصنع الانطلاق، مصنعة من مواد UPVC عالية الجودة والمضادة للحريق لضمان عزل وتوصيل آمن للمواسير والوصلات الكهربائية.`;
  }
};

export default function POSDashboard() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ userId: '', newPassword: '', confirmPassword: '' });

  const isRoleAllowed = (tab: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'ADMIN') return true;
    if (currentUser.role === 'CASHIER') {
      return ['POS', 'CUSTOMERS', 'INVOICES', 'PAYMENTS'].includes(tab);
    }
    if (currentUser.role === 'STOREKEEPER') {
      return ['INVENTORY', 'SUPPLIERS', 'PURCHASES'].includes(tab);
    }
    return false;
  };

  const [isMounted, setIsMounted] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [banks, setBanks] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState<any>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({ customerId: '', amount: '', bankId: '', reference: '', notes: '' });
  const [bankForm, setBankForm] = useState<{ id?: string; name: string; accountNumber: string; balance: string }>({ name: '', accountNumber: '', balance: '' });
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);

  
  // Suppliers, Purchases and Expenses states
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ id: '', name: '', phone: '', address: '', cr: '', trn: '', balance: '0' });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<any>({ billNumber: '', supplierId: '', items: [] });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });
  const [showExpenseReceiptModal, setShowExpenseReceiptModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [showSupplierHistoryModal, setShowSupplierHistoryModal] = useState(false);
  const [selectedHistorySupplier, setSelectedHistorySupplier] = useState<any>(null);
  const [showPurchaseDetailModal, setShowPurchaseDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [printTableData, setPrintTableData] = useState<{ title: string; headers: string[]; rows: any[][] } | null>(null);

  // Navigation active tab
  const [activeTab, setActiveTab] = useState<'POS' | 'CUSTOMERS' | 'INVENTORY' | 'BANKS' | 'PAYMENTS' | 'INVOICES' | 'SUPPLIERS' | 'PURCHASES' | 'EXPENSES'>('POS');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  
  // Search & Filter states
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('CASH');
  
  // Loading and submission states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<any[]>([]);

  // Invoice Modal states
  const [showModal, setShowModal] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  // Product Detail Modal states
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showProductModal, setShowProductModal] = useState(false);

  // Customer Form Modal states
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    id: '',
    name: '',
    phone: '',
    location: '',
    buildingsCount: '0',
    cr: '',
    trn: '',
    customerType: 'CASH',
    discount: '0'
  });

  // Product Form Modal states
  const [showProductFormModal, setShowProductFormModal] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    id: '',
    code: '',
    barcode: '',
    name: '',
    type: 'PIPE',
    size: '',
    gauge: '',
    color: '',
    length: '',
    weight: '',
    costPrice: '',
    markup: '30',
    price: '',
    stockQty: '',
    minStockQty: '10',
    maxStockQty: '1000'
  });

  // Fix hydration issues by setting mounted state
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        (window as any).electronAPI.getUsers()
          .then((users: any) => {
            if (Array.isArray(users) && users.length > 0) {
              setDbUsers(users);
            }
          })
          .catch(console.error);
      } else {
        // Browser mock users
        setDbUsers([
          { id: 'admin-id', username: 'admin', name: 'مدير النظام', role: 'ADMIN' },
          { id: 'cashier-id', username: 'cashier', name: 'كاشير الانطلاق', role: 'CASHIER' },
          { id: 'storekeeper-id', username: 'storekeeper', name: 'أمين المخزن', role: 'STOREKEEPER' }
        ]);
      }
    }
  }, [isMounted]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const user = await (window as any).electronAPI.login({ username: loginUsername, password: loginPassword });
        if (user) {
          setCurrentUser(user);
          if (user.role === 'CASHIER') {
            setActiveTab('POS');
          } else if (user.role === 'STOREKEEPER') {
            setActiveTab('INVENTORY');
          } else {
            setActiveTab('POS');
          }
        }
      } else {
        // Browser mockup auth
        if (loginUsername === 'admin' && loginPassword === 'pos62026') {
          setCurrentUser({ id: 'admin-id', username: 'admin', name: 'مدير النظام', role: 'ADMIN' });
          setActiveTab('POS');
        } else if (loginUsername === 'cashier' && loginPassword === '123456') {
          setCurrentUser({ id: 'cashier-id', username: 'cashier', name: 'كاشير الانطلاق', role: 'CASHIER' });
          setActiveTab('POS');
        } else if (loginUsername === 'storekeeper' && loginPassword === '123456') {
          setCurrentUser({ id: 'storekeeper-id', username: 'storekeeper', name: 'أمين المخزن', role: 'STOREKEEPER' });
          setActiveTab('INVENTORY');
        } else {
          setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة!');
        }
      }
    } catch (err: any) {
      setLoginError(err.message || 'خطأ أثناء تسجيل الدخول');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePasswordForm.userId || !changePasswordForm.newPassword || !changePasswordForm.confirmPassword) {
      alert('يرجى ملء جميع الحقول!');
      return;
    }
    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      alert('كلمتا المرور غير متطابقتين!');
      return;
    }
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.changePassword({ 
          userId: changePasswordForm.userId, 
          newPassword: changePasswordForm.newPassword 
        });
      }
      alert('تم تغيير كلمة المرور بنجاح!');
      setShowChangePasswordModal(false);
      setChangePasswordForm({ userId: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      alert(`خطأ أثناء تغيير كلمة المرور: ${err.message}`);
    }
  };

  // Fetch products from database

  const fetchBanks = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getBanks().then((data: any) => setBanks(data)).catch(console.error);
    } else {
      fetch('/api/banks')
        .then(res => res.json())
        .then(data => setBanks(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchPayments = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getPayments().then((data: any) => setPayments(data)).catch(console.error);
    } else {
      fetch('/api/payments')
        .then(res => res.json())
        .then(data => setPayments(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchInvoices = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getOrders().then((data: any) => setInvoices(data)).catch(console.error);
    } else {
      fetch('/api/orders')
        .then(res => res.json())
        .then(data => setInvoices(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };


  const fetchProducts = (isSilent = false) => {
    if (!isSilent) setLoading(true);
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getProducts()
        .then((data: any) => {
          setProducts(data);
          if (!isSilent) setLoading(false);
        })
        .catch((err: any) => {
          console.error(err);
          if (!isSilent) setLoading(false);
        });
    } else {
      fetch('/api/products')
        .then(res => res.json())
        .then(data => {
          setProducts(Array.isArray(data) ? data : []);
          if (!isSilent) setLoading(false);
        })
        .catch(err => {
          console.error(err);
          if (!isSilent) setLoading(false);
          // Fallback dummy products for web view
          setProducts(prev => prev.length > 0 ? prev : [
            { id: 'p1', code: '3020', barcode: '622001', name: 'ماسورة UPVC قطر 20مم فئة خفيفة', type: 'PIPE', gauge: 'Light', size: '20 mm', color: 'أبيض', costPrice: 12, price: 18, taxRate: 0.14, stockQty: 120, minStockQty: 10 },
            { id: 'p2', code: '3025', barcode: '622002', name: 'ماسورة UPVC قطر 25مم فئة متوسطة', type: 'PIPE', gauge: 'Medium', size: '25 mm', color: 'أبيض', costPrice: 16, price: 24, taxRate: 0.14, stockQty: 85, minStockQty: 10 },
            { id: 'p3', code: '5010', barcode: '622003', name: 'خرطوم حريق مرن مقاس 1 إنش طول 30م', type: 'HOSE', gauge: 'Heavy', size: '1 inch', color: 'أحمر', costPrice: 150, price: 210, taxRate: 0.14, stockQty: 15, minStockQty: 5 }
          ]);
        });
    }
  };

  // Fetch customers from database
  const fetchCustomers = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getCustomers()
        .then((data: any) => {
          setCustomers(data);
        })
        .catch((err: any) => {
          console.error(err);
        });
    } else {
      fetch('/api/customers')
        .then(res => res.json())
        .then(data => {
          setCustomers(Array.isArray(data) ? data : []);
        })
        .catch(err => {
          console.error(err);
          // Fallback dummy customers for web view
          setCustomers(prev => prev.length > 0 ? prev : [
            { id: 'cust-1', name: 'شركة المقاولون العرب', phone: '01012345678', email: 'info@arabco.com', address: 'القاهرة، مصر', trn: '310122345600003', orders: [] },
            { id: 'cust-2', name: 'أوراسكوم للإنشاءات', phone: '01298765432', email: 'contact@orascom.com', address: 'الجيزة، مصر', trn: '320011223300003', orders: [] },
            { id: 'cust-3', name: 'السويدي إليكتريك', phone: '01123456789', email: 'sales@elsewedy.com', address: 'العاشر من رمضان، مصر', trn: '330044556600003', orders: [] }
          ]);
        });
    }
  };

  const fetchSuppliers = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getSuppliers()
        .then((data: any) => setSuppliers(Array.isArray(data) ? data : []))
        .catch(console.error);
    } else {
      fetch('/api/suppliers')
        .then(res => res.json())
        .then(data => setSuppliers(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchPurchases = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getPurchases()
        .then((data: any) => setPurchases(Array.isArray(data) ? data : []))
        .catch(console.error);
    } else {
      fetch('/api/purchases')
        .then(res => res.json())
        .then(data => setPurchases(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchExpenses = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getExpenses()
        .then((data: any) => setExpenses(Array.isArray(data) ? data : []))
        .catch(console.error);
    } else {
      fetch('/api/expenses')
        .then(res => res.json())
        .then(data => setExpenses(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  useEffect(() => {
    if (isMounted) {
      fetchProducts();
      fetchCustomers();
      fetchBanks();
      fetchPayments();
      fetchInvoices();
      fetchSuppliers();
      fetchPurchases();
      fetchExpenses();
    }
  }, [isMounted]);

  // Clear all search queries when changing active tab
  useEffect(() => {
    setSearchQuery('');
    setInventorySearchQuery('');
    setCustomerSearch('');
    setSupplierSearch('');
    setPurchaseSearch('');
    setExpenseSearch('');
    setBankSearch('');
    setPaymentSearch('');
    setInvoiceSearch('');
  }, [activeTab]);

  // Periodic background polling every 5 seconds for real-time online updates
  useEffect(() => {
    if (!isMounted) return;
    const interval = setInterval(() => {
      fetchProducts(true); // silent refresh (no full-page loader spinner)
      fetchCustomers();
      fetchBanks();
      fetchPayments();
      fetchInvoices();
      fetchSuppliers();
      fetchPurchases();
      fetchExpenses();
    }, 5000);
    return () => clearInterval(interval);
  }, [isMounted]);

  // Apply customer default discount to all cart items when selected customer changes
  useEffect(() => {
    if (selectedCustomerId && customers.length > 0) {
      const customer = selectedCustomerId === 'CASH' ? null : customers.find(c => c.id === selectedCustomerId);
      const defaultDiscount = customer ? (customer.discount || 0) : 0;
      setCart(prev => {
        const needsUpdate = prev.some(item => item.discountPercent !== defaultDiscount);
        if (!needsUpdate) return prev;
        return prev.map(item => {
          const product = products.find(p => p.id === item.id);
          const taxRate = product ? product.taxRate : 0.14;
          const newPrice = item.originalPrice * (1 - defaultDiscount / 100);
          return { 
            ...item, 
            discountPercent: defaultDiscount, 
            price: newPrice, 
            tax: newPrice * taxRate 
          };
        });
      });
    }
  }, [selectedCustomerId, customers, products]);

  const addToCart = (product: any) => {
    if (product.stockQty <= 0) {
      alert("عذراً، هذا المنتج غير متوفر في المخزن حالياً!");
      return;
    }

    const customer = selectedCustomerId === 'CASH'
      ? null
      : customers.find(c => c.id === selectedCustomerId);
    const defaultDiscount = customer ? (customer.discount || 0) : 0;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stockQty) {
          alert("عذراً، لقد تجاوزت الكمية المتاحة في المخزن!");
          return prev;
        }
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      
      const discountedPrice = product.price * (1 - defaultDiscount / 100);
      return [...prev, { 
        id: product.id, 
        code: product.code,
        name: product.name,
        size: product.size,
        originalPrice: product.price,
        discountPercent: defaultDiscount,
        price: discountedPrice,
        tax: discountedPrice * product.taxRate,
        qty: 1
      }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    const product = products.find((p: any) => p.id === id);
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        if (delta > 0 && product && newQty > product.stockQty) {
          alert("عذراً، لقد تجاوزت الكمية المتاحة في المخزن!");
          return item;
        }
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateItemDiscount = (id: string, discountVal: number) => {
    const val = Math.min(100, Math.max(0, discountVal));
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const product = products.find(p => p.id === id);
        const taxRate = product ? product.taxRate : 0.14;
        const newPrice = item.originalPrice * (1 - val / 100);
        return {
          ...item,
          discountPercent: val,
          price: newPrice,
          tax: newPrice * taxRate
        };
      }
      return item;
    }));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalTax = cart.reduce((acc, item) => acc + (item.tax * item.qty), 0);
  const total = subtotal + totalTax;

  // Filter products by type and search query
  const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
    const matchesCategory = activeCategory === 'ALL' || p.type === activeCategory;
    const matchesSearch = (p.name || '').includes(searchQuery) || (p.code || '').includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  // Filter products by type and search query for Inventory tab
  const filteredInventoryProducts = (Array.isArray(products) ? products : []).filter(p => {
    const matchesCategory = inventoryCategory === 'ALL' || p.type === inventoryCategory;
    const matchesSearch = (p.name || '').includes(inventorySearchQuery) || (p.code || '').includes(inventorySearchQuery);
    return matchesCategory && matchesSearch;
  });

  // Filter customers by search query
  const filteredCustomers = (Array.isArray(customers) ? customers : []).filter(c => {
    const matchesSearch = (c.name || '').includes(customerSearch) || (c.trn && c.trn.includes(customerSearch));
    return matchesSearch;
  });

  const selectedCustomer = selectedCustomerId === 'CASH'
    ? { id: 'CASH', name: 'عميل نقدي', trn: null }
    : customers.find(c => c.id === selectedCustomerId);

  // Helper to generate a unique bill number for purchase invoices
  const generateBillNumber = () => `PUR-${Date.now()}`;

  // Handle Checkout (Invoice or Quotation)
  const handleCheckout = async (isQuotation: boolean) => {
    if (cart.length === 0) return;
    
    const hasUnpriced = cart.some(item => item.originalPrice <= 0);
    if (hasUnpriced) {
      alert("لا يمكن إتمام العملية! بعض الأصناف في السلة لم يتم تسعيرها من قبل المدير بعد.");
      return;
    }

    setSubmitting(true);

    const orderData = {
      customerName: selectedCustomer ? selectedCustomer.name : 'عميل نقدي',
      customerId: selectedCustomer && selectedCustomer.id !== 'CASH' ? selectedCustomer.id : null,
      isQuotation,
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.qty,
        unitPrice: item.price
      }))
    };

    try {
      let data;
      // Check if running inside Electron wrapper
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        data = await (window as any).electronAPI.createOrder(orderData);
      } else {
        // Fallback for browser preview
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData)
        });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to submit order');
      }

      setInvoice(data);
      
      // Generate QR Code if ZATCA compliant QR string exists in order
      if (data.qrCode) {
        const qrUrl = await QRCode.toDataURL(data.qrCode, { width: 160, margin: 1 });
        setQrCodeUrl(qrUrl);
      } else {
        setQrCodeUrl('');
      }

      setShowModal(true);
      clearCart();
      fetchProducts(); fetchInvoices(); // Refresh stock in UI
      fetchCustomers(); // Refresh customer stats
    } catch (err: any) {
      alert(`خطأ: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Customer Save handler
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name) {
      alert("يرجى إدخال اسم العميل!");
      return;
    }
    
    const formattedData = {
      ...customerForm,
      buildingsCount: parseInt(customerForm.buildingsCount) || 0,
      discount: parseFloat(customerForm.discount) || 0
    };
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        if (isEditingCustomer) {
          await (window as any).electronAPI.updateCustomer(formattedData);
        } else {
          const newCust = await (window as any).electronAPI.createCustomer(formattedData);
          // If created from POS cart flow, automatically select it!
          if (activeTab === 'POS' && newCust && newCust.id) {
            setSelectedCustomerId(newCust.id);
          }
        }
        setShowCustomerModal(false);
        fetchCustomers();
      } else {
        // Browser fallback: Make actual fetch call to DB!
        const response = await fetch('/api/customers', {
          method: isEditingCustomer ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedData)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Failed to save customer');
        fetchCustomers();
        if (activeTab === 'POS' && !isEditingCustomer && saved && saved.id) {
          setSelectedCustomerId(saved.id);
        }
        setShowCustomerModal(false);
      }
    } catch (err: any) {
      alert(`خطأ أثناء حفظ العميل: ${err.message}`);
    }
  };

  // Product Save handler
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.code || !productForm.name || !productForm.size || !productForm.price) {
      alert("يرجى ملء الحقول الأساسية: الكود، الاسم، المقاس، وسعر البيع!");
      return;
    }
    
    const formattedData = {
      ...productForm,
      costPrice: parseFloat(productForm.costPrice) || 0,
      markup: parseFloat(productForm.markup) || 1.3,
      price: parseFloat(productForm.price) || 0,
      stockQty: parseInt(productForm.stockQty) || 0,
      minStockQty: parseInt(productForm.minStockQty) || 10,
      maxStockQty: parseInt(productForm.maxStockQty) || 1000
    };
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        if (isEditingProduct) {
          await (window as any).electronAPI.updateProduct(formattedData);
        } else {
          await (window as any).electronAPI.createProduct(formattedData);
        }
        setShowProductFormModal(false);
        fetchProducts();
      } else {
        // Browser fallback: Make actual fetch call to DB!
        const response = await fetch('/api/products', {
          method: isEditingProduct ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedData)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Failed to save product');
        fetchProducts();
        setShowProductFormModal(false);
      }
    } catch (err: any) {
      alert(`خطأ أثناء حفظ المنتج: ${err.message}`);
    }
  };

  // Quick stock adjuster
  
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.name) return;
    setSubmitting(true);
    try {
      const data = { ...bankForm, balance: parseFloat(bankForm.balance) || 0 };
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.createBank(data);
        fetchBanks();
      } else {
        const response = await fetch('/api/banks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const savedBank = await response.json();
        if (!response.ok) throw new Error(savedBank.error || 'Failed to save bank');
        fetchBanks();
      }
      setIsBankModalOpen(false);
    } catch(err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.customerId || !paymentForm.bankId || !paymentForm.amount) return;
    setSubmitting(true);
    try {
      const data = { 
        customerId: paymentForm.customerId, 
        bankId: paymentForm.bankId, 
        amount: parseFloat(paymentForm.amount) || 0,
        reference: paymentForm.reference,
        notes: paymentForm.notes
      };
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const payment = await (window as any).electronAPI.createPayment(data);
        fetchPayments();
        fetchBanks();
        fetchCustomers();
        if (payment) {
          const cust = customers.find(c => c.id === paymentForm.customerId);
          const bank = banks.find(b => b.id === paymentForm.bankId);
          setSelectedReceipt({...payment, customer: cust, bank: bank});
          setShowReceiptModal(true);
        }
      } else {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const payment = await response.json();
        if (!response.ok) throw new Error(payment.error || 'Failed to save payment');
        fetchPayments();
        fetchBanks();
        fetchCustomers();
        const cust = customers.find(c => c.id === paymentForm.customerId);
        const bank = banks.find(b => b.id === paymentForm.bankId);
        setSelectedReceipt({...payment, customer: cust, bank: bank});
        setShowReceiptModal(true);
      }
      setIsPaymentModalOpen(false);
    } catch(err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name) {
      alert("يرجى إدخال اسم المورد!");
      return;
    }
    setSubmitting(true);
    const data = {
      ...supplierForm,
      balance: parseFloat(supplierForm.balance) || 0
    };
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        if (isEditingSupplier) {
          await (window as any).electronAPI.updateSupplier(data);
        } else {
          await (window as any).electronAPI.createSupplier(data);
        }
      } else {
        const response = await fetch('/api/suppliers', {
          method: isEditingSupplier ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Failed to save supplier');
      }
      fetchSuppliers();
      setShowSupplierModal(false);
    } catch (err: any) {
      alert(`خطأ أثناء حفظ المورد: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.billNumber || !purchaseForm.supplierId || purchaseForm.items.length === 0) {
      alert("يرجى ملء جميع الحقول وإضافة منتج واحد على الأقل!");
      return;
    }
    setSubmitting(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.createPurchase(purchaseForm);
      } else {
        const response = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(purchaseForm)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Failed to save purchase order');
      }
      fetchPurchases();
      fetchProducts();
      fetchSuppliers();
      setShowPurchaseModal(false);
      setPurchaseForm({ billNumber: '', supplierId: '', items: [] });
    } catch (err: any) {
      alert(`خطأ أثناء حفظ فاتورة الشراء: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.supplierId || !expenseForm.bankId || !expenseForm.amount) {
      alert("يرجى ملء جميع الحقول المطلوبة!");
      return;
    }
    setSubmitting(true);
    try {
      let saved;
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        saved = await (window as any).electronAPI.createExpense(expenseForm);
      } else {
        const response = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expenseForm)
        });
        saved = await response.json();
        if (!response.ok) throw new Error(saved.error || 'Failed to save expense payment');
      }
      fetchExpenses();
      fetchBanks();
      fetchSuppliers();
      setSelectedExpense(saved);
      setShowExpenseReceiptModal(true);
      setShowExpenseModal(false);
      setExpenseForm({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });
    } catch (err: any) {
      alert(`خطأ أثناء حفظ سند الصرف: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStockAdjust = async (product: any, delta: number) => {
    const newQty = product.stockQty + delta;
    if (newQty < 0) return;
    
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.updateProduct({ id: product.id, stockQty: newQty });
      } else {
        // Browser fallback: Make actual PUT call to DB!
        const response = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: product.id, stockQty: newQty })
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to adjust stock');
        }
      }
      fetchProducts();
    } catch (err: any) {
      alert(`خطأ أثناء تعديل المخزون: ${err.message}`);
    }
  };

  if (!isMounted) {
    return (
      <div className="flex h-screen bg-entlaq-darker text-slate-100 items-center justify-center">
        <Loader2Icon className="h-10 w-10 text-entlaq-red animate-spin" />
      </div>
    );
  }

  if (currentUser === null) {
    return (
      <div className="flex h-screen bg-slate-950 items-center justify-center font-sans overflow-hidden" dir="rtl">
        {/* Custom Titlebar (Window Controls) in Login page */}
        <div 
          className="fixed top-0 left-0 right-0 h-10 bg-slate-950 border-b border-white/5 flex items-center justify-between px-4 select-none z-50 no-print"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_2px_4px_rgba(218,41,28,0.3)]" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 15 C35 38 18 62 18 82" stroke="#da291c" strokeWidth="12" strokeLinecap="round" />
                <path d="M50 15 L80 82" stroke="#da291c" strokeWidth="12" strokeLinecap="round" />
                <path d="M10 58 C38 52 62 52 90 58" stroke="#da291c" strokeWidth="8" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-300">الإنطــلاق - نظام إدارة المبيعات والمخازن</span>
          </div>
          
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button 
              onClick={() => (window as any).electronAPI?.minimize()} 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <MinusIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => (window as any).electronAPI?.maximize()} 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <SquareIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => (window as any).electronAPI?.close()} 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Brand/Login Container */}
        <div className="w-[450px] bg-slate-900/40 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-white/5 rounded-2xl border border-white/10 shadow-lg p-2 flex items-center justify-center">
              <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-2xl font-black text-white">تسجيل الدخول</h2>
            <p className="text-xs text-slate-400 font-bold">مصنع خراطيم ومواسير الإنطلاق</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold block">نوع المستخدم</label>
              <select 
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-red transition-all cursor-pointer"
              >
                {dbUsers.map((u: any) => (
                  <option key={u.id} value={u.username}>{u.name} ({u.role === 'ADMIN' ? 'مدير' : u.role === 'CASHIER' ? 'كاشير' : 'أمين مخزن'})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-bold block">كلمة المرور</label>
              <input 
                type="password"
                placeholder="••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-red transition-all text-center tracking-widest"
                required
              />
            </div>

            {loginError && (
              <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl text-center">
                {loginError}
              </p>
            )}

            <button 
              type="submit"
              className="w-full bg-entlaq-red hover:bg-red-600 active:scale-95 text-white font-bold text-sm py-3.5 rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer"
            >
              دخول النظام
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-entlaq-darker text-slate-100 font-sans overflow-hidden selection:bg-red-500 selection:text-white pt-10" dir="rtl">
      
      {/* Custom Titlebar (Window Controls) */}
      <div 
        className="fixed top-0 left-0 right-0 h-10 bg-slate-950/90 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 select-none z-50 no-print"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_2px_4px_rgba(218,41,28,0.3)]" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 15 C35 38 18 62 18 82" stroke="#da291c" strokeWidth="12" strokeLinecap="round" />
              <path d="M50 15 L80 82" stroke="#da291c" strokeWidth="12" strokeLinecap="round" />
              <path d="M10 58 C38 52 62 52 90 58" stroke="#da291c" strokeWidth="8" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-300">الإنطــلاق - نظام إدارة المبيعات والمخازن</span>
        </div>
        
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button 
            onClick={() => (window as any).electronAPI?.minimize()} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => (window as any).electronAPI?.maximize()} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <SquareIcon className="w-3 h-3" />
          </button>
          <button 
            onClick={() => (window as any).electronAPI?.close()} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600/90 transition-colors cursor-pointer"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <div className="w-56 glass-panel border-l border-white/10 flex flex-col p-3 space-y-3.5 m-1.5 rounded-xl z-10 shrink-0 no-print">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3 pb-6 border-b border-white/5">
          <div className="relative w-12 h-12 flex items-center justify-center bg-white/5 rounded-xl border border-white/10 shadow-lg p-1 group hover:border-red-500/30 transition-all duration-300">
            <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-wide">الإنطــلاق</h1>
            <p className="text-[10px] text-slate-400 font-bold">مصنع خراطيم ومواسير</p>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 flex flex-col space-y-2">
          {isRoleAllowed('POS') && (
            <button 
              onClick={() => setActiveTab('POS')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'POS' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <ShoppingCartIcon className="h-5 w-5" />
              <span>نقطة البيع</span>
            </button>
          )}
          
          {isRoleAllowed('CUSTOMERS') && (
            <button 
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'CUSTOMERS' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <UsersIcon className="h-5 w-5" />
              <span>العملاء والشركات</span>
            </button>
          )}
          
          {isRoleAllowed('INVENTORY') && (
            <button 
              onClick={() => setActiveTab('INVENTORY')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'INVENTORY' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <PackageIcon className="h-5 w-5" />
              <span>إدارة المخزن والأسعار</span>
            </button>
          )}
        
          {isRoleAllowed('BANKS') && (
            <button 
              onClick={() => setActiveTab('BANKS')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'BANKS' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <BuildingIcon className="h-5 w-5" />
              <span>البنوك والخزائن</span>
            </button>
          )}
          
          {isRoleAllowed('PAYMENTS') && (
            <button 
              onClick={() => setActiveTab('PAYMENTS')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'PAYMENTS' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <BanknoteIcon className="h-5 w-5" />
              <span>سداد / دفعات</span>
            </button>
          )}
          
          {isRoleAllowed('SUPPLIERS') && (
            <button 
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'SUPPLIERS' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <TruckIcon className="h-5 w-5" />
              <span>إدارة الموردين</span>
            </button>
          )}

          {isRoleAllowed('PURCHASES') && (
            <button 
              onClick={() => setActiveTab('PURCHASES')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'PURCHASES' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <ShoppingBagIcon className="h-5 w-5" />
              <span>فاتورة مشتريات (وارد)</span>
            </button>
          )}

          {isRoleAllowed('EXPENSES') && (
            <button 
              onClick={() => setActiveTab('EXPENSES')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'EXPENSES' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <ReceiptIcon className="h-5 w-5" />
              <span>سندات الصرف (مصروف)</span>
            </button>
          )}
  
          {isRoleAllowed('INVOICES') && (
            <button onClick={() => setActiveTab('INVOICES')}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all duration-300 cursor-pointer ${activeTab === 'INVOICES' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <FileTextIcon className="h-5 w-5" />
              <span>الفواتير وعروض الأسعار</span>
            </button>
          )}
        </div>

        {/* User Info & Actions */}
        <div className="pt-3 border-t border-white/5 space-y-2">
          <div className="flex flex-col px-3 py-2 bg-white/5 rounded-xl border border-white/5">
            <span className="text-xs font-black text-white">{currentUser?.name}</span>
            <span className="text-[9px] text-slate-400 font-bold mt-0.5">
              {currentUser?.role === 'ADMIN' ? 'مدير النظام' : currentUser?.role === 'CASHIER' ? 'كاشير' : 'أمين المخزن'}
            </span>
          </div>

          <div className="flex gap-1.5">
            <button 
              onClick={() => {
                setChangePasswordForm({ userId: currentUser.id, newPassword: '', confirmPassword: '' });
                setShowChangePasswordModal(true);
              }}
              className="flex-1 text-[10px] bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 font-bold py-2 rounded-xl text-center cursor-pointer transition-all"
            >
              كلمة المرور
            </button>
            <button 
              onClick={() => setCurrentUser(null)}
              className="flex-1 text-[10px] bg-red-950/40 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-400 font-bold py-2 rounded-xl text-center cursor-pointer transition-all"
            >
              خروج
            </button>
          </div>
        </div>

        {/* Footer Info */}
        <div className="pt-2 border-t border-white/5 text-[9px] text-slate-500 text-center font-mono">
          <span>الإصدار 1.2.0</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden" dir="rtl">
        
        {/* TAB 1: POS DASHBOARD */}
        {activeTab === 'POS' && (
          <React.Fragment>
            {/* Products & Search Section */}
            <div className="flex-1 flex flex-col p-3 space-y-3 no-print">
              
              {/* Header Search */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h1 className="text-xl font-bold text-white tracking-wide">صالة المنتجات والمبيعات</h1>
                  <p className="text-xs text-slate-400">اختر من المنتجات أدناه لإدراجها في الفاتورة أو عرض السعر</p>
                </div>
                
                {/* Search Bar */}
                <div className="relative group w-1/2">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <SearchIcon className="h-5 w-5 text-slate-400 group-focus-within:text-entlaq-red transition-colors" />
                  </div>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن منتج بالاسم أو الكود (مثال: 3020)..." 
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-12 pl-10 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent transition-all shadow-lg"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <XIcon size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Categories Navigation */}
              <div className="flex gap-3 mb-2">
                <button 
                  onClick={() => setActiveCategory('ALL')}
                  className={`px-6 py-2.5 rounded-full font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === 'ALL' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  <PackageSearchIcon size={18} /> الكل
                </button>
                <button 
                  onClick={() => setActiveCategory('PIPE')}
                  className={`px-6 py-2.5 rounded-full font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === 'PIPE' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  <PipetteIcon size={18} /> مواسير UPVC
                </button>
                <button 
                  onClick={() => setActiveCategory('HOSE')}
                  className={`px-6 py-2.5 rounded-full font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === 'HOSE' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  <FlameIcon size={18} /> خراطيم حريق
                </button>
                <button 
                  onClick={() => setActiveCategory('ACCESSORY')}
                  className={`px-6 py-2.5 rounded-full font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === 'ACCESSORY' ? 'bg-entlaq-red text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  <BoxIcon size={18} /> إكسسوارات وبواطات
                </button>
              </div>

              {/* Product Grid */}
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <Loader2Icon className="h-10 w-10 text-entlaq-red animate-spin" />
                  <p className="text-slate-400 text-xs">جاري تحميل بيانات المخزون...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pb-10 custom-scrollbar pr-2 flex-1">
                  {filteredProducts.map((item) => {
                    const isLowStock = item.stockQty <= item.minStockQty;
                    const isOutOfStock = item.stockQty <= 0;
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          setSelectedProduct(item);
                          setShowProductModal(true);
                        }}
                        className={`glass-card rounded-xl p-2.5 cursor-pointer group flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:border-red-500/20 ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden mb-3 bg-black/20 border border-white/5">
                          <img 
                            src={getProductImage(item.type)} 
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                          />
                          {isLowStock && !isOutOfStock && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 bg-amber-500/90 text-slate-900 rounded-lg text-[10px] font-bold animate-pulse">
                              منخفض
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-600/90 text-white rounded-lg text-[10px] font-bold">
                              نافذ
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-mono text-slate-400">كود: {item.code}</span>
                              <div className="flex items-center gap-1 select-none">
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${getCategoryBadgeClass(item.type)}`}>
                                  {getCategoryNameAr(item.type)}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 bg-white/10 text-slate-300 rounded font-bold">{item.size}</span>
                              </div>
                            </div>
                            <h3 className="text-xs font-bold text-slate-200 mb-1 leading-tight line-clamp-2 min-h-[36px]">{item.name}</h3>
                            <p className="text-[10px] text-slate-400">
                              المخزون:{' '}
                              <span className={`font-mono font-bold ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-500 animate-pulse' : 'text-emerald-400'}`}>
                                {item.stockQty} {isOutOfStock ? '(نافذ)' : ''}
                              </span>
                            </p>
                          </div>
                          <div className="flex justify-between items-center mt-3 border-t border-white/5 pt-3">
                            <span className="text-base font-black text-white">{item.price.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">ج.م</span></span>
                            <button 
                              disabled={isOutOfStock}
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(item);
                              }}
                              className="bg-red-500/10 text-red-500 p-2 rounded-xl hover:bg-entlaq-red hover:text-white transition-all shadow-sm disabled:opacity-50 disabled:hover:bg-red-500/10 disabled:hover:text-red-500 cursor-pointer"
                              title="إضافة إلى السلة"
                            >
                              <ShoppingCartIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart Panel (Left Side in POS) */}
            <div className="w-[360px] glass-panel border-r-0 border-l border-white/10 flex flex-col shadow-2xl relative z-10 m-1.5 rounded-xl overflow-hidden no-print">
              
              {/* Cart Header */}
              <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                    <PrinterIcon className="h-6 w-6 text-entlaq-red" />
                    المبيعات والعروض
                  </h2>
                  <div className="flex items-center gap-2 mt-2 select-none">
                    <span className="text-xs text-slate-400 font-semibold">العميل:</span>
                    <select 
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 cursor-pointer font-bold"
                    >
                      <option value="CASH">👤 عميل نقدي</option>
                      {customers.map((c: any) => (
                        <option key={c.id} value={c.id}>🏢 {c.name}</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => {
                        setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0' });
                        setIsEditingCustomer(false);
                        setShowCustomerModal(true);
                      }}
                      className="bg-white/5 border border-white/10 p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="إضافة عميل جديد سريعا"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button 
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="text-slate-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-400/10 disabled:opacity-40 cursor-pointer"
                  title="تفريغ السلة بالكامل"
                >
                  <Trash2Icon className="h-6 w-6" />
                </button>
              </div>

              {/* Cart Items */}
              {cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <ShoppingCartIcon className="h-16 w-16 text-slate-600 animate-pulse" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-300">سلة المبيعات فارغة</h3>
                    <p className="text-sm text-slate-500 mt-1">اضغط على أي صنف لإضافته إلى الفاتورة</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
                  {cart.map((item) => (
                    <div key={item.id} className="bg-slate-800/40 border border-white/5 rounded-lg p-2.5 flex gap-2.5 hover:border-white/10 transition-colors">
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <h4 className="font-bold text-slate-200 mb-1 text-sm">{item.name}</h4>
                            <span className="text-xs px-2 py-0.5 bg-white/10 rounded text-slate-300 font-mono font-bold">{item.size}</span>
                        </div>
                        {item.originalPrice <= 0 && (
                          <div className="mt-1.5 mb-1 text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded-lg text-center">
                            ⚠️ لم يتم وضع التسعير من المدير بعد!
                          </div>
                        )}

                        {/* Editable Discount Section */}
                        <div className="flex items-center gap-3 mt-1.5 select-none">
                          <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">
                            <span className="text-[10px] text-slate-400 font-bold">خصم:</span>
                            <input 
                              type="number"
                              value={item.discountPercent !== undefined ? item.discountPercent : 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateItemDiscount(item.id, isNaN(val) ? 0 : val);
                              }}
                              className="bg-transparent text-white font-mono text-xs w-8 text-center focus:outline-none focus:bg-white/5 rounded font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              min="0"
                              max="100"
                              step="0.1"
                            />
                            <span className="text-[10px] text-slate-400 font-bold">%</span>
                          </div>
                          {item.discountPercent > 0 && (
                            <span className="text-[10px] text-slate-500 line-through font-mono">
                              {(item.originalPrice * item.qty).toFixed(2)} ج.م
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-center mt-2">
                          <span className="text-entlaq-red font-bold font-mono text-sm">{(item.price * item.qty).toFixed(2)} ج.م</span>
                          <button 
                            onClick={() => removeFromCart(item.id)}
                            className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-between bg-black/30 rounded-xl p-1 w-12">
                        <button 
                          onClick={() => updateQty(item.id, 1)}
                          className="w-8 h-6 flex items-center justify-center text-slate-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                        >
                          +
                        </button>
                        <input 
                          type="number"
                          value={item.qty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 1) {
                              const product = products.find(p => p.id === item.id);
                              if (product && val > product.stockQty) {
                                alert("عذراً، لقد تجاوزت الكمية المتاحة في المخزن!");
                                return;
                              }
                              setCart(prev => prev.map(c => c.id === item.id ? { ...c, qty: val } : c));
                            } else if (e.target.value === "") {
                              setCart(prev => prev.map(c => c.id === item.id ? { ...c, qty: "" as any } : c));
                            }
                          }}
                          onBlur={() => {
                            if (item.qty === "" || isNaN(item.qty)) {
                              setCart(prev => prev.map(c => c.id === item.id ? { ...c, qty: 1 } : c));
                            }
                          }}
                          className="w-10 text-center font-bold text-white bg-transparent font-mono focus:outline-none focus:bg-white/5 rounded text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button 
                          onClick={() => updateQty(item.id, -1)}
                          className="w-8 h-6 flex items-center justify-center text-slate-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                        >
                          -
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cart Summary */}
              <div className="p-4 bg-black/40 border-t border-white/10 space-y-3 backdrop-blur-xl">
                <div className="flex justify-between text-slate-400 font-mono text-xs">
                  <span>المجموع (غير شامل الضريبة)</span>
                  <span>{subtotal.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-slate-400 font-mono text-xs">
                  <span>ضريبة القيمة المضافة (14%)</span>
                  <span>{totalTax.toFixed(2)} ج.م</span>
                </div>
                
                <div className="h-px bg-white/10 w-full my-1"></div>
                
                <div className="flex justify-between items-end mb-4">
                  <span className="text-sm font-bold text-slate-200">الإجمالي المستحق</span>
                  <span className="text-2xl font-black text-white font-mono">
                    {total.toFixed(2)} <span className="text-xs font-normal text-slate-400">ج.م</span>
                  </span>
                </div>

                {/* Checkout Actions */}
                {/* Checkout Actions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button 
                    disabled={cart.length === 0 || submitting || cart.some(item => item.originalPrice <= 0)}
                    onClick={() => handleCheckout(true)}
                    className="bg-white/5 text-white border border-white/10 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-300 cursor-pointer"
                  >
                    {submitting ? <Loader2Icon className="animate-spin h-4 w-4" /> : <PauseCircleIcon className="h-5 w-5" />}
                    حفظ كعرض سعر
                  </button>
                  <button 
                    disabled={cart.length === 0 || submitting || cart.some(item => item.originalPrice <= 0)}
                    onClick={() => handleCheckout(false)}
                    className="bg-entlaq-red text-white shadow-lg shadow-red-500/30 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-red-600 hover:scale-[1.02] disabled:opacity-40 disabled:hover:bg-entlaq-red disabled:hover:scale-100 transition-all duration-300 cursor-pointer"
                  >
                    {submitting ? <Loader2Icon className="animate-spin h-4 w-4" /> : <CheckCircle2Icon className="h-5 w-5" />}
                    إصدار فاتورة
                  </button>
                </div>
              </div>
            </div>
          </React.Fragment>
        )}

        {/* TAB 2: CUSTOMERS TAB */}
        {activeTab === 'CUSTOMERS' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-white">إدارة العملاء والشركات</h2>
              <p className="text-xs text-slate-400 mt-0.5">إدارة بيانات العملاء والشركات ومتابعة فواتيرهم وحساباتهم</p>
            </div>

            {/* Search & Add Row */}
            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="ابحث عن العميل بالاسم أو الرقم الضريبي..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {customerSearch && (
                  <button 
                    onClick={() => setCustomerSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0' });
                  setIsEditingCustomer(false);
                  setShowCustomerModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>إضافة عميل جديد</span>
              </button>
              <button 
                onClick={() => {
                  setPrintTableData({
                    title: 'كشف بيانات وعناوين العملاء والشركات المسجلين',
                    headers: ['م', 'اسم العميل', 'النوع', 'رقم الهاتف', 'العنوان', 'الرقم الضريبي', 'السجل التجاري', 'عدد العمارات'],
                    rows: filteredCustomers.map((c, i) => [
                      i + 1,
                      c.name,
                      c.customerType === 'CREDIT' ? 'آجل' : 'نقدي',
                      c.phone || '-',
                      c.location || '-',
                      c.trn || '-',
                      c.cr || '-',
                      c.buildingsCount
                    ])
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>طباعة الجدول</span>
              </button>
            </div>

            {/* Customer Cards Grid */}
            <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar pr-2">
              {filteredCustomers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <UsersIcon className="h-16 w-16 text-slate-600" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-300">لا يوجد عملاء متطابقين</h3>
                    <p className="text-sm text-slate-500 mt-1">أضف عميل جديد لبدء تسجيل الفواتير باسمه</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredCustomers.map((cust) => {
                    const validOrders = cust.orders ? cust.orders.filter((o:any) => !o.isQuotation) : [];
                    const totalSpent = validOrders.reduce((sum: number, o: any) => sum + o.netAmount, 0);
                    const totalPayments = cust.payments ? cust.payments.reduce((sum: number, p: any) => sum + p.amount, 0) : 0;
                    const paymentsCount = cust.payments ? cust.payments.length : 0;
                    const ordersCount = validOrders.length;
                    const remainingBalance = totalSpent - totalPayments;
                    return (
                      <div key={cust.id} className="glass-card rounded-xl p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-[15px] font-bold text-white leading-snug">{cust.name}</h3>
                              <div className="flex items-center gap-1 mt-1 select-none">
                                <span className={`px-1.5 py-0.2 rounded text-[11px] font-bold ${cust.customerType === 'CREDIT' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                                  {cust.customerType === 'CREDIT' ? 'آجل' : 'نقدي'}
                                </span>
                                {cust.discount > 0 && (
                                  <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded text-[11px] font-bold">
                                    خصم {cust.discount}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                setCustomerForm({
                                  id: !!cust.id ? cust.id : '',
                                  name: cust.name,
                                  phone: cust.phone || '',
                                  location: cust.location || '',
                                  buildingsCount: cust.buildingsCount ? cust.buildingsCount.toString() : '0',
                                  cr: cust.cr || '',
                                  trn: cust.trn || '',
                                  customerType: cust.customerType || 'CASH',
                                  discount: cust.discount ? cust.discount.toString() : '0'
                                });
                                setIsEditingCustomer(true);
                                setShowCustomerModal(true);
                              }}
                              className="bg-white/5 text-slate-400 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                              title="تعديل البيانات"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-300 mb-2 border-t border-white/5 pt-2 font-semibold">
                            {cust.phone && <p>📱 <span className="text-white font-mono font-bold">{cust.phone}</span></p>}
                            {cust.location && <p>📍 <span className="text-white">{cust.location}</span></p>}
                            <p>🏢 عماير: <span className="text-white font-mono font-bold">{cust.buildingsCount || 0}</span></p>
                            {cust.cr && <p>📜 سجل: <span className="text-white font-mono font-bold">{cust.cr}</span></p>}
                            {cust.trn && <p className="col-span-2">📋 ضريبي: <span className="text-white font-mono font-bold text-xs">{cust.trn}</span></p>}
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-2">
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">الفواتير</span>
                              <span className="text-sm font-black text-white font-mono">{ordersCount}</span>
                            </div>
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">الدفعات</span>
                              <span className="text-sm font-black text-white font-mono">{paymentsCount}</span>
                            </div>
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">إجمالي المسحوبات</span>
                              <span className="text-sm font-black text-red-400 font-mono">{totalSpent.toFixed(2)} ج.م</span>
                            </div>
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">إجمالي الدفعات</span>
                              <span className="text-sm font-black text-emerald-400 font-mono">{totalPayments.toFixed(2)} ج.م</span>
                            </div>
                            <div className="col-span-2 bg-black/25 px-2 py-2 rounded-lg text-center border border-white/5">
                              <span className="text-[10px] text-slate-400 block font-bold">الرصيد المتبقي (المديونية)</span>
                              <span className={`text-base font-black font-mono ${remainingBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {remainingBalance.toFixed(2)} ج.م
                              </span>
                            </div>
                            <button
                                onClick={() => {
                                  setSelectedHistoryCustomer(cust);
                                  setShowCustomerHistoryModal(true);
                                }}
                                className="col-span-2 bg-white/5 text-slate-300 p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-xs font-bold mt-1 shadow-md shadow-black/20"
                              >
                                كشف حساب / تفاصيل
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: INVENTORY TAB */}
        {activeTab === 'INVENTORY' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-white">إدارة المخزن والأسعار</h2>
              <p className="text-xs text-slate-400 mt-0.5">مراقبة كميات البضائع، تعديل الأسعار، ومقارنة تكلفة الإنتاج بالبيع وحساب الأرباح</p>
            </div>

            {/* Filter, Search & Add Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Search & Add row */}
              <div className="flex gap-3 items-center w-full max-w-md">
                <div className="relative group flex-1">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                    <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                  </div>
                  <input 
                    type="text" 
                    value={inventorySearchQuery}
                    onChange={(e) => setInventorySearchQuery(e.target.value)}
                    placeholder="ابحث عن منتج بالاسم أو الكود..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                  />
                  {inventorySearchQuery && (
                    <button 
                      onClick={() => setInventorySearchQuery('')}
                      className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
                
                <button 
                  onClick={() => {
                    setProductForm({
                      id: '',
                      code: '',
                      barcode: '',
                      name: '',
                      type: 'PIPE',
                      size: '',
                      gauge: '',
                      color: '',
                      length: '',
                      weight: '',
                      costPrice: '',
                      markup: '30',
                      price: '',
                      stockQty: '',
                      minStockQty: '10',
                      maxStockQty: '1000'
                    });
                    setIsEditingProduct(false);
                    setShowProductFormModal(true);
                  }}
                  className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>إضافة منتج جديد</span>
                </button>
                <button 
                  onClick={() => {
                    setPrintTableData({
                      title: 'كشف جرد المخزون والأسعار الحالي',
                      headers: ['م', 'كود الصنف', 'اسم المنتج', 'المقاس', 'اللون', 'سعر البيع', 'المخزون الحالي'],
                      rows: filteredInventoryProducts.map((p, i) => [
                        i + 1,
                        p.code,
                        p.name,
                        p.size,
                        p.color || '-',
                        `${p.price.toFixed(2)} ج.م`,
                        p.stockQty
                      ])
                    });
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
                >
                  <PrinterIcon className="w-4 h-4" />
                  <span>طباعة الجدول</span>
                </button>
              </div>

              {/* Categories Navigation */}
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto py-1">
                <button 
                  onClick={() => setInventoryCategory('ALL')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === 'ALL' ? 'bg-entlaq-red text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  الكل
                </button>
                <button 
                  onClick={() => setInventoryCategory('PIPE')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === 'PIPE' ? 'bg-entlaq-red text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  مواسير UPVC
                </button>
                <button 
                  onClick={() => setInventoryCategory('HOSE')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === 'HOSE' ? 'bg-entlaq-red text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  خراطيم حريق
                </button>
                <button 
                  onClick={() => setInventoryCategory('ACCESSORY')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === 'ACCESSORY' ? 'bg-entlaq-red text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  إكسسوارات وبواطات
                </button>
              </div>
            </div>

            {/* Products Bento Cards Grid */}
            <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar pr-2">
              {filteredInventoryProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <PackageIcon className="h-16 w-16 text-slate-600" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-300">لا توجد منتجات متطابقة</h3>
                    <p className="text-sm text-slate-500 mt-1">أضف منتج جديد لتسجيله في المخزن</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredInventoryProducts.map((p) => {
                    const isLowStock = p.stockQty <= p.minStockQty;
                    const isOutOfStock = p.stockQty <= 0;
                    return (
                      <div key={p.id} className="glass-card rounded-xl p-2.5 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">
                        <div>
                          {/* Card Header: Code, Category, Edit */}
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs px-1.5 py-0.5 bg-white/10 text-slate-300 rounded font-bold font-mono">
                                #{p.code}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${getCategoryBadgeClass(p.type)}`}>
                                {getCategoryNameAr(p.type)}
                              </span>
                            </div>
                            <button 
                              onClick={() => {
                                setProductForm({
                                  id: p.id,
                                  code: p.code,
                                  barcode: p.barcode || '',
                                  name: p.name,
                                  type: p.type,
                                  size: p.size,
                                  gauge: p.gauge || '',
                                  color: p.color || '',
                                  length: p.length || '',
                                  weight: p.weight || '',
                                  costPrice: p.costPrice.toString(),
                                  markup: p.markup !== undefined && p.markup !== null ? p.markup.toString() : '30',
                                  price: p.price.toString(),
                                  stockQty: p.stockQty.toString(),
                                  minStockQty: p.minStockQty.toString(),
                                  maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000'
                                });
                                setIsEditingProduct(true);
                                setShowProductFormModal(true);
                              }}
                              className="bg-white/5 text-slate-400 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                              title="تعديل الصنف"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Product Name */}
                          <h3 className="text-sm font-bold text-white mb-2 leading-tight min-h-[32px]">{p.name}</h3>

                          {/* Specs Grid */}
                          <div className="grid grid-cols-3 gap-1 text-xs text-slate-300 bg-black/10 p-1.5 rounded-lg mb-2 font-semibold">
                            <div>اللون: <span className="text-white font-black block">{p.color || '-'}</span></div>
                            <div>المقاس: <span className="text-white font-black font-mono block">{p.size}</span></div>
                            <div>الطول/الوزن: <span className="text-white font-black font-mono block">{(p.length || p.weight) ? `${p.length || ''} ${p.weight || ''}`.trim() : '-'}</span></div>
                          </div>

                          {/* Financials Grid */}
                          <div className="grid grid-cols-3 gap-1 text-xs mb-2.5">
                            <div className="bg-white/5 p-1 rounded text-center">
                              <span className="text-slate-400 block text-[10px] font-bold">الشراء</span>
                              <span className="font-black font-mono text-slate-200">
                                {currentUser?.role === 'ADMIN' ? `${p.costPrice.toFixed(2)}` : '-'}
                              </span>
                            </div>
                            <div className="bg-white/5 p-1 rounded text-center">
                              <span className="text-slate-400 block text-[10px] font-bold">النسبة</span>
                              <span className="font-black font-mono text-amber-400">
                                {currentUser?.role === 'ADMIN' ? `%${p.markup !== undefined && p.markup !== null ? p.markup.toFixed(1) : '30'}` : '-'}
                              </span>
                            </div>
                            <div className="bg-white/5 p-1 rounded text-center">
                              <span className="text-slate-400 block text-[10px] font-bold">البيع</span>
                              <span className="font-black font-mono text-emerald-400">{p.price.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Stock Quantity Controls */}
                        <div className="border-t border-white/5 pt-2 flex items-center justify-between">
                          <div className="flex flex-col select-none">
                            <span className="text-[10px] text-slate-400 font-bold">المخزون الحالي</span>
                            <span className={`font-mono font-black text-sm ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-500' : 'text-emerald-400'}`}>
                              {p.stockQty} وحدة {isLowStock && '(منخفض)'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleQuickStockAdjust(p, -5)}
                              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition-colors cursor-pointer"
                            >
                              -5
                            </button>
                            <button 
                              onClick={() => handleQuickStockAdjust(p, 5)}
                              className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition-colors cursor-pointer"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      

        
        {/* TAB 7: SUPPLIERS */}
        {activeTab === 'SUPPLIERS' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">إدارة الموردين</h2>
              <p className="text-xs text-slate-400 mt-0.5">إدارة بيانات الموردين ومتابعة فواتير الشراء المستلمة والمدفوعات الصادرة لهم</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="ابحث عن المورد بالاسم أو الرقم الضريبي..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {supplierSearch && (
                  <button 
                    onClick={() => setSupplierSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  setSupplierForm({ id: '', name: '', phone: '', address: '', cr: '', trn: '', balance: '0' });
                  setIsEditingSupplier(false);
                  setShowSupplierModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>إضافة مورد جديد</span>
              </button>
              <button 
                onClick={() => {
                  setPrintTableData({
                    title: 'كشف مديونيات وأرصدة الموردين والشركات المسجلين',
                    headers: ['م', 'اسم المورد', 'الهاتف', 'العنوان', 'الرقم الضريبي', 'السجل التجاري', 'الرصيد للمورد (ج.م)'],
                    rows: suppliers.filter(s => (s.name || '').includes(supplierSearch)).map((s, i) => [
                      i + 1,
                      s.name,
                      s.phone || '-',
                      s.address || '-',
                      s.trn || '-',
                      s.cr || '-',
                      `${s.balance.toFixed(2)} ج.م`
                    ])
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>طباعة الجدول</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar pr-2">
              {suppliers.filter(s => (s.name || '').includes(supplierSearch) || (s.trn && s.trn.includes(supplierSearch))).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <TruckIcon className="h-16 w-16 text-slate-600 animate-pulse" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-300">لا يوجد موردين متطابقين</h3>
                    <p className="text-sm text-slate-500 mt-1">أضف مورد جديد لبدء تسجيل الفواتير وسندات الصرف باسمه</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {suppliers.filter(s => (s.name || '').includes(supplierSearch) || (s.trn && s.trn.includes(supplierSearch))).map((sup) => {
                    const totalPurchased = sup.purchaseOrders ? sup.purchaseOrders.reduce((sum: number, o: any) => sum + o.netAmount, 0) : 0;
                    const totalPaid = sup.expenses ? sup.expenses.reduce((sum: number, p: any) => sum + p.amount, 0) : 0;
                    const remainingDebt = sup.balance;
                    return (
                      <div key={sup.id} className="glass-card rounded-xl p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-[15px] font-bold text-white leading-snug">{sup.name}</h3>
                              <p className="text-[10px] text-slate-400 mt-1">مورد معتمد</p>
                            </div>
                            <button 
                              onClick={() => {
                                setSupplierForm({
                                  id: sup.id,
                                  name: sup.name,
                                  phone: sup.phone || '',
                                  address: sup.address || '',
                                  cr: sup.cr || '',
                                  trn: sup.trn || '',
                                  balance: sup.balance.toString()
                                });
                                setIsEditingSupplier(true);
                                setShowSupplierModal(true);
                              }}
                              className="bg-white/5 text-slate-400 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-300 mb-2 border-t border-white/5 pt-2 font-semibold">
                            {sup.phone && <p>📱 <span className="text-white font-mono font-bold">{sup.phone}</span></p>}
                            {sup.address && <p>📍 <span className="text-white">{sup.address}</span></p>}
                            {sup.cr && <p>📜 سجل: <span className="text-white font-mono font-bold">{sup.cr}</span></p>}
                            {sup.trn && <p className="col-span-2">📋 ضريبي: <span className="text-white font-mono font-bold text-xs">{sup.trn}</span></p>}
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-2">
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">فواتير التوريد</span>
                              <span className="text-sm font-black text-red-400 font-mono">{totalPurchased.toFixed(2)} ج.م</span>
                            </div>
                            <div className="bg-black/25 px-2 py-1 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 block font-bold">المبالغ المصروفة</span>
                              <span className="text-sm font-black text-emerald-400 font-mono">{totalPaid.toFixed(2)} ج.م</span>
                            </div>
                            <div className="col-span-2 bg-black/25 px-2 py-2 rounded-lg text-center border border-white/5">
                              <span className="text-[10px] text-slate-400 block font-bold">الرصيد المتبقي له (المديونية)</span>
                              <span className={`text-base font-black font-mono ${remainingDebt > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {remainingDebt.toFixed(2)} ج.م
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedHistorySupplier(sup);
                                setShowSupplierHistoryModal(true);
                              }}
                              className="col-span-2 bg-white/5 text-slate-300 p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-xs font-bold mt-1 shadow-md shadow-black/20"
                            >
                              كشف حساب المورد / تفاصيل
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: PURCHASES */}
        {activeTab === 'PURCHASES' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">فواتير المشتريات والوارد للمخزن</h2>
              <p className="text-xs text-slate-400 mt-0.5">تسجيل الكميات والمنتجات الواردة من الموردين وتنزيلها تلقائياً للمخزن</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة أو اسم المورد..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {purchaseSearch && (
                  <button 
                    onClick={() => setPurchaseSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  setPurchaseForm({ billNumber: generateBillNumber(), supplierId: '', items: [] });
                  setShowPurchaseModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>تسجيل فاتورة شراء</span>
              </button>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">رقم الفاتورة</th>
                    <th className="p-4 font-bold">التاريخ</th>
                    <th className="p-4 font-bold">المورد</th>
                    <th className="p-4 font-bold">الإجمالي قبل الضريبة</th>
                    <th className="p-4 font-bold">الضريبة (14%)</th>
                    <th className="p-4 font-bold">الصافي شامل الضريبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {purchases.filter(p => (p.billNumber || '').includes(purchaseSearch) || (p.supplier?.name || '').includes(purchaseSearch)).map(purchase => (
                      <tr key={purchase.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedPurchase(purchase); setShowPurchaseDetailModal(true); }}>
                        <td className="p-4 font-mono text-slate-300 font-bold">{purchase.billNumber}</td>
                        <td className="p-4 text-slate-300 font-mono text-xs">{new Date(purchase.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-4 font-bold text-white">{purchase.supplier?.name || 'غير معروف'}</td>
                        <td className="p-4 font-mono text-slate-300">{purchase.totalAmount.toFixed(2)} ج.م</td>
                        <td className="p-4 font-mono text-slate-400">{purchase.taxAmount.toFixed(2)} ج.م</td>
                        <td className="p-4 font-mono font-bold text-emerald-400" dir="ltr">{purchase.netAmount.toFixed(2)} ج.م</td>
                      </tr>
                  ))}
                  {purchases.filter(p => (p.billNumber || '').includes(purchaseSearch) || (p.supplier?.name || '').includes(purchaseSearch)).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500 font-bold">لا توجد فواتير مشتريات مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 9: EXPENSES */}
        {activeTab === 'EXPENSES' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">سندات الصرف للموردين</h2>
              <p className="text-xs text-slate-400 mt-0.5">تسجيل ومتابعة سندات الصرف للموردين والخصم الفوري من البنوك والخزائن</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="ابحث برقم السند أو اسم المورد..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {expenseSearch && (
                  <button 
                    onClick={() => setExpenseSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => {
                  setExpenseForm({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });
                  setShowExpenseModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>إصدار سند صرف</span>
              </button>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">رقم السند</th>
                    <th className="p-4 font-bold">التاريخ</th>
                    <th className="p-4 font-bold">المستلم (المورد)</th>
                    <th className="p-4 font-bold">المخصوم من (الخزينة)</th>
                    <th className="p-4 font-bold">البيان</th>
                    <th className="p-4 font-bold">المبلغ المصروف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {expenses.filter(e => (e.expenseNumber || '').includes(expenseSearch) || (e.supplier?.name || '').includes(expenseSearch)).map(expense => (
                    <tr key={expense.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedExpense(expense); setShowExpenseReceiptModal(true); }}>
                      <td className="p-4 font-mono text-slate-300 font-bold">{expense.expenseNumber}</td>
                      <td className="p-4 text-slate-300 font-mono text-xs">{new Date(expense.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 font-bold text-white">{expense.supplier?.name || 'غير معروف'}</td>
                      <td className="p-4 text-slate-300">{expense.bank?.name || 'غير معروف'}</td>
                      <td className="p-4 text-slate-400 text-xs">{expense.notes || '-'}</td>
                      <td className="p-4 font-mono font-bold text-red-400" dir="ltr">{expense.amount.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                  {expenses.filter(e => (e.expenseNumber || '').includes(expenseSearch) || (e.supplier?.name || '').includes(expenseSearch)).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500 font-bold">لا توجد سندات صرف مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
  

        {/* TAB 4: BANKS */}
        {activeTab === 'BANKS' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">إدارة البنوك والخزائن</h2>
              <p className="text-xs text-slate-400 mt-0.5">إدارة الحسابات البنكية والنقدية ومتابعة الأرصدة والعمليات المالية</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="ابحث عن بنك أو خزينة بالاسم..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {bankSearch && (
                  <button 
                    onClick={() => setBankSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => { setIsBankModalOpen(true); setBankForm({ name: '', accountNumber: '', balance: '0' }); }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>إضافة بنك / خزينة</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar pr-2">
              {banks.filter(b => (b.name || '').includes(bankSearch)).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <BuildingIcon className="h-16 w-16 text-slate-600 animate-pulse" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-300">لا توجد حسابات متطابقة</h3>
                    <p className="text-sm text-slate-500 mt-1">أضف بنك أو خزينة جديدة لبدء العمليات المالية</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {banks.filter(b => (b.name || '').includes(bankSearch)).map((bank) => (
                    <div key={bank.id} className="glass-card rounded-xl p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="text-[15px] font-bold text-white leading-snug">{bank.name}</h3>
                            <p className="text-[10px] text-slate-400 mt-1">حساب مالي</p>
                          </div>
                          <div className="bg-white/5 text-slate-400 p-1.5 rounded-lg border border-white/5">
                            <BuildingIcon className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          <button
                            onClick={() => {
                              setBankForm({
                                id: bank.id,
                                name: bank.name,
                                accountNumber: bank.accountNumber || '',
                                balance: bank.balance.toString()
                              });
                              setIsEditingBank(true);
                              setIsBankModalOpen(true);
                            }}
                            className="bg-white/5 text-slate-400 p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-x-2 gap-y-1 text-xs text-slate-300 mb-2 border-t border-white/5 pt-2 font-semibold">
                          <p>📜 رقم الحساب: <span className="text-white font-mono font-bold">{bank.accountNumber || 'لا يوجد'}</span></p>
                        </div>
                      </div>

                      <div className="border-t border-white/5 pt-2">
                        <div className="bg-black/25 px-2 py-2 rounded-lg text-center border border-white/5">
                          <span className="text-[10px] text-slate-400 block font-bold">الرصيد الحالي</span>
                          <span className="text-base font-black font-mono text-emerald-400">
                            {bank.balance.toFixed(2)} ج.م
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: PAYMENTS */}
        {activeTab === 'PAYMENTS' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">سداد ودفعات العملاء</h2>
              <p className="text-xs text-slate-400 mt-0.5">متابعة سجل المقبوضات وإصدار سندات القبض والدفعات من العملاء</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  placeholder="ابحث برقم السند أو اسم العميل..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {paymentSearch && (
                  <button 
                    onClick={() => setPaymentSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => { setIsPaymentModalOpen(true); setPaymentForm({ customerId: '', bankId: '', amount: '', notes: '', reference: '' }); }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-4 py-2.5 rounded-xl font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon className="w-4 h-4" />
                <span>سند قبض جديد</span>
              </button>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-4 font-bold">رقم السند</th>
                    <th className="p-4 font-bold">التاريخ</th>
                    <th className="p-4 font-bold">العميل</th>
                    <th className="p-4 font-bold">البنك/الخزينة</th>
                    <th className="p-4 font-bold">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {payments.filter(p => (p.customer?.name || '').includes(paymentSearch) || (p.receiptNumber && p.receiptNumber.includes(paymentSearch))).map(payment => (
                    <tr key={payment.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedReceipt(payment); setShowReceiptModal(true); }}>
                      <td className="p-4 font-mono text-slate-300 font-bold">{payment.receiptNumber ? `REC-${payment.receiptNumber}` : `REC-${payment.id.substring(0,6).toUpperCase()}`}</td>
                      <td className="p-4 text-slate-300 font-mono text-xs">{new Date(payment.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 font-bold text-white">{payment.customer?.name || 'غير معروف'}</td>
                      <td className="p-4 text-slate-300">{payment.bank?.name || 'غير معروف'}</td>
                      <td className="p-4 font-mono font-bold text-emerald-400" dir="ltr">{payment.amount.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                  {payments.filter(p => (p.customer?.name || '').includes(paymentSearch) || (p.receiptNumber && p.receiptNumber.includes(paymentSearch))).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500 font-bold">لا توجد سندات قبض مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
  

      
        {/* TAB 6: INVOICES */}
        {activeTab === 'INVOICES' && (
          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden no-print">
            <div>
              <h2 className="text-xl font-bold text-white">الفواتير وعروض الأسعار</h2>
              <p className="text-xs text-slate-400 mt-0.5">مراجعة وإعادة طباعة فواتير المبيعات وعروض الأسعار الصادرة للمؤسسات والأفراد</p>
            </div>

            <div className="flex gap-3 items-center max-w-xl">
              <div className="relative group flex-1">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة أو اسم العميل..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {invoiceSearch && (
                  <button 
                    onClick={() => setInvoiceSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-4 font-bold">رقم الفاتورة</th>
                    <th className="p-4 font-bold">التاريخ</th>
                    <th className="p-4 font-bold">العميل</th>
                    <th className="p-4 font-bold">النوع</th>
                    <th className="p-4 font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {invoices.filter(inv => (inv.invoiceNumber || '').includes(invoiceSearch) || (inv.customerName || '').includes(invoiceSearch) || (inv.customer?.name || '').includes(invoiceSearch)).map(inv => (
                    <tr key={inv.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => {
                      setInvoice(inv);
                      if (inv.qrCode) {
                        QRCode.toDataURL(inv.qrCode, { width: 160, margin: 1 })
                          .then(url => setQrCodeUrl(url))
                          .catch(err => console.error(err));
                      } else {
                        setQrCodeUrl('');
                      }
                      setShowModal(true);
                    }}>
                      <td className="p-4 font-mono text-slate-300 font-bold">{inv.invoiceNumber}</td>
                      <td className="p-4 text-slate-300 font-mono text-xs">{new Date(inv.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 font-bold text-white">{inv.customer?.name || inv.customerName || 'عميل نقدي'}</td>
                      <td className="p-4 text-slate-300">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${inv.isQuotation ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {inv.isQuotation ? 'عرض سعر' : 'فاتورة'}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-white" dir="ltr">{inv.netAmount.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                  {invoices.filter(inv => (inv.invoiceNumber || '').includes(invoiceSearch) || (inv.customerName || '').includes(invoiceSearch) || (inv.customer?.name || '').includes(invoiceSearch)).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500 font-bold">لا توجد فواتير مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
  

      </div>

      {/* MODAL 1: INVOICE & QUOTATION PRINT MODAL */}
      {showModal && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-invoice" className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-950 border-b border-slate-700 flex justify-between items-center no-print">
              <div>
                <h3 className="text-xl font-bold flex gap-2 items-center text-white">
                  <PrinterIcon className="text-entlaq-red h-6 w-6" />
                  {invoice.isQuotation ? 'عرض سعر توريد' : 'فاتورة ضريبية مبسطة'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">الرقم: {invoice.invoiceNumber}</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all no-print cursor-pointer"
              >
                <XIcon size={20} />
              </button>
            </div>

            {/* Modal Body (Printable Area) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white text-black">
              
              {/* Printed Letterhead / Logo */}
              <div className="flex justify-between items-center border-b border-gray-300 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 p-1">
                    <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-black tracking-wide">شركة الإنطلاق</h2>
                    <p className="text-xs text-gray-500">لتصنيع وتوريد خراطيم ومواسير الكهرباء</p>
                    <p className="text-[10px] text-gray-400">العاشر من رمضان - المنطقة الصناعية الثالثة</p>
                  </div>
                </div>
                <div className="text-left text-sm">
                  <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-bold">
                    {invoice.isQuotation ? 'عرض سعر' : 'فاتورة ضريبية'}
                  </span>
                  <p className="text-xs text-slate-400 mt-2 font-mono">الرقم: {invoice.invoiceNumber}</p>
                  <p className="text-xs text-slate-400 font-mono">التاريخ: {new Date(invoice.createdAt).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              {/* Vendor & Customer Info */}
              <div className="grid grid-cols-2 gap-6 text-sm bg-gray-50 p-4 rounded-md border border-gray-200">
                <div>
                  <h4 className="font-bold text-gray-500 mb-1 text-xs">بيانات المورد (البائع)</h4>
                  <p className="font-bold text-black">مصنع الانطلاق للصناعات البلاستيكية</p>
                  <p className="text-xs text-gray-500 mt-0.5">الرقم الضريبي: 310122345600003</p>
                  <p className="text-xs text-gray-500">السجل التجاري: 12056-أ</p>
                </div>
                <div>
                  <h4 className="font-bold text-gray-500 mb-1 text-xs">بيانات العميل (المشتري)</h4>
                  <p className="font-bold text-black">{invoice.customerName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">النشاط: مقاولات وتوريدات كهربائية</p>
                  <p className="text-xs text-gray-500">حالة الدفع: نقدي</p>
                </div>
              </div>

              {/* Items List - Outlined grid styled table as requested */}
              <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50/50">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                      <th className="p-3 border-l border-gray-200">الصنف</th>
                      <th className="p-3 border-l border-gray-200">الكود</th>
                      <th className="p-3 border-l border-gray-200">الكمية</th>
                      <th className="p-3 border-l border-gray-200">سعر الوحدة</th>
                      <th className="p-3 border-l border-gray-200">الضريبة</th>
                      <th className="p-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {invoice.items && invoice.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                        <td className="p-3 border-l border-gray-200 font-bold text-black">{item.product.name} ({item.product.size})</td>
                        <td className="p-3 border-l border-gray-200 font-mono text-xs text-gray-600">{item.product.code}</td>
                        <td className="p-3 border-l border-gray-200 font-mono text-black">{item.quantity}</td>
                        <td className="p-3 border-l border-gray-200 font-mono text-black">{item.unitPrice.toFixed(2)} ج.م</td>
                        <td className="p-3 border-l border-gray-200 font-mono text-black">{item.taxAmount.toFixed(2)} ج.م</td>
                        <td className="p-3 font-mono font-bold text-black">{item.total.toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & QR Code */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                
                {/* ZATCA compliant QR Code (Offline-ready) */}
                <div className="bg-white p-3 rounded-md flex flex-col items-center justify-center shadow-lg border border-gray-200">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="ZATCA E-Invoicing QR Code" className="w-32 h-32" />
                  ) : (
                    <div className="w-32 h-32 border border-gray-200 rounded flex items-center justify-center text-[10px] text-gray-500 font-bold text-center">
                      عرض سعر<br/>(لا يحتاج رمز QR)
                    </div>
                  )}
                </div>

                {/* Summaries */}
                <div className="w-72 space-y-3 bg-gray-50 p-5 rounded-md border border-gray-200">
                  <div className="flex justify-between text-xs text-gray-600 font-mono">
                    <span>الإجمالي (غير شامل الضريبة)</span>
                    <span>{invoice.totalAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 font-mono">
                    <span>ضريبة القيمة المضافة (14%)</span>
                    <span>{invoice.taxAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="h-px bg-gray-200 w-full"></div>
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-black">الإجمالي المستحق</span>
                    <span className="text-2xl font-black text-red-600 font-mono">
                      {invoice.netAmount.toFixed(2)} <span className="text-xs font-normal text-red-500">ج.م</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Thank you note & Contacts */}
              <div className="pt-6 border-t border-gray-200 flex flex-col items-center text-center space-y-3">
                <p className="text-sm font-bold text-black tracking-wide">
                  💚 شكراً لتعاملكم مع مصنع الانطلاق ونتطلع لخدمتكم دائماً!
                </p>
                <div className="flex justify-center gap-6 text-xs text-gray-500 font-mono">
                  <span>هاتف: 01030099400 / 01021683030</span>
                  <span>|</span>
                  <span>إيميل: info@al-entlaq.com</span>
                  <span>|</span>
                  <span>ويب: www.al-entlaq.com</span>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-950 border-t border-slate-700 flex gap-4 no-print">
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-entlaq-red text-white py-3.5 rounded-xl font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 cursor-pointer"
              >
                <PrinterIcon size={18} />
                طباعة الفاتورة
              </button>
              <button 
                onClick={() => setShowModal(false)}
                className="flex-1 bg-white/5 text-slate-300 py-3.5 rounded-xl font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 no-print" dir="rtl">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-5 bg-slate-950 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">تغيير كلمة المرور</h3>
              <button 
                onClick={() => setShowChangePasswordModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>
            
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold block">المستهدف</label>
                {currentUser?.role === 'ADMIN' ? (
                  <select 
                    value={changePasswordForm.userId}
                    onChange={(e) => setChangePasswordForm(prev => ({ ...prev, userId: e.target.value }))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-red transition-all cursor-pointer"
                  >
                    <option value="">-- اختر مستخدماً لتغيير كلمته --</option>
                    {dbUsers.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type="text"
                    value={currentUser?.name}
                    disabled
                    className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-400 font-bold"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold block">كلمة المرور الجديدة</label>
                <input 
                  type="password"
                  placeholder="••••••"
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-red transition-all text-center tracking-widest"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold block">تأكيد كلمة المرور</label>
                <input 
                  type="password"
                  placeholder="••••••"
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-red transition-all text-center tracking-widest"
                  required
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-entlaq-red hover:bg-red-600 active:scale-95 text-white font-bold text-sm py-3.5 rounded-xl shadow-lg shadow-red-500/20 transition-all cursor-pointer mt-2"
              >
                تحديث كلمة المرور
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PRODUCT IN-GRID DETAIL PREVIEW */}
      {showProductModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-bold">
                  {getCategoryNameAr(selectedProduct.type)}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{selectedProduct.name}</h3>
              </div>
              <button 
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black/30 border border-white/5 relative group">
                <img 
                  src={getProductImage(selectedProduct.type)} 
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
              </div>

              {/* Product Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">كود الصنف (Code)</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.code}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">المقاس (Size)</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.size}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">اللون (Color)</span>
                  <span className="text-sm font-bold text-white">{selectedProduct.color || '-'}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">الطول (Length)</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.length || '-'}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">الوزن (Weight)</span>
                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.weight || '-'}</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <span className="text-[10px] text-slate-400 block">سعر البيع</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{selectedProduct.price} ج.م</span>
                </div>
                <div className="bg-white/5 border border-white/5 p-3 rounded-2xl col-span-2 text-center">
                  <span className="text-[10px] text-slate-400 block">المخزون المتاح</span>
                  <span className={`text-base font-bold font-mono ${selectedProduct.stockQty <= 0 ? 'text-red-500' : selectedProduct.stockQty <= selectedProduct.minStockQty ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {selectedProduct.stockQty} وحدة
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400">الوصف والمواصفات الفنية</h4>
                <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-3 rounded-2xl border border-white/5">
                  {getProductDescription(selectedProduct.type, selectedProduct.name)}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex gap-3">
              <button 
                disabled={selectedProduct.stockQty <= 0}
                onClick={() => {
                  addToCart(selectedProduct);
                  setShowProductModal(false);
                }}
                className="flex-1 bg-entlaq-red text-white py-3 rounded-xl font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all disabled:opacity-40 disabled:hover:bg-entlaq-red cursor-pointer"
              >
                <ShoppingCartIcon size={16} />
                إضافة إلى الفاتورة
              </button>
              <button 
                onClick={() => setShowProductModal(false)}
                className="bg-white/5 text-slate-300 px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: CUSTOMER FORM MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isEditingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">أدخل تفاصيل العميل لتسجيل الفواتير المخصصة والشركات</p>
              </div>
              <button 
                onClick={() => setShowCustomerModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-4 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم العميل / الشركة *</label>
                <input 
                  type="text"
                  required
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: شركة المقاولون العرب"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">رقم التلفون</label>
                  <input 
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="مثال: 01021683030"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الموقع</label>
                  <input 
                    type="text"
                    value={customerForm.location}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="مثال: القاهرة - مدينة نصر"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">عدد العماير</label>
                  <input 
                    type="number"
                    value={customerForm.buildingsCount}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, buildingsCount: e.target.value }))}
                    placeholder="مثال: 5"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">السجل التجاري</label>
                  <input 
                    type="text"
                    value={customerForm.cr}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, cr: e.target.value }))}
                    placeholder="مثال: 1010123456"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الرقم الضريبي</label>
                  <input 
                    type="text"
                    value={customerForm.trn}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, trn: e.target.value }))}
                    placeholder="مثال: 310122345600003"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">طبيعة العميل</label>
                  <select 
                    value={customerForm.customerType}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, customerType: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs font-bold"
                  >
                    <option value="CASH">نقدي</option>
                    <option value="CREDIT">آجل</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">نسبة الخصم (%)</label>
                  <input 
                    type="number"
                    step="0.1"
                    disabled={currentUser?.role !== 'ADMIN'}
                    value={customerForm.discount}
                    onChange={(e) => setCustomerForm(prev => ({ ...prev, discount: e.target.value }))}
                    placeholder="مثال: 10"
                    className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button 
                  type="submit"
                  className="flex-1 bg-entlaq-red text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-500/10"
                >
                  حفظ البيانات
                </button>
                <button 
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
        {/* MODAL 4: PRODUCT FORM MODAL */}
      {showProductFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isEditingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد بالمخزن'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">أدخل المواصفات الفنية والمالية للصنف بدقة</p>
              </div>
              <button 
                onClick={() => setShowProductFormModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">كود الصنف *</label>
                  <input 
                    type="text"
                    required
                    value={productForm.code}
                    onChange={(e) => setProductForm(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="مثال: 3020"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الباركود (اختياري)</label>
                  <input 
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => setProductForm(prev => ({ ...prev, barcode: e.target.value }))}
                    placeholder="مثال: 6221234567890"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم المنتج *</label>
                  <input 
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="مثال: ماسورة كهرباء UPVC"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">النوع *</label>
                  <select 
                    value={productForm.type}
                    onChange={(e) => setProductForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="PIPE">مواسير UPVC</option>
                    <option value="HOSE">خراطيم حريق</option>
                    <option value="ACCESSORY">إكسسوارات وبواطات</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">المقاس *</label>
                  <input 
                    type="text"
                    required
                    value={productForm.size}
                    onChange={(e) => setProductForm(prev => ({ ...prev, size: e.target.value }))}
                    placeholder="مثال: 20 mm"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1">اللون</label>
                  <select 
                    value={productForm.color || ''}
                    onChange={(e) => setProductForm(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="">بدون لون</option>
                    <option value="أبيض">أبيض</option>
                    <option value="أسود">أسود</option>
                    <option value="رمادي">رمادي</option>
                    <option value="رصاصي">رصاصي</option>
                    <option value="شفاف">شفاف</option>
                    <option value="أحمر">أحمر</option>
                    <option value="أزرق">أزرق</option>
                    <option value="أزرق داكن">أزرق داكن</option>
                    <option value="أخضر">أخضر</option>
                    <option value="أخضر داكن">أخضر داكن</option>
                    <option value="أصفر">أصفر</option>
                    <option value="برتقالي">برتقالي</option>
                    <option value="بني">بني</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الطول</label>
                  <input 
                    type="text"
                    value={productForm.length}
                    onChange={(e) => setProductForm(prev => ({ ...prev, length: e.target.value }))}
                    placeholder="مثال: 45 m"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الوزن</label>
                  <input 
                    type="text"
                    value={productForm.weight}
                    onChange={(e) => setProductForm(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="مثال: 5.050 kg"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              {currentUser?.role === 'ADMIN' ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الشراء (التكلفة) *</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={productForm.costPrice}
                      onChange={(e) => {
                        const cost = e.target.value;
                        setProductForm(prev => {
                          const computed = (parseFloat(cost) || 0) * (1 + (parseFloat(prev.markup) || 30) / 100);
                          return {
                            ...prev,
                            costPrice: cost,
                            price: computed > 0 ? computed.toFixed(2) : prev.price
                          };
                        });
                      }}
                      placeholder="سعر التكلفة"
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">النسبة *</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={productForm.markup}
                      onChange={(e) => {
                        const markup = e.target.value;
                        setProductForm(prev => {
                          const computed = (parseFloat(prev.costPrice) || 0) * (1 + (parseFloat(markup) || 30) / 100);
                          return {
                            ...prev,
                            markup: markup,
                            price: computed > 0 ? computed.toFixed(2) : prev.price
                          };
                        });
                      }}
                      placeholder="مثال: 30"
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر البيع *</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={productForm.price}
                      onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))}
                      placeholder="سعر البيع النهائي"
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر البيع *</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      disabled
                      value={productForm.price}
                      placeholder="سعر البيع النهائي"
                      className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الكمية الحالية *</label>
                  <input 
                    type="number"
                    required
                    value={productForm.stockQty}
                    onChange={(e) => setProductForm(prev => ({ ...prev, stockQty: e.target.value }))}
                    placeholder="الكمية"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الحد الأدنى *</label>
                  <input 
                    type="number"
                    required
                    value={productForm.minStockQty}
                    onChange={(e) => setProductForm(prev => ({ ...prev, minStockQty: e.target.value }))}
                    placeholder="حد التنبيه"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الحد الأقصى *</label>
                  <input 
                    type="number"
                    required
                    value={productForm.maxStockQty}
                    onChange={(e) => setProductForm(prev => ({ ...prev, maxStockQty: e.target.value }))}
                    placeholder="الحد الأقصى"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button 
                  type="submit"
                  className="flex-1 bg-entlaq-red text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-500/10"
                >
                  حفظ البيانات
                </button>
                <button 
                  type="button"
                  onClick={() => setShowProductFormModal(false)}
                  className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    {/* MODAL 5: BANK FORM MODAL */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">إضافة بنك / خزينة</h3>
              </div>
              <button onClick={() => setIsBankModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBank} className="p-4 space-y-3" dir="rtl">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم البنك / الخزينة *</label>
                <input type="text" required value={bankForm.name} onChange={e => setBankForm({...bankForm, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50" placeholder="مثال: البنك الأهلي" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">رقم الحساب</label>
                <input type="text" value={bankForm.accountNumber} onChange={e => setBankForm({...bankForm, accountNumber: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono text-left" placeholder="رقم الحساب البنكي" dir="ltr" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الرصيد الافتتاحي *</label>
                <input type="number" step="0.01" required value={bankForm.balance} onChange={e => setBankForm({...bankForm, balance: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono" />
              </div>
              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button type="submit" disabled={submitting} className="flex-1 bg-entlaq-red text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-500/10 disabled:opacity-50">حفظ</button>
                <button type="button" onClick={() => setIsBankModalOpen(false)} className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: PAYMENT FORM MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">إصدار سند قبض جديد</h3>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSavePayment} className="p-4 space-y-3" dir="rtl">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">العميل *</label>
                <select required value={paymentForm.customerId} onChange={e => setPaymentForm({...paymentForm, customerId: e.target.value})} className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold">
                  <option value="">-- اختر العميل --</option>
                  {customers.filter(c => c.id !== 'CASH').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">البنك / الخزينة *</label>
                <select required value={paymentForm.bankId} onChange={e => setPaymentForm({...paymentForm, bankId: e.target.value})} className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold">
                  <option value="">-- اختر البنك أو الخزينة --</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.balance.toFixed(2)} ج.م)</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">المبلغ المدفوع *</label>
                <input type="number" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono text-xl text-emerald-400" placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">ملاحظات / رقم الشيك</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50" placeholder="مثال: دفعة تحت الحساب بشيك رقم..." />
              </div>
              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button type="submit" disabled={submitting} className="flex-1 bg-entlaq-red text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-500/10 disabled:opacity-50">
                  حفظ وإصدار السند
                </button>
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: PAYMENT RECEIPT PRINT MODAL */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-receipt" className="bg-white text-black w-full max-w-2xl rounded-md shadow-2xl flex flex-col max-h-[95vh] relative print:max-h-none print:shadow-none print:bg-white">
            
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center no-print text-white rounded-t-md">
              <h3 className="text-lg font-bold flex items-center gap-2"><PrinterIcon size={20} className="text-entlaq-red" /> طباعة سند القبض</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-entlaq-red px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-red-600 transition-colors cursor-pointer">
                  طباعة السند
                </button>
                <button onClick={() => setShowReceiptModal(false)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"><XIcon size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 font-sans print:p-0 print:overflow-visible">
              
              {/* Receipt Header */}
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                <div className="text-right">
                  <h1 className="text-2xl font-black mb-1 tracking-wide">شركة الإنطلاق</h1>
                  <p className="text-xs font-bold">لتصنيع وتوريد خراطيم ومواسير الكهرباء</p>
                  <p className="text-[10px]">العاشر من رمضان - المنطقة الصناعية الثالثة</p>
                </div>
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-1 border border-gray-300 rounded-lg flex items-center justify-center p-1 bg-gray-50">
                    <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="text-left" dir="rtl">
                  <h2 className="text-lg font-bold border-2 border-black px-4 py-1 rounded-md inline-block">سند قبض (Receipt)</h2>
                  <p className="text-xs mt-2 font-mono">رقم السند: {selectedReceipt.receiptNumber ? `REC-${selectedReceipt.receiptNumber}` : `REC-${selectedReceipt.id.substring(0,6).toUpperCase()}`}</p>
                  <p className="text-xs font-mono">التاريخ: {new Date(selectedReceipt.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                </div>
              </div>

              {/* Receipt Body */}
              <div className="space-y-6 text-right leading-loose text-base" dir="rtl">
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-32 shrink-0">استلمنا من السيد/ة:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1 font-bold text-lg">{selectedReceipt.customer?.name}</span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-32 shrink-0">مبلغ وقدره:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1 font-mono font-bold bg-gray-100/50 px-2 text-center text-xl tracking-wider">
                    {selectedReceipt.amount.toFixed(2)} ج.م
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <span className="font-bold w-32 shrink-0">وذلك عن:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1">{selectedReceipt.notes || 'سداد دفعة من الحساب'}</span>
                </div>

                <div className="flex gap-2 items-center">
                  <span className="font-bold w-32 shrink-0">خزينة / بنك:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1">{selectedReceipt.bank?.name}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="flex justify-between mt-12 px-8 text-center text-sm font-bold" dir="rtl">
                <div>
                  <p className="mb-8">المستلم (الخزينة)</p>
                  <p className="border-t border-black pt-1 w-32">التوقيع</p>
                </div>
                <div>
                  <p className="mb-8 text-white select-none">.</p>
                  <p className="border-t border-black pt-1 w-32">الختم</p>
                </div>
              </div>

              {/* Stub / كعب السند */}
              <div className="mt-16 pt-8 border-t-2 border-dashed border-gray-400 relative">
                <div className="absolute top-[-11px] left-1/2 -translate-x-1/2 bg-white px-4 text-gray-500 text-xs flex gap-2 items-center">
                  <span className="text-xl">✂️</span>
                  القص هنا (كعب السند)
                </div>
                
                <div className="flex justify-between items-start mb-4" dir="rtl">
                  <div>
                    <h3 className="font-bold text-base">كعب سند القبض - يٌسلم للعميل بعد التوقيع</h3>
                    <p className="text-xs mt-1 font-mono">رقم السند: {selectedReceipt.receiptNumber ? `REC-${selectedReceipt.receiptNumber}` : `REC-${selectedReceipt.id.substring(0,6).toUpperCase()}`}</p>
                  </div>
                  <div className="text-left font-mono font-bold text-lg bg-gray-100 px-4 py-2 border border-gray-300">
                    {selectedReceipt.amount.toFixed(2)} ج.م
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-8" dir="rtl">
                  <div><span className="font-bold">العميل:</span> {selectedReceipt.customer?.name}</div>
                  <div><span className="font-bold font-mono">التاريخ:</span> {new Date(selectedReceipt.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                  <div className="col-span-2"><span className="font-bold">البيان:</span> {selectedReceipt.notes || 'سداد دفعة من الحساب'}</div>
                </div>

                <div className="flex justify-between px-8 text-center text-sm font-bold" dir="rtl">
                  <div>
                    <p className="mb-8">توقيع العميل المقر بالدفع</p>
                    <p className="border-t border-black pt-1 w-40">التوقيع</p>
                  </div>
                  <div>
                    <p className="mb-8">توقيع المستلم (الخزينة)</p>
                    <p className="border-t border-black pt-1 w-40">التوقيع</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
  
    
      {/* MODAL 8: CUSTOMER HISTORY MODAL */}
      {showCustomerHistoryModal && selectedHistoryCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-statement" className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:bg-white print:border-none print:w-full">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                  <FileTextIcon className="text-entlaq-red animate-pulse" />
                  كشف حساب تفصيلي: {selectedHistoryCustomer.name}
                </h3>
              </div>
              <div className="flex gap-2 items-center no-print">
                <button 
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex gap-1.5 items-center transition-all duration-300 cursor-pointer shadow-lg"
                >
                  <PrinterIcon size={14} />
                  <span>طباعة الكشف</span>
                </button>
                <button onClick={() => setShowCustomerHistoryModal(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                  <XIcon size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6" dir="rtl">
              
              {/* Invoices List */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-md font-bold text-white mb-4 border-b border-white/5 pb-2">سجل الفواتير وعروض الأسعار</h4>
                {selectedHistoryCustomer.orders && selectedHistoryCustomer.orders.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="p-3">رقم الفاتورة</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">النوع</th>
                          <th className="p-3">الإجمالي</th>
                          <th className="p-3 text-center">طباعة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {selectedHistoryCustomer.orders.map((ord: any) => (
                          <tr key={ord.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono font-bold text-white">{ord.invoiceNumber}</td>
                            <td className="p-3 font-mono text-xs text-slate-300">{new Date(ord.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                            <td className="p-3 text-xs font-bold text-slate-400">{ord.isQuotation ? 'عرض سعر' : 'فاتورة'}</td>
                            <td className="p-3 font-mono text-emerald-400 font-bold">{ord.netAmount.toFixed(2)} ج.م</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => {
                                  setInvoice(ord);
                                  if (ord.qrCode) {
                                    QRCode.toDataURL(ord.qrCode, { width: 160, margin: 1 })
                                      .then(url => setQrCodeUrl(url)).catch(console.error);
                                  } else setQrCodeUrl('');
                                  setShowModal(true);
                                }}
                                className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-lg transition-colors cursor-pointer"
                              ><PrinterIcon size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 font-bold text-sm">لا توجد فواتير مسجلة لهذا العميل</div>
                )}
              </div>

              {/* Payments List */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-md font-bold text-white mb-4 border-b border-white/5 pb-2">سجل السدادات والدفعات</h4>
                {selectedHistoryCustomer.payments && selectedHistoryCustomer.payments.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="p-3">رقم السند</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">البنك/الخزينة</th>
                          <th className="p-3">ملاحظات</th>
                          <th className="p-3">المبلغ</th>
                          <th className="p-3 text-center">طباعة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {selectedHistoryCustomer.payments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono font-bold text-white">{p.receiptNumber ? `REC-${p.receiptNumber}` : `REC-${p.id.substring(0,6).toUpperCase()}`}</td>
                            <td className="p-3 font-mono text-xs text-slate-300">{new Date(p.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                            <td className="p-3 font-bold text-slate-300">{p.bank?.name || 'بنك'}</td>
                            <td className="p-3 text-slate-400 text-xs">{p.notes || '-'}</td>
                            <td className="p-3 font-mono text-emerald-400 font-bold">{p.amount.toFixed(2)} ج.م</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => {
                                  setSelectedReceipt({ ...p, customer: selectedHistoryCustomer });
                                  setShowReceiptModal(true);
                                }}
                                className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-lg transition-colors cursor-pointer"
                              ><PrinterIcon size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 font-bold text-sm">لا توجد سندات قبض مسجلة لهذا العميل</div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
  
      {/* MODAL 8.5: SUPPLIER HISTORY MODAL */}
      {showSupplierHistoryModal && selectedHistorySupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-statement" className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:bg-white print:border-none print:w-full">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                  <FileTextIcon className="text-purple-400 animate-pulse" />
                  كشف حساب تفصيلي للمورد: {selectedHistorySupplier.name}
                </h3>
              </div>
              <div className="flex gap-2 items-center no-print">
                <button 
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex gap-1.5 items-center transition-all duration-300 cursor-pointer shadow-lg"
                >
                  <PrinterIcon size={14} />
                  <span>طباعة الكشف</span>
                </button>
                <button onClick={() => setShowSupplierHistoryModal(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                  <XIcon size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6" dir="rtl">
              
              {/* Purchases List */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-md font-bold text-white mb-4 border-b border-white/5 pb-2">سجل فواتير الشراء والتوريد</h4>
                {selectedHistorySupplier.purchaseOrders && selectedHistorySupplier.purchaseOrders.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="p-3">رقم الفاتورة</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">الإجمالي قبل الضريبة</th>
                          <th className="p-3">قيمة الضريبة</th>
                          <th className="p-3">الإجمالي الصافي</th>
                          <th className="p-3 text-center no-print">طباعة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {selectedHistorySupplier.purchaseOrders.map((ord: any) => (
                          <tr key={ord.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono font-bold text-white">{ord.billNumber}</td>
                            <td className="p-3 font-mono text-xs text-slate-300">{new Date(ord.date || ord.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                            <td className="p-3 font-mono text-slate-300">{ord.totalAmount.toFixed(2)} ج.م</td>
                            <td className="p-3 font-mono text-slate-400">{ord.taxAmount.toFixed(2)} ج.م</td>
                            <td className="p-3 font-mono text-purple-400 font-bold">{ord.netAmount.toFixed(2)} ج.م</td>
                            <td className="p-3 text-center no-print">
                              <button 
                                onClick={() => {
                                  setSelectedPurchase({ ...ord, supplier: selectedHistorySupplier });
                                  setShowPurchaseDetailModal(true);
                                }}
                                className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-lg transition-colors cursor-pointer"
                              ><PrinterIcon size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 font-bold text-sm">لا توجد فواتير شراء مسجلة لهذا المورد</div>
                )}
              </div>

              {/* Payments/Expenses List */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-md font-bold text-white mb-4 border-b border-white/5 pb-2">سجل سندات الصرف والمدفوعات للمورد</h4>
                {selectedHistorySupplier.expenses && selectedHistorySupplier.expenses.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          <th className="p-3">رقم سند الصرف</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">البنك/الخزينة</th>
                          <th className="p-3">ملاحظات</th>
                          <th className="p-3">المبلغ الصادر</th>
                          <th className="p-3 text-center">طباعة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {selectedHistorySupplier.expenses.map((exp: any) => (
                          <tr key={exp.id} className="hover:bg-white/5">
                            <td className="p-3 font-mono font-bold text-white">{exp.expenseNumber}</td>
                            <td className="p-3 font-mono text-xs text-slate-300">{new Date(exp.date || exp.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                            <td className="p-3 font-bold text-slate-300">{exp.bank?.name || 'الخزينة/البنك'}</td>
                            <td className="p-3 text-slate-400 text-xs">{exp.notes || '-'}</td>
                            <td className="p-3 font-mono text-red-400 font-bold">{exp.amount.toFixed(2)} ج.م</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => {
                                  setSelectedExpense({ ...exp, supplier: selectedHistorySupplier });
                                  setShowExpenseReceiptModal(true);
                                }}
                                className="text-slate-400 hover:text-white bg-white/5 p-1.5 rounded-lg transition-colors cursor-pointer"
                              ><PrinterIcon size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 font-bold text-sm">لا توجد سندات صرف مسجلة لهذا المورد</div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: SUPPLIER FORM MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isEditingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">أدخل بيانات المورد لتسجيل فواتير الشراء وسندات الصرف</p>
              </div>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-4 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">اسم المورد / الشركة *</label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: شركة النيل للبتروكيماويات"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block mb-1">رقم التلفون</label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="مثال: 01021683030"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block mb-1">العنوان</label>
                  <input
                    type="text"
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="مثال: القاهرة - العبور"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block mb-1">السجل التجاري</label>
                  <input
                    type="text"
                    value={supplierForm.cr}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, cr: e.target.value }))}
                    placeholder="رقم السجل التجاري"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    value={supplierForm.trn}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, trn: e.target.value }))}
                    placeholder="الرقم الضريبي للمورد"
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">الرصيد الافتتاحي (مديونية)</label>
                <input
                  type="number"
                  step="0.01"
                  value={supplierForm.balance}
                  onChange={(e) => setSupplierForm(prev => ({ ...prev, balance: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-entlaq-red text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-500/10 disabled:opacity-50"
                >
                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : null}
                  حفظ البيانات
                </button>
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 10: PURCHASE (فاتورة مشتريات) FORM MODAL */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                  <ShoppingBagIcon className="text-orange-400" size={18} />
                  إنشاء فاتورة مشتريات جديدة
                </h3>
                <p className="text-xs text-slate-400 mt-1">سيتم تحديث المخزون تلقائياً عند حفظ الفاتورة</p>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar text-right flex-1" dir="rtl">

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 block mb-1">رقم فاتورة التوريد *</label>
                    <input
                      type="text"
                      required
                      disabled
                      value={purchaseForm.billNumber}
                      className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 block mb-1">المورد *</label>
                    <select
                      required
                      value={purchaseForm.supplierId}
                      onChange={(e) => setPurchaseForm((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-bold"
                    >
                      <option value="">-- اختر المورد --</option>
                      {suppliers.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items section */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="bg-slate-950 px-4 py-2 flex justify-between items-center">
                    <h4 className="text-sm font-bold text-slate-300">أصناف الفاتورة</h4>
                    <button
                      type="button"
                      onClick={() => setPurchaseForm((prev: any) => ({
                        ...prev,
                        items: [...prev.items, { productId: '', quantity: '1', unitCost: '' }]
                      }))}
                      className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-lg hover:bg-orange-500/30 transition-all cursor-pointer flex items-center gap-1 font-bold"
                    >
                      <PlusIcon size={12} /> إضافة صنف
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {purchaseForm.items.length === 0 && (
                      <p className="text-center text-slate-500 text-xs py-4">اضغط على "إضافة صنف" لبدء إدخال أصناف الفاتورة</p>
                    )}
                    {purchaseForm.items.map((item: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-center">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const newItems = [...purchaseForm.items];
                            const prod = products.find((p: any) => p.id === e.target.value);
                            newItems[idx] = { ...newItems[idx], productId: e.target.value, unitCost: prod?.costPrice?.toString() || '' };
                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));
                          }}
                          className="bg-slate-950 border border-white/10 rounded-lg py-1.5 px-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                        >
                          <option value="">-- اختر الصنف --</option>
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.size}) - {p.code}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...purchaseForm.items];
                            newItems[idx] = { ...newItems[idx], quantity: e.target.value };
                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));
                          }}
                          placeholder="الكمية"
                          className="bg-white/5 border border-white/10 rounded-lg py-1.5 px-2 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-center"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => {
                            const newItems = [...purchaseForm.items];
                            newItems[idx] = { ...newItems[idx], unitCost: e.target.value };
                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));
                          }}
                          placeholder="سعر التكلفة"
                          className="bg-white/5 border border-white/10 rounded-lg py-1.5 px-2 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = purchaseForm.items.filter((_: any, i: number) => i !== idx);
                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));
                          }}
                          className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg p-1.5 hover:bg-red-500/20 transition-all cursor-pointer"
                        >
                          <Trash2Icon size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                {purchaseForm.items.length > 0 && (
                  <div className="bg-slate-950 border border-white/10 rounded-xl p-3 text-sm font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>عدد الأصناف:</span>
                      <span className="text-white font-bold">{purchaseForm.items.length} صنف</span>
                    </div>
                    <div className="flex justify-between text-slate-400 mt-1">
                      <span>إجمالي الكميات:</span>
                      <span className="text-white font-bold">
                        {purchaseForm.items.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0)} وحدة
                      </span>
                    </div>
                    <div className="flex justify-between text-orange-400 mt-1 border-t border-white/5 pt-1">
                      <span>إجمالي التكلفة (بدون ضريبة):</span>
                      <span className="font-bold">
                        {purchaseForm.items.reduce((sum: number, i: any) => sum + ((Number(i.quantity) || 0) * (Number(i.unitCost) || 0)), 0).toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-800 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-orange-600 transition-all cursor-pointer shadow-lg shadow-orange-500/10 disabled:opacity-50"
                >
                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : <CheckCircle2Icon size={16} />}
                  حفظ الفاتورة وتحديث المخزون
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPurchaseModal(false); setPurchaseForm({ billNumber: '', supplierId: '', items: [] }); }}
                  className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 11: EXPENSE PAYMENT (سند صرف مورد) FORM MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex gap-2 items-center">
                  <BanknoteIcon className="text-purple-400" size={18} />
                  إصدار سند صرف مورد
                </h3>
                <p className="text-xs text-slate-400 mt-1">سيتم خصم المبلغ من الخزينة وتخفيض رصيد المورد</p>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-4 space-y-3" dir="rtl">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">المورد *</label>
                <select
                  required
                  value={expenseForm.supplierId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, supplierId: e.target.value }))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-bold"
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} (مديونية: {Number(s.balance).toFixed(2)} ج.م)</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">البنك / الخزينة *</label>
                <select
                  required
                  value={expenseForm.bankId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, bankId: e.target.value }))}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-bold"
                >
                  <option value="">-- اختر البنك أو الخزينة --</option>
                  {banks.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name} (رصيد: {b.balance.toFixed(2)} ج.م)</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">المبلغ المدفوع *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono text-xl text-purple-400"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">رقم الشيك / المرجع</label>
                <input
                  type="text"
                  value={expenseForm.reference}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                  placeholder="مثال: شيك رقم 12345"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 block mb-1">البيان / الملاحظات</label>
                <input
                  type="text"
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  placeholder="مثال: دفعة تحت الحساب للمورد"
                />
              </div>
              <div className="pt-4 border-t border-slate-800 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-bold flex gap-2 items-center justify-center hover:bg-purple-700 transition-all cursor-pointer shadow-lg shadow-purple-500/10 disabled:opacity-50"
                >
                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : <BanknoteIcon size={16} />}
                  إصدار سند الصرف
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="bg-white/5 text-slate-300 px-6 py-2 rounded-lg font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 12: EXPENSE RECEIPT PRINT MODAL (سند صرف مورد - طباعة) */}
      {showExpenseReceiptModal && selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-expense-receipt" className="bg-white text-black w-full max-w-2xl rounded-md shadow-2xl flex flex-col max-h-[95vh] relative print:max-h-none print:shadow-none print:bg-white">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center no-print text-white rounded-t-md">
              <h3 className="text-lg font-bold flex items-center gap-2"><PrinterIcon size={20} className="text-purple-400" /> طباعة سند الصرف</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-purple-600 px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 transition-colors cursor-pointer">
                  طباعة السند
                </button>
                <button onClick={() => setShowExpenseReceiptModal(false)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"><XIcon size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 font-sans print:p-0 print:overflow-visible">
              {/* Receipt Header */}
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                <div className="text-right">
                  <h1 className="text-2xl font-black mb-1 tracking-wide">شركة الإنطلاق</h1>
                  <p className="text-xs font-bold">لتصنيع وتوريد خراطيم ومواسير الكهرباء</p>
                  <p className="text-[10px]">العاشر من رمضان - المنطقة الصناعية الثالثة</p>
                </div>
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-1 border border-gray-300 rounded-lg flex items-center justify-center p-1 bg-gray-50">
                    <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="text-left" dir="rtl">
                  <h2 className="text-lg font-bold border-2 border-black px-4 py-1 rounded-md inline-block">سند صرف (Payment Voucher)</h2>
                  <p className="text-xs mt-2 font-mono">رقم السند: {selectedExpense.expenseNumber}</p>
                  <p className="text-xs font-mono">التاريخ: {new Date(selectedExpense.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                </div>
              </div>

              {/* Receipt Body */}
              <div className="space-y-6 text-right leading-loose text-base" dir="rtl">
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-36 shrink-0">صُرف إلى / دُفع لـ:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1 font-bold text-lg">{selectedExpense.supplier?.name}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-36 shrink-0">مبلغ وقدره:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1 font-mono font-bold bg-gray-100/50 px-2 text-center text-xl tracking-wider">
                    {Number(selectedExpense.amount).toFixed(2)} ج.م
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-36 shrink-0">وذلك عن:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1">{selectedExpense.notes || 'سداد دفعة للمورد'}</span>
                </div>
                {selectedExpense.reference && (
                  <div className="flex gap-2 items-center">
                    <span className="font-bold w-36 shrink-0">رقم الشيك / المرجع:</span>
                    <span className="flex-1 border-b border-dashed border-black pb-1 font-mono">{selectedExpense.reference}</span>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <span className="font-bold w-36 shrink-0">خزينة / بنك:</span>
                  <span className="flex-1 border-b border-dashed border-black pb-1">{selectedExpense.bank?.name}</span>
                </div>
              </div>

              {/* Signatures */}
              <div className="flex justify-between mt-12 px-8 text-center text-sm font-bold" dir="rtl">
                <div>
                  <p className="mb-8">المدير المالي / المفوض بالصرف</p>
                  <p className="border-t border-black pt-1 w-40">التوقيع</p>
                </div>
                <div>
                  <p className="mb-8">المستلم (المورد)</p>
                  <p className="border-t border-black pt-1 w-40">التوقيع</p>
                </div>
              </div>

              {/* Stub */}
              <div className="mt-16 pt-8 border-t-2 border-dashed border-gray-400 relative">
                <div className="absolute top-[-11px] left-1/2 -translate-x-1/2 bg-white px-4 text-gray-500 text-xs flex gap-2 items-center">
                  <span className="text-xl">✂️</span>
                  القص هنا (كعب السند)
                </div>
                <div className="flex justify-between items-start mb-4" dir="rtl">
                  <div>
                    <h3 className="font-bold text-base">كعب سند الصرف - نسخة الشركة</h3>
                    <p className="text-xs mt-1 font-mono">رقم السند: {selectedExpense.expenseNumber}</p>
                  </div>
                  <div className="text-left font-mono font-bold text-lg bg-gray-100 px-4 py-2 border border-gray-300">
                    {Number(selectedExpense.amount).toFixed(2)} ج.م
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-8" dir="rtl">
                  <div><span className="font-bold">المورد:</span> {selectedExpense.supplier?.name}</div>
                  <div><span className="font-bold font-mono">التاريخ:</span> {new Date(selectedExpense.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
                  <div className="col-span-2"><span className="font-bold">البيان:</span> {selectedExpense.notes || 'سداد دفعة للمورد'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 13: PURCHASE DETAIL & PRINT MODAL */}
      {showPurchaseDetailModal && selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-invoice" className="bg-white text-black w-full max-w-4xl rounded-md shadow-2xl flex flex-col max-h-[95vh] relative print:max-h-none print:shadow-none print:bg-white">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center no-print text-white rounded-t-md">
              <h3 className="text-lg font-bold flex items-center gap-2"><PrinterIcon size={20} className="text-purple-400" /> فاتورة الشراء التفصيلية</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-purple-600 px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 transition-colors cursor-pointer">
                  طباعة الفاتورة
                </button>
                <button onClick={() => setShowPurchaseDetailModal(false)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"><XIcon size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 font-sans print:p-0 print:overflow-visible">
              {/* Invoice Header */}
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                <div className="text-right">
                  <h1 className="text-2xl font-black mb-1 tracking-wide">شركة الإنطلاق</h1>
                  <p className="text-xs font-bold">لتصنيع وتوريد خراطيم ومواسير الكهرباء</p>
                  <p className="text-[10px]">العاشر من رمضان - المنطقة الصناعية الثالثة</p>
                </div>
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-1 border border-gray-300 rounded-lg flex items-center justify-center p-1 bg-gray-50">
                    <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="text-left" dir="rtl">
                  <h2 className="text-lg font-bold border-2 border-black px-4 py-1 rounded-md inline-block">فاتورة شراء / توريد</h2>
                  <p className="text-xs mt-2 font-mono">رقم الفاتورة: {selectedPurchase.billNumber}</p>
                  <p className="text-xs font-mono">التاريخ: {new Date(selectedPurchase.date || selectedPurchase.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                </div>
              </div>

              {/* Parties Details */}
              <div className="grid grid-cols-2 gap-8 border-b-2 border-black pb-6 mb-6 text-sm" dir="rtl">
                <div className="space-y-1.5 text-right">
                  <h3 className="font-bold text-gray-500 border-b border-gray-200 pb-1 mb-2">بيانات المورد (Supplier):</h3>
                  <div><span className="font-bold">الاسم:</span> {selectedPurchase.supplier?.name}</div>
                  {selectedPurchase.supplier?.phone && <div><span className="font-bold">الهاتف:</span> {selectedPurchase.supplier.phone}</div>}
                  {selectedPurchase.supplier?.address && <div><span className="font-bold">العنوان:</span> {selectedPurchase.supplier.address}</div>}
                  {selectedPurchase.supplier?.cr && <div><span className="font-bold">السجل التجاري:</span> {selectedPurchase.supplier.cr}</div>}
                  {selectedPurchase.supplier?.trn && <div><span className="font-bold">الرقم الضريبي:</span> {selectedPurchase.supplier.trn}</div>}
                </div>
                <div className="space-y-1.5 text-right">
                  <h3 className="font-bold text-gray-500 border-b border-gray-200 pb-1 mb-2">بيانات المستلم (Buyer):</h3>
                  <div><span className="font-bold">المستلم:</span> شركة الإنطلاق لمواسير الكهرباء</div>
                  <div><span className="font-bold">الرقم الضريبي:</span> 442-563-120</div>
                  <div><span className="font-bold">العنوان:</span> العاشر من رمضان - المنطقة الصناعية الثالثة</div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-8" dir="rtl">
                <table className="w-full text-right text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-black text-black">
                      <th className="p-3 font-bold border border-black">م</th>
                      <th className="p-3 font-bold border border-black">كود الصنف</th>
                      <th className="p-3 font-bold border border-black">اسم الصنف / المقاس / اللون</th>
                      <th className="p-3 font-bold border border-black text-center">الكمية الواردة</th>
                      <th className="p-3 font-bold border border-black text-left">سعر الوحدة</th>
                      <th className="p-3 font-bold border border-black text-left">قيمة الضريبة (14%)</th>
                      <th className="p-3 font-bold border border-black text-left">الإجمالي الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPurchase.items?.map((item: any, idx: number) => (
                      <tr key={item.id} className="border-b border-gray-300 text-black">
                        <td className="p-3 border border-black text-center">{idx + 1}</td>
                        <td className="p-3 border border-black font-mono">{item.product?.code}</td>
                        <td className="p-3 border border-black font-bold">
                          {item.product?.name} {item.product?.size} {item.product?.color ? `(${item.product.color})` : ''}
                        </td>
                        <td className="p-3 border border-black text-center font-mono">{item.quantity}</td>
                        <td className="p-3 border border-black text-left font-mono">{Number(item.unitCost).toFixed(2)} ج.م</td>
                        <td className="p-3 border border-black text-left font-mono">{Number(item.taxAmount).toFixed(2)} ج.م</td>
                        <td className="p-3 border border-black text-left font-mono font-bold">{Number(item.total).toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Table */}
              <div className="flex justify-start text-sm" dir="rtl">
                <div className="w-72 border border-black rounded p-3 space-y-2 bg-gray-50">
                  <div className="flex justify-between">
                    <span className="font-bold">المجموع قبل الضريبة:</span>
                    <span className="font-mono">{selectedPurchase.totalAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">ضريبة القيمة المضافة:</span>
                    <span className="font-mono">{selectedPurchase.taxAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between border-t border-black pt-1.5 text-base font-black">
                    <span>الإجمالي شامل الضريبة:</span>
                    <span className="font-mono">{selectedPurchase.netAmount.toFixed(2)} ج.م</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL 14: GENERAL TABLE PRINT MODAL */}
      {printTableData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div id="printable-table" className="bg-white text-black w-full max-w-5xl rounded-md shadow-2xl flex flex-col max-h-[95vh] relative print:max-h-none print:shadow-none print:bg-white">
            <div className="p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center no-print text-white rounded-t-md">
              <h3 className="text-lg font-bold flex items-center gap-2"><PrinterIcon size={20} className="text-purple-400" /> طباعة الجدول: {printTableData.title}</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-purple-600 px-5 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 transition-colors cursor-pointer">
                  بدء الطباعة
                </button>
                <button onClick={() => setPrintTableData(null)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"><XIcon size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 font-sans print:p-0 print:overflow-visible">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black mb-1">شركة الإنطلاق لمواسير الكهرباء</h1>
                <h2 className="text-lg font-bold mt-2 border-b border-black pb-2 inline-block px-8">{printTableData.title}</h2>
                <p className="text-xs text-slate-500 font-mono mt-2" dir="rtl">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
              </div>

              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-black text-black">
                    {printTableData.headers.map((h, i) => (
                      <th key={i} className="p-2 font-bold border border-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {printTableData.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-300 text-black">
                      {row.map((cell, cidx) => (
                        <td key={cidx} className="p-2 border border-black">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
