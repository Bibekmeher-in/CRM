"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  DollarSign,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";

type View = "Dashboard" | "Contacts" | "Deals" | "Settings";
type User = { id?: string; name: string; email: string };
type Contact = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
  createdAt: string;
};
type Deal = {
  _id: string;
  title: string;
  company?: string;
  value: number;
  stage: string;
  notes?: string;
  updatedAt: string;
  contactId: string | (Pick<Contact, "_id" | "name" | "email" | "company" | "jobTitle"> & { _id: string });
};
type Dashboard = {
  stats: { totalContacts: number; totalDeals: number; openDeals: number; wonDeals: number; pipelineValue: number; wonRevenue: number };
  recentContacts: Contact[];
  recentDeals: Deal[];
  distribution: { _id: string; count: number }[];
};
type EmailDraft = {
  subject: string;
  body: string;
  personalization_points: string[];
  call_to_action: string;
  fallback: boolean;
  fallbackReason?: "upstream-unavailable";
  generationWarning?: string;
};

const stages = ["New", "Contacted", "Qualified", "Won", "Lost"];
const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Contacts", icon: Users },
  { label: "Deals", icon: BriefcaseBusiness },
  { label: "Settings", icon: Settings },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload as T;
}

async function fetchWorkspaceData() {
  const [contactData, dealData, dashboardData] = await Promise.all([
    api<{ contacts: Contact[] }>("/api/contacts"),
    api<{ deals: Deal[] }>("/api/deals"),
    api<Dashboard>("/api/dashboard"),
  ]);
  return { contacts: contactData.contacts, deals: dealData.deals, dashboard: dashboardData };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function contactFor(deal: Deal) {
  return typeof deal.contactId === "object" ? deal.contactId : null;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-panel ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><Users size={21} /></div><h3>{title}</h3><p>{copy}</p>{action}</div>;
}

export default function CrmApp() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("Dashboard");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");
  const [query, setQuery] = useState("");
  const [contactDialog, setContactDialog] = useState(false);
  const [dealDialog, setDealDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [emailBusy, setEmailBusy] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  async function loadWorkspace() {
    setLoadingData(true);
    setDataError("");
    try {
      const [contactData, dealData, dashboardData] = await Promise.all([
        api<{ contacts: Contact[] }>("/api/contacts"),
        api<{ deals: Deal[] }>("/api/deals"),
        api<Dashboard>("/api/dashboard"),
      ]);
      setContacts(contactData.contacts);
      setDeals(dealData.deals);
      setDashboard(dashboardData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load your workspace.";
      setDataError(message);
      notify(message);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    let active = true;
    api<{ user: User | null }>("/api/auth")
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchWorkspaceData()
      .then((data) => {
        if (!active) return;
        setContacts(data.contacts);
        setDeals(data.deals);
        setDashboard(data.dashboard);
        setDataError("");
      })
      .catch((error: unknown) => {
        if (active) setDataError(error instanceof Error ? error.message : "Unable to load your workspace.");
      })
      .finally(() => { if (active) setLoadingData(false); });
    return () => { active = false; };
  }, [user]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>("/api/auth", {
        method: "POST",
        body: JSON.stringify({ mode: authMode, name: form.get("name"), email: form.get("email"), password: form.get("password") }),
      });
      setLoadingData(true);
      setUser(result.user);
      setView("Dashboard");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await api("/api/auth", { method: "DELETE" });
    setUser(null);
    setContacts([]);
    setDeals([]);
    setDashboard(null);
    setView("Dashboard");
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api(editingContact ? `/api/contacts/${editingContact._id}` : "/api/contacts", {
        method: editingContact ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      setContactDialog(false);
      setEditingContact(null);
      await loadWorkspace();
      notify(editingContact ? "Contact updated" : "Contact added");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save contact");
    } finally {
      setBusy(false);
    }
  }

  async function removeContact(contact: Contact) {
    if (!window.confirm(`Delete ${contact.name} and any deals linked to them?`)) return;
    try {
      await api(`/api/contacts/${contact._id}`, { method: "DELETE" });
      setSelectedContact(null);
      await loadWorkspace();
      notify("Contact deleted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete contact");
    }
  }

  async function saveDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
    const values = { ...raw, value: Number(raw.value) };
    try {
      await api(editingDeal ? `/api/deals/${editingDeal._id}` : "/api/deals", {
        method: editingDeal ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      setDealDialog(false);
      setEditingDeal(null);
      await loadWorkspace();
      notify(editingDeal ? "Deal updated" : "Deal created");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save deal");
    } finally {
      setBusy(false);
    }
  }

  async function moveDeal(dealId: string, stage: string) {
    const before = deals;
    setDeals((current) => current.map((deal) => deal._id === dealId ? { ...deal, stage } : deal));
    try {
      await api(`/api/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      await loadWorkspace();
    } catch (error) {
      setDeals(before);
      notify(error instanceof Error ? error.message : "Unable to move deal");
    }
  }

  async function removeDeal(deal: Deal) {
    if (!window.confirm(`Delete “${deal.title}”?`)) return;
    try {
      await api(`/api/deals/${deal._id}`, { method: "DELETE" });
      await loadWorkspace();
      notify("Deal deleted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete deal");
    }
  }

  async function generateEmail(deal: Deal) {
    setEmailBusy(deal._id);
    try {
      const response = await fetch("/api/ai/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: deal._id }),
      });
      const payload = await response.json() as EmailDraft | { error: string; fallbackEmail?: EmailDraft };
      if (!response.ok) {
        if ("fallbackEmail" in payload && payload.fallbackEmail) {
          setEmailDraft(payload.fallbackEmail);
          notify(payload.error);
          return;
        }
        throw new Error("error" in payload ? payload.error : "Unable to generate email.");
      }
      const draft = payload as EmailDraft;
      setEmailDraft(draft);
      if (draft.generationWarning) notify(draft.generationWarning);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to generate email");
    } finally {
      setEmailBusy("");
    }
  }

  async function copyEmail() {
    if (!emailDraft) return;
    await navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`);
    notify("Email copied to clipboard");
  }

  async function seedDemo() {
    setBusy(true);
    try {
      await api("/api/demo", { method: "POST" });
      await loadWorkspace();
      notify("Sample contacts and deals added");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to add demo data");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return <main className="auth-screen"><div className="loading-brand"><LoaderCircle className="spin" size={22} /> Preparing your workspace</div></main>;
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-art" aria-hidden="true"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-stamp"><Sparkles size={19} /><span>Clear view.<br />Better follow-through.</span></div><div className="auth-art-caption"><span className="live-dot" /> Your next relationship starts here</div></div>
        <section className="auth-panel">
          <div className="brand-mark"><div className="brand-icon"><Sparkles size={17} /></div><span>SmartCRM<span className="brand-dot"> AI</span></span></div>
          <div className="auth-copy"><p className="eyebrow">SMARTCRM AI</p><h1>{authMode === "login" ? "Good to see you again." : "Make room for better sales."}</h1><p>{authMode === "login" ? "Sign in to pick up where your relationships left off." : "Create your workspace and keep every opportunity in view."}</p></div>
          <form className="form-stack auth-form" onSubmit={handleAuth}>
            {authMode === "signup" && <label>Full name<input name="name" autoComplete="name" placeholder="Alex Morgan" required /></label>}
            <label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@company.com" required /></label>
            <label>Password<input type="password" name="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength={8} required /></label>
            {authError && <div className="inline-error">{authError}</div>}
            <button className="button button-primary auth-submit" disabled={authBusy}>{authBusy ? <LoaderCircle className="spin" size={17} /> : null}{authMode === "login" ? "Sign in" : "Create account"}<ArrowUpRight size={16} /></button>
          </form>
          <p className="auth-switch">{authMode === "login" ? "New to SmartCRM AI?" : "Already have an account?"}<button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></p>
          <p className="auth-footnote"><CircleHelp size={14} /> A quieter way to stay close to your pipeline.</p>
        </section>
      </main>
    );
  }

  const title = view === "Dashboard" ? "Good morning" : view;
  const subtitle = view === "Dashboard" ? "Here’s what’s happening with your relationships." : view === "Contacts" ? "The people behind your best work." : view === "Deals" ? "A clear view from first hello to closed won." : "Your workspace, your way.";
  const filteredContacts = contacts.filter((contact) => [contact.name, contact.email, contact.company, contact.jobTitle].some((value) => value?.toLowerCase().includes(query.toLowerCase())));
  const stats = dashboard?.stats;
  const maxStageCount = Math.max(1, ...(dashboard?.distribution.map((item) => item.count) ?? []));

  return (
    <div className="crm-shell">
      <aside className="sidebar">
        <div className="brand-mark sidebar-brand"><div className="brand-icon"><Sparkles size={17} /></div><span>SmartCRM<span className="brand-dot"> AI</span></span></div>
        <div className="workspace-tag"><span className="workspace-avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>Personal workspace</small></span><ChevronDown size={15} /></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${view === label ? "nav-active" : ""}`} onClick={() => { setView(label); setMobileMenuOpen(false); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === "Deals" && deals.length > 0 && <span className="nav-count">{deals.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><div className="note-icon"><Sparkles size={15} /></div><p><strong>A thoughtful follow-up</strong><span>is one AI draft away.</span></p><button onClick={() => setView("Deals")} aria-label="Go to deals"><ArrowUpRight size={15} /></button></div><button className="profile-button" onClick={signOut}><span className="profile-avatar">{initials(user.name)}</span><span className="profile-text"><strong>{user.name}</strong><small>{user.email}</small></span><LogOut size={16} /></button></div>
      </aside>

      <div className="main-area">
        <header className="topbar"><div className="mobile-brand brand-mark"><div className="brand-icon"><Sparkles size={16} /></div><span>SmartCRM<span className="brand-dot"> AI</span></span></div><div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{view}</strong></div><div className="topbar-actions"><div className="topbar-date">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</div><button className="icon-button" title="Help" aria-label="Help"><CircleHelp size={18} /></button><button className="icon-button mobile-menu-trigger" aria-label="Open menu" onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={18} /></button></div></header>
        {mobileMenuOpen && <nav className="mobile-menu">{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setView(label); setMobileMenuOpen(false); }}><Icon size={17} />{label}</button>)}<button onClick={signOut}><LogOut size={17} />Sign out</button></nav>}

        <main className="content-area">
          <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date())}</p><h1>{view === "Dashboard" ? `${title}, ${user.name.split(" ")[0]}.` : title}</h1><p className="page-subtitle">{subtitle}</p></div>{view === "Contacts" ? <button className="button button-primary" onClick={() => { setEditingContact(null); setContactDialog(true); }}><Plus size={17} /> Add contact</button> : view === "Deals" ? <button className="button button-primary" onClick={() => { setEditingDeal(null); setDealDialog(true); }} disabled={!contacts.length}><Plus size={17} /> New deal</button> : null}</div>

          {dataError && <div className="data-error"><span>{dataError}</span><button onClick={() => void loadWorkspace()}>Retry</button></div>}
          {loadingData && !dashboard ? <div className="page-skeleton"><div /><div /><div /><div /></div> : null}

          {!loadingData && view === "Dashboard" && <section className="dashboard-view">
            <div className="stat-grid">
              <StatCard label="Total contacts" value={stats?.totalContacts ?? 0} icon={<Users size={18} />} detail="People in your network" tone="mint" />
              <StatCard label="Total deals" value={stats?.totalDeals ?? 0} icon={<BriefcaseBusiness size={18} />} detail={`${stats?.openDeals ?? 0} active opportunities`} tone="blue" />
              <StatCard label="Pipeline value" value={money(stats?.pipelineValue ?? 0)} icon={<ArrowUpRight size={18} />} detail="Across open deals" tone="gold" />
              <StatCard label="Won revenue" value={money(stats?.wonRevenue ?? 0)} icon={<DollarSign size={18} />} detail={`${stats?.wonDeals ?? 0} deals closed`} tone="coral" />
            </div>
            <div className="dashboard-grid">
              <section className="surface stage-panel"><div className="surface-heading"><div><p className="eyebrow">YOUR PIPELINE</p><h2>Deal stages</h2></div><button className="text-button" onClick={() => setView("Deals")}>View pipeline <ArrowUpRight size={14} /></button></div><div className="stage-list">{stages.map((stage) => { const count = dashboard?.distribution.find((item) => item._id === stage)?.count ?? 0; return <div className="stage-row" key={stage}><span className={`stage-dot stage-${stage.toLowerCase()}`} /><span className="stage-name">{stage}</span><div className="stage-track"><div className={`stage-fill fill-${stage.toLowerCase()}`} style={{ width: `${(count / maxStageCount) * 100}%` }} /></div><span className="stage-total">{count}</span></div>; })}</div><div className="stage-footnote"><span>{stats?.openDeals ?? 0} active opportunities</span><span>{money(stats?.pipelineValue ?? 0)} open value</span></div></section>
              <section className="surface activity-panel"><div className="surface-heading"><div><p className="eyebrow">JUST ADDED</p><h2>Recent contacts</h2></div><button className="text-button" onClick={() => setView("Contacts")}>All contacts <ArrowUpRight size={14} /></button></div>{dashboard?.recentContacts.length ? <div className="activity-list">{dashboard.recentContacts.slice(0, 4).map((contact) => <button className="activity-row" key={contact._id} onClick={() => setSelectedContact(contact)}><span className="contact-avatar">{initials(contact.name)}</span><span className="activity-person"><strong>{contact.name}</strong><small>{contact.company || contact.email}</small></span><span className="activity-date">{new Date(contact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></button>)}</div> : <EmptyState title="A fresh start" copy="Add your first contact to build your network." action={<button className="text-button" onClick={() => { setEditingContact(null); setContactDialog(true); }}>Add a contact <ArrowUpRight size={14} /></button>} />}</section>
              <section className="surface recent-deals"><div className="surface-heading"><div><p className="eyebrow">IN MOTION</p><h2>Recent deals</h2></div><button className="text-button" onClick={() => setView("Deals")}>Open pipeline <ArrowUpRight size={14} /></button></div>{dashboard?.recentDeals.length ? <div className="recent-deal-list">{dashboard.recentDeals.slice(0, 4).map((deal) => { const contact = contactFor(deal); return <div className="recent-deal-row" key={deal._id}><div className="recent-deal-title"><strong>{deal.title}</strong><small>{contact?.name ?? "Contact"} · {deal.company || contact?.company || "—"}</small></div><span className={`pill-stage pill-${deal.stage.toLowerCase()}`}>{deal.stage}</span><strong className="recent-deal-value">{money(deal.value)}</strong></div>; })}</div> : <EmptyState title="No deals yet" copy="Create a deal to see it move through your pipeline." action={<button className="text-button" onClick={() => setView("Deals")}>Explore deals <ArrowUpRight size={14} /></button>} />}</section>
            </div>
          </section>}

          {!loadingData && view === "Contacts" && <section className="surface contacts-surface"><div className="table-toolbar"><div><strong>{contacts.length} contacts</strong><span className="toolbar-muted">· Keep every conversation close</span></div><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts" aria-label="Search contacts" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}</label></div>{filteredContacts.length ? <div className="table-scroll"><table className="contacts-table"><thead><tr><th>NAME</th><th>COMPANY</th><th>PHONE</th><th>ADDED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredContacts.map((contact) => <tr key={contact._id}><td><button className="person-cell" onClick={() => setSelectedContact(contact)}><span className="contact-avatar">{initials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.email}</small></span></button></td><td><span className="company-cell">{contact.company || "—"}</span><small className="job-title">{contact.jobTitle}</small></td><td className="phone-cell">{contact.phone || "—"}</td><td className="date-cell">{new Date(contact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${contact.name}`} title="Edit contact" onClick={() => { setEditingContact(contact); setContactDialog(true); }}><MoreHorizontal size={17} /></button><button className="icon-button danger-hover" aria-label={`Delete ${contact.name}`} title="Delete contact" onClick={() => void removeContact(contact)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title={query ? "No matches found" : "Your contacts live here"} copy={query ? "Try another name, company, or email." : "Add a person to start building your network."} action={!query ? <button className="button button-primary" onClick={() => { setEditingContact(null); setContactDialog(true); }}><Plus size={16} /> Add contact</button> : undefined} />}</section>}

          {!loadingData && view === "Deals" && <section className="pipeline-view"><div className="pipeline-summary"><span><span className="live-dot" /> {stats?.openDeals ?? 0} active opportunities</span><strong>{money(stats?.pipelineValue ?? 0)} <small>open pipeline</small></strong></div>{!contacts.length ? <section className="surface pipeline-empty"><EmptyState title="Add a contact first" copy="Every deal belongs to a person. Add your first contact to open the pipeline." action={<button className="button button-primary" onClick={() => { setView("Contacts"); setContactDialog(true); }}><Plus size={16} /> Add contact</button>} /></section> : <div className="kanban-board">{stages.map((stage) => { const columnDeals = deals.filter((deal) => deal.stage === stage); return <section className="kanban-column" key={stage} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedDeal) void moveDeal(draggedDeal, stage); setDraggedDeal(null); }}><div className="column-heading"><div className="column-stage-label"><span className={`stage-dot stage-${stage.toLowerCase()}`} /><h2>{stage}</h2><span className="column-count">{columnDeals.length}</span></div><button className="icon-button" aria-label={`Add deal in ${stage}`} onClick={() => { setEditingDeal(null); setDealDialog(true); }}><Plus size={16} /></button></div><div className="deal-stack">{columnDeals.map((deal) => <DealCard key={deal._id} deal={deal} emailBusy={emailBusy === deal._id} onEmail={() => void generateEmail(deal)} onEdit={() => { setEditingDeal(deal); setDealDialog(true); }} onDelete={() => void removeDeal(deal)} onDragStart={() => setDraggedDeal(deal._id)} />)}{!columnDeals.length && <div className="column-empty">Drop a deal here</div>}</div><div className="column-total">{money(columnDeals.reduce((sum, deal) => sum + deal.value, 0))}</div></section>; })}</div>}</section>}

          {!loadingData && view === "Settings" && <section className="settings-grid"><section className="surface settings-section"><div className="surface-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Profile</h2></div><span className="settings-avatar">{initials(user.name)}</span></div><div className="settings-field"><span>Name</span><strong>{user.name}</strong></div><div className="settings-field"><span>Email</span><strong>{user.email}</strong></div><button className="button button-secondary signout-button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button></section><section className="surface settings-section"><div className="surface-heading"><div><p className="eyebrow">GETTING STARTED</p><h2>Sample workspace</h2></div><Sparkles size={19} className="settings-sparkle" /></div><p className="settings-copy">Explore a working pipeline with realistic contacts and opportunities. Sample records are added only when your contacts list is empty.</p><button className="button button-primary" onClick={() => void seedDemo()} disabled={busy || contacts.length > 0}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{contacts.length ? "Workspace already has contacts" : "Add sample data"}</button></section><section className="surface settings-section"><div className="surface-heading"><div><p className="eyebrow">AI ASSIST</p><h2>Follow-up emails</h2></div><span className="ai-status"><span className="live-dot" /> Ready</span></div><p className="settings-copy">Drafts use your deal context and stay editable before you copy them. Add an OpenAI API key to enable personalized AI generation; otherwise, a concise template is used.</p><div className="settings-footnote"><Sparkles size={15} /> AI requests are sent only from the server.</div></section></section>}

          {!loadingData && !contacts.length && !deals.length && view === "Dashboard" && <div className="welcome-strip"><span><Sparkles size={17} /> Start with sample data or add a contact to shape your dashboard.</span><button className="text-button" onClick={() => setView("Settings")}>Set up workspace <ArrowUpRight size={14} /></button></div>}
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={view === label ? "mobile-nav-active" : ""} onClick={() => setView(label)}><Icon size={19} /><span>{label}</span></button>)}</nav>

      {contactDialog && <Modal title={editingContact ? "Edit contact" : "Add a contact"} onClose={() => { setContactDialog(false); setEditingContact(null); }}><form className="form-stack modal-form" onSubmit={saveContact}><div className="form-two"><label>Full name<input name="name" defaultValue={editingContact?.name} placeholder="Sam Taylor" required /></label><label>Job title<input name="jobTitle" defaultValue={editingContact?.jobTitle} placeholder="Product lead" /></label></div><label>Email address<input name="email" type="email" defaultValue={editingContact?.email} placeholder="sam@company.com" required /></label><div className="form-two"><label>Company<input name="company" defaultValue={editingContact?.company} placeholder="Company name" /></label><label>Phone<input name="phone" defaultValue={editingContact?.phone} placeholder="+1 555 0100" /></label></div><label>Notes<textarea name="notes" defaultValue={editingContact?.notes} rows={3} placeholder="A useful detail to remember…" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setContactDialog(false)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{editingContact ? "Save changes" : "Add contact"}</button></div></form></Modal>}

      {dealDialog && <Modal title={editingDeal ? "Edit deal" : "Create a deal"} onClose={() => { setDealDialog(false); setEditingDeal(null); }}><form className="form-stack modal-form" onSubmit={saveDeal}><label>Deal title<input name="title" defaultValue={editingDeal?.title} placeholder="Team workspace rollout" required /></label><div className="form-two"><label>Contact<select name="contactId" defaultValue={typeof editingDeal?.contactId === "object" ? editingDeal.contactId._id : editingDeal?.contactId} required><option value="">Choose a contact</option>{contacts.map((contact) => <option value={contact._id} key={contact._id}>{contact.name} · {contact.company || contact.email}</option>)}</select></label><label>Deal value<input name="value" type="number" min="0" step="100" defaultValue={editingDeal?.value ?? 0} required /></label></div><div className="form-two"><label>Company<input name="company" defaultValue={editingDeal?.company} placeholder="Company name" /></label><label>Stage<select name="stage" defaultValue={editingDeal?.stage ?? "New"}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div><label>Notes<textarea name="notes" defaultValue={editingDeal?.notes} rows={3} placeholder="Context for your next conversation…" /></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setDealDialog(false)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : null}{editingDeal ? "Save changes" : "Create deal"}</button></div></form></Modal>}

      {selectedContact && <Modal title="Contact details" onClose={() => setSelectedContact(null)}><div className="contact-detail"><div className="detail-person"><span className="detail-avatar">{initials(selectedContact.name)}</span><div><h3>{selectedContact.name}</h3><p>{selectedContact.jobTitle || "Contact"}{selectedContact.company ? ` · ${selectedContact.company}` : ""}</p></div></div><div className="detail-line"><Mail size={16} /><a href={`mailto:${selectedContact.email}`}>{selectedContact.email}</a></div>{selectedContact.phone && <div className="detail-line"><ArrowDownLeft size={16} /><a href={`tel:${selectedContact.phone}`}>{selectedContact.phone}</a></div>}{selectedContact.notes && <div className="detail-notes"><span>NOTES</span><p>{selectedContact.notes}</p></div>}<div className="modal-actions"><button className="button button-secondary danger-button" onClick={() => void removeContact(selectedContact)}><Trash2 size={15} /> Delete</button><button className="button button-primary" onClick={() => { setEditingContact(selectedContact); setSelectedContact(null); setContactDialog(true); }}>Edit contact</button></div></div></Modal>}

      {emailDraft && <Modal title="AI follow-up" onClose={() => setEmailDraft(null)} wide><div className="ai-banner"><span className="ai-banner-icon"><Sparkles size={17} /></span><span><strong>{emailDraft.fallback ? "A ready-to-edit template" : "Drafted with AI"}</strong><small>{emailDraft.fallbackReason === "upstream-unavailable" ? "AI service unavailable; a contextual template was used." : "Add an OpenAI key for personalized generation."}</small></span></div><div className="form-stack modal-form email-editor"><label>Subject<input value={emailDraft.subject} onChange={(event) => setEmailDraft({ ...emailDraft, subject: event.target.value })} /></label><label>Email body<textarea value={emailDraft.body} onChange={(event) => setEmailDraft({ ...emailDraft, body: event.target.value })} rows={10} /></label><div className="modal-actions"><button className="button button-secondary" onClick={() => void copyEmail()}><Copy size={15} /> Copy email</button><button className="button button-primary" onClick={() => setEmailDraft(null)}>Done <Check size={16} /></button></div></div></Modal>}

      {emailBusy && <div className="email-generating"><LoaderCircle className="spin" size={16} /> Writing a thoughtful follow-up…</div>}
      {toast && <div className="toast-message" role="status"><Check size={16} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

function StatCard({ label, value, icon, detail, tone }: { label: string; value: string | number; icon: ReactNode; detail: string; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon tone-${tone}`}>{icon}</div><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}

function DealCard({ deal, emailBusy, onEmail, onEdit, onDelete, onDragStart }: { deal: Deal; emailBusy: boolean; onEmail: () => void; onEdit: () => void; onDelete: () => void; onDragStart: () => void }) {
  const contact = contactFor(deal);
  return <article className="deal-card" draggable onDragStart={onDragStart}><div className="deal-card-top"><span className={`deal-category category-${deal.stage.toLowerCase()}`}><span className="stage-dot stage-new" /> Opportunity</span><div className="deal-menu"><button className="icon-button" aria-label="Edit deal" title="Edit deal" onClick={onEdit}><MoreHorizontal size={17} /></button><button className="icon-button danger-hover" aria-label="Delete deal" title="Delete deal" onClick={onDelete}><Trash2 size={14} /></button></div></div><h3>{deal.title}</h3><p className="deal-company">{deal.company || contact?.company || "Company not set"}</p><div className="deal-card-contact"><span className="mini-avatar">{initials(contact?.name ?? "?")}</span><span>{contact?.name ?? "Contact"}</span></div><div className="deal-card-footer"><strong>{money(deal.value)}</strong><button className="button button-ai" onClick={onEmail} disabled={emailBusy}>{emailBusy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{emailBusy ? "Writing" : "AI follow-up"}</button></div></article>;
}