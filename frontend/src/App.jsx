import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, api, publicDealUrl } from "./api.js";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const initialForm = {
  title: "",
  description: "",
  amountUsdc: "",
  buyerEmail: "",
  buyerWalletAddress: "",
  deliveryMethod: "",
  expectedDeliveryAt: "",
  conditions: "",
};

const statusNames = {
  CREATED: "Awaiting payment",
  FUNDS_SECURED: "Funds secured",
  SHIPPED: "Awaiting delivery",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
  RESOLVED: "Resolved",
};

function StatusBadge({ status, simulated = false }) {
  const label = statusNames[status] || status || "Unknown";
  return <span className={`status status-${status?.toLowerCase() || "default"}`}>{simulated ? `Demo · ${label}` : label}</span>;
}

function Brand({ compact = false }) {
  return (
    <a className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="RoqLock home">
      <span className="brand-mark"><span /></span>
      <span>roq<span className="brand-light">lock</span></span>
    </a>
  );
}

function AuthScreen({ onAuthenticated, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "SELLER" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : form;
      const result = await api(path, { method: "POST", body: payload });
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE DEAL, DONE RIGHT</div>
          <h1>Good deals<br />start with <em>trust.</em></h1>
          <p>Keep the money safe, the terms clear, and every deal moving forward with confidence.</p>
        </div>
        <div className="story-card">
          <div className="story-card-top"><span className="mini-icon">↗</span><span>DEAL PROTECTED</span><span className="live-dot" /></div>
          <div className="story-card-title">Vintage camera · Deal #RL-02841</div>
          <div className="story-card-amount">$480.00 <small>USDC</small></div>
          <div className="progress-track"><span /></div>
          <div className="story-card-foot"><span>Funds held securely</span><span>2 of 3 steps</span></div>
        </div>
        <div className="story-foot"><span>Secure by design</span><span>Built on Base</span><span>Always in control</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand"><Brand /></div>
          <div className="form-kicker">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</div>
          <h2>{mode === "login" ? "Sign in to RoqLock" : "Create your account"}</h2>
          <p className="form-intro">{mode === "login" ? "Your next great deal is just a sign-in away." : "A safer way to make deals online."}</p>
          {DEMO_MODE && <div className="notice notice-demo" role="note">Judge demo: Roqqu is unavailable. Checkout and release are simulated; no money moves.</div>}
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <>
                <label>Full name<input required autoComplete="name" maxLength={80} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Your name" /></label>
                <label>I'm here as
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    <option value="SELLER">Seller</option>
                    <option value="BUYER">Buyer</option>
                  </select>
                </label>
              </>
            )}
            <label>Email address<input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
            <label>Password<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : 1} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"} /></label>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <button className="button button-primary button-wide" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<span>↗</span></button>
          </form>
          <div className="auth-switch">
            {mode === "login" ? "New to RoqLock?" : "Already have an account?"}
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
          <div className="auth-safe"><span>▣</span> Your funds stay in smart-contract escrow, never in our hands.</div>
          <p className="api-caption">Connected to <span>{API_URL.replace(/^https?:\/\//, "")}</span></p>
        </div>
      </section>
    </main>
  );
}

function LandingPage({ onGetStarted, onSignIn }) {
  const stages = DEMO_MODE ? [
    ["01", "Agree on a deal", "Create a sample agreement"],
    ["02", "Simulate checkout", "No payment is processed"],
    ["03", "Mark as shipped", "Try the seller flow"],
    ["04", "Simulate release", "No funds are transferred"],
  ] : [
    ["01", "Deal created", "Agree on the terms"],
    ["02", "Payment verified", "Buyer funds the deal"],
    ["03", "Funds secured", "Held until delivery"],
    ["04", "Deal completed", "Seller gets paid"],
  ];

  return (
    <main className="landing-page">
      <header className="landing-header">
        <Brand />
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#protection">Protection</a>
        </nav>
        <div className="landing-actions">
          <button className="landing-signin" onClick={onSignIn}>Sign in</button>
          <button className="button button-primary" onClick={onGetStarted}>Create a deal <span>↗</span></button>
        </div>
      </header>
      {DEMO_MODE && <div className="notice notice-demo demo-banner" role="note">JUDGE DEMO · Roqqu's API is currently unavailable, so checkout and release are simulated. No money moves.</div>}
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow"><span className="eyebrow-dot" /> {DEMO_MODE ? "ROQLOCK INTERACTIVE DEMO" : "A SAFER WAY TO COMPLETE A DEAL"}</div>
          <h1>{DEMO_MODE ? <>See how a deal<br /><em>moves forward.</em></> : <>Don't just send money.<br /><em>Secure the deal.</em></>}</h1>
          <p>{DEMO_MODE ? "Create a sample agreement, walk through checkout, and follow the deal to completion. Every payment step is simulated for this demo." : "Buying from someone on WhatsApp or Instagram? RoqLock helps protect your transaction, so payment follows the agreement between you and the seller."}</p>
          <div className="landing-hero-actions">
            <button className="button button-primary" onClick={onGetStarted}>Create a Deal <span>↗</span></button>
            <a className="button button-quiet" href="#how-it-works">How It Works <span>↓</span></a>
          </div>
          <div className="landing-trust">{DEMO_MODE ? <><span>✓ Sample data only</span><span>◈ No real payments</span></> : <><span>✓ No marketplace. No middleman.</span><span>◈ Funds secured until delivery</span></>}</div>
        </div>
        <div className="landing-illustration" aria-label="Four stages of a protected RoqLock deal">
          <div className="illustration-heading"><span>{DEMO_MODE ? "DEMO WALKTHROUGH" : "WHAT HAPPENS NEXT"}</span><span className="illustration-network"><i /> {DEMO_MODE ? "SIMULATED" : "BASE SEPOLIA"}</span></div>
          <div className="illustration-amount"><span>{DEMO_MODE ? "No payment is processed." : "One agreement. Four clear steps."}</span></div>
          <div className="illustration-stages">
            {stages.map(([number, title, caption], index) => (
              <div className="illustration-stage" key={number}>
                <span className="illustration-number">{number}</span>
                <div><strong>{title}</strong><small>{caption}</small></div>
              </div>
            ))}
          </div>
          <div className="illustration-foot"><span>◈</span> {DEMO_MODE ? "Demo only · no funds move." : "Funds are only released after the agreed steps."}</div>
          <div className="illustration-decoration">✳</div>
        </div>
      </section>
      <section className="landing-how" id="how-it-works">
        <div className="landing-section-heading"><div className="form-kicker">{DEMO_MODE ? "DEMO FLOW" : "SIMPLE FROM START TO FINISH"}</div><h2>{DEMO_MODE ? "See each step in action." : "Three steps. More peace of mind."}</h2><p>{DEMO_MODE ? "Use the demo to explore the deal experience. No real payment occurs." : "Keep the deal you already made. Make the payment safer."}</p></div>
        <div className="how-grid">
          <HowCard number="01" title="Create a deal" text={DEMO_MODE ? "Enter a sample item, amount, and delivery terms." : "The seller enters the agreed item or service, amount, and delivery terms."} icon="＋" />
          <HowCard number="02" title={DEMO_MODE ? "Try checkout" : "Share the link"} text={DEMO_MODE ? "Preview the buyer experience with a simulated payment." : "The buyer gets a private link to review the agreement and fund the deal."} icon="↗" />
          <HowCard number="03" title={DEMO_MODE ? "Finish the walkthrough" : "Complete with confidence"} text={DEMO_MODE ? "Mark shipped and simulate the final release. No money moves." : "Funds are verified and secured, then released when the deal is complete."} icon="✓" />
        </div>
      </section>
      {!DEMO_MODE && <section className="landing-protection" id="protection">
        <div className="landing-section-heading"><div className="form-kicker">BUILT FOR BOTH SIDES</div><h2>Clear terms. Fairer transactions.</h2></div>
        <div className="protection-grid">
          <ProtectionCard title="For buyers" icon="↙" points={["Review the agreed terms before paying.", "Funds are secured for the transaction.", "Raise a dispute if something goes wrong."]} />
          <ProtectionCard title="For sellers" icon="↗" points={["Keep a clear record of the agreement.", "Payment is verified, not just claimed.", "Receive funds when the deal is complete."]} />
        </div>
      </section>}
      <section className="landing-final">
        <div><div className="form-kicker">READY WHEN YOU ARE</div><h2>Have a deal to complete?</h2><p>Protect the agreement you’ve already made.</p></div>
        <button className="button button-primary" onClick={onGetStarted}>Get Started <span>↗</span></button>
      </section>
      <footer className="landing-footer"><Brand compact /><span>© RoqLock · Safer deals, by design</span><span>Testnet only · Base Sepolia</span></footer>
    </main>
  );
}

function HowCard({ number, title, text, icon }) {
  return <article className="how-card"><div className="how-card-top"><span>{number}</span><span className="how-icon">{icon}</span></div><h3>{title}</h3><p>{text}</p></article>;
}

function ProtectionCard({ title, icon, points }) {
  return <article className="protection-card"><span className="protection-icon">{icon}</span><h3>{title}</h3><ul>{points.map((point) => <li key={point}><span>✓</span>{point}</li>)}</ul></article>;
}

function AppShell({ user, onSignOut, children, active, onNavigate, unreadCount, notifications, onReadNotice }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const nav = user.role === "SELLER"
    ? [["overview", "▦", "Dashboard"], ["deals", "◫", "My transactions"], ["disputes", "!", "Disputes"], ["create", "+", "Create a deal"]]
    : [["overview", "▦", "Dashboard"], ["deals", "◫", "My transactions"], ["disputes", "!", "Disputes"]];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand compact />
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(([key, icon, label]) => (
            <button className={`nav-item ${active === key ? "active" : ""}`} key={key} onClick={() => onNavigate(key)}>
              <span className="nav-icon">{icon}</span>{label}
              {key === "deals" && <span className="nav-arrow">›</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card"><span className="network-check">✓</span><div><strong>Base Sepolia</strong><small>Test network</small></div><i /></div>
          <button className="profile-button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
            <span className="avatar">{(user.displayName || user.email || "R").slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{user.displayName || "Your account"}</strong><small>{user.role === "SELLER" ? "Seller account" : "Buyer account"}</small></span>
            <span className="profile-more">···</span>
          </button>
          {profileOpen && <div className="profile-menu"><strong>{user.displayName}</strong><span>{user.email}</span><small>{user.walletAddress ? shorten(user.walletAddress) : "Wallet not linked"}</small><button onClick={onSignOut}>Sign out</button></div>}
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {active === "create" ? "New deal" : active === "deals" ? "My transactions" : active === "disputes" ? "Disputes" : "Dashboard"}</div>
          <div className="topbar-right">
            <div className="top-network"><i /> Base Sepolia</div>
            <div className="notification-wrap">
              <button className="icon-button notification-button" aria-label={`${unreadCount} unread notifications`} aria-expanded={notificationsOpen} title={`${unreadCount} unread notifications`} onClick={() => setNotificationsOpen((open) => !open)}>♧{unreadCount > 0 && <span className="notification-dot" />}</button>
              {notificationsOpen && <div className="notification-menu"><div className="notification-heading">Notifications <span>{unreadCount} new</span></div>{notifications.length ? notifications.slice(0, 8).map((notification) => <button className={`notification-item ${notification.readAt ? "" : "unread"}`} key={notification.id} onClick={() => onReadNotice(notification)}><span className="notification-item-dot" /><span><strong>{notification.type?.replaceAll("_", " ") || "Update"}</strong><small>{notification.message}</small><small>{formatDate(notification.createdAt)}</small></span></button>) : <div className="notification-empty">You’re all caught up.</div>}</div>}
            </div>
            <span className="avatar avatar-small">{(user.displayName || user.email || "R").slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        {children}
        <footer className="workspace-footer"><span>RoqLock · Safer deals, by design</span><span>Testnet only · Base Sepolia</span></footer>
      </main>
    </div>
  );
}

function Overview({ user, deals, onNavigate, onRefresh, onShare, onShipping, onWallet, onView, busy, demoMode }) {
  const activeDeals = deals.filter((deal) => !["COMPLETED", "RESOLVED", "REFUNDED", "FAILED"].includes(deal.status)).length;
  const secured = deals.filter((deal) => ["FUNDS_SECURED", "SHIPPED"].includes(deal.status)).length;
  const completed = deals.filter((deal) => ["COMPLETED", "RESOLVED"].includes(deal.status)).length;

  return (
    <section className="page-content">
      <div className="page-heading">
        <div><div className="form-kicker">{demoMode ? "JUDGE DEMO" : "YOUR WORKSPACE"}</div><h1>Your transactions</h1><p>{demoMode ? "Walk through a sample deal. Checkout and release are simulated; no money moves." : "Create protected deals and keep track of your payments."}</p></div>
        <div className="heading-actions"><button className="button button-quiet" onClick={onRefresh}>↻ <span>Refresh</span></button>{user.role === "SELLER" && <button className="button button-primary" onClick={() => onNavigate("create")}>＋ New deal</button>}</div>
      </div>
      {!demoMode && user.role === "SELLER" && !user.walletAddress && (
        <div className="wallet-banner"><div className="wallet-banner-icon">◇</div><div><strong>Link your wallet to get started</strong><p>Verify wallet ownership to create your first deal on Base Sepolia.</p></div><button className="button button-light" onClick={onWallet} disabled={busy}>{busy ? "Connecting…" : "Connect wallet"} <span>↗</span></button></div>
      )}
      <div className="metric-grid">
        <Metric label="ACTIVE DEALS" value={activeDeals} suffix="deals" icon="◷" tone="green" />
        <Metric label={demoMode ? "DEMO CHECKOUTS" : "FUNDS SECURED"} value={secured} suffix="deals" icon="◈" tone="cream" />
        <Metric label="COMPLETED" value={completed} suffix="deals" icon="✓" tone="lavender" />
      </div>
      <div className="section-heading"><div><h2>Recent transactions</h2><p>Your latest activity at a glance.</p></div><button className="text-button" onClick={() => onNavigate("deals")}>View all transactions <span>→</span></button></div>
      {deals.length
        ? <DealTable deals={deals.slice(0, 5)} user={user} onShare={onShare} onShipping={onShipping} onView={onView} busy={busy} />
        : <div className="empty-state"><div className="empty-mark">◫</div><h3>You haven't created any deals yet.</h3><p>Create your first deal and share a private link with your buyer.</p>{user.role === "SELLER" && <button className="button button-primary empty-cta" onClick={() => onNavigate("create")}>Create your first deal <span>↗</span></button>}</div>}
    </section>
  );
}

function Metric({ label, value, suffix, icon, tone }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon metric-icon-${tone}`}>{icon}</span></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-bottom"><span className="metric-line" /><span>Updated just now</span></div></div>;
}

function DealTable({ deals, user, onShare, onShipping, onView, busy }) {
  if (!deals.length) {
    return <div className="empty-state"><div className="empty-mark">◫</div><h3>No deals yet</h3><p>When you create or join a deal, it’ll show up here.</p></div>;
  }
  return (
    <div className="table-card">
      <div className="deal-table table-head"><span>DEAL</span><span>BUYER</span><span>AMOUNT</span><span>STATUS</span><span>CREATED</span><span>ACTION</span></div>
      {deals.map((deal) => (
        <div className="deal-table deal-row" key={deal.id}>
          <div className="deal-name"><span className="deal-symbol">{deal.title?.slice(0, 1)?.toUpperCase() || "R"}</span><span><strong>{deal.title}</strong><small>{deal.reference || `#${deal.id?.slice(0, 8)}`}</small></span></div>
          <span className="deal-buyer">{deal.buyerEmail || (deal.buyerWalletAddress ? shorten(deal.buyerWalletAddress) : deal.seller?.displayName || "—")}</span>
          <strong className="deal-amount">${Number(deal.amountUsdc).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small> USDC</small></strong>
          <StatusBadge status={deal.status} simulated={deal.simulated} />
          <span className="deal-date">{formatDate(deal.createdAt)}</span>
          <div className="deal-actions">
            {user.role === "SELLER" && deal.status === "CREATED" && <button className="row-action" disabled={busy} onClick={() => onShare(deal)}>Share link</button>}
            {user.role === "SELLER" && deal.status === "FUNDS_SECURED" && <button className="row-action" disabled={busy} onClick={() => onShipping(deal)}>Mark shipped</button>}
            <button className="row-action row-view" onClick={() => onView(deal)}>View details</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DealsPage({ user, deals, onRefresh, onShare, onShipping, onView, busy, onNavigate }) {
  const [filter, setFilter] = useState("ALL");
  const visibleDeals = useMemo(() => filter === "ALL" ? deals : deals.filter((deal) => deal.status === filter), [deals, filter]);
  const filters = ["ALL", "CREATED", "FUNDS_SECURED", "SHIPPED", "COMPLETED", "DISPUTED"];

  return (
    <section className="page-content">
      <div className="page-heading"><div><div className="form-kicker">DEAL MANAGEMENT</div><h1>My transactions</h1><p>All the details, all in one place.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={onRefresh}>↻ <span>Refresh</span></button>{user.role === "SELLER" && <button className="button button-primary" onClick={() => onNavigate("create")}>＋ New deal</button>}</div></div>
      <div className="filter-bar">{filters.map((item) => <button key={item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item === "ALL" ? "All deals" : statusNames[item] || item}</button>)}</div>
      <DealTable deals={visibleDeals} user={user} onShare={onShare} onShipping={onShipping} onView={onView} busy={busy} />
    </section>
  );
}

function DisputesPage({ disputes, onRefresh, busy }) {
  return (
    <section className="page-content">
      <div className="page-heading"><div><div className="form-kicker">DEAL SUPPORT</div><h1>Disputes</h1><p>Review issues raised for transactions you’re part of.</p></div><button className="button button-quiet" onClick={onRefresh} disabled={busy}>↻ <span>Refresh</span></button></div>
      {disputes.length ? (
        <div className="dispute-list">{disputes.map((dispute) => (
          <article className="dispute-item" key={dispute.id}>
            <div className="dispute-item-top"><div><span className="form-kicker">{dispute.deal?.reference || "TRANSACTION"}</span><h2>{dispute.deal?.title || "Deal dispute"}</h2></div><span className={`dispute-state dispute-state-${dispute.status?.toLowerCase() || "open"}`}>{dispute.status || "OPEN"}</span></div>
            <p>{dispute.description}</p>
            <div className="dispute-item-foot"><span>Submitted {formatDate(dispute.createdAt)}</span><span>Transaction status: {statusNames[dispute.deal?.status] || dispute.deal?.status || "Under review"}</span></div>
            {dispute.evidence?.length > 0 && <div className="evidence-list"><strong>Evidence references</strong>{dispute.evidence.map((evidence) => <span key={evidence.id}>{evidence.description || evidence.storageKey}</span>)}</div>}
            <div className="dispute-next-step">The authorised dispute process determines the outcome. Neither party can decide it independently.</div>
          </article>
        ))}</div>
      ) : <div className="empty-state"><div className="empty-mark">✓</div><h3>No disputes to show</h3><p>If a dispute is raised on one of your deals, its status will appear here.</p></div>}
    </section>
  );
}

function CreateDeal({ onCreate, busy, error, user, onWallet, demoMode }) {
  const [form, setForm] = useState(initialForm);
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ""));
    if (body.expectedDeliveryAt) body.expectedDeliveryAt = new Date(body.expectedDeliveryAt).toISOString();
    if (await onCreate({ ...body, ...(user.walletAddress ? { sellerWalletAddress: user.walletAddress } : {}) })) setForm(initialForm);
  }

  return (
    <section className="page-content form-page">
      <div className="page-heading"><div><div className="form-kicker">MAKE IT OFFICIAL</div><h1>Create a new deal</h1><p>Agree on the details. We’ll take care of the safe part.</p></div></div>
      {!demoMode && !user.walletAddress ? (
        <div className="form-card wallet-required"><div className="wallet-required-icon">◇</div><h2>One quick step before you start</h2><p>Link and verify your seller wallet first. This makes sure the agreed funds go to you when the deal is complete.</p><button className="button button-primary" onClick={onWallet} disabled={busy}>{busy ? "Connecting…" : "Connect & verify wallet"} <span>↗</span></button></div>
      ) : (
        <form className="form-card create-form" onSubmit={submit}>
          <div className="form-card-heading"><span className="step-number">01</span><div><h2>The agreement</h2><p>Give your buyer the details they need to feel confident.</p></div></div>
          <div className="form-grid">
            <label className="field-full">Deal title<input required maxLength={120} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Handmade walnut desk" /></label>
            <label className="field-full">What’s included?<textarea required maxLength={5000} rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the item or service, its condition, and what you’ve agreed on." /></label>
            <label>Deal amount <span className="input-suffix">USDC</span><input required type="number" min="0.000001" max="999999999" step="0.000001" value={form.amountUsdc} onChange={(event) => update("amountUsdc", event.target.value)} placeholder="0.00" /></label>
            <label>Delivery method<input maxLength={160} value={form.deliveryMethod} onChange={(event) => update("deliveryMethod", event.target.value)} placeholder="e.g. Insured courier" /></label>
            <label>Buyer email <span className="optional">Optional</span><input type="email" value={form.buyerEmail} onChange={(event) => update("buyerEmail", event.target.value)} placeholder="buyer@example.com" /></label>
            <label>Buyer wallet <span className="optional">Optional</span><input value={form.buyerWalletAddress} onChange={(event) => update("buyerWalletAddress", event.target.value)} placeholder="0x…" /></label>
            <label>Expected delivery <span className="optional">Optional</span><input type="datetime-local" value={form.expectedDeliveryAt} onChange={(event) => update("expectedDeliveryAt", event.target.value)} /></label>
            <label className="field-full">Special conditions <span className="optional">Optional</span><textarea maxLength={5000} rows={3} value={form.conditions} onChange={(event) => update("conditions", event.target.value)} placeholder="Anything else you want your buyer to know." /></label>
          </div>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <div className="form-note"><span>◈</span> {demoMode ? "Demo only: simulated payments move no money and do not fund escrow." : "Funds will be held securely in Base Sepolia escrow until the buyer confirms."}</div>
          <div className="form-submit"><span>By creating this deal, you agree to the details above.</span><button className="button button-primary" disabled={busy}>{busy ? "Creating deal…" : "Create deal"} <span>↗</span></button></div>
        </form>
      )}
    </section>
  );
}

function PublicDeal({ token, onAuthChange, demoMode }) {
  const [deal, setDeal] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeDescription, setDisputeDescription] = useState("");
  const accessToken = sessionStorage.getItem("roq_token");

  const refresh = useCallback(async () => {
    const result = await api(`/api/deals/public/${token}`);
    setDeal(result.deal);
  }, [token]);

  useEffect(() => {
    let active = true;
    refresh().catch((requestError) => { if (active) setError(requestError.message); });
    if (accessToken) {
      api("/api/auth/me", { token: accessToken })
        .then((result) => { if (active) setUser(result.user); })
        .catch(() => { if (active) sessionStorage.removeItem("roq_token"); });
    }
    return () => { active = false; };
  }, [refresh, accessToken]);

  async function handleFund() {
    if (!window.confirm(demoMode ? "Run the demo payment? This is a simulation; no money will move." : `Continue to payment? Your wallet will approve ${deal.amountUsdc} USDC and fund this deal on Base Sepolia.`)) return;
    setBusy(true);
    setError("");
    setMessage(demoMode ? "Running demo payment simulation…" : "Approve the USDC transfer in your wallet.");
    try {
      if (demoMode) {
        const session = await api(`/api/payments/public/${token}/simulator`, { method: "POST" });
        const result = await api(session.actions.complete, { method: "POST" });
        setMessage(result.message);
        await refresh();
        return;
      }
      const { fundDeal } = await import("./wallet.js");
      await fundDeal(deal, async (hash) => {
        setMessage("Confirming funding on Base Sepolia…");
        const result = await api(`/api/transactions/public/${token}/funding/verify`, { method: "POST", body: { transactionHash: hash } });
        setMessage(`Funding verified with ${result.confirmations} confirmations.`);
        await refresh();
      });
    } catch (requestError) {
      setError(requestError.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!window.confirm(deal.simulated ? "Complete the demo release? No funds will be transferred." : "Only release funds if you have received the agreed delivery. This action sends the secured funds to the seller and cannot be undone.")) return;
    setBusy(true);
    setError("");
    setMessage(deal.simulated ? "Completing demo release…" : "Confirm the release in your wallet.");
    try {
      if (deal.simulated) {
        const result = await api(`/api/payments/public/${token}/simulator/release`, { method: "POST" });
        setMessage(result.message);
        await refresh();
        return;
      }
      const { releaseDeal } = await import("./wallet.js");
      await releaseDeal(deal, async (hash) => {
        setMessage("Confirming release on Base Sepolia…");
        const result = await api(`/api/transactions/public/${token}/release/verify`, { method: "POST", body: { transactionHash: hash } });
        setMessage(`Release verified with ${result.confirmations} confirmations.`);
        await refresh();
      });
    } catch (requestError) {
      setError(requestError.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function handleWallet() {
    setError("");
    try {
      const { connectWallet } = await import("./wallet.js");
      setWallet(await connectWallet());
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDispute(event) {
    event.preventDefault();
    if (!accessToken || !user) {
      onAuthChange();
      return;
    }
    if (disputeDescription.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    if (!window.confirm("Raise a dispute for this deal? Your wallet will submit the request, and the authorised dispute process will determine the outcome.")) return;
    setBusy(true);
    setError("");
    setMessage("Preparing dispute…");
    try {
      const { connectWallet, raiseDealDispute, verifyWallet } = await import("./wallet.js");
      const currentAddress = await connectWallet();
      if (!user.walletAddress || user.walletAddress.toLowerCase() !== currentAddress.toLowerCase()) {
        const verified = await verifyWallet((path, options) => api(path, { ...options, token: accessToken }));
        setUser(verified.user);
      }
      await raiseDealDispute(deal, disputeDescription.trim(), async (transactionHash, description) => {
        setMessage("Confirming the dispute on Base Sepolia…");
        const result = await api(`/api/transactions/public/${token}/disputes/verify`, {
          token: accessToken,
          method: "POST",
          body: { transactionHash, description },
        });
        setMessage(`Dispute submitted and verified${result.confirmations ? ` with ${result.confirmations} confirmations` : ""}.`);
        setShowDispute(false);
        setDisputeDescription("");
        await refresh();
      });
    } catch (requestError) {
      setError(requestError.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!deal || busy) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh().catch((requestError) => setError(requestError.message));
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [deal?.status, busy, refresh]);

  return (
    <main className="public-page">
      <header className="public-header"><Brand /><div className="public-header-right"><span className="public-network"><i /> BASE SEPOLIA</span>{user ? <span className="public-user">{user.displayName}</span> : <button className="text-button" onClick={onAuthChange}>Sign in <span>↗</span></button>}</div></header>
      {error && !deal ? <div className="public-error"><div className="empty-mark">!</div><h1>We couldn’t find this deal</h1><p>{error}</p><a className="button button-primary" href="/">Go to RoqLock</a></div> : deal && (
        <div className="public-layout">
          <section className="public-main">
            <div className="public-overline"><span className="eyebrow-dot" /> {deal.simulated ? "ROQLOCK DEMO · SIMULATED PAYMENT" : "A ROQLOCK PROTECTED DEAL"}</div>
            <div className="public-review">Review your deal</div>
            {deal.seller?.displayName && <div className="public-seller">You’re making this deal with <strong>{deal.seller.displayName}</strong></div>}
            <div className="public-reference">{deal.reference}</div>
            <h1>{deal.title}</h1>
            <div className="public-status"><StatusBadge status={deal.status} simulated={deal.simulated} /><span>Created {formatDate(deal.createdAt)}</span></div>
            <div className="public-amount-card"><span>AGREED AMOUNT</span><strong>${Number(deal.amountUsdc).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}<small> USDC</small></strong><div><span className="amount-shield">◈</span> {deal.simulated ? "Demo amount · no funds held" : "Held securely in smart-contract escrow"}</div></div>
            <div className="public-section"><div className="public-section-title"><span>01</span><h2>What’s the deal?</h2></div><p className="public-description">{deal.description}</p></div>
            <div className="public-details">
              {deal.seller?.displayName && <Detail label="SELLER" value={deal.seller.displayName} />}
              {deal.deliveryMethod && <Detail label="DELIVERY" value={deal.deliveryMethod} />}
              {deal.expectedDeliveryAt && <Detail label="EXPECTED BY" value={formatDate(deal.expectedDeliveryAt)} />}
              {deal.conditions && <Detail label="SPECIAL CONDITIONS" value={deal.conditions} />}
              {deal.deliveryUpdates?.[0] && <Detail label="LATEST DELIVERY UPDATE" value={[deal.deliveryUpdates[0].method, deal.deliveryUpdates[0].trackingRef, deal.deliveryUpdates[0].note].filter(Boolean).join(" · ")} />}
            </div>
            {!deal.simulated && <div className="public-protection">
              <h2>How your payment is protected</h2>
              <div><span>1</span><p><strong>Payment is verified.</strong> We check the transaction before showing funds as secured.</p></div>
              <div><span>2</span><p><strong>Funds are secured.</strong> Your payment is held for this deal, not sent straight to the seller.</p></div>
              <div><span>3</span><p><strong>Funds are released.</strong> Confirm delivery when everything matches the agreement.</p></div>
            </div>}
            <div className="public-security"><span>◈</span><p><strong>{deal.simulated ? "Demo simulation" : "Your money stays yours."}</strong> {deal.simulated ? "Roqqu is unavailable for this demo. The steps below only simulate checkout and release; no payment was processed and no funds are held." : "RoqLock does not hold funds. Payment and release happen from your wallet through Base Sepolia escrow. This page never shows funds as secured until the backend verifies the on-chain transaction."}</p></div>
          </section>
          <aside className="public-side">
            <div className="steps-card"><div className="side-card-kicker">HOW IT WORKS</div>
              <Step number="01" title="Buyer funds escrow" text="Funds are held by the smart contract." done={deal.status !== "CREATED"} active={deal.status === "CREATED"} />
              <Step number="02" title="Seller ships the deal" text="The seller shares delivery details." done={["SHIPPED", "COMPLETED"].includes(deal.status)} active={deal.status === "SHIPPED"} />
              <Step number="03" title="Buyer releases funds" text="Payment goes directly to the seller." done={deal.status === "COMPLETED"} active={deal.status === "COMPLETED"} last />
            </div>
            <div className="action-card">
              {deal.status === "CREATED" && <><div className="action-card-icon">↗</div><h2>{deal.simulated ? "Try the demo payment" : "Ready to continue to payment?"}</h2><p>{deal.simulated ? "This simulates a successful Roqqu checkout so you can see the deal flow. No money moves." : "Pay with USDC on Base Sepolia. Your wallet will approve the exact amount, then fund this deal. You’ll need testnet USDC and a little Base Sepolia ETH for gas."}</p><div className="payment-network"><span>{deal.simulated ? "Mode" : "Asset"}</span><strong>{deal.simulated ? "DEMO · NO REAL PAYMENT" : "USDC · Base Sepolia"}</strong></div><button className="button button-primary button-wide" onClick={handleFund} disabled={busy}>{busy ? "Running demo…" : deal.simulated ? "Simulate payment" : "Continue to payment"} <span>↗</span></button>{!deal.simulated && <button className="button button-quiet button-wide" onClick={handleWallet} disabled={busy}>{wallet ? shorten(wallet) : "Connect wallet first"}</button>}</>}
              {deal.status === "SHIPPED" && <><div className="action-card-icon">✓</div><h2>{deal.simulated ? "Complete the demo" : "Did everything arrive okay?"}</h2><p>{deal.simulated ? "Finish the simulated buyer release. No funds will be transferred." : "Release funds only if you’re happy with the delivery. Funds will go directly to the seller."}</p><button className="button button-primary button-wide" onClick={handleRelease} disabled={busy}>{busy ? "Completing…" : deal.simulated ? "Simulate release" : "Confirm delivery & release funds"} <span>↗</span></button></>}
              {deal.status !== "CREATED" && deal.status !== "SHIPPED" && <><div className="action-card-icon">◈</div><h2>{deal.simulated ? `Demo · ${statusNames[deal.status] || deal.status}` : statusNames[deal.status] || "Deal update"}</h2><p>{deal.simulated ? "This is a simulated status for demonstration. No payment was processed and no escrow funds are held." : deal.status === "FUNDS_SECURED" ? "Payment verified. Funds are secured while the seller prepares delivery." : deal.status === "COMPLETED" ? "This deal is complete. Thanks for using RoqLock." : deal.status === "DISPUTED" ? "A dispute is recorded. The authorised dispute process determines the outcome." : "The deal status has been updated. Check back for the latest details."}</p><button className="button button-quiet button-wide" onClick={() => refresh().catch((requestError) => setError(requestError.message))}>↻ Refresh status</button></>}
              {["FUNDS_SECURED", "SHIPPED"].includes(deal.status) && deal.status !== "DISPUTED" && <button className="text-button dispute-link" onClick={() => user ? setShowDispute((shown) => !shown) : onAuthChange()} disabled={busy}>Something went wrong? Raise a dispute</button>}
              {showDispute && !deal.simulated && <form className="dispute-form" onSubmit={handleDispute}><label>What went wrong?<textarea rows={4} minLength={10} maxLength={5000} required value={disputeDescription} onChange={(event) => setDisputeDescription(event.target.value)} placeholder="Describe the issue in at least 10 characters." /></label><p>Your wallet must belong to a buyer or seller on this deal. The contract and authorised process determine the outcome.</p><button className="button button-primary button-wide" disabled={busy}>{busy ? "Submitting dispute…" : "Submit dispute"} <span>↗</span></button></form>}
              {message && <div className="notice notice-success" role="status">{message}</div>}
              {error && deal && <div className="notice notice-error" role="alert">{error}</div>}
              <div className="testnet-note">{deal.simulated ? "DEMO SIMULATION" : "TESTNET ONLY"} <span>{deal.simulated ? "No payment processed" : "Base Sepolia · No real funds"}</span></div>
            </div>
            <div className="help-note">Questions about this deal? Reach out to the seller directly.</div>
          </aside>
        </div>
      )}
      <footer className="public-footer"><span>© RoqLock</span><span>Built for better deals · Powered by Base Sepolia</span></footer>
    </main>
  );
}

function Detail({ label, value }) {
  return <div className="detail-item"><span>{label}</span><p>{value}</p></div>;
}

function Step({ number, title, text, done, active, last }) {
  return <div className={`step-row ${active ? "step-active" : ""} ${done ? "step-done" : ""}`}><div className="step-rail"><span>{done ? "✓" : number}</span>{!last && <i />}</div><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function ShareModal({ link, onClose, onCopied }) {
  if (!link) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="modal-icon">↗</div><div className="form-kicker">DEAL LINK READY</div><h2 id="share-title">Your deal is ready!</h2><p>Share this private link with your buyer so they can review the agreement and continue to payment.</p>
        <div className="copy-field"><input readOnly value={link} aria-label="Deal share link" /><button onClick={onCopied}>Copy</button></div>
        <div className="share-actions">
          <a className="button button-light" href={`https://wa.me/?text=${encodeURIComponent(`Review our RoqLock deal: ${link}`)}`} target="_blank" rel="noreferrer">Share via WhatsApp ↗</a>
          <a className="button button-quiet" href={link} target="_blank" rel="noreferrer">View deal ↗</a>
        </div>
        <div className="share-warning"><span>!</span> Anyone with this link can view the deal and submit on-chain actions.</div>
      </div>
    </div>
  );
}

function DealDetailsModal({ deal, onClose }) {
  if (!deal) return null;
  const history = deal.statusHistory?.length
    ? deal.statusHistory
    : [{ toStatus: "CREATED", createdAt: deal.createdAt }, ...(deal.status !== "CREATED" ? [{ toStatus: deal.status, createdAt: deal.updatedAt }] : [])];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="share-modal details-modal" role="dialog" aria-modal="true" aria-labelledby="details-title">
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="form-kicker">TRANSACTION DETAILS · {deal.reference}</div>
        <h2 id="details-title">{deal.title}</h2>
        <div className="detail-summary"><strong>${Number(deal.amountUsdc).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC</strong><StatusBadge status={deal.status} simulated={deal.simulated} /></div>
        <p className="details-description">{deal.description}</p>
        <div className="detail-modal-fields">
          {deal.buyerEmail && <Detail label="BUYER" value={deal.buyerEmail} />}
          {deal.deliveryMethod && <Detail label="DELIVERY" value={deal.deliveryMethod} />}
          {deal.expectedDeliveryAt && <Detail label="EXPECTED DELIVERY" value={formatDate(deal.expectedDeliveryAt)} />}
          {deal.conditions && <Detail label="AGREED CONDITIONS" value={deal.conditions} />}
          {deal.deliveryUpdates?.map((update) => (
            <Detail key={update.id} label={`DELIVERY UPDATE · ${formatDate(update.createdAt)}`} value={[update.method, update.trackingRef, update.note].filter(Boolean).join(" · ") || "Shipment information added"} />
          ))}
        </div>
        <div className="timeline-list">
          <span className="card-kicker">TRANSACTION TIMELINE</span>
          {history.map((item, index) => <div className="timeline-entry" key={`${item.toStatus}-${item.createdAt || index}`}><span>✓</span><div><strong>{statusNames[item.toStatus] || item.toStatus}</strong><small>{formatDate(item.createdAt)}{item.reason ? ` · ${item.reason}` : ""}</small></div></div>)}
        </div>
        {deal.dispute && <div className="notice notice-error">Dispute submitted: {deal.dispute.description}</div>}
      </div>
    </div>
  );
}

function ShippingModal({ deal, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ trackingRef: "", method: deal?.deliveryMethod || "", note: "" });
  if (!deal) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="share-modal shipping-modal" role="dialog" aria-modal="true" aria-labelledby="shipping-title" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="form-kicker">DELIVERY UPDATE · {deal.reference}</div><h2 id="shipping-title">Mark this deal as shipped</h2><p>Share delivery details with your buyer. The buyer can review them before releasing funds.</p>
        <div className="modal-form-fields">
          <label>Tracking reference <span className="optional">Optional</span><input maxLength={160} value={form.trackingRef} onChange={(event) => setForm({ ...form, trackingRef: event.target.value })} placeholder="Tracking number or link" /></label>
          <label>Delivery method <span className="optional">Optional</span><input maxLength={160} value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} placeholder="Courier, collection, etc." /></label>
          <label>Note for the buyer <span className="optional">Optional</span><textarea rows={3} maxLength={1000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add a short delivery update." /></label>
        </div>
        <button className="button button-primary button-wide" disabled={busy}>{busy ? "Saving delivery update…" : "Mark as shipped"} <span>↗</span></button>
      </form>
    </div>
  );
}

function Toast({ notice, onDismiss }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);
  if (!notice) return null;
  return <div className={`toast toast-${notice.type}`} role="status"><span>{notice.type === "error" ? "!" : "✓"}</span>{notice.text}<button onClick={onDismiss} aria-label="Dismiss">×</button></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem("roq_token"));
  const [deals, setDeals] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [active, setActive] = useState("overview");
  const [authMode, setAuthMode] = useState("register");
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [detailDeal, setDetailDeal] = useState(null);
  const [shippingDeal, setShippingDeal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const publicToken = path.match(/^\/deal\/([a-f0-9]{64})\/?$/i)?.[1];
  const setAuthenticated = useCallback((result) => {
    sessionStorage.setItem("roq_token", result.token);
    setToken(result.token);
    setUser(result.user);
    setActive("overview");
    setShowAuth(false);
    const returnTo = sessionStorage.getItem("roq_return_to");
    if (returnTo?.startsWith("/deal/")) {
      sessionStorage.removeItem("roq_return_to");
      window.history.pushState({}, "", returnTo);
      setPath(returnTo);
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!token || !user) return;
    const dealPath = user.role === "SELLER" ? "/api/deals" : "/api/deals/buyer";
    const [dealResult, notificationResult, disputeResult] = await Promise.all([
      api(dealPath, { token }),
      api("/api/notifications", { token }),
      api("/api/disputes", { token }),
    ]);
    setDeals(dealResult.deals || []);
    setNotifications(notificationResult.notifications || []);
    setDisputes(disputeResult.disputes || []);
  }, [token, user]);

  useEffect(() => {
    if (!token) return undefined;
    let activeEffect = true;
    api("/api/auth/me", { token })
      .then(async (result) => {
        if (!activeEffect) return;
        setUser(result.user);
        const dealPath = result.user.role === "SELLER" ? "/api/deals" : "/api/deals/buyer";
        const [dealResult, notificationResult, disputeResult] = await Promise.all([
          api(dealPath, { token }),
          api("/api/notifications", { token }),
          api("/api/disputes", { token }),
        ]);
        if (activeEffect) {
          setDeals(dealResult.deals || []);
          setNotifications(notificationResult.notifications || []);
          setDisputes(disputeResult.disputes || []);
        }
      })
      .catch((requestError) => {
        if (!activeEffect) return;
        sessionStorage.removeItem("roq_token");
        setToken(null);
        setUser(null);
        setShowAuth(false);
        setNotice({ type: "error", text: requestError.message });
      });
    return () => { activeEffect = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !user) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshData().catch((requestError) => setNotice({ type: "error", text: requestError.message }));
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [token, user, refreshData]);

  function signOut() {
    sessionStorage.removeItem("roq_token");
    setToken(null);
    setUser(null);
    setDeals([]);
    setDisputes([]);
    setActive("overview");
    setShowAuth(false);
    window.history.pushState({}, "", "/");
    setPath("/");
  }

  function navigate(page) {
    setError("");
    setActive(page);
  }

  async function handleCreate(body) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/deals", { token, method: "POST", body });
      await refreshData();
      setShareLink(publicDealUrl(result.publicUrl));
      setActive("deals");
      setNotice({ type: "success", text: "Deal created. Copy your private link to share it." });
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleWallet() {
    setBusy(true);
    try {
      const { verifyWallet } = await import("./wallet.js");
      const result = await verifyWallet((path, options) => api(path, { ...options, token }));
      setUser(result.user);
      setNotice({ type: "success", text: "Your wallet is connected and verified." });
      await refreshData();
    } catch (requestError) {
      setNotice({ type: "error", text: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(deal) {
    setBusy(true);
    try {
      const result = await api(`/api/deals/${deal.id}/share-link`, { token, method: "POST" });
      setShareLink(publicDealUrl(result.publicUrl));
    } catch (requestError) {
      setNotice({ type: "error", text: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleShipping(deal) {
    setShippingDeal(deal);
  }

  async function submitShipping(update) {
    if (!shippingDeal) return;
    setBusy(true);
    try {
      await api(`/api/deals/${shippingDeal.id}/shipping`, { token, method: "POST", body: update });
      await refreshData();
      setShippingDeal(null);
      setNotice({ type: "success", text: "Deal marked as shipped." });
    } catch (requestError) {
      setNotice({ type: "error", text: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleView(deal) {
    if (user.role !== "SELLER") {
      setDetailDeal(deal);
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/api/deals/${deal.id}`, { token });
      setDetailDeal(result.deal);
    } catch (requestError) {
      setNotice({ type: "error", text: requestError.message });
    } finally {
      setBusy(false);
    }
  }

  async function readNotification(notification) {
    if (!notification.readAt) {
      try {
        await api(`/api/notifications/${notification.id}/read`, { token, method: "PATCH" });
        await refreshData();
      } catch (requestError) {
        setNotice({ type: "error", text: requestError.message });
      }
    }
  }

  function openAuth(mode) {
    if (DEMO_MODE) {
      const demoUser = {
        id: "roq-demo-seller",
        email: "demo@roqlock.local",
        displayName: "Demo Seller",
        role: "SELLER",
        walletAddress: null,
      };
      sessionStorage.setItem("roq_token", "demo-session");
      setToken("demo-session");
      setUser(demoUser);
      setActive("create");
      setShowAuth(false);
      return;
    }
    setAuthMode(mode);
    setShowAuth(true);
  }

  const dismissNotice = useCallback(() => setNotice(null), []);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  if (publicToken) return <><PublicDeal key={publicToken} token={publicToken} demoMode={DEMO_MODE} onAuthChange={() => { sessionStorage.setItem("roq_return_to", window.location.pathname); window.history.pushState({}, "", "/"); setPath("/"); openAuth("login"); }} /><Toast notice={notice} onDismiss={dismissNotice} /></>;
  if (token && !user) return <main className="app-loading" role="status">Loading your RoqLock workspace…</main>;
  if (!token || !user) {
    return <>{showAuth
      ? <AuthScreen key={authMode} initialMode={authMode} onAuthenticated={setAuthenticated} />
      : <LandingPage onGetStarted={() => openAuth("register")} onSignIn={() => openAuth("login")} />}
    <Toast notice={notice} onDismiss={dismissNotice} /></>;
  }

  return (
    <>
      <AppShell user={user} onSignOut={signOut} active={active} onNavigate={navigate} unreadCount={unreadCount} notifications={notifications} onReadNotice={readNotification}>
        {active === "create"
          ? <CreateDeal user={user} onCreate={handleCreate} busy={busy} error={error} onWallet={handleWallet} demoMode={DEMO_MODE} />
          : active === "deals"
            ? <DealsPage user={user} deals={deals} onRefresh={() => refreshData().catch((requestError) => setNotice({ type: "error", text: requestError.message }))} onShare={handleShare} onShipping={handleShipping} onView={handleView} busy={busy} onNavigate={navigate} />
            : active === "disputes"
              ? <DisputesPage disputes={disputes} onRefresh={() => refreshData().catch((requestError) => setNotice({ type: "error", text: requestError.message }))} busy={busy} />
              : <Overview user={user} deals={deals} onNavigate={navigate} onRefresh={() => refreshData().catch((requestError) => setNotice({ type: "error", text: requestError.message }))} onShare={handleShare} onShipping={handleShipping} onWallet={handleWallet} onView={handleView} busy={busy} demoMode={DEMO_MODE} />}
      </AppShell>
      <ShareModal link={shareLink} onClose={() => setShareLink("")} onCopied={async () => {
        try {
          await navigator.clipboard.writeText(shareLink);
          setNotice({ type: "success", text: "Private deal link copied." });
        } catch {
          setNotice({ type: "error", text: "Could not copy the link. Select and copy it manually." });
        }
      }} />
      <DealDetailsModal deal={detailDeal} onClose={() => setDetailDeal(null)} />
      <ShippingModal deal={shippingDeal} busy={busy} onClose={() => setShippingDeal(null)} onSubmit={submitShipping} />
      <Toast notice={notice} onDismiss={dismissNotice} />
    </>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shorten(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
}

export default App;
