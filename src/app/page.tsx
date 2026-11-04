"use client";



import React, { useState, useEffect, useCallback, useRef } from 'react';

import QRCode from 'qrcode';
import { customerInPeriod, inAccountPeriod, statementTotals, supplierInPeriod, type StatementDiscount } from '@/lib/account-period';
import { buildBankStatement } from '@/lib/bank-statement';
import AccountStatement from '@/components/AccountStatement';
import ItemMovementsReport from '@/components/ItemMovementsReport';
import ProductionResetPanel from '@/components/ProductionResetPanel';
import CollapsiblePanel from '@/components/CollapsiblePanel';
import DiscountsPanel, { type DiscountKind } from '@/components/DiscountsPanel';
import MoneyInput from '@/components/MoneyInput';
import StocktakePanel from '@/components/StocktakePanel';
import ProductOptionField, { initialProductOptions, requestExpenseCategories, requestProductOptions, type ProductOptionLists } from '@/components/ProductOptionField';
import QuotationEdit, { type EditableQuotation } from '@/components/QuotationEdit';
import InvoiceDetailsEdit, { type EditableInvoiceDetails } from '@/components/InvoiceDetailsEdit';
import QuotationPricingDraft from '@/components/QuotationPricingDraft';
import { confirmQuotationProfit, type PricingLine } from '@/lib/quotation-pricing';
import BankTransfersPanel, { type BankTransfer, type TransferSnapshot } from '@/components/BankTransfersPanel';
import { formatMoney as formatTotal, normalizeMoneyInput } from '@/lib/money-format';
import { purchaseTaxRate } from '@/lib/document-edits';
import ProductCardDetails, { ProductCardHeader } from '@/components/ProductCardDetails';
import { BankTransferPrint, DiscountPrint, InvoicePrint, ReceiptPrint, ReturnPrint, StocktakePrint, TablePrint, type PrintAccountDiscount, type PrintBankTransfer, type PrintStocktake, type PrintTableData } from '@/components/PrintDocuments';

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

  LandmarkIcon,

  CameraIcon,

  AlertTriangleIcon,

  LayoutGridIcon

} from 'lucide-react';



type DocumentEdit = { id: string; updatedAt: string | Date; date: string; originalDate: string | Date };
type EditableExpense = {
  id: string; updatedAt: string | Date; date: string | Date; createdAt: string | Date;
  bankId: string; amount: number; notes?: string | null; reference?: string | null;
};
type EditablePurchase = {
  id: string; updatedAt: string | Date; date: string | Date; createdAt: string | Date;
  billNumber: string; warehouseReceiptNumber?: string | null; supplierId: string; invoiceType: string;
  items: { id?: string; productId: string; quantity: number; unitCost: number;
    product?: { code?: string; name?: string; type?: string; size?: string; color?: string | null } }[];
};

const getProductImage = (type: string) => {

  switch (type) {

    case 'مواسير': return '/images/pipes.png';

    case 'خراطيم': return '/images/hoses.png';

    case 'بواط':

    case 'علب':

    case 'أكواع':

    case 'أفيز':

    case 'جلب':

    case 'سسته':

    case 'اسلاك':

      return '/images/accessories.png';

    default:

      return '/images/pipes.png';

  }

};



const getProductColorBorderClass = (colorName: string) => {

  if (!colorName) return 'border-white/5';

  const color = colorName.trim();

  if (color.includes('أحمر') || color.includes('احمر')) return 'border-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.1)]';

  if (color.includes('أزرق') || color.includes('ازرق')) return 'border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.1)]';

  if (color.includes('أخضر') || color.includes('اخضر')) return 'border-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.1)]';

  if (color.includes('أصفر') || color.includes('اصفر')) return 'border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.1)]';

  if (color.includes('أسود') || color.includes('اسود')) return 'border-slate-700 shadow-[0_0_8px_rgba(51,65,85,0.1)]';

  if (color.includes('أبيض') || color.includes('ابيض')) return 'border-white/50 shadow-[0_0_8px_rgba(255,255,255,0.1)]';

  if (color.includes('برتقالي')) return 'border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.1)]';

  if (color.includes('جملي') || color.includes('بني')) return 'border-amber-600/50 shadow-[0_0_8px_rgba(217,119,6,0.1)]';

  if (color.includes('رصاصي') || color.includes('رمادي')) return 'border-slate-400/50 shadow-[0_0_8px_rgba(148,163,184,0.1)]';

  return 'border-white/5';

};



const getCategoryNameAr = (type: string) => {

  return type || 'أخرى';

};



const getCategoryBadgeClass = (type: string) => {

  switch (type) {

    case 'مواسير': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';

    case 'خراطيم': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';

    case 'بواط': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';

    case 'سسته': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';

    case 'أكواع': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

    case 'علب': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';

    case 'أفيز': return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';

    case 'جلب': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';

    case 'اسلاك': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';

    default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';

  }

};



const getProductDescription = (type: string, name: string) => {

  if (type === 'مواسير') {

    return 'مواسير الإنطلاق UPVC مصنعة بأعلى معايير الجودة لمقاومة الصدمات والضغط الميكانيكي، ومصممة خصيصاً لتمديدات شبكات الكهرباء ومقاومة للأحماض والقلويات والحرائق.';

  } else if (type === 'خراطيم') {

    return 'خراطيم الإنطلاق المرنة المقاومة للحريق ومصممة خصيصاً لتحمل درجات الحرارة العالية وسهولة الانحناء والتمديد داخل الجدران والأسقف الخرسانية والجبسية.';

  } else if (type === 'اسلاك') {

    return 'أسلاك الإنطلاق الكهربائية النحاسية المعزولة، مصنعة وفق معايير الجودة لتوصيل آمن وكفاءة عالية في تمديدات المباني والمنشآت، ومقاومة للحرارة والرطوبة.';

  } else {

    return `إكسسوارات وقطع غيار ${name} من مصنع الانطلاق، مصنعة من مواد UPVC عالية الجودة والمضادة للحريق لضمان عزل وتوصيل آمن للمواسير والوصلات الكهربائية.`;

  }

};

type ReturnInvoiceItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  product?: { name?: string; code?: string } | null;
};
type ReturnRecordSummary = {
  id?: string;
  returnNumber?: string;
  netAmount?: number;
  taxAmount?: number;
  refundAmount?: number;
  createdAt?: string | Date;
  items?: { orderItemId: string; quantity: number }[];
};
type PaymentCorrectionSnapshot = {
  customerId: string;
  bankId: string;
  amount: number;
  reference: string | null;
  notes: string | null;
  date: string | Date;
};
type PaymentCorrectionHistoryEntry = {
  correctedAt: string;
  before: PaymentCorrectionSnapshot;
  after: PaymentCorrectionSnapshot;
};
type EditablePayment = {
  id: string;
  customerId: string;
  bankId: string;
  amount: number;
  reference: string | null;
  notes: string | null;
  date: string | Date;
  correctionHistory?: string | null;
};
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isPaymentCorrectionSnapshot = (value: unknown): value is PaymentCorrectionSnapshot =>
  isObjectRecord(value)
  && typeof value.customerId === 'string'
  && typeof value.bankId === 'string'
  && typeof value.amount === 'number'
  && (typeof value.reference === 'string' || value.reference === null)
  && (typeof value.notes === 'string' || value.notes === null)
  && (typeof value.date === 'string' || value.date instanceof Date);
function isPaymentCorrectionHistoryEntry(value: unknown): value is PaymentCorrectionHistoryEntry {
  return isObjectRecord(value)
    && typeof value.correctedAt === 'string'
    && isPaymentCorrectionSnapshot(value.before)
    && isPaymentCorrectionSnapshot(value.after);
}
type InvoiceSalesSummary = {
  netAmount?: number;
  taxAmount?: number;
  isQuotation?: boolean;
  orderReturns?: ReturnRecordSummary[];
};
type ReturnPreviewItem = { orderItemId: string; quantity: number; amount: number; tax: number; net: number };
type ReturnDialogInvoice = {
  id: string;
  invoiceNumber: string;
  customerId?: string | null;
  customer?: { name?: string | null } | null;
  customerName?: string | null;
  items: ReturnInvoiceItem[];
  orderReturns?: ReturnRecordSummary[];
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

      return ['POS', 'CUSTOMERS', 'INVOICES', 'PAYMENTS', 'ITEM_REPORTS', 'DISCOUNTS'].includes(tab);

    }

    if (currentUser.role === 'STOREKEEPER') {

      return ['INVENTORY', 'STOCKTAKE', 'SUPPLIERS', 'PURCHASES', 'ITEM_REPORTS', 'DISCOUNTS'].includes(tab);

    }

    return false;

  };



  const [isMounted, setIsMounted] = useState(false);

  const [products, setProducts] = useState<any[]>([]);

  const [customers, setCustomers] = useState<any[]>([]);
  const [customersReady, setCustomersReady] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [suppliersReady, setSuppliersReady] = useState(false);
  const [suppliersError, setSuppliersError] = useState('');
  const accountRequestVersions = useRef({ customer: 0, supplier: 0 });
  const [selectedDiscountPrint, setSelectedDiscountPrint] = useState<PrintAccountDiscount | null>(null);

  const openDiscountPrint = (discount: StatementDiscount, kind: DiscountKind, partyName: string) => {
    const date = discount.date || discount.createdAt;
    if (!date || !Number.isFinite(new Date(date).getTime())) {
      alert('تعذر طباعة سند الخصم بسبب تاريخ غير صالح.');
      return;
    }
    setSelectedDiscountPrint({
      discountNumber: discount.discountNumber, kind, partyName, date,
      amount: discount.amount, notes: discount.notes
    });
  };



  const [banks, setBanks] = useState<any[]>([]);

  const [payments, setPayments] = useState<any[]>([]);

  const [invoices, setInvoices] = useState<any[]>([]);

  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);

  const [selectedHistoryCustomerRaw, setSelectedHistoryCustomer] = useState<any>(null);

  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const currentHistoryCustomer = selectedHistoryCustomerRaw
    && (customers.find(customer => customer.id === selectedHistoryCustomerRaw.id) || selectedHistoryCustomerRaw);
  const selectedHistoryCustomer = currentHistoryCustomer
    && customerInPeriod(currentHistoryCustomer, stmtFrom, stmtTo);
  const renderStatementPeriod = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const setMonth = (value: string) => {
      if (!value) {
        setStmtFrom('');
        setStmtTo('');
        return;
      }
      const [y, m] = value.split('-').map(Number);
      setStmtFrom(`${y}-${pad(m)}-01`);
      setStmtTo(`${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`);
    };
    const inputClass = 'bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none';
    return (
      <div className="flex flex-wrap gap-2 items-center text-xs text-slate-300 font-bold no-print">
        <span>من</span>
        <input type="date" value={stmtFrom} max={stmtTo || undefined} onChange={(e) => setStmtFrom(e.target.value)} className={inputClass} />
        <span>إلى</span>
        <input type="date" value={stmtTo} min={stmtFrom || undefined} onChange={(e) => setStmtTo(e.target.value)} className={inputClass} />
        <span>أو شهر</span>
        <input
          type="month"
          value={stmtFrom && stmtFrom.slice(0, 7) === stmtTo.slice(0, 7) ? stmtFrom.slice(0, 7) : ''}
          onChange={(e) => setMonth(e.target.value)}
          className={inputClass}
        />
        {(stmtFrom || stmtTo) && (
          <button
            onClick={() => { setStmtFrom(''); setStmtTo(''); }}
            className="px-2 py-1 rounded-sm bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer"
          >
            عرض الكل
          </button>
        )}
      </div>
    );
  };
  const renderTotalsBar = (
    cards: { label: string; value: string; tone?: 'red' | 'green' | 'white' }[],
    withPeriod: boolean
  ) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const setMonth = (value: string) => {
      if (!value) {
        setTotalsFrom('');
        setTotalsTo('');
        return;
      }
      const [y, m] = value.split('-').map(Number);
      setTotalsFrom(`${y}-${pad(m)}-01`);
      setTotalsTo(`${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`);
    };
    const inputClass = 'bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none';
    const toneClass = { red: 'text-red-400', green: 'text-emerald-400', white: 'text-white' };
    return (
      <div className="flex flex-row flex-nowrap items-center gap-2 no-print min-w-max">
        {withPeriod && (
          <div className="flex flex-nowrap gap-1.5 items-center text-xs text-slate-300 font-bold shrink-0">
            <span>من</span>
            <input type="date" value={totalsFrom} max={totalsTo || undefined} onChange={(e) => setTotalsFrom(e.target.value)} className={`${inputClass} w-[132px]`} />
            <span>إلى</span>
            <input type="date" value={totalsTo} min={totalsFrom || undefined} onChange={(e) => setTotalsTo(e.target.value)} className={`${inputClass} w-[132px]`} />
            <span>أو شهر</span>
            <input
              type="month"
              value={totalsFrom && totalsFrom.slice(0, 7) === totalsTo.slice(0, 7) ? totalsFrom.slice(0, 7) : ''}
              onChange={(e) => setMonth(e.target.value)}
              className={`${inputClass} w-[112px]`}
            />
            {(totalsFrom || totalsTo) && (
              <button
                onClick={() => { setTotalsFrom(''); setTotalsTo(''); }}
                className="px-2 py-1 rounded-sm bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer"
              >
                عرض الكل
              </button>
            )}
          </div>
        )}
        <div className="flex flex-nowrap gap-1.5 items-center">
          {cards.map((c) => (
            <div key={c.label} className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center min-w-[120px] shrink-0">
              <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">{c.label}</span>
              <span className={`text-sm font-black font-mono whitespace-nowrap ${toneClass[c.tone || 'white']}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };



  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [editingPayment, setEditingPayment] = useState<EditablePayment | null>(null);

  const [paymentCorrectionHistory, setPaymentCorrectionHistory] = useState<PaymentCorrectionHistoryEntry[]>([]);

  const [paymentCustomer, setPaymentCustomer] = useState<any>(null);

  const [paymentForm, setPaymentForm] = useState({ customerId: '', amount: '', bankId: '', reference: '', notes: '', date: '' });

  const [bankForm, setBankForm] = useState<{ id?: string; name: string; accountNumber: string; balance: string }>({ name: '', accountNumber: '', balance: '' });

  const [isBankModalOpen, setIsBankModalOpen] = useState(false);

  const [isEditingBank, setIsEditingBank] = useState(false);





  // Suppliers, Purchases and Expenses states

  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [purchases, setPurchases] = useState<any[]>([]);

  const [expenses, setExpenses] = useState<any[]>([]);

  const [supplierSearch, setSupplierSearch] = useState('');

  const [bankSearch, setBankSearch] = useState('');

  const [selectedBankStatement, setSelectedBankStatement] = useState<any>(null);
  const [bankTransfers, setBankTransfers] = useState<BankTransfer[]>([]);
  const [transfersReady, setTransfersReady] = useState(false);
  const [transferLaunch, setTransferLaunch] = useState<string | null>(null);
  const [printBankTransfer, setPrintBankTransfer] = useState<PrintBankTransfer | null>(null);
  const applyTransferSnapshot = useCallback((data: TransferSnapshot) => {
    setBanks(data.banks);
    setBankTransfers(data.transfers);
    setTransfersReady(true);
  }, []);
  const markTransfersLoading = useCallback(() => setTransfersReady(false), []);
  const closeTransferLaunch = useCallback(() => setTransferLaunch(null), []);

  const [bankStatementFrom, setBankStatementFrom] = useState('');

  const [bankStatementTo, setBankStatementTo] = useState('');

  const [paymentSearch, setPaymentSearch] = useState('');

  const [invoiceSearch, setInvoiceSearch] = useState('');

  const [purchaseSearch, setPurchaseSearch] = useState('');

  const [expenseSearch, setExpenseSearch] = useState('');
  
  // GENERAL EXPENSES STATE
  const [generalExpenses, setGeneralExpenses] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [generalExpenseSearch, setGeneralExpenseSearch] = useState('');
  const [showGeneralExpenseModal, setShowGeneralExpenseModal] = useState(false);
  const [generalExpenseForm, setGeneralExpenseForm] = useState({ categoryId: '', bankId: '', amount: '', reference: '', notes: '' });
  const [editingGeneralExpense, setEditingGeneralExpense] = useState<DocumentEdit | null>(null);




  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const [isEditingSupplier, setIsEditingSupplier] = useState(false);

  const [supplierForm, setSupplierForm] = useState({ id: '', name: '', phone: '', address: '', cr: '', trn: '', openingBalance: '0' });

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const [purchaseForm, setPurchaseForm] = useState<any>({ billNumber: '', supplierId: '', invoiceType: 'فاتورة ضريبية', items: [] });
  const [editingPurchase, setEditingPurchase] = useState<DocumentEdit | null>(null);

  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [expenseForm, setExpenseForm] = useState({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });
  const [editingExpense, setEditingExpense] = useState<DocumentEdit | null>(null);

  const [showExpenseReceiptModal, setShowExpenseReceiptModal] = useState(false);

  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  const [showSupplierHistoryModal, setShowSupplierHistoryModal] = useState(false);

  const [selectedHistorySupplierRaw, setSelectedHistorySupplier] = useState<any>(null);
  const currentHistorySupplier = selectedHistorySupplierRaw
    && (suppliers.find(supplier => supplier.id === selectedHistorySupplierRaw.id) || selectedHistorySupplierRaw);
  const selectedHistorySupplier = currentHistorySupplier
    && supplierInPeriod(currentHistorySupplier, stmtFrom, stmtTo);

  const [showPurchaseDetailModal, setShowPurchaseDetailModal] = useState(false);

  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);

  const [printTableData, setPrintTableData] = useState<PrintTableData | null>(null);
  const [printStocktake, setPrintStocktake] = useState<PrintStocktake | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<EditableQuotation | null>(null);
  const [editingInvoiceDetails, setEditingInvoiceDetails] = useState<EditableInvoiceDetails | null>(null);
  const [showQuotationPricing, setShowQuotationPricing] = useState(false);



  // Navigation active tab

  const [activeTab, setActiveTab] = useState<'POS' | 'CUSTOMERS' | 'INVENTORY' | 'STOCKTAKE' | 'BANKS' | 'PAYMENTS' | 'INVOICES' | 'SUPPLIERS' | 'PURCHASES' | 'EXPENSES' | 'GENERAL_EXPENSES' | 'ITEM_REPORTS' | 'PRODUCTION_RESET' | 'DISCOUNTS'>('POS');

  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);



  // Custom Pricing states

  const [showCustomerPricesModal, setShowCustomerPricesModal] = useState(false);

  const [selectedCustomerForPrices, setSelectedCustomerForPrices] = useState<any>(null);

  const [customerPricesMap, setCustomerPricesMap] = useState<Record<string, number>>({});
  const [savingCustomerPrices, setSavingCustomerPrices] = useState(false);
  const customerPriceProducts = [...products].sort((left, right) =>
    Number(customerPricesMap[right.id] !== undefined) - Number(customerPricesMap[left.id] !== undefined)
  );

  const handlePrintCustomPrices = () => {
    if (!selectedCustomerForPrices) return;
    const customProducts = products.filter(product => customerPricesMap[product.id] !== undefined);
    if (!customProducts.length) return;
    setPrintTableData({
      title: `قائمة الأسعار المخصصة للعميل: ${selectedCustomerForPrices.name}`,
      headers: ['اسم الصنف', 'الكود', 'النوع', 'المقاس', 'الدرجة', 'اللون', 'المورد', 'الطول', 'الوزن', 'سعر الكيلو', 'السعر الأساسي', 'السعر المخصص'],
      rows: customProducts.map(product => [
        product.name,
        product.code,
        product.type,
        product.size,
        product.gauge || '—',
        product.color || '—',
        product.supplier?.name || suppliers.find(supplier => supplier.id === product.supplierId)?.name || '—',
        product.length || '—',
        product.weight || '—',
        product.pricePerKilo === null || product.pricePerKilo === undefined ? '—' : formatTotal(product.pricePerKilo),
        formatTotal(Number(product.price)),
        formatTotal(Number(customerPricesMap[product.id]))
      ])
    });
  };

  const handleSaveCustomerPrices = async () => {
    if (!selectedCustomerForPrices || savingCustomerPrices) return;
    const prices = Object.entries(customerPricesMap).map(([productId, price]) => ({ productId, price }));
    if (prices.some(entry => !Number.isFinite(entry.price) || entry.price < 0)) {
      alert('يجب إدخال أسعار صالحة لا تقل عن صفر');
      return;
    }
    setSavingCustomerPrices(true);
    try {
      const desktop = window as Window & {
        electronAPI?: { saveCustomerPrices: (data: { customerId: string; prices: { productId: string; price: number }[] }) => Promise<{ productId: string; price: number }[]> };
      };
      let savedPrices: { productId: string; price: number }[];
      if (desktop.electronAPI) {
        savedPrices = await desktop.electronAPI.saveCustomerPrices({ customerId: selectedCustomerForPrices.id, prices });
      } else {
        const response = await fetch(`/api/customers/${selectedCustomerForPrices.id}/prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prices })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'حدث خطأ أثناء حفظ قائمة الأسعار');
        if (!Array.isArray(result.prices)) throw new Error('استجابة حفظ الأسعار غير صحيحة، يرجى تحديث الخادم');
        savedPrices = result.prices;
      }
      setCustomers(prev => prev.map(customer => customer.id === selectedCustomerForPrices.id
        ? { ...customer, customPrices: savedPrices } : customer));
      setShowCustomerPricesModal(false);
      alert('تم حفظ قائمة الأسعار بنجاح');
    } catch (error) {
      console.error('Error saving customer prices:', error);
      alert(error instanceof Error ? error.message : 'حدث خطأ أثناء حفظ قائمة الأسعار');
    } finally {
      setSavingCustomerPrices(false);
    }
  };

  const [showCustomerCeilingsModal, setShowCustomerCeilingsModal] = useState(false);
  const [selectedCustomerForCeilings, setSelectedCustomerForCeilings] = useState<any>(null);
  const [customerCeilings, setCustomerCeilings] = useState<any[]>([]);
  const [ceilingForm, setCeilingForm] = useState({ productId: '', buildingsCount: '', floorsCount: '6', quantityPerFloor: '' });

  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean, itemId: string, callback?: () => void }>({ isOpen: false, itemId: '' });

  const [passwordInput, setPasswordInput] = useState('');

  const [editingCartPriceId, setEditingCartPriceId] = useState<string | null>(null);

  const [siteReceiptNumber, setSiteReceiptNumber] = useState('');

  const [receiverName, setReceiverName] = useState('');

  const [invoiceType, setInvoiceType] = useState('فاتورة ضريبية');

  const [linkedQuotationId, setLinkedQuotationId] = useState<string | null>(null);



  // Search & Filter states

  const [activeCategory, setActiveCategory] = useState('ALL');

  const [activeSupplier, setActiveSupplier] = useState('ALL');

  const [searchQuery, setSearchQuery] = useState('');

  const [inventorySearchQuery, setInventorySearchQuery] = useState('');

  const [inventoryCategory, setInventoryCategory] = useState('ALL');

  const [customerSearch, setCustomerSearch] = useState('');
  const [totalsFrom, setTotalsFrom] = useState('');
  const [totalsTo, setTotalsTo] = useState('');
  useEffect(() => {
    setTotalsFrom('');
    setTotalsTo('');
  }, [activeTab]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('CASH');





  // Loading and submission states

  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  const [cart, setCart] = useState<any[]>([]);



  // Auto-update cart prices when customer changes

  useEffect(() => {

    if (cart.length === 0) return;



    let defaultDiscount = 0;

    let customerCustomPrices: any[] = [];



    if (selectedCustomerId && selectedCustomerId !== 'CASH' && selectedCustomerId !== 'CREDIT_GENERAL') {

      const c = customers.find(c => c.id === selectedCustomerId);

      if (c) {

        defaultDiscount = c.discount || 0;

        customerCustomPrices = c.customPrices || [];

      }

    }



    setCart(prevCart => prevCart.map(item => {

      // Do not overwrite manually set prices

      if (item.isManualPrice) return item;



      const originalProduct = products.find((p: any) => p.id === item.id);

      if (!originalProduct) return item;



      let newBasePrice = originalProduct.price;

      let appliedDiscount = defaultDiscount;

      const customPriceObj = customerCustomPrices.find(cp => cp.productId === item.id);

      if (customPriceObj) {

        newBasePrice = customPriceObj.price;

        appliedDiscount = 0;

      }



      const newDiscountedPrice = newBasePrice * (1 - appliedDiscount / 100);

      return {

        ...item,

        originalPrice: newBasePrice,

        discountPercent: appliedDiscount,

        price: newDiscountedPrice,

        tax: newDiscountedPrice * originalProduct.taxRate,

      };

    }));

  }, [selectedCustomerId, customers]);



  const handlePriceDoubleClick = (itemId: string) => {

    setPasswordPrompt({ isOpen: true, itemId });

    setPasswordInput('');

  };



  const handlePasswordSubmit = () => {

    if (passwordInput === 'solscas') {

      setPasswordPrompt({ isOpen: false, itemId: '' });

      setEditingCartPriceId(passwordPrompt.itemId);

    } else {

      alert('كلمة المرور غير صحيحة');

    }

  };



  const handleManualPriceChange = (itemId: string, newPriceStr: string) => {

    const newPrice = parseFloat(newPriceStr);

    if (isNaN(newPrice) || newPrice <= 0) return;



    setCart(prev => prev.map(item => {

      if (item.id === itemId) {

        const originalProduct = products.find((p: any) => p.id === item.id);

        const taxRate = originalProduct ? originalProduct.taxRate : 0.14;

        return {

          ...item,

          price: newPrice,

          tax: newPrice * taxRate,

          isManualPrice: true

        };

      }

      return item;

    }));

  };







  // Invoice Modal states

  const [showModal, setShowModal] = useState(false);

  const [invoice, setInvoice] = useState<any>(null);

  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState<ReturnDialogInvoice | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnRefundMethod, setReturnRefundMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [returnBankId, setReturnBankId] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [selectedOrderReturn, setSelectedOrderReturn] = useState<any>(null);
  const [showReturnPrintModal, setShowReturnPrintModal] = useState(false);
  const [showReturnHistoryModal, setShowReturnHistoryModal] = useState(false);
  const [returnHistoryInvoice, setReturnHistoryInvoice] = useState<any>(null);



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

    discount: '0',
    openingBalance: '0'

  });



  // Product Form Modal states

  const [showProductFormModal, setShowProductFormModal] = useState(false);

  const [isEditingProduct, setIsEditingProduct] = useState(false);

  const [productForm, setProductForm] = useState({

    id: '',

    code: '',

    barcode: '',

    name: '',

    type: 'مواسير',

    size: '',

    gauge: '',

    color: '',

    length: '',

    weight: '',

    supplierId: '',

    costPrice: '',

    markup: '30',

    price: '',

    stockQty: '',

    minStockQty: '10',

    maxStockQty: '1000',
    pricePerKilo: '0'

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
        fetch('/api/users?_t=' + Date.now())
          .then(res => res.json())
          .then(data => setDbUsers(Array.isArray(data) ? data : []))
          .catch(console.error);
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
        const res = await fetch('/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: loginUsername, password: loginPassword })
        });
        
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
          if (user.role === 'CASHIER') setActiveTab('POS');
          else if (user.role === 'STOREKEEPER') setActiveTab('INVENTORY');
          else setActiveTab('POS');
        } else {
          const errorData = await res.json();
          setLoginError(errorData.error || 'فشل تسجيل الدخول');
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





  const sortProductsList = (data: any[]) => {
    return data.sort((a, b) => {
      const codeA = String(a.code || '').toLowerCase();
      const codeB = String(b.code || '').toLowerCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      
      const sizeA = String(a.size || '').toLowerCase();
      const sizeB = String(b.size || '').toLowerCase();
      if (sizeA !== sizeB) return sizeA.localeCompare(sizeB, undefined, { numeric: true, sensitivity: 'base' });
      
      const colorA = String(a.color || '').toLowerCase();
      const colorB = String(b.color || '').toLowerCase();
      return colorA.localeCompare(colorB, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const [productOptions, setProductOptions] = useState<ProductOptionLists>(initialProductOptions);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    requestProductOptions(currentUser.sessionToken, { action: 'list' })
      .then(result => { if (active) setProductOptions(result.options); })
      .catch(error => console.error('Failed to load product options:', error));
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.sessionToken]);

  const handleProductOptionsChanged = (options: ProductOptionLists) => {
    setProductOptions(options);
    fetchProducts(true);
  };

  const fetchProducts = (isSilent = false) => {

    if (!isSilent) setLoading(true);

    if (typeof window !== 'undefined' && (window as any).electronAPI) {

      (window as any).electronAPI.getProducts()

        .then((data: any) => {
          const sortedData = sortProductsList(Array.isArray(data) ? data : []);
          setProducts(sortedData);

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

          const sortedData = sortProductsList(Array.isArray(data) ? data : []);
          setProducts(sortedData);

          if (!isSilent) setLoading(false);

        })

        .catch(err => {

          console.error(err);

          if (!isSilent) setLoading(false);

          

        });

    }

  };



  const fetchAccountData = async (kind: 'customer' | 'supplier'): Promise<boolean> => {
    const version = ++accountRequestVersions.current[kind];
    try {
      const desktop = window as Window & {
        electronAPI?: { getCustomers: () => Promise<unknown>; getSuppliers: () => Promise<unknown> };
      };
      let data: unknown;
      if (desktop.electronAPI) {
        data = await (kind === 'customer' ? desktop.electronAPI.getCustomers() : desktop.electronAPI.getSuppliers());
      } else {
        const response = await fetch(kind === 'customer' ? '/api/customers' : '/api/suppliers');
        data = await response.json();
        if (!response.ok) {
          const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error : 'تعذر تحميل بيانات الحسابات.';
          throw new Error(message);
        }
      }
      if (!Array.isArray(data) || data.some(account =>
        !account || typeof account !== 'object' || !Array.isArray(account.discounts))) {
        throw new Error('بيانات الخصومات غير متاحة. حدّث الخادم والمحطة إلى الإصدار نفسه.');
      }
      if (version !== accountRequestVersions.current[kind]) return false;
      if (kind === 'customer') {
        setCustomers(data);
        setCustomersReady(true);
        setCustomersError('');
      } else {
        setSuppliers(data);
        setSuppliersReady(true);
        setSuppliersError('');
      }
      return true;
    } catch (error) {
      console.error(`Error fetching ${kind} accounts:`, error);
      if (version === accountRequestVersions.current[kind]) {
        const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات الحسابات.';
        if (kind === 'customer') {
          setCustomersReady(false);
          setCustomersError(message);
        } else {
          setSuppliersReady(false);
          setSuppliersError(message);
        }
      }
      return false;
    }
  };
  const fetchCustomers = () => fetchAccountData('customer');
  const fetchSuppliers = () => fetchAccountData('supplier');



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




  const fetchGeneralExpenses = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getGeneralExpenses()
        .then((data: any) => setGeneralExpenses(Array.isArray(data) ? data : []))
        .catch(console.error);
    } else {
      fetch('/api/general-expenses?_t=' + Date.now())
        .then(res => res.json())
        .then(data => setGeneralExpenses(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchExpenseCategories = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getExpenseCategories()
        .then((data: any) => setExpenseCategories(Array.isArray(data) ? data : []))
        .catch(console.error);
    } else {
      fetch('/api/expense-categories?_t=' + Date.now())
        .then(res => res.json())
        .then(data => setExpenseCategories(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  };

  const fetchCustomerCeilings = (customerId: string) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getCustomerCeilings(customerId)
        .then(setCustomerCeilings).catch(console.error);
    } else {
      fetch(`/api/customers/${customerId}/ceilings?_t=` + Date.now())
        .then(res => res.json())
        .then(setCustomerCeilings).catch(console.error);
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
      fetchGeneralExpenses();
      fetchExpenseCategories();

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
    setGeneralExpenseSearch('');

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
      fetchGeneralExpenses();
      fetchExpenseCategories();

    }, 5000);

    return () => clearInterval(interval);

  }, [isMounted]);



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

      let basePrice = product.price;

      let appliedDiscount = defaultDiscount;



      if (customer && customer.customPrices) {

        const customPriceObj = customer.customPrices.find((cp: any) => cp.productId === product.id);

        if (customPriceObj) {

          basePrice = customPriceObj.price;

          appliedDiscount = 0; // Ignore customer's global discount if custom price is set

        }

      }



      const discountedPrice = basePrice * (1 - appliedDiscount / 100);

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



      return [...prev, {

        id: product.id,

        code: product.code,

        name: product.name,

        size: product.size,

        color: product.color,

        gauge: product.gauge,

        weight: product.weight,

        supplier: product.supplier,

        originalPrice: basePrice,

        discountPercent: appliedDiscount,

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



  const clearCart = () => {

    setCart([]);

    setCustomerSearch('');

    setSelectedCustomerId('CASH');

    setSiteReceiptNumber('');

    setReceiverName('');

    setInvoiceType('فاتورة ضريبية');

    setLinkedQuotationId(null);

  };



  const isSimplified = invoiceType === 'فاتورة' || invoiceType === 'فاتورة مبسطة';

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  const totalTax = isSimplified ? 0 : cart.reduce((acc, item) => acc + (item.tax * item.qty), 0);

  const total = subtotal + totalTax;



  // Filter products by type and search query

  const filteredProducts = (Array.isArray(products) ? products : [])

    .filter(p => {

      const matchesCategory = activeCategory === 'ALL' || p.type === activeCategory;

      const matchesSupplier = activeSupplier === 'ALL' || p.supplierId === activeSupplier;

      const matchesSearch = (p.name || '').includes(searchQuery) || (p.code || '').includes(searchQuery);

      return matchesCategory && matchesSupplier && matchesSearch;

    });


  // Filter products by type and search query for Inventory tab

  const filteredInventoryProducts = (Array.isArray(products) ? products : [])

    .filter(p => {

      const matchesCategory = inventoryCategory === 'ALL' || p.type === inventoryCategory;

      const matchesSearch = (p.name || '').includes(inventorySearchQuery) || (p.code || '').includes(inventorySearchQuery);

      return matchesCategory && matchesSearch;

    });



  // Filter customers by search query

  const periodCustomers = (Array.isArray(customers) ? customers : [])
    .map(customer => customerInPeriod(customer, totalsFrom, totalsTo))
    .filter(customer => !(totalsFrom || totalsTo) || customer.orders.length > 0 || customer.payments.length > 0
      || customer.orderReturns.length > 0 || customer.discounts.length > 0);
  const periodSuppliers = (Array.isArray(suppliers) ? suppliers : [])
    .map(supplier => supplierInPeriod(supplier, totalsFrom, totalsTo))
    .filter(supplier => !(totalsFrom || totalsTo) || supplier.purchaseOrders.length > 0
      || supplier.expenses.length > 0 || supplier.discounts.length > 0);
  const filteredSuppliers = periodSuppliers.filter(s => (s.name || '').includes(supplierSearch) || (s.trn && s.trn.includes(supplierSearch)));
  const filteredCustomers = periodCustomers.filter(c => {

    const matchesSearch = (c.name || '').includes(customerSearch) || (c.trn && c.trn.includes(customerSearch));

    return matchesSearch;

  });

  const filteredPurchases = purchases.filter(p => inAccountPeriod(p, totalsFrom, totalsTo)
    && ((p.billNumber || '').includes(purchaseSearch) || (p.supplier?.name || '').includes(purchaseSearch)));
  const filteredGeneralExpenses = generalExpenses.filter(e => inAccountPeriod(e, totalsFrom, totalsTo)
    && ((e.expenseNumber || '').toLowerCase().includes(generalExpenseSearch.toLowerCase())
      || (e.category?.name || '').toLowerCase().includes(generalExpenseSearch.toLowerCase())));
  const filteredExpenses = expenses.filter(e => inAccountPeriod(e, totalsFrom, totalsTo)
    && ((e.expenseNumber || '').includes(expenseSearch) || (e.supplier?.name || '').includes(expenseSearch)));
  const filteredPayments = payments.filter(p => inAccountPeriod(p, totalsFrom, totalsTo)
    && ((p.customer?.name || '').includes(paymentSearch) || (p.receiptNumber || '').includes(paymentSearch)));
  const currentStatementBank = selectedBankStatement && banks.find(bank => bank.id === selectedBankStatement.id);
  const bankStatement = currentStatementBank && transfersReady
    ? buildBankStatement({
      bankId: currentStatementBank.id,
      bankBalance: currentStatementBank.balance,
      transfers: bankTransfers,
      payments,
      supplierPayments: expenses,
      generalExpenses,
      returns: customers.flatMap(customer =>
        (customer.orderReturns || []).map((orderReturn: any) => ({
          ...orderReturn,
          customer: orderReturn.customer || customer,
        }))
      ),
      from: bankStatementFrom,
      to: bankStatementTo,
    })
    : null;
  const filteredInvoices = invoices.filter(inv => inAccountPeriod(inv, totalsFrom, totalsTo)
    && ((inv.invoiceNumber || '').includes(invoiceSearch) || (inv.customerName || '').includes(invoiceSearch)
      || (inv.customer?.name || '').includes(invoiceSearch)));
  const returnCustomer = returnInvoice?.customerId
    ? customers.find(customer => customer.id === returnInvoice.customerId)
    : null;
  const returnQuantitiesByItem = new Map<string, number>();
  for (const previousReturn of returnInvoice?.orderReturns || []) {
    for (const item of previousReturn.items || []) {
      returnQuantitiesByItem.set(item.orderItemId,
        (returnQuantitiesByItem.get(item.orderItemId) || 0) + Number(item.quantity || 0));
    }
  }
  const returnPreviewItems: ReturnPreviewItem[] = (returnInvoice?.items || []).flatMap((item: ReturnInvoiceItem) => {
    const quantity = Number(returnQuantities[item.id] || 0);
    if (!quantity) return [];
    const alreadyReturned = returnQuantitiesByItem.get(item.id) || 0;
    const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
    const tax = roundMoney(Number(item.taxAmount) * (alreadyReturned + quantity) / Number(item.quantity))
      - roundMoney(Number(item.taxAmount) * alreadyReturned / Number(item.quantity));
    const amount = roundMoney(Number(item.unitPrice) * (alreadyReturned + quantity))
      - roundMoney(Number(item.unitPrice) * alreadyReturned);
    return [{ orderItemId: item.id, quantity, amount, tax, net: roundMoney(amount + tax) }];
  });
  const returnPreviewNet = Math.round((returnPreviewItems.reduce((sum: number, item: ReturnPreviewItem) => sum + item.net, 0) + Number.EPSILON) * 100) / 100;
  const returnBalanceKnown = !returnInvoice?.customerId || (customersReady && Boolean(returnCustomer));
  const returnCustomerBalance = returnCustomer
    ? statementTotals(
      returnCustomer.orders || [], returnCustomer.payments || [], Number(returnCustomer.openingBalance || 0),
      returnCustomer.orderReturns || [], returnCustomer.discounts || []
    ).totalDue
    : 0;
  const returnPreviewRefund = returnBalanceKnown
    ? Math.round(Math.max(0, returnPreviewNet - Math.max(returnCustomerBalance, 0)) * 100) / 100
    : 0;
  const openReturnDialog = (order: ReturnDialogInvoice) => {
    setReturnInvoice(order);
    setReturnQuantities({});
    setReturnRefundMethod('CASH');
    setReturnBankId('');
    setShowModal(false);
    setShowReturnModal(true);
  };
  const openReturnHistory = (order: any) => {
    setReturnHistoryInvoice(order);
    setShowReturnHistoryModal(true);
  };
  const hasReturnableItems = (order: ReturnDialogInvoice) => order.items.some(item => {
    const quantityAlreadyReturned = (order.orderReturns || []).reduce((sum, previousReturn) =>
      sum + (previousReturn.items || [])
        .filter(returnItem => returnItem.orderItemId === item.id)
        .reduce((itemSum, returnItem) => itemSum + Number(returnItem.quantity || 0), 0), 0);
    return quantityAlreadyReturned < item.quantity;
  });
  const submitOrderReturn = async () => {
    if (!returnInvoice || !returnPreviewItems.length || !returnBalanceKnown) return;
    setSubmittingReturn(true);
    try {
      const payload = {
        orderId: returnInvoice.id,
        items: returnPreviewItems.map(item => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity
        })),
        refundMethod: returnPreviewRefund > 0 ? returnRefundMethod : 'NONE',
        bankId: returnRefundMethod === 'BANK' && returnPreviewRefund > 0 ? returnBankId : null,
        userId: currentUser?.id || null
      };
      let orderReturn: unknown;
      const desktopApi = typeof window !== 'undefined'
        ? (window as Window & {
          electronAPI?: { createOrderReturn: (data: typeof payload) => Promise<unknown> };
        }).electronAPI
        : undefined;
      if (desktopApi) {
        orderReturn = await desktopApi.createOrderReturn(payload);
      } else {
        const response = await fetch('/api/order-returns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'تعذر إنشاء المرتجع');
        orderReturn = result.data;
      }
      setSelectedOrderReturn(orderReturn);
      setShowReturnModal(false);
      setShowReturnPrintModal(true);
      fetchProducts();
      fetchInvoices();
      fetchCustomers();
      fetchBanks();
    } catch (error) {
      console.error('Error creating invoice return:', error);
      alert(error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء المرتجع');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const renderPeriodTablePrint = (title: string, headers: string[], rows: (string | number)[][]) => (
    <button
      onClick={() => setPrintTableData({
        title, headers, rows, period: { from: totalsFrom, to: totalsTo }
      })}
      className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
    >
      <PrinterIcon className="w-4 h-4" />
      <span>طباعة الجدول</span>
    </button>
  );
  const formatReportDate = (record: { date?: string; createdAt?: string }) =>
    new Date(record.date || record.createdAt || '').toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });

  const printBankStatement = () => {
    if (!selectedBankStatement || !bankStatement) return;
    const money = (value: number) => formatTotal(value);
    setPrintTableData({
      title: `كشف حساب البنك - ${selectedBankStatement.name}`,
      headers: ['التاريخ', 'نوع الحركة', 'رقم المستند', 'البيان', 'المرجع / الملاحظات', 'وارد', 'منصرف', 'الرصيد'],
      rows: [
        ['', 'رصيد أول الفترة', '', '', '', '', '', money(bankStatement.openingBalance)],
        ...bankStatement.rows.map(movement => [
          formatReportDate({ date: movement.date }),
          movement.type,
          movement.number,
          movement.party,
          [movement.reference, movement.notes].filter(Boolean).join(' / ') || '—',
          movement.incoming ? money(movement.incoming) : '—',
          movement.outgoing ? money(movement.outgoing) : '—',
          money(movement.balance),
        ]),
      ],
      footer: [
        'إجمالي الحركة',
        '',
        '',
        '',
        '',
        money(bankStatement.totalIncoming),
        money(bankStatement.totalOutgoing),
        money(bankStatement.closingBalance),
      ],
      period: { from: bankStatementFrom, to: bankStatementTo },
    });
  };

  const formatPaymentInputDate = (value: string | Date) => {
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  const handleEditPayment = (payment: EditablePayment) => {
    let history: PaymentCorrectionHistoryEntry[] = [];
    try {
      const parsed: unknown = payment.correctionHistory ? JSON.parse(payment.correctionHistory) : [];
      if (!Array.isArray(parsed) || !parsed.every(isPaymentCorrectionHistoryEntry)) {
        throw new Error('سجل التصويبات غير صالح.');
      }
      history = parsed;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر قراءة سجل تصويبات السند.');
      return;
    }

    setEditingPayment(payment);
    setPaymentCorrectionHistory(history);
    setPaymentForm({
      customerId: payment.customerId,
      bankId: payment.bankId,
      amount: String(payment.amount),
      reference: payment.reference || '',
      notes: payment.notes || '',
      date: formatPaymentInputDate(payment.date),
    });
    setIsPaymentModalOpen(true);
  };



  const selectedCustomer = selectedCustomerId === 'CASH'

    ? { id: 'CASH', name: 'عميل نقدي', trn: null }

    : selectedCustomerId === 'CREDIT_GENERAL'

      ? { id: 'CREDIT_GENERAL', name: 'عميل آجل', trn: null }

      : customers.find(c => c.id === selectedCustomerId);



  // Helper to generate a unique bill number for purchase invoices

  const generateBillNumber = () => `PUR-${Date.now()}`;



  // Handle Checkout (Invoice or Quotation)

  const handleCheckout = async (isQuotation: boolean, quotationLines?: PricingLine[]) => {

    if (cart.length === 0 || submitting) return;



    const hasUnpriced = cart.some(item => item.originalPrice <= 0);

    if (hasUnpriced) {

      alert("لا يمكن إتمام العملية! بعض الأصناف في السلة لم يتم تسعيرها من قبل المدير بعد.");

      return;

    }



    setSubmitting(true);



    const orderData = {

      customerName: selectedCustomer ? selectedCustomer.name : 'عميل نقدي',

      customerId: selectedCustomer && selectedCustomer.id !== 'CASH' && selectedCustomer.id !== 'CREDIT_GENERAL' ? selectedCustomer.id : null,

      siteReceiptNumber: siteReceiptNumber.trim() || null,

      receiverName: receiverName.trim() || null,

      invoiceType,

      isQuotation,

      items: cart.map(item => ({

        productId: item.id,

        quantity: item.qty,

        unitPrice: quotationLines ? Number(quotationLines.find(line => line.productId === item.id)?.unitPrice) : item.price

      })),

      linkedQuotationId

    };



    try {

      if (isQuotation && currentUser?.role === 'ADMIN' && !await confirmQuotationProfit(currentUser, orderData.items.map(item => ({
        productId: item.productId, quantity: String(item.quantity), unitPrice: String(item.unitPrice)
      })))) return;

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
      setShowQuotationPricing(false);



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



  const convertQuotationToInvoice = () => {

    if (!invoice || !invoice.isQuotation || !invoice.items) return;

    const newCart = invoice.items.map((item: any) => ({

      id: item.product.id,

      name: item.product.name,

      size: item.product.size,

      color: item.product.color,

      gauge: item.product.gauge,

      length: item.product.length,

      weight: item.product.weight,

      supplier: item.product.supplier,

      originalPrice: item.unitPrice,

      price: item.unitPrice,

      qty: item.quantity,

      discountPercent: 0,

      taxRate: item.product.taxRate || 0.14,

      tax: invoice.invoiceType === 'فاتورة مبسطة' ? 0 : item.unitPrice * (item.product.taxRate || 0.14),

      costPrice: item.product.costPrice || 0

    }));

    setCart(newCart);

    setInvoiceType('فاتورة ضريبية');

    if (invoice.customerId) {

      setSelectedCustomerId(invoice.customerId);

      const cust = customers.find(c => c.id === invoice.customerId);

      if (cust) setCustomerSearch(cust.name);

    } else {

      setSelectedCustomerId('CASH');

      if (invoice.customerName) setCustomerSearch(invoice.customerName);

    }

    setReceiverName(invoice.receiverName || '');

    setSiteReceiptNumber(invoice.siteReceiptNumber || '');

    setLinkedQuotationId(invoice.id);

    setShowModal(false);

    if (showCustomerHistoryModal) setShowCustomerHistoryModal(false);

    setActiveTab('POS');

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

      if (err.message && err.message.includes('Unique constraint failed') && err.message.includes('name')) {

        alert('عفواً، يوجد عميل مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.');

      } else {

        alert(`خطأ أثناء حفظ العميل: ${err.message}`);

      }

    }

  };



  // Product Save handler

  const [savingProduct, setSavingProduct] = useState(false);
  const [productSaveNotice, setProductSaveNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const handleSaveProduct = async (e: React.FormEvent) => {

    e.preventDefault();
    if (savingProduct) return;
    setProductSaveNotice(null);

    if (!productForm.code || !productForm.name || (currentUser?.role === 'ADMIN' && !productForm.price)) {

      setProductSaveNotice({ kind: 'error', message: "يرجى ملء الحقول الأساسية: الكود، والاسم" + (currentUser?.role === 'ADMIN' ? "، وسعر البيع!" : "!") });

      return;

    }

    if (currentUser?.role === 'ADMIN' && parseFloat(productForm.price) <= 0) {

      setProductSaveNotice({ kind: 'error', message: 'يجب أن يكون سعر البيع أكبر من الصفر!' });

      return;

    }



    setSavingProduct(true);
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

      } else {

        // Browser fallback: Make actual fetch call to DB!

        const response = await fetch('/api/products', {

          method: isEditingProduct ? 'PUT' : 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify(formattedData)

        });

        const saved = await response.json();

        if (!response.ok) throw new Error(saved.error || 'Failed to save product');

      }

      fetchProducts(true);
      if (isEditingProduct) {
        setShowProductFormModal(false);
      } else {
        setProductSaveNotice({ kind: 'success', message: 'تم حفظ الصنف بنجاح. يمكنك تغيير اللون أو المواصفات وحفظ صنف جديد، أو إغلاق النموذج عند الانتهاء.' });
      }
    } catch (err: any) {
      console.error('Error saving product:', err);

      if (err.message && err.message.includes('Unique constraint failed') && err.message.includes('code')) {

        setProductSaveNotice({ kind: 'error', message: 'عفواً، يوجد منتج مسجل بنفس الكود بالفعل. يرجى التأكد من الكود.' });

      } else {

        setProductSaveNotice({ kind: 'error', message: `خطأ أثناء حفظ المنتج: ${err.message}` });

      }

    } finally {
      setSavingProduct(false);
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

        if (bankForm.id) {
          await (window as any).electronAPI.updateBank(data);
        } else {
          await (window as any).electronAPI.createBank(data);
        }

        fetchBanks();

      } else {

        const response = await fetch('/api/banks', {

          method: bankForm.id ? 'PUT' : 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify(data)

        });

        const savedBank = await response.json();

        if (!response.ok) throw new Error(savedBank.error || 'Failed to save bank');

        fetchBanks();

      }

      setIsBankModalOpen(false);

    } catch (err: any) {

      if (err.message && err.message.includes('Unique constraint failed') && err.message.includes('name')) {

        alert('عفواً، يوجد حساب مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.');

      } else {

        alert(`خطأ أثناء حفظ الحساب: ${err.message}`);

      }

    } finally {

      setSubmitting(false);

    }

  };



  const handleSavePayment = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!paymentForm.customerId || !paymentForm.bankId || !paymentForm.amount) return;
    if (editingPayment && currentUser?.role !== 'ADMIN') {
      alert('تصويب الدفعات متاح لمدير النظام فقط.');
      return;
    }
    if (editingPayment && !paymentForm.date) return;

    setSubmitting(true);

    try {

      const data = {

        ...(editingPayment ? { userId: currentUser.id } : {}),

        customerId: paymentForm.customerId,

        bankId: paymentForm.bankId,

        amount: parseFloat(paymentForm.amount) || 0,

        reference: paymentForm.reference,

        notes: paymentForm.notes,

        ...(editingPayment ? { id: editingPayment.id, date: new Date(`${paymentForm.date}T00:00:00`) } : {})

      };

      if (typeof window !== 'undefined' && (window as any).electronAPI) {

        const payment = editingPayment
          ? await (window as any).electronAPI.updatePayment(data)
          : await (window as any).electronAPI.createPayment(data);

        fetchPayments();

        fetchBanks();

        fetchCustomers();

        if (!editingPayment && payment) {

          const cust = customers.find(c => c.id === paymentForm.customerId);

          const bank = banks.find(b => b.id === paymentForm.bankId);

          setSelectedReceipt({ ...payment, customer: cust, bank: bank });

          setShowReceiptModal(true);

        }

      } else {

        const response = await fetch('/api/payments', {

          method: editingPayment ? 'PUT' : 'POST',

          headers: {
            'Content-Type': 'application/json',
            ...(editingPayment && currentUser?.sessionToken
              ? { Authorization: `Bearer ${currentUser.sessionToken}` }
              : {}),
          },

          body: JSON.stringify(data)

        });

        const payment = await response.json();

        if (!response.ok) throw new Error(payment.error || 'Failed to save payment');

        fetchPayments();

        fetchBanks();

        fetchCustomers();

        if (!editingPayment) {
          const cust = customers.find(c => c.id === paymentForm.customerId);

          const bank = banks.find(b => b.id === paymentForm.bankId);

          setSelectedReceipt({ ...payment, customer: cust, bank: bank });

          setShowReceiptModal(true);
        }

      }

      setIsPaymentModalOpen(false);
      setEditingPayment(null);
      setPaymentCorrectionHistory([]);
      setPaymentForm({ customerId: '', bankId: '', amount: '', notes: '', reference: '', date: '' });

    } catch (err: any) {

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

      openingBalance: parseFloat(supplierForm.openingBalance) || 0

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

      if (err.message && err.message.includes('Unique constraint failed') && err.message.includes('name')) {

        alert('عفواً، يوجد مورد مسجل بهذا الاسم بالفعل. يرجى اختيار اسم مختلف.');

      } else {

        alert(`خطأ أثناء حفظ المورد: ${err.message}`);

      }

    } finally {

      setSubmitting(false);

    }

  };



  const handleEditPurchase = (purchase: EditablePurchase) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }
    setEditingPurchase({
      id: purchase.id, updatedAt: purchase.updatedAt, date: formatPaymentInputDate(purchase.date || purchase.createdAt),
      originalDate: purchase.date || purchase.createdAt
    });
    setPurchaseForm({
      billNumber: purchase.billNumber, supplierId: purchase.supplierId, invoiceType: purchase.invoiceType,
      warehouseReceiptNumber: purchase.warehouseReceiptNumber || '',
      items: purchase.items.map(item => ({
        id: item.id, productId: item.productId, quantity: String(item.quantity), unitCost: String(item.unitCost),
        productDisplay: [item.product?.code, '-', item.product?.name, item.product?.type, item.product?.size,
          item.product?.color ? `(${item.product.color})` : ''].filter(Boolean).join(' ')
      }))
    });
    setShowPurchaseDetailModal(false);
    setShowSupplierHistoryModal(false);
    setShowPurchaseModal(true);
  };

  const handleEditExpense = (expense: EditableExpense & { supplierId: string }) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }
    setEditingExpense({
      id: expense.id, updatedAt: expense.updatedAt, date: formatPaymentInputDate(expense.date || expense.createdAt),
      originalDate: expense.date || expense.createdAt
    });
    setExpenseForm({
      supplierId: expense.supplierId, bankId: expense.bankId, amount: String(expense.amount),
      notes: expense.notes || '', reference: expense.reference || ''
    });
    setShowExpenseReceiptModal(false);
    setShowSupplierHistoryModal(false);
    setShowExpenseModal(true);
  };

  const handleEditGeneralExpense = (expense: EditableExpense & { categoryId: string }) => {
    if (currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }
    setEditingGeneralExpense({
      id: expense.id, updatedAt: expense.updatedAt, date: formatPaymentInputDate(expense.date || expense.createdAt),
      originalDate: expense.date || expense.createdAt
    });
    setGeneralExpenseForm({
      categoryId: expense.categoryId, bankId: expense.bankId, amount: String(expense.amount),
      notes: expense.notes || '', reference: expense.reference || ''
    });
    setShowGeneralExpenseModal(true);
  };

  const documentEditHeaders = () => ({
    'Content-Type': 'application/json',
    ...(currentUser?.sessionToken ? { Authorization: `Bearer ${currentUser.sessionToken}` } : {})
  });

  const documentEditData = (edit: DocumentEdit) => ({
    id: edit.id,
    updatedAt: edit.updatedAt,
    date: edit.date === formatPaymentInputDate(edit.originalDate)
      ? edit.originalDate : new Date(`${edit.date}T00:00:00`)
  });

  const handleSaveGeneralExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (editingGeneralExpense && currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        ...generalExpenseForm,
        ...(editingGeneralExpense ? documentEditData(editingGeneralExpense) : {})
      };
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        if (editingGeneralExpense) await (window as any).electronAPI.updateGeneralExpense(data);
        else await (window as any).electronAPI.createGeneralExpense(data);
      } else {
        const res = await fetch('/api/general-expenses', {
          method: editingGeneralExpense ? 'PUT' : 'POST',
          headers: editingGeneralExpense ? documentEditHeaders() : { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const saved = await res.json();
        if (!res.ok) throw new Error(saved.error || 'تعذر حفظ المصروف.');
      }
      setShowGeneralExpenseModal(false);
      setEditingGeneralExpense(null);
      setGeneralExpenseForm({ categoryId: '', bankId: '', amount: '', notes: '', reference: '' });
      fetchGeneralExpenses();
      fetchBanks();
    } catch (error) {
      console.error('Error saving general expense:', error);
      alert(error instanceof Error ? error.message : 'حدث خطأ أثناء حفظ المصروف.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {

    e.preventDefault();
    if (submitting) return;
    if (editingPurchase && currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }

    if (!purchaseForm.billNumber || !purchaseForm.supplierId || purchaseForm.items.length === 0) {

      alert("يرجى ملء جميع الحقول وإضافة منتج واحد على الأقل!");

      return;

    }

    setSubmitting(true);

    try {

      const data = {
        ...purchaseForm,
        ...(editingPurchase ? documentEditData(editingPurchase) : {})
      };
      if (typeof window !== 'undefined' && (window as any).electronAPI) {

        if (editingPurchase) await (window as any).electronAPI.updatePurchase(data);
        else await (window as any).electronAPI.createPurchase(data);

      } else {

        const response = await fetch('/api/purchases', {

          method: editingPurchase ? 'PUT' : 'POST',

          headers: editingPurchase ? documentEditHeaders() : { 'Content-Type': 'application/json' },

          body: JSON.stringify(data)

        });

        const saved = await response.json();

        if (!response.ok) throw new Error(saved.error || 'Failed to save purchase order');

      }

      fetchPurchases();

      fetchProducts();

      fetchSuppliers();
      setSelectedPurchase(null);

      setShowPurchaseModal(false);
      setEditingPurchase(null);

      setPurchaseForm({ billNumber: '', supplierId: '', invoiceType: 'فاتورة ضريبية', items: [] });

    } catch (err: any) {

      alert(`خطأ أثناء حفظ فاتورة الشراء: ${err.message}`);

    } finally {

      setSubmitting(false);

    }

  };



  const handleSaveExpense = async (e: React.FormEvent) => {

    e.preventDefault();
    if (submitting) return;
    if (editingExpense && currentUser?.role !== 'ADMIN') {
      alert('تعديل المستندات متاح لمدير النظام فقط.');
      return;
    }

    if (!expenseForm.supplierId || !expenseForm.bankId || !expenseForm.amount) {

      alert("يرجى ملء جميع الحقول المطلوبة!");

      return;

    }

    setSubmitting(true);

    try {

      let saved;
      const data = {
        ...expenseForm,
        ...(editingExpense ? documentEditData(editingExpense) : {})
      };

      if (typeof window !== 'undefined' && (window as any).electronAPI) {

        saved = editingExpense
          ? await (window as any).electronAPI.updateExpense(data)
          : await (window as any).electronAPI.createExpense(data);

      } else {

        const response = await fetch('/api/expenses', {

          method: editingExpense ? 'PUT' : 'POST',

          headers: editingExpense ? documentEditHeaders() : { 'Content-Type': 'application/json' },

          body: JSON.stringify(data)

        });

        saved = await response.json();

        if (!response.ok) throw new Error(saved.error || 'Failed to save expense payment');

      }

      fetchExpenses();
      fetchGeneralExpenses();
      fetchExpenseCategories();

      fetchBanks();

      fetchSuppliers();

      setSelectedExpense(saved);

      setShowExpenseReceiptModal(true);

      setShowExpenseModal(false);
      setEditingExpense(null);

      setExpenseForm({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });

    } catch (err: any) {

      alert(`خطأ أثناء حفظ سند الصرف: ${err.message}`);

    } finally {

      setSubmitting(false);

    }

  };




  const [uploadingProductImage, setUploadingProductImage] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, product: { id: string }) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (currentUser?.role !== 'ADMIN') {
      alert('تغيير صورة الصنف متاح للمستخدم الرئيسي فقط');
      return;
    }
    if (uploadingProductImage) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      alert('يرجى اختيار صورة بصيغة JPG أو PNG أو WebP أو GIF');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة يجب ألا يتجاوز 2 ميجابايت');
      return;
    }
    setUploadingProductImage(product.id);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result) : reject(new Error('تعذر قراءة الصورة'));
        reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة من الكمبيوتر'));
        reader.onabort = () => reject(new Error('تم إلغاء قراءة الصورة'));
        reader.readAsDataURL(file);
      });
      const data = { id: product.id, imageUrl };
      const desktop = window as Window & {
        electronAPI?: { updateProduct: (data: { id: string; imageUrl: string }) => Promise<unknown> };
      };
      if (desktop.electronAPI) {
        await desktop.electronAPI.updateProduct(data);
      } else {
        const response = await fetch('/api/products', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'حدث خطأ أثناء حفظ الصورة');
        }
      }
      setProducts(previous => previous.map(item => item.id === product.id ? { ...item, imageUrl } : item));
      setSelectedProduct((previous: { id: string; imageUrl?: string } | null) => previous?.id === product.id ? { ...previous, imageUrl } : previous);
    } catch (error) {
      console.error('Error uploading product image:', error);
      alert(error instanceof Error ? error.message : 'حدث خطأ أثناء تحديث الصورة');
    } finally {
      setUploadingProductImage(null);
    }
  };



  if (!isMounted) {

    return (

      <div className="flex h-screen bg-entlaq-darker text-slate-100 items-center justify-center">

        <Loader2Icon className="h-10 w-10 text-entlaq-primary animate-spin" />

      </div>

    );

  }



  if (currentUser === null) {

    return (

      <div className="flex h-screen bg-slate-950 items-center justify-center font-sans overflow-hidden" dir="rtl">

        {/* Custom Titlebar (Window Controls) in Login page */}

        <div

          className="fixed top-0 left-0 right-0 h-10 bg-slate-950 border-b border-white/5 flex items-center justify-between px-2 select-none z-50 no-print"

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

              className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"

            >

              <MinusIcon className="w-3.5 h-3.5" />

            </button>

            <button

              onClick={() => (window as any).electronAPI?.maximize()}

              className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"

            >

              <SquareIcon className="w-3.5 h-3.5" />

            </button>

            <button

              onClick={() => (window as any).electronAPI?.close()}

              className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"

            >

              <XIcon className="w-3.5 h-3.5" />

            </button>

          </div>

        </div>



        {/* Brand/Login Container */}

        <div className="w-[450px] bg-slate-900/40 backdrop-blur-xl border border-white/10 p-2 rounded shadow-2xl flex flex-col space-y-6">

          <div className="text-center space-y-2">

            <div className="mx-auto w-16 h-16 bg-white/5 rounded border border-white/10 shadow-lg p-2 flex items-center justify-center">

              <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />

            </div>

            <h2 className="text-2xl font-black text-white">تسجيل الدخول</h2>

            <p className="text-xs text-slate-400 font-bold">مصنع خراطيم ومواسير وأسلاك الإنطلاق</p>

          </div>



          <form onSubmit={handleLogin} className="space-y-4">

            <div className="space-y-1.5">

              <label className="text-xs text-slate-400 font-bold block">نوع المستخدم</label>

              <select

                value={loginUsername}

                onChange={(e) => setLoginUsername(e.target.value)}

                className="w-full bg-slate-950 border border-white/10 rounded-sm px-2 py-1.5 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-primary transition-all cursor-pointer"

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

                className="w-full bg-slate-950 border border-white/10 rounded-sm px-2 py-1.5 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-primary transition-all text-center tracking-widest"

                required

              />

            </div>



            {loginError && (

              <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-2.5 rounded-sm text-center">

                {loginError}

              </p>

            )}



            <button

              type="submit"

              className="w-full bg-entlaq-primary hover:bg-teal-500 active:scale-95 text-white font-bold text-sm py-1.5 rounded-sm shadow-lg shadow-teal-500/20 transition-all cursor-pointer"

            >

              دخول النظام

            </button>

          </form>

        </div>

      </div>

    );

  }



  return (

    <div className="flex h-screen bg-entlaq-darker text-slate-100 font-sans overflow-hidden selection:bg-teal-500 selection:text-white pt-10" dir="rtl">



      {/* Custom Titlebar (Window Controls) */}

      <div

        className="fixed top-0 left-0 right-0 h-10 bg-slate-950/90 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-2 select-none z-50 no-print"

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

            className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"

          >

            <MinusIcon className="w-3.5 h-3.5" />

          </button>

          <button

            onClick={() => (window as any).electronAPI?.maximize()}

            className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"

          >

            <SquareIcon className="w-3 h-3" />

          </button>

          <button

            onClick={() => (window as any).electronAPI?.close()}

            className="w-8 h-8 rounded-sm flex items-center justify-center text-slate-400 hover:text-white hover:bg-teal-500/90 transition-colors cursor-pointer"

          >

            <XIcon className="w-3.5 h-3.5" />

          </button>

        </div>

      </div>



      {/* Sidebar Navigation */}

      <CollapsiblePanel id="main-navigation" title="القائمة الرئيسية" side="right" width={224}
        className="main-navigation-panel">

        {/* Brand Logo & Name */}

        <div className="flex items-center gap-2 p-2 border-b border-indigo-500/20 bg-indigo-950/20">

          <div className="relative w-20 h-20 flex items-center justify-center bg-white/5 rounded border border-white/10 shadow-md p-1.5 shrink-0">

            <img src="/images/logo.png" alt="الإنطلاق" className="w-full h-full object-contain" />

          </div>

          <div className="flex flex-col justify-center">

            <h1 className="text-3xl font-black text-white tracking-wide leading-none mb-1">الإنطــلاق</h1>

            <p className="text-xs text-indigo-300 font-bold leading-none">مصنع خراطيم ومواسير وأسلاك</p>

          </div>

        </div>



        {/* Navigation Items */}

        <div className="navigation-items flex-1 flex flex-col overflow-y-auto custom-scrollbar min-h-0">

          {isRoleAllowed('POS') && (

            <button

              onClick={() => setActiveTab('POS')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'POS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <ShoppingCartIcon className="h-5 w-5" />

              <span>نقطة البيع</span>

            </button>

          )}



          {isRoleAllowed('CUSTOMERS') && (

            <button

              onClick={() => setActiveTab('CUSTOMERS')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'CUSTOMERS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <UsersIcon className="h-5 w-5" />

              <span>العملاء والشركات</span>

            </button>

          )}



          {isRoleAllowed('DISCOUNTS') && (
            <button onClick={() => setActiveTab('DISCOUNTS')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'DISCOUNTS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <PercentIcon className="h-5 w-5" />
              <span>الخصومات</span>
            </button>
          )}

          {isRoleAllowed('INVENTORY') && (

            <button

              onClick={() => setActiveTab('INVENTORY')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'INVENTORY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <PackageIcon className="h-5 w-5" />

              <span>إدارة المخزون</span>

            </button>

          )}



          {isRoleAllowed('STOCKTAKE') && (
            <button onClick={() => setActiveTab('STOCKTAKE')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'STOCKTAKE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <PackageSearchIcon className="h-5 w-5" />
              <span>جرد</span>
            </button>
          )}

          {isRoleAllowed('BANKS') && (

            <button

              onClick={() => setActiveTab('BANKS')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'BANKS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <BuildingIcon className="h-5 w-5" />

              <span>البنوك والخزائن</span>

            </button>

          )}



          {isRoleAllowed('PAYMENTS') && (

            <button

              onClick={() => setActiveTab('PAYMENTS')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'PAYMENTS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <BanknoteIcon className="h-5 w-5" />

              <span>سداد / دفعات</span>

            </button>

          )}



          {isRoleAllowed('SUPPLIERS') && (

            <button

              onClick={() => setActiveTab('SUPPLIERS')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'SUPPLIERS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <TruckIcon className="h-5 w-5" />

              <span>إدارة الموردين</span>

            </button>

          )}



          {isRoleAllowed('PURCHASES') && (

            <button

              onClick={() => setActiveTab('PURCHASES')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'PURCHASES' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <ShoppingBagIcon className="h-5 w-5" />

              <span>فاتورة مشتريات (وارد)</span>

            </button>

          )}



          {isRoleAllowed('EXPENSES') && (
            <button
              onClick={() => setActiveTab('GENERAL_EXPENSES')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'GENERAL_EXPENSES' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <ReceiptIcon className="h-5 w-5" />
              <span>المصروفات العامة</span>
            </button>
          )}

          {isRoleAllowed('EXPENSES') && (

            <button

              onClick={() => setActiveTab('EXPENSES')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'EXPENSES' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <ReceiptIcon className="h-5 w-5" />

              <span>سندات الصرف (مصروف)</span>

            </button>

          )}



          {isRoleAllowed('INVOICES') && (

            <button onClick={() => setActiveTab('INVOICES')}

              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all duration-300 cursor-pointer border-b border-white/5 ${activeTab === 'INVOICES' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}

            >

              <FileTextIcon className="h-5 w-5" />

              <span>الفواتير وعروض الأسعار</span>

            </button>

          )}

          {isRoleAllowed('ITEM_REPORTS') && (
            <button onClick={() => setActiveTab('ITEM_REPORTS')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all cursor-pointer border-b border-white/5 ${activeTab === 'ITEM_REPORTS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <FileTextIcon className="h-5 w-5" />
              <span>تقارير الأصناف</span>
            </button>
          )}

          {currentUser?.role === 'ADMIN' && (
            <button onClick={() => setActiveTab('PRODUCTION_RESET')}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm font-bold transition-all cursor-pointer border-b border-white/5 ${activeTab === 'PRODUCTION_RESET' ? 'bg-red-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <Trash2Icon className="h-5 w-5" />
              <span>تفريغ البيانات</span>
            </button>
          )}

        </div>



        {/* User Info & Actions */}

        <div className="border-t border-indigo-500/20 shrink-0 bg-indigo-950/10">

          <div className="flex flex-col px-2 py-1.5">

            <span className="text-xs font-black text-white">{currentUser?.name}</span>

            <span className="text-[10px] text-indigo-300 font-bold mt-0.5">

              {currentUser?.role === 'ADMIN' ? 'مدير النظام' : currentUser?.role === 'CASHIER' ? 'كاشير' : 'أمين المخزن'}

            </span>

          </div>



          <div className="flex">

            <button

              onClick={() => {

                setChangePasswordForm({ userId: currentUser.id, newPassword: '', confirmPassword: '' });

                setShowChangePasswordModal(true);

              }}

              className="flex-1 text-[10px] bg-slate-900/50 border-y border-r border-indigo-500/20 hover:bg-indigo-600 hover:text-white text-indigo-200 font-bold py-2 text-center cursor-pointer transition-all"

            >

              كلمة المرور

            </button>

            <button

              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).electronAPI) {
                  (window as any).electronAPI.logout();
                }
                setCurrentUser(null);
              }}

              className="flex-1 text-[10px] bg-red-950/20 border-y border-red-500/20 hover:bg-red-500 hover:text-white text-red-400 font-bold py-2 text-center cursor-pointer transition-all"

            >

              خروج

            </button>

          </div>

        </div>



        {/* Footer Info */}

        <div className="py-2 text-[9px] text-indigo-400/50 text-center font-mono shrink-0 bg-slate-950">

          <span>الإصدار 2.0.0</span>

        </div>

      </CollapsiblePanel>



      {/* Main Content Area */}

      <div className="flex-1 flex overflow-hidden" dir="rtl">

        {((customersError && isRoleAllowed('CUSTOMERS')) || (suppliersError && isRoleAllowed('SUPPLIERS'))) && (
          <div role="alert" className="fixed bottom-4 right-4 z-40 max-w-lg rounded border border-red-500/40 bg-slate-950 p-3 text-sm font-bold text-red-300 shadow-xl">
            تعذر تحديث أرصدة الحسابات والخصومات. قد تكون البيانات المعروضة قديمة.
            {customersError && isRoleAllowed('CUSTOMERS') && <p>العملاء: {customersError}</p>}
            {suppliersError && isRoleAllowed('SUPPLIERS') && <p>الموردون: {suppliersError}</p>}
          </div>
        )}

        {activeTab === 'DISCOUNTS' && (
          <DiscountsPanel
            customers={customers}
            suppliers={suppliers}
            canAllow={isRoleAllowed('CUSTOMERS')}
            canEarn={isRoleAllowed('SUPPLIERS')}
            showSupplierBalance={currentUser?.role === 'ADMIN'}
            customersReady={customersReady}
            suppliersReady={suppliersReady}
            sessionToken={currentUser?.sessionToken}
            onSaved={kind => kind === 'ALLOWED' ? fetchCustomers() : fetchSuppliers()}
            onPrint={openDiscountPrint}
            onPrintTable={setPrintTableData}
          />
        )}

        {/* TAB 1: POS DASHBOARD */}

        {activeTab === 'ITEM_REPORTS' && isRoleAllowed('ITEM_REPORTS') && currentUser && (
          <ItemMovementsReport key={currentUser.id} role={currentUser.role} customers={customers} suppliers={suppliers} />
        )}

        {activeTab === 'PRODUCTION_RESET' && currentUser?.role === 'ADMIN' && (
          <ProductionResetPanel sessionToken={currentUser.sessionToken} onCompleted={() => { fetchProducts(true); fetchInvoices(); }} />
        )}

        {activeTab === 'STOCKTAKE' && isRoleAllowed('STOCKTAKE') && (
          <StocktakePanel key={currentUser.id} user={currentUser} onInventoryChanged={() => fetchProducts(true)} onPrint={setPrintStocktake} />
        )}

        {activeTab === 'POS' && (

          <React.Fragment>

            {/* Products & Search Section */}

            <div className="flex-1 min-w-0 flex flex-col p-3 space-y-3 no-print">



              {/* Header Search */}

              <div className="flex items-center justify-between mb-2">

                <div>

                  <h1 className="text-xl font-bold text-white tracking-wide">صالة المنتجات والمبيعات</h1>

                  <p className="text-xs text-slate-400">اختر من المنتجات أدناه لإدراجها في الفاتورة أو عرض السعر</p>

                </div>



                {/* Search Bar and Supplier Filter */}

                <div className="flex gap-2 w-2/3">

                  <div className="relative group flex-1">

                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">

                      <SearchIcon className="h-5 w-5 text-slate-400 group-focus-within:text-entlaq-primary transition-colors" />

                    </div>

                    <input

                      type="text"

                      value={searchQuery}

                      onChange={(e) => setSearchQuery(e.target.value)}

                      placeholder="ابحث عن منتج بالاسم أو الكود (مثال: 3020)..."

                      className="w-full bg-white/5 border border-white/10 rounded py-1.5 pr-12 pl-10 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent transition-all shadow-lg"

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

                  <select

                    value={activeSupplier}

                    onChange={e => setActiveSupplier(e.target.value)}

                    className="bg-slate-900 border border-white/10 rounded py-1.5 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent transition-all shadow-lg w-48"

                  >

                    <option className="bg-slate-900 text-slate-200" value="ALL">كل الموردين</option>

                    {suppliers.map(s => <option className="bg-slate-900 text-slate-200" key={s.id} value={s.id}>{s.name}</option>)}

                  </select>

                </div>

              </div>



              {/* Category Filters */}

              <div className="flex gap-1.5 overflow-x-auto pb-4 custom-scrollbar">

                <button

                  onClick={() => setActiveCategory('ALL')}

                  className={`px-3 py-2.5 rounded-sm font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === 'ALL' ? 'bg-entlaq-primary text-white shadow-lg shadow-teal-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}

                >

                  <PackageSearchIcon size={18} /> الكل

                </button>

                {productOptions.type.map(option => option.value).map(cat => (

                  <button

                    key={cat}

                    onClick={() => setActiveCategory(cat)}

                    className={`whitespace-nowrap px-3 py-2.5 rounded-sm font-bold flex gap-2 items-center transition-all duration-300 cursor-pointer ${activeCategory === cat ? 'bg-entlaq-primary text-white shadow-lg shadow-teal-500/20' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}

                  >

                    {cat}

                  </button>

                ))}

              </div>



              {/* Product Grid */}

              {loading ? (

                <div className="flex-1 flex flex-col items-center justify-center space-y-4">

                  <Loader2Icon className="h-10 w-10 text-entlaq-primary animate-spin" />

                  <p className="text-slate-400 text-xs">جاري تحميل بيانات المخزون...</p>

                </div>

              ) : (

                <div className="product-cards-grid grid pos-product-cards-grid gap-3 overflow-y-auto pb-10 custom-scrollbar pr-2 flex-1 min-h-0">

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

                        className={`product-data-card glass-card rounded-sm p-2.5 cursor-pointer group flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] border ${getProductColorBorderClass(item.color || '')} ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}

                      >

                        <ProductCardHeader product={item} typeClassName={`px-1.5 py-0.5 rounded font-bold ${getCategoryBadgeClass(item.type)}`} />

                        <div className="relative h-32 mb-3 rounded bg-black/20 overflow-hidden">

                          <img

                            src={item.imageUrl || getProductImage(item.type)}

                            alt={item.name}

                            className="w-full h-full object-contain"

                          />

                          {currentUser?.role === 'ADMIN' && <label

                            onClick={(e) => e.stopPropagation()} 

                            className="absolute bottom-1 left-1 bg-black/50 p-1.5 rounded-full cursor-pointer hover:bg-black/70 transition-colors z-10"

                            title="تحميل صورة من الكمبيوتر (JPG / PNG / WebP / GIF، حتى 2 ميجابايت)"
                            aria-label={`تغيير صورة ${item.name}`}

                          >

                            {uploadingProductImage === item.id ? <Loader2Icon size={18} className="text-white animate-spin" /> : <CameraIcon size={18} className="text-white" />}

                            <input 

                              type="file" 

                              accept="image/jpeg,image/png,image/webp,image/gif"
                              disabled={uploadingProductImage !== null}
                              aria-label={`تحميل صورة ${item.name} من الكمبيوتر`}

                              className="hidden" 

                              onChange={(e) => handleImageUpload(e, item)}

                            />

                          </label>}

                          {isLowStock && !isOutOfStock && (

                            <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-amber-500/90 text-slate-900 rounded-sm text-[9px] font-bold animate-pulse">

                              منخفض

                            </span>

                          )}

                          {isOutOfStock && (

                            <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-600/90 text-white rounded-sm text-[9px] font-bold">

                              نافذ

                            </span>

                          )}

                        </div>

                        <div className="flex-1 flex flex-col justify-between">

                          <ProductCardDetails product={item} actions={
                            <button

                              disabled={isOutOfStock}

                              onClick={(e) => {

                                e.stopPropagation();

                                addToCart(item);

                              }}

                              className="bg-red-500/10 text-red-500 p-1.5 rounded-sm hover:bg-entlaq-primary hover:text-white transition-all shadow-sm disabled:opacity-50 disabled:hover:bg-red-500/10 disabled:hover:text-red-500 cursor-pointer"

                              title="إضافة إلى السلة"

                            >

                              <ShoppingCartIcon className="h-3.5 w-3.5" />

                            </button>
                          } />

                        </div>

                      </div>

                    );

                  })}

                </div>

              )}

            </div>



            {/* Cart Panel (Left Side in POS) */}

            <CollapsiblePanel id="sales-quotation-panel" title="المبيعات والعروض" side="left" width={360}
              className="sales-quotation-panel">



              {/* Cart Header */}

              <div className="bg-transparent border-b border-white/10 p-4 shrink-0 no-print rounded-t-sm">

                <div className="w-full">

                  <h2 className="text-2xl font-bold flex items-center gap-1.5 text-white mb-3">

                    <PrinterIcon className="h-6 w-6 text-entlaq-primary" />

                    المبيعات والعروض

                  </h2>

                  <div className="w-full flex flex-col gap-2">

                    {/* Top Row: Customer + Buttons */}

                    <div className="flex items-center gap-2 w-full">

                      <select

                        value={selectedCustomerId || ''}

                        onChange={(e) => setSelectedCustomerId(e.target.value)}

                        className="flex-1 w-0 bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"

                      >

                        <option className="bg-slate-900 text-slate-200" value="CASH">عميل نقدي</option>

                        <option className="bg-slate-900 text-slate-200" value="AGEL">عميل آجل</option>

                        <optgroup label="العملاء المسجلين" className="bg-slate-800 text-slate-400">

                          {customers.filter((c: any) => c.name !== 'عميل نقدي' && c.name !== 'عميل آجل').map((c: any) => (

                            <option className="bg-slate-900 text-slate-200" key={c.id} value={c.id}>{c.name}</option>

                          ))}

                        </optgroup>

                      </select>



                      <div className="flex gap-1 items-center shrink-0">

                        <button

                          onClick={() => {

                            setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0', openingBalance: '0' });

                            setIsEditingCustomer(false);

                            setShowCustomerModal(true);

                          }}

                          className="bg-white/5 border border-white/10 p-2.5 rounded-sm hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"

                          title="إضافة عميل جديد سريعا"

                        >

                          <PlusIcon className="w-5 h-5" />

                        </button>

                        <button

                          onClick={clearCart}

                          disabled={cart.length === 0}

                          className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-sm text-red-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"

                          title="تفريغ السلة بالكامل"

                        >

                          <Trash2Icon className="w-5 h-5" />

                        </button>

                      </div>

                    </div>



                    {/* Bottom Row: Receipt, receiver, and invoice type */}
                    <div className="flex gap-2 w-full select-none">

                      <div className="w-1/4 shrink-0">

                        <input

                          type="text"

                          value={siteReceiptNumber}

                          onChange={(e) => setSiteReceiptNumber(e.target.value)}

                          placeholder="رقم إذن الاستلام بالموقع"

                          className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"

                        />

                      </div>

                      <div className="min-w-0 flex-1">

                        <input

                          type="text"

                          value={receiverName}

                          onChange={(e) => setReceiverName(e.target.value)}

                          placeholder="اسم المستلم"

                          className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"

                        />

                      </div>

                      <select
                        value={invoiceType}
                        onChange={(e) => setInvoiceType(e.target.value)}
                        className="min-w-0 flex-1 bg-slate-900 border border-white/10 rounded-sm py-2 px-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"
                      >
                        <option className="bg-slate-900 text-slate-200" value="فاتورة ضريبية">فاتورة ضريبية</option>
                        <option className="bg-slate-900 text-slate-200" value="فاتورة">فاتورة</option>
                      </select>

                    </div>

                  </div>

                </div>

              </div>



              {/* Cart Items */}

              {cart.length === 0 ? (

                <div className="flex-1 flex flex-col items-center justify-center p-2 text-center space-y-4 min-h-0">

                  <ShoppingCartIcon className="h-16 w-16 text-slate-600 animate-pulse" />

                  <div>

                    <h3 className="text-lg font-bold text-slate-300">سلة المبيعات فارغة</h3>

                    <p className="text-sm text-slate-500 mt-1">اضغط على أي صنف لإضافته إلى الفاتورة</p>

                  </div>

                </div>

              ) : (

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar min-h-0">

                  {cart.map((item) => (

                    <div key={item.id} className="bg-slate-800/40 border border-white/5 rounded-sm p-2.5 flex gap-2.5 hover:border-white/10 transition-colors">

                      <div className="flex-1 flex flex-col justify-between">

                        <div className="flex justify-between items-start">

                          <h4 className="font-bold text-slate-200 mb-1 text-sm">{item.name}</h4>

                          <span className="text-xs px-2 py-0.5 bg-white/10 rounded text-slate-300 font-mono font-bold">{item.size}</span>

                        </div>

                        {/* Product detailed properties in cart */}

                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-slate-400 my-1 font-semibold">

                          {item.color && <span className="bg-white/5 px-1.5 py-0.2 rounded border border-white/5">اللون: {item.color}</span>}

                          {item.gauge && <span className="bg-white/5 px-1.5 py-0.2 rounded border border-white/5">الدرجة: {item.gauge}</span>}

                          {item.length && <span className="bg-white/5 px-1.5 py-0.2 rounded border border-white/5 font-mono">طول: {item.length}</span>}

                          {item.weight && <span className="bg-white/5 px-1.5 py-0.2 rounded border border-white/5 font-mono">وزن: {item.weight}</span>}

                          {item.supplier && <span className="bg-indigo-500/10 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-500/20 font-bold" title="المورد">المورد: {item.supplier.name}</span>}

                        </div>

                        {item.originalPrice <= 0 && (

                          <div className="mt-1.5 mb-1 text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded-sm text-center">

                            ⚠️ لم يتم وضع التسعير من المدير بعد!

                          </div>

                        )}



                        {/* Editable Discount Section */}

                        <div className="flex items-center gap-1.5 mt-1.5 select-none">

                          <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-sm">

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

                              {formatTotal((item.originalPrice * item.qty))} ج.م

                            </span>

                          )}

                        </div>



                        <div className="flex justify-between items-center mt-2">

                          <span

                            onDoubleClick={() => handlePriceDoubleClick(item.id)}

                            className="text-entlaq-primary font-bold font-mono text-sm cursor-pointer relative"

                            title="اضغط مرتين لتعديل السعر يدوياً"

                          >

                            {editingCartPriceId === item.id ? (

                              <MoneyInput
                                autoFocus

                                className="w-16 bg-slate-900 text-white border border-entlaq-primary px-1 text-center font-mono rounded"

                                defaultValue={item.price}

                                onBlur={(e) => {

                                  handleManualPriceChange(item.id, normalizeMoneyInput(e.target.value));

                                  setEditingCartPriceId(null);

                                }}

                                onKeyDown={(e) => {

                                  if (e.key === 'Enter') {

                                    handleManualPriceChange(item.id, normalizeMoneyInput(e.currentTarget.value));

                                    setEditingCartPriceId(null);

                                  }

                                }}

                              />

                            ) : (

                              <>{formatTotal((item.price * item.qty))} ج.م</>

                            )}

                          </span>

                          <button

                            onClick={() => removeFromCart(item.id)}

                            className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer"

                          >

                            حذف

                          </button>

                        </div>

                      </div>

                      <div className="flex flex-col items-center justify-between bg-black/30 rounded-sm p-1 w-12">

                        <button

                          onClick={() => updateQty(item.id, 1)}

                          className="w-8 h-6 flex items-center justify-center text-slate-300 hover:bg-white/10 rounded-sm transition-colors cursor-pointer"

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

                          className="w-8 h-6 flex items-center justify-center text-slate-300 hover:bg-white/10 rounded-sm transition-colors cursor-pointer"

                        >

                          -

                        </button>

                      </div>

                    </div>

                  ))}

                </div>

              )}



              {/* Cart Summary */}

              <div className="p-2 bg-black/40 border-t border-white/10 space-y-3 backdrop-blur-xl shrink-0 mt-auto">

                <div className="flex justify-between text-slate-400 font-mono text-xs">

                  <span>المجموع (غير شامل الضريبة)</span>

                  <span>{formatTotal(subtotal)} ج.م</span>

                </div>

                <div className="flex justify-between text-slate-400 font-mono text-xs">

                  <span>{isSimplified ? 'غير شامل للقيمة المضافة' : 'ضريبة القيمة المضافة (14%)'}</span>

                  <span>{formatTotal(totalTax)} ج.م</span>

                </div>



                <div className="h-px bg-white/10 w-full my-1"></div>



                <div className="flex justify-between items-end mb-4">

                  <span className="text-sm font-bold text-slate-200">الإجمالي المستحق</span>

                  <span className="text-2xl font-black text-white font-mono">

                    {formatTotal(total)} <span className="text-xs font-normal text-slate-400">ج.م</span>

                  </span>

                </div>



                {/* Checkout Actions */}
                {currentUser?.role === 'ADMIN' && <button type="button"
                  disabled={!cart.length || submitting || cart.some(item => item.originalPrice <= 0)}
                  onClick={() => setShowQuotationPricing(true)}
                  className="w-full rounded-sm border border-emerald-500/30 bg-emerald-600/15 py-2 text-sm font-bold text-emerald-300 disabled:opacity-40">
                  تسعير وأرباح عرض السعر
                </button>}

                <div className="grid grid-cols-2 gap-2.5">

                  <button

                    disabled={cart.length === 0 || submitting || cart.some(item => item.originalPrice <= 0)}

                    onClick={() => handleCheckout(true)}

                    className="bg-white/5 text-white border border-white/10 py-1.5 rounded-sm font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-300 cursor-pointer"

                  >

                    {submitting ? <Loader2Icon className="animate-spin h-4 w-4" /> : <PauseCircleIcon className="h-5 w-5" />}

                    حفظ كعرض سعر

                  </button>

                  <button

                    disabled={cart.length === 0 || submitting || cart.some(item => item.originalPrice <= 0)}

                    onClick={() => handleCheckout(false)}

                    className="bg-entlaq-primary text-white shadow-lg shadow-teal-500/30 py-1.5 rounded-sm font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-teal-500 hover:scale-[1.02] disabled:opacity-40 disabled:hover:bg-entlaq-primary disabled:hover:scale-100 transition-all duration-300 cursor-pointer"

                  >

                    {submitting ? <Loader2Icon className="animate-spin h-4 w-4" /> : <CheckCircle2Icon className="h-5 w-5" />}

                    إصدار فاتورة

                  </button>

                </div>

              </div>

            </CollapsiblePanel>

          </React.Fragment>

        )}



        {/* TAB 2: CUSTOMERS TAB */}

        {activeTab === 'CUSTOMERS' && (

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">



            {/* Header */}

            <div>

              <h2 className="text-xl font-bold text-white">إدارة العملاء والشركات</h2>

              <p className="text-xs text-slate-400 mt-0.5">إدارة بيانات العملاء والشركات ومتابعة فواتيرهم وحساباتهم</p>

            </div>



            {/* Search & Add Row */}

            {/* Search & Add Row */}

            <div className="flex flex-nowrap items-center gap-2 w-full overflow-x-auto pb-1">

              <div className="flex gap-1.5 items-center shrink-0">

                <div className="relative group w-[260px] shrink-0">

                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                    <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                  </div>

                  <input

                    type="text"

                    value={customerSearch}

                    onChange={(e) => setCustomerSearch(e.target.value)}

                    placeholder="ابحث عن العميل بالاسم أو الرقم الضريبي..."

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                    setCustomerForm({ id: '', name: '', phone: '', location: '', buildingsCount: '0', cr: '', trn: '', customerType: 'CASH', discount: '0', openingBalance: '0' });

                    setIsEditingCustomer(false);

                    setShowCustomerModal(true);

                  }}

                  className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

                >

                  <PlusIcon className="w-4 h-4" />

                  <span>إضافة عميل جديد</span>

                </button>

                <button

                  onClick={() => {

                    const safeCustomers = Array.isArray(filteredCustomers) ? filteredCustomers : [];

                    let gSpent = 0;

                    let gPayments = 0;

                    let gReturns = 0;

                    let gRefunds = 0;

                    let gDiscounts = 0;

                    let gBalance = 0;



                    const rows = safeCustomers.map((c, i) => {

                      const validOrders = c.orders ? c.orders.filter((o: any) => !o.isQuotation) : [];

                      const totalSpent = validOrders.reduce((sum: number, o: any) => sum + o.netAmount, 0);

                      const totalPayments = c.payments ? c.payments.reduce((sum: number, p: any) => sum + p.amount, 0) : 0;

                      const totalReturns = (c.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.netAmount || 0), 0);

                      const totalRefunds = (c.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.refundAmount || 0), 0);

                      const totalDiscounts = (c.discounts || []).reduce((sum: number, discount: StatementDiscount) => sum + discount.amount, 0);

                      const remainingBalance = totalSpent - totalPayments - totalReturns + totalRefunds - totalDiscounts + (c.openingBalance || 0);



                      gSpent += totalSpent;

                      gPayments += totalPayments;

                      gReturns += totalReturns;

                      gRefunds += totalRefunds;

                      gDiscounts += totalDiscounts;

                      gBalance += remainingBalance;



                      return [

                        i + 1,

                        c.name,

                        c.phone || '-',

                        c.location || '-',

                        formatTotal(totalSpent),

                        formatTotal(totalPayments),

                        formatTotal(totalReturns),

                        formatTotal(totalRefunds),

                        formatTotal(totalDiscounts),

                        formatTotal(remainingBalance)

                      ];

                    });



                    setPrintTableData({

                      title: 'كشف بيانات العملاء والشركات والمديونية',
                      period: { from: totalsFrom, to: totalsTo },

                      headers: ['م', 'اسم العميل', 'رقم الهاتف', 'العنوان', 'إجمالي المسحوبات', 'إجمالي الدفعات', 'إجمالي المرتجعات', 'المبالغ المردودة', 'الخصم المسموح به', 'الرصيد المتبقي'],

                      rows: rows,

                      footer: ['', 'الإجماليات الكلية', '', '', formatTotal(gSpent), formatTotal(gPayments), formatTotal(gReturns), formatTotal(gRefunds), formatTotal(gDiscounts), formatTotal(gBalance)]

                    });

                  }}

                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

                >

                  <PrinterIcon className="w-4 h-4" />

                  <span>طباعة الجدول</span>

                </button>

              </div>



              {/* Totals Summary */}

              {(() => {

                const safeCustomers = filteredCustomers;

                const hasPeriod = !!(totalsFrom || totalsTo);
                const fromTs = totalsFrom ? new Date(`${totalsFrom}T00:00:00`).getTime() : -Infinity;
                const toTs = totalsTo ? new Date(`${totalsTo}T23:59:59.999`).getTime() : Infinity;
                const inPeriod = (d: any) => {
                  const t = new Date(d).getTime();
                  return t >= fromTs && t <= toTs;
                };

                const globalTotalSpent = safeCustomers.reduce((sum, cust) => {

                  const validOrders = cust.orders ? cust.orders.filter((o: any) => !o.isQuotation && inPeriod(o.createdAt)) : [];

                  return sum + validOrders.reduce((s: number, o: any) => s + o.netAmount, 0);

                }, 0);

                const globalTotalPayments = safeCustomers.reduce((sum, cust) => {

                  return sum + (cust.payments ? cust.payments.filter((p: any) => inPeriod(p.date || p.createdAt)).reduce((s: number, p: any) => s + p.amount, 0) : 0);

                }, 0);

                const globalTotalReturns = safeCustomers.reduce((sum, cust) =>
                  sum + (cust.orderReturns || []).filter((r: ReturnRecordSummary) => inPeriod(r.createdAt)).reduce((s: number, r: ReturnRecordSummary) => s + Number(r.netAmount || 0), 0), 0);

                const globalTotalRefunds = safeCustomers.reduce((sum, cust) =>
                  sum + (cust.orderReturns || []).filter((r: ReturnRecordSummary) => inPeriod(r.createdAt)).reduce((s: number, r: ReturnRecordSummary) => s + Number(r.refundAmount || 0), 0), 0);

                const globalTotalDiscounts = safeCustomers.reduce((sum, cust) =>
                  sum + (cust.discounts || []).reduce((s: number, discount: StatementDiscount) => s + discount.amount, 0), 0);

                // The opening balance is not tied to a date, so it is only counted for the full (unfiltered) totals
                const globalTotalOpeningBalance = hasPeriod ? 0 : safeCustomers.reduce((sum, cust) => sum + (cust.openingBalance || 0), 0);

                const globalTotalBalance = globalTotalSpent - globalTotalPayments - globalTotalReturns
                  + globalTotalRefunds - globalTotalDiscounts + globalTotalOpeningBalance;

                const setMonth = (value: string) => {
                  if (!value) {
                    setTotalsFrom('');
                    setTotalsTo('');
                    return;
                  }
                  const [y, m] = value.split('-').map(Number);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  setTotalsFrom(`${y}-${pad(m)}-01`);
                  setTotalsTo(`${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`);
                };

                return (

                  <div className="flex flex-row flex-nowrap items-center gap-2 no-print shrink-0">

                    <div className="flex flex-nowrap gap-1.5 items-center text-xs text-slate-300 font-bold shrink-0">
                      <span>من</span>
                      <input
                        type="date"
                        value={totalsFrom}
                        max={totalsTo || undefined}
                        onChange={(e) => setTotalsFrom(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none w-[132px]"
                      />
                      <span>إلى</span>
                      <input
                        type="date"
                        value={totalsTo}
                        min={totalsFrom || undefined}
                        onChange={(e) => setTotalsTo(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none w-[132px]"
                      />
                      <span>أو شهر</span>
                      <input
                        type="month"
                        value={totalsFrom && totalsFrom.slice(0, 7) === totalsTo.slice(0, 7) ? totalsFrom.slice(0, 7) : ''}
                        onChange={(e) => setMonth(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-sm py-1 px-2 text-slate-200 focus:outline-none w-[112px]"
                      />
                      {hasPeriod && (
                        <button
                          onClick={() => { setTotalsFrom(''); setTotalsTo(''); }}
                          className="px-2 py-1 rounded-sm bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer"
                        >
                          عرض الكل
                        </button>
                      )}
                    </div>

                  <div className="flex flex-nowrap gap-1.5 items-center">

                    <div className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center shrink-0">

                      <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">إجمالي المسحوبات</span>

                      <span className="text-sm font-black text-red-400 font-mono whitespace-nowrap">{globalTotalSpent.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>

                    </div>

                    <div className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center shrink-0">

                      <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">إجمالي الدفعات</span>

                      <span className="text-sm font-black text-emerald-400 font-mono whitespace-nowrap">{globalTotalPayments.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>

                    </div>

                    <div className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center shrink-0">

                      <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">إجمالي المرتجعات</span>

                      <span className="text-sm font-black text-amber-300 font-mono whitespace-nowrap">{globalTotalReturns.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>

                    </div>

                    <div className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center shrink-0">

                      <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">الخصم المسموح به</span>

                      <span className="text-sm font-black text-sky-400 font-mono whitespace-nowrap">{formatTotal(globalTotalDiscounts)}</span>

                    </div>

                    <div className="bg-black/40 px-2 py-1.5 rounded-md border border-white/10 shadow-lg flex flex-col justify-center shrink-0">

                      <span className="text-[10px] text-slate-300 font-bold whitespace-nowrap">إجمالي الرصيد</span>

                      <span className={`text-sm font-black font-mono whitespace-nowrap ${globalTotalBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>

                        {globalTotalBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}

                      </span>

                    </div>

                  </div>

                  </div>

                );

              })()}

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

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">

                  {filteredCustomers.map((cust) => {

                    const validOrders = cust.orders ? cust.orders.filter((o: any) => !o.isQuotation) : [];

                    const totalSpent = validOrders.reduce((sum: number, o: any) => sum + o.netAmount, 0);

                    const totalPayments = cust.payments ? cust.payments.reduce((sum: number, p: any) => sum + p.amount, 0) : 0;

                    const totalReturns = (cust.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.netAmount || 0), 0);

                    const totalRefunds = (cust.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.refundAmount || 0), 0);

                    const totalDiscounts = (cust.discounts || []).reduce((sum: number, discount: StatementDiscount) => sum + discount.amount, 0);

                    const paymentsCount = cust.payments ? cust.payments.length : 0;

                    const ordersCount = validOrders.length;

                    const remainingBalance = totalSpent - totalPayments - totalReturns + totalRefunds - totalDiscounts + (cust.openingBalance || 0);

                    return (

                      <div key={cust.id} className="glass-card rounded-sm p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">

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

                                  discount: cust.discount ? cust.discount.toString() : '0',

                                  openingBalance: String(customers.find(customer => customer.id === cust.id)?.openingBalance ?? 0)

                                });

                                setIsEditingCustomer(true);

                                setShowCustomerModal(true);

                              }}

                              className="bg-white/5 text-slate-400 p-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer"

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

                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-1.5 mt-1.5">
                          <div className="flex flex-col gap-1 mb-1.5">
                            <div className="flex gap-1">
                              <div className="bg-black/25 px-2 py-1 rounded-sm flex-1 flex justify-between items-center">
                                <span className="text-[10px] text-slate-400 font-bold ml-1">الفواتير:</span>
                                <span className="text-xs font-black text-white font-mono">{ordersCount}</span>
                              </div>
                              <div className="bg-black/25 px-2 py-1 rounded-sm flex-1 flex justify-between items-center">
                                <span className="text-[10px] text-slate-400 font-bold ml-1">الدفعات:</span>
                                <span className="text-xs font-black text-white font-mono">{paymentsCount}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.15fr] gap-1">

                              <div className="bg-black/25 px-1.5 py-1.5 rounded-sm flex flex-col 2xl:flex-row justify-between items-center border border-white/5">

                                <span className="text-[10px] text-slate-400 font-bold shrink-0">مسحوبات:</span>

                                <span className="text-xs font-black text-red-400 font-mono truncate" title={`${formatTotal(totalSpent)} ج.م`}>{totalSpent.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>

                              </div>

                              <div className="bg-black/25 px-1.5 py-1.5 rounded-sm flex flex-col 2xl:flex-row justify-between items-center border border-white/5">

                                <span className="text-[10px] text-slate-400 font-bold shrink-0">دفعات:</span>

                                <span className="text-xs font-black text-emerald-400 font-mono truncate" title={`${formatTotal(totalPayments)} ج.م`}>{totalPayments.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>

                              </div>

                              <div className="bg-black/25 px-1.5 py-1.5 rounded-sm flex flex-col 2xl:flex-row justify-between items-center border border-white/5">

                                <span className="text-[10px] text-slate-400 font-bold shrink-0">مرتجعات:</span>

                                <span className="text-xs font-black text-amber-300 font-mono truncate" title={`${formatTotal(totalReturns)} ج.م`}>{totalReturns.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>

                              </div>

                              <div className="bg-black/25 px-1.5 py-1.5 rounded-sm flex flex-col 2xl:flex-row justify-between items-center border border-white/5">

                                <span className="text-[10px] text-slate-400 font-bold shrink-0">خصم:</span>

                                <span className="text-xs font-black text-sky-400 font-mono truncate" title={`${formatTotal(totalDiscounts)} ج.م`}>{totalDiscounts.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}</span>

                              </div>

                              <div className="bg-black/25 px-1.5 py-1.5 rounded-sm flex flex-col 2xl:flex-row justify-between items-center border border-white/5">

                                <span className="text-[11px] text-slate-300 font-bold shrink-0">ر:</span>

                                <span className={`text-sm font-black font-mono truncate ${remainingBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`} title={`${formatTotal(remainingBalance)} ج.م`}>

                                  {remainingBalance.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})}

                                </span>

                              </div>

                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => {
                                setSelectedHistoryCustomer(customers.find(customer => customer.id === cust.id));
                                setStmtFrom(totalsFrom);
                                setStmtTo(totalsTo);
                                setShowCustomerHistoryModal(true);
                              }}
                              className="bg-white/5 text-slate-300 p-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-[10px] font-bold shadow-sm shadow-black/20 flex items-center justify-center"
                            >
                              كشف حساب
                            </button>

                            <button
                              onClick={() => {
                                setSelectedCustomerForPrices(cust);
                                const map: Record<string, number> = {};
                                if (cust.customPrices) {
                                  cust.customPrices.forEach((cp: any) => {
                                    map[cp.productId] = cp.price;
                                  });
                                }
                                setCustomerPricesMap(map);
                                setShowCustomerPricesModal(true);
                              }}
                              className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 p-1.5 rounded-sm transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm shadow-black/20"
                            >
                              <PercentIcon className="w-3 h-3 shrink-0" /> <span className="truncate">أسعار مخصصة</span>
                            </button>
                            
                            <button
                              onClick={() => {
                                setSelectedCustomerForCeilings(cust);
                                fetchCustomerCeilings(cust.id);
                                setShowCustomerCeilingsModal(true);
                              }}
                              className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 p-1.5 rounded-sm transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm shadow-black/20"
                            >
                              <LayoutGridIcon className="w-3 h-3 shrink-0" /> <span className="truncate">حصر الأسقف</span>
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

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">



            {/* Header */}

            <div>

              <h2 className="text-xl font-bold text-white">إدارة المخزون</h2>

              <p className="text-xs text-slate-400 mt-0.5">مراقبة كميات البضائع، تعديل الأسعار، ومقارنة تكلفة الإنتاج بالبيع وحساب الأرباح</p>

            </div>



            {/* Filter, Search & Add Bar */}

            <div className="flex flex-row flex-nowrap gap-2 items-center overflow-x-auto pb-1">



              {/* Search & Add row */}

              <div className="flex gap-1.5 items-center shrink-0 w-[420px]">

                <div className="relative group flex-1">

                  <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                    <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                  </div>

                  <input

                    type="text"

                    value={inventorySearchQuery}

                    onChange={(e) => setInventorySearchQuery(e.target.value)}

                    placeholder="ابحث عن منتج بالاسم أو الكود..."

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                      type: 'مواسير',

                      size: '',

                      gauge: '',

                      color: '',

                      length: '',

                      weight: '',

                      supplierId: '',

                      costPrice: '',

                      markup: '30',

                      price: '',

                      stockQty: '',

                      minStockQty: '10',

                      maxStockQty: '1000',
                      pricePerKilo: '0'

                    });

                    setIsEditingProduct(false);
                    setProductSaveNotice(null);
                    setShowProductFormModal(true);

                  }}

                  className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

                >

                  <PlusIcon className="w-4 h-4" />

                  <span>إضافة منتج جديد</span>

                </button>

                <button

                  onClick={() => {

                    const headers = ['م', 'كود', 'باركود', 'الصنف', 'النوع', 'المقاس', 'الدرجة', 'المورد', 'اللون', 'الطول', 'الوزن', 'البيع', 'المخزون'];
                    if (currentUser?.role === 'ADMIN') {
                      headers.splice(11, 0, 'التكلفة');
                    }

                    setPrintTableData({
                      title: 'كشف جرد المخزون والأسعار الحالي',
                      headers: headers,
                      rows: filteredInventoryProducts.map((p, i) => {
                        const row: any[] = [
                          i + 1,
                          p.code,
                          p.barcode || '-',
                          p.name,
                          p.type,
                          p.size,
                          p.gauge || '-',
                          p.supplier?.name || '-',
                          p.color || '-',
                          p.length || '-',
                          p.weight || '-',
                          `${formatTotal(p.price)}`,
                          p.stockQty
                        ];
                        if (currentUser?.role === 'ADMIN') {
                          row.splice(11, 0, `${formatTotal(p.costPrice)}`);
                        }
                        return row;
                      })
                    });

                  }}

                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

                >

                  <PrinterIcon className="w-4 h-4" />

                  <span>طباعة الجدول</span>

                </button>

              </div>



              {renderTotalsBar([
                { label: 'عدد الأصناف', value: String(filteredInventoryProducts.length) },
                { label: 'إجمالي الكميات', value: filteredInventoryProducts.reduce((s: number, p: any) => s + (p.stockQty || 0), 0).toLocaleString('en-US') },
                { label: 'قيمة المخزون بسعر البيع', value: formatTotal(filteredInventoryProducts.reduce((s: number, p: any) => s + (p.stockQty || 0) * (p.price || 0), 0)), tone: 'green' },
                ...(currentUser?.role === 'ADMIN'
                  ? [{ label: 'قيمة المخزون بالتكلفة', value: formatTotal(filteredInventoryProducts.reduce((s: number, p: any) => s + (p.stockQty || 0) * (p.costPrice || 0), 0)), tone: 'red' as const }]
                  : [])
              ], false)}

              {/* Categories Navigation */}

              <div className="flex gap-2 w-full md:w-auto overflow-x-auto py-1">

                <button

                  onClick={() => setInventoryCategory('ALL')}

                  className={`px-2 py-2 rounded-sm text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === 'ALL' ? 'bg-entlaq-primary text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}

                >

                  الكل

                </button>

                {productOptions.type.map(option => option.value).map(cat => (

                  <button

                    key={cat}

                    onClick={() => setInventoryCategory(cat)}

                    className={`whitespace-nowrap px-2 py-2 rounded-sm text-xs font-bold transition-all duration-200 cursor-pointer ${inventoryCategory === cat ? 'bg-entlaq-primary text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}

                  >

                    {cat}

                  </button>

                ))}

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

                <div className="product-cards-grid grid gap-3">

                  {filteredInventoryProducts.map((p) => {

                    const isLowStock = p.stockQty <= p.minStockQty;

                    const isOutOfStock = p.stockQty <= 0;

                    return (

                      <div key={p.id} className={`product-data-card glass-card rounded-sm p-2.5 flex flex-col justify-between border transition-all duration-300 text-right relative overflow-hidden ${getProductColorBorderClass(p.color || '')}`} dir="rtl">

                        <div>

                          {/* Card Header: Code, Category, Edit */}

                          <div className="flex justify-between items-center mb-2">

                            <div className="flex items-center gap-1.5 min-w-0 flex-1">

                              <ProductCardHeader product={p} typeClassName={`px-1.5 py-0.5 rounded font-bold ${getCategoryBadgeClass(p.type)}`} />

                              {(!p.costPrice || p.costPrice <= 0) && (

                                <span className="flex items-center gap-1 bg-red-600/90 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-sm shadow-lg animate-pulse" title="لم يتم تحديد السعر من قبل الإدارة">

                                  <AlertTriangleIcon size={12} /> تسعير

                                </span>

                              )}

                            </div>

                            <button

                              onClick={() => {

                                setProductForm({

                                  id: p.id,

                                  code: p.code,

                                  barcode: p.barcode || '',

                                  name: p.name,

                                  type: p.type,

                                  supplierId: p.supplierId || '',

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

                                  maxStockQty: p.maxStockQty ? p.maxStockQty.toString() : '1000',
                                  pricePerKilo: p.pricePerKilo ? p.pricePerKilo.toString() : '0'

                                });

                                setIsEditingProduct(true);
                                setProductSaveNotice(null);
                                setShowProductFormModal(true);

                              }}

                              className="bg-white/5 text-slate-400 p-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer"

                              title="تعديل الصنف"

                            >

                              <PencilIcon className="w-3.5 h-3.5" />

                            </button>

                          </div>



                          <div className="relative h-32 mb-3 rounded bg-black/20 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.imageUrl || getProductImage(p.type)} alt={p.name} className="w-full h-full object-contain" />
                            {currentUser?.role === 'ADMIN' && (
                              <label className="absolute bottom-1 left-1 bg-slate-950/80 p-2 rounded cursor-pointer flex items-center gap-2 text-white"
                                title="تحميل صورة من الكمبيوتر (حتى 2 ميجابايت)">
                                {uploadingProductImage === p.id ? <Loader2Icon size={18} className="animate-spin" /> : <CameraIcon size={18} />}
                                تغيير الصورة
                                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                                  aria-label={`تحميل صورة ${p.name} من الكمبيوتر`} disabled={uploadingProductImage !== null}
                                  onChange={event => handleImageUpload(event, p)} />
                              </label>
                            )}
                          </div>

                          <ProductCardDetails product={p}>
                            {currentUser?.role === 'ADMIN' && <>
                              <span title="سعر الشراء">ش <bdi>{formatTotal(p.costPrice, 0)}</bdi></span>
                              <span title="النسبة">ن <bdi>{p.markup !== undefined && p.markup !== null ? p.markup.toFixed(0) : '30'}%</bdi></span>
                            </>}
                          </ProductCardDetails>

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

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div className="flex flex-wrap items-center gap-2 mb-2">

              <h2 className="text-xl font-bold text-white">إدارة الموردين</h2>

              <p className="text-xs text-slate-400 mt-0.5">إدارة بيانات الموردين ومتابعة فواتير الشراء المستلمة والمدفوعات الصادرة لهم</p>

            </div>



            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={supplierSearch}

                  onChange={(e) => setSupplierSearch(e.target.value)}

                  placeholder="ابحث عن المورد بالاسم أو الرقم الضريبي..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                  setSupplierForm({ id: '', name: '', phone: '', address: '', cr: '', trn: '', openingBalance: '0' });

                  setIsEditingSupplier(false);

                  setShowSupplierModal(true);

                }}

                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PlusIcon className="w-4 h-4" />

                <span>إضافة مورد جديد</span>

              </button>

              <button

                onClick={() => {

                  const headers = ['م', 'اسم المورد', 'الهاتف', 'العنوان'];

                  if (currentUser?.role === 'ADMIN') headers.push('الرصيد للمورد (ج.م)', 'الخصم المكتسب (ج.م)');



                  setPrintTableData({

                    title: 'كشف مديونيات وأرصدة الموردين والشركات المسجلين',
                    period: { from: totalsFrom, to: totalsTo },

                    headers,

                    rows: filteredSuppliers.map((s, i) => {

                      const row = [

                        i + 1,

                        s.name,

                        s.phone || '-',

                        s.address || '-'

                      ];

                      if (currentUser?.role === 'ADMIN') {
                        const discountTotal = (s.discounts || []).reduce((sum: number, discount: StatementDiscount) => sum + discount.amount, 0);
                        row.push(`${formatTotal(s.balance)} ج.م`, `${formatTotal(discountTotal)} ج.م`);
                      }

                      return row;

                    })

                  });

                }}

                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PrinterIcon className="w-4 h-4" />

                <span>طباعة الجدول</span>
              </button>

              {(() => {
                const list = filteredSuppliers;
                const hasPeriod = !!(totalsFrom || totalsTo);
                const purchasesTotal = list.reduce((s: number, sup: any) => s + (sup.purchaseOrders || []).reduce((a: number, o: any) => a + o.netAmount, 0), 0);
                const paidTotal = list.reduce((s: number, sup: any) => s + (sup.expenses || []).reduce((a: number, e: any) => a + e.amount, 0), 0);
                const discountsTotal = list.reduce((s: number, sup: any) =>
                  s + (sup.discounts || []).reduce((a: number, discount: StatementDiscount) => a + discount.amount, 0), 0);
                const balance = hasPeriod ? purchasesTotal - paidTotal - discountsTotal : list.reduce((s: number, sup: any) => s + (sup.balance || 0), 0);
                return renderTotalsBar([
                  { label: 'إجمالي المشتريات', value: formatTotal(purchasesTotal), tone: 'red' },
                  { label: 'إجمالي المدفوع', value: formatTotal(paidTotal), tone: 'green' },
                  { label: 'الخصم المكتسب', value: formatTotal(discountsTotal), tone: 'green' },
                  { label: 'إجمالي الرصيد', value: formatTotal(balance), tone: balance > 0 ? 'red' : 'green' }
                ], true);
              })()}

            </div>



            <div className="flex-1 overflow-y-auto pb-10 custom-scrollbar pr-2">

              {filteredSuppliers.length === 0 ? (

                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">

                  <TruckIcon className="h-16 w-16 text-slate-600 animate-pulse" />

                  <div>

                    <h3 className="text-lg font-bold text-slate-300">لا يوجد موردين متطابقين</h3>

                    <p className="text-sm text-slate-500 mt-1">أضف مورد جديد لبدء تسجيل الفواتير وسندات الصرف باسمه</p>

                  </div>

                </div>

              ) : (

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">

                  {filteredSuppliers.map((sup) => {

                    const totalPurchased = sup.purchaseOrders ? sup.purchaseOrders.reduce((sum: number, o: any) => sum + o.netAmount, 0) : 0;

                    const totalPaid = sup.expenses ? sup.expenses.reduce((sum: number, p: any) => sum + p.amount, 0) : 0;

                    const totalDiscounts = (sup.discounts || []).reduce((sum: number, discount: StatementDiscount) => sum + discount.amount, 0);

                    const remainingDebt = sup.balance;

                    return (

                      <div key={sup.id} className="glass-card rounded-sm p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">

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

                                  openingBalance: String(suppliers.find(supplier => supplier.id === sup.id)?.openingBalance ?? 0)

                                });

                                setIsEditingSupplier(true);

                                setShowSupplierModal(true);

                              }}

                              className="bg-white/5 text-slate-400 p-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer"

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

                            <div className="bg-black/25 px-2 py-1 rounded-sm text-center">

                              <span className="text-[10px] text-slate-400 block font-bold">فواتير التوريد</span>

                              <span className="text-sm font-black text-red-400 font-mono">{formatTotal(totalPurchased)} ج.م</span>

                            </div>

                            <div className="bg-black/25 px-2 py-1 rounded-sm text-center">

                              <span className="text-[10px] text-slate-400 block font-bold">المبالغ المصروفة</span>

                              <span className="text-sm font-black text-emerald-400 font-mono">{formatTotal(totalPaid)} ج.م</span>

                            </div>

                            {currentUser?.role === 'ADMIN' && (

                              <div className="col-span-2 bg-black/25 px-2 py-1 rounded-sm text-center">
                                <span className="text-[10px] text-slate-400 block font-bold">الخصم المكتسب</span>
                                <span className="text-sm font-black text-sky-400 font-mono">{formatTotal(totalDiscounts)} ج.م</span>
                              </div>

                            )}

                            {currentUser?.role === 'ADMIN' && (

                              <div className="col-span-2 bg-black/25 px-2 py-2 rounded-sm text-center border border-white/5">

                                <span className="text-[10px] text-slate-400 block font-bold">الرصيد المتبقي له (المديونية)</span>

                                <span className={`text-base font-black font-mono ${remainingDebt > 0 ? 'text-red-500' : 'text-emerald-500'}`}>

                                  {formatTotal(remainingDebt)} ج.م

                                </span>

                              </div>

                            )}

                            <button

                              onClick={() => {

                                setSelectedHistorySupplier(suppliers.find(supplier => supplier.id === sup.id));
                                setStmtFrom(totalsFrom);
                                setStmtTo(totalsTo);

                                setShowSupplierHistoryModal(true);

                              }}

                              className="col-span-2 bg-white/5 text-slate-300 p-2 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-xs font-bold mt-1 shadow-md shadow-black/20"

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

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div>

              <h2 className="text-xl font-bold text-white">فواتير المشتريات والوارد للمخزن</h2>

              <p className="text-xs text-slate-400 mt-0.5">تسجيل الكميات والمنتجات الواردة من الموردين وتنزيلها تلقائياً للمخزن</p>

            </div>



            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={purchaseSearch}

                  onChange={(e) => setPurchaseSearch(e.target.value)}

                  placeholder="ابحث برقم الفاتورة أو اسم المورد..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                  setEditingPurchase(null);
                  setPurchaseForm({ billNumber: generateBillNumber(), supplierId: '', invoiceType: 'فاتورة ضريبية', items: [] });

                  setShowPurchaseModal(true);

                }}

                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PlusIcon className="w-4 h-4" />

                <span>تسجيل فاتورة شراء</span>

              </button>

              {renderPeriodTablePrint(
                'كشف فواتير المشتريات',
                ['رقم الفاتورة', 'التاريخ', 'المورد', 'الإجمالي قبل الضريبة', 'الضريبة', 'الصافي شامل الضريبة'],
                filteredPurchases.map(p => [
                  p.billNumber, formatReportDate(p), p.supplier?.name || 'غير معروف',
                  formatTotal(p.totalAmount), formatTotal(p.taxAmount), formatTotal(p.netAmount)
                ])
              )}
              {(() => {
                const list = filteredPurchases;
                return renderTotalsBar([
                  { label: 'عدد الفواتير', value: String(list.length) },
                  { label: 'الإجمالي قبل الضريبة', value: formatTotal(list.reduce((s: number, p: any) => s + (p.totalAmount || 0), 0)) },
                  { label: 'إجمالي الضريبة', value: formatTotal(list.reduce((s: number, p: any) => s + (p.taxAmount || 0), 0)) },
                  { label: 'الإجمالي الصافي', value: formatTotal(list.reduce((s: number, p: any) => s + (p.netAmount || 0), 0)), tone: 'red' }
                ], true);
              })()}

            </div>



            <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">

              <table className="w-full text-right text-sm">

                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">

                  <tr>

                    <th className="p-2 font-bold">رقم الفاتورة</th>

                    <th className="p-2 font-bold">التاريخ</th>

                    <th className="p-2 font-bold">المورد</th>

                    <th className="p-2 font-bold">الإجمالي قبل الضريبة</th>

                    <th className="p-2 font-bold">الضريبة (14%)</th>

                    <th className="p-2 font-bold">الصافي شامل الضريبة</th>
                    {currentUser?.role === 'ADMIN' && <th className="p-2 font-bold">تعديل</th>}

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-800/50">

                  {filteredPurchases.map(purchase => (

                    <tr key={purchase.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedPurchase(purchase); setShowPurchaseDetailModal(true); }}>

                      <td className="p-2 font-mono text-slate-300 font-bold">{purchase.billNumber}</td>

                      <td className="p-2 text-slate-300 font-mono text-xs">{formatReportDate(purchase)}</td>

                      <td className="p-2 font-bold text-white">{purchase.supplier?.name || 'غير معروف'}</td>

                      <td className="p-2 font-mono text-slate-300">{formatTotal(purchase.totalAmount)} ج.م</td>

                      <td className="p-2 font-mono text-slate-400">{formatTotal(purchase.taxAmount)} ج.م</td>

                      <td className="p-2 font-mono font-bold text-emerald-400" dir="ltr">{formatTotal(purchase.netAmount)} ج.م</td>
                      {currentUser?.role === 'ADMIN' && <td className="p-2">
                        <button type="button" aria-label={`تعديل فاتورة الشراء ${purchase.billNumber}`}
                          onClick={event => { event.stopPropagation(); handleEditPurchase(purchase); }}
                          className="flex items-center gap-1 text-amber-300 hover:text-amber-200">
                          <PencilIcon size={14} /> تعديل
                        </button>
                      </td>}

                    </tr>

                  ))}

                  {filteredPurchases.length === 0 && (

                    <tr>

                      <td colSpan={currentUser?.role === 'ADMIN' ? 7 : 6} className="p-10 text-center text-slate-500 font-bold">لا توجد فواتير مشتريات مسجلة</td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}




        {/* TAB 10: GENERAL_EXPENSES */}
        {activeTab === 'GENERAL_EXPENSES' && (
          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">المصروفات العامة</h2>
                <p className="text-xs text-slate-400 mt-0.5">تسجيل المصروفات التشغيلية والإدارية المتنوعة</p>
              </div>
            </div>

            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">
              <div className="relative group w-[260px] shrink-0">
                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />
                </div>
                <input
                  type="text"
                  value={generalExpenseSearch}
                  onChange={(e) => setGeneralExpenseSearch(e.target.value)}
                  placeholder="ابحث برقم السند أو التصنيف..."
                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"
                />
                {generalExpenseSearch && (
                  <button
                    onClick={() => setGeneralExpenseSearch('')}
                    className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingGeneralExpense(null);
                  setGeneralExpenseForm({ categoryId: '', bankId: '', amount: '', notes: '', reference: '' });
                  setShowGeneralExpenseModal(true);
                }}
                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PlusIcon size={14} />
                <span>إضافة مصروف</span>
              </button>
              {renderPeriodTablePrint(
                'كشف المصروفات العامة',
                ['رقم السند', 'التاريخ', 'التصنيف', 'البنك/الخزينة', 'المبلغ', 'المرجع'],
                filteredGeneralExpenses.map(e => [
                  e.expenseNumber, formatReportDate(e), e.category?.name || '-',
                  e.bank?.name || '-', formatTotal(e.amount), e.reference || '-'
                ])
              )}
              {(() => {
                const list = filteredGeneralExpenses;
                return renderTotalsBar([
                  { label: 'عدد السندات', value: String(list.length) },
                  { label: 'إجمالي المصروفات', value: formatTotal(list.reduce((s: number, e: any) => s + (e.amount || 0), 0)), tone: 'red' }
                ], true);
              })()}
            </div>

            <div className="flex-1 overflow-auto rounded-sm border border-white/10 shadow-lg bg-slate-900/50">
              <table className="w-full text-right text-xs">
                <thead className="bg-white/5 text-slate-300 sticky top-0 backdrop-blur-md z-10 border-b border-white/10">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">رقم السند</th>
                    <th className="py-2.5 px-3 font-semibold">التاريخ</th>
                    <th className="py-2.5 px-3 font-semibold">التصنيف</th>
                    <th className="py-2.5 px-3 font-semibold">البنك/الخزينة</th>
                    <th className="py-2.5 px-3 font-semibold">المبلغ</th>
                    <th className="py-2.5 px-3 font-semibold">المرجع</th>
                    {currentUser?.role === 'ADMIN' && <th className="py-2.5 px-3 font-semibold">تعديل</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {filteredGeneralExpenses.map((e: any) => (
                    <tr key={e.id} className="hover:bg-white/5 transition-colors group">
                      <td className="py-2.5 px-3 font-mono text-emerald-400">{e.expenseNumber}</td>
                      <td className="py-2.5 px-3">{formatReportDate(e)}</td>
                      <td className="py-2.5 px-3">{e.category?.name}</td>
                      <td className="py-2.5 px-3 text-slate-400">{e.bank?.name}</td>
                      <td className="py-2.5 px-3 font-bold text-red-400">{formatTotal(e.amount)}</td>
                      <td className="py-2.5 px-3 text-slate-500">{e.reference || '-'}</td>
                      {currentUser?.role === 'ADMIN' && <td className="py-2.5 px-3">
                        <button type="button" aria-label={`تعديل المصروف ${e.expenseNumber}`}
                          onClick={() => handleEditGeneralExpense(e)}
                          className="flex items-center gap-1 text-amber-300 hover:text-amber-200">
                          <PencilIcon size={14} /> تعديل
                        </button>
                      </td>}
                    </tr>
                  ))}
                  {filteredGeneralExpenses.length === 0 && (
                    <tr>
                      <td colSpan={currentUser?.role === 'ADMIN' ? 7 : 6} className="py-8 text-center text-slate-500">
                        لا توجد مصروفات عامة مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 9: EXPENSES */}

        {activeTab === 'EXPENSES' && (

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div>

              <h2 className="text-xl font-bold text-white">سندات الصرف للموردين</h2>

              <p className="text-xs text-slate-400 mt-0.5">تسجيل ومتابعة سندات الصرف للموردين والخصم الفوري من البنوك والخزائن</p>

            </div>

            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={expenseSearch}

                  onChange={(e) => setExpenseSearch(e.target.value)}

                  placeholder="ابحث برقم السند أو اسم المورد..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                  setEditingExpense(null);
                  setExpenseForm({ supplierId: '', bankId: '', amount: '', notes: '', reference: '' });

                  setShowExpenseModal(true);

                }}

                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PlusIcon className="w-4 h-4" />

                <span>إصدار سند صرف</span>

              </button>

              {renderPeriodTablePrint(
                'كشف سندات الصرف للموردين',
                ['رقم السند', 'التاريخ', 'المستلم (المورد)', 'الخزينة', 'البيان', 'المبلغ المصروف'],
                filteredExpenses.map(e => [
                  e.expenseNumber, formatReportDate(e), e.supplier?.name || 'غير معروف',
                  e.bank?.name || 'غير معروف', e.notes || '-', formatTotal(e.amount)
                ])
              )}
              {(() => {
                const list = filteredExpenses;
                return renderTotalsBar([
                  { label: 'عدد السندات', value: String(list.length) },
                  { label: 'إجمالي المصروف للموردين', value: formatTotal(list.reduce((s: number, e: any) => s + (e.amount || 0), 0)), tone: 'red' }
                ], true);
              })()}

            </div>



            <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">

              <table className="w-full text-right text-sm">

                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">

                  <tr>

                    <th className="p-2 font-bold">رقم السند</th>

                    <th className="p-2 font-bold">التاريخ</th>

                    <th className="p-2 font-bold">المستلم (المورد)</th>

                    <th className="p-2 font-bold">المخصوم من (الخزينة)</th>

                    <th className="p-2 font-bold">البيان</th>

                    <th className="p-2 font-bold">المبلغ المصروف</th>
                    {currentUser?.role === 'ADMIN' && <th className="p-2 font-bold">تعديل</th>}

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-800/50">

                  {filteredExpenses.map(expense => (

                    <tr key={expense.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedExpense(expense); setShowExpenseReceiptModal(true); }}>

                      <td className="p-2 font-mono text-slate-300 font-bold">{expense.expenseNumber}</td>

                      <td className="p-2 text-slate-300 font-mono text-xs">{formatReportDate(expense)}</td>

                      <td className="p-2 font-bold text-white">{expense.supplier?.name || 'غير معروف'}</td>

                      <td className="p-2 text-slate-300">{expense.bank?.name || 'غير معروف'}</td>

                      <td className="p-2 text-slate-400 text-xs">{expense.notes || '-'}</td>

                      <td className="p-2 font-mono font-bold text-red-400" dir="ltr">{formatTotal(expense.amount)} ج.م</td>
                      {currentUser?.role === 'ADMIN' && <td className="p-2">
                        <button type="button" aria-label={`تعديل سند الصرف ${expense.expenseNumber}`}
                          onClick={event => { event.stopPropagation(); handleEditExpense(expense); }}
                          className="flex items-center gap-1 text-amber-300 hover:text-amber-200">
                          <PencilIcon size={14} /> تعديل
                        </button>
                      </td>}

                    </tr>

                  ))}

                  {filteredExpenses.length === 0 && (

                    <tr>

                      <td colSpan={currentUser?.role === 'ADMIN' ? 7 : 6} className="p-10 text-center text-slate-500 font-bold">لا توجد سندات صرف مسجلة</td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}





        {/* TAB 4: BANKS */}

        {activeTab === 'BANKS' && (

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div>

              <h2 className="text-xl font-bold text-white">إدارة البنوك والخزائن</h2>

              <p className="text-xs text-slate-400 mt-0.5">إدارة الحسابات البنكية والنقدية ومتابعة الأرصدة والعمليات المالية</p>

            </div>



            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={bankSearch}

                  onChange={(e) => setBankSearch(e.target.value)}

                  placeholder="ابحث عن بنك أو خزينة بالاسم..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                onClick={() => { setIsEditingBank(false); setIsBankModalOpen(true); setBankForm({ name: '', accountNumber: '', balance: '0' }); }}

                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PlusIcon className="w-4 h-4" />

                <span>إضافة بنك / خزينة</span>

              </button>
              {currentUser?.role === 'ADMIN' && <button type="button"
                disabled={!transfersReady || transferLaunch !== null}
                onClick={() => setTransferLaunch('')}
                className="rounded-sm bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 shrink-0">
                تحويل بين الحسابات
              </button>}
              <button
                onClick={() => {
                  const list = (Array.isArray(banks) ? banks : []).filter((b: any) => (b.name || '').includes(bankSearch));
                  setPrintTableData({
                    title: 'جدول البنوك والخزائن',
                    headers: ['م', 'اسم البنك / الخزينة', 'رقم الحساب', 'الرصيد'],
                    rows: list.map((b: any, i: number) => [String(i + 1), b.name || '', b.accountNumber || '—', formatTotal(Number(b.balance) || 0)]),
                    footer: ['', 'إجمالي الأرصدة', '', formatTotal(list.reduce((s: number, b: any) => s + (Number(b.balance) || 0), 0))]
                  });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>طباعة الجدول</span>
              </button>

              {renderTotalsBar([
                { label: 'عدد الحسابات', value: String((Array.isArray(banks) ? banks : []).length) },
                { label: 'إجمالي الأرصدة', value: formatTotal((Array.isArray(banks) ? banks : []).reduce((s: number, b: any) => s + (Number(b.balance) || 0), 0)), tone: 'green' }
              ], false)}

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

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">

                  {banks.filter(b => (b.name || '').includes(bankSearch)).map((bank) => (

                    <div key={bank.id} className="glass-card rounded-sm p-3 flex flex-col justify-between border border-white/5 hover:border-red-500/20 transition-all duration-300 text-right" dir="rtl">

                      <div>

                        <div className="flex justify-between items-start mb-2">

                          <div>

                            <h3 className="text-[15px] font-bold text-white leading-snug">{bank.name}</h3>

                            <p className="text-[10px] text-slate-400 mt-1">حساب مالي</p>

                          </div>

                          <div className="bg-white/5 text-slate-400 p-1.5 rounded-sm border border-white/5">

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

                            className="bg-white/5 text-slate-400 p-1.5 rounded-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer"

                          >

                            <PencilIcon className="w-3.5 h-3.5" />

                          </button>

                        </div>

                        <div className="grid grid-cols-1 gap-x-2 gap-y-1 text-xs text-slate-300 mb-2 border-t border-white/5 pt-2 font-semibold">

                          <p>📜 رقم الحساب: <span className="text-white font-mono font-bold">{bank.accountNumber || 'لا يوجد'}</span></p>

                        </div>

                      </div>



                      <div className="border-t border-white/5 pt-2">

                        <div className="bg-black/25 px-2 py-2 rounded-sm text-center border border-white/5">

                          <span className="text-[10px] text-slate-400 block font-bold">الرصيد الحالي</span>

                          <span className="text-base font-black font-mono text-emerald-400">

                            {formatTotal(bank.balance)} ج.م

                          </span>

                        </div>

                        <button
                          type="button"
                          disabled={!transfersReady}
                          onClick={() => {
                            setSelectedBankStatement(bank);
                            setBankStatementFrom('');
                            setBankStatementTo('');
                          }}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-sm border border-indigo-400/20 bg-indigo-500/10 px-2 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20"
                        >
                          <FileTextIcon size={14} />
                          كشف حساب البنك
                        </button>
                        {currentUser?.role === 'ADMIN' && <button type="button" disabled={!transfersReady || transferLaunch !== null}
                          onClick={() => setTransferLaunch(bank.id)}
                          className="mt-2 w-full rounded-sm bg-indigo-600/20 px-2 py-2 text-xs font-bold text-indigo-200 disabled:opacity-40">
                          تحويل من هذا الحساب
                        </button>}

                      </div>

                    </div>

                  ))}

                </div>

              )}

              {currentUser?.role === 'ADMIN' && <BankTransfersPanel key={currentUser.id} user={currentUser} banks={banks}
                onSnapshot={applyTransferSnapshot} onLoading={markTransfersLoading}
                onPrint={setPrintBankTransfer} launch={transferLaunch} onCloseLaunch={closeTransferLaunch} />}
            </div>

          </div>

        )}



        {selectedBankStatement && bankStatement && activeTab === 'BANKS' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 no-print" dir="rtl">
            <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-sm border border-slate-700 bg-slate-900 shadow-2xl">
              <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 p-3">
                <div>
                  <h2 className="text-lg font-bold text-white">كشف حساب البنك: {selectedBankStatement.name}</h2>
                  <p className="text-xs text-slate-400">دفعات العملاء والمصروفات والمرتجعات والتحويلات الداخلية المرتبطة بهذا الحساب</p>
                </div>
                <button type="button" onClick={() => setSelectedBankStatement(null)} aria-label="إغلاق كشف البنك" className="rounded-sm bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white">
                  <XIcon size={18} />
                </button>
              </header>

              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3 text-xs text-slate-300">
                <span className="font-bold">من</span>
                <input type="date" value={bankStatementFrom} max={bankStatementTo || undefined} onChange={event => setBankStatementFrom(event.target.value)} className="rounded-sm border border-white/10 bg-slate-950 px-2 py-1.5 text-white" />
                <span className="font-bold">إلى</span>
                <input type="date" value={bankStatementTo} min={bankStatementFrom || undefined} onChange={event => setBankStatementTo(event.target.value)} className="rounded-sm border border-white/10 bg-slate-950 px-2 py-1.5 text-white" />
                {(bankStatementFrom || bankStatementTo) && (
                  <button type="button" onClick={() => { setBankStatementFrom(''); setBankStatementTo(''); }} className="rounded-sm border border-white/10 bg-white/5 px-2 py-1.5 font-bold hover:bg-white/10">
                    عرض كل الحركات
                  </button>
                )}
                <button type="button" onClick={printBankStatement} className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700">
                  <PrinterIcon size={14} />
                  طباعة الكشف
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
                {[
                  ['رصيد أول الفترة', bankStatement.openingBalance],
                  ['إجمالي الوارد', bankStatement.totalIncoming],
                  ['إجمالي المنصرف', bankStatement.totalOutgoing],
                  ['رصيد آخر الفترة', bankStatement.closingBalance],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-sm border border-white/10 bg-black/20 p-2">
                    <span className="block text-[10px] font-bold text-slate-400">{label}</span>
                    <strong className="font-mono text-sm text-white">{formatTotal(Number(value))} ج.م</strong>
                  </div>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3 pt-0">
                <table className="w-full min-w-[850px] text-right text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-slate-300">
                    <tr>
                      {['التاريخ', 'نوع الحركة', 'رقم المستند', 'البيان', 'المرجع / الملاحظات', 'وارد', 'منصرف', 'الرصيد'].map(header => (
                        <th key={header} className="border-b border-slate-700 p-2">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    <tr className="bg-indigo-500/10 font-bold">
                      <td className="p-2">—</td><td className="p-2">رصيد أول الفترة</td><td className="p-2">—</td><td className="p-2">—</td><td className="p-2">—</td>
                      <td className="p-2">—</td><td className="p-2">—</td><td className="p-2 font-mono">{formatTotal(bankStatement.openingBalance)}</td>
                    </tr>
                    {bankStatement.rows.map(movement => (
                      <tr key={`${movement.type}-${movement.id}`} className="hover:bg-white/5">
                        <td className="whitespace-nowrap p-2">{formatReportDate({ date: movement.date })}</td>
                        <td className="p-2">{movement.type}</td>
                        <td className="p-2 font-mono">{movement.number}</td>
                        <td className="p-2">{movement.party}</td>
                        <td className="max-w-[220px] p-2">{[movement.reference, movement.notes].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="p-2 font-mono text-emerald-300">{movement.incoming ? formatTotal(movement.incoming) : '—'}</td>
                        <td className="p-2 font-mono text-rose-300">{movement.outgoing ? formatTotal(movement.outgoing) : '—'}</td>
                        <td className="p-2 font-mono font-bold">{formatTotal(movement.balance)}</td>
                      </tr>
                    ))}
                    {!bankStatement.rows.length && (
                      <tr><td colSpan={8} className="p-8 text-center text-slate-500">لا توجد حركات في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-950 font-bold text-white">
                    <tr>
                      <td colSpan={5} className="p-2">إجمالي الحركة / الرصيد الختامي</td>
                      <td className="p-2 font-mono text-emerald-300">{formatTotal(bankStatement.totalIncoming)}</td>
                      <td className="p-2 font-mono text-rose-300">{formatTotal(bankStatement.totalOutgoing)}</td>
                      <td className="p-2 font-mono">{formatTotal(bankStatement.closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
                <p className="mt-2 text-[10px] text-slate-500">يُستنتج رصيد أول الفترة من الرصيد الحالي والحركات المسجلة، ويُحسب الرصيد الجاري بعد كل حركة.</p>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: PAYMENTS */}

        {activeTab === 'PAYMENTS' && (

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div>

              <h2 className="text-xl font-bold text-white">سداد ودفعات العملاء</h2>

              <p className="text-xs text-slate-400 mt-0.5">متابعة سجل المقبوضات وإصدار سندات القبض والدفعات من العملاء</p>

            </div>



            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={paymentSearch}

                  onChange={(e) => setPaymentSearch(e.target.value)}

                  placeholder="ابحث برقم السند أو اسم العميل..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

                onClick={() => {
                  setEditingPayment(null);
                  setPaymentCorrectionHistory([]);
                  setIsPaymentModalOpen(true);
                  setPaymentForm({ customerId: '', bankId: '', amount: '', notes: '', reference: '', date: '' });
                }}

                className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white px-2 py-2.5 rounded-sm font-bold text-xs flex gap-1.5 items-center transition-all duration-300 cursor-pointer shrink-0 shadow-lg"

              >

                <PlusIcon className="w-4 h-4" />

                <span>سند قبض جديد</span>

              </button>

              {renderPeriodTablePrint(
                'كشف سندات القبض',
                ['رقم السند', 'التاريخ', 'العميل', 'البنك/الخزينة', 'المبلغ'],
                filteredPayments.map(p => [
                  p.receiptNumber ? `REC-${p.receiptNumber}` : `REC-${p.id.substring(0, 6).toUpperCase()}`,
                  formatReportDate(p), p.customer?.name || 'غير معروف',
                  p.bank?.name || 'غير معروف', formatTotal(p.amount)
                ])
              )}
              {(() => {
                const list = filteredPayments;
                return renderTotalsBar([
                  { label: 'عدد السندات', value: String(list.length) },
                  { label: 'إجمالي المقبوضات', value: formatTotal(list.reduce((s: number, p: any) => s + (p.amount || 0), 0)), tone: 'green' }
                ], true);
              })()}

            </div>



            <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">

              <table className="w-full text-right text-sm">

                <thead>

                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">

                    <th className="p-2 font-bold">رقم السند</th>

                    <th className="p-2 font-bold">التاريخ</th>

                    <th className="p-2 font-bold">العميل</th>

                    <th className="p-2 font-bold">البنك/الخزينة</th>

                    <th className="p-2 font-bold">المبلغ</th>

                    {currentUser?.role === 'ADMIN' && <th className="p-2 font-bold">إجراء</th>}

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-800/50">

                  {filteredPayments.map(payment => (

                    <tr key={payment.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => { setSelectedReceipt(payment); setShowReceiptModal(true); }}>

                      <td className="p-2 font-mono text-slate-300 font-bold">{payment.receiptNumber ? `REC-${payment.receiptNumber}` : `REC-${payment.id.substring(0, 6).toUpperCase()}`}</td>

                      <td className="p-2 text-slate-300 font-mono text-xs">{formatReportDate(payment)}</td>

                      <td className="p-2 font-bold text-white">{payment.customer?.name || 'غير معروف'}</td>

                      <td className="p-2 text-slate-300">{payment.bank?.name || 'غير معروف'}</td>

                      <td className="p-2 font-mono font-bold text-emerald-400" dir="ltr">{formatTotal(payment.amount)} ج.م</td>

                      {currentUser?.role === 'ADMIN' && (
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); handleEditPayment(payment); }}
                            className="inline-flex items-center gap-1 rounded-sm border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                          >
                            <PencilIcon size={13} />
                            تصويب
                          </button>
                        </td>
                      )}

                    </tr>

                  ))}

                  {filteredPayments.length === 0 && (

                    <tr>

                      <td colSpan={currentUser?.role === 'ADMIN' ? 6 : 5} className="p-10 text-center text-slate-500 font-bold">لا توجد سندات قبض مسجلة</td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}







        {/* TAB 6: INVOICES */}

        {activeTab === 'INVOICES' && (

          <div className="flex-1 flex flex-col p-2 space-y-4 overflow-hidden no-print">

            <div>

              <h2 className="text-xl font-bold text-white">الفواتير وعروض الأسعار</h2>

              <p className="text-xs text-slate-400 mt-0.5">مراجعة وإعادة طباعة فواتير المبيعات وعروض الأسعار الصادرة للمؤسسات والأفراد</p>

            </div>



            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto pb-1">

              <div className="relative group w-[260px] shrink-0">

                <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">

                  <SearchIcon className="h-4 w-4 text-slate-400 group-focus-within:text-slate-200 transition-colors" />

                </div>

                <input

                  type="text"

                  value={invoiceSearch}

                  onChange={(e) => setInvoiceSearch(e.target.value)}

                  placeholder="ابحث برقم الفاتورة أو اسم العميل..."

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 pr-10 pl-10 text-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-transparent transition-all shadow-lg"

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

              {renderPeriodTablePrint(
                'كشف الفواتير وعروض الأسعار',
                ['رقم الفاتورة', 'التاريخ', 'العميل', 'النوع', 'الإجمالي', 'المرتجعات', 'الصافي'],
                filteredInvoices.map(inv => [
                  inv.invoiceNumber, formatReportDate(inv), inv.customer?.name || inv.customerName || 'عميل نقدي',
                  inv.isQuotation ? (inv.status === 'CONVERTED' ? 'عرض سعر (تم التحويل)' : 'عرض سعر') : 'فاتورة',
                  formatTotal(inv.netAmount),
                  formatTotal((inv.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.netAmount || 0), 0)),
                  formatTotal(inv.netAmount - (inv.orderReturns || []).reduce((sum: number, orderReturn: ReturnRecordSummary) => sum + Number(orderReturn.netAmount || 0), 0))
                ])
              )}
              {(() => {
                const list = filteredInvoices;
                const sales = list.filter((o: any) => !o.isQuotation);
                const quotes = list.filter((o: any) => o.isQuotation);
                const totalSales = sales.reduce((sum: number, order: any) => sum + Number(order.netAmount || 0), 0);
                const totalReturns = sales.reduce((sum: number, order: InvoiceSalesSummary) =>
                  sum + (order.orderReturns || []).reduce((returns: number, orderReturn: ReturnRecordSummary) => returns + Number(orderReturn.netAmount || 0), 0), 0);
                const totalReturnTax = sales.reduce((sum: number, order: InvoiceSalesSummary) =>
                  sum + (order.orderReturns || []).reduce((returns: number, orderReturn: ReturnRecordSummary) => returns + Number(orderReturn.taxAmount || 0), 0), 0);
                return renderTotalsBar([
                  { label: 'عدد الفواتير', value: String(sales.length) },
                  { label: 'صافي المبيعات بعد المرتجعات', value: formatTotal(totalSales - totalReturns), tone: 'green' },
                  { label: 'صافي الضريبة', value: formatTotal(sales.reduce((sum: number, order: any) => sum + Number(order.taxAmount || 0), 0) - totalReturnTax) },
                  { label: 'عروض الأسعار', value: `${quotes.length} (${formatTotal(quotes.reduce((s: number, o: any) => s + (o.netAmount || 0), 0))})` }
                ], true);
              })()}

            </div>



            <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden shadow-xl flex-1 overflow-y-auto custom-scrollbar">

              <table className="w-full text-right text-sm">

                <thead>

                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">

                    <th className="p-2 font-bold">رقم الفاتورة</th>

                    <th className="p-2 font-bold">التاريخ</th>

                    <th className="p-2 font-bold">العميل</th>

                    <th className="p-2 font-bold">النوع</th>

                    <th className="p-2 font-bold">الإجمالي</th>
                    <th className="p-2 font-bold">إجراء</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-800/50">

                  {filteredInvoices.map(inv => (

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

                      <td className="p-2 font-mono text-slate-300 font-bold">{inv.invoiceNumber}</td>

                      <td className="p-2 text-slate-300 font-mono text-xs">{formatReportDate(inv)}</td>

                      <td className="p-2 font-bold text-white">{inv.customer?.name || inv.customerName || 'عميل نقدي'}</td>

                      <td className="p-2 text-slate-300">

                        <span className={`px-2 py-1 rounded text-xs font-bold ${inv.isQuotation ? (inv.status === 'CONVERTED' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400') : 'bg-emerald-500/10 text-emerald-400'}`}>

                          {inv.isQuotation ? (inv.status === 'CONVERTED' ? 'عرض سعر (تم التحويل)' : 'عرض سعر') : 'فاتورة'}

                        </span>

                      </td>

                      <td className="p-2 font-mono font-bold text-white" dir="ltr">{formatTotal(inv.netAmount)} ج.م</td>
                      <td className="p-2">
                        {currentUser?.role === 'ADMIN' && inv.isQuotation && inv.status !== 'CONVERTED' && (
                          <button type="button" className="rounded bg-indigo-600/20 px-2 py-1 text-xs font-bold text-indigo-300"
                            onClick={event => { event.stopPropagation(); setEditingQuotation(inv); }}>تعديل عرض السعر</button>
                        )}
                        {!inv.isQuotation && inv.status === 'COMPLETED' && (
                          <div className="flex flex-wrap gap-1">
                            {currentUser?.role === 'ADMIN' && <button type="button"
                              className="rounded bg-indigo-600/20 px-2 py-1 text-xs font-bold text-indigo-300"
                              onClick={event => { event.stopPropagation(); setEditingInvoiceDetails(inv); }}>تعديل بيانات الفاتورة</button>}
                            <button
                              type="button"
                              disabled={!hasReturnableItems(inv)}
                              onClick={event => { event.stopPropagation(); openReturnDialog(inv); }}
                              className="rounded-sm bg-amber-600/20 px-2 py-1 text-xs font-bold text-amber-300 hover:bg-amber-600/40 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {hasReturnableItems(inv) ? 'إنشاء مرتجع' : 'اكتمل المرتجع'}
                            </button>
                            {!!inv.orderReturns?.length && (
                              <button
                                type="button"
                                onClick={event => { event.stopPropagation(); openReturnHistory(inv); }}
                                className="rounded-sm bg-slate-700 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-600"
                              >
                                المرتجعات ({inv.orderReturns.length})
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                    </tr>

                  ))}

                  {filteredInvoices.length === 0 && (

                    <tr>

                      <td colSpan={6} className="p-10 text-center text-slate-500 font-bold">لا توجد فواتير مسجلة</td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}





      </div>



      {/* MODAL 1: INVOICE & QUOTATION PRINT MODAL */}
      {printStocktake && <StocktakePrint document={printStocktake} onClose={() => setPrintStocktake(null)} />}
      {printBankTransfer && <BankTransferPrint transfer={printBankTransfer} onClose={() => setPrintBankTransfer(null)} />}
      {showQuotationPricing && currentUser?.role === 'ADMIN' && <QuotationPricingDraft user={currentUser} busy={submitting}
        initialLines={cart.map(item => ({ productId: item.id, quantity: String(item.qty), unitPrice: String(item.price) }))}
        names={Object.fromEntries(cart.map(item => [item.id, [item.code, item.name, item.size, item.color].filter(Boolean).join(' - ')]))}
        taxRates={Object.fromEntries(cart.map(item => [item.id, ['فاتورة', 'فاتورة مبسطة'].includes(invoiceType) ? 0 : Number(products.find(product => product.id === item.id)?.taxRate)]))}
        onClose={() => setShowQuotationPricing(false)} onSave={lines => handleCheckout(true, lines)} />}
      {editingQuotation && currentUser?.role === 'ADMIN' && (
        <QuotationEdit quotation={editingQuotation} products={products} user={currentUser}
          onClose={() => setEditingQuotation(null)}
          onSaved={saved => {
            setEditingQuotation(null);
            setInvoice(saved);
            setQrCodeUrl('');
            setShowModal(true);
            fetchInvoices();
            fetchCustomers();
          }} />
      )}
      {editingInvoiceDetails && currentUser?.role === 'ADMIN' && (
        <InvoiceDetailsEdit invoice={editingInvoiceDetails} customers={customers} user={currentUser}
          onClose={() => setEditingInvoiceDetails(null)}
          onSaved={async saved => {
            setEditingInvoiceDetails(null);
            setInvoice(saved);
            setShowModal(true);
            fetchInvoices();
            fetchCustomers();
            setQrCodeUrl('');
            if (saved.qrCode) {
              try { setQrCodeUrl(await QRCode.toDataURL(saved.qrCode, { width: 160, margin: 1 })); }
              catch (error) {
                console.error('Failed to render invoice QR after detail edit:', error);
                alert('تم حفظ بيانات الفاتورة، لكن تعذر عرض رمز QR. أعد فتح الفاتورة.');
              }
            }
          }} />
      )}

      {showModal && invoice && (
        <InvoicePrint
          invoice={invoice}
          qrCodeUrl={qrCodeUrl}
          onClose={() => setShowModal(false)}
          actions={invoice.isQuotation && invoice.status !== 'CONVERTED' ? (
            <>
            {currentUser?.role === 'ADMIN' && <button type="button" onClick={() => { setShowModal(false); setEditingQuotation(invoice); }}>تعديل عرض السعر</button>}
            <button type="button" onClick={convertQuotationToInvoice}>تحويل لفاتورة</button>
            </>
          ) : !invoice.isQuotation && invoice.status === 'COMPLETED' ? (
            <>
              {currentUser?.role === 'ADMIN' && <button type="button" onClick={() => { setShowModal(false); setEditingInvoiceDetails(invoice); }}>تعديل بيانات الفاتورة</button>}
              {hasReturnableItems(invoice) && <button type="button" onClick={() => openReturnDialog(invoice)}>إنشاء مرتجع</button>}
              {!!invoice.orderReturns?.length && <button type="button" onClick={() => openReturnHistory(invoice)}>عرض المرتجعات ({invoice.orderReturns.length})</button>}
            </>
          ) : null}
        />
      )}

      {showReturnModal && returnInvoice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" dir="rtl">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 p-3">
              <div>
                <h3 className="text-lg font-black text-white">إنشاء مرتجع</h3>
                <p className="text-xs text-slate-400">الفاتورة {returnInvoice.invoiceNumber} · {returnInvoice.customer?.name || returnInvoice.customerName || 'عميل نقدي'}</p>
              </div>
              <button type="button" onClick={() => setShowReturnModal(false)} className="rounded p-2 text-slate-300 hover:bg-white/10" aria-label="إغلاق">×</button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <th className="p-2">الصنف</th><th className="p-2">المباع</th><th className="p-2">مرتجع سابقًا</th>
                    <th className="p-2">المتاح للإرجاع</th><th className="p-2">كمية المرتجع</th><th className="p-2">سعر الوحدة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {returnInvoice.items.map(item => {
                    const previous = returnQuantitiesByItem.get(item.id) || 0;
                    const remaining = Math.max(0, Number(item.quantity) - previous);
                    return (
                      <tr key={item.id}>
                        <td className="p-2 font-bold text-white">{item.product?.name || 'صنف'} <span className="text-xs text-slate-400">{item.product?.code || ''}</span></td>
                        <td className="p-2 font-mono">{item.quantity}</td>
                        <td className="p-2 font-mono text-amber-300">{previous}</td>
                        <td className="p-2 font-mono text-emerald-300">{remaining}</td>
                        <td className="p-2">
                          <input
                            type="number" min="0" max={remaining} step="1"
                            value={returnQuantities[item.id] || ''}
                            disabled={remaining === 0}
                            onChange={event => {
                              const value = event.target.value;
                              const quantity = value === '' ? '' : String(Math.min(remaining, Math.max(0, Math.trunc(Number(value) || 0))));
                              setReturnQuantities(previousValues => ({ ...previousValues, [item.id]: quantity }));
                            }}
                            className="w-24 rounded-sm border border-white/10 bg-slate-950 px-2 py-1 text-white disabled:opacity-40"
                          />
                        </td>
                        <td className="p-2 font-mono">{formatTotal(item.unitPrice)} ج.م</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 grid gap-3 rounded border border-white/10 bg-slate-950/70 p-3 md:grid-cols-3">
                <div><span className="block text-xs text-slate-400">إجمالي قيمة الأصناف المرتجعة</span><b className="font-mono text-lg text-amber-300">{formatTotal(returnPreviewNet)} ج.م</b></div>
                <div><span className="block text-xs text-slate-400">المخصوم من مديونية العميل</span><b className="font-mono text-lg text-emerald-300">{formatTotal(Math.min(returnPreviewNet, Math.max(returnCustomerBalance, 0)))} ج.م</b></div>
                <div><span className="block text-xs text-slate-400">المبلغ المستحق رده</span><b className="font-mono text-lg text-rose-300">{formatTotal(returnPreviewRefund)} ج.م</b></div>
              </div>
              {!returnBalanceKnown && <p className="mt-2 text-sm font-bold text-red-300">تعذر تحميل رصيد العميل. حدّث قائمة العملاء قبل اعتماد المرتجع.</p>}
              {returnBalanceKnown && (returnCustomer?.discounts?.length || 0) > 0 && (
                <p className="mt-2 text-sm font-bold text-amber-300">تنبيه: سندات خصم العميل مستقلة ولا تُعكس تلقائيًا عند المرتجع، وقد تؤثر في مبلغ الرد.</p>
              )}
              {returnPreviewRefund > 0 && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
                    طريقة رد المبلغ
                    <select value={returnRefundMethod} onChange={event => setReturnRefundMethod(event.target.value as 'CASH' | 'BANK')}
                      className="min-w-48 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-white">
                      <option value="CASH">نقدًا</option>
                      <option value="BANK">من بنك</option>
                    </select>
                  </label>
                  {returnRefundMethod === 'BANK' && (
                    <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
                      البنك
                      <select value={returnBankId} onChange={event => setReturnBankId(event.target.value)}
                        className="min-w-56 rounded-sm border border-white/10 bg-slate-950 px-3 py-2 text-white">
                        <option value="">اختر البنك</option>
                        {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 p-3">
              <button type="button" onClick={() => setShowReturnModal(false)} className="rounded-sm bg-slate-700 px-4 py-2 font-bold text-white">إلغاء</button>
              <button
                type="button"
                disabled={submittingReturn || !returnPreviewItems.length || !returnBalanceKnown || (returnPreviewRefund > 0 && returnRefundMethod === 'BANK' && !returnBankId)}
                onClick={submitOrderReturn}
                className="rounded-sm bg-amber-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingReturn ? 'جارٍ اعتماد المرتجع...' : 'اعتماد المرتجع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnPrintModal && selectedOrderReturn && (
        <ReturnPrint orderReturn={selectedOrderReturn} onClose={() => setShowReturnPrintModal(false)} />
      )}

      {showReturnHistoryModal && returnHistoryInvoice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 no-print" dir="rtl">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 p-3">
              <div>
                <h3 className="text-lg font-black text-white">مرتجعات الفاتورة</h3>
                <p className="text-xs text-slate-400">الفاتورة {returnHistoryInvoice.invoiceNumber}</p>
              </div>
              <button type="button" onClick={() => setShowReturnHistoryModal(false)} className="rounded p-2 text-slate-300 hover:bg-white/10" aria-label="إغلاق">×</button>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <th className="p-2">رقم المرتجع</th>
                    <th className="p-2">التاريخ</th>
                    <th className="p-2">قيمة المرتجع</th>
                    <th className="p-2">المبلغ المردود</th>
                    <th className="p-2">طريقة الرد</th>
                    <th className="p-2">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...(returnHistoryInvoice.orderReturns || [])]
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .map(orderReturn => (
                      <tr key={orderReturn.id}>
                        <td className="p-2 font-mono text-white">{orderReturn.returnNumber}</td>
                        <td className="p-2 text-slate-300">{formatReportDate(orderReturn)}</td>
                        <td className="p-2 font-mono">{formatTotal(orderReturn.netAmount)} ج.م</td>
                        <td className="p-2 font-mono">{formatTotal(orderReturn.refundAmount)} ج.م</td>
                        <td className="p-2">{orderReturn.refundMethod === 'BANK' ? `بنك ${orderReturn.bank?.name || ''}` : orderReturn.refundMethod === 'CASH' ? 'نقدًا' : 'تسوية مديونية'}</td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderReturn({
                                ...orderReturn,
                                customer: returnHistoryInvoice.customer,
                                order: { invoiceNumber: returnHistoryInvoice.invoiceNumber }
                              });
                              setShowReturnHistoryModal(false);
                              setShowReturnPrintModal(true);
                            }}
                            className="rounded-sm bg-sky-700 px-2 py-1 text-xs font-bold text-white hover:bg-sky-600"
                          >
                            طباعة
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* Change Password Modal */}

      {showChangePasswordModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 no-print" dir="rtl">

          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded overflow-hidden shadow-2xl flex flex-col">

            <div className="p-2 bg-slate-950 border-b border-white/5 flex justify-between items-center">

              <h3 className="text-lg font-bold text-white">تغيير كلمة المرور</h3>

              <button

                onClick={() => setShowChangePasswordModal(false)}

                className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer"

              >

                <XIcon size={18} />

              </button>

            </div>



            <form onSubmit={handlePasswordChange} className="p-3 space-y-4">

              <div className="space-y-1.5">

                <label className="text-xs text-slate-400 font-bold block">المستهدف</label>

                {currentUser?.role === 'ADMIN' ? (

                  <select

                    value={changePasswordForm.userId}

                    onChange={(e) => setChangePasswordForm(prev => ({ ...prev, userId: e.target.value }))}

                    className="w-full bg-slate-950 border border-white/10 rounded-sm px-2 py-1.5 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-primary transition-all cursor-pointer"

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

                    className="w-full bg-slate-950/50 border border-white/5 rounded-sm px-2 py-1.5 text-sm text-slate-400 font-bold"

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

                  className="w-full bg-slate-950 border border-white/10 rounded-sm px-2 py-1.5 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-primary transition-all text-center tracking-widest"

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

                  className="w-full bg-slate-950 border border-white/10 rounded-sm px-2 py-1.5 text-sm text-slate-200 font-bold focus:outline-none focus:border-entlaq-primary transition-all text-center tracking-widest"

                  required

                />

              </div>



              <button

                type="submit"

                className="w-full bg-entlaq-primary hover:bg-teal-500 active:scale-95 text-white font-bold text-sm py-1.5 rounded-sm shadow-lg shadow-teal-500/20 transition-all cursor-pointer mt-2"

              >

                تحديث كلمة المرور

              </button>

            </form>

          </div>

        </div>

      )}



      {/* MODAL 2: PRODUCT IN-GRID DETAIL PREVIEW */}


      {/* General Expense Modal */}
      {showGeneralExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-md w-full max-w-lg shadow-2xl relative">
            <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">
              {editingGeneralExpense ? 'تعديل مصروف عام' : 'تسجيل مصروف عام'}
            </h3>

            <form onSubmit={handleSaveGeneralExpense} className="space-y-4">
              {editingGeneralExpense && (
                <label className="block text-xs text-slate-300">تاريخ المستند
                  <input type="date" required aria-label="تاريخ المصروف العام" value={editingGeneralExpense.date}
                    onChange={e => setEditingGeneralExpense({ ...editingGeneralExpense, date: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 mt-1" />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <ProductOptionField
                  label="التصنيف *"
                  itemLabel="التصنيف"
                  required
                  valueBy="id"
                  placeholder="-- اختر التصنيف --"
                  value={generalExpenseForm.categoryId}
                  onChange={categoryId => setGeneralExpenseForm(prev => ({ ...prev, categoryId }))}
                  options={expenseCategories.map((c: any) => ({ id: c.id, value: c.name }))}
                  canManage={currentUser?.role === 'ADMIN'}
                  sessionToken={currentUser?.sessionToken}
                  request={input => requestExpenseCategories(currentUser?.sessionToken, input)}
                  onOptionsChanged={(rows: any[]) => setExpenseCategories(rows)}
                  selectClassName="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">يخصم من (البنك/الخزينة) *</label>
                  <select
                    required
                    value={generalExpenseForm.bankId}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, bankId: e.target.value }))}
                    className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="">-- اختر الحساب --</option>
                    {banks.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.name} (الرصيد: {formatTotal(b.balance)})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">المبلغ *</label>
                  <MoneyInput
                    step="0.01"
                    min="0.01"
                    required
                    value={generalExpenseForm.amount}
                    onValueChange={(value) => setGeneralExpenseForm(prev => ({ ...prev, amount: value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="المبلغ..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رقم المرجع / الفاتورة</label>
                  <input
                    type="text"
                    value={generalExpenseForm.reference}
                    onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    placeholder="اختياري"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block mb-1 text-slate-300">البيان / ملاحظات</label>
                <textarea
                  rows={3}
                  value={generalExpenseForm.notes}
                  onChange={(e) => setGeneralExpenseForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 resize-none"
                  placeholder="اكتب تفاصيل المصروف هنا..."
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-1.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-emerald-600/80 hover:bg-emerald-600 text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center transition-all cursor-pointer shadow-lg shadow-emerald-900/20"
                >
                  <CheckCircle2Icon size={16} />
                  <span>{submitting ? 'جارٍ الحفظ...' : editingGeneralExpense ? 'حفظ التعديل' : 'حفظ واعتماد'}</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowGeneralExpenseModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-sm font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProductModal && selectedProduct && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">



            {/* Modal Header */}

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-bold">

                  {getCategoryNameAr(selectedProduct.type)}

                </span>

                <h3 className="text-lg font-bold text-white mt-1">{selectedProduct.name}</h3>

              </div>

              <button

                onClick={() => setShowProductModal(false)}

                className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer"

              >

                <XIcon size={18} />

              </button>

            </div>



            {/* Modal Body */}

            <div className="p-3 space-y-6 overflow-y-auto custom-scrollbar">

              <div className="w-full aspect-video rounded overflow-hidden bg-black/30 border border-white/5 relative group">

                <img

                  src={getProductImage(selectedProduct.type)}

                  alt={selectedProduct.name}

                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"

                />

              </div>



              {/* Product Info Grid */}

              <div className="grid grid-cols-2 gap-2">

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">كود الصنف (Code)</span>

                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.code}</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">المقاس (Size)</span>

                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.size}</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">اللون (Color)</span>

                  <span className="text-sm font-bold text-white">{selectedProduct.color || '-'}</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">الطول (Length)</span>

                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.length || '-'}</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">الوزن (Weight)</span>

                  <span className="text-sm font-bold text-white font-mono">{selectedProduct.weight || '-'}</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded">

                  <span className="text-[10px] text-slate-400 block">سعر البيع</span>

                  <span className="text-sm font-bold text-emerald-400 font-mono">{formatTotal(selectedProduct.price)} ج.م</span>

                </div>

                <div className="bg-white/5 border border-white/5 p-3 rounded col-span-2 text-center">

                  <span className="text-[10px] text-slate-400 block">المخزون المتاح</span>

                  <span className={`text-base font-bold font-mono ${selectedProduct.stockQty <= 0 ? 'text-red-500' : selectedProduct.stockQty <= selectedProduct.minStockQty ? 'text-amber-400' : 'text-emerald-400'}`}>

                    {selectedProduct.stockQty} وحدة

                  </span>

                </div>

              </div>



              {/* Description */}

              <div className="space-y-2">

                <h4 className="text-xs font-bold text-slate-400">الوصف والمواصفات الفنية</h4>

                <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-3 rounded border border-white/5">

                  {getProductDescription(selectedProduct.type, selectedProduct.name)}

                </p>

              </div>

            </div>



            {/* Modal Footer */}

            <div className="p-2 bg-slate-950 border-t border-slate-800 flex gap-1.5">

              <button

                disabled={selectedProduct.stockQty <= 0}

                onClick={() => {

                  addToCart(selectedProduct);

                  setShowProductModal(false);

                }}

                className="flex-1 bg-entlaq-primary text-white py-1.5 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all disabled:opacity-40 disabled:hover:bg-entlaq-primary cursor-pointer"

              >

                <ShoppingCartIcon size={16} />

                إضافة إلى الفاتورة

              </button>

              <button

                onClick={() => setShowProductModal(false)}

                className="bg-white/5 text-slate-300 px-3 py-1.5 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

              >

                إلغاء

              </button>

            </div>



          </div>

        </div>

      )}



      {/* MODAL 3: CUSTOMER FORM MODAL */}

      {showCustomerModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">



            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white">

                  {isEditingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}

                </h3>

                <p className="text-xs text-slate-400 mt-1">أدخل تفاصيل العميل لتسجيل الفواتير المخصصة والشركات</p>

              </div>

              <button

                onClick={() => setShowCustomerModal(false)}

                className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer"

              >

                <XIcon size={18} />

              </button>

            </div>



            <form onSubmit={handleSaveCustomer} className="p-2 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم العميل / الشركة *</label>

                <input

                  type="text"

                  required

                  value={customerForm.name}

                  onChange={(e) => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}

                  placeholder="مثال: شركة المقاولون العرب"

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                />

              </div>



              <div className="grid grid-cols-3 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">رقم التلفون</label>

                  <input

                    type="text"

                    value={customerForm.phone}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}

                    placeholder="مثال: 01021683030"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الموقع</label>

                  <input

                    type="text"

                    value={customerForm.location}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, location: e.target.value }))}

                    placeholder="مثال: القاهرة - مدينة نصر"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

              </div>



              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">عدد العماير</label>

                  <input

                    type="number"

                    value={customerForm.buildingsCount}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, buildingsCount: e.target.value }))}

                    placeholder="مثال: 5"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">السجل التجاري</label>

                  <input

                    type="text"

                    value={customerForm.cr}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, cr: e.target.value }))}

                    placeholder="مثال: 1010123456"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

              </div>



              <div className="grid grid-cols-4 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الرقم الضريبي</label>

                  <input

                    type="text"

                    value={customerForm.trn}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, trn: e.target.value }))}

                    placeholder="مثال: 310122345600003"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">طبيعة العميل</label>

                  <select

                    value={customerForm.customerType}

                    onChange={(e) => setCustomerForm(prev => ({ ...prev, customerType: e.target.value }))}

                    className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs font-bold"

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

                    className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"

                  />

                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 block mb-1 text-slate-300">رصيد أول المدة</label>
                  <MoneyInput
                    min="0"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-xs"
                    placeholder="رصيد أول المدة..."
                    value={customerForm.openingBalance}
                    onValueChange={(value) => setCustomerForm(prev => ({ ...prev, openingBalance: value }))}
                  />

              </div>
              </div>



              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button

                  type="submit"

                  className="flex-1 bg-entlaq-primary text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all cursor-pointer shadow-lg shadow-teal-500/10"

                >

                  حفظ البيانات

                </button>

                <button

                  type="button"

                  onClick={() => setShowCustomerModal(false)}

                  className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

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

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">



            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white">

                  {isEditingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد بالمخزن'}

                </h3>

                <p className="text-xs text-slate-400 mt-1">أدخل المواصفات الفنية والمالية للصنف بدقة</p>

              </div>

              <button

                onClick={() => setShowProductFormModal(false)}

                className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer"

              >

                <XIcon size={18} />

              </button>

            </div>



            <form onSubmit={handleSaveProduct} className="p-2 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">
              {productSaveNotice && (
                <div role={productSaveNotice.kind === 'error' ? 'alert' : 'status'} aria-live="polite"
                  className={`p-3 rounded border text-sm ${productSaveNotice.kind === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                  {productSaveNotice.message}
                </div>
              )}





              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">كود الصنف *</label>

                  <input

                    type="text"

                    required

                    value={productForm.code}

                    onChange={(e) => setProductForm(prev => ({ ...prev, code: e.target.value }))}

                    placeholder="مثال: 3020"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الباركود (اختياري)</label>

                  <input

                    type="text"

                    value={productForm.barcode}

                    onChange={(e) => setProductForm(prev => ({ ...prev, barcode: e.target.value }))}

                    placeholder="مثال: 6221234567890"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

              </div>



              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم المنتج *</label>

                  <input

                    type="text"

                    required

                    value={productForm.name}

                    onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}

                    placeholder="مثال: ماسورة كهرباء UPVC"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <ProductOptionField
                  kind="type"
                  label="النوع *"
                  required
                  value={productForm.type}
                  onChange={type => setProductForm(prev => ({ ...prev, type }))}
                  options={productOptions.type}
                  canManage={currentUser?.role === 'ADMIN'}
                  sessionToken={currentUser?.sessionToken}
                  onOptionsChanged={handleProductOptionsChanged}
                />

              </div>



              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">المقاس *</label>

                  <input

                    type="text"

                    required

                    value={productForm.size}

                    onChange={(e) => setProductForm(prev => ({ ...prev, size: e.target.value }))}

                    placeholder="مثال: 20 mm"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <ProductOptionField
                  kind="gauge"
                  label="الدرجة"
                  placeholder="-- اختر الدرجة --"
                  value={productForm.gauge}
                  onChange={gauge => setProductForm(prev => ({ ...prev, gauge }))}
                  options={productOptions.gauge}
                  canManage={currentUser?.role === 'ADMIN'}
                  sessionToken={currentUser?.sessionToken}
                  onOptionsChanged={handleProductOptionsChanged}
                />

              </div>



              <div className="grid grid-cols-2 gap-2">

                <ProductOptionField
                  kind="color"
                  label="اللون"
                  value={productForm.color || ''}
                  onChange={color => setProductForm(prev => ({ ...prev, color }))}
                  options={productOptions.color}
                  canManage={currentUser?.role === 'ADMIN'}
                  sessionToken={currentUser?.sessionToken}
                  onOptionsChanged={handleProductOptionsChanged}
                />

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1">المورد (اختياري)</label>

                  <select

                    value={productForm.supplierId || ''}

                    onChange={(e) => setProductForm(prev => ({ ...prev, supplierId: e.target.value }))}

                    className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  >

                    <option value="">-- بدون مورد محدد --</option>

                    {suppliers.map(s => (

                      <option key={s.id} value={s.id}>{s.name}</option>

                    ))}

                  </select>

                </div>

              </div>



              <div className="grid grid-cols-3 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الطول</label>

                  <input

                    type="text"

                    value={productForm.length}

                    onChange={(e) => setProductForm(prev => ({ ...prev, length: e.target.value }))}

                    placeholder="مثال: 45 m"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الوزن</label>

                  <input

                    type="text"

                    value={productForm.weight}

                    onChange={(e) => {
                      const w = e.target.value;
                      setProductForm(prev => {
                        const cost = (parseFloat(w) || 0) * (parseFloat(prev.pricePerKilo) || 0);
                        const computedPrice = cost * (1 + (parseFloat(prev.markup) || 30) / 100);
                        return {
                          ...prev,
                          weight: w,
                          ...(cost > 0 && {
                            costPrice: cost.toFixed(2),
                            price: computedPrice.toFixed(2)
                          })
                        };
                      });
                    }}

                    placeholder="مثال: 5.050 kg"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                {currentUser?.role !== 'STOREKEEPER' && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الكيلو</label>
                    <MoneyInput
                      min="0"
                      step="0.01"
                      className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      placeholder="سعر الكيلو..."
                      value={productForm.pricePerKilo}
                      onValueChange={(value) => {
                        const ppk = value;
                        setProductForm(prev => {
                          const cost = (parseFloat(prev.weight) || 0) * (parseFloat(ppk) || 0);
                          const computedPrice = cost * (1 + (parseFloat(prev.markup) || 30) / 100);
                          return {
                            ...prev,
                            pricePerKilo: ppk,
                            ...(cost > 0 && {
                              costPrice: cost.toFixed(2),
                              price: computedPrice.toFixed(2)
                            })
                          };
                        });
                      }}
                    />
                  </div>
                )}

              </div>



              {currentUser?.role === 'ADMIN' ? (

                <div className="grid grid-cols-3 gap-2">

                  <div className="space-y-1">

                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر الشراء (التكلفة) *</label>

                    <MoneyInput
                      step="0.01"

                      required

                      value={productForm.costPrice}

                      onValueChange={(value) => {

                        const cost = value;

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

                      className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

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

                      className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                    />

                  </div>

                  <div className="space-y-1">

                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر البيع *</label>

                    <MoneyInput
                      step="0.01"

                      required

                      value={productForm.price}

                      onValueChange={(value) => setProductForm(prev => ({ ...prev, price: value }))}

                      placeholder="سعر البيع النهائي"

                      className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                    />

                  </div>

                </div>

              ) : (

                <div className="grid grid-cols-1 gap-2">

                  <div className="space-y-1">

                    <label className="text-xs text-slate-400 block mb-1 text-slate-300">سعر البيع *</label>

                    <MoneyInput
                      step="0.01"

                      required

                      disabled

                      value={productForm.price}

                      placeholder="سعر البيع النهائي"

                      className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none font-bold"

                    />

                  </div>

                </div>

              )}



              <div className="grid grid-cols-3 gap-2">

                {!isEditingProduct && (
                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الكمية الحالية *</label>

                  <input

                    type="number"

                    required

                    value={productForm.stockQty}

                    onChange={(e) => setProductForm(prev => ({ ...prev, stockQty: e.target.value }))}

                    placeholder="الكمية"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>
                )}

                <div className="space-y-1">

                  <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الحد الأدنى *</label>

                  <input

                    type="number"

                    required

                    value={productForm.minStockQty}

                    onChange={(e) => setProductForm(prev => ({ ...prev, minStockQty: e.target.value }))}

                    placeholder="حد التنبيه"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

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

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>
                </div>



              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button

                  type="submit"
                  disabled={savingProduct}

                  className="flex-1 bg-entlaq-primary text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all cursor-pointer shadow-lg shadow-teal-500/10"

                >

                  {savingProduct ? 'جارٍ الحفظ...' : 'حفظ البيانات'}

                </button>

                <button

                  type="button"

                  onClick={() => setShowProductFormModal(false)}

                  className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

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

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-md max-h-[95vh] overflow-y-auto rounded-sm shadow-2xl flex flex-col">

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white">{isEditingBank ? 'تعديل بنك / خزينة' : 'إضافة بنك / خزينة'}</h3>

              </div>

              <button onClick={() => setIsBankModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer">

                <XIcon size={18} />

              </button>

            </div>

            <form onSubmit={handleSaveBank} className="p-2 space-y-3" dir="rtl">

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">اسم البنك / الخزينة *</label>

                <input type="text" required value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50" placeholder="مثال: البنك الأهلي" />

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">رقم الحساب</label>

                <input type="text" value={bankForm.accountNumber} onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono text-left" placeholder="رقم الحساب البنكي" dir="ltr" />

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">الرصيد الافتتاحي *</label>

                <MoneyInput  step="0.01" required value={bankForm.balance} onValueChange={value => setBankForm({ ...bankForm, balance: value })} className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono" />

              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button type="submit" disabled={submitting} className="flex-1 bg-entlaq-primary text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all cursor-pointer shadow-lg shadow-teal-500/10 disabled:opacity-50">حفظ</button>

                <button type="button" onClick={() => setIsBankModalOpen(false)} className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer">إلغاء</button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* MODAL 6: PAYMENT FORM MODAL */}

      {isPaymentModalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-sm overflow-hidden shadow-2xl flex flex-col">

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white">{editingPayment ? 'تصويب سند القبض' : 'إصدار سند قبض جديد'}</h3>

              </div>

              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer">

                <XIcon size={18} />

              </button>

            </div>

            <form onSubmit={handleSavePayment} className="p-2 space-y-3" dir="rtl">

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">العميل *</label>

                <select required value={paymentForm.customerId} onChange={e => setPaymentForm({ ...paymentForm, customerId: e.target.value })} className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold">

                  <option value="">-- اختر العميل --</option>

                  {customers.filter(c => c.id !== 'CASH').map(c => (

                    <option key={c.id} value={c.id}>{c.name}</option>

                  ))}

                </select>

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">البنك / الخزينة *</label>

                <select required value={paymentForm.bankId} onChange={e => setPaymentForm({ ...paymentForm, bankId: e.target.value })} className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold">

                  <option value="">-- اختر البنك أو الخزينة --</option>

                  {banks.map(b => (

                    <option key={b.id} value={b.id}>{b.name} ({formatTotal(b.balance)} ج.م)</option>

                  ))}

                </select>

              </div>

              {editingPayment && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 block">تاريخ السند *</label>
                  <input
                    type="date"
                    required
                    value={paymentForm.date}
                    onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              )}

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">المبلغ المدفوع *</label>

                <MoneyInput  min="0.01" step="0.01" required value={paymentForm.amount} onValueChange={value => setPaymentForm({ ...paymentForm, amount: value })} className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono text-xl text-emerald-400" placeholder="0.00" />

              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 block">رقم المرجع / الشيك</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="رقم المرجع أو الشيك"
                />
              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-400 block mb-1 mb-1 mb-1 text-slate-300">ملاحظات / رقم الشيك</label>

                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50" placeholder="مثال: دفعة تحت الحساب بشيك رقم..." />

              </div>

              {editingPayment && paymentCorrectionHistory.length > 0 && (
                <details className="rounded-sm border border-white/10 bg-white/5 p-2">
                  <summary className="cursor-pointer text-xs font-bold text-amber-300">
                    سجل التصويبات السابقة ({paymentCorrectionHistory.length})
                  </summary>
                  <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                    {paymentCorrectionHistory.map((entry, index) => (
                      <div key={`${entry.correctedAt || 'correction'}-${index}`} className="border-t border-white/10 pt-2 text-xs text-slate-300">
                        <div>{entry.correctedAt ? new Date(entry.correctedAt).toLocaleString('ar-EG') : 'تاريخ غير متوفر'}</div>
                        <div>
                          المبلغ: {formatTotal(Number(entry.before?.amount || 0))} ← {formatTotal(Number(entry.after?.amount || 0))} ج.م
                          {' | '}
                          العميل: {customers.find(customer => customer.id === entry.before?.customerId)?.name || 'غير معروف'}
                          {' ← '}
                          {customers.find(customer => customer.id === entry.after?.customerId)?.name || 'غير معروف'}
                        </div>
                        <div>
                          البنك: {banks.find(bank => bank.id === entry.before.bankId)?.name || 'غير معروف'}
                          {' ← '}
                          {banks.find(bank => bank.id === entry.after.bankId)?.name || 'غير معروف'}
                          {' | التاريخ: '}
                          {new Date(entry.before.date).toLocaleDateString('ar-EG')}
                          {' ← '}
                          {new Date(entry.after.date).toLocaleDateString('ar-EG')}
                        </div>
                        <div>المرجع: {entry.before.reference || '—'} ← {entry.after.reference || '—'}</div>
                        <div>الملاحظات: {entry.before.notes || '—'} ← {entry.after.notes || '—'}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button type="submit" disabled={submitting} className="flex-1 bg-entlaq-primary text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all cursor-pointer shadow-lg shadow-teal-500/10 disabled:opacity-50">

                  {editingPayment ? 'حفظ التصويب' : 'حفظ وإصدار السند'}

                </button>

                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer">إلغاء</button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* MODAL 7: PAYMENT RECEIPT PRINT MODAL */}

      {showReceiptModal && selectedReceipt && (
        <ReceiptPrint receipt={selectedReceipt} onClose={() => setShowReceiptModal(false)} />
      )}





      {/* MODAL 8: CUSTOMER HISTORY MODAL */}

      {showCustomerHistoryModal && selectedHistoryCustomer && !showModal && !showReceiptModal && !selectedDiscountPrint && (
        <AccountStatement
          kind="customer"
          name={selectedHistoryCustomer.name}
          openingBalance={currentHistoryCustomer.openingBalance || 0}
          invoices={selectedHistoryCustomer.orders}
          payments={selectedHistoryCustomer.payments}
          returns={selectedHistoryCustomer.orderReturns}
          discounts={selectedHistoryCustomer.discounts}
          from={stmtFrom}
          to={stmtTo}
          periodControls={renderStatementPeriod()}
          onClose={() => setShowCustomerHistoryModal(false)}
          onInvoice={(ord) => {
            setInvoice(ord);
            if (ord.qrCode) {
              QRCode.toDataURL(ord.qrCode, { width: 160, margin: 1 })
                .then(url => setQrCodeUrl(url)).catch(console.error);
            } else setQrCodeUrl('');
            setShowModal(true);
          }}
          onPayment={(payment) => {
            setSelectedReceipt({ ...payment, customer: selectedHistoryCustomer });
            setShowReceiptModal(true);
          }}
          onReturn={(orderReturn) => {
            setSelectedOrderReturn({ ...orderReturn, customer: selectedHistoryCustomer });
            setShowReturnPrintModal(true);
          }}
          onDiscount={discount => openDiscountPrint(discount, 'ALLOWED', selectedHistoryCustomer.name)}
        />
      )}



      {/* MODAL 8.5: SUPPLIER HISTORY MODAL */}

      {showSupplierHistoryModal && selectedHistorySupplier && !showPurchaseDetailModal && !showExpenseReceiptModal && !selectedDiscountPrint && (
        <AccountStatement
          kind="supplier"
          name={selectedHistorySupplier.name}
          openingBalance={currentHistorySupplier.openingBalance || 0}
          invoices={selectedHistorySupplier.purchaseOrders}
          payments={selectedHistorySupplier.expenses}
          discounts={selectedHistorySupplier.discounts}
          from={stmtFrom}
          to={stmtTo}
          periodControls={renderStatementPeriod()}
          showInvoiceAmounts={currentUser?.role === 'ADMIN'}
          onClose={() => setShowSupplierHistoryModal(false)}
          onInvoice={(ord) => {
            setSelectedPurchase({ ...ord, supplier: selectedHistorySupplier });
            setShowPurchaseDetailModal(true);
          }}
          onPayment={(payment) => {
            setSelectedExpense({ ...payment, supplier: selectedHistorySupplier });
            setShowExpenseReceiptModal(true);
          }}
          onDiscount={discount => openDiscountPrint(discount, 'EARNED', selectedHistorySupplier.name)}
        />
      )}

      {selectedDiscountPrint && (
        <DiscountPrint discount={selectedDiscountPrint} onClose={() => setSelectedDiscountPrint(null)} />
      )}


      {/* MODAL 9: SUPPLIER FORM MODAL */}

      {showSupplierModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-sm overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white">

                  {isEditingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}

                </h3>

                <p className="text-xs text-slate-400 mt-1">أدخل بيانات المورد لتسجيل فواتير الشراء وسندات الصرف</p>

              </div>

              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer">

                <XIcon size={18} />

              </button>

            </div>



            <form onSubmit={handleSaveSupplier} className="p-2 space-y-3 overflow-y-auto custom-scrollbar text-right" dir="rtl">

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">اسم المورد / الشركة *</label>

                <input

                  type="text"

                  required

                  value={supplierForm.name}

                  onChange={(e) => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}

                  placeholder="مثال: شركة النيل للبتروكيماويات"

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                />

              </div>



              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-300 block mb-1">رقم التلفون</label>

                  <input

                    type="text"

                    value={supplierForm.phone}

                    onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}

                    placeholder="مثال: 01021683030"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-300 block mb-1">العنوان</label>

                  <input

                    type="text"

                    value={supplierForm.address}

                    onChange={(e) => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}

                    placeholder="مثال: القاهرة - العبور"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

              </div>



              <div className="grid grid-cols-2 gap-2">

                <div className="space-y-1">

                  <label className="text-xs text-slate-300 block mb-1">السجل التجاري</label>

                  <input

                    type="text"

                    value={supplierForm.cr}

                    onChange={(e) => setSupplierForm(prev => ({ ...prev, cr: e.target.value }))}

                    placeholder="رقم السجل التجاري"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

                <div className="space-y-1">

                  <label className="text-xs text-slate-300 block mb-1">الرقم الضريبي</label>

                  <input

                    type="text"

                    value={supplierForm.trn}

                    onChange={(e) => setSupplierForm(prev => ({ ...prev, trn: e.target.value }))}

                    placeholder="الرقم الضريبي للمورد"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"

                  />

                </div>

              </div>



              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">الرصيد الافتتاحي (مديونية)</label>

                {currentUser?.role === 'ADMIN' ? (

                  <MoneyInput
                    step="0.01"

                    value={supplierForm.openingBalance}

                    onValueChange={(value) => setSupplierForm(prev => ({ ...prev, openingBalance: value }))}

                    placeholder="0.00"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-mono"

                  />

                ) : (

                  <input

                    type="text"

                    disabled

                    value="***"

                    className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 opacity-50 cursor-not-allowed font-mono text-center tracking-widest text-lg"

                  />

                )}

              </div>



              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button

                  type="submit"

                  disabled={submitting}

                  className="flex-1 bg-entlaq-primary text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-teal-500 transition-all cursor-pointer shadow-lg shadow-teal-500/10 disabled:opacity-50"

                >

                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : null}

                  حفظ البيانات

                </button>

                <button

                  type="button"

                  onClick={() => setShowSupplierModal(false)}

                  className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

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

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-sm overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white flex gap-2 items-center">

                  <ShoppingBagIcon className="text-orange-400" size={18} />

                  {editingPurchase ? 'تعديل فاتورة مشتريات' : 'إنشاء فاتورة مشتريات جديدة'}

                </h3>

                <p className="text-xs text-slate-400 mt-1">{editingPurchase
                  ? 'سيتم تسوية المخزون ومديونية المورد دون تغيير أسعار بطاقة الصنف الحالية'
                  : 'سيتم تحديث المخزون تلقائياً عند حفظ الفاتورة'}</p>

              </div>

              <button disabled={submitting} onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer">

                <XIcon size={18} />

              </button>

            </div>



            <form onSubmit={handleSavePurchase} className="flex flex-col flex-1 overflow-hidden">

              <div className="p-2 space-y-3 overflow-y-auto custom-scrollbar text-right flex-1" dir="rtl">



                <div className="grid grid-cols-4 gap-2">

                  <div className="space-y-1">

                    <label className="text-xs text-slate-300 block mb-1">رقم فاتورة التوريد *</label>

                    <input

                      type="text"

                      required

                      disabled={!editingPurchase}
                      onChange={e => setPurchaseForm((prev: typeof purchaseForm) => ({ ...prev, billNumber: e.target.value }))}

                      value={purchaseForm.billNumber}

                      className="w-full bg-white/5 disabled:bg-slate-950/40 disabled:text-slate-400 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none font-mono font-bold"

                    />

                  </div>

                  <div className="space-y-1">
                    <label htmlFor="purchase-warehouse-receipt" className="text-xs text-slate-300 block mb-1">رقم استلام المخزن</label>
                    <input type="text" aria-label="رقم استلام المخزن" maxLength={255}
                      id="purchase-warehouse-receipt"
                      placeholder="رقم استلام المخزن (اختياري)" value={purchaseForm.warehouseReceiptNumber || ''}
                      onChange={e => setPurchaseForm((prev: typeof purchaseForm) => ({ ...prev, warehouseReceiptNumber: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none font-mono font-bold" />
                  </div>

                  <div className="space-y-1">

                    <label className="text-xs text-slate-300 block mb-1">المورد *</label>

                    <select

                      required

                      value={purchaseForm.supplierId}

                      onChange={(e) => setPurchaseForm((prev: any) => ({ ...prev, supplierId: e.target.value }))}

                      className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-bold"

                    >

                      <option value="">-- اختر المورد --</option>

                      {suppliers.map((s: any) => (

                        <option key={s.id} value={s.id}>{s.name}</option>

                      ))}

                    </select>

                  </div>

                  <div className="space-y-1">

                    <label className="text-xs text-slate-300 block mb-1">نوع الفاتورة *</label>

                    <select

                      value={purchaseForm.invoiceType || 'فاتورة ضريبية'}

                      onChange={(e) => setPurchaseForm((prev: any) => ({ ...prev, invoiceType: e.target.value }))}

                      className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-bold"

                    >

                      <option value="فاتورة ضريبية">فاتورة ضريبية</option>

                      <option value="فاتورة">فاتورة</option>

                    </select>

                  </div>

                  {editingPurchase && (
                    <label className="block text-xs text-slate-300">تاريخ الفاتورة
                      <input type="date" required aria-label="تاريخ فاتورة الشراء" value={editingPurchase.date}
                        onChange={e => setEditingPurchase({ ...editingPurchase, date: e.target.value })}
                        className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 mt-1" />
                    </label>
                  )}
                </div>



                {/* Items section */}

                <div className="border border-white/10 rounded-sm overflow-hidden">

                  <div className="bg-slate-950 px-2 py-2 flex justify-between items-center">

                    <h4 className="text-sm font-bold text-slate-300">أصناف الفاتورة</h4>

                    <button

                      type="button"

                      onClick={() => setPurchaseForm((prev: any) => ({

                        ...prev,

                        items: [...prev.items, { productId: '', productDisplay: '', quantity: '1', unitCost: '' }]

                      }))}

                      className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-sm hover:bg-orange-500/30 transition-all cursor-pointer flex items-center gap-1 font-bold"

                    >

                      <PlusIcon size={12} /> إضافة صنف

                    </button>

                  </div>

                  <div className="p-3 space-y-2">

                    {purchaseForm.items.length === 0 && (

                      <p className="text-center text-slate-500 text-xs py-2">اضغط على "إضافة صنف" لبدء إدخال أصناف الفاتورة</p>

                    )}

                    {purchaseForm.items.map((item: any, idx: number) => (

                      <div key={idx} className={`grid ${currentUser?.role === 'ADMIN' ? 'grid-cols-[1fr_100px_120px_40px]' : 'grid-cols-[1fr_100px_40px]'} gap-2 items-center`}>

                        <input

                          list={`products-list-${idx}`}

                          value={item.productDisplay || ''}

                          onChange={(e) => {

                            const val = e.target.value;

                            const newItems = [...purchaseForm.items];

                            const prod = products.find((p: any) => [p.code, '-', p.name, p.type, p.size, p.gauge, p.color ? `(${p.color})` : '', p.length, p.weight].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() === val.trim());

                            if (prod) {

                              if (currentUser?.role !== 'ADMIN' && (!prod.costPrice || prod.costPrice <= 0)) {

                                alert(`⚠️ لا يمكنك إضافة الصنف "${prod.name}" لأن الإدارة لم تحدد له سعر تكلفة بعد.\n\nالرجاء مراجعة المدير لتحديث بيانات الصنف.`);

                                newItems[idx] = { ...newItems[idx], productId: '', productDisplay: '', unitCost: '' };

                              } else {

                                newItems[idx] = { ...newItems[idx], productId: prod.id, productDisplay: val, unitCost: prod?.costPrice?.toString() || '' };

                              }

                            } else {

                              newItems[idx] = { ...newItems[idx], productId: '', productDisplay: val, unitCost: '' };

                            }

                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));

                          }}

                          placeholder="ابحث بالكود أو الاسم..."

                          className="bg-slate-950 border border-white/10 rounded-sm py-1.5 px-2 text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"

                        />

                        <datalist id={`products-list-${idx}`}>

                          {products.map((p: any) => (

                            <option key={p.id} value={[p.code, '-', p.name, p.type, p.size, p.gauge, p.color ? `(${p.color})` : '', p.length, p.weight].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()} />

                          ))}

                        </datalist>

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

                          className="bg-white/5 border border-white/10 rounded-sm py-1.5 px-2 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-center"

                        />

                        {currentUser?.role === 'ADMIN' && (

                          <MoneyInput
                            step="0.01"

                            value={item.unitCost}

                            onValueChange={(value) => {

                              const newItems = [...purchaseForm.items];

                              newItems[idx] = { ...newItems[idx], unitCost: value };

                              setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));

                            }}

                            placeholder="سعر التكلفة"

                            className="bg-white/5 border border-white/10 rounded-sm py-1.5 px-2 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500/50"

                          />

                        )}

                        <button

                          type="button"

                          onClick={() => {

                            const newItems = purchaseForm.items.filter((_: any, i: number) => i !== idx);

                            setPurchaseForm((prev: any) => ({ ...prev, items: newItems }));

                          }}

                          className="bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm p-1.5 hover:bg-red-500/20 transition-all cursor-pointer"

                        >

                          <Trash2Icon size={12} />

                        </button>

                      </div>

                    ))}

                  </div>

                </div>



                {/* Summary */}

                {purchaseForm.items.length > 0 && (

                  <div className="bg-slate-950 border border-white/10 rounded-sm p-3 text-sm font-mono">

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

                    {currentUser?.role === 'ADMIN' && (() => {

                      const isVat = purchaseForm.invoiceType !== 'فاتورة';

                      const subtotal = purchaseForm.items.reduce((sum: number, i: any) => sum + ((Number(i.quantity) || 0) * (Number(i.unitCost) || 0)), 0);

                      const taxTotal = isVat ? purchaseForm.items.reduce((sum: number, i: any) => {

                        const p = products.find((pr: any) => pr.id === i.productId);

                        const original = editingPurchase ? purchases.find(purchase => purchase.id === editingPurchase.id) : null;
                        const originalItem = original?.items?.find((item: { id: string; productId: string }) =>
                          item.id === i.id && item.productId === i.productId);
                        const rate = editingPurchase
                          ? purchaseTaxRate(purchaseForm.invoiceType, p?.taxRate, originalItem, original?.invoiceType)
                          : p?.taxRate || 0.14;

                        return sum + ((Number(i.quantity) || 0) * (Number(i.unitCost) || 0) * rate);

                      }, 0) : 0;

                      return (

                        <>

                          <div className="flex justify-between text-orange-400 mt-1 border-t border-white/5 pt-1">

                            <span>إجمالي التكلفة (بدون ضريبة):</span>

                            <span className="font-bold">{formatTotal(subtotal)} ج.م</span>

                          </div>

                          <div className="flex justify-between text-slate-400 mt-1">

                            <span>{isVat ? 'قيمة الضريبة المضافة:' : 'غير شامل للقيمة المضافة:'}</span>

                            <span className="font-bold">{formatTotal(taxTotal)} ج.م</span>

                          </div>

                          <div className="flex justify-between text-purple-400 mt-1 font-bold text-base border-t border-white/10 pt-1">

                            <span>الإجمالي الصافي:</span>

                            <span>{formatTotal((subtotal + taxTotal))} ج.م</span>

                          </div>

                        </>

                      );

                    })()}

                  </div>

                )}

              </div>



              <div className="p-2 border-t border-slate-800 flex gap-1.5">

                <button

                  type="submit"

                  disabled={submitting}

                  className="flex-1 bg-orange-500 text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-orange-600 transition-all cursor-pointer shadow-lg shadow-orange-500/10 disabled:opacity-50"

                >

                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : <CheckCircle2Icon size={16} />}

                  {editingPurchase ? 'حفظ تعديل الفاتورة وتسوية المخزون' : 'حفظ الفاتورة وتحديث المخزون'}

                </button>

                <button

                  type="button"

                  disabled={submitting}
                  onClick={() => { setShowPurchaseModal(false); setPurchaseForm({ billNumber: '', supplierId: '', items: [] }); }}

                  className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

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

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-sm overflow-hidden shadow-2xl flex flex-col">

            <div className="p-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center">

              <div>

                <h3 className="text-lg font-bold text-white flex gap-2 items-center">

                  <BanknoteIcon className="text-purple-400" size={18} />

                  {editingExpense ? 'تعديل سند صرف مورد' : 'إصدار سند صرف مورد'}

                </h3>

                <p className="text-xs text-slate-400 mt-1">{editingExpense
                  ? 'سيتم تسوية أثر السند السابق والجديد على الخزينة ورصيد المورد'
                  : 'سيتم خصم المبلغ من الخزينة وتخفيض رصيد المورد'}</p>

              </div>

              <button disabled={submitting} onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-white p-2 rounded-sm bg-white/5 hover:bg-white/10 transition-all cursor-pointer">

                <XIcon size={18} />

              </button>

            </div>

            <form onSubmit={handleSaveExpense} className="p-2 space-y-3" dir="rtl">
              {editingExpense && (
                <label className="block text-xs text-slate-300">تاريخ السند
                  <input type="date" required aria-label="تاريخ سند الصرف" value={editingExpense.date}
                    onChange={e => setEditingExpense({ ...editingExpense, date: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-sm py-2 px-3 mt-1" />
                </label>
              )}

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">المورد *</label>

                <select

                  required

                  value={expenseForm.supplierId}

                  onChange={(e) => setExpenseForm(prev => ({ ...prev, supplierId: e.target.value }))}

                  className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-bold"

                >

                  <option value="">-- اختر المورد --</option>

                  {suppliers.map((s: any) => (

                    <option key={s.id} value={s.id}>{s.name} (مديونية: {formatTotal(Number(s.balance))} ج.م)</option>

                  ))}

                </select>

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">البنك / الخزينة *</label>

                <select

                  required

                  value={expenseForm.bankId}

                  onChange={(e) => setExpenseForm(prev => ({ ...prev, bankId: e.target.value }))}

                  className="w-full bg-slate-900 border border-white/10 rounded-sm py-2 px-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-bold"

                >

                  <option value="">-- اختر البنك أو الخزينة --</option>

                  {banks.map((b: any) => (

                    <option key={b.id} value={b.id}>{b.name} (رصيد: {formatTotal(b.balance)} ج.م)</option>

                  ))}

                </select>

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">المبلغ المدفوع *</label>

                <MoneyInput
                  step="0.01"

                  required

                  value={expenseForm.amount}

                  onValueChange={(value) => setExpenseForm(prev => ({ ...prev, amount: value }))}

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono text-xl text-purple-400"

                  placeholder="0.00"

                />

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">رقم الشيك / المرجع</label>

                <input

                  type="text"

                  value={expenseForm.reference}

                  onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"

                  placeholder="مثال: شيك رقم 12345"

                />

              </div>

              <div className="space-y-1">

                <label className="text-xs text-slate-300 block mb-1">البيان / الملاحظات</label>

                <input

                  type="text"

                  value={expenseForm.notes}

                  onChange={(e) => setExpenseForm(prev => ({ ...prev, notes: e.target.value }))}

                  className="w-full bg-white/5 border border-white/10 rounded-sm py-2 px-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"

                  placeholder="مثال: دفعة تحت الحساب للمورد"

                />

              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-1.5">

                <button

                  type="submit"

                  disabled={submitting}

                  className="flex-1 bg-purple-600 text-white py-2 rounded-sm font-bold flex gap-2 items-center justify-center hover:bg-purple-700 transition-all cursor-pointer shadow-lg shadow-purple-500/10 disabled:opacity-50"

                >

                  {submitting ? <Loader2Icon size={16} className="animate-spin" /> : <BanknoteIcon size={16} />}

                  {editingExpense ? 'حفظ تعديل سند الصرف' : 'إصدار سند الصرف'}

                </button>

                <button

                  type="button"

                  disabled={submitting}
                  onClick={() => setShowExpenseModal(false)}

                  className="bg-white/5 text-slate-300 px-3 py-2 rounded-sm font-bold hover:bg-white/10 transition-all border border-white/5 cursor-pointer"

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
        <ReceiptPrint receipt={selectedExpense} expense onClose={() => setShowExpenseReceiptModal(false)}
          actions={currentUser?.role === 'ADMIN' ? (
            <button type="button" onClick={() => handleEditExpense(selectedExpense)}>
              <PencilIcon size={16} /> تعديل سند الصرف
            </button>
          ) : undefined} />
      )}

      {/* MODAL 13: PURCHASE DETAIL & PRINT MODAL */}

      {showPurchaseDetailModal && selectedPurchase && (
        <InvoicePrint invoice={selectedPurchase} purchase showAmounts={currentUser?.role === 'ADMIN'}
          onClose={() => setShowPurchaseDetailModal(false)}
          actions={currentUser?.role === 'ADMIN' ? (
            <button type="button" onClick={() => handleEditPurchase(selectedPurchase)}>
              <PencilIcon size={16} /> تعديل فاتورة الشراء
            </button>
          ) : undefined} />
      )}



      {/* MODAL 14: GENERAL TABLE PRINT MODAL */}

      {printTableData && (
        <TablePrint report={printTableData} onClose={() => setPrintTableData(null)} />
      )}



      {/* PASSWORD PROMPT MODAL */}

      {passwordPrompt.isOpen && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded overflow-hidden shadow-2xl flex flex-col">

            <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-white">

              <h3 className="text-lg font-bold">صلاحية تعديل السعر</h3>

              <button onClick={() => setPasswordPrompt({ isOpen: false, itemId: '' })} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><XIcon size={18} /></button>

            </div>

            <div className="p-4 flex flex-col gap-3">

              <p className="text-sm text-slate-300">الرجاء إدخال كلمة المرور لتعديل السعر يدوياً:</p>

              <input

                type="password"

                autoFocus

                className="w-full bg-black/50 border border-slate-700 rounded p-2 text-white text-center font-mono tracking-widest focus:outline-none focus:border-emerald-500"

                value={passwordInput}

                onChange={(e) => setPasswordInput(e.target.value)}

                onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}

              />

              <button onClick={handlePasswordSubmit} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded mt-2 transition-colors cursor-pointer">تأكيد</button>

            </div>

          </div>

        </div>

      )}



      {/* CUSTOMER PRICES MODAL */}

      {showCustomerPricesModal && selectedCustomerForPrices && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in no-print">

          <div className="bg-slate-900 border border-slate-700 w-full max-w-7xl rounded overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

            <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-white">

              <div>

                <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">

                  <PercentIcon size={18} /> قائمة الأسعار المخصصة

                </h3>

                <p className="text-xs text-slate-400 mt-1">

                  العميل: <span className="text-white font-bold">{selectedCustomerForPrices.name}</span>

                </p>
                <p className="text-xs text-slate-400 mt-1">اترك السعر فارغًا لإلغاء التخصيص وتطبيق التسعير الافتراضي.</p>

              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintCustomPrices}
                  disabled={!products.some(product => customerPricesMap[product.id] !== undefined)}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-bold flex items-center gap-2 cursor-pointer"
                >
                  <PrinterIcon size={16} /> طباعة الأصناف المخصصة
                </button>
                <button onClick={() => setShowCustomerPricesModal(false)} disabled={savingCustomerPrices} aria-label="إغلاق قائمة الأسعار المخصصة" className="text-slate-400 hover:text-white bg-white/5 p-2 rounded transition-colors cursor-pointer"><XIcon size={18} /></button>
              </div>

            </div>

            <div className="p-2 overflow-y-auto custom-scrollbar flex-1">

              <table className="w-full min-w-[650px] table-fixed text-right text-sm">

                <colgroup>

                  <col className="w-[72%]" />

                  <col className="w-[12%]" />

                  <col className="w-[16%]" />

                </colgroup>

                <thead className="bg-slate-800 text-slate-300 sticky top-0">

                  <tr>

                    <th className="p-2 font-bold">اسم الصنف</th>

                    <th className="p-2 font-bold">السعر الأساسي</th>

                    <th className="p-2 font-bold text-emerald-400">السعر المخصص للعميل</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-800">

                  {customerPriceProducts.map((p: any) => {

                    const hasCustom = customerPricesMap[p.id] !== undefined;

                    return (

                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">

                        <td className="p-2 text-slate-200">

                          <div className="mt-2 max-w-full overflow-x-auto custom-scrollbar">
                            <dl className="flex w-max items-center gap-x-3 whitespace-nowrap text-xs">
                              <div className="flex shrink-0 items-center gap-1">
                                <dt className="text-slate-500">اسم الصنف:</dt>
                                <dd className="flex items-center gap-1 font-bold text-slate-100">
                                  {p.imageUrl && (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={p.imageUrl} alt={p.name} className="h-8 w-8 rounded object-contain bg-white/5" />
                                  )}
                                  {p.name}
                                </dd>
                              </div>
                              {[
                                ['الكود', p.code], ['النوع', p.type], ['المقاس', p.size],
                                ['الدرجة', p.gauge], ['اللون', p.color],
                                ['المورد', p.supplier?.name || suppliers.find(supplier => supplier.id === p.supplierId)?.name],
                                ['الطول', p.length], ['الوزن', p.weight],
                                ['سعر الكيلو', p.pricePerKilo === null || p.pricePerKilo === undefined ? '—' : formatTotal(p.pricePerKilo)]
                              ].map(([label, value]) => (
                                <div key={label} className="flex shrink-0 gap-1">
                                  <dt className="text-slate-500">{label}:</dt>
                                  <dd className="text-slate-300">{value === null || value === undefined || value === '' ? '—' : value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>

                        </td>

                        <td className="p-2 font-mono text-slate-400">{formatTotal(p.price)} ج.م</td>

                        <td className="p-2">

                          <div className="flex gap-2 items-center">

                            <MoneyInput
                              min="0"
                              step="any"
                              aria-label={`السعر المخصص: ${p.name} - ${p.code} - ${p.color || ''} - ${p.supplier?.name || ''}`}
                              disabled={savingCustomerPrices}

                              className={`w-24 bg-black border rounded px-2 py-1 font-mono text-center focus:outline-none focus:border-emerald-500 ${hasCustom ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-700 text-white'}`}

                              placeholder={formatTotal(p.price)}

                              value={customerPricesMap[p.id] === undefined ? '' : customerPricesMap[p.id]}

                              onValueChange={(value) => {

                                const val = parseFloat(value);

                                setCustomerPricesMap(prev => {

                                  const next = { ...prev };

                                  if (isNaN(val)) delete next[p.id];

                                  else next[p.id] = val;

                                  return next;

                                });

                              }}

                            />

                            {hasCustom && <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">مخصص</span>}

                          </div>

                        </td>

                      </tr>

                    )

                  })}

                </tbody>

              </table>

            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end gap-2">

              <button

                onClick={handleSaveCustomerPrices}
                disabled={savingCustomerPrices}

                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold transition-colors cursor-pointer flex gap-2 items-center"

              >

                <CheckCircle2Icon size={18} /> {savingCustomerPrices ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}

              </button>

            </div>

          </div>

        </div>

      )}

      {showCustomerCeilingsModal && selectedCustomerForCeilings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <LayoutGridIcon className="text-purple-500" />
                حصر الأسقف للعميل: {selectedCustomerForCeilings.name}
              </h3>
              <button onClick={() => setShowCustomerCeilingsModal(false)} className="text-slate-400 hover:text-white bg-white/5 p-2 rounded transition-colors cursor-pointer">
                <XIcon size={18} />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto">
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const payload = {
                    productId: ceilingForm.productId,
                    buildingsCount: ceilingForm.buildingsCount,
                    floorsCount: ceilingForm.floorsCount,
                    quantityPerFloor: ceilingForm.quantityPerFloor
                  };
                  if (typeof window !== 'undefined' && (window as any).electronAPI) {
                    await (window as any).electronAPI.createCustomerCeiling({
                      customerId: selectedCustomerForCeilings.id,
                      ...payload
                    });
                  } else {
                    const res = await fetch(`/api/customers/${selectedCustomerForCeilings.id}/ceilings`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('Failed to save ceiling');
                  }
                  fetchCustomerCeilings(selectedCustomerForCeilings.id);
                  setCeilingForm({ productId: '', buildingsCount: '', floorsCount: '6', quantityPerFloor: '' });
                } catch (error) {
                  console.error(error);
                  alert('حدث خطأ أثناء حفظ الحصر');
                }
              }} className="bg-white/5 p-4 rounded-lg mb-6 border border-white/10">
                <h4 className="text-white font-bold mb-4">إضافة / تعديل حصر جديد</h4>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">الصنف</label>
                    <select
                      required
                      value={ceilingForm.productId}
                      onChange={(e) => setCeilingForm({ ...ceilingForm, productId: e.target.value })}
                      className="w-full bg-black/50 border border-white/10 rounded p-2 text-white"
                    >
                      <option value="">اختر الصنف...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {[p.code, '-', p.name, p.type, p.size, p.gauge, p.color ? `(${p.color})` : '', p.length, p.weight].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">عدد العماير</label>
                    <input
                      required type="number" min="1" step="1"
                      value={ceilingForm.buildingsCount}
                      onChange={(e) => setCeilingForm({ ...ceilingForm, buildingsCount: e.target.value })}
                      className="w-full bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">عدد الطوابق (الافتراضي 6)</label>
                    <input
                      required type="number" min="1" step="1"
                      value={ceilingForm.floorsCount}
                      onChange={(e) => setCeilingForm({ ...ceilingForm, floorsCount: e.target.value })}
                      className="w-full bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">العدد (للطابق)</label>
                    <input
                      required type="number" min="1" step="1"
                      value={ceilingForm.quantityPerFloor}
                      onChange={(e) => setCeilingForm({ ...ceilingForm, quantityPerFloor: e.target.value })}
                      className="w-full bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-center"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded font-bold transition-colors shadow-lg">
                    حفظ الحصر
                  </button>
                </div>
              </form>

              <h4 className="text-white font-bold mb-3">حصر الأسقف الحالي</h4>
              <div className="bg-black/40 border border-white/10 rounded overflow-hidden">
                <table className="w-full text-right text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="p-3 text-slate-300">الصنف</th>
                      <th className="p-3 text-slate-300 text-center">عدد العماير</th>
                      <th className="p-3 text-slate-300 text-center">الطوابق</th>
                      <th className="p-3 text-slate-300 text-center">العدد</th>
                      <th className="p-3 text-emerald-400 text-center">الإجمالي</th>
                      <th className="p-3 text-red-400 text-center">ما تم صرفه</th>
                      <th className="p-3 text-amber-400 text-center font-bold">المتبقي</th>
                      <th className="p-3 text-slate-300 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {customerCeilings.length === 0 ? (
                      <tr><td colSpan={8} className="p-4 text-center text-slate-500">لا يوجد حصر لهذا العميل</td></tr>
                    ) : (
                      customerCeilings.map((c) => {
                        const remaining = c.totalQuantity - c.deliveredQuantity;
                        return (
                          <tr key={c.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 font-bold text-white">{c.product?.name || 'صنف محذوف'}</td>
                            <td className="p-3 text-center font-mono">{c.buildingsCount}</td>
                            <td className="p-3 text-center font-mono">{c.floorsCount}</td>
                            <td className="p-3 text-center font-mono">{c.quantityPerFloor}</td>
                            <td className="p-3 text-center font-mono text-emerald-400">{c.totalQuantity}</td>
                            <td className="p-3 text-center font-mono text-red-400">{c.deliveredQuantity}</td>
                            <td className="p-3 text-center font-mono font-bold text-amber-400">{remaining}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={async () => {
                                  if (!confirm('هل أنت متأكد من حذف هذا الحصر؟')) return;
                                  try {
                                    if (typeof window !== 'undefined' && (window as any).electronAPI) {
                                      await (window as any).electronAPI.deleteCustomerCeiling(c.id);
                                    } else {
                                      const res = await fetch(`/api/customers/${selectedCustomerForCeilings.id}/ceilings/${c.id}`, { method: 'DELETE' });
                                      if (!res.ok) throw new Error('Failed to delete');
                                    }
                                    fetchCustomerCeilings(selectedCustomerForCeilings.id);
                                  } catch (error) {
                                    console.error(error);
                                    alert('حدث خطأ');
                                  }
                                }}
                                className="text-red-400 hover:text-red-300 p-1 bg-red-400/10 rounded transition-colors"
                              >
                                <Trash2Icon size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>

  );

}
