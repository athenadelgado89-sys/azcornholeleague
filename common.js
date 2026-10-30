// Shared helpers for the public site and the admin page.
window.AZCL = (() => {
  const cfg = window.AZCL_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR-/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function normUrl(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null; } catch { return null; }
  }
  const safeHref = v => (/^https?:\/\//i.test(v || "") ? v : null);
  const fileUrl = p => (p && cfg.SUPABASE_URL) ? `${cfg.SUPABASE_URL}/storage/v1/object/public/uploads/${p.split("/").map(encodeURIComponent).join("/")}` : null;
  const initials = name => (name || "?").split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w.replace(/^[^A-Za-z0-9]+/, "")[0]).join("").toUpperCase();
  function parseDate(s) { const [y, m, d] = (s || "").split("-").map(Number); return y ? new Date(y, m - 1, d) : null; }
  function todayStr() {
    // Arizona time (no daylight saving), so "upcoming" flips at midnight in AZ.
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p;
  }
  function fmtTime(t) { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
  function fmtDate(s) { const d = parseDate(s); return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : ""; }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
  async function upload(folder, file, allowPdf) {
    const ok = IMG_TYPES.concat(allowPdf ? ["application/pdf"] : []);
    if (!ok.includes(file.type)) throw new Error(allowPdf ? "Upload a PNG, JPG, WebP or PDF file." : "Upload a PNG, JPG or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Files must be 5 MB or smaller.");
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" }[file.type];
    const path = `${folder}/${uuid()}.${ext}`;
    const { error } = await sb.storage.from("uploads").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  const VENDOR_CATS = ["Bags", "Boards", "Bags & Boards", "Apparel & Custom Design", "Events & Rentals", "Other"];
  const FORMATS = ["Singles", "Doubles", "Blind Draw / SWAP", "Other"];

  return { cfg, configured, sb, $, esc, normUrl, safeHref, fileUrl, initials, parseDate, todayStr, fmtTime, fmtDate, uuid, toast, upload, VENDOR_CATS, FORMATS };
})();
