import { useState, useEffect } from "react";
import { api } from "../lib/api";

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
const photoUrl = (fileId) => `/api?action=file&id=${encodeURIComponent(fileId)}`;

export default function PurchaseInvoicesPage({ staffName, role }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await api.getPurchaseInvoices();
      setInvoices(res?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load purchase invoices.");
    } finally {
      setLoading(false);
    }
  }

  const linkLabel = (inv) => {
    if (inv.workOrderId) return `Work Order ${inv.workOrderRefNo || ""} (${inv.workOrderPlate || "—"})`;
    if (inv.customerJobId) return `Customer Job ${inv.customerJobRefNo || ""} (${inv.customerJobCustomerName || inv.customerJobPlate || "—"})`;
    return null;
  };

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
        Every confirmed invoice scan — supplier, items, and what it updated in Inventory.
      </p>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : invoices.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", textAlign: "center", padding: "2rem 0" }}>
          No invoices scanned yet — try "Scan Invoice" under Garage → Inventory.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {invoices.map(inv => (
            <div key={inv.id} onClick={() => setSelected(inv)} style={{
              border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer",
              background: "var(--surface)", boxShadow: "var(--shadow-sm)",
            }}>
              {inv.photoFileId && (
                <img src={photoUrl(inv.photoFileId)} alt="Invoice" style={{ width: "100%", height: 120, objectFit: "cover", borderBottom: "1px solid var(--border-light)" }} />
              )}
              <div style={{ padding: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{inv.supplierName || "Unknown supplier"}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0" }}>{inv.invoiceDate || fmtDateTime(inv.createdAt)}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--sc-blue)", margin: "6px 0 0" }}>TZS {fmtMoney(inv.totalAmount)}</p>
                {linkLabel(inv) && (
                  <p style={{ fontSize: 10.5, color: "var(--green)", margin: "4px 0 0", fontWeight: 600 }}>🔗 {linkLabel(inv)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <InvoiceDetailModal invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.getPurchaseInvoiceItems(invoice.id).then(res => setItems(res?.data || [])).catch(() => setItems([]));
  }, [invoice.id]);

  const linkLabel = invoice.workOrderId
    ? `Work Order ${invoice.workOrderRefNo || ""} — ${invoice.workOrderPlate || "—"}`
    : invoice.customerJobId
    ? `Customer Job ${invoice.customerJobRefNo || ""} — ${invoice.customerJobCustomerName || invoice.customerJobPlate || "—"}`
    : null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{invoice.supplierName || "Unknown supplier"}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {invoice.photoFileId && (
            <img src={photoUrl(invoice.photoFileId)} alt="Invoice" style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 }} />
          )}

          {[
            ["Invoice Date", invoice.invoiceDate || "—"],
            ["Total Amount", `TZS ${fmtMoney(invoice.totalAmount)}`],
            ["Scanned By", invoice.scannedBy || "—"],
            ["Scanned On", fmtDateTime(invoice.createdAt)],
            ...(linkLabel ? [["Linked To", linkLabel]] : []),
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span>
            </div>
          ))}

          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "14px 0 8px" }}>
            Items
          </p>
          {items === null ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No items recorded.</p>
          ) : (
            <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
              {items.map(it => (
                <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12.5 }}>
                  <span>{it.itemName}{it.partId && <span title="Linked to a Part" style={{ marginLeft: 5, fontSize: 10, color: "var(--sc-blue)" }}>📦</span>}</span>
                  <span style={{ color: "var(--text-muted)" }}>{it.quantity} × TZS {fmtMoney(it.unitPrice)}</span>
                  <span style={{ fontWeight: 700 }}>TZS {fmtMoney(it.lineTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "var(--surface)", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "var(--shadow-lg)" },
  mHead:    { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  mTitle:   { fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 },
  closeBtn: { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  mBody:    { padding: "1.25rem" },
};
