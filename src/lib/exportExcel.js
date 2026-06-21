// src/lib/exportExcel.js
import * as XLSX from "xlsx";

export function exportToExcel(filename, sheets) {
  // sheets = [{ name: "Fleet", rows: [...] }, { name: "History", rows: [...] }]
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  });
  XLSX.writeFile(wb, filename);
}
