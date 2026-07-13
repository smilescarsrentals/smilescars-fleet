import { useState } from "react";

// Reusable multi-select filter dropdown. Looks/behaves like a normal <select>
// from the outside (same trigger styling passed in via `style`), but opens a
// checkbox list instead of a native listbox, and tracks an array of selected
// values instead of one.
//
// Usage:
//   <MultiSelect label="All statuses" options={["Available","Rented"]}
//     selected={fStatus} onChange={setFStatus} style={sel} />
export default function MultiSelect({ label, options, selected, onChange, style }) {
  const [open, setOpen] = useState(false);

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(v => v !== opt));
    else onChange([...selected, opt]);
  };

  const displayText =
    selected.length === 0 ? label :
    selected.length === 1 ? selected[0] :
    `${selected.length} selected`;

  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ ...style, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", textAlign: "left" }}>
        <span style={{ color: selected.length > 0 ? "#111" : undefined }}>{displayText}</span>
        <span style={{ fontSize: 10, color: "#999", marginLeft: "auto" }}>▾</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, minWidth: 180, background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 260, overflowY: "auto" }}>
          {options.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f9fafb" }}
              onMouseDown={e => e.preventDefault()}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ width: 14, height: 14, cursor: "pointer" }} />
              <span>{opt}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange([])}
              style={{ width: "100%", padding: "7px 12px", fontSize: 12, color: "#888", background: "none", border: "none", borderTop: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left" }}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
