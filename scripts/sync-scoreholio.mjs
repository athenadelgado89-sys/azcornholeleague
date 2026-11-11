// Imports public Arizona cornhole tournaments from the Scoreholio API into the AZCL events table.
// Runs on GitHub Actions every hour (.github/workflows/sync-scoreholio.yml).
//
// Needs three repository secrets (GitHub → Settings → Secrets and variables → Actions):
//   SCOREHOLIO_API_KEY   from seasons.scoreholio.com → Settings → API Keys (Scoreholio Pro)
//   SUPABASE_URL         e.g. https://yhiqyqszatwmsuozafwy.supabase.co
//   SUPABASE_SECRET_KEY  Supabase → Project Settings → API Keys → secret key (never put this in the website)
//
// What it does:
//   1. Finds every public cornhole tournament in Arizona over the next 180 days.
//   2. Records each organizer it sees, so an admin can link the organizer to a club.
//   3. For organizers linked to a club, adds or updates their tournaments on AZ Events.
//   4. Removes imported events that were deleted, made private or moved out of Arizona.

const SH_API = "https://api.scoreholio.com";
const AZ_BBOX = "-114.82,31.33,-109.04,37.01"; // minLng,minLat,maxLng,maxLat
const DAYS_AHEAD = 180;

const { SCOREHOLIO_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
// Comma-separated Scoreholio season ids for AZCL's own seasons (repository variable SCOREHOLIO_SEASON_IDS)
const SEASON_IDS = (process.env.SCOREHOLIO_SEASON_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const fetchImpl = globalThis.__mockFetch || fetch;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- Scoreholio ---------------- */
async function sh(path, params = {}, { allow404 = false } = {}) {
  const url = new URL(SH_API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${SCOREHOLIO_API_KEY}`, Accept: "application/json" } });
    if (res.status === 429) { await sleep((Number(res.headers.get("retry-after")) || 10) * 1000); continue; }
    if (allow404 && (res.status === 404 || res.status === 410)) return null;
    if (!res.ok) throw new Error(`Scoreholio ${res.status} on ${url.pathname} (request ${res.headers.get("x-request-id") || "?"}): ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
  throw new Error(`Scoreholio kept rate-limiting ${url.pathname}`);
}

async function searchArizona() {
  const now = Date.now();
  const params = {
    sport: "cornhole",
    bbox: AZ_BBOX,
    startsAfter: new Date(now - 12 * 3600e3).toISOString(), // keep today's in-progress events
    startsBefore: new Date(now + DAYS_AHEAD * 86400e3).toISOString(),
    limit: 100
  };
  const out = [];
  let cursor = null;
  do {
    const page = await sh("/v1/tournaments", { ...params, cursor });
    out.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return out.filter(inArizona);
}

function inArizona(t) {
  const a = t.location?.address || {};
  if (a.region) return a.region.toUpperCase() === "AZ" || /^arizona$/i.test(a.region);
  // Region unknown: fall back to the coordinates (the box also clips bits of NV, UT, NM, CA and Mexico).
  const { latitude: lat, longitude: lng } = t.location || {};
  return a.country === "US" && lat >= 31.33 && lat <= 37.01 && lng >= -114.82 && lng <= -109.04;
}

/* ---------------- Supabase (REST) ---------------- */
function dbHeaders(extra = {}) {
  const h = { apikey: SUPABASE_SECRET_KEY, "Content-Type": "application/json", ...extra };
  if (SUPABASE_SECRET_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`; // legacy service_role key
  return h;
}
async function db(method, path, body, prefer) {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers: dbHeaders(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${method} ${path}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---------------- Mapping ---------------- */
function localParts(iso, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00` };
}
const TEAM_FORMATS = { singles: "Singles", set_teams: "Doubles", blind_draw: "Blind Draw / SWAP", switcholio: "Blind Draw / SWAP", split_switch: "Blind Draw / SWAP" };
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);
function money(m) {
  if (!m || m.amount == null) return null;
  const amt = m.amount.replace(/\.00$/, "");
  return m.currency === "USD" || !m.currency ? `$${amt}` : `${amt} ${m.currency}`;
}
function toRow(t, clubId) {
  const { date, time } = localParts(t.startsAt, t.timezone);
  const a = t.location?.address || {};
  const where = [t.location?.name, a.city ? `${a.city}, AZ` : null].filter(Boolean).join(", ") || a.formatted || "Arizona";
  const reg = t.registration || {};
  return {
    club_id: clubId,
    title: cut(t.name, 100),
    event_date: date,
    start_time: time,
    format: TEAM_FORMATS[t.teamFormat] || "Other",
    location: cut(where, 120),
    scoreholio: t.url || "https://scoreholio.com",
    details: t.description ? cut(t.description.trim(), 1500) : null,
    entry_fee: money(reg.entryFee),
    registered_teams: Number.isInteger(reg.registeredTeams) ? reg.registeredTeams : null,
    max_teams: Number.isInteger(reg.maxTeams) ? reg.maxTeams : null,
    synced_at: new Date().toISOString()
  };
}

/* ---------------- Sync ---------------- */
export async function main() {
  if (!SCOREHOLIO_API_KEY || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log("Scoreholio sync is not set up yet (missing SCOREHOLIO_API_KEY, SUPABASE_URL or SUPABASE_SECRET_KEY). Skipping.");
    return;
  }

  const tournaments = await searchArizona();
  console.log(`Found ${tournaments.length} public Arizona cornhole tournaments.`);

  // 1. Organizers seen (for the admin page)
  const now = new Date();
  const byOrg = new Map();
  for (const t of tournaments) {
    const o = t.organizer; if (!o?.id) continue;
    const e = byOrg.get(o.id) || { id: o.id, name: o.name || "Unknown organizer", list: [] };
    e.list.push(t); byOrg.set(o.id, e);
  }
  const orgRows = [...byOrg.values()].map(o => {
    const upcoming = o.list.filter(t => new Date(t.startsAt) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const next = upcoming[0] || o.list[0];
    return {
      id: o.id, name: cut(o.name, 120), upcoming_count: upcoming.length,
      next_event_name: next ? cut(next.name, 100) : null,
      next_event_date: next ? localParts(next.startsAt, next.timezone).date : null,
      next_event_city: next?.location?.address?.city || null,
      last_seen: now.toISOString()
    };
  });
  if (orgRows.length) await db("POST", "scoreholio_organizers?on_conflict=id", orgRows, "resolution=merge-duplicates,return=minimal");

  // 2. Clubs linked to an organizer
  const clubs = await db("GET", "clubs?select=id,scoreholio_organizer_id&status=eq.approved&scoreholio_organizer_id=not.is.null");
  const clubByOrg = new Map(clubs.map(c => [c.scoreholio_organizer_id, c.id]));
  const linkedClubIds = new Set(clubs.map(c => c.id));

  // 3. Add or update events
  const existing = await db("GET", "events?select=id,scoreholio_id,club_id,event_date&source=eq.scoreholio");
  const existingById = new Map(existing.map(e => [e.scoreholio_id, e]));
  const seen = new Set();
  const inserts = [];
  let updated = 0;
  for (const t of tournaments) {
    const clubId = clubByOrg.get(t.organizer?.id);
    if (!clubId) continue;
    seen.add(t.id);
    const row = toRow(t, clubId);
    const prev = existingById.get(t.id);
    if (prev) { await db("PATCH", `events?id=eq.${prev.id}`, row, "return=minimal"); updated++; }
    else inserts.push({ ...row, source: "scoreholio", scoreholio_id: t.id, status: "approved" });
  }
  if (inserts.length) await db("POST", "events", inserts, "return=minimal");

  // 4. Clean up imported events that no longer belong on the site
  const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  let removed = 0;
  for (const e of existing) {
    if (seen.has(e.scoreholio_id)) continue;
    let drop = false;
    if (!linkedClubIds.has(e.club_id)) drop = true;                // organizer unlinked from its club
    else if (e.event_date >= yesterday) {                           // upcoming but missing from the search
      const t = await sh(`/v1/tournaments/${encodeURIComponent(e.scoreholio_id)}`, {}, { allow404: true });
      if (!t || !inArizona(t) || clubByOrg.get(t.organizer?.id) !== e.club_id) drop = true;
    }
    if (drop) { await db("DELETE", `events?id=eq.${e.id}`, undefined, "return=minimal"); removed++; }
  }

  await syncSeasonStats();
  console.log(`Organizers seen: ${orgRows.length}. Linked clubs: ${clubs.length}. Events added: ${inserts.length}, updated: ${updated}, removed: ${removed}.`);
}

/* ---------------- Season player stats (for player profiles) ---------------- */
async function syncSeasonStats() {
  if (!SEASON_IDS.length) { console.log("No SCOREHOLIO_SEASON_IDS set; skipping season player stats."); return; }
  for (const seasonId of SEASON_IDS) {
    const runStart = new Date().toISOString();
    const season = await sh(`/v1/seasons/${encodeURIComponent(seasonId)}`, {}, { allow404: true });
    if (!season) { console.log(`Season ${seasonId} not found or not visible to this key.`); continue; }
    const rows = [];
    let cursor = null;
    do {
      const page = await sh(`/v1/seasons/${encodeURIComponent(seasonId)}/rankings/players`, { limit: 5000, cursor }, { allow404: true });
      if (!page) break;               // rankings not public for this season
      for (const r of page.data) {
        if (!r.player?.id) continue;
        rows.push({
          season_id: seasonId, season_name: season.name || null,
          division: r.division?.id === "all" ? "all" : (r.division?.name || r.division?.id || "all"),
          scoreholio_player_id: r.player.id, player_name: r.player.name, club_name: r.player.clubName || null,
          rank: r.rank ?? null, points: r.points ?? null, played: r.tournaments?.played ?? null,
          first: r.finishes?.first ?? null, second: r.finishes?.second ?? null, third: r.finishes?.third ?? null,
          podium: r.finishes?.podium ?? null, best: Number.isFinite(r.finishes?.best) ? Math.round(r.finishes.best) : null,
          updated_at: runStart
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    for (let i = 0; i < rows.length; i += 500) {
      await db("POST", "season_player_stats?on_conflict=season_id,division,scoreholio_player_id", rows.slice(i, i + 500), "resolution=merge-duplicates,return=minimal");
    }
    await db("DELETE", `season_player_stats?season_id=eq.${encodeURIComponent(seasonId)}&updated_at=lt.${encodeURIComponent(runStart)}`, undefined, "return=minimal");
    console.log(`Season "${season.name || seasonId}": ${rows.length} player ranking rows.`);
  }
}

if (!globalThis.__mockFetch) {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}
