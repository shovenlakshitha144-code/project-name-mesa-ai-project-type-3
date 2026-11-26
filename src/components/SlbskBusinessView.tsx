import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Check,
  DollarSign,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Megaphone,
  Package,
  Plus,
  Printer,
  Receipt,
  Tags,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  BusinessProject,
  Customer,
  CustomerDocument,
  Invoice,
  InvoiceLineItem,
  MarketingCampaign,
  PricingTier,
  ServiceItem,
  Transaction,
  UserProfile,
} from '../../shared/types';

type BusinessModule =
  | 'overview'
  | 'customers'
  | 'projects'
  | 'finance'
  | 'services'
  | 'pricing'
  | 'invoices'
  | 'documents'
  | 'marketing'
  | 'reports';

interface SlbskBusinessViewProps {
  user: UserProfile;
  refreshSignal: number;
  onDataMutated: () => void;
}

export const SlbskBusinessView: React.FC<SlbskBusinessViewProps> = ({
  user,
  refreshSignal,
  onDataMutated,
}) => {
  const [mod, setMod] = useState<BusinessModule>('overview');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<BusinessProject[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);

  // Form states
  const [custForm, setCustForm] = useState({ name: '', company: '', email: '', phone: '', address: '', status: 'active' });
  const [projForm, setProjForm] = useState({ title: '', customerId: '', status: 'planning', priority: 'medium', budget: '', deadline: '' });
  const [txForm, setTxForm] = useState({ type: 'income', category: 'Client Payment', amount: '', description: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'Bank Transfer' });
  const [svcForm, setSvcForm] = useState({ name: '', category: 'Web & AI Development', description: '', basePrice: '', deliveryDays: '7' });
  const [tierForm, setTierForm] = useState({ name: '', billingCycle: 'one_time', price: '', features: '', popular: false });

  // Invoice creator state
  const [invDocType, setInvDocType] = useState<'invoice' | 'quotation'>('invoice');
  const [invCustomerId, setInvCustomerId] = useState('');
  const [invCustomerName, setInvCustomerName] = useState('');
  const [invCustomerEmail, setInvCustomerEmail] = useState('');
  const [invCustomerAddress, setInvCustomerAddress] = useState('');
  const [invDueDate, setInvDueDate] = useState(new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10));
  const [invTaxRate, setInvTaxRate] = useState('0');
  const [invDiscount, setInvDiscount] = useState('0');
  const [invNotes, setInvNotes] = useState('Thank you for choosing SLBSK DIGITAL CREATION.');
  const [invItems, setInvItems] = useState<InvoiceLineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Document upload state
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState<CustomerDocument['docType']>('contract');
  const [docCustomerId, setDocCustomerId] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docFile, setDocFile] = useState<{ name: string; type: string; base64: string } | null>(null);

  // Campaign state
  const [campForm, setCampForm] = useState({ name: '', channel: 'facebook', budget: '', targetAudience: '', notes: '' });

  const loadAll = useCallback(async () => {
    const [c, p, t, s, pr, inv, d, cmp] = await Promise.all([
      apiRequest<Customer[]>('/api/customers'),
      apiRequest<BusinessProject[]>('/api/projects'),
      apiRequest<Transaction[]>('/api/transactions'),
      apiRequest<ServiceItem[]>('/api/services'),
      apiRequest<PricingTier[]>('/api/pricing'),
      apiRequest<Invoice[]>('/api/invoices'),
      apiRequest<CustomerDocument[]>('/api/documents'),
      apiRequest<MarketingCampaign[]>('/api/campaigns'),
    ]);
    setCustomers(c);
    setProjects(p);
    setTransactions(t);
    setServices(s);
    setPricing(pr);
    setInvoices(inv);
    setDocuments(d);
    setCampaigns(cmp);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshSignal]);

  const currency = user.currency || 'LKR';
  const fmt = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const activeProjects = projects.filter((p) => ['planning', 'in_progress', 'review'].includes(p.status));
  const completedProjects = projects.filter((p) => p.status === 'completed');
  const pendingProjects = projects.filter((p) => ['pending', 'on_hold'].includes(p.status));

  const calcInvoiceTotal = (inv: { items: InvoiceLineItem[]; discount: number; taxRate: number }) => {
    const sub = inv.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
    const afterDisc = Math.max(0, sub - Number(inv.discount || 0));
    return afterDisc * (1 + Number(inv.taxRate || 0) / 100);
  };

  // Handlers
  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/customers', { method: 'POST', body: JSON.stringify(custForm) });
    setCustForm({ name: '', company: '', email: '', phone: '', address: '', status: 'active' });
    await loadAll();
    onDataMutated();
  };

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        ...projForm,
        customerId: projForm.customerId || null,
        budget: Number(projForm.budget || 0),
        deadline: projForm.deadline || null,
      }),
    });
    setProjForm({ title: '', customerId: '', status: 'planning', priority: 'medium', budget: '', deadline: '' });
    await loadAll();
    onDataMutated();
  };

  const updateProjectStatus = async (id: string, status: BusinessProject['status']) => {
    await apiRequest(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadAll();
    onDataMutated();
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ ...txForm, amount: Number(txForm.amount) }),
    });
    setTxForm({ ...txForm, amount: '', description: '' });
    await loadAll();
    onDataMutated();
  };

  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        ...svcForm,
        basePrice: Number(svcForm.basePrice || 0),
        deliveryDays: Number(svcForm.deliveryDays || 7),
      }),
    });
    setSvcForm({ name: '', category: 'Web & AI Development', description: '', basePrice: '', deliveryDays: '7' });
    await loadAll();
  };

  const addPricingTier = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/pricing', {
      method: 'POST',
      body: JSON.stringify({
        name: tierForm.name,
        billingCycle: tierForm.billingCycle,
        price: Number(tierForm.price || 0),
        features: tierForm.features.split('\n').map((s) => s.trim()).filter(Boolean),
        popular: tierForm.popular,
      }),
    });
    setTierForm({ name: '', billingCycle: 'one_time', price: '', features: '', popular: false });
    await loadAll();
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = invItems.filter((it) => it.description.trim() && it.quantity > 0);
    if (!invCustomerName.trim() || validItems.length === 0) return;
    await apiRequest('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        docType: invDocType,
        customerId: invCustomerId || null,
        customerName: invCustomerName.trim(),
        customerEmail: invCustomerEmail.trim(),
        customerAddress: invCustomerAddress.trim(),
        dueDate: invDueDate,
        currency,
        items: validItems,
        taxRate: Number(invTaxRate || 0),
        discount: Number(invDiscount || 0),
        notes: invNotes,
      }),
    });
    setInvItems([{ description: '', quantity: 1, unitPrice: 0 }]);
    await loadAll();
    onDataMutated();
  };

  const markInvoicePaid = async (inv: Invoice) => {
    await apiRequest(`/api/invoices/${inv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', recordIncome: inv.docType === 'invoice' }),
    });
    await loadAll();
    onDataMutated();
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      setDocFile({ name: file.name, type: file.type || 'application/octet-stream', base64 });
    };
    reader.readAsDataURL(file);
  };

  const uploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) return;
    await apiRequest('/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        title: docTitle.trim(),
        docType,
        customerId: docCustomerId || null,
        notes: docNotes,
        fileName: docFile?.name || `${docTitle.trim().replace(/\s+/g, '_')}.txt`,
        mimeType: docFile?.type || 'text/plain',
        contentBase64: docFile?.base64 || '',
      }),
    });
    setDocTitle('');
    setDocNotes('');
    setDocFile(null);
    await loadAll();
  };

  const addCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ ...campForm, budget: Number(campForm.budget || 0) }),
    });
    setCampForm({ name: '', channel: 'facebook', budget: '', targetAudience: '', notes: '' });
    await loadAll();
  };

  const exportTransactionsCSV = () => {
    const rows = [
      ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Method', 'Description'],
      ...transactions.map((t) => [t.date, t.type, t.category, String(t.amount), t.currency, t.paymentMethod, t.description.replace(/"/g, '""')]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slbsk-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const modules: Array<{ id: BusinessModule; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '1. Overview', icon: <Briefcase className="w-3.5 h-3.5" /> },
    { id: 'customers', label: '2. Customers', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'projects', label: '3. Projects', icon: <FolderKanban className="w-3.5 h-3.5" /> },
    { id: 'finance', label: '4. Income & Expenses', icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: 'services', label: '5. Services', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'pricing', label: '6. Pricing', icon: <Tags className="w-3.5 h-3.5" /> },
    { id: 'invoices', label: '7. Invoices & Quotes', icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: 'documents', label: '8. Documents', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'marketing', label: '9. Marketing', icon: <Megaphone className="w-3.5 h-3.5" /> },
    { id: 'reports', label: '10. Reports', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header + 10-Module Nav */}
      <div className="mesa-glass rounded-3xl p-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">
              {user.organization}
            </span>
            <h2 className="text-lg font-bold text-white">SLBSK Business Command Suite</h2>
          </div>
          <span className="text-xs text-slate-400">Real-time ledger • Zero placeholder figures</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMod(m.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                mod === m.id
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold'
                  : 'mesa-glass-soft text-slate-300 hover:text-cyan-200'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. BUSINESS OVERVIEW */}
      {mod === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="mesa-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Total Revenue</div>
              <div className="text-xl font-bold text-emerald-300 mt-1">{fmt(totalIncome)}</div>
            </div>
            <div className="mesa-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Total Expenses</div>
              <div className="text-xl font-bold text-rose-300 mt-1">{fmt(totalExpense)}</div>
            </div>
            <div className="mesa-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Net Profit</div>
              <div className={`text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-cyan-300' : 'text-rose-300'}`}>
                {fmt(netProfit)}
              </div>
            </div>
            <div className="mesa-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Clients & Projects</div>
              <div className="text-xl font-bold text-white mt-1">
                {customers.length} Clients • {activeProjects.length} Active
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {completedProjects.length} Completed • {pendingProjects.length} Pending
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="mesa-glass rounded-3xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Active & Pending Projects</h3>
              <div className="space-y-2">
                {projects.filter((p) => p.status !== 'completed').slice(0, 6).map((p) => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{p.title}</div>
                      <div className="text-xs text-slate-400">
                        {p.customerName || 'Internal'} {p.deadline ? `• Deadline ${p.deadline}` : ''}
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-cyan-500/15 text-cyan-300 capitalize">
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
                {projects.filter((p) => p.status !== 'completed').length === 0 && (
                  <p className="text-xs text-slate-500">No active projects recorded yet.</p>
                )}
              </div>
            </div>

            <div className="mesa-glass rounded-3xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Recent Invoices & Quotations</h3>
              <div className="space-y-2">
                {invoices.slice(0, 6).map((inv) => (
                  <div key={inv.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {inv.invoiceNumber} — {inv.customerName}
                      </div>
                      <div className="text-xs text-cyan-300">{fmt(calcInvoiceTotal(inv))}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-200 uppercase">
                      {inv.status}
                    </span>
                  </div>
                ))}
                {invoices.length === 0 && <p className="text-xs text-slate-500">No invoices or quotations yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. CUSTOMER MANAGEMENT */}
      {mod === 'customers' && (
        <div className="space-y-4">
          <form onSubmit={addCustomer} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
            <input value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} placeholder="Customer Name *" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={custForm.company} onChange={(e) => setCustForm({ ...custForm, company: e.target.value })} placeholder="Company" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} placeholder="Email" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} placeholder="Phone / WhatsApp" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <select value={custForm.status} onChange={(e) => setCustForm({ ...custForm, status: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="vip">VIP</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Add Client</button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {customers.map((c) => (
              <div key={c.id} className="mesa-glass rounded-2xl p-4 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-semibold text-white">{c.name}</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase bg-cyan-500/15 text-cyan-300">{c.status}</span>
                  </div>
                  {c.company && <div className="text-xs text-cyan-200">{c.company}</div>}
                  <div className="text-xs text-slate-400 mt-2 space-y-0.5">
                    {c.email && <div>Email: {c.email}</div>}
                    {c.phone && <div>Phone: {c.phone}</div>}
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button type="button" onClick={() => void apiRequest(`/api/customers/${c.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. PROJECT MANAGEMENT */}
      {mod === 'projects' && (
        <div className="space-y-4">
          <form onSubmit={addProject} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
            <input value={projForm.title} onChange={(e) => setProjForm({ ...projForm, title: e.target.value })} placeholder="Project Title *" required className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <select value={projForm.customerId} onChange={(e) => setProjForm({ ...projForm, customerId: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="">Internal / No Client</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" value={projForm.budget} onChange={(e) => setProjForm({ ...projForm, budget: e.target.value })} placeholder={`Budget (${currency})`} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input type="date" value={projForm.deadline} onChange={(e) => setProjForm({ ...projForm, deadline: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Create Project</button>
          </form>

          <div className="mesa-glass rounded-3xl p-4 space-y-2.5">
            {projects.map((p) => (
              <div key={p.id} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{p.title}</div>
                  <div className="text-xs text-slate-400">
                    Client: {p.customerName || 'Internal'} • Budget: {fmt(p.budget)} {p.deadline ? `• Deadline: ${p.deadline}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={p.status}
                    onChange={(e) => void updateProjectStatus(p.id, e.target.value as BusinessProject['status'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-cyan-500/25 text-xs text-cyan-200"
                  >
                    <option value="planning">Planning</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                  <button type="button" onClick={() => void apiRequest(`/api/projects/${p.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {projects.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No projects added yet.</p>}
          </div>
        </div>
      )}

      {/* 4. INCOME & EXPENSES */}
      {mod === 'finance' && (
        <div className="space-y-4">
          <form onSubmit={addTransaction} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
            <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="income">Income (+)</option>
              <option value="expense">Expense (-)</option>
            </select>
            <input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} placeholder="Category" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input type="number" step="0.01" min="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} placeholder={`Amount (${currency})`} required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} placeholder="Description" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Record</button>
          </form>

          <div className="mesa-glass rounded-3xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-white">Financial Ledger ({transactions.length} entries)</h3>
              <button type="button" onClick={exportTransactionsCSV} className="px-3 py-1.5 rounded-xl mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{t.category} {t.description ? `— ${t.description}` : ''}</div>
                    <div className="text-xs text-slate-400">{t.date} • {t.paymentMethod}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${t.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {t.type === 'income' ? '+' : '-'} {fmt(t.amount)}
                    </span>
                    <button type="button" onClick={() => void apiRequest(`/api/transactions/${t.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No financial entries recorded.</p>}
            </div>
          </div>
        </div>
      )}

      {/* 5. SERVICE MANAGEMENT */}
      {mod === 'services' && (
        <div className="space-y-4">
          <form onSubmit={addService} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <input value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="Service Name *" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={svcForm.category} onChange={(e) => setSvcForm({ ...svcForm, category: e.target.value })} placeholder="Category" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input type="number" value={svcForm.basePrice} onChange={(e) => setSvcForm({ ...svcForm, basePrice: e.target.value })} placeholder={`Base Price (${currency})`} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input type="number" value={svcForm.deliveryDays} onChange={(e) => setSvcForm({ ...svcForm, deliveryDays: e.target.value })} placeholder="Delivery Days" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Add Service</button>
          </form>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {services.map((s) => (
              <div key={s.id} className="mesa-glass rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-cyan-300">{s.category}</span>
                    <h4 className="text-sm font-semibold text-white">{s.name}</h4>
                  </div>
                  <button type="button" onClick={() => void apiRequest(`/api/services/${s.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-base font-bold text-cyan-200">{fmt(s.basePrice)}</div>
                <div className="text-xs text-slate-400">Est. delivery: {s.deliveryDays} days</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. PRICING MANAGEMENT */}
      {mod === 'pricing' && (
        <div className="space-y-4">
          <form onSubmit={addPricingTier} className="mesa-glass rounded-3xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Package Name (e.g. Pro Brand Kit)" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <select value={tierForm.billingCycle} onChange={(e) => setTierForm({ ...tierForm, billingCycle: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
                <option value="one_time">One-Time</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="hourly">Hourly</option>
              </select>
              <input type="number" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} placeholder={`Price (${currency})`} required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <label className="flex items-center gap-2 text-xs text-slate-300 px-2">
                <input type="checkbox" checked={tierForm.popular} onChange={(e) => setTierForm({ ...tierForm, popular: e.target.checked })} />
                Highlight Popular Tier
              </label>
            </div>
            <textarea value={tierForm.features} onChange={(e) => setTierForm({ ...tierForm, features: e.target.value })} rows={2} placeholder="Included features (one per line)..." className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs cursor-pointer">Save Pricing Tier</button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pricing.map((tier) => (
              <div key={tier.id} className={`mesa-glass rounded-3xl p-5 flex flex-col justify-between ${tier.popular ? 'border-cyan-400/60 mesa-glow-border' : ''}`}>
                <div>
                  <div className="flex justify-between items-center">
                    <h4 className="text-base font-bold text-white">{tier.name}</h4>
                    {tier.popular && <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-400 text-slate-950 font-bold">POPULAR</span>}
                  </div>
                  <div className="text-2xl font-bold text-cyan-300 mt-2">
                    {fmt(tier.price)} <span className="text-xs text-slate-400 font-normal">/ {tier.billingCycle.replace('_', ' ')}</span>
                  </div>
                  <ul className="mt-4 space-y-1.5">
                    {tier.features.map((f, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-800 flex justify-end">
                  <button type="button" onClick={() => void apiRequest(`/api/pricing/${tier.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. INVOICE GENERATION & QUOTATIONS */}
      {mod === 'invoices' && (
        <div className="space-y-4">
          <form onSubmit={createInvoice} className="mesa-glass rounded-3xl p-5 space-y-4 no-print">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Generate Invoice / Quotation</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => setInvDocType('invoice')} className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${invDocType === 'invoice' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'mesa-glass-soft text-slate-300'}`}>Invoice</button>
                <button type="button" onClick={() => setInvDocType('quotation')} className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${invDocType === 'quotation' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'mesa-glass-soft text-slate-300'}`}>Quotation</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <select
                value={invCustomerId}
                onChange={(e) => {
                  const cid = e.target.value;
                  setInvCustomerId(cid);
                  const found = customers.find((c) => c.id === cid);
                  if (found) {
                    setInvCustomerName(found.name);
                    setInvCustomerEmail(found.email);
                    setInvCustomerAddress(found.address);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white"
              >
                <option value="">Select Existing Client...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={invCustomerName} onChange={(e) => setInvCustomerName(e.target.value)} placeholder="Client Name *" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <input value={invCustomerEmail} onChange={(e) => setInvCustomerEmail(e.target.value)} placeholder="Client Email" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <input type="date" value={invDueDate} onChange={(e) => setInvDueDate(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            </div>

            <div className="space-y-2">
              {invItems.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input value={it.description} onChange={(e) => {
                    const copy = [...invItems];
                    copy[idx] = { ...it, description: e.target.value };
                    setInvItems(copy);
                  }} placeholder="Service or item description" required className="col-span-6 px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
                  <input type="number" min="1" value={it.quantity} onChange={(e) => {
                    const copy = [...invItems];
                    copy[idx] = { ...it, quantity: Number(e.target.value) };
                    setInvItems(copy);
                  }} placeholder="Qty" className="col-span-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
                  <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => {
                    const copy = [...invItems];
                    copy[idx] = { ...it, unitPrice: Number(e.target.value) };
                    setInvItems(copy);
                  }} placeholder="Unit Price" className="col-span-3 px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
                  <button type="button" onClick={() => setInvItems(invItems.filter((_, i) => i !== idx))} className="col-span-1 text-slate-500 hover:text-rose-400 flex items-center justify-center cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setInvItems([...invItems, { description: '', quantity: 1, unitPrice: 0 }])} className="text-xs text-cyan-300 flex items-center gap-1 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input type="number" value={invTaxRate} onChange={(e) => setInvTaxRate(e.target.value)} placeholder="Tax %" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <input type="number" value={invDiscount} onChange={(e) => setInvDiscount(e.target.value)} placeholder={`Discount (${currency})`} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
              <input value={invNotes} onChange={(e) => setInvNotes(e.target.value)} placeholder="Footer Notes" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-cyan-300">
                Total: {fmt(calcInvoiceTotal({ items: invItems, discount: Number(invDiscount || 0), taxRate: Number(invTaxRate || 0) }))}
              </span>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-sm cursor-pointer">
                Save {invDocType === 'quotation' ? 'Quotation' : 'Invoice'}
              </button>
            </div>
          </form>

          {/* Saved Invoices */}
          <div className="mesa-glass rounded-3xl p-4 space-y-2 no-print">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{inv.invoiceNumber} • {inv.customerName}</div>
                  <div className="text-xs text-slate-400">Issued {inv.issueDate} • Due {inv.dueDate} • {fmt(calcInvoiceTotal(inv))}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPreviewInvoice(inv)} className="px-3 py-1.5 rounded-lg mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1 cursor-pointer">
                    <Printer className="w-3.5 h-3.5" /> View / Print
                  </button>
                  {inv.status !== 'paid' && (
                    <button type="button" onClick={() => void markInvoicePaid(inv)} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs cursor-pointer">
                      Mark Paid
                    </button>
                  )}
                  <button type="button" onClick={() => void apiRequest(`/api/invoices/${inv.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Printable Preview Modal / Card */}
          {previewInvoice && (
            <div className="mesa-glass rounded-3xl p-8 print-invoice bg-white text-slate-900 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{user.organization}</h2>
                  <p className="text-xs text-slate-600">Owner: {user.displayName}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold uppercase text-cyan-700">{previewInvoice.docType}</div>
                  <div className="text-sm font-semibold">{previewInvoice.invoiceNumber}</div>
                  <div className="text-xs text-slate-600">Date: {previewInvoice.issueDate} • Due: {previewInvoice.dueDate}</div>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-slate-500 font-semibold">Bill To</div>
                <div className="text-base font-semibold">{previewInvoice.customerName}</div>
                {previewInvoice.customerEmail && <div className="text-xs text-slate-600">{previewInvoice.customerEmail}</div>}
                {previewInvoice.customerAddress && <div className="text-xs text-slate-600">{previewInvoice.customerAddress}</div>}
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-600">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewInvoice.items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="py-2">{it.description}</td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">{previewInvoice.currency} {it.unitPrice.toFixed(2)}</td>
                      <td className="py-2 text-right">{previewInvoice.currency} {(it.quantity * it.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-2">
                <p className="text-xs text-slate-600 max-w-md">{previewInvoice.notes}</p>
                <div className="text-right space-y-1">
                  {previewInvoice.discount > 0 && <div className="text-xs">Discount: -{previewInvoice.currency} {previewInvoice.discount.toFixed(2)}</div>}
                  {previewInvoice.taxRate > 0 && <div className="text-xs">Tax: {previewInvoice.taxRate}%</div>}
                  <div className="text-xl font-bold">Total: {previewInvoice.currency} {calcInvoiceTotal(previewInvoice).toFixed(2)}</div>
                </div>
              </div>

              <div className="flex justify-end gap-2 no-print pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setPreviewInvoice(null)} className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer">Close Preview</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. CUSTOMER DOCUMENTS */}
      {mod === 'documents' && (
        <div className="space-y-4">
          <form onSubmit={uploadDocument} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Document Title *" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <select value={docType} onChange={(e) => setDocType(e.target.value as CustomerDocument['docType'])} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="contract">Contract</option>
              <option value="proposal">Proposal</option>
              <option value="brief">Project Brief</option>
              <option value="receipt">Receipt</option>
              <option value="other">Other</option>
            </select>
            <select value={docCustomerId} onChange={(e) => setDocCustomerId(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="">Select Client...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-xs text-cyan-200 flex items-center gap-1.5 cursor-pointer truncate">
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{docFile ? docFile.name : 'Choose File'}</span>
              <input type="file" onChange={handleFilePick} className="hidden" />
            </label>
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Store Document</button>
          </form>

          <div className="mesa-glass rounded-3xl p-4 space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{d.title}</div>
                  <div className="text-xs text-slate-400">
                    {d.docType.toUpperCase()} • {d.fileName} ({Math.max(1, Math.round(d.sizeBytes / 1024))} KB) {d.customerName ? `• ${d.customerName}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/api/documents/${d.id}/download`} className="px-3 py-1.5 rounded-lg mesa-glass-soft text-xs text-cyan-200 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                  <button type="button" onClick={() => void apiRequest(`/api/documents/${d.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {documents.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No customer documents stored yet.</p>}
          </div>
        </div>
      )}

      {/* 9. MARKETING MANAGEMENT */}
      {mod === 'marketing' && (
        <div className="space-y-4">
          <form onSubmit={addCampaign} className="mesa-glass rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="Campaign Name *" required className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <select value={campForm.channel} onChange={(e) => setCampForm({ ...campForm, channel: e.target.value })} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white">
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="google_ads">Google Ads</option>
              <option value="email">Email</option>
            </select>
            <input type="number" value={campForm.budget} onChange={(e) => setCampForm({ ...campForm, budget: e.target.value })} placeholder={`Budget (${currency})`} className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <input value={campForm.targetAudience} onChange={(e) => setCampForm({ ...campForm, targetAudience: e.target.value })} placeholder="Target Audience" className="px-3 py-2 rounded-xl bg-slate-950/70 border border-cyan-500/20 text-sm text-white" />
            <button type="submit" className="py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-sm cursor-pointer">Launch Tracker</button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {campaigns.map((c) => (
              <div key={c.id} className="mesa-glass rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-cyan-300">{c.channel}</span>
                    <h4 className="text-sm font-semibold text-white">{c.name}</h4>
                  </div>
                  <button type="button" onClick={() => void apiRequest(`/api/campaigns/${c.id}`, { method: 'DELETE' }).then(loadAll)} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  Budget: {fmt(c.budget)} • Spent: {fmt(c.spent)} {c.targetAudience ? `• Audience: ${c.targetAudience}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 10. BUSINESS REPORTS */}
      {mod === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mesa-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">SLBSK Profit & Loss Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Total Recorded Income</span><span className="text-emerald-300 font-semibold">{fmt(totalIncome)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Total Recorded Expenses</span><span className="text-rose-300 font-semibold">{fmt(totalExpense)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-800"><span className="text-white font-semibold">Net Profit</span><span className="text-cyan-300 font-bold">{fmt(netProfit)}</span></div>
            </div>
          </div>

          <div className="mesa-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Project Delivery Distribution</h3>
            <div className="space-y-2 text-xs">
              {(['planning', 'in_progress', 'review', 'pending', 'completed', 'on_hold'] as const).map((st) => {
                const count = projects.filter((p) => p.status === st).length;
                const pct = projects.length ? Math.round((count / projects.length) * 100) : 0;
                return (
                  <div key={st}>
                    <div className="flex justify-between mb-1">
                      <span className="capitalize text-slate-300">{st.replace('_', ' ')}</span>
                      <span className="text-cyan-300">{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
