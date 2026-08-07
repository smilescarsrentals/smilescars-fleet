import { useState, useRef, useEffect, useCallback } from "react";
import { post, get } from "../lib/api";

const CONDITION_OPTIONS = ["Good", "Fair", "Poor", "N/A"];
const ID_TYPES  = ["Passport", "National ID", "Driver's License"];
const TOOLS     = ["Jack","Spare Tyre","Wheel Spanner","Warning Triangle","First Aid Kit","Fire Extinguisher","Tow Rope"];
const DOCS      = ["Registration Card","Insurance Certificate","Road Licence"];
const INTERIOR  = ["Seats","Dashboard","Carpets","Mirrors","Seatbelts"];
const EXTERIOR  = ["Exhaust","Windows","Lights","Wipers","Side Mirrors"];

const COMPANIES = {
  smilescars: { label: "SmilesCars",  logoPath: "/smilescarslogo.png", logoW: 42, logoH: 10.3 },
  autounion:  { label: "AutoUnion",   logoPath: "/autounionlogo.png",  logoW: 42, logoH: 10.3 },
};

const CONTACTS = [
  "+255 783 447 239 (Dar Es Salaam)",
  "+255 789 304 949 (Arusha)",
  "+255 744 001 081 (Zanzibar)",
  "+255 712 261 424 (Mwanza)",
  "info@smilescars.co.tz",
  "www.smilescars.co.tz",
];

const OFFICES = [
  ["DAR ES SALAAM OFFICE:", "NBAA / Mhasibu House, Bibi Titi Rd | Dar Es Salaam - Tanzania | +255 783 447 239"],
  ["ARUSHA OFFICE:",        "Simeon Rd, Kinjenge | Arusha - Tanzania | +255 789 304 949"],
  ["ZANZIBAR OFFICE:",      "Outside the International Airport | Zanzibar | +255 744 001 081"],
  ["MWANZA OFFICE:",        "Near Salima Cone, Nkurumah St. | Mwanza | +255 712 261 424"],
];

// Full agreed Terms & Conditions text ("this state" -> "the country" per house style;
// currency figures left as-is per agreement).
const TERMS_INTRO = "In consideration of the covenants contained here, the lessor cooperation, referred to as the lessor, leases to the undersigned renter, upon the terms, covenants and conditions set out here, the motor vehicle described, referred to as vehicle:";

const TERMS_SECTIONS = [
  { heading: "ACKNOWLEDGEMENTS", clauses: [
    "1. Renter acknowledges that the vehicle is the property of the lessor and that he or she received it in good running mechanical condition.",
    "2. Renter agrees that he or she will return the vehicle to the lessor station, from which it was rented, in the same condition as he or she received it, ordinary wear and tears accepted, on the return date stated or sooner upon lessor's demand.",
    "3. Renter agrees not to use the vehicle for the transportation of a person or hire, express or implied, and not to use it in violation of any federal, state or municipal law, ordinance, rules or regulation governing the use or return of it, not to remove it from the country without the written consent of the lessor. The renter shall not sub-hire the vehicle to a third party.",
    "4. Renter further expressly agrees to rent from the lessor at his or her own risk, any injuries to himself or passengers will be at the renter's own risk.",
    "5. The renter shall be held responsible for payment of any illegal luggage or traffic offence committed while in possession of the company's vehicle.",
    "6. Repair from bogus mechanics, roadside mechanic is not allowed.",
    "7. The renter is not allowed to travel out of the city without informing the lessor.",
    "8. The renter shall provide adequate details of him/herself such as passport, driver's license, employer's reference, etc.",
    "9. The company reserves the right to refuse, cancel or terminate a contract without assigning any reason.",
    "10. Renter being one of the insured under the insurance policy covering the vehicle agrees to comply with all the terms and conditions of the policy, which by reference incorporated here and made a part of this agreement, and to comply with the terms and conditions on the reserve side of this agreement.",
    "11. Entry into national parks, game reserves, or other protected areas is strictly prohibited unless explicitly authorized. Unauthorized entry will result in a fine of \u20AC1,000. Additionally, any damages incurred will be charged separately.",
  ]},
  { heading: "INSURANCE", clauses: [
    "12. All vehicles are comprehensively insured with the passenger's legal liability.",
    "13. Renter further expressly agrees to compensate the insurance and lessor company with damages, costs and expenses paid or incurred by the insurance and lessor company because of injuries or damages sustained (including public property) during this agreement.",
    "14. The renter will be liable to pay for accidental damages to the vehicle below the accepted insurance threshold of $500. In case of a major accident, the renter must report the matter to the police and obtain police reports PF90 and PF115. This complies with the requirement of the laws for the lodgment of a claim with an insurance company. Failure to report the matter to the police, the renter will be liable to pay the full cost of damages to both the vehicles and Third Party Claims. All in all the renter is liable to pay for the excess insurance. The renter should also report to the lessor immediately.",
    "15. In the event of an accident, the renter is liable for an insurance excess amount between $500 and $1,000, depending on the vehicle category. Larger vehicles generally carry a higher excess.",
  ]},
  { heading: "ADDITIONAL COSTS", clauses: [
    "16. Additional charges such as breakdown services etc. will be determined by distance and location whereby the renter will be liable for all legal charges and damages.",
    "17. Damages to wheels and tires and loss of tools and accessories are not covered, hence the renter shall be debited for any item missing in the vehicle.",
    "18. The lessor will cover all repairs due to wear and tear. However, if the damage is caused, or repairs are required due to vehicle use being deemed outside of normal use, such repairs will then be liable and due by the renter.",
    "19. The renter is responsible for parking fees and any additional charges.",
    "20. Out-of-town usage, tariffs may differ according to routes and km, any excess above 100kms will be charged accordingly.",
    "21. Overtime charges for chauffeur services are $1.5/hour. Additional $4 after 9 pm for transport charges.",
    "22. A refundable security deposit ranging from $500 to $1,000 may be required, depending on the type of vehicle rented. In case of any damages done to the vehicle, the same will be deducted from the deposit paid and the balance refunded.",
    "23. Costs related to vehicle downtime, towing, or any other non-insurable consequences resulting from an accident may be charged separately, subject to the vehicle type and circumstances.",
  ]},
];

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => res(window.jspdf.jsPDF); s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function loadQRCode() {
  if (window.QRCode) return window.QRCode;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = () => res(window.QRCode); s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function fetchAsDataUrl(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) { console.warn(`Image fetch failed (${res.status}): ${path}`); return null; }
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Check actual file bytes rather than the server's Content-Type header —
    // some hosts/CDNs serve a correct file with a wrong/missing content-type,
    // and browsers sniff bytes to render it directly while fetch() would only
    // ever see the (possibly wrong) header.
    const isPng = bytes.length >= 8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4E && bytes[3]===0x47;
    const isJpg = bytes.length >= 3 && bytes[0]===0xFF && bytes[1]===0xD8 && bytes[2]===0xFF;
    if (!isPng && !isJpg) { console.warn(`Not a recognizable PNG/JPEG (bad file signature): ${path}`); return null; }
    let binary = "";
    for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return `data:${isPng ? "image/png" : "image/jpeg"};base64,${base64}`;
  } catch (e) { console.warn(`Image fetch error: ${path}`, e); return null; }
}
async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length < 4) throw new Error(`Empty font file: ${url}`);
  // Valid TTF/OTF files start with one of these 4-byte signatures. If we got an
  // HTML error page (e.g. a 404) instead of the real font, this catches it
  // before it reaches jsPDF and crashes later with a cryptic width-table error.
  const sig = (bytes[0]<<24 | bytes[1]<<16 | bytes[2]<<8 | bytes[3]) >>> 0;
  const validSigs = [0x00010000, 0x4F54544F, 0x74727565, 0x74746366]; // sfnt, OTTO, true, ttcf
  if (!validSigs.includes(sig)) throw new Error(`Not a valid font file (bad signature): ${url}`);
  let binary = "";
  for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
// Registers Google's open-source Varela Round for section titles/headings.
// Falls back silently to Helvetica if the fetch fails (e.g. offline).
async function loadTitleFont(doc) {
  try {
    const base64 = await urlToBase64("https://raw.githubusercontent.com/google/fonts/main/ofl/varelaround/VarelaRound-Regular.ttf");
    doc.addFileToVFS("VarelaRound-Regular.ttf", base64);
    doc.addFont("VarelaRound-Regular.ttf", "VarelaRound", "normal");
    return "VarelaRound";
  } catch { return "helvetica"; }
}
// Registers the licensed Bliss Pro files (place in /public/fonts/ — see chat note).
// Falls back silently to Helvetica if the files aren't found.
async function loadBodyFont(doc) {
  try {
    const [regB64, boldB64] = await Promise.all([
      urlToBase64("/fonts/BlissPro-Regular.ttf"),
      urlToBase64("/fonts/BlissPro-Bold.ttf"),
    ]);
    doc.addFileToVFS("BlissPro-Regular.ttf", regB64);
    doc.addFont("BlissPro-Regular.ttf", "BlissPro", "normal");
    doc.addFileToVFS("BlissPro-Bold.ttf", boldB64);
    doc.addFont("BlissPro-Bold.ttf", "BlissPro", "bold");
    return "BlissPro";
  } catch { return "helvetica"; }
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function fmtNum(v) { const n=Number(String(v||"").replace(/,/g,"")); return isNaN(n)?String(v||""):n.toLocaleString("en-US"); }
// Detects the real format from a data URL's declared mime type, so jsPDF's
// addImage is never told "PNG" for what's actually a JPEG (or vice versa) —
// mismatches here make jsPDF silently throw when embedding the image.
function imgFormatFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g)/i.exec(dataUrl || "");
  return (m && /jpe?g/i.test(m[1])) ? "JPEG" : "PNG";
}
function todayDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmtD(s) { if(!s)return"—"; const[y,m,d]=s.split("-"); return`${d}-${m}-${y}`; }
function genToken() { return "SC-SIG-" + Math.random().toString(36).slice(2,8).toUpperCase(); }

// ── Signature Pad ──────────────────────────────────────────
function SignaturePad({ onSigned }) {
  const canvasRef   = useRef(null);
  const [drawing,   setDrawing]  = useState(false);
  const [hasSign,   setHasSign]  = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    c.width  = c.offsetWidth;
    c.height = c.offsetHeight;
  }, []);

  const pos = (e, c) => {
    const r = c.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX - r.left, y: s.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); const c=canvasRef.current,ctx=c.getContext("2d"),p=pos(e,c); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.strokeStyle="#111"; ctx.lineWidth=2.5; ctx.lineCap="round"; setDrawing(true); };
  const move  = (e) => { e.preventDefault(); if(!drawing)return; const c=canvasRef.current,ctx=c.getContext("2d"),p=pos(e,c); ctx.lineTo(p.x,p.y); ctx.stroke(); setHasSign(true); };
  const stop  = (e) => { e.preventDefault(); setDrawing(false); };
  const clear = ()  => { const c=canvasRef.current; c.getContext("2d").clearRect(0,0,c.width,c.height); setHasSign(false); };
  const done  = ()  => { if(!hasSign)return; onSigned(canvasRef.current.toDataURL("image/png")); };

  return (
    <div>
      <div style={{ border:"2px solid #e5e7eb",borderRadius:10,background:"#fff",overflow:"hidden",height:140,position:"relative",touchAction:"none" }}>
        <canvas ref={canvasRef} style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair",touchAction:"none" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop} />
        {!hasSign && <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}><span style={{ color:"#d1d5db",fontSize:13 }}>Sign here with your finger or mouse</span></div>}
      </div>
      <div style={{ display:"flex",gap:8,marginTop:8 }}>
        <button type="button" onClick={clear} style={{ flex:1,padding:"8px",fontSize:13,background:"#f3f4f6",border:"1.5px solid #e5e7eb",borderRadius:7,cursor:"pointer",color:"#555" }}>Clear</button>
        <button type="button" onClick={done}  style={{ flex:2,padding:"8px",fontSize:13,fontWeight:600,background:hasSign?"#16a34a":"#9ca3af",color:"#fff",border:"none",borderRadius:7,cursor:hasSign?"pointer":"not-allowed" }}>
          ✓ Confirm Signature
        </button>
      </div>
    </div>
  );
}

// ── Signature Upload (photo of a wet-ink signature, or a saved signature image) ──
function SignatureUpload({ onSigned }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleFile} />
      {!preview ? (
        <button type="button" onClick={()=>inputRef.current && inputRef.current.click()}
          style={{ width:"100%",padding:"20px",fontSize:13,fontWeight:600,color:"#555",background:"#f9fafb",border:"1.5px dashed #d1d5db",borderRadius:10,cursor:"pointer" }}>
          📁 Choose a Photo or Image File
        </button>
      ) : (
        <div style={{ textAlign:"center" }}>
          <img src={preview} alt="Signature preview" style={{ maxHeight:100,maxWidth:"100%",border:"1px solid #e5e7eb",borderRadius:8,background:"#fff",padding:6 }} />
          <div style={{ display:"flex",gap:8,marginTop:8 }}>
            <button type="button" onClick={()=>{ setPreview(null); if (inputRef.current) inputRef.current.value=""; }}
              style={{ flex:1,padding:"8px",fontSize:13,background:"#f3f4f6",border:"1.5px solid #e5e7eb",borderRadius:7,cursor:"pointer",color:"#555" }}>Choose Different File</button>
            <button type="button" onClick={()=>onSigned(preview)}
              style={{ flex:2,padding:"8px",fontSize:13,fontWeight:600,background:"#16a34a",color:"#fff",border:"none",borderRadius:7,cursor:"pointer" }}>✓ Use This Signature</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── QR Code component ──────────────────────────────────────
function QRCodeDisplay({ token }) {
  const ref = useRef(null);
  const url = `${window.location.origin}/sign/${token}`;
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    loadQRCode().then(QRCode => {
      new QRCode(ref.current, { text: url, width: 140, height: 140, colorDark:"#111", colorLight:"#fff" });
    }).catch(() => {});
  }, [token]);
  return (
    <div style={{ textAlign:"center" }}>
      <div ref={ref} style={{ display:"inline-block",padding:8,background:"#fff",border:"1px solid #e5e7eb",borderRadius:8 }} />
      <p style={{ fontSize:11,color:"#888",margin:"6px 0 0" }}>Client scans this with their phone to sign</p>
      <p style={{ fontSize:10,color:"#aaa",margin:"2px 0 0",wordBreak:"break-all" }}>{url}</p>
    </div>
  );
}

export default function RentalAgreementModal({ car, checkout, staffName, onClose, embedded }) {
  const [saving,    setSaving]    = useState(false);
  const [pdfReady,  setPdfReady]  = useState(null);
  const [company,   setCompany]   = useState("smilescars"); // "smilescars" | "autounion"
  const [idType,    setIdType]    = useState(ID_TYPES[0]);
  const [idNo,      setIdNo]      = useState("");
  const [pickupTime,setPickupTime]= useState("08:00");
  const [returnTime,setReturnTime]= useState("08:00");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit,   setDeposit]   = useState("");
  const [tools,     setTools]     = useState({});
  const [docs,      setDocs]      = useState({});
  const [interior,  setInterior]  = useState({});
  const [exterior,  setExterior]  = useState({});
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [signature, setSignature] = useState(null); // base64 image — client's
  const [sigMode,   setSigMode]   = useState("qr"); // "qr" | "pad"
  const [qrToken,   setQrToken]   = useState(() => genToken());
  const [polling,   setPolling]   = useState(false);
  const [sigStatus, setSigStatus] = useState(""); // "" | "waiting" | "received"
  const pollRef = useRef(null);

  // ── Staff phone: fetched once per agreement, printed alongside the name ──
  const [staffPhone, setStaffPhone] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get("getStaffList");
        if (!cancelled && res.success) {
          const match = (res.staff || []).find(s => s.name === staffName);
          if (match) setStaffPhone(match.phone || "");
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [staffName]);

  // ── Staff signature: fetched once, reused automatically on every agreement ──
  // Stored server-side as a Drive image (see Code.gs) — only a URL comes back here,
  // so we convert it to a data URL once, ready for both <img> display and jsPDF embedding.
  const [staffSignature, setStaffSignature] = useState(null);
  const [staffSigLoaded, setStaffSigLoaded]  = useState(false);
  const [staffSigMode,   setStaffSigMode]    = useState("pad"); // "pad" | "upload"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get("getStaffSignature", { staffName });
        if (!cancelled && res.success && res.signature) {
          const dataUrl = await fetchAsDataUrl(res.signature);
          if (!cancelled && dataUrl) setStaffSignature(dataUrl);
        }
      } catch {}
      if (!cancelled) setStaffSigLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [staffName]);

  const saveStaffSignature = async (sig) => {
    setStaffSignature(sig); // optimistic — we already have the real image locally
    try { await post({ action: "storeStaffSignature", staffName, signature: sig }); } catch {}
  };

  const removeStaffSignature = async () => {
    setStaffSignature(null);
    try { await post({ action: "deleteStaffSignature", staffName }); } catch {}
  };

  // Sequential Ref No. (SC/RA/YYYY/MM/1001+), fetched from the backend so it
  // stays sequential across staff/sessions — not something safe to fake client-side.
  const [refNo, setRefNo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get("getNextAgreementRef");
        if (!cancelled && res.success && res.refNo) setRefNo(res.refNo);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const days = (() => {
    if (!checkout.bookedFrom || !checkout.returnDate) return 1;
    const diff = Math.ceil((new Date(checkout.returnDate) - new Date(checkout.bookedFrom)) / 86400000);
    return diff > 0 ? diff : 1;
  })();
  const totalAmount = dailyRate ? Number(String(dailyRate).replace(/,/g,"")) * days : null;

  const startPolling = useCallback(() => {
    setSigStatus("waiting"); setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await get("getSignature", { token: qrToken });
        if (res.success && res.signature) {
          clearInterval(pollRef.current);
          setPolling(false);
          const dataUrl = await fetchAsDataUrl(res.signature);
          if (dataUrl) { setSignature(dataUrl); setSigStatus("received"); }
          else { setSigStatus(""); } // couldn't fetch it back — let them try again
        }
      } catch {}
    }, 2500);
  }, [qrToken]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const generatePDF = async () => {
    setSaving(true);
    try {
      const jsPDF    = await loadJsPDF();
      const co       = COMPANIES[company];
      const logoUrl  = await fetchAsDataUrl(co.logoPath);
      const W=210, H=297, ml=15, mr=15, cw=W-ml-mr;
      const half = (cw-6)/2, leftX = ml, rightX = ml+half+6;
      const doc = new jsPDF({ unit:"mm", format:"a4" });

      const titleFont = await loadTitleFont(doc); // Varela Round (or Helvetica fallback)
      const bodyFont  = await loadBodyFont(doc);  // Bliss Pro (or Helvetica fallback)

      // Ref should already be loaded (fetched on mount), but guard the rare
      // case where Generate is clicked before that finished.
      let currentRef = refNo;
      if (!currentRef) {
        try { const res = await get("getNextAgreementRef"); currentRef = res.refNo; }
        catch { currentRef = `SC/RA/PENDING/${Date.now()}`; }
      }

      let y = 0;

      // ── dark section header bar ──
      const sectionHeader = (t) => {
        doc.setFillColor(45,45,45); doc.rect(ml,y,cw,6,"F");
        doc.setTextColor(255,255,255); doc.setFont(titleFont,"normal"); doc.setFontSize(9);
        doc.text(t.toUpperCase(), ml+3, y+4.2);
        doc.setTextColor(0,0,0); y+=6;
      };
      // ── drawn checkbox (vector square + tick) — never relies on the active
      // font having glyphs for ☑/☐, which standard PDF fonts (and Bliss Pro) don't ──
      const drawCheckbox = (x, textBaselineY, checked) => {
        const s = 2.8, boxY = textBaselineY - s + 0.5;
        doc.setDrawColor(90,90,90); doc.setLineWidth(0.25);
        doc.rect(x, boxY, s, s);
        if (checked) {
          doc.setDrawColor(22,101,52); doc.setLineWidth(0.5);
          doc.line(x+0.4, boxY+s*0.55, x+s*0.42, boxY+s-0.3);
          doc.line(x+s*0.42, boxY+s-0.3, x+s-0.3, boxY+0.3);
          doc.setDrawColor(90,90,90); doc.setLineWidth(0.25);
        }
        return x + s + 1.6; // x position where the label text should start
      };

      // ── bordered grid of two-column label/value rows ──
      const gridRows = (rows) => {
        const rowH = 6, tableH = rows.length*rowH;
        doc.setDrawColor(170,170,170); doc.setLineWidth(0.2);
        doc.rect(ml,y,cw,tableH);
        for (let i=1;i<rows.length;i++) doc.line(ml, y+i*rowH, ml+cw, y+i*rowH);
        doc.line(ml+cw/2, y, ml+cw/2, y+tableH);
        rows.forEach(([[l1,v1],r2]) => {
          const ty = y+4;
          doc.setFont(bodyFont,"bold"); doc.setFontSize(7.5);
          doc.text(l1+":", leftX+2, ty);
          doc.setFont(bodyFont,"normal"); doc.text(String(v1||"—"), leftX+28, ty);
          if (r2) {
            doc.setFont(bodyFont,"bold"); doc.text(r2[0]+":", rightX+2, ty);
            doc.setFont(bodyFont,"normal"); doc.text(String(r2[1]||"—"), rightX+28, ty);
          }
          y+=rowH;
        });
      };

      // ══════════════════ PAGE 1 ══════════════════

      // ── Header: contacts | title | logo ──
      const headerTop = y = 12;
      doc.setFont(bodyFont,"normal"); doc.setFontSize(7); doc.setTextColor(30,30,30);
      CONTACTS.forEach((line,i)=> doc.text(line, ml, headerTop+i*3.6));
      doc.setTextColor(0,0,0);

      doc.setFont(titleFont,"normal"); doc.setFontSize(13);
      doc.text("RENTAL AGREEMENT", W-mr, headerTop+3, { align:"right" });
      if (logoUrl) { try { doc.addImage(logoUrl, imgFormatFromDataUrl(logoUrl), W-mr-co.logoW, headerTop+6, co.logoW, co.logoH); } catch (e) { console.warn("Logo addImage failed:", e); } }

      y = headerTop + CONTACTS.length*3.6 + 5;
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.4); doc.line(ml,y,W-mr,y); y+=5;

      doc.setFont(bodyFont,"normal"); doc.setFontSize(8);
      doc.text(`Ref: ${currentRef}`, ml, y);
      doc.text(`Date: ${fmtD(todayDate())}`, W/2, y, { align:"center" });
      doc.text(`Staff: ${staffName}${staffPhone ? " (" + staffPhone + ")" : ""}`, W-mr, y, { align:"right" });
      y += 5;

      // ── Vehicle Details | Renter Details ──
      doc.setFillColor(45,45,45); doc.rect(leftX,y,half,6,"F"); doc.rect(rightX,y,half,6,"F");
      doc.setFont(titleFont,"normal"); doc.setFontSize(8); doc.setTextColor(255,255,255);
      doc.text("VEHICLE DETAILS", leftX+2, y+4.2);
      doc.text("RENTER DETAILS", rightX+2, y+4.2);
      doc.setTextColor(0,0,0); y+=6;

      gridRows([
        [["Plate No.", car.plate],       ["Renter Name", checkout.client]],
        [["Type", car.type],             ["ID Type", idType]],
        [["KM Out", checkout.kmOut],     ["ID No.", idNo]],
        [["Fuel Out", checkout.fuelOut], ["Phone", checkout.clientPhone]],
      ]);
      y+=2;

      // ── Rental Details ──
      sectionHeader("Rental Details");
      gridRows([
        [["Pickup Date", fmtD(checkout.bookedFrom)], ["Return Date", fmtD(checkout.returnDate)]],
        [["Pickup Time", pickupTime], ["Return Time", returnTime]],
        [["Pickup Loc.", checkout.location], ["No. of Days", String(days)]],
        [["Daily Rate", dailyRate?`${checkout.currency||"TZS"} ${fmtNum(dailyRate)}`:"—"], ["Payment Status", checkout.paymentStatus]],
        [["Total Amount", totalAmount?`${checkout.currency||"TZS"} ${fmtNum(totalAmount)}`:checkout.amount?`${checkout.currency||"TZS"} ${fmtNum(checkout.amount)}`:"—"], ["Deposit", deposit?`${checkout.currency||"TZS"} ${fmtNum(deposit)}`:"—"]],
        ...(checkout.driver ? [[["Driver", checkout.driver], ["Driver Phone", checkout.driverPhone || "—"]]] : []),
      ]);
      y+=2;

      // ── Tools & Documents ──
      sectionHeader("Tools & Documents");
      doc.setDrawColor(170,170,170); doc.setLineWidth(0.2);
      const tdRowH = 5, tdRows = Math.max(TOOLS.length, DOCS.length), tdH = tdRows*tdRowH;
      doc.rect(ml,y,cw,tdH);
      for (let i=1;i<tdRows;i++) doc.line(ml,y+i*tdRowH,ml+cw,y+i*tdRowH);
      doc.line(ml+cw/2,y,ml+cw/2,y+tdH);
      doc.setFont(bodyFont,"normal"); doc.setFontSize(7.5);
      for (let i=0;i<tdRows;i++) {
        const ty = y+i*tdRowH+3.6;
        if (TOOLS[i]) { const tx = drawCheckbox(leftX+2, ty, !!tools[TOOLS[i]]); doc.text(TOOLS[i], tx, ty); }
        if (DOCS[i])  { const tx = drawCheckbox(rightX+2, ty, !!docs[DOCS[i]]); doc.text(DOCS[i], tx, ty); }
      }
      y += tdH + 2;

      // ── Vehicle Condition ── (labels + brackets aligned on a fixed column)
      sectionHeader("Vehicle Condition");
      doc.setFont(titleFont,"normal"); doc.setFontSize(7.5);
      doc.setFillColor(230,230,230); doc.rect(leftX,y,half,5,"F"); doc.rect(rightX,y,half,5,"F");
      doc.text("INTERIORS", leftX+2, y+3.5); doc.text("EXTERIORS", rightX+2, y+3.5); y+=5;
      const condRowH = 5, condRows = Math.max(INTERIOR.length, EXTERIOR.length), condH = condRows*condRowH;
      const bracketOffset = 32; // fixed column so every "[ ... ]" lines up regardless of label length
      doc.setDrawColor(170,170,170); doc.setLineWidth(0.2);
      doc.rect(ml,y,cw,condH);
      for (let i=1;i<condRows;i++) doc.line(ml,y+i*condRowH,ml+cw,y+i*condRowH);
      doc.line(ml+cw/2,y,ml+cw/2,y+condH);
      doc.setFont(bodyFont,"normal"); doc.setFontSize(7.5);
      for (let i=0;i<condRows;i++) {
        const ty = y+i*condRowH+3.6;
        if (INTERIOR[i]) { doc.text(`${INTERIOR[i]}:`, leftX+2, ty); doc.text(`[ ${interior[INTERIOR[i]]||"Good"} ]`, leftX+bracketOffset, ty); }
        if (EXTERIOR[i]) { doc.text(`${EXTERIOR[i]}:`, rightX+2, ty); doc.text(`[ ${exterior[EXTERIOR[i]]||"Good"} ]`, rightX+bracketOffset, ty); }
      }
      y += condH + 2;

      // ── Additional Information ──
      sectionHeader("Additional Information");
      const infoBoxH = 18;
      doc.setDrawColor(170,170,170); doc.setLineWidth(0.2); doc.rect(ml,y,cw,infoBoxH);
      doc.setFont(bodyFont,"normal"); doc.setFontSize(8);
      const infoLines = doc.splitTextToSize(additionalInfo || "", cw-4);
      doc.text(infoLines, ml+2, y+5);
      y += infoBoxH + 6;

      // ── Signatures: Client | Staff (auto-applied) ──
      if (signature) { try { doc.addImage(signature, imgFormatFromDataUrl(signature), leftX,y-2,55,22); } catch (e) { console.warn("Client signature addImage failed:", e); } }
      if (staffSignature) { try { doc.addImage(staffSignature, imgFormatFromDataUrl(staffSignature), rightX,y-2,55,22); } catch (e) { console.warn("Staff signature addImage failed:", e); } }
      y += 22;
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.3);
      doc.line(leftX,y,leftX+70,y); doc.line(rightX,y,rightX+70,y); y+=4;
      doc.setFont(bodyFont,"normal"); doc.setFontSize(8);
      doc.text(checkout.client||"Client Name", leftX, y);
      doc.text(staffName||"Staff Name", rightX, y); y+=4;
      doc.setFontSize(7); doc.setTextColor(120,120,120);
      doc.text(`Date & Time Signed: ${new Date().toLocaleString("en-TZ")}`, leftX, y);
      doc.text("Authorised By (SmilesCars)", rightX, y);
      doc.setTextColor(0,0,0);

      // ══════════════════ PAGE 2: TERMS & CONDITIONS ══════════════════
      doc.addPage();
      let y2 = 18;
      doc.setFont(titleFont,"normal"); doc.setFontSize(18);
      doc.text("TERMS AND CONDITIONS", W/2, y2, { align:"center" }); y2+=9;

      doc.setFont(bodyFont,"normal"); doc.setFontSize(8);
      const introLines = doc.splitTextToSize(TERMS_INTRO, cw);
      doc.text(introLines, ml, y2); y2 += introLines.length*4 + 5;

      const ensureRoom = (needed) => { if (y2+needed > H-15) { doc.addPage(); y2=16; } };

      TERMS_SECTIONS.forEach(({heading, clauses}) => {
        ensureRoom(8);
        doc.setFont(titleFont,"normal"); doc.setFontSize(11);
        doc.text(heading, ml, y2); y2+=5.5;
        clauses.forEach(clause => {
          doc.setFont(bodyFont,"normal"); doc.setFontSize(7.8);
          const lines = doc.splitTextToSize(clause, cw);
          ensureRoom(lines.length*3.8+1);
          doc.text(lines, ml, y2);
          y2 += lines.length*3.8 + 1.2;
        });
        y2 += 2.5;
      });

      // Acceptance line — date auto-filled, signature auto-embedded from the client's captured signature
      ensureRoom(26);
      y2 += 4;
      doc.setFont(bodyFont,"normal"); doc.setFontSize(8);
      doc.text(`I, ${checkout.client||"_______________________________"} have read and accepted the above car rental terms and conditions.`, ml, y2);
      y2 += 10;
      if (signature) { try { doc.addImage(signature, imgFormatFromDataUrl(signature), ml+98, y2-9, 40, 12); } catch (e) { console.warn("Page 2 signature addImage failed:", e); } }
      doc.text("Date:", ml, y2); doc.setFont(bodyFont,"bold"); doc.text(fmtD(todayDate()), ml+12, y2); doc.line(ml+12,y2+1,ml+70,y2+1);
      doc.setFont(bodyFont,"normal"); doc.text("Signature:", ml+80, y2); doc.line(ml+98, y2+1, W-mr, y2+1);
      y2 += 12;

      doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(ml,y2,W-mr,y2); y2+=5;
      doc.setFontSize(7.5);
      OFFICES.forEach(([label, addr]) => {
        doc.setFont(bodyFont,"bold"); doc.text(label, ml, y2);
        doc.setFont(bodyFont,"normal"); doc.text(addr, ml+38, y2);
        y2 += 4.2;
      });

      const blob = doc.output("blob");
      const safeFilename = currentRef.replace(/\//g, "-") + ".pdf";
      setPdfReady({ blob, refNo: currentRef, filename: safeFilename, driveUrl: null, storing: true });

      // Store a permanent copy in Drive — non-blocking: download/share still work even if this fails.
      try {
        const base64 = await blobToBase64(blob);
        const res = await post({ action:"uploadAgreement", refNo: currentRef, plate: car.plate, client: checkout.client, staffName, base64 });
        setPdfReady(prev => prev ? { ...prev, driveUrl: res && res.success ? res.url : null, storing: false } : prev);
      } catch {
        setPdfReady(prev => prev ? { ...prev, driveUrl: null, storing: false } : prev);
      }
    } catch(e) { alert("PDF error: "+e.message); }
    finally { setSaving(false); }
  };

  if (pdfReady) {
    const { blob, refNo, filename, driveUrl, storing } = pdfReady;
    const dl = () => { const u=URL.createObjectURL(blob),a=document.createElement("a"); a.href=u; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(u),5000); };
    const sh = async () => { const f=new File([blob],filename,{type:"application/pdf"}); if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:refNo});}catch{}}else dl(); };
    const wa = async () => { const f=new File([blob],filename,{type:"application/pdf"}); if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:refNo,text:`Rental Agreement ${refNo}`});}catch{}}else window.open(`https://wa.me/?text=${encodeURIComponent(`Rental Agreement ${refNo}`)},"_blank`); };
    return (
      <div style={S.overlay}>
        <div style={{ background:"#fff",borderRadius:16,width:340,maxWidth:"calc(100% - 32px)",padding:"2rem",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize:48,marginBottom:12 }}>✅</div>
          <h3 style={{ fontSize:18,fontWeight:700,color:"#111",margin:"0 0 6px" }}>Agreement Ready</h3>
          <p style={{ fontSize:14,color:"#888",margin:"0 0 8px" }}>Ref: <strong style={{ color:"#111" }}>{refNo}</strong></p>
          <p style={{ fontSize:12,margin:"0 0 20px" }}>
            {storing && <span style={{ color:"#f59e0b" }}>⏳ Saving a permanent copy…</span>}
            {!storing && driveUrl && <span style={{ color:"#16a34a" }}>✅ Permanent copy saved</span>}
            {!storing && !driveUrl && <span style={{ color:"#dc2626" }}>⚠️ Could not save a permanent copy — please download/share now</span>}
          </p>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            <button type="button" onClick={dl} style={{ padding:"12px",fontSize:14,fontWeight:600,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:10,cursor:"pointer" }}>⬇ Download PDF</button>
            <button type="button" onClick={sh} style={{ padding:"12px",fontSize:14,fontWeight:600,background:"#f0fdf4",color:"#15803d",border:"1.5px solid #bbf7d0",borderRadius:10,cursor:"pointer" }}>📤 Share</button>
            <button type="button" onClick={wa} style={{ padding:"12px",fontSize:14,fontWeight:600,background:"#dcfce7",color:"#15803d",border:"1.5px solid #86efac",borderRadius:10,cursor:"pointer" }}>💬 Share to WhatsApp</button>
            {driveUrl && <button type="button" onClick={()=>window.open(driveUrl,"_blank")} style={{ padding:"12px",fontSize:14,fontWeight:600,background:"#f5f3ff",color:"#6d28d9",border:"1.5px solid #ddd6fe",borderRadius:10,cursor:"pointer" }}>📄 View Stored Copy</button>}
            <button type="button" onClick={onClose} style={{ padding:"10px",fontSize:13,background:"none",color:"#888",border:"none",cursor:"pointer",marginTop:4 }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <>
        <div style={{ background:"#16a34a",padding:"1rem 1.25rem",borderRadius: embedded ? 0 : "14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
          <div><p style={{ fontSize:15,fontWeight:700,color:"#fff",margin:0 }}>Rental Agreement</p><p style={{ fontSize:11,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" }}>{car.plate} · {checkout.client} · {refNo || "loading ref…"}</p></div>
          {!embedded && <button type="button" onClick={onClose} style={{ background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:14 }}>✕</button>}
        </div>

        <div style={{ overflowY:"auto",flex:1,padding:"1.25rem" }}>
          {/* Company / logo selector — very top */}
          <p style={S.sec}>Agreement Branding</p>
          <div style={{ display:"flex",gap:16,marginBottom:16 }}>
            {Object.entries(COMPANIES).map(([key,c])=>(
              <label key={key} style={{ display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13,fontWeight:600,color: company===key?"#111":"#888" }}>
                <input type="radio" name="company" checked={company===key} onChange={()=>setCompany(key)} style={{ width:16,height:16,cursor:"pointer" }} />
                {c.label}
              </label>
            ))}
          </div>

          {/* Renter ID */}
          <p style={S.sec}>Renter ID</p>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>ID Type</label>
              <select style={{ ...S.input,fontFamily:"inherit" }} value={idType} onChange={e=>setIdType(e.target.value)}>
                {ID_TYPES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={S.field}><label style={S.label}>ID No.</label><input style={S.input} value={idNo} onChange={e=>setIdNo(e.target.value)} placeholder="ID / license number" /></div>
          </div>

          {/* Rental */}
          <p style={S.sec}>Rental Details</p>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Pickup Time</label><input style={S.input} type="time" value={pickupTime} onChange={e=>setPickupTime(e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Return Time</label><input style={S.input} type="time" value={returnTime} onChange={e=>setReturnTime(e.target.value)} /></div>
          </div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Daily Rate ({checkout.currency||"TZS"})</label>
              <input style={S.input} type="text" inputMode="numeric" value={dailyRate} onChange={e=>{const d=e.target.value.replace(/[^\d]/g,""); setDailyRate(d?Number(d).toLocaleString("en-US"):"");}} placeholder="e.g. 150,000" /></div>
            <div style={S.field}><label style={S.label}>Deposit <span style={{ color:"#aaa",fontWeight:400 }}>(optional)</span></label>
              <input style={S.input} type="text" inputMode="numeric" value={deposit} onChange={e=>{const d=e.target.value.replace(/[^\d]/g,""); setDeposit(d?Number(d).toLocaleString("en-US"):"");}} placeholder="e.g. 200,000" /></div>
          </div>
          {dailyRate&&<p style={{ fontSize:12,color:"#16a34a",margin:"-8px 0 12px",fontWeight:600 }}>Total: {checkout.currency||"TZS"} {fmtNum(Number(String(dailyRate).replace(/,/g,""))*days)} ({days} day{days>1?"s":""})</p>}

          {/* Tools */}
          <p style={S.sec}>Tools in Car</p>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",marginBottom:12 }}>
            {TOOLS.map(t=><label key={t} style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#374151" }}><input type="checkbox" checked={!!tools[t]} onChange={()=>setTools(p=>({...p,[t]:!p[t]}))} style={{ width:15,height:15,cursor:"pointer" }}/>{t}</label>)}
          </div>

          {/* Docs */}
          <p style={S.sec}>Documents in Car</p>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",marginBottom:12 }}>
            {DOCS.map(d=><label key={d} style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#374151" }}><input type="checkbox" checked={!!docs[d]} onChange={()=>setDocs(p=>({...p,[d]:!p[d]}))} style={{ width:15,height:15,cursor:"pointer" }}/>{d}</label>)}
          </div>

          {/* Interior */}
          <p style={S.sec}>Interior Condition</p>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",marginBottom:12 }}>
            {INTERIOR.map(item=><div key={item} style={S.field}><label style={S.label}>{item}</label><select style={{ ...S.input,fontFamily:"inherit" }} value={interior[item]||"Good"} onChange={e=>setInterior(p=>({...p,[item]:e.target.value}))}>{CONDITION_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></div>)}
          </div>

          {/* Exterior */}
          <p style={S.sec}>Exterior Condition</p>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",marginBottom:12 }}>
            {EXTERIOR.map(item=><div key={item} style={S.field}><label style={S.label}>{item}</label><select style={{ ...S.input,fontFamily:"inherit" }} value={exterior[item]||"Good"} onChange={e=>setExterior(p=>({...p,[item]:e.target.value}))}>{CONDITION_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></div>)}
          </div>

          {/* Additional Information */}
          <p style={S.sec}>Additional Information</p>
          <div style={S.field}><textarea style={S.textarea} rows={3} value={additionalInfo} onChange={e=>setAdditionalInfo(e.target.value)} placeholder="e.g. scratch on rear bumper noted, special agreement terms, etc." /></div>

          {/* Staff Signature — captured once, reused automatically */}
          <p style={S.sec}>Staff Signature ({staffName})</p>
          {staffSignature ? (
            <div style={{ background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:12,textAlign:"center",marginBottom:12 }}>
              <img src={staffSignature} alt="Staff signature" style={{ maxHeight:60,border:"1px solid #e5e7eb",borderRadius:6,background:"#fff" }} />
              <p style={{ fontSize:12,color:"#1d4ed8",margin:"8px 0 0",fontWeight:600 }}>✅ On file — applied automatically to every agreement</p>
              <div style={{ display:"flex",gap:12,justifyContent:"center",marginTop:6 }}>
                <button type="button" onClick={()=>setStaffSignature(null)} style={{ fontSize:11,color:"#1d4ed8",background:"none",border:"none",cursor:"pointer" }}>Re-capture</button>
                <button type="button" onClick={removeStaffSignature} style={{ fontSize:11,color:"#dc2626",background:"none",border:"none",cursor:"pointer" }}>🗑️ Remove permanently (e.g. staff resigned)</button>
              </div>
            </div>
          ) : staffSigLoaded ? (
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12,color:"#888",margin:"0 0 8px" }}>No signature on file yet for {staffName}. Add one once — it'll be reused automatically from now on.</p>
              <div style={{ display:"flex",gap:8,marginBottom:10 }}>
                {[["pad","✍️ Draw Signature"],["upload","📁 Upload Photo/File"]].map(([m,l])=>(
                  <button type="button" key={m} onClick={()=>setStaffSigMode(m)}
                    style={{ flex:1,padding:"7px",fontSize:12,fontWeight:600,borderRadius:8,border:`1.5px solid ${staffSigMode===m?"#1d4ed8":"#e5e7eb"}`,background:staffSigMode===m?"#eff6ff":"#fff",color:staffSigMode===m?"#1d4ed8":"#555",cursor:"pointer" }}>
                    {l}
                  </button>
                ))}
              </div>
              {staffSigMode==="pad"    && <SignaturePad onSigned={saveStaffSignature} />}
              {staffSigMode==="upload" && <SignatureUpload onSigned={saveStaffSignature} />}
            </div>
          ) : (
            <p style={{ fontSize:12,color:"#aaa",marginBottom:12 }}>Checking for a saved signature…</p>
          )}

          {/* Signature */}
          <p style={S.sec}>Client Signature</p>
          {signature ? (
            <div style={{ background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:12,textAlign:"center",marginBottom:12 }}>
              <img src={signature} alt="Signature" style={{ maxHeight:80,border:"1px solid #e5e7eb",borderRadius:6,background:"#fff" }} />
              <p style={{ fontSize:12,color:"#15803d",margin:"8px 0 0",fontWeight:600 }}>✅ Signature received</p>
              <button type="button" onClick={()=>{setSignature(null);setSigStatus("");}} style={{ fontSize:11,color:"#888",background:"none",border:"none",cursor:"pointer",marginTop:4 }}>Clear signature</button>
            </div>
          ) : (
            <div>
              <div style={{ display:"flex",gap:8,marginBottom:12 }}>
                {[["qr","📱 QR Code (client's phone)"],["pad","✍️ Sign here (this device)"],["upload","📁 Upload Photo/File"]].map(([m,l])=>(
                  <button type="button" key={m} onClick={()=>setSigMode(m)}
                    style={{ flex:1,padding:"8px",fontSize:12,fontWeight:600,borderRadius:8,border:`1.5px solid ${sigMode===m?"#1d4ed8":"#e5e7eb"}`,background:sigMode===m?"#eff6ff":"#fff",color:sigMode===m?"#1d4ed8":"#555",cursor:"pointer" }}>
                    {l}
                  </button>
                ))}
              </div>

              {sigMode==="qr" && (
                <div style={{ textAlign:"center",padding:"16px 0" }}>
                  <QRCodeDisplay token={qrToken} />
                  <div style={{ marginTop:12 }}>
                    {sigStatus==="" && <button type="button" onClick={startPolling} style={{ padding:"8px 20px",fontSize:13,fontWeight:600,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}>Start Waiting for Signature</button>}
                    {sigStatus==="waiting" && <p style={{ color:"#0284c7",fontSize:13,fontWeight:600 }}>⏳ Waiting for client to sign…</p>}
                    {sigStatus==="received" && <p style={{ color:"#16a34a",fontSize:13,fontWeight:600 }}>✅ Signature received!</p>}
                  </div>
                </div>
              )}

              {sigMode==="pad" && <SignaturePad onSigned={(sig)=>setSignature(sig)} />}
              {sigMode==="upload" && <SignatureUpload onSigned={(sig)=>setSignature(sig)} />}
            </div>
          )}
        </div>

        <div style={{ padding:"1rem 1.25rem",borderTop:"1px solid #f3f4f6",flexShrink:0 }}>
          <button type="button" style={{ width:"100%",padding:"12px",fontSize:14,fontWeight:600,background:"#16a34a",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",opacity:saving?0.65:1 }}
            onClick={generatePDF} disabled={saving}>
            {saving?"Generating…":"Generate Agreement PDF →"}
          </button>
          {!signature && <p style={{ fontSize:11,color:"#f59e0b",textAlign:"center",margin:"6px 0 0" }}>⚠️ No signature yet — PDF will have empty signature line</p>}
        </div>
    </>
  );

  if (embedded) return <div style={{ display:"flex",flexDirection:"column",flex:1,minHeight:0 }}>{content}</div>;

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, width:600 }}>{content}</div>
    </div>
  );
}

const S = {
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16 },
  modal:   { background:"#fff",borderRadius:14,maxWidth:"100%",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(0,0,0,0.2)" },
  sec:     { fontSize:12,fontWeight:700,color:"#7c3aed",textTransform:"uppercase",letterSpacing:".5px",margin:"0 0 8px",padding:"6px 0",borderBottom:"1px solid #f3f4f6" },
  two:     { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 },
  field:   { marginBottom:"0.75rem" },
  label:   { fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 },
  input:   { width:"100%",padding:"8px 10px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",boxSizing:"border-box",fontFamily:"inherit" },
  textarea:{ width:"100%",padding:"8px 10px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" },
};
