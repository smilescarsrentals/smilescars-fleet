import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { post } from "../lib/api";

export default function SignaturePage() {
  const { token }    = useParams();
  const canvasRef    = useRef(null);
  const [drawing,    setDrawing]   = useState(false);
  const [hasStrokes, setHasStrokes]= useState(false);
  const [submitted,  setSubmitted] = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [error,      setError]     = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const saved = canvas.toDataURL();
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const img = new Image();
      img.onload = () => canvas.getContext("2d").drawImage(img, 0, 0);
      img.src = saved;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = "#111";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    setDrawing(true);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
  };

  const stopDraw = (e) => { e.preventDefault(); setDrawing(false); };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const submit = async () => {
    if (!hasStrokes) { setError("Please sign before submitting."); return; }
    setSaving(true); setError("");
    try {
      const signature = canvasRef.current.toDataURL("image/png");
      const res = await post({ action:"storeSignature", token, signature });
      if (res.success) setSubmitted(true);
      else throw new Error(res.error || "Failed to submit");
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (submitted) return (
    <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0fdf4",padding:24 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:72,marginBottom:16 }}>✅</div>
        <h2 style={{ fontSize:22,fontWeight:700,color:"#15803d",margin:"0 0 8px" }}>Signature Submitted</h2>
        <p style={{ fontSize:15,color:"#555",margin:0 }}>Thank you! You may close this page.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",display:"flex",flexDirection:"column",background:"#f9fafb" }}>
      {/* Header */}
      <div style={{ background:"#1d4ed8",padding:"16px 20px",textAlign:"center" }}>
        <div style={{ fontSize:16,fontWeight:700,color:"#fff" }}>SmilesCars Rental Agreement</div>
        <div style={{ fontSize:12,color:"rgba(255,255,255,0.75)",marginTop:4 }}>Please sign below to confirm you agree to the rental terms</div>
      </div>

      {/* Signature pad */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:20,maxWidth:480,margin:"0 auto",width:"100%",boxSizing:"border-box" }}>
        <p style={{ fontSize:13,color:"#374151",margin:"0 0 12px",fontWeight:500 }}>Draw your signature in the box below:</p>

        <div style={{ border:"2px solid #e5e7eb",borderRadius:12,background:"#fff",overflow:"hidden",flex:1,minHeight:260,position:"relative",touchAction:"none" }}>
          <canvas ref={canvasRef}
            style={{ width:"100%",height:"100%",display:"block",cursor:"crosshair",touchAction:"none" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          {!hasStrokes && (
            <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
              <span style={{ color:"#d1d5db",fontSize:14 }}>Sign here</span>
            </div>
          )}
        </div>

        {error && <p style={{ color:"#dc2626",fontSize:13,margin:"8px 0 0",textAlign:"center" }}>{error}</p>}

        <div style={{ display:"flex",gap:10,marginTop:16 }}>
          <button onClick={clear}
            style={{ flex:1,padding:"13px",fontSize:14,fontWeight:600,background:"#f3f4f6",color:"#374151",border:"1.5px solid #e5e7eb",borderRadius:10,cursor:"pointer" }}>
            Clear
          </button>
          <button onClick={submit} disabled={saving||!hasStrokes}
            style={{ flex:2,padding:"13px",fontSize:14,fontWeight:600,background:hasStrokes?"#1d4ed8":"#9ca3af",color:"#fff",border:"none",borderRadius:10,cursor:hasStrokes?"pointer":"not-allowed",opacity:saving?0.7:1 }}>
            {saving ? "Submitting…" : "Submit Signature"}
          </button>
        </div>

        <p style={{ fontSize:11,color:"#9ca3af",textAlign:"center",marginTop:12 }}>
          By signing, you confirm you have read and agree to the SmilesCars rental terms and conditions.
        </p>
      </div>
    </div>
  );
}
