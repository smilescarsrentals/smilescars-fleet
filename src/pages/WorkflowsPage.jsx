import { useState, useEffect } from "react";
import { api } from "../lib/api";

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalStyle = { background: "#fff", borderRadius: 12, padding: 20, maxHeight: "85vh", overflowY: "auto", width: 460 };
const primaryBtnStyle = { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" };
const secondaryBtnStyle = { padding: "8px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" };
const closeBtnStyle = { background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#888" };
const inputStyle = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, color: "#888" };
const cardBtnStyle = { padding: "5px 11px", fontSize: 11.5, fontWeight: 600, border: "1.5px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#333", cursor: "pointer" };

const STATUS_STYLE = {
  "Pending":           { bg: "#fef3c7", fg: "#92400e" },
  "Approved":          { bg: "#dcfce7", fg: "#166534" },
  "Changes Requested": { bg: "#fee2e2", fg: "#991b1b" },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: "#f3f4f6", fg: "#6b7280" };
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{status}</span>;
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// Prefers the PDF-extracted invoice number + client name; falls back to the
// uploader's own note, then a plain "Invoice" label if neither is present.
function invoiceTitle(inv) {
  const parts = [];
  if (inv.invoiceNumber) parts.push(inv.invoiceNumber);
  if (inv.clientName) parts.push(inv.clientName);
  if (parts.length) return parts.join(" — ");
  return inv.note || "Invoice";
}

// Mirrors lib/files.js's MAX_FILE_BYTES. Checked client-side, before ever
// attempting the upload — the file gets base64-encoded for transport
// (~33% larger), and Vercel's serverless functions reject any request body
// over ~4.5MB at the platform level, before our own code (and its
// friendlier error message) ever runs. Catching an oversized file here
// avoids that bare, unhelpful 413 entirely.
const MAX_PDF_BYTES = 3 * 1024 * 1024;
function checkFileSize(file) {
  if (file.size > MAX_PDF_BYTES) {
    return `This PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use a file under ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

function readFileAsPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      base64: String(reader.result).split(",")[1],
      mimeType: file.type || "application/pdf",
      filename: file.name,
    });
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

// In-app popup PDF viewer — an iframe, not a new browser tab, per
// Ramzanali's ask.
function PDFViewerModal({ invoice, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: "min(90vw, 800px)", height: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{invoiceTitle(invoice)}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <iframe title="Invoice PDF" src={invoice.fileUrl} style={{ flex: 1, width: "100%", border: "1px solid #e5e7eb", borderRadius: 8 }} />
      </div>
    </div>
  );
}

// Opened directly from the card's Approve/Request Changes buttons — the
// decision isn't executed until remarks are confirmed here.
function RemarksPopup({ decision, onConfirm, onClose }) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const isApprove = decision === "Approve";

  const confirm = async () => {
    setSaving(true); setErr("");
    try { await onConfirm(remarks); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 400 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{isApprove ? "Approve Invoice" : "Request Changes"}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <label style={labelStyle}>{isApprove ? "Note (optional)" : "What needs to change?"}</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} style={{ ...inputStyle, minHeight: 70, marginBottom: 10 }} autoFocus />
        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={saving} onClick={confirm}
            style={{ ...primaryBtnStyle, background: isApprove ? "#16a34a" : "#dc2626", opacity: saving ? 0.65 : 1 }}>
            {saving ? "Saving…" : isApprove ? "Confirm Approve" : "Send Remarks"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtnStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Opened from the card's Resubmit button when status is Changes Requested.
function ResubmitPopup({ onConfirm, onClose }) {
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!file) { setErr("Choose a PDF file first."); return; }
    const sizeErr = checkFileSize(file);
    if (sizeErr) { setErr(sizeErr); return; }
    setSaving(true); setErr("");
    try {
      const payload = await readFileAsPayload(file);
      await onConfirm(payload);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Upload Revised PDF</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <input type="file" accept="application/pdf,.pdf" onChange={e => {
          const f = e.target.files?.[0] || null;
          setFile(f);
          setErr(f ? (checkFileSize(f) || "") : "");
        }} style={{ ...inputStyle, marginBottom: 12 }} />
        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={saving} onClick={submit} style={{ ...primaryBtnStyle, opacity: saving ? 0.65 : 1 }}>{saving ? "Uploading…" : "Resubmit"}</button>
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtnStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Opened by clicking the card body itself — per Ramzanali's ask, this is
// ONLY for seeing the review outcome/remarks and history, not for taking
// action (those buttons live on the card directly now).
function HistoryModal({ staffName, invoice, onClose }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    api.getWorkflowInvoiceEvents(staffName, invoice.id).then(res => setEvents(res.data || [])).catch(() => setEvents([]));
  }, [invoice.id]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{invoiceTitle(invoice)}{invoice.revision > 1 ? ` (rev ${invoice.revision})` : ""}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px" }}>
          <p style={{ fontSize: 11.5, color: "#888", margin: 0 }}>Uploaded by {invoice.uploadedBy} · {fmtDateTime(invoice.uploadedAt)}</p>
          <StatusBadge status={invoice.status} />
        </div>
        {invoice.note && <p style={{ fontSize: 12.5, color: "#555", margin: "0 0 10px" }}>{invoice.note}</p>}

        {invoice.reviewedBy ? (
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
            {invoice.status === "Approved" ? "Approved" : "Reviewed"} by {invoice.reviewedBy} · {fmtDateTime(invoice.reviewedAt)}
            {invoice.remarks && <span> — {invoice.remarks}</span>}
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 10px" }}>Not reviewed yet.</p>
        )}

        <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "14px 0 6px" }}>History</p>
        {events === null ? <p style={{ fontSize: 12.5, color: "#888" }}>Loading…</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {events.map(e => (
              <div key={e.id} style={{ fontSize: 12, color: "#555" }}>
                <strong>{e.action}</strong> — {e.by} · {fmtDateTime(e.at)}
                {e.remarks && <div style={{ fontSize: 11.5, color: "#888" }}>{e.remarks}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadForm({ staffName, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!file) { setErr("Choose a PDF file first."); return; }
    const sizeErr = checkFileSize(file);
    if (sizeErr) { setErr(sizeErr); return; }
    setSaving(true); setErr("");
    try {
      const payload = await readFileAsPayload(file);
      await api.uploadWorkflowInvoice({ staffName, fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename, note });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Upload Invoice</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <label style={labelStyle}>PDF File</label>
        <input type="file" accept="application/pdf,.pdf" onChange={e => {
          const f = e.target.files?.[0] || null;
          setFile(f);
          setErr(f ? (checkFileSize(f) || "") : "");
        }} style={{ ...inputStyle, marginBottom: 10 }} />
        <label style={labelStyle}>Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. August fuel invoice" style={{ ...inputStyle, marginBottom: 12 }} />
        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={submit} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.65 : 1 }}>{saving ? "Uploading…" : "Upload"}</button>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Multiple PDFs at once — uploaded one at a time in sequence, each with its
// own status line, so a failure partway through (e.g. one oversized file)
// doesn't lose progress on the others.
function BulkUploadForm({ staffName, onClose, onSaved }) {
  const [files, setFiles] = useState([]); // { file, status: "pending"|"uploading"|"done"|"error", error? }
  const [uploading, setUploading] = useState(false);

  const pickFiles = (fileList) => {
    const picked = Array.from(fileList || []).map(file => ({ file, status: "pending", error: checkFileSize(file) || null }));
    setFiles(picked);
  };

  const startUpload = async () => {
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      if (files[i].error) continue; // already flagged oversized, skip
      setFiles(fs => fs.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));
      try {
        const payload = await readFileAsPayload(files[i].file);
        await api.uploadWorkflowInvoice({ staffName, fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename, note: "" });
        setFiles(fs => fs.map((f, idx) => idx === i ? { ...f, status: "done" } : f));
      } catch (e) {
        setFiles(fs => fs.map((f, idx) => idx === i ? { ...f, status: "error", error: e.message } : f));
      }
    }
    setUploading(false);
    onSaved();
  };

  const allDone = files.length > 0 && files.every(f => f.status === "done" || f.status === "error" || f.error);

  return (
    <div style={overlayStyle} onClick={uploading ? undefined : onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Bulk Upload Invoices</h3>
          {!uploading && <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>}
        </div>
        {files.length === 0 ? (
          <>
            <label style={labelStyle}>PDF Files</label>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={e => pickFiles(e.target.files)} style={inputStyle} />
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, border: "1px solid #f0f0f0", borderRadius: 7, padding: "6px 10px" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.file.name}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, marginLeft: 8,
                  color: f.error ? "#dc2626" : f.status === "done" ? "#166534" : f.status === "uploading" ? "#92400e" : "#888",
                }}>
                  {f.error || (f.status === "done" ? "Uploaded" : f.status === "uploading" ? "Uploading…" : "Waiting")}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {files.length === 0 ? (
            <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          ) : allDone ? (
            <button type="button" onClick={onClose} style={primaryBtnStyle}>Done</button>
          ) : (
            <>
              <button type="button" disabled={uploading} onClick={startUpload} style={{ ...primaryBtnStyle, opacity: uploading ? 0.65 : 1 }}>
                {uploading ? "Uploading…" : `Upload ${files.filter(f => !f.error).length} File${files.filter(f => !f.error).length === 1 ? "" : "s"}`}
              </button>
              <button type="button" disabled={uploading} onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceCard({ staffName, invoice, canApprove, canUpload, onOpenHistory, onChanged }) {
  const [viewingPdf, setViewingPdf] = useState(false);
  const [reviewing, setReviewing] = useState(null); // "Approve" | "RequestChanges" | null
  const [resubmitting, setResubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = (e) => e.stopPropagation();

  const doReview = async (remarks) => {
    await api.reviewWorkflowInvoice({ staffName, invoiceId: invoice.id, decision: reviewing, remarks });
    setReviewing(null);
    onChanged();
  };
  const doResubmit = async (payload) => {
    await api.resubmitWorkflowInvoice({ staffName, invoiceId: invoice.id, fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename });
    setResubmitting(false);
    onChanged();
  };

  return (
    <div onClick={() => onOpenHistory(invoice)}
      style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{invoiceTitle(invoice)}{invoice.revision > 1 ? ` (rev ${invoice.revision})` : ""}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{invoice.uploadedBy} · {fmtDateTime(invoice.uploadedAt)}</div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }} onClick={stop}>
        {invoice.fileId ? (
          <button type="button" onClick={() => setViewingPdf(true)} style={cardBtnStyle}>View PDF</button>
        ) : (
          <span style={{ fontSize: 11, color: "#aaa" }}>PDF auto-deleted after 14 days</span>
        )}
        {canApprove && invoice.status === "Pending" && (
          <>
            <button type="button" disabled={busy} onClick={() => setReviewing("Approve")} style={{ ...cardBtnStyle, color: "#16a34a", borderColor: "#bbf7d0" }}>Approve</button>
            <button type="button" disabled={busy} onClick={() => setReviewing("RequestChanges")} style={{ ...cardBtnStyle, color: "#dc2626", borderColor: "#fecaca" }}>Request Changes</button>
          </>
        )}
        {canUpload && invoice.status === "Changes Requested" && (
          <button type="button" disabled={busy} onClick={() => setResubmitting(true)} style={{ ...cardBtnStyle, color: "var(--sc-blue, #04519B)" }}>Resubmit</button>
        )}
      </div>

      {viewingPdf && <PDFViewerModal invoice={invoice} onClose={() => setViewingPdf(false)} />}
      {reviewing && (
        <RemarksPopup decision={reviewing} onClose={() => setReviewing(null)}
          onConfirm={async (remarks) => { setBusy(true); try { await doReview(remarks); } finally { setBusy(false); } }} />
      )}
      {resubmitting && (
        <ResubmitPopup onClose={() => setResubmitting(false)}
          onConfirm={async (payload) => { setBusy(true); try { await doResubmit(payload); } finally { setBusy(false); } }} />
      )}
    </div>
  );
}

export default function WorkflowsPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(role === "Admin" ? "Approve" : "None");
  const [invoices, setInvoices] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  const loadInvoices = () => {
    api.getWorkflowInvoices(staffName).then(res => setInvoices(res.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (role === "Admin") { setLoading(false); loadInvoices(); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      const a = me?.workflowAccess || "None";
      setAccess(a);
      if (a !== "None") loadInvoices();
    }).catch(() => setAccess("None")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffName, role]);

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: "#888" }}>Loading…</div>;

  if (access === "None") {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Invoice Approvals</h2>
        <p style={{ fontSize: 13, color: "#888" }}>You don't have access to Workflows.</p>
      </div>
    );
  }

  const canUpload = access === "Upload" || access === "Approve";
  const canApprove = access === "Approve";
  const historyForFresh = historyFor ? invoices.find(i => i.id === historyFor.id) : null;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Invoice Approvals</h2>
        {canUpload && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setShowBulkUpload(true)} style={secondaryBtnStyle}>Bulk Upload</button>
            <button type="button" onClick={() => setShowUpload(true)} style={primaryBtnStyle}>+ Upload Invoice</button>
          </div>
        )}
      </div>

      {invoices.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No invoices yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => (
            <InvoiceCard key={inv.id} staffName={staffName} invoice={inv} canApprove={canApprove} canUpload={canUpload}
              onOpenHistory={setHistoryFor} onChanged={loadInvoices} />
          ))}
        </div>
      )}

      {showUpload && <UploadForm staffName={staffName} onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); loadInvoices(); }} />}
      {showBulkUpload && <BulkUploadForm staffName={staffName} onClose={() => { setShowBulkUpload(false); loadInvoices(); }} onSaved={loadInvoices} />}
      {historyForFresh && <HistoryModal staffName={staffName} invoice={historyForFresh} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
