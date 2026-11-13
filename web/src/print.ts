// Print / export: re-render the current view off-screen at print resolution,
// compose a page (title, map, scale bar, north arrow, legend, credits) on a
// 2D canvas and hand back a PDF or PNG. All client-side — no print server,
// which is what the provincial viewers round-trip to for the same result.
import * as maplibregl from 'maplibre-gl';
import { buildPdf, pageSizePt, niceScale } from './pdf';
import { t, locale } from './i18n';

export type PrintOptions = {
  paper: string; landscape: boolean; dpi: number; format: 'pdf' | 'png';
  title: string; legend: { color: string; label: string }[];
};

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&copy;/g, '©').replace(/&amp;/g, '&').trim();

/** Credits for the sources that are actually drawn. */
function creditsFor(style: maplibregl.StyleSpecification): string {
  const used = new Set<string>();
  for (const l of style.layers) {
    if ('source' in l && l.source && l.layout?.visibility !== 'none') used.add(l.source as string);
  }
  const out = new Set<string>();
  for (const id of used) {
    const a = (style.sources[id] as { attribution?: string } | undefined)?.attribution;
    if (a) out.add(stripHtml(a));
  }
  return [...out].join(' · ');
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas export blocked'))), type, q));

export async function renderPrint(map: maplibregl.Map, o: PrintOptions): Promise<{ blob: Blob; filename: string }> {
  const [pageW, pageH] = pageSizePt(o.paper, o.landscape);
  const margin = 28, headH = o.title ? 30 : 0, footH = 40;
  const boxW = pageW - 2 * margin, boxH = pageH - 2 * margin - headH - footH;
  // Lay the map out in CSS px at 96/in and let pixelRatio supply the print
  // density, so labels and line widths keep their on-screen proportions.
  const cssW = Math.round((boxW / 72) * 96), cssH = Math.round((boxH / 72) * 96);
  const ratio = Math.min(o.dpi / 96, 4096 / Math.max(cssW, cssH));

  // GeoJSON sources are filled at runtime; carry their current data across.
  const style = structuredClone(map.getStyle());
  await Promise.all(Object.entries(style.sources).map(async ([id, src]) => {
    if (src.type !== 'geojson') return;
    try { src.data = await (map.getSource(id) as maplibregl.GeoJSONSource).getData(); } catch { /* keep serialized data */ }
  }));

  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${cssW}px;height:${cssH}px;`;
  document.body.append(holder);
  const screen = map.getContainer();
  // Zoom so everything visible on screen is still inside the page frame.
  const dz = Math.log2(Math.min(cssW / screen.clientWidth, cssH / screen.clientHeight));
  const zoom = map.getZoom() + dz;
  const off = new maplibregl.Map({
    container: holder, style, center: map.getCenter(), zoom, bearing: map.getBearing(), pitch: map.getPitch(),
    interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: ratio,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const giveUp = window.setTimeout(() => (off.loaded() ? resolve() : reject(new Error('timed out loading tiles'))), 30000);
      off.once('idle', () => { window.clearTimeout(giveUp); resolve(); });
      off.on('error', () => undefined); // missing tiles must not abort the print
    });

    const k = o.dpi / 72; // page points -> output pixels
    const page = document.createElement('canvas');
    page.width = Math.round(pageW * k); page.height = Math.round(pageH * k);
    const g = page.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, page.width, page.height);
    g.scale(k, k);
    const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const mapY = margin + headH;
    if (o.title) {
      g.fillStyle = '#111'; g.font = `600 16px ${sans}`; g.textBaseline = 'middle';
      g.fillText(o.title, margin, margin + headH / 2 - 2, boxW);
    }
    g.fillStyle = '#0b0f14'; g.fillRect(margin, mapY, boxW, boxH);
    g.drawImage(off.getCanvas(), margin, mapY, boxW, boxH);
    g.strokeStyle = '#222'; g.lineWidth = 0.75; g.strokeRect(margin, mapY, boxW, boxH);

    // North arrow (rotates with the map bearing).
    const ax = margin + boxW - 22, ay = mapY + 24;
    g.save(); g.translate(ax, ay); g.rotate((-map.getBearing() * Math.PI) / 180);
    g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.88)'; g.fill();
    g.beginPath(); g.moveTo(0, -10); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fillStyle = '#111'; g.fill();
    g.restore();
    g.fillStyle = '#111'; g.font = `700 7px ${sans}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('N', ax, ay + 24); g.textAlign = 'left';

    // Scale bar — true at the map centre; flagged approximate when tilted.
    const footY = mapY + boxH + 12;
    const lat = map.getCenter().lat;
    const mPerPt = ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)) * (96 / 72);
    const barM = niceScale(mPerPt * Math.min(140, boxW / 4));
    const barW = barM / mPerPt;
    g.fillStyle = '#111'; g.fillRect(margin, footY, barW, 3);
    g.fillRect(margin, footY - 3, 0.75, 6); g.fillRect(margin + barW - 0.75, footY - 3, 0.75, 6);
    g.font = `8px ${sans}`; g.textBaseline = 'top';
    const barLabel = (barM >= 1000 ? `${barM / 1000} km` : `${barM} m`);
    g.fillText((map.getPitch() > 5 ? '≈ ' : '') + barLabel, margin, footY + 6);

    // Legend swatches, left to right after the scale bar.
    let lx = margin + Math.max(barW, 40) + 18;
    for (const item of o.legend) {
      const w = g.measureText(item.label).width;
      if (lx + 12 + w > margin + boxW) break;
      g.fillStyle = item.color; g.fillRect(lx, footY - 2, 8, 8);
      g.strokeStyle = '#444'; g.lineWidth = 0.4; g.strokeRect(lx, footY - 2, 8, 8);
      g.fillStyle = '#111'; g.fillText(item.label, lx + 12, footY - 2);
      lx += 12 + w + 14;
    }

    const now = new Date();
    g.fillStyle = '#555'; g.font = `6.5px ${sans}`;
    const stamp = `${location.host} · ${t('print.footer', { date: now.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' }) })}`;
    g.fillText(creditsFor(style), margin, footY + 19, boxW);
    g.textAlign = 'right'; g.fillText(stamp, margin + boxW, footY + 6, boxW / 2); g.textAlign = 'left';

    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `maps-of-nb-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    if (o.format === 'png') return { blob: await toBlob(page, 'image/png'), filename: `${name}.png` };
    const jpeg = new Uint8Array(await (await toBlob(page, 'image/jpeg', 0.92)).arrayBuffer());
    const pdf = buildPdf(jpeg, page.width, page.height, pageW, pageH, o.title || 'Maps of NB');
    return { blob: new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' }), filename: `${name}.pdf` };
  } finally {
    off.remove();
    holder.remove();
  }
}

export function initPrint(map: maplibregl.Map, opts: { legend: () => { color: string; label: string }[] }) {
  const dlg = document.getElementById('print-dlg') as HTMLDialogElement;
  const form = document.getElementById('print-form') as HTMLFormElement;
  const status = document.getElementById('print-status')!;
  const go = document.getElementById('print-go') as HTMLButtonElement;
  const title = document.getElementById('print-title') as HTMLInputElement;

  document.getElementById('print-btn')!.addEventListener('click', () => {
    status.textContent = t('print.note'); status.classList.remove('warn');
    if (!title.value) title.value = t('print.maptitle.default');
    dlg.showModal();
  });
  document.getElementById('print-cancel')!.addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    go.disabled = true;
    status.classList.remove('warn');
    status.textContent = t('print.rendering');
    try {
      const { blob, filename } = await renderPrint(map, {
        paper: String(data.get('paper')), landscape: data.get('orientation') !== 'portrait',
        dpi: Number(data.get('dpi')) || 150, format: data.get('format') === 'png' ? 'png' : 'pdf',
        title: String(data.get('title') ?? '').trim(), legend: opts.legend(),
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.append(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      status.textContent = t('print.done', { file: filename });
    } catch (err) {
      status.classList.add('warn');
      status.textContent = t('print.failed', { msg: err instanceof Error ? err.message : String(err) });
    } finally {
      go.disabled = false;
    }
  });
}
