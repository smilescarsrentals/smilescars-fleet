import { useState } from "react";
import ActionModal from "./ActionModal";
import RentalAgreementModal from "./RentalAgreementModal";

// Wraps the check-out form and the rental agreement into ONE modal shell with a
// 2-step progress bar, instead of closing one modal and popping open a different one.
// The actual `api.checkOut(...)` call still happens between steps (via onSubmitCheckout,
// supplied by FleetPage) so the car is marked Rented immediately, even if the staff
// member doesn't finish the agreement right away.
export default function CheckoutFlowModal({
  car, locations, garages, drivers, staff, staffName, role, blacklist,
  onSubmitCheckout, // async (fields) => payload — throws on failure
  onClose,
}) {
  const [step,            setStep]            = useState("checkout"); // "checkout" | "agreement"
  const [checkoutPayload, setCheckoutPayload]  = useState(null);
  const [saving,          setSaving]           = useState(false);
  const [err,             setErr]              = useState("");

  const handleCheckoutConfirm = async (fields) => {
    setSaving(true); setErr("");
    try {
      const payload = await onSubmitCheckout(fields);
      setCheckoutPayload(payload);
      setStep("agreement");
    } catch (e) {
      setErr(e.message || "Something went wrong — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={step === "checkout" ? onClose : undefined}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.stepBar}>
          <div style={{ ...S.stepDot, ...(step === "checkout" ? S.stepActive : S.stepDone) }}>{step === "agreement" ? "✓" : "1"}</div>
          <div style={S.stepLine} />
          <div style={{ ...S.stepDot, ...(step === "agreement" ? S.stepActive : {}) }}>2</div>
          <div style={S.stepLabel}>
            {step === "checkout" ? "Step 1 of 2 — Check-Out Details" : "Step 2 of 2 — Rental Agreement"}
          </div>
        </div>

        {err && <p style={{ color:"#dc2626", fontSize:13, margin:"10px 20px 0" }}>{err}</p>}

        {step === "checkout" && (
          <ActionModal
            embedded
            car={car} action="checkOut"
            locations={locations} garages={garages} drivers={drivers} staff={staff}
            staffName={staffName} role={role} blacklist={blacklist}
            onConfirm={handleCheckoutConfirm} onClose={onClose} loading={saving}
          />
        )}

        {step === "agreement" && checkoutPayload && (
          <RentalAgreementModal
            embedded
            car={car} checkout={checkoutPayload} staffName={staffName}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

const S = {
  overlay:  { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modal:    { background:"#fff", borderRadius:14, width:600, maxWidth:"100%", height:"min(720px,92vh)", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  stepBar:  { display:"flex", alignItems:"center", gap:8, padding:"12px 20px", borderBottom:"1px solid #f3f4f6", flexShrink:0, background:"#fafafa" },
  stepDot:  { width:22, height:22, borderRadius:"50%", background:"#e5e7eb", color:"#888", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  stepActive: { background:"#16a34a", color:"#fff" },
  stepDone:   { background:"#16a34a", color:"#fff" },
  stepLine: { width:28, height:2, background:"#e5e7eb", flexShrink:0 },
  stepLabel:{ fontSize:12, fontWeight:600, color:"#555", marginLeft:8 },
};
