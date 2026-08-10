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
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });
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
