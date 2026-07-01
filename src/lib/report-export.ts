import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ExportOpts {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
}

export function exportPdf({ title, subtitle, columns, rows, filename }: ExportOpts) {
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text(title, 14, 16);
  doc.setFontSize(10); doc.setTextColor(100);
  if (subtitle) doc.text(subtitle, 14, 22);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 28);
  autoTable(doc, { head: [columns], body: rows, startY: 34, styles: { fontSize: 9 } });
  doc.save(filename + ".pdf");
}

export function exportExcel({ title, columns, rows, filename }: ExportOpts) {
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
  XLSX.writeFile(wb, filename + ".xlsx");
}
