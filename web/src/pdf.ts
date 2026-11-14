// Minimal single-page PDF writer: one JPEG stretched over the page. That is
// all a map print needs, and it keeps a ~300 kB PDF library out of the
// bundle. Pure (bytes in, bytes out) so it is unit-tested without a browser.

/** Paper sizes in PDF points (1/72 in), portrait. */
export const PAPER_PT: Record<string, [number, number]> = {
  letter: [612, 792],
  tabloid: [792, 1224],
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
};

export function pageSizePt(paper: string, landscape: boolean): [number, number] {
  const [w, h] = PAPER_PT[paper] ?? PAPER_PT.letter;
  return landscape ? [h, w] : [w, h];
}

/** Wrap a baseline JPEG (as produced by canvas.toBlob('image/jpeg')) in a
 *  one-page PDF of pageW x pageH points. imgW/imgH are the JPEG's pixels. */
export function buildPdf(
  jpeg: Uint8Array, imgW: number, imgH: number, pageW: number, pageH: number, title = 'Maps of NB',
): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };
  const num = (v: number) => String(Math.round(v * 100) / 100);
  // PDF literal strings: ASCII only, with the three special characters escaped.
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] ` +
    '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${num(pageW)} 0 0 ${num(pageH)} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${safeTitle}) /Producer (maps-of-nb) >>`);

  const xref = length;
  let table = 'xref\n0 7\n0000000000 65535 f \n';
  for (let n = 1; n <= 6; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Largest "nice" scale-bar length (1/2/5 x 10^n metres) that fits maxM. */
export function niceScale(maxM: number): number {
  if (!(maxM > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  const lead = maxM / pow;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * pow;
}
