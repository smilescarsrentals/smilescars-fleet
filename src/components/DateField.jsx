// src/components/DateField.jsx
// A plain <input type="date"> shows nothing when empty on most mobile
// browsers, which makes an unfilled date filter look like a broken box.
// This wraps it with a small persistent label + calendar icon so it's
// always identifiable, even with no value selected.
export default function DateField({ label, value, onChange, style, title }) {
  return (
    <div className="sc-date-field">
      <span className="sc-date-field-label">📅 {label}</span>
      <input type="date" value={value} onChange={onChange} style={style} title={title || label} />
    </div>
  );
}
