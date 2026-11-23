// Loop 0.4.2 — TikTok en Kino
const VERSION = "0.4.2";
const VERIF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PORTADA_CACHE_MS = 20 * 60 * 1000;
const BASE = "https://tikwm.com/api/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function clip(t, max) {
  t = String(t == null ? "" : t).slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
  return t;
}
function espera(ms) {
  if (typeof setTimeout !== "function") return Promise.resolve();
  return new Promise(function (res) { try { setTimeout(res, ms); } catch (e) { res(); } });
}
function getJson(k, d) {
  try { const v = kino.storage.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
}
function setJson(k, v, ttl) {
  try { kino.storage.set(k, JSON.stringify(v), ttl || 0); return true; } catch (e) { return false; }
}
function galletaActual() {
  const g = getJson("verificacion", null);
  if (!g || !g.cookies) return null;
  return Object.keys(g.cookies).length ? g : null;
}
function borrarVerificacion() {
  try { kino.storage.remove("verificacion"); } catch (e) {}
}
function cabecerasVerificadas() {
  const g = galletaActual();
  if (!g) return null;
  const partes = [];
  for (const n in g.cookies) partes.push(n + "=" + g.cookies[n]);
  if (!partes.length) return null;
  return { Cookie: partes.join("; "), "User-Agent": g.ua || UA };
}
function esVerificacion(e) {
  if (e && e.noJson) return true;
  return /verification|just a moment|cloudflare|http 403/i.test(String((e && e.message) || ""));
}
function errorVerificacion(que) {
  if (galletaActual()) { borrarVerificacion(); kino.log("Loop: verificacion invalidada"); }
  return kino.error("unavailable", clip(que + ": verificacion pendiente", 120), {
    userMessage: "TikTok pidio verificacion. Toca Pasar verificacion en Ajustes > Loop, espera y toca Listo."
  });
}
function protegerIds(texto) {
  return String(texto).replace(/("(?:id|video_id|aweme_id)"\s*:\s*)(\d{12,25})(\s*[},])/g, '$1"$2"$3');
}
async function pedirJson(url, timeoutMs, extra) {
  let ultimo = null;
  for (let intento = 0; intento < 2; intento++) {
    const cab = { Accept: "application/json", "User-Agent": UA };
    if (extra && extra["User-Agent"]) cab["User-Agent"] = extra["User-Agent"];
    if (extra && extra.Cookie) cab.Cookie = extra.Cookie;
    const r = await kino.fetch(url, { method: "GET", headers: cab, timeoutMs: timeoutMs || 15000 }).catch(function (e) {
      ultimo = e; return null;
    });
    if (!r) { await espera(900); continue; }
    if (!r.ok) {
      let cuerpo = "";
      try { cuerpo = await r.text(); } catch (e2) {}
      const e = new Error("http " + r.status + (cuerpo ? " " + clip(cuerpo, 90) : ""));
      e.status = r.status;
      if ((r.status === 429 || r.status >= 500 || /verification|just a moment/i.test(cuerpo)) && intento === 0) {
        ultimo = e; await espera(1100); continue;
      }
      throw e;
    }
    let cuerpo = "";
    try { cuerpo = await r.text(); } catch (e2) {
      ultimo = e2; if (intento === 0) { await espera(900); continue; }
      throw e2;
    }
    const t = cuerpo.trim();
    if (t.charAt(0) !== "{" && t.charAt(0) !== "[") {
      const e = new Error("respuesta no JSON" + (t ? ": " + clip(t, 70) : ""));
      e.noJson = true;
      if (intento === 0) { ultimo = e; await espera(1100); continue; }
      throw e;
    }
    try { return JSON.parse(protegerIds(t)); } catch (e) {
      if (intento === 0) { ultimo = e; await espera(900); continue; }
      throw e;
    }
  }
  throw ultimo || new Error("sin respuesta");
}
function tkDatos(j, que) {
  if (!j || typeof j !== "object") throw new Error(que + ": vacia");
  const code = j.code === undefined ? (j.success === true ? 0 : -1) : (typeof j.code === "string" ? parseInt(j.code, 10) : j.code);
  if (code === 0) return j.data || {};
  const e = new Error(que + ": " + clip(j.msg || j.message || "error", 120));
  e.apiMsg = String(j.msg || j.message || "");
  throw e;
}
async function tkLlamada(que, hacer) {
  try { return await hacer(); } catch (e) {
    if (esVerificacion(e)) throw errorVerificacion(que);
    throw e;
  }
}
async function tkTendencias(region, cursor, count, timeoutMs) {
  let url = BASE + "feed/list?count=" + (count || 18) + "&cursor=" + encodeURIComponent(cursor || "0");
  if (region) url += "&region=" + encodeURIComponent(region);
  const j = await pedirJson(url, timeoutMs || 8000);
  return tkDatos(j, "tendencias");
}
async function tkBuscar(kw, cursor, count, timeoutMs) {
  const extra = cabecerasVerificadas();
  const j = await pedirJson(
    BASE + "feed/search?keywords=" + encodeURIComponent(kw) + "&count=" + (count || 18) + "&cursor=" + encodeURIComponent(cursor || "0"),
    timeoutMs || 8000,
    extra
  );
  return tkDatos(j, "buscar");
}
async function tkPorEnlace(enlace) {
  const j = await pedirJson(BASE + "?url=" + encodeURIComponent(enlace), 12000);
  return tkDatos(j, "enlace");
}
function videosDe(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.videos)) return d.videos;
  if (Array.isArray(d.aweme_list)) return d.aweme_list;
  return [];
}
function itemDeVideo(v) {
  if (!v) return null;
  const id = String(v.id || v.video_id || v.aweme_id || "");
  if (!id) return null;
  const autor = v.author && (v.author.unique_id || v.author.uniqueId) ? String(v.author.unique_id || v.author.uniqueId) : "";
  const titulo = clip(String(v.title || "").replace(/\s+/g, " ").trim(), 120) || "Video de TikTok";
  const item = {
    id: "v:" + id,
    ref: "v:" + id,
    title: titulo,
    kind: "movie",
    subtitle: autor ? "@" + autor : ""
  };
  const cover = v.cover || v.origin_cover || "";
  if (cover) item.poster = cover;
  return item;
}
function itemsDeVideos(d) {
  const vids = videosDe(d);
  const items = [];
  const ya = {};
  for (let i = 0; i < vids.length; i++) {
    const it = itemDeVideo(vids[i]);
    if (it && it.ref && !ya[it.ref]) { ya[it.ref] = 1; items.push(it); }
  }
  return items;
}

const REGIONES = [
  { id: "co", titulo: "Tendencias en Colombia", region: "CO" },
  { id: "mx", titulo: "Tendencias en Mexico", region: "MX" },
  { id: "es", titulo: "Tendencias en Espana", region: "ES" },
  { id: "ar", titulo: "Tendencias en Argentina", region: "AR" },
  { id: "us", titulo: "Tendencias en EE. UU.", region: "US" }
];

export async function home() {
  try {
    const cached = getJson("portada_cache", null);
    if (cached && cached.rows && cached.rows.length && cached.t && (Date.now() - cached.t) < PORTADA_CACHE_MS) {
      return cached.rows;
    }
  } catch (e) {}
  const salida = [];
  for (let i = 0; i < REGIONES.length; i++) {
    const f = REGIONES[i];
    try {
      if (i) await espera(1100);
      const d = await tkLlamada("portada " + f.region, function () {
        return tkTendencias(f.region, "0", 18, 6000);
      });
      const items = itemsDeVideos(d);
      if (items.length) {
        salida.push({ id: "fila." + f.id, title: f.titulo, items: items, ref: "r:" + f.region, genre: "entretenimiento" });
      }
    } catch (e) {}
  }
  if (!salida.length) {
    try {
      const d = await tkLlamada("portada global", function () { return tkTendencias("", "0", 18, 6000); });
      const items = itemsDeVideos(d);
      if (items.length) salida.push({ id: "fila.global", title: "Tendencias", items: items, ref: "r:global", genre: "entretenimiento" });
    } catch (e) {}
  }
  if (!salida.length) {
    throw kino.error("unavailable", "portada vacia", {
      userMessage: "TikTok no respondio ahora mismo. Espera un momento y vuelve a abrir la portada."
    });
  }
  try { setJson("portada_cache", { t: Date.now(), rows: salida }, PORTADA_CACHE_MS); } catch (e) {}
  return salida;
}

export async function search(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  if (q.toLowerCase() === "debug" || q.toLowerCase() === "estado") {
    const g = galletaActual();
    return [{ id: "dbg", ref: "v:debug", title: "Loop " + VERSION + " · verif " + (g ? "OK" : "no"), kind: "movie" }];
  }
  const m = q.match(/(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i);
  if (m) {
    let enlace = m[0];
    if (enlace.indexOf("http") !== 0) enlace = "https://" + enlace;
    try {
      const d = await tkLlamada("enlace", function () { return tkPorEnlace(enlace); });
      const it = itemDeVideo(d);
      return it ? [it] : [];
    } catch (e) {
      if (esVerificacion(e)) throw errorVerificacion("enlace");
      throw kino.error("unavailable", String(e.message || e), { userMessage: "No se pudo abrir el enlace." });
    }
  }
  try {
    const d = await tkLlamada("busqueda", function () { return tkBuscar(q, "0", 30); });
    return itemsDeVideos(d);
  } catch (e) {
    if (esVerificacion(e)) throw errorVerificacion("busqueda");
    throw kino.error("unavailable", String(e.message || e), { userMessage: "TikTok no respondio. Intentalo otra vez." });
  }
}

export async function browse(ref, cursor) {
  const s = String(ref || "");
  if (s.indexOf("r:") === 0) {
    const region = s.slice(2);
    const c = cursor || "0";
    const d = await tkLlamada("ver mas", function () { return tkTendencias(region === "global" ? "" : region, c, 30); });
    const items = itemsDeVideos(d);
    return { items: items, next: items.length >= 20 ? String((parseInt(c, 10) || 0) + items.length) : undefined };
  }
  return { items: [] };
}

export async function episodes(ref) {
  return { episodes: [] };
}

export async function resolve(ref) {
  let s = String(ref || "");
  if (s.indexOf("v:") === 0) s = s.slice(2);
  if (!/^\d{6,25}$/.test(s)) throw kino.error("not_found", "ref invalida");
  const candidatos = [
    "https://www.tiktok.com/@tiktok/video/" + s,
    "https://m.tiktok.com/v/" + s + ".html"
  ];
  let d = null;
  for (let i = 0; i < candidatos.length; i++) {
    try {
      const r = await tkLlamada("resolve", function () { return tkPorEnlace(candidatos[i]); });
      if (r && (r.play || r.wmplay)) { d = r; break; }
    } catch (e) {}
  }
  if (!d) throw kino.error("not_found", "sin enlace", { userMessage: "No se pudo conseguir este video." });
  const conMarca = String(kino.config.get("marca") || "no").trim() === "si";
  const url = conMarca ? (d.wmplay || d.play) : (d.play || d.wmplay);
  if (!url || String(url).indexOf("http") !== 0) throw kino.error("not_found", "enlace vacio");
  return { url: String(url), mime: "video/mp4", label: conMarca ? "TikTok" : "TikTok sin marca de agua" };
}

export async function prepare(ref) {
  try { await resolve(ref); } catch (e) {}
}

export async function settingsStatus() {
  const g = galletaActual();
  let texto = "Loop " + VERSION + ".";
  if (g) {
    const haceMin = g.t ? Math.max(0, Math.round((Date.now() - g.t) / 60000)) : 0;
    const haceTxt = haceMin >= 1440 ? Math.round(haceMin / 1440) + " d" : (haceMin >= 90 ? Math.round(haceMin / 60) + " h" : haceMin + " min");
    texto += " Verificacion OK · hace " + haceTxt + " (~7 dias o hasta challenge).";
  } else {
    texto += " Verificacion: no hay (solo para # y @).";
  }
  return { estado: clip(texto, 200) };
}

export async function action(key) {
  if (key !== "verificacion") return null;
  if (!kino.visualBrowser || !kino.visualBrowser.available) {
    throw kino.error("unavailable", "sin ventana", { userMessage: "Actualiza la app para la ventana del navegador." });
  }
  let r;
  try {
    r = await kino.visualBrowser.open({
      url: BASE + "feed/search?keywords=" + encodeURIComponent("#fyp") + "&count=1&cursor=0",
      title: "Verificacion de TikTok",
      collect: { cookies: ["cf_clearance", "__cf_bm"] },
      userAgent: "browser",
      timeoutMs: 120000
    });
  } catch (e) {
    throw kino.error("unavailable", String(e.message || e), { userMessage: "La ventana no se pudo abrir." });
  }
  const g = {};
  const crudas = r && r.cookies;
  if (typeof crudas === "string" && crudas) {
    crudas.split(";").forEach(function (p) {
      const i = p.indexOf("=");
      if (i > 0) g[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
  } else if (Array.isArray(crudas)) {
    crudas.forEach(function (c) {
      if (c && c.name && c.value !== undefined) g[String(c.name)] = String(c.value);
    });
  } else if (crudas && typeof crudas === "object") {
    for (const k in crudas) g[k] = String(crudas[k]);
  }
  const nombres = Object.keys(g);
  if ((r && r.status) !== "done" || !nombres.length) {
    throw kino.error("unavailable", "verificacion incompleta", {
      userMessage: "Espera a que la pagina cargue antes de tocar Listo."
    });
  }
  if (!setJson("verificacion", { cookies: g, ua: String(r.userAgent || ""), t: Date.now() }, VERIF_TTL_MS)) {
    throw kino.error("unavailable", "no se guardo", { userMessage: "No se pudo guardar la verificacion." });
  }
  return null;
}
