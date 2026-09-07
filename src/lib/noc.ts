import { fmtDate } from "@/lib/dates";
import { jsPDF } from "jspdf";

export type NocBranding = {
  orgName: string;
  address: string;
  contact: string;
  signatureLine: string;
  logoDataUrl?: string | null;
  stampDataUrl?: string | null;
};

export type NocData = {
  studentName: string;
  messNo: string | null;
  room: string | null;
  unitName: string | null;
  mobile: string | null;
  subscriptionPeriods: { start: string; end: string }[];
  issueDate: string; // YYYY-MM-DD
  rollNumber?: string | null;
  joiningDate?: string | null;
  exitDate?: string | null;
  due?: number;
};

function formatDate(iso: string) {
  return fmtDate(iso);
}

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg") ? "JPEG" : "PNG";
}

export function generateNocPdf(brand: NocBranding, data: NocData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // Letterhead: logo (left) + org details (right/center)
  if (brand.logoDataUrl) {
    try {
      doc.addImage(brand.logoDataUrl, detectImageFormat(brand.logoDataUrl), margin, y, 28, 28);
    } catch {
      /* ignore malformed image */
    }
  }

  const headerX = brand.logoDataUrl ? margin + 34 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(120, 53, 15); // deep saffron
  doc.text(brand.orgName || "Vrindavan Meals", headerX, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  if (brand.address) {
    const lines = doc.splitTextToSize(brand.address, pageWidth - headerX - margin);
    doc.text(lines, headerX, y + 14);
  }
  if (brand.contact) {
    doc.text(brand.contact, headerX, y + 26);
  }

  y += 34;
  doc.setDrawColor(200, 100, 40);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text("NO OBJECTION CERTIFICATE", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Issue Date: ${formatDate(data.issueDate)}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  // Body
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("To Whom It May Concern,", margin, y);
  y += 8;

  const intro =
    `This is to certify that the following student has availed the mess/canteen services and, as of the date of issue of this certificate, ` +
    `has no outstanding dues or pending payments against their account with ${brand.orgName || "Vrindavan Meals"}.`;
  const introLines = doc.splitTextToSize(intro, pageWidth - margin * 2);
  doc.text(introLines, margin, y);
  y += introLines.length * 5 + 4;

  // Student detail block
  const rows: [string, string][] = [
    ["Mess Number", data.messNo || "—"],
    ["Student Name", data.studentName],
    ["Room / Unit", [data.room, data.unitName].filter(Boolean).join(" · ") || "—"],
  ];
  if (data.mobile) rows.push(["Mobile", data.mobile]);
  doc.setFont("helvetica", "bold");
  rows.forEach(([k]) => {
    doc.text(k, margin, y);
    y += 6;
  });
  y -= rows.length * 6;
  doc.setFont("helvetica", "normal");
  rows.forEach(([, v]) => {
    doc.text(":  " + v, margin + 45, y);
    y += 6;
  });
  y += 4;

  // Subscription periods
  if (data.subscriptionPeriods.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Subscription Period(s):", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    data.subscriptionPeriods.forEach((p) => {
      doc.text(`•  ${formatDate(p.start)}  →  ${formatDate(p.end)}`, margin + 4, y);
      y += 5;
    });
    y += 4;
  }

  // No dues statement
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const noDues = "There are no dues pending against the above-named student as on the date of this certificate.";
  const nlines = doc.splitTextToSize(noDues, pageWidth - margin * 2);
  doc.text(nlines, margin, y);
  y += nlines.length * 6 + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    "This certificate is issued upon request for the student's use and record.",
    margin,
    y,
  );
  y += 20;

  // Signature / stamp block (bottom right)
  const sigX = pageWidth - margin - 60;
  const sigY = Math.max(y, doc.internal.pageSize.getHeight() - 55);
  if (brand.stampDataUrl) {
    try {
      doc.addImage(brand.stampDataUrl, detectImageFormat(brand.stampDataUrl), sigX, sigY - 26, 40, 25);
    } catch {
      /* ignore */
    }
  }
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.line(sigX, sigY, sigX + 60, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(brand.signatureLine || "Authorised Signatory", sigX, sigY + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.setFontSize(9);
  doc.text(brand.orgName || "Vrindavan Meals", sigX, sigY + 11);

  return doc;
}

function esc(v: string) {
  return v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/**
 * Compact 80mm thermal NOC — receipt density, same print width approach as POS receipts.
 */
export function printNocThermal(brand: NocBranding, data: NocData) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) throw new Error("Popup blocked — allow popups to print the NOC");

  const org = brand.orgName || "Vrindavan Meals";
  const rows: [string, string][] = [["Name", data.studentName]];
  if (data.messNo) rows.push(["Mess No", data.messNo]);
  if (data.rollNumber) rows.push(["Roll No", data.rollNumber]);
  if (data.joiningDate) rows.push(["Joined", formatDate(data.joiningDate)]);
  if (data.exitDate) rows.push(["Exit", formatDate(data.exitDate)]);
  const due = Number(data.due ?? 0);
  const statement =
    due > 0
      ? `Outstanding due of Rs ${due.toFixed(0)} pending as on date of issue.`
      : "No dues are pending against the above student as on date of issue.";

  w.document.write(`
<html><head><title>NOC — ${esc(data.studentName)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: monospace; font-size: 12px; width: 72mm; }
  h2 { text-align:center; margin:0; font-size:14px; }
  .logo { display:block; margin:0 auto 4px; max-height:36px; max-width:36mm; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display:flex; justify-content:space-between; gap:6px; }
  .row span:last-child { text-align:right; }
  .title { text-align:center; font-weight:bold; margin:4px 0; }
  .stmt { margin: 4px 0; }
  .sig { margin-top: 18px; text-align:right; }
  .sig .ln { border-top:1px solid #000; display:inline-block; width:40mm; }
</style></head><body>
${brand.logoDataUrl ? `<img class="logo" src="${brand.logoDataUrl}" />` : ""}
<h2>${esc(org)}</h2>
${brand.address ? `<div style="text-align:center;font-size:10px">${esc(brand.address)}</div>` : ""}
${brand.contact ? `<div style="text-align:center;font-size:10px">${esc(brand.contact)}</div>` : ""}
<div class="line"></div>
<div class="title">NO OBJECTION CERTIFICATE</div>
<div class="line"></div>
${rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}
<div class="line"></div>
<div class="stmt">${esc(statement)}</div>
<div class="line"></div>
<div class="row"><span>Issued on</span><span>${formatDate(data.issueDate)}</span></div>
<div class="sig">
  <div class="ln"></div>
  <div>${esc(brand.signatureLine || "Authorised Signatory")}</div>
  <div style="font-size:10px">${esc(org)}</div>
</div>
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
</body></html>
  `);
  w.document.close();
}
