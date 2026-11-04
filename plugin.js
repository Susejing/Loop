// Loop 0.1.1 — TikTok en Kino: tendencias, búsqueda, creadores y enlaces pegados.
//
// Cómo funciona: TikTok no entrega los videos así nada más (su app exige
// sesión y firma cada petición). Este plugin habla con tikwm.com, el
// servicio público que usan los descargadores libres: le pasamos un enlace,
// un #hashtag o un @usuario y él responde con el MP4 directo del CDN de
// TikTok — SIN marca de agua (o con marca, si se prefiere en Ajustes).
// Es un servicio gratuito de un tercero, sin contrato de nivel de servicio.
//
// Detalles que importan:
// — Los enlaces de video que devuelve tikwm EXPIRAN en pocas horas: por eso
//   se resuelven AL REPRODUCIR y nunca se guardan en caché.
// — En el buscador se puede pegar cualquier enlace de TikTok (normal, corto
//   vt.tiktok.com o vm.tiktok.com) y el video se abre directo.
// — "@usuario" abre el perfil del creador como una "serie": sus videos son
//   los episodios y el reproductor de Kino los corre uno tras otro.
// — La portada son filas por temas (#fyp, #viral, #humor...): tocar un
//   video lo reproduce y el resto de su fila queda de lista detrás (el
//   canal continúa solo, desde donde se tocó). La fila "Canales que
//   corren solos" abre los mismos temas como serie, episodio tras episodio.
// — El plan gratuito de tikwm acepta más o menos una petición por segundo:
//   la portada hace una pausa corta entre fila y fila, y si tikwm avisa
//   del límite, se espera y se reintenta una vez.
// — "debug" (o "estado") en el buscador muestra el informe técnico.

const VERSION = "0.1.1";
const BASE = "https://tikwm.com/api/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------- diagnóstico (se ve con "debug" en el buscador) ----------

let trazaPortada = "";
let trazaBusqueda = "";
let trazaResolve = "";
let ultimoResolve = null;

// ---------- helpers de texto y tiempo ----------

function clip(texto, max) {
  let t = String(texto === null || texto === undefined ? "" : texto).slice(0, max);
  // No cortar un emoji por la mitad (par suplente colgando).
  if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
  return t;
}

// Espera a prueba de entornos sin temporizador: nunca revienta por esto.
function espera(ms) {
  if (typeof setTimeout !== "function") return Promise.resolve();
  return new Promise(function (res) {
    try {
      setTimeout(res, ms);
    } catch (e) {
      res();
    }
  }).catch(function () { });
}

// "1200000" -> "1,2 M" (para las estadísticas del video).
function miles(n) {
  n = parseInt(n, 10) || 0;
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(".", ",") + " mil M";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",") + " K";
  return String(n);
}

// ---------- red ----------

// tikwm (y TikTok) devuelven los ids de video como números de 19 dígitos:
// JavaScript redondea números tan grandes al leerlos. Se entrecomillan
// ANTES de interpretar el JSON, para que el id llegue intacto.
function protegerIds(texto) {
  return String(texto).replace(/("(?:id|video_id|aweme_id)"\s*:\s*)(\d{12,25})(\s*[},])/g, '$1"$2"$3');
}

async function pedirJson(url, timeoutMs) {
  let ultimoError = null;
  for (let intento = 0; intento < 2; intento++) {
    const r = await kino.fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": UA },
      timeoutMs: timeoutMs || 15000
    }).catch(function (e) {
      ultimoError = e;
      return null;
    });
    if (!r) {
      await espera(900);
      continue;
    }
    if (!r.ok) {
      let cuerpo = "";
      try { cuerpo = await r.text(); } catch (e2) { cuerpo = ""; }
      const e = new Error("http " + r.status + (cuerpo ? " " + clip(cuerpo, 90) : ""));
      e.status = r.status;
      // 429, 5xx y los avisos de verificación valen un reintento.
      if ((r.status === 429 || r.status >= 500 || /verification|just a moment/i.test(cuerpo)) && intento === 0) {
        ultimoError = e;
        await espera(1100);
        continue;
      }
      throw e;
    }
    let cuerpo = "";
    try {
      cuerpo = await r.text();
    } catch (e2) {
      ultimoError = e2;
      if (intento === 0) { await espera(900); continue; }
      throw e2;
    }
    const t = cuerpo.trim();
    if (t.charAt(0) !== "{" && t.charAt(0) !== "[") {
      // Cloudflare u otra página HTML en lugar del JSON.
      const e = new Error("respuesta no JSON" + (t ? ": " + clip(t, 70) : " (vacía)"));
      e.noJson = true;
      ultimoError = e;
      if (intento === 0) { await espera(1100); continue; }
      throw e;
    }
    try {
      return JSON.parse(protegerIds(t));
    } catch (e3) {
      ultimoError = new Error("JSON ilegible: " + clip(t, 70));
      if (intento === 0) { await espera(900); continue; }
      throw ultimoError;
    }
  }
  throw ultimoError || new Error("sin respuesta");
}

// ---------- tikwm ----------

// tikwm contesta {code: 0, data: ...} cuando todo sale bien; cualquier otra
// cosa es un error con su propia explicación en msg.
function tkDatos(j, que) {
  if (!j || typeof j !== "object") throw new Error(que + ": respuesta vacía");
  const code = j.code === undefined
    ? (j.success === true ? 0 : -1)
    : (typeof j.code === "string" ? parseInt(j.code, 10) : j.code);
  if (code === 0) return j.data || {};
  const men = clip(j.msg || j.message || "sin detalles", 120);
  const e = new Error(que + ": " + men);
  e.apiMsg = String(j.msg || j.message || "");
  throw e;
}

// El plan gratuito de tikwm acepta ~1 petición por segundo: cuando avisa
// del límite, un respiro y una segunda oportunidad.
async function tkLlamada(que, hacer) {
  try {
    return await hacer();
  } catch (e) {
    const men = String((e && e.apiMsg) || (e && e.message) || "");
    if (/limit/i.test(men)) {
      await espera(1500);
      return await hacer();
    }
    throw e;
  }
}

async function tkPorEnlace(enlace) {
  return tkDatos(await pedirJson(BASE + "?url=" + encodeURIComponent(enlace)), "video por enlace");
}

async function tkBuscar(kw, cursor, cantidad) {
  return tkDatos(
    await pedirJson(BASE + "feed/search?keywords=" + encodeURIComponent(kw) +
      "&count=" + cantidad + "&cursor=" + encodeURIComponent(cursor || "0")),
    "búsqueda"
  );
}

async function tkUsuario(uid, cursor, cantidad) {
  return tkDatos(
    await pedirJson(BASE + "user/posts?unique_id=" + encodeURIComponent(uid) +
      "&count=" + cantidad + "&cursor=" + encodeURIComponent(cursor || "0")),
    "perfil"
  );
}

// La forma de la respuesta de tikwm ha cambiado con el tiempo: la lista
// puede venir en data.videos, data.list o data.aweme_list. Se prueban las
// tres para que el plugin sobreviva a esas mudanzas.
function videosDe(d) {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== "object") return [];
  if (Array.isArray(d.videos)) return d.videos;
  if (Array.isArray(d.list)) return d.list;
  if (Array.isArray(d.aweme_list)) return d.aweme_list;
  return [];
}

function cursorDe(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  if (d.cursor !== undefined && d.cursor !== null && String(d.cursor) !== "") return String(d.cursor);
  if (d.nextCursor !== undefined && d.nextCursor !== null && String(d.nextCursor) !== "") return String(d.nextCursor);
  return null;
}

function hayMasDe(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  if (d.hasMore === true || d.hasMore === 1) return true;
  if (d.has_more === true || d.has_more === 1) return true;
  return false;
}

// ---------- memoria del plugin ----------

// Lo que se sabe de cada video (quién lo subió, su título): al reproducir
// hay que armar el enlace canónico de TikTok, que lleva el @usuario.
var vistos = {};
function recordarVideo(id, autor, titulo) {
  if (!id) return;
  vistos[id] = { autor: autor || "", titulo: titulo || "", t: Date.now() };
  const claves = Object.keys(vistos);
  if (claves.length > 400) {
    claves.sort(function (a, b) { return vistos[a].t - vistos[b].t; });
    while (claves.length > 400) delete vistos[claves.shift()];
  }
}

// Las listas ya vistas (filas de la portada, búsquedas, perfiles): cuando
// alguien toca un video suelto, su lista queda de "canal" — el panel y la
// reproducción continua siguen con el resto, en el mismo orden.
var cacheListas = {};
function guardarLista(clave, items) {
  const refs = [];
  const porRef = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || it.kind !== "movie" || !it.ref) continue;
    refs.push(it.ref);
    porRef[it.ref] = {
      title: it.title || "Video de TikTok",
      still: it.poster || "",
      min: it.runtimeMinutes || 0
    };
  }
  if (refs.length < 2) return;
  cacheListas[clave] = { refs: refs, porRef: porRef, t: Date.now() };
  const claves = Object.keys(cacheListas);
  if (claves.length > 12) {
    claves.sort(function (a, b) { return cacheListas[a].t - cacheListas[b].t; });
    while (claves.length > 12) delete cacheListas[claves.shift()];
  }
}

// ¿En qué lista estaba este video? (la más reciente gana)
function listaConRef(ref) {
  let mejor = null;
  for (const clave in cacheListas) {
    const L = cacheListas[clave];
    if (Date.now() - L.t > 900000) {
      delete cacheListas[clave];
      continue;
    }
    if (L.porRef[ref] && (!mejor || L.t > mejor.t)) mejor = L;
  }
  return mejor;
}

// ---------- construcción de items ----------

function itemDeVideo(v) {
  if (!v || typeof v !== "object") return null;
  const id = String(v.id || v.video_id || v.aweme_id || "");
  if (!/^\d{6,25}$/.test(id)) return null;
  const autor = v.author && (v.author.unique_id || v.author.uniqueId)
    ? String(v.author.unique_id || v.author.uniqueId)
    : "";
  const titulo = clip(String(v.title || "").replace(/\s+/g, " ").trim(), 90) || "Video de TikTok";
  const item = {
    id: "tk.v." + id,
    ref: "v:" + id,
    title: titulo,
    kind: "movie"
  };
  const cover = v.cover || v.origin_cover || "";
  if (String(cover).indexOf("http") === 0) item.poster = String(cover);
  const nick = v.author && v.author.nickname ? String(v.author.nickname) : "";
  const firma = (autor ? "@" + autor : "") + (autor && nick ? " · " : "") + nick;
  if (firma) item.originalTitle = clip(firma, 120);
  const partes = [];
  if (v.play_count > 0) partes.push(miles(v.play_count) + " vistas");
  if (v.digg_count > 0) partes.push(miles(v.digg_count) + " me gusta");
  if (v.comment_count > 0) partes.push(miles(v.comment_count) + " comentarios");
  if (partes.length > 0) item.overview = clip(partes.join(" · "), 300);
  const seg = parseInt(v.duration, 10) || 0;
  if (seg > 0) item.runtimeMinutes = Math.max(1, Math.round(seg / 60));
  recordarVideo(id, autor, titulo);
  return item;
}

function itemsDeVideos(d) {
  const vids = videosDe(d);
  const items = [];
  const ya = {};
  for (let i = 0; i < vids.length; i++) {
    const item = itemDeVideo(vids[i]);
    if (!item || ya[item.id]) continue;
    ya[item.id] = 1;
    items.push(item);
  }
  return items;
}

// Una "serie" de TikTok: un tema (#hashtag). Sus episodios son los videos
// del momento de ese tema, uno tras otro.
function serieDeTema(kw, titulo, poster) {
  const item = {
    id: "tk.h." + kw.replace(/[^A-Za-z0-9._~-]/g, ""),
    ref: "h:" + kw,
    title: clip(titulo, 90),
    kind: "series",
    overview: "Un canal que corre solo: los videos de ahora, uno tras otro."
  };
  if (poster && String(poster).indexOf("http") === 0) item.poster = String(poster);
  return item;
}

// Una "serie" de TikTok: un creador (@usuario). Sus episodios son sus
// últimos videos.
function serieDeUsuario(uid, d) {
  const vids = videosDe(d);
  const primero = vids.length > 0 && vids[0] && vids[0].author ? vids[0].author : null;
  const item = {
    id: "tk.u." + uid,
    ref: "u:" + uid,
    title: "@" + uid,
    kind: "series"
  };
  if (primero) {
    if (primero.nickname) item.originalTitle = clip(String(primero.nickname), 120);
    if (primero.avatar && String(primero.avatar).indexOf("http") === 0) item.poster = String(primero.avatar);
  }
  item.overview = vids.length > 0
    ? clip("Sus últimos " + vids.length + " videos, uno tras otro.", 300)
    : "Perfil sin videos visibles (o privado).";
  return item;
}

// ---------- portada ----------

const TEMAS_PORTADA = [
  { id: "fyp", titulo: "Tendencias de hoy", kw: "#fyp", genero: "tendencias" },
  { id: "viral", titulo: "Viral ahora", kw: "#viral", genero: "tendencias" },
  { id: "humor", titulo: "Humor", kw: "#humor", genero: "entretenimiento" },
  { id: "musica", titulo: "Música", kw: "#musica", genero: "musica" },
  { id: "baile", titulo: "Baile", kw: "#baile", genero: "entretenimiento" },
  { id: "colombia", titulo: "Colombia", kw: "#colombia", genero: "otros" }
];

const TEMAS_CANALES = [
  { titulo: "Canal Tendencias", kw: "#fyp" },
  { titulo: "Canal Viral", kw: "#viral" },
  { titulo: "Canal Humor", kw: "#humor" }
];

export async function home() {
  const salida = [];
  const posters = {};
  let ok = 0;
  for (let i = 0; i < TEMAS_PORTADA.length; i++) {
    const f = TEMAS_PORTADA[i];
    if (i > 0) await espera(1100); // tikwm gratis: ~1 petición por segundo
    try {
      const d = await tkLlamada("portada " + f.kw, function () { return tkBuscar(f.kw, "0", 18); });
      const items = itemsDeVideos(d);
      if (items.length > 0) {
        ok = ok + 1;
        if (items[0].poster) posters[f.kw] = items[0].poster;
        guardarLista("h:" + f.kw, items);
        salida.push({
          id: "fila." + f.id,
          title: f.titulo,
          items: items,
          ref: "h:" + f.kw,
          genre: f.genero
        });
      }
    } catch (e) {
      // Fila omitida: las demás siguen.
    }
  }
  trazaPortada = ok + "/" + TEMAS_PORTADA.length + " filas";
  // Los mismos temas, como canal continuo: una "serie" por tema. Solo si
  // al menos un tema respondió (si TikTok está bloqueando todo, mejor el
  // error claro que una portada a medias).
  if (ok > 0) {
    const canales = [];
    for (let i = 0; i < TEMAS_CANALES.length; i++) {
      const c = TEMAS_CANALES[i];
      canales.push(serieDeTema(c.kw, c.titulo, posters[c.kw] || ""));
    }
    salida.push({
      id: "fila.canales",
      title: "Canales que corren solos",
      items: canales,
      genre: "otros"
    });
  }
  if (salida.length === 0) {
    throw kino.error("unavailable", "portada vacía (" + trazaPortada + ")", {
      userMessage: "TikTok no respondió ahora mismo. Espera un momento y vuelve a abrir la portada."
    });
  }
  return salida;
}

// ---------- categorías ----------

const CATEGORIAS = [
  { id: "humor", titulo: "Humor", kw: "#humor" },
  { id: "musica", titulo: "Música", kw: "#musica" },
  { id: "baile", titulo: "Baile", kw: "#baile" },
  { id: "cocina", titulo: "Cocina y comida", kw: "#cocina" },
  { id: "animales", titulo: "Animales", kw: "#animales" },
  { id: "deporte", titulo: "Deporte", kw: "#deporte" },
  { id: "belleza", titulo: "Belleza y estética", kw: "#belleza" },
  { id: "videojuegos", titulo: "Videojuegos", kw: "#videojuegos" }
];

export async function categories() {
  const fuera = [];
  for (let i = 0; i < CATEGORIAS.length; i++) {
    fuera.push({ id: "cat." + CATEGORIAS[i].id, title: CATEGORIAS[i].titulo, ref: "h:" + CATEGORIAS[i].kw });
  }
  return fuera;
}

// ---------- búsqueda ----------

// ¿Pegaron un enlace de TikTok? (normal, corto vt./vm., con o sin https)
function enlaceDe(q) {
  const m = String(q).match(/(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i);
  if (!m) return null;
  let enlace = m[0];
  if (enlace.indexOf("http") !== 0) enlace = "https://" + enlace;
  return enlace;
}

// Un error técnico traducido a algo que la persona pueda leer.
function traducirError(e, paraLaPersona) {
  const men = String(e && e.message ? e.message : e);
  if ((e && e.noJson === true) || /verification|just a moment|cloudflare/i.test(men)) {
    return kino.error("unavailable", clip(men, 120), {
      userMessage: "TikTok pidió una verificación ahora mismo. Espera un par de minutos y vuelve a intentar."
    });
  }
  if (/not found|no encontr|user not/i.test(men)) {
    return kino.error("not_found", clip(men, 120), {
      userMessage: paraLaPersona || "No se encontró. Revisa cómo lo escribiste."
    });
  }
  return kino.error("unavailable", clip(men, 150), {
    userMessage: paraLaPersona || "Algo falló al hablar con TikTok. Inténtalo otra vez en un momento."
  });
}

async function itemDeEnlace(enlace) {
  const d = await tkLlamada("enlace", function () { return tkPorEnlace(enlace); });
  const item = itemDeVideo(d);
  if (item) return item;
  throw new Error("el enlace no trajo video");
}

// Entre páginas de la misma búsqueda no se repite nada.
var vistosBusq = { q: null, ids: {} };
function paginaBusqueda(q, items, cursor) {
  if (vistosBusq.q !== q) vistosBusq = { q: q, ids: {} };
  const fuera = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && it.id && !vistosBusq.ids[it.id]) {
      vistosBusq.ids[it.id] = 1;
      fuera.push(it);
    }
  }
  guardarLista("q:" + q, fuera);
  if (cursor !== null && fuera.length > 0) return { items: fuera, next: cursor };
  return fuera;
}

async function buscarTexto(q, cursor, cantidad) {
  const c = cursor || "0";
  const d = await tkLlamada("búsqueda", function () { return tkBuscar(q, c, cantidad); });
  const items = itemsDeVideos(d);
  trazaBusqueda = "tikwm '" + clip(q, 30) + "': " + items.length + " resultados";
  const cur = cursorDe(d);
  const mas = hayMasDe(d) && cur !== null && cur !== c;
  return paginaBusqueda(q, items, mas ? cur : null);
}

export async function search(query) {
  const q = query && query.q ? String(query.q).trim() : "";
  const cursor = query && typeof query.cursor === "string" && query.cursor ? query.cursor : null;

  // Búsqueda DENTRO de una fila o categoría (capability scopedSearch).
  if (query && typeof query.within === "string" && query.within) {
    if (query.within.indexOf("h:") !== 0) return null;
    const tema = query.within.slice(2).trim();
    if (!tema || !q) return null;
    try {
      const qDentro = tema + " " + q;
      const d = await tkLlamada("búsqueda dentro", function () { return tkBuscar(qDentro, "0", 30); });
      return itemsDeVideos(d);
    } catch (e) {
      return null;
    }
  }

  if (!q) return [];

  const qLower = q.toLowerCase();
  if (qLower === "debug" || qLower === "estado") return informeDebug();

  // Página siguiente de la misma búsqueda.
  if (cursor) {
    return buscarTexto(q, cursor, 30);
  }

  // Enlace pegado: directo al video.
  const enlace = enlaceDe(q);
  if (enlace) {
    try {
      const item = await itemDeEnlace(enlace);
      return [item];
    } catch (e) {
      const m = enlace.match(/\/video\/(\d{6,25})/);
      if (m) {
        // El enlace trae el id: el item pelado, y el play reintenta.
        return [{ id: "tk.v." + m[1], ref: "v:" + m[1], title: "Video de TikTok", kind: "movie" }];
      }
      throw traducirError(e, "No se pudo leer el enlace. Revisa que esté completo e inténtalo otra vez.");
    }
  }

  // "@usuario": el perfil como canal (sus videos son los episodios) y
  // detrás sus últimos videos sueltos, ya traídos sin costo extra.
  if (q.charAt(0) === "@") {
    const uid = q.slice(1).trim().split(/\s+/)[0].replace(/^@+/, "");
    if (/^[A-Za-z0-9._]{1,30}$/.test(uid)) {
      try {
        const d = await tkLlamada("perfil", function () { return tkUsuario(uid, "0", 30); });
        const items = itemsDeVideos(d);
        guardarLista("u:" + uid, items);
        const fuera = [serieDeUsuario(uid, d)];
        for (let i = 0; i < items.length && i < 12; i++) fuera.push(items[i]);
        return fuera;
      } catch (e) {
        throw traducirError(e, "No se pudo abrir ese perfil (o es privado).");
      }
    }
    // Un "@algo" raro cae a la búsqueda normal.
  }

  // Texto o #hashtag.
  try {
    return await buscarTexto(q, null, 30);
  } catch (e) {
    throw traducirError(e, "TikTok no respondió ahora mismo. Espera un momento y vuelve a intentar.");
  }
}

// ---------- páginas (Ver más) ----------

var vistosBrowse = { ref: null, ids: {} };
function paginaBrowse(ref, items) {
  if (vistosBrowse.ref !== ref) vistosBrowse = { ref: ref, ids: {} };
  const fuera = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it && it.id && !vistosBrowse.ids[it.id]) {
      vistosBrowse.ids[it.id] = 1;
      fuera.push(it);
    }
  }
  return fuera;
}

export async function browse(ref, cursor) {
  ref = String(ref || "");
  const c = typeof cursor === "string" && cursor ? cursor : "0";
  if (ref.indexOf("h:") === 0) {
    const kw = ref.slice(2);
    try {
      const d = await tkLlamada("ver más", function () { return tkBuscar(kw, c, 30); });
      const items = paginaBrowse(ref, itemsDeVideos(d));
      const r = { items: items };
      const cur = cursorDe(d);
      if (items.length > 0 && hayMasDe(d) && cur !== null && cur !== c) r.next = cur;
      return r;
    } catch (e) {
      throw traducirError(e, "TikTok no respondió ahora mismo. Inténtalo otra vez en un momento.");
    }
  }
  if (ref.indexOf("u:") === 0) {
    const uid = ref.slice(2);
    try {
      const d = await tkLlamada("perfil (ver más)", function () { return tkUsuario(uid, c, 30); });
      const items = paginaBrowse(ref, itemsDeVideos(d));
      const r = { items: items };
      const cur = cursorDe(d);
      if (items.length > 0 && hayMasDe(d) && cur !== null && cur !== c) r.next = cur;
      return r;
    } catch (e) {
      throw traducirError(e, "No se pudo abrir este perfil ahora mismo.");
    }
  }
  throw kino.error("not_found", "browse ref " + clip(ref, 60));
}

// ---------- episodios (los canales) ----------

function episodiosDe(items) {
  const eps = [];
  for (let i = 0; i < items.length && i < 60; i++) {
    const it = items[i];
    if (!it || !it.ref) continue;
    const ep = { number: eps.length + 1, ref: it.ref, title: clip(it.title || "Video de TikTok", 90) };
    if (it.poster) ep.still = it.poster;
    if (it.runtimeMinutes) ep.runtimeMinutes = it.runtimeMinutes;
    eps.push(ep);
  }
  return eps;
}

export async function episodes(ref) {
  ref = String(ref || "");

  // Un tema (#hashtag) como serie: los videos del momento son los episodios.
  if (ref.indexOf("h:") === 0) {
    const kw = ref.slice(2);
    try {
      const d = await tkLlamada("canal " + kw, function () { return tkBuscar(kw, "0", 30); });
      const items = itemsDeVideos(d);
      if (items.length === 0) {
        throw kino.error("not_found", "tema sin videos", {
          userMessage: "Este tema no trajo videos ahora mismo. Prueba con otro."
        });
      }
      guardarLista(ref, items);
      return { episodes: episodiosDe(items) };
    } catch (e) {
      if (e && e.code) throw e;
      throw traducirError(e, "El canal no respondió ahora mismo. Inténtalo otra vez.");
    }
  }

  // Un creador (@usuario) como serie: sus últimos videos son los episodios.
  if (ref.indexOf("u:") === 0) {
    const uid = ref.slice(2);
    try {
      const d = await tkLlamada("canal @" + uid, function () { return tkUsuario(uid, "0", 30); });
      const items = itemsDeVideos(d);
      if (items.length === 0) {
        throw kino.error("not_found", "perfil sin videos", {
          userMessage: "Este perfil no tiene videos visibles (o es privado)."
        });
      }
      return { episodes: episodiosDe(items) };
    } catch (e) {
      if (e && e.code) throw e;
      throw traducirError(e, "El perfil no respondió ahora mismo. Inténtalo otra vez.");
    }
  }

  // Un video suelto: el video es el episodio 1 y detrás va SU CONTEXTO — la
  // fila de la portada, la búsqueda o el perfil de donde salió. El canal
  // sigue desde donde se tocó: primero los que venían detrás en la fila y,
  // al final, los de antes (vuelta completa).
  if (ref.indexOf("v:") === 0) {
    const id = ref.slice(2);
    const v = vistos[id];
    const ep1 = { number: 1, ref: ref, title: clip(v && v.titulo ? v.titulo : "Video de TikTok", 90) };

    const lista = listaConRef(ref);
    if (lista) {
      const inicio = lista.refs.indexOf(ref);
      const eps = [ep1];
      for (let k = 1; k < lista.refs.length && eps.length < 40; k++) {
        const r = lista.refs[(inicio + k + lista.refs.length) % lista.refs.length];
        const meta = lista.porRef[r];
        const ep = { number: eps.length + 1, ref: r, title: clip(meta.title, 90) };
        if (meta.still) ep.still = meta.still;
        if (meta.min) ep.runtimeMinutes = meta.min;
        eps.push(ep);
      }
      return { episodes: eps };
    }

    // Sin contexto: el canal del creador (si sabemos quién lo subió).
    if (v && v.autor) {
      try {
        const d = await tkLlamada("canal del autor", function () { return tkUsuario(v.autor, "0", 30); });
        const items = itemsDeVideos(d);
        const mezcla = [ep1];
        for (let i = 0; i < items.length && mezcla.length < 30; i++) {
          if (items[i].ref === ref) continue;
          mezcla.push(items[i]);
        }
        return { episodes: episodiosDe(mezcla) };
      } catch (e) {
        // Solo el video, entonces.
      }
    }
    return { episodes: [ep1] };
  }

  throw kino.error("not_found", "episodes ref " + clip(ref, 60));
}

// ---------- resolución: el corazón ----------

export async function resolve(ref) {
  let s = String(ref || "");
  if (s.indexOf("v:") === 0) s = s.slice(2);
  if (s.indexOf("e:") === 0) s = s.slice(2);
  if (!/^\d{6,25}$/.test(s)) {
    throw kino.error("not_found", "ref no es un video: " + clip(s, 60));
  }
  const v = vistos[s];
  const autor = v && v.autor ? v.autor : "tiktok";
  // El enlace canónico de TikTok lleva el @usuario, pero tikwm solo mira el
  // id del video: si no sabemos quién lo subió, cualquier usuario sirve.
  const candidatos = [
    "https://www.tiktok.com/@" + autor + "/video/" + s,
    "https://www.tiktok.com/@tiktok/video/" + s,
    "https://m.tiktok.com/v/" + s + ".html"
  ];
  let d = null;
  let ultimoError = null;
  for (let i = 0; i < candidatos.length; i++) {
    try {
      const r = await tkLlamada("resolve", function () { return tkPorEnlace(candidatos[i]); });
      if (r && (r.play || r.wmplay)) {
        d = r;
        break;
      }
    } catch (e) {
      ultimoError = e;
    }
  }
  if (!d) {
    trazaResolve = "falló: " + clip(String(ultimoError ? ultimoError.message : "sin respuesta"), 90);
    throw kino.error("not_found", "sin enlace del video (" + clip(trazaResolve, 60) + ")", {
      userMessage: "No se pudo conseguir este video. TikTok borra o bloquea videos seguido: prueba con otro."
    });
  }
  // El autor aprendido queda para la próxima (enlace canónico y canal).
  const autorNuevo = d.author && (d.author.unique_id || d.author.uniqueId)
    ? String(d.author.unique_id || d.author.uniqueId)
    : "";
  recordarVideo(s, autorNuevo || autor, clip(String(d.title || (v ? v.titulo : "")), 90));
  const conMarca = String(kino.config.get("marca") || "no").trim() === "si";
  const sinMarca = String(d.play || "");
  const conMarcaUrl = String(d.wmplay || "");
  let url = "";
  if (conMarca) url = conMarcaUrl || sinMarca;
  else url = sinMarca || conMarcaUrl;
  if (!url || url.indexOf("http") !== 0) {
    trazaResolve = "enlace vacío";
    throw kino.error("not_found", "enlace vacío", {
      userMessage: "Este video no tiene enlace de reproducción ahora mismo. Prueba con otro."
    });
  }
  const stream = { url: url, mime: "video/mp4" };
  stream.label = (url === sinMarca && sinMarca && !conMarca) ? "TikTok sin marca de agua" : "TikTok";
  trazaResolve = "tikwm: " + stream.label + " (" + clip(String(d.title || ""), 40) + ")";
  ultimoResolve = { label: stream.label, titulo: clip(String(d.title || ""), 60) };
  return stream;
}

// ---------- estado en Ajustes ----------

export async function settingsStatus() {
  const conMarca = String(kino.config.get("marca") || "no").trim() === "si";
  let texto = "Loop " + VERSION + ". Videos " + (conMarca ? "con marca de agua." : "sin marca de agua.") + ".";
  if (ultimoResolve) texto = texto + " Último: " + clip(ultimoResolve.titulo || ultimoResolve.label, 40) + ".";
  return { estado: clip(texto + " Detalle: busca 'debug'.", 200) };
}

// El informe técnico como resultados de búsqueda: cada línea es un
// resultado, así nada se corta (el Estado de Ajustes se corta en 200).
function informeDebug() {
  const lineas = [];
  lineas.push("Loop " + VERSION + " — informe técnico. (Estas líneas no se pueden reproducir.)");
  lineas.push("Marca de agua: " + String(kino.config.get("marca") || "no"));
  lineas.push("Portada: " + (trazaPortada || "(la portada aún no se ha abierto)"));
  lineas.push("Búsqueda: " + (trazaBusqueda || "(aún no se ha buscado)"));
  lineas.push("Reproducción: " + (trazaResolve || "(nada reproducido desde la actualización)"));
  lineas.push("Videos recordados: " + Object.keys(vistos).length + " (para enlaces y canales)");
  lineas.push("Listas en memoria: " + Object.keys(cacheListas).length + " (filas, búsquedas, perfiles)");
  const items = [];
  for (let i = 0; i < lineas.length; i++) {
    let resto = lineas[i];
    let n = 1;
    while (resto.length > 0) {
      items.push({
        id: "tk.debug." + i + "." + n,
        ref: "v:debug" + i + "x" + n,
        title: resto.slice(0, 110),
        kind: "movie"
      });
      resto = resto.slice(110);
      n = n + 1;
    }
  }
  return items;
}