import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { money, fmtDate, fmtDateTime } from './format';
import { api } from './api';

// ---------------- Company info cache ----------------
let companyCache: Record<string, string> | null = null;
export async function company() {
  await loadLogo();
  if (!companyCache) companyCache = await api('/settings/company').catch(() => ({}));
  return companyCache!;
}
export const resetCompanyCache = () => (companyCache = null);

// ---------------- Arabic font support ----------------
let amiri: string | null = null;
async function ensureArabic(doc: jsPDF, text: string) {
  if (!/[؀-ۿ]/.test(text)) return false;
  if (!amiri) {
    const buf = await fetch(import.meta.env.BASE_URL + 'fonts/Amiri-Regular.ttf').then((r) => r.arrayBuffer());
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    amiri = btoa(s);
  }
  doc.addFileToVFS('Amiri-Regular.ttf', amiri);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.setFont('Amiri');
  return true;
}

/** Brand color (red MAX FIT by default, follows the CMS primary color). */
function brandRGB(): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().split(/s+/).map(Number);
  return v.length === 3 && v.every((x) => !isNaN(x)) ? (v as [number, number, number]) : [211, 1, 12];
}
const LIME = brandRGB();
let logoData: string | null = null;
async function loadLogo() {
  if (logoData) return;
  try {
    const b = await fetch(import.meta.env.BASE_URL + 'brand/logo-night.png').then((r) => r.blob());
    logoData = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); });
  } catch { /* fallback to drawn mark */ }
}
const INK: [number, number, number] = [11, 13, 16];

function header(doc: jsPDF, c: Record<string, string>, title: string, number: string, font: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, w, 30, 'F');
  if (logoData) doc.addImage(logoData, 'PNG', 10, 3.5, 34, 23);
  else { doc.setFillColor(...LIME); doc.roundedRect(12, 7, 16, 16, 3, 3, 'F'); }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(c.company_name || 'MAX FIT', 48, 14);
  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  doc.text([c.legal_name || '', `${c.address || ''}${c.phone ? '  •  ' + c.phone : ''}`, c.tax_id ? `MF : ${c.tax_id}` : ''].filter(Boolean), 48, 19);
  doc.setFont(font, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...LIME);
  doc.text(title.toUpperCase(), w - 12, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(number, w - 12, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}
function footer(doc: jsPDF, c: Record<string, string>, font: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140);
    if (c.invoice_footer) doc.text(c.invoice_footer, 12, h - 10);
    doc.text('SMART GYM 360 — Developed by GM LAC', w / 2, h - 6, { align: 'center' });
    doc.text(`${i} / ${pages}`, w - 12, h - 6, { align: 'right' });
  }
}
function signature(doc: jsPDF, y: number, c: Record<string, string>, font: string, left = 'Signature', right = 'Cachet') {
  const w = doc.internal.pageSize.getWidth();
  doc.setTextColor(0, 0, 0);
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.setDrawColor(180);
  doc.roundedRect(12, y, 80, 28, 2, 2);
  doc.roundedRect(w - 92, y, 80, 28, 2, 2);
  doc.text(`${left} — ${c.signatory || ''}`, 15, y + 5);
  doc.text(right, w - 89, y + 5);
}
function output(doc: jsPDF, name: string, mode: 'download' | 'print' = 'download') {
  if (mode === 'print') {
    doc.autoPrint();
    const url = doc.output('bloburl');
    window.open(url as unknown as string, '_blank');
  } else doc.save(name);
}
const methodLbl: Record<string, string> = { cash: 'Espèces', transfer: 'Virement', card: 'Carte bancaire', cheque: 'Chèque', other: 'Autre' };
export const METHOD_LABEL = methodLbl;

// ---------------- Receipt ----------------
export async function receiptPDF(id: number, mode: 'download' | 'print' = 'download') {
  const [r, c] = await Promise.all([api(`/receipts/${id}`), company()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const font = (await ensureArabic(doc, `${r.first_name} ${r.last_name}`)) ? 'Amiri' : 'helvetica';
  header(doc, c, 'Reçu de paiement', r.number, font);
  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  const rows: [string, string][] = [
    ['Date', fmtDateTime(r.issued_at)],
    ['Client', r.first_name ? `${r.first_name} ${r.last_name} (${r.matricule})` : '—'],
    ['Objet', r.plan_name ? `Abonnement ${r.plan_name} — ${r.subscription_reference}` : r.notes || r.source],
    ...(r.start_date ? [['Période', `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`] as [string, string]] : []),
    ['Mode de paiement', methodLbl[r.method] || r.method],
    ['Montant payé', money(r.amount)],
    ['Reste à payer', money(r.remaining)],
    ['Encaissé par', r.user_name || '—'],
  ];
  autoTable(doc, { startY: 36, body: rows, theme: 'plain', styles: { font, fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } } });
  const y = (doc as any).lastAutoTable.finalY + 4;
  doc.setFillColor(...LIME);
  doc.roundedRect(12, y, doc.internal.pageSize.getWidth() - 24, 14, 2, 2, 'F');
  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`MONTANT REÇU : ${money(r.amount)}`, doc.internal.pageSize.getWidth() / 2, y + 9, { align: 'center' });
  signature(doc, y + 22, c, font);
  footer(doc, c, font);
  output(doc, `${r.number}.pdf`, mode);
}

// ---------------- Quote / Invoice ----------------
export async function commercialPDF(kind: 'quotation' | 'invoice', id: number, mode: 'download' | 'print' = 'download') {
  const [d, c] = await Promise.all([api(`/${kind === 'quotation' ? 'quotations' : 'invoices'}/${id}`), company()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const font = (await ensureArabic(doc, JSON.stringify(d))) ? 'Amiri' : 'helvetica';
  header(doc, c, kind === 'quotation' ? 'Devis' : 'Facture', d.number, font);
  const w = doc.internal.pageSize.getWidth();
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  doc.text('Client', w - 90, 40);
  doc.setFont(font, 'normal');
  doc.text([d.client_name || d.prospect_name || '—', d.client_phone || d.prospect_phone || '', d.customer_tax_id ? `MF : ${d.customer_tax_id}` : '', d.matricule ? `Matricule : ${d.matricule}` : ''].filter(Boolean), w - 90, 46);
  doc.text([`Date : ${fmtDate(d.issue_date)}`, kind === 'quotation' ? `Valable jusqu’au : ${fmtDate(d.valid_until)}` : `Échéance : ${fmtDate(d.due_date)}`], 12, 40);
  autoTable(doc, {
    startY: 64,
    head: [['Désignation', 'Qté', 'P.U. HT', 'Remise', 'Total HT']],
    body: d.items.map((i: any) => [i.designation, i.quantity, money(i.unit_price), i.discount_bp ? `${i.discount_bp / 100}%` : '—', money(i.total)]),
    styles: { font, fontSize: 9 },
    headStyles: { fillColor: INK, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } },
  });
  let y = (doc as any).lastAutoTable.finalY + 6;
  const tot: [string, string][] = [['Total HT', money(d.total_ht)], [`TVA (${d.vat_rate_bp / 100}%)`, money(d.total_vat)]];
  if (d.stamp_duty) tot.push(['Timbre fiscal', money(d.stamp_duty)]);
  tot.push(['Total TTC', money(d.total_ttc)]);
  if (kind === 'invoice') tot.push(['Déjà payé', money(d.amount_paid)], ['Reste à payer', money(d.total_ttc - d.amount_paid)]);
  autoTable(doc, { startY: y, body: tot, theme: 'plain', margin: { left: w - 90 }, styles: { font, fontSize: 10 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } });
  y = (doc as any).lastAutoTable.finalY + 8;
  if (d.conditions || d.notes) {
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(`Conditions : ${d.conditions || d.notes}`, w - 24), 12, y);
    y += 14;
  }
  if (kind === 'invoice' && d.payments?.length) {
    autoTable(doc, { startY: y, head: [['Paiement', 'Date', 'Mode', 'Montant']], body: d.payments.map((p: any) => [p.receipt_number || p.reference, fmtDate(p.paid_at), methodLbl[p.method], money(p.amount)]), styles: { font, fontSize: 8 }, headStyles: { fillColor: [60, 60, 60] } });
    y = (doc as any).lastAutoTable.finalY + 8;
  }
  signature(doc, Math.min(y, 240), c, font, kind === 'quotation' ? 'Bon pour accord' : 'Signature');
  footer(doc, c, font);
  output(doc, `${d.number}.pdf`, mode);
}

// ---------------- Payslip ----------------
export async function payslipPDF(period: any, records: any[], mode: 'download' | 'print' = 'download') {
  const c = await company();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const font = (await ensureArabic(doc, JSON.stringify(records.map((r) => r.first_name + r.last_name)))) ? 'Amiri' : 'helvetica';
  const w = doc.internal.pageSize.getWidth();
  records.forEach((r, idx) => {
    if (idx > 0) doc.addPage();
    header(doc, c, 'Bulletin de paie', r.number, font);
    doc.setFontSize(9);
    doc.setFont(font, 'normal');
    autoTable(doc, {
      startY: 36,
      body: [
        ['Salarié', `${r.first_name} ${r.last_name}`, 'Période', period.period],
        ['Matricule', r.matricule, 'Poste', r.position],
        ['N° CNSS', r.cnss_number || '—', 'Mode', r.pay_mode],
        ['Heures', `${(r.worked_minutes / 60).toFixed(2)} h (sup. ${(r.overtime_minutes / 60).toFixed(2)} h)`, 'Séances', String(r.sessions_count)],
      ],
      theme: 'grid',
      styles: { font, fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [243, 244, 246] }, 2: { fontStyle: 'bold', fillColor: [243, 244, 246] } },
    });
    const earnings = r.items.filter((i: any) => i.kind === 'earning');
    const deductions = r.items.filter((i: any) => i.kind === 'deduction');
    autoTable(doc, { head: [['Rémunérations', 'Base', 'Montant']], body: earnings.map((i: any) => [i.label, i.base || '', money(i.amount)]), styles: { font, fontSize: 9 }, headStyles: { fillColor: INK, textColor: [255, 255, 255] }, columnStyles: { 2: { halign: 'right' } } });
    autoTable(doc, { head: [['Retenues', 'Base', 'Montant']], body: deductions.length ? deductions.map((i: any) => [i.label, i.base || '', money(i.amount)]) : [['—', '', '']], styles: { font, fontSize: 9 }, headStyles: { fillColor: [120, 30, 30] }, columnStyles: { 2: { halign: 'right' } } });
    autoTable(doc, {
      body: [['Salaire brut', money(r.gross)], ['Cotisations sociales', money(r.social_contrib)], ['IRPP / CSS', money(r.irpp)], ['Autres retenues', money(r.other_deductions)], ['Salaire net', money(r.net)], ['Avances', money(r.advances)], ['NET À PAYER', money(r.net_to_pay)]],
      theme: 'plain', margin: { left: w - 100 }, styles: { font, fontSize: 10 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (h) => { if (h.row.index === 6) { h.cell.styles.fillColor = LIME; h.cell.styles.textColor = [255, 255, 255]; h.cell.styles.fontStyle = 'bold'; } },
    });
    const y = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.text(`Date de paiement : ${r.paid_at ? fmtDate(r.paid_at) : '—'}`, 12, y);
    if (!period.rules_validated) {
      doc.setTextColor(200, 0, 0);
      doc.text('Attention : règles fiscales et sociales non validées par le comptable.', 12, y + 5);
      doc.setTextColor(0);
    }
    signature(doc, y + 10, c, font, 'Signature du responsable');
  });
  footer(doc, c, font);
  output(doc, records.length === 1 ? `${records[0].number}.pdf` : `Paie-${period.period}.pdf`, mode);
}

// ---------------- Client registration sheet ----------------
export async function clientSheetPDF(cl: any) {
  const c = await company();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const font = (await ensureArabic(doc, JSON.stringify(cl))) ? 'Amiri' : 'helvetica';
  header(doc, c, 'Fiche d’inscription', cl.matricule, font);
  const rows: [string, string][] = [
    ['Nom', cl.last_name], ['Prénom', cl.first_name], ['Date de naissance', `${fmtDate(cl.birth_date)} (${cl.age ?? '—'} ans)`], ['Sexe', cl.gender || '—'],
    ['Téléphone', cl.phone], ['Email', cl.email || '—'], ['Adresse', cl.address || '—'], ['Catégorie', cl.category_name || '—'],
    ['Date d’inscription', fmtDate(cl.registration_date)], ['Abonnement actuel', cl.current_plan ? `${cl.current_plan} (fin ${fmtDate(cl.current_end_date)})` : '—'], ['Remarques', cl.notes || '—'],
  ];
  if (cl.guardian_name) rows.push(['Parent / tuteur', `${cl.guardian_name} (${cl.guardian_relationship || ''})`], ['Tél. parent', cl.guardian_phone], ['Contact d’urgence', cl.guardian_emergency || '—']);
  autoTable(doc, { startY: 38, body: rows, theme: 'grid', styles: { font, fontSize: 10, cellPadding: 3 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [243, 244, 246] } } });
  const y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize('Je certifie l’exactitude des informations ci-dessus et m’engage à respecter le règlement intérieur de la salle.', 186), 12, y);
  signature(doc, y + 10, c, font, 'Signature de l’adhérent / tuteur', 'Cachet de la salle');
  footer(doc, c, font);
  output(doc, `Fiche-${cl.matricule}.pdf`, 'print');
}

// ---------------- Generic table PDF ----------------
export async function tablePDF(title: string, columns: { key: string; label: string; money?: boolean }[], rows: any[], subtitle?: string) {
  const c = await company();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const font = (await ensureArabic(doc, JSON.stringify(rows).slice(0, 20000))) ? 'Amiri' : 'helvetica';
  header(doc, c, title, subtitle || fmtDate(new Date().toISOString().slice(0, 10)), font);
  autoTable(doc, {
    startY: 36,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((col) => (col.money ? money(r[col.key]) : r[col.key] ?? ''))),
    styles: { font, fontSize: 8 },
    headStyles: { fillColor: INK, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 247, 248] },
  });
  footer(doc, c, font);
  doc.save(`${title.replace(/\s+/g, '-')}.pdf`);
}

// ---------------- Excel ----------------
export async function exportExcel(title: string, columns: { key: string; label: string; money?: boolean }[], rows: any[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SMART GYM 360 — GM LAC';
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4) }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.money ? Number(r[c.key] || 0) / 1000 : r[c.key] ?? '']))));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFBEF264' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B0D10' } };
  columns.forEach((c, i) => { if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.000'; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${title.replace(/\s+/g, '-')}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readExcel(file: File): Promise<Record<string, any>[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const headers: string[] = [];
  const rows: Record<string, any>[] = [];
  ws.eachRow((row, n) => {
    const vals = (row.values as any[]).slice(1);
    if (n === 1) vals.forEach((v) => headers.push(String(v ?? '').trim().toLowerCase()));
    else {
      const o: Record<string, any> = {};
      headers.forEach((h, i) => {
        let v = vals[i];
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else if (v && typeof v === 'object' && 'text' in v) v = v.text;
        o[h] = v ?? '';
      });
      if (Object.values(o).some((x) => String(x).trim())) rows.push(o);
    }
  });
  return rows;
}
