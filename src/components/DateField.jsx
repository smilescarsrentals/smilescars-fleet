// src/components/DateField.jsx
// Native <input type="date"> shows nothing when empty — no placeholder text
// is rendered by the browser — which makes an unfilled date filter look like
// a broken/blank box. This overlays plain text inside the box (like a
// placeholder) that disappears the moment a date is picked, matching how a
// normal text input behaves. No icon, no external label.
export default function DateField({ label, value, onChange, style, title }) {
  return (
    <div className="sc-date-field">
      <input type="date" value={value} onChange={onChange} style={style} title={title || label} />
      {!value && <span className="sc-date-field-placeholder">{label}</span>}
    </div>
  );
}
