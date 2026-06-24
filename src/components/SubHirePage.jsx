// src/pages/SubHirePage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { exportToExcel } from "../lib/exportExcel";

const FUEL_LEVELS      = ["Full", "3/4", "1/2", "1/4", "Empty"];
const CURRENCIES       = ["TZS", "USD", "EUR"];
const PAYMENT_STATUSES = ["Paid", "Partial Paid", "Unpaid", "Long Term"];

function fmtDate(val) {
  if (!val) return "—";
  const d = String(val).split("T")[0];
  if (!d || d.length < 10) return val;
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}
function fmtNum(val) {
  if (!val) return "";
  const n = Number(String(val).replace(/,/g, ""));
  return isNaN(n) ? val : n.toLocaleString("en-US");
}
function fmtMoney(val, cur) {
  if (!val) return "—";
  return `${cur || "TZS"} ${fmtNum(val)}`;
}
function unformat(v) { return String(v || "").replace(/,/g, ""); }
function fmtInput(raw) {
  const d = String(raw).replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("en-US") : "";
}

const STATUS_STYLE = {
  Active:   { bg: "#fef9c3", color: "#854d0e" },
  Returned: { bg: "#dcfce7", color: "#15803d" },
};
const PAY_STYLE = {
  Paid:           { bg: "#dcfce7", color: "#15803d" },
  "Partial Paid": { bg: "#fef3c7", color: "#92400e" },
  Unpaid:         { bg: "#fee2e2", color: "#b91c1c" },
  "Long Term":    { bg: "#ede9fe", color: "#6d28d9" },
};

function MoneyInput({ value, onChange, placeholder, style }) {
  return (
    <input style={style} type="text" inputMode="numeric" value={value}
      placeholder={placeholder}
      onChange={e => onChange(fmtInput(e.target.value))} />
  );
}

function FineInput({ value, onChange, label }) {
  return (
    <div>
      <label style={styles.label}>{label} <span style={{ color: "#aaa", fontWeight: 400 }}>(TZS)</span></label>
      <MoneyInput style={styles.input} value={value} onChange={onChange} placeholder="0" />
    </div>
  );
}

// ── Add Modal ─────────────────────────────────────────────────
function AddModal({ locations, staffName, onConfirm, onClose, loading }) {
  const today = new Date().toISOString().split("T")[0];
  const [supplierName,      setSupplierName]      = useState("");
  const [supplierContact,   setSupplierContact]   = useState("");
  const [vehicleDesc,       setVehicleDesc]       = useState("");
  const [client,            setClient]            = useState("");
  const [clientPhone,       setClientPhone]       = useState("");
  const [bookedFrom,        setBookedFrom]        = useState(today);
  const [returnDate,        setReturnDate]        = useState("");
  const [location,          setLocation]          = useState("");
  const [newLoc,            setNewLoc]            = useState("");
  const [addingLoc,         setAddingLoc]         = useState(false);
  const [fuelOut,           setFuelOut]           = useState("");
  const [amount,            setAmount]            = useState("");
  const [currency,          setCurrency]          = useState("TZS");
  const [paymentStatus,     setPaymentStatus]     = useState("Unpaid");
  const [amountPaid,        setAmountPaid]        = useState("");
  const [supplierAmount,    setSupplierAmount]    = useState("");
  const [supplierCurrency,  setSupplierCurrency]  = useState("TZS");
  const [supplierPayStatus, setSupplierPayStatus] = useState("Unpaid");
  const [supplierAmountPaid,setSupplierAmountPaid]= useState("");
  const [policeFine,        setPoliceFine]        = useState("");
  const [parkingFine,       setParkingFine]       = useState("");
  const [remarks,           setRemarks]           = useState("");
  const [err,               setErr]               = useState("");

  const handleSubmit = () => {
    setErr("");
    if (!supplierName.trim()) { setErr("Supplier name is required."); return; }
    if (!client.trim())       { setErr("Client name is required."); return; }
    if (!bookedFrom)          { setErr("Booked from date is required."); return; }
    if (!returnDate)          { setErr("Return date is required."); return; }
    if ((paymentStatus === "Paid" || paymentStatus === "Partial Paid") && !amountPaid) {
      setErr("Please enter amount paid."); return;
    }
    const loc = addingLoc ? newLoc.trim() : location;
    onConfirm({
      supplierName, supplierContact, vehicleDesc, client, clientPhone,
      bookedFrom, returnDate, location: loc,
      fuelOut, amount: unformat(amount), currency,
      paymentStatus, amountPaid: unformat(amountPaid),
      supplierAmount: unformat(supplierAmount), supplierCurrency,
      supplierPayStatus, supplierAmountPaid: unformat(supplierAmountPaid),
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      remarks, staffName,
      newLocation: addingLoc ? loc : null,
    });
  };

  return (
    <div style={mStyles.overlay} onClick={onClose}>
      <div style={mStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={mStyles.header}>
          <p style={mStyles.title}>New Sub-Hire Booking</p>
          <button style={mStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={mStyles.body}>
          <div style={styles.label2}>Staff: <strong>{staffName}</strong></div>

          <p style={mStyles.section}>Supplier Details</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Supplier Name *</label>
              <input style={styles.input} value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Company or person" autoFocus /></div>
            <div><label style={styles.label}>Supplier Contact</label>
              <input style={styles.input} value={supplierContact} onChange={e => setSupplierContact(e.target.value)} placeholder="+255..." /></div>
          </div>
          <div><label style={styles.label}>Vehicle Description</label>
            <input style={styles.input} value={vehicleDesc} onChange={e => setVehicleDesc(e.target.value)} placeholder="e.g. Toyota Prado White / T 123 ABC" /></div>

          <p style={mStyles.section}>Client Details</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Client Name *</label>
              <input style={styles.input} value={client} onChange={e => setClient(e.target.value)} placeholder="Full name" /></div>
            <div><label style={styles.label}>Client Phone</label>
              <input style={styles.input} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+255..." /></div>
          </div>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Booked From *</label>
              <input style={styles.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} /></div>
            <div><label style={styles.label}>Return Date *</label>
              <input style={styles.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
          </div>
          <div style={styles.threeCol}>
            <div><label style={styles.label}>Location</label>
              {!addingLoc ? (
                <select style={styles.input} value={location} onChange={e => { if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value); }}>
                  <option value="">— Select —</option>
                  {locations.map(l => <option key={l}>{l}</option>)}
                  <option value="__new__">+ Add new</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...styles.input, flex: 1 }} value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="New location" autoFocus />
                  <button style={styles.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
                </div>
              )}
            </div>
            <div><label style={styles.label}>Fuel Out</label>
              <select style={styles.input} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                <option value="">— Select —</option>
                {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
              </select></div>
            <div></div>
          </div>

          <p style={mStyles.section}>Client Payment</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Amount Charged</label>
              <div style={{ display: "flex", gap: 6 }}>
                <MoneyInput style={{ ...styles.input, flex: 1 }} value={amount} onChange={setAmount} placeholder="0" />
                <select style={{ ...styles.input, width: 76 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div></div>
            <div><label style={styles.label}>Payment Status</label>
              <select style={styles.input} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
              </select>
              {(paymentStatus === "Paid" || paymentStatus === "Partial Paid") && (
                <MoneyInput style={{ ...styles.input, marginTop: 6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
              )}</div>
          </div>

          <p style={mStyles.section}>Supplier Payment</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Supplier Amount</label>
              <div style={{ display: "flex", gap: 6 }}>
                <MoneyInput style={{ ...styles.input, flex: 1 }} value={supplierAmount} onChange={setSupplierAmount} placeholder="0" />
                <select style={{ ...styles.input, width: 76 }} value={supplierCurrency} onChange={e => setSupplierCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div></div>
            <div><label style={styles.label}>Supplier Payment Status</label>
              <select style={styles.input} value={supplierPayStatus} onChange={e => setSupplierPayStatus(e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
              </select>
              {(supplierPayStatus === "Paid" || supplierPayStatus === "Partial Paid") && (
                <MoneyInput style={{ ...styles.input, marginTop: 6 }} value={supplierAmountPaid} onChange={setSupplierAmountPaid} placeholder="Amount paid to supplier" />
              )}</div>
          </div>

          <p style={mStyles.section}>Fines</p>
          <div style={styles.twoCol}>
            <FineInput label="Police Fine" value={policeFine} onChange={setPoliceFine} />
            <FineInput label="Parking Fine" value={parkingFine} onChange={setParkingFine} />
          </div>

          <div style={{ marginTop: "0.85rem" }}>
            <label style={styles.label}>Remarks / Notes</label>
            <textarea style={styles.textarea} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>

          {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "6px 0" }}>{err}</p>}
          <button style={{ ...styles.confirmBtn, opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Create Sub-Hire Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Return Modal ──────────────────────────────────────────────
function ReturnModal({ booking, onConfirm, onClose, loading }) {
  const today = new Date().toISOString().split("T")[0];
  const [actualReturn,       setActualReturn]       = useState(today);
  const [fuelIn,             setFuelIn]             = useState("");
  const [paymentStatus,      setPaymentStatus]      = useState(booking.paymentStatus || "Unpaid");
  const [amountPaid,         setAmountPaid]         = useState(booking.amountPaid || "");
  const [supplierPayStatus,  setSupplierPayStatus]  = useState(booking.supplierPayStatus || "Unpaid");
  const [supplierAmountPaid, setSupplierAmountPaid] = useState(booking.supplierAmountPaid || "");
  const [policeFine,         setPoliceFine]         = useState("");
  const [parkingFine,        setParkingFine]        = useState("");
  const [remarks,            setRemarks]            = useState("");
  const [err,                setErr]                = useState("");

  const handleSubmit = () => {
    setErr("");
    if (!actualReturn) { setErr("Return date is required."); return; }
    onConfirm({
      id: booking.id, actualReturn, fuelIn,
      paymentStatus, amountPaid: unformat(amountPaid),
      supplierPayStatus, supplierAmountPaid: unformat(supplierAmountPaid),
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      remarks,
    });
  };

  return (
    <div style={mStyles.overlay} onClick={onClose}>
      <div style={{ ...mStyles.modal, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...mStyles.header, background: "#2563eb" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Mark as Returned</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{booking.vehicleDesc || "Sub-hire"} · {booking.client}</p>
          </div>
          <button style={mStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={mStyles.body}>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Returned Date *</label>
              <input style={styles.input} type="date" value={actualReturn} onChange={e => setActualReturn(e.target.value)} /></div>
            <div><label style={styles.label}>Fuel In</label>
              <select style={styles.input} value={fuelIn} onChange={e => setFuelIn(e.target.value)}>
                <option value="">— Select —</option>
                {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
              </select></div>
          </div>
          <p style={mStyles.section}>Client Payment</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Payment Status</label>
              <select style={styles.input} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            {(paymentStatus === "Paid" || paymentStatus === "Partial Paid") && (
              <div><label style={styles.label}>Amount Paid</label>
                <MoneyInput style={styles.input} value={amountPaid} onChange={setAmountPaid} placeholder="0" /></div>
            )}
          </div>
          <p style={mStyles.section}>Supplier Payment</p>
          <div style={styles.twoCol}>
            <div><label style={styles.label}>Supplier Pay Status</label>
              <select style={styles.input} value={supplierPayStatus} onChange={e => setSupplierPayStatus(e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            {(supplierPayStatus === "Paid" || supplierPayStatus === "Partial Paid") && (
              <div><label style={styles.label}>Supplier Amount Paid</label>
                <MoneyInput style={styles.input} value={supplierAmountPaid} onChange={setSupplierAmountPaid} placeholder="0" /></div>
            )}
          </div>
          <p style={mStyles.section}>Fines (on return)</p>
          <div style={styles.twoCol}>
            <FineInput label="Police Fine" value={policeFine} onChange={setPoliceFine} />
            <FineInput label="Parking Fine" value={parkingFine} onChange={setParkingFine} />
          </div>
          <div style={{ marginTop: "0.85rem" }}>
            <label style={styles.label}>Remarks</label>
            <textarea style={styles.textarea} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional" />
          </div>
          {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "6px 0" }}>{err}</p>}
          <button style={{ ...styles.confirmBtn, background: "#2563eb", opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Confirm Return"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function SubHirePage({ staffName }) {
  const [bookings,   setBookings]   = useState([]);
  const [config,     setConfig]     = useState({ locations: [] });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState("");
  const [showAdd,    setShowAdd]    = useState(false);
  const [retModal,   setRetModal]   = useState(null);
  const [search,     setSearch]     = useState("");
  const [fStatus,    setFStatus]    = useState("Active");
  const [page,       setPage]       = useState(1);
  const PER_PAGE = 20;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [b, c] = await Promise.all([api.getSubHire(), api.getConfig()]);
      setBookings(b.data || []);
      setConfig(c);
    } catch (e) {
      setError("Failed to load sub-hire bookings: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const handleAdd = async (fields) => {
    setSaving(true);
    try {
      if (fields.newLocation) await api.addLocation(fields.newLocation);
      await api.addSubHire({ ...fields, staffName });
      setShowAdd(false);
      showToast("✅ Sub-hire booking created");
      await load();
    } catch (e) {
      showToast("❌ Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async (fields) => {
    setSaving(true);
    try {
      await api.returnSubHire({ ...fields, staffName });
      setRetModal(null);
      showToast("✅ Marked as returned");
      await load();
    } catch (e) {
      showToast("❌ Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => ({
    active:   bookings.filter(b => b.status === "Active").length,
    returned: bookings.filter(b => b.status === "Returned").length,
    unpaid:   bookings.filter(b => b.paymentStatus === "Unpaid" || b.paymentStatus === "Partial Paid").length,
  }), [bookings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter(b =>
      (!fStatus || b.status === fStatus) &&
      (!q || b.client.toLowerCase().includes(q) || b.supplierName.toLowerCase().includes(q) ||
             (b.vehicleDesc||"").toLowerCase().includes(q))
    );
  }, [bookings, search, fStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleExport = () => {
    const rows = filtered.map(b => ({
      ID: b.id, Status: b.status, Supplier: b.supplierName, "Supplier Contact": b.supplierContact,
      Vehicle: b.vehicleDesc, Client: b.client, Phone: b.clientPhone,
      "Booked From": fmtDate(b.bookedFrom), "Return Date": fmtDate(b.returnDate),
      "Actual Return": fmtDate(b.actualReturn), Location: b.location,
      "Fuel Out": b.fuelOut, "Fuel In": b.fuelIn,
      Amount: fmtNum(b.amount), Currency: b.currency,
      "Payment Status": b.paymentStatus, "Amount Paid": fmtNum(b.amountPaid),
      "Supplier Amount": fmtNum(b.supplierAmount), "Supplier Currency": b.supplierCurrency,
      "Supplier Pay Status": b.supplierPayStatus, "Supplier Amount Paid": fmtNum(b.supplierAmountPaid),
      "Police Fine": fmtNum(b.policeFine), "Parking Fine": fmtNum(b.parkingFine),
      Remarks: b.remarks, Staff: b.staffName,
    }));
    exportToExcel(`SmilesCars_SubHire_${new Date().toISOString().split("T")[0]}.xlsx`, [{ name: "Sub-Hire", rows }]);
  };

  if (loading) return <div style={styles.center}>Loading sub-hire bookings…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      {toast && <div style={styles.toast}>{toast}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={styles.pageTitle}>Sub-Hire Bookings</h2>
          <p style={styles.pageSubtitle}>Vehicles hired from external suppliers for client jobs</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowAdd(true)}>+ New Sub-Hire</button>
      </div>

      <div style={styles.statsRow}>
        {[
          { label: "Active",   value: stats.active,   color: "#854d0e", bg: "#fef9c3", v: "Active" },
          { label: "Returned", value: stats.returned, color: "#15803d", bg: "#dcfce7", v: "Returned" },
          { label: "Unpaid",   value: stats.unpaid,   color: "#b91c1c", bg: "#fee2e2", v: null },
        ].map(s => (
          <div key={s.label} style={{ ...styles.statCard, background: s.bg, outline: fStatus === s.v ? `2px solid ${s.color}` : "none" }}
            onClick={() => { setFStatus(f => f === s.v ? "" : (s.v || f)); setPage(1); }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="sc-filter-row">
        <input style={styles.search} placeholder="Search client, supplier or vehicle…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={styles.sel} value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Returned">Returned</option>
        </select>
        <span style={styles.countLabel}>{filtered.length} of {bookings.length}</span>
        <button style={styles.exportBtn} onClick={handleExport}>⬇ Export</button>
        <button style={styles.refreshBtn} onClick={load}>↻</button>
      </div>

      <div className="sc-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>{["Status","Supplier","Vehicle","Client","Booked","Return","Fuel Out/In","Client Amount","Supplier Amount","Fines","Staff","Action"].map(h =>
              <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && <tr><td colSpan={12} style={styles.empty}>No sub-hire bookings found.</td></tr>}
            {paginated.map((b, i) => {
              const ss  = STATUS_STYLE[b.status] || STATUS_STYLE.Active;
              const ps  = PAY_STYLE[b.paymentStatus];
              const sps = PAY_STYLE[b.supplierPayStatus];
              return (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: ss.bg, color: ss.color }}>{b.status}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{b.supplierName}</div>
                    {b.supplierContact && <div style={{ fontSize: 11, color: "#888" }}>{b.supplierContact}</div>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{b.vehicleDesc || "—"}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{b.client}</div>
                    {b.clientPhone && <div style={{ fontSize: 11, color: "#888" }}>{b.clientPhone}</div>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{fmtDate(b.bookedFrom)}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>
                    {fmtDate(b.returnDate)}
                    {b.actualReturn && <div style={{ fontSize: 11, color: "#15803d" }}>↩ {fmtDate(b.actualReturn)}</div>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>
                    {b.fuelOut || "—"}{b.fuelIn ? ` → ${b.fuelIn}` : ""}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...(ps || {}) }}>{b.paymentStatus || "—"}</span>
                    {b.amount && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{fmtMoney(b.amount, b.currency)}</div>}
                    {b.amountPaid && <div style={{ fontSize: 11, color: "#15803d" }}>Paid: {fmtMoney(b.amountPaid, b.currency)}</div>}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...(sps || {}) }}>{b.supplierPayStatus || "—"}</span>
                    {b.supplierAmount && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{fmtMoney(b.supplierAmount, b.supplierCurrency)}</div>}
                    {b.supplierAmountPaid && <div style={{ fontSize: 11, color: "#15803d" }}>Paid: {fmtMoney(b.supplierAmountPaid, b.supplierCurrency)}</div>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 11, color: "#dc2626" }}>
                    {b.policeFine ? `Police: ${fmtMoney(b.policeFine, "TZS")}` : ""}
                    {b.policeFine && b.parkingFine ? " · " : ""}
                    {b.parkingFine ? `Parking: ${fmtMoney(b.parkingFine, "TZS")}` : ""}
                    {!b.policeFine && !b.parkingFine ? "—" : ""}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, fontWeight: 500, color: "#374151" }}>{b.staffName}</td>
                  <td style={styles.td}>
                    {b.status === "Active" && (
                      <button style={styles.retBtn} onClick={() => setRetModal(b)}>Mark Returned</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={styles.pager}>
          <button style={styles.pgBtn} onClick={() => setPage(p => p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize: 13, color: "#555" }}>Page {page} of {totalPages}</span>
          <button style={styles.pgBtn} onClick={() => setPage(p => p+1)} disabled={page===totalPages}>Next ›</button>
        </div>
      )}

      {showAdd && (
        <AddModal locations={config.locations} staffName={staffName}
          onConfirm={handleAdd} onClose={() => !saving && setShowAdd(false)} loading={saving} />
      )}
      {retModal && (
        <ReturnModal booking={retModal}
          onConfirm={handleReturn} onClose={() => !saving && setRetModal(null)} loading={saving} />
      )}
    </div>
  );
}

const styles = {
  center:      { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:    { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  toast:       { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 14, zIndex: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },
  pageTitle:   { fontSize: 20, fontWeight: 700, color: "#111", margin: 0 },
  pageSubtitle:{ fontSize: 13, color: "#888", margin: "4px 0 0" },
  addBtn:      { padding: "9px 18px", fontSize: 14, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" },
  statsRow:    { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1rem" },
  statCard:    { borderRadius: 10, padding: "14px 16px", textAlign: "center", cursor: "pointer" },
  filterRow:   { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  search:      { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 260 },
  sel:         { padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", fontFamily: "inherit" },
  countLabel:  { fontSize: 12, color: "#888", marginLeft: "auto" },
  exportBtn:   { padding: "8px 12px", fontSize: 13, border: "1.5px solid #16a34a", borderRadius: 7, background: "#f0fdf4", cursor: "pointer", color: "#15803d", fontWeight: 500 },
  refreshBtn:  { padding: "8px 12px", fontSize: 16, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  tableWrap:   { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:          { padding: "10px 12px", verticalAlign: "middle" },
  badge:       { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99 },
  retBtn:      { fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", cursor: "pointer", fontWeight: 500 },
  empty:       { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
  pager:       { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "1rem 0" },
  pgBtn:       { padding: "7px 16px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer" },
  // Shared form styles
  twoCol:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "0.85rem" },
  threeCol:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: "0.85rem" },
  label:       { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4, fontFamily: "inherit" },
  label2:      { fontSize: 12, color: "#888", marginBottom: "1rem" },
  input:       { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box", fontFamily: "inherit" },
  textarea:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  confirmBtn:  { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer", marginTop: "1rem", fontFamily: "inherit" },
  cancelSmall: { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
};

const mStyles = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "#fff", borderRadius: 14, width: 560, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  header:   { padding: "1rem 1.25rem", background: "#16a34a", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  title:    { fontSize: 17, fontWeight: 700, color: "#fff", margin: 0 },
  closeBtn: { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 14 },
  body:     { padding: "1.25rem" },
  section:  { fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".5px", margin: "1rem 0 8px", borderBottom: "1px solid #f3f4f6", paddingBottom: 4 },
};
