import { useState, useEffect } from "react";
import { api } from "../lib/api";

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalStyle = { background: "#fff", borderRadius: 12, padding: 20, maxHeight: "85vh", overflowY: "auto", width: 460 };
const primaryBtnStyle = { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" };
const secondaryBtnStyle = { padding: "8px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" };
const closeBtnStyle = { background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#888" };
const inputStyle = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, color: "#888" };

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

// Reads a File object into the { base64, mimeType, filename } shape the
// upload endpoints expect — same FileReader.readAsDataURL pattern already
// used elsewhere in this app (imageCompress.js, pdfSplit.js).
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

// Multiple PDFs at once, each becomes its own invoice — no per-file note,
// keeping with the "just simple PDF uploading" brief. Files are checked
// for size the moment they're picked (same MAX_PDF_BYTES rule as the
// single-upload form) so an oversized one is flagged before any upload
// attempt, and uploads run one at a time so a status can be shown per file.
function BulkUploadForm({ staffName, onClose, onSaved }) {
  const [files, setFiles] = useState([]);
  const [statuses, setStatuses] = useState({}); // filename -> "ready" | "oversized message" | "Uploading…" | "Done" | error message
  const [uploading, setUploading] = useState(false);

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file(s) later
    setFiles(prev => [...prev, ...picked]);
    setStatuses(prev => {
      const next = { ...prev };
      picked.forEach(f => { next[f.name] = checkFileSize(f) || "ready"; });
      return next;
    });
  };

  const removeFile = (name) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    setStatuses(prev => { const next = { ...prev }; delete next[name]; return next; });
  };

  const uploadAll = async () => {
    setUploading(true);
    let anySucceeded = false;
    for (const f of files) {
      if (statuses[f.name] !== "ready") continue; // skip oversized or already-done files
      setStatuses(prev => ({ ...prev, [f.name]: "Uploading…" }));
      try {
        const payload = await readFileAsPayload(f);
        await api.uploadWorkflowInvoice({ staffName, fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename, note: "" });
        setStatuses(prev => ({ ...prev, [f.name]: "Done" }));
        anySucceeded = true;
      } catch (e) {
        setStatuses(prev => ({ ...prev, [f.name]: e.message }));
      }
    }
    setUploading(false);
    if (anySucceeded) onSaved();
  };

  const readyCount = files.filter(f => statuses[f.name] === "ready").length;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Bulk Upload Invoices</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <label style={{ ...inputStyle, display: "inline-block", cursor: "pointer", textAlign: "center", background: "#f4f6f8" }}>
          + Choose PDFs
          <input type="file" accept="application/pdf,.pdf" multiple disabled={uploading} onChange={handleFiles} style={{ display: "none" }} />
        </label>

        {files.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {files.map(f => {
              const status = statuses[f.name];
              const isError = status && status !== "ready" && status !== "Uploading…" && status !== "Done";
              return (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #f0f0f0", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: isError ? "#dc2626" : status === "Done" ? "#166534" : "#888" }}>{status}</div>
                  </div>
                  {status === "ready" && !uploading && (
                    <button type="button" onClick={() => removeFile(f.name)} style={{ ...closeBtnStyle, fontSize: 12 }}>✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={uploadAll} disabled={uploading || readyCount === 0} style={{ ...primaryBtnStyle, opacity: (uploading || readyCount === 0) ? 0.65 : 1 }}>
            {uploading ? "Uploading…" : `Upload ${readyCount || ""}`.trim()}
          </button>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>{uploading ? "Close when done" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ decision, onSubmit, onClose, saving }) {
  const [remarks, setRemarks] = useState("");
  const isApprove = decision === "Approve";
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10, marginTop: 8, background: "#fafafa" }}>
      <label style={labelStyle}>{isApprove ? "Note (optional)" : "What needs to change?"}</label>
      <textarea value={remarks} onChange={e => setRemarks(e.target.value)} style={{ ...inputStyle, minHeight: 50 }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={() => onSubmit(remarks)}
          style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, background: isApprove ? "#16a34a" : "#dc2626", opacity: saving ? 0.65 : 1 }}>
          {saving ? "Saving…" : isApprove ? "Confirm Approve" : "Send Remarks"}
        </button>
        <button type="button" onClick={onClose} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

function PdfViewerModal({ url, onClose }) {
  return (
    <div style={{ ...overlayStyle, zIndex: 200 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 12, width: "min(900px, 94vw)", height: "88vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <iframe title="Invoice PDF" src={url} style={{ flex: 1, width: "100%", border: "none", borderRadius: 8 }} />
      </div>
    </div>
  );
}

function InvoiceDetailModal({ staffName, invoice, canApprove, canUpload, onClose, onChanged }) {
  const [events, setEvents] = useState(null);
  const [reviewing, setReviewing] = useState(null); // "Approve" | "RequestChanges" | null
  const [resubmitFile, setResubmitFile] = useState(null);
  const [showPdf, setShowPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getWorkflowInvoiceEvents(staffName, invoice.id).then(res => setEvents(res.data || [])).catch(() => setEvents([]));
  }, [invoice.id]);

  const submitReview = async (remarks) => {
    setSaving(true); setErr("");
    try {
      await api.reviewWorkflowInvoice({ staffName, invoiceId: invoice.id, decision: reviewing, remarks });
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const submitResubmit = async () => {
    if (!resubmitFile) { setErr("Choose a PDF file first."); return; }
    const sizeErr = checkFileSize(resubmitFile);
    if (sizeErr) { setErr(sizeErr); return; }
    setSaving(true); setErr("");
    try {
      const payload = await readFileAsPayload(resubmitFile);
      await api.resubmitWorkflowInvoice({ staffName, invoiceId: invoice.id, fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename });
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Invoice{invoice.revision > 1 ? ` (rev ${invoice.revision})` : ""}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px" }}>
          <p style={{ fontSize: 11.5, color: "#888", margin: 0 }}>Uploaded by {invoice.uploadedBy} · {fmtDateTime(invoice.uploadedAt)}</p>
          <StatusBadge status={invoice.status} />
        </div>
        {invoice.note && <p style={{ fontSize: 12.5, color: "#555", margin: "0 0 10px" }}>{invoice.note}</p>}
        <button type="button" onClick={() => setShowPdf(true)} style={{ ...primaryBtnStyle, marginBottom: 12 }}>
          View PDF
        </button>
        {showPdf && <PdfViewerModal url={invoice.fileUrl} onClose={() => setShowPdf(false)} />}

        {invoice.reviewedBy && (
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
            {invoice.status === "Approved" ? "Approved" : "Reviewed"} by {invoice.reviewedBy} · {fmtDateTime(invoice.reviewedAt)}
            {invoice.remarks && <span> — {invoice.remarks}</span>}
          </p>
        )}

        {canApprove && invoice.status === "Pending" && !reviewing && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setReviewing("Approve")} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, background: "#16a34a" }}>Approve</button>
            <button type="button" onClick={() => setReviewing("RequestChanges")} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, background: "#dc2626" }}>Request Changes</button>
          </div>
        )}
        {reviewing && <ReviewForm decision={reviewing} saving={saving} onSubmit={submitReview} onClose={() => setReviewing(null)} />}

        {canUpload && invoice.status === "Changes Requested" && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10, marginBottom: 8, background: "#fafafa" }}>
            <label style={labelStyle}>Upload Revised PDF</label>
            <input type="file" accept="application/pdf,.pdf" onChange={e => {
              const f = e.target.files?.[0] || null;
              setResubmitFile(f);
              setErr(f ? (checkFileSize(f) || "") : "");
            }} style={{ ...inputStyle, marginBottom: 8 }} />
            <button type="button" disabled={saving} onClick={submitResubmit} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, opacity: saving ? 0.65 : 1 }}>
              {saving ? "Uploading…" : "Resubmit"}
            </button>
          </div>
        )}

        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{err}</p>}

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

export default function WorkflowsPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(role === "Admin" ? "Approve" : "None");
  const [invoices, setInvoices] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selected, setSelected] = useState(null);

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
  const selectedFresh = selected ? invoices.find(i => i.id === selected.id) : null;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Invoice Approvals</h2>
        {canUpload && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setShowUpload(true)} style={primaryBtnStyle}>+ Upload Invoice</button>
            <button type="button" onClick={() => setShowBulkUpload(true)} style={secondaryBtnStyle}>Bulk Upload</button>
          </div>
        )}
      </div>

      {invoices.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No invoices yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => (
            <button type="button" key={inv.id} onClick={() => setSelected(inv)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "12px 14px",
                border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer", width: "100%", fontFamily: "inherit" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.note || "Invoice"}{inv.revision > 1 ? ` (rev ${inv.revision})` : ""}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{inv.uploadedBy} · {fmtDateTime(inv.uploadedAt)}</div>
              </div>
              <StatusBadge status={inv.status} />
            </button>
          ))}
        </div>
      )}

      {showUpload && <UploadForm staffName={staffName} onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); loadInvoices(); }} />}
      {showBulkUpload && <BulkUploadForm staffName={staffName} onClose={() => { setShowBulkUpload(false); loadInvoices(); }} onSaved={loadInvoices} />}
      {selectedFresh && (
        <InvoiceDetailModal staffName={staffName} invoice={selectedFresh} canApprove={canApprove} canUpload={canUpload}
          onClose={() => setSelected(null)} onChanged={() => { setSelected(null); loadInvoices(); }} />
      )}
    </div>
  );
}
