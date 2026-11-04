// Loop 0.1.6 — TikTok en Kino: tendencias por país, doramas y anime en
// español, canales por gusto, búsqueda, creadores y enlaces pegados.
//
// Cómo funciona: TikTok no entrega los videos así nada más (su app exige
// sesión y firma cada petición). Este plugin habla con tikwm.com, el
// servicio público que usan los descargadores libres: le pasamos un enlace,
// un #hashtag o un @usuario y él responde con el MP4 directo del CDN de
// TikTok — SIN marca de agua (o con marca, si se prefiere en Ajustes).
// Es un servicio gratuito de un tercero, sin contrato de nivel de servicio.
//
// Detalles que importan:
// — La portada son las TENDENCIAS DE VARIOS PAÍSES (Colombia, EE. UU.,
//   México, España, Argentina, Brasil): ese camino de tikwm no pone
//   verificación. Tocar un video lo reproduce y el resto de su fila queda
//   de lista detrás (el canal continúa solo, desde donde se tocó). La fila
//   "Canales que corren solos" abre las tendencias de un país como serie,
//   episodio tras episodio.
// — «Canales por gusto»: doramas y anime EN ESPAÑOL, AMV, k-pop y más.
//   Cada uno abre un canal con los videos de ese tema — el mismo camino
//   de los hashtags, que usa la verificación pasada en Ajustes (sin
//   ella, al abrir uno la app pedirá pasarla; la fila "Doramas en
//   español" de la portada tampoco sale). Los canales en español y la
//   fila de doramas muestran los videos MÁS LARGOS primero: los doramas
//   y animes doblados se suben en partes largas, no en clips corticos.
// — Los #hashtags y los @perfiles usan ese camino de tikwm que a veces
//   pide una verificación (la página de seguridad que no deja pasar). El
//   botón "Pasar verificación" de Ajustes la pasa UNA VEZ en una ventanita:
//   la galleta que gana y el disfraz del navegador que la ganó viajan
//   desde entonces con cada petición de hashtags y perfiles. Sin esa
//   verificación, las tendencias y los enlaces pegados igual funcionan.
// — Los enlaces de video que devuelve tikwm EXPIRAN en pocas horas: por eso
//   se resuelven AL REPRODUCIR y nunca se guardan en caché.
// — En el buscador se puede pegar cualquier enlace de TikTok (normal, corto
//   vt.tiktok.com o vm.tiktok.com) y el video se abre directo.
// — El buscador ya no se queda en la primera página: al llegar al final de
//   los resultados, la siguiente se carga sola (hasta unos 200 videos).
// — La portada pide sus filas A LA VEZ, con un escalonado de un segundo
//   entre una y otra (el plan gratuito de tikwm acepta más o menos una
//   petición por segundo: pedirlas casi juntas las negaba TODAS con
//   "Free Api Limit"): pedidas en fila, los viajes de ida y vuelta se
//   sumaban y la app corta la portada a los 20 segundos. Si tikwm avisa
//   del límite del plan gratuito, se espera y se reintenta una vez.
// — "debug" (o "estado") en el buscador muestra el informe técnico.

const VERSION = "0.1.6";
const BASE = "https://tikwm.com/api/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ---------- diagnóstico (se ve con "debug" en el buscador) ----------

let trazaPortada = "";
let trazaBusqueda = "";
let trazaResolve = "";
let trazaVentana = "";
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

// ---------- almacén (la verificación pasada, para que dure) ----------

function getJson(clave, porDefecto) {
  try {
    const v = kino.storage.get(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

function setJson(clave, valor, ttlMs) {
  try {
    kino.storage.set(clave, JSON.stringify(valor), ttlMs || 0);
    return true;
  } catch (e) {
    return false;
  }
}

// La verificación cuando la persona la ha pasado: la galleta que ganó la
// ventanita y el disfraz del navegador que la ganó viajan juntos (la
// revisión los amarra). Sin la una no sirve el otro.
function galletaActual() {
  const g = getJson("verificacion", null);
  if (!g || !g.cookies) return null;
  const nombres = Object.keys(g.cookies);
  if (nombres.length === 0) return null;
  return g;
}

// Las cabeceras extra para los caminos con verificación (#hashtags y
// @perfiles). Null cuando no hay verificación guardada.
function cabecerasVerificadas() {
  const g = galletaActual();
  if (!g) return null;
  const partes = [];
  for (const nombre in g.cookies) partes.push(nombre + "=" + g.cookies[nombre]);
  if (partes.length === 0) return null;
  return { "Cookie": partes.join("; "), "User-Agent": g.ua || UA };
}

// ¿El error es la verificación de seguridad de TikTok? (la página HTML que
// no es JSON, o un 403).
function esVerificacion(e) {
  if (e && e.noJson === true) return true;
  const men = String((e && e.message) || "");
  return /verification|just a moment|cloudflare|http 403/i.test(men);
}

// El error traducido: dónde está el botón que lo arregla.
function errorVerificacion(que) {
  return kino.error("unavailable", clip(que + ": verificación de TikTok pendiente", 120), {
    userMessage: "TikTok pidió una verificación. Toca «Pasar verificación» en Ajustes ▸ Loop, espera la ventana y toca Listo; luego reintenta."
  });
}

// ---------- red ----------

// tikwm (y TikTok) devuelven los ids de video como números de 19 dígitos:
// JavaScript redondea números tan grandes al leerlos. Se entrecomillan
// ANTES de interpretar el JSON, para que el id llegue intacto.
function protegerIds(texto) {
  return String(texto).replace(/("(?:id|video_id|aweme_id)"\s*:\s*)(\d{12,25})(\s*[},])/g, '$1"$2"$3');
}

async function pedirJson(url, timeoutMs, extra) {
  let ultimoError = null;
  for (let intento = 0; intento < 2; intento++) {
    const cabeceras = { "Accept": "application/json", "User-Agent": UA };
    if (extra && extra["User-Agent"]) cabeceras["User-Agent"] = extra["User-Agent"];
    if (extra && extra["Cookie"]) cabeceras["Cookie"] = extra["Cookie"];
    const r = await kino.fetch(url, {
      method: "GET",
      headers: cabeceras,
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

// Tendencias de un país: el camino SIN verificación (por eso es la portada).
async function tkTendencias(region, cursor, cantidad, timeoutMs) {
  return tkDatos(
    await pedirJson(BASE + "feed/list?count=" + cantidad +
      "&region=" + encodeURIComponent(region) +
      "&cursor=" + encodeURIComponent(cursor || "0"),
      timeoutMs || 15000),
    "tendencias " + region
  );
}

// Búsqueda de #hashtags: el camino que a veces pide verificación; si la
// persona ya la pasó, la galleta viaja aquí.
async function tkBuscar(kw, cursor, cantidad, timeoutMs) {
  return tkDatos(
    await pedirJson(BASE + "feed/search?keywords=" + encodeURIComponent(kw) +
      "&count=" + cantidad + "&cursor=" + encodeURIComponent(cursor || "0"),
      timeoutMs || 15000, cabecerasVerificadas()),
    "búsqueda"
  );
}

// Los videos de un @usuario: mismo camino con verificación que los hashtags.
async function tkUsuario(uid, cursor, cantidad) {
  return tkDatos(
    await pedirJson(BASE + "user/posts?unique_id=" + encodeURIComponent(uid) +
      "&count=" + cantidad + "&cursor=" + encodeURIComponent(cursor || "0"),
      15000, cabecerasVerificadas()),
    "perfil"
  );
}

// La forma de la respuesta de tikwm ha cambiado con el tiempo: la lista
// puede venir en data.videos, data.list, data.aweme_list o data pelada (las
// tendencias). Se prueban todas para que el plugin sobreviva a mudanzas.
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

// El cursor de la página siguiente. tikwm a veces lo dice (cursor/has_more);
// cuando no lo dice, el cursor de la búsqueda funciona como desplazamiento
// (0, 25, 50...): se calcula aquí mismo y se sigue bajando hasta ~200
// resultados o hasta que la página no traiga videos nuevos.
function cursorSiguiente(d, c) {
  const cur = cursorDe(d);
  if (cur !== null && cur !== c && hayMasDe(d)) return cur;
  if (cur === null) {
    const crudos = videosDe(d).length;
    if (crudos >= 10) {
      const off = (parseInt(c, 10) || 0) + crudos;
      if (off < 200) return String(off);
    }
  }
  return null;
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

// Une dos páginas de resultados sin repetir videos.
function fusionarItems(una, otra) {
  const fuera = una.slice();
  const ya = {};
  for (let i = 0; i < una.length; i++) ya[una[i].id] = 1;
  for (let i = 0; i < otra.length; i++) {
    const it = otra[i];
    if (it && it.id && !ya[it.id]) {
      ya[it.id] = 1;
      fuera.push(it);
    }
  }
  return fuera;
}

// Los temas en español y los doblados piden videos LARGOS primero: los
// doramas y animes doblados se suben en partes largas, no en clips corticos.
function temaLargo(tag) {
  return /español|doblado/i.test(String(tag || ""));
}

// Los más largos primero; el resto mantiene su orden (los cortos quedan
// al final, no se botan). Si algo raro pasa, se devuelve tal cual.
function ordenarLargos(items) {
  try {
    return items.slice().sort(function (a, b) {
      return (parseInt(b.runtimeMinutes, 10) || 0) - (parseInt(a.runtimeMinutes, 10) || 0);
    });
  } catch (e) {
    return items;
  }
}

// Una "serie" de TikTok: las tendencias de un país. Sus episodios son los
// videos del momento de ese país, uno tras otro.
function serieDeRegion(region, titulo, poster) {
  const item = {
    id: "tk.r." + region,
    ref: "r:" + region,
    title: clip(titulo, 90),
    kind: "series",
    overview: "Un canal que corre solo: las tendencias de TikTok de esta región, uno tras otro."
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

// Una "serie" de TikTok: un tema (anime, doramas, AMV…). Sus episodios son
// los videos del momento de ese tema, uno tras otro.
function serieDeTema(titulo, tag) {
  return {
    id: "tk.h." + String(tag).replace(/[^a-z0-9]/gi, "").toLowerCase(),
    ref: "h:" + tag,
    title: clip(titulo, 90),
    kind: "series",
    overview: "Un canal que corre solo: los videos del momento de este tema, uno tras otro" + (temaLargo(tag) ? "; los más largos salen primero." : ".")
  };
}

// ---------- portada ----------

const REGIONES_PORTADA = [
  { id: "co", titulo: "Tendencias Colombia", region: "CO" },
  { id: "us", titulo: "Tendencias EE. UU.", region: "US" },
  { id: "mx", titulo: "Tendencias México", region: "MX" },
  { id: "es", titulo: "Tendencias España", region: "ES" },
  { id: "ar", titulo: "Tendencias Argentina", region: "AR" },
  { id: "br", titulo: "Tendencias Brasil", region: "BR" }
];

const CANALES_PORTADA = [
  { titulo: "Canal Colombia", region: "CO" },
  { titulo: "Canal EE. UU.", region: "US" },
  { titulo: "Canal México", region: "MX" }
];

// La fila de doramas de la portada: EN ESPAÑOL (petición del usuario — el
// #doramas mundial trae videos en otros idiomas). Si el buscador en español
// no trae nada, se cae al #doramas mundial antes de omitir la fila. Va por
// el camino de los #hashtags (usa la verificación pasada, si la hay). Sin
// verificación no sale y las tendencias siguen igual. Los videos más
// largos salen primero: los doramas doblados se suben en partes largas.
const DORAMAS_FILA = { id: "doramas", titulo: "Doramas en español", tag: "doramas en español", respaldo: "#doramas", ref: "h:doramas en español" };

// Los canales por gusto: los de español primero (sus videos más largos
// salen primero). Sin galleta, tocarlos enseña el camino del botón de
// verificación.
const TEMAS = [
  { titulo: "Doramas en español", tag: "doramas en español" },
  { titulo: "Doramas doblados", tag: "doramas doblados" },
  { titulo: "Anime en español", tag: "anime en español" },
  { titulo: "Anime", tag: "#anime" },
  { titulo: "AMV", tag: "#amv" },
  { titulo: "K-pop", tag: "#kpop" },
  { titulo: "Baile", tag: "#dance" },
  { titulo: "Memes", tag: "#memes" },
  { titulo: "Fútbol", tag: "#futbol" },
  { titulo: "Videojuegos", tag: "#gaming" },
  { titulo: "Recetas", tag: "#recetas" },
  { titulo: "Humor", tag: "#humor" }
];

const REGIONES_CATEGORIAS = REGIONES_PORTADA.concat([
  { id: "pe", titulo: "Tendencias Perú", region: "PE" },
  { id: "cl", titulo: "Tendencias Chile", region: "CL" }
]);

export async function home() {
  const posters = {};
  const progreso = { ok: 0, detalle: [] };
  // Las filas se piden A LA VEZ, con un escalonado de un segundo entre una
  // y otra (el plan gratuito de tikwm acepta más o menos una petición por
  // segundo: pedidas casi juntas las negaba TODAS con "Free Api Limit"):
  // pedidas en fila, los viajes de ida y vuelta se sumaban y la app corta
  // la portada a los 20 segundos. Así la portada tarda lo que tarda la
  // última fila, no la suma de las siete.
  const pedidas = [];
  for (let i = 0; i < REGIONES_PORTADA.length; i++) {
    pedidas.push((async function (f, retraso) {
      await espera(retraso);
      try {
        const d = await tkLlamada("portada " + f.region, function () {
          return tkTendencias(f.region, "0", 18, 6000);
        });
        const items = itemsDeVideos(d);
        if (items.length > 0) {
          progreso.ok = progreso.ok + 1;
          progreso.detalle.push(f.region + " " + items.length);
        } else {
          progreso.detalle.push(f.region + " vacía");
        }
        trazaPortada = progreso.ok + "/" + REGIONES_PORTADA.length + " filas (" + progreso.detalle.join(" · ") + ")";
        return { f: f, items: items };
      } catch (e) {
        // Fila omitida: las demás siguen.
        progreso.detalle.push(f.region + " falló: " + clip(String((e && e.message) || e), 40));
        trazaPortada = progreso.ok + "/" + REGIONES_PORTADA.length + " filas (" + progreso.detalle.join(" · ") + ")";
        return { f: f, items: [] };
      }
    })(REGIONES_PORTADA[i], i * 1100));
  }
  // La fila de doramas en español va última en el escalonado (sigue en
  // paralelo con las demás; solo empieza un segundo después de la última).
  pedidas.push((async function (f, retraso) {
    await espera(retraso);
    try {
      let d = await tkLlamada("fila doramas", function () {
        return tkBuscar(f.tag, "0", 18, 6000);
      });
      let items = itemsDeVideos(d);
      if (items.length === 0 && f.respaldo) {
        // El buscador en español no trajo nada: el #doramas mundial.
        await espera(1100);
        try {
          d = await tkLlamada("fila doramas (respaldo)", function () {
            return tkBuscar(f.respaldo, "0", 18, 6000);
          });
          items = itemsDeVideos(d);
        } catch (e2) {
          items = [];
        }
      }
      if (items.length > 0) {
        // Los doramas doblados se suben en partes largas: los largos primero.
        items = ordenarLargos(items);
        progreso.detalle.push("doramas " + items.length);
      } else {
        progreso.detalle.push("doramas vacía");
      }
      trazaPortada = progreso.ok + "/" + REGIONES_PORTADA.length + " filas (" + progreso.detalle.join(" · ") + ")";
      return { f: f, items: items };
    } catch (e) {
      // Sin verificación pasada (o sin respuesta): la fila no sale.
      progreso.detalle.push("doramas omitida (falta verificación o respuesta)");
      trazaPortada = progreso.ok + "/" + REGIONES_PORTADA.length + " filas (" + progreso.detalle.join(" · ") + ")";
      return { f: f, items: [] };
    }
  })(DORAMAS_FILA, REGIONES_PORTADA.length * 1100));
  const filas = await Promise.all(pedidas);
  const salida = [];
  let ok = 0;
  for (let i = 0; i < filas.length; i++) {
    const r = filas[i];
    const f = r.f;
    if (r.items.length > 0) {
      ok = ok + 1;
      const ref = f.region ? "r:" + f.region : f.ref;
      if (f.region && r.items[0].poster) posters[f.region] = r.items[0].poster;
      guardarLista(ref, r.items);
      salida.push({
        id: "fila." + f.id,
        title: f.titulo,
        items: r.items,
        ref: ref,
        genre: f.region ? "entretenimiento" : "drama"
      });
    }
  }
  kino.log("Loop portada: " + trazaPortada);
  // Las tendencias de un país, como canal continuo: una "serie" por país.
  // Solo si al menos un país respondió (si TikTok está bloqueando todo,
  // mejor el error claro que una portada a medias).
  if (ok > 0) {
    const canales = [];
    for (let i = 0; i < CANALES_PORTADA.length; i++) {
      const c = CANALES_PORTADA[i];
      canales.push(serieDeRegion(c.region, c.titulo, posters[c.region] || ""));
    }
    salida.push({
      id: "fila.canales",
      title: "Canales que corren solos",
      items: canales,
      genre: "otros"
    });
    const temas = [];
    for (let i = 0; i < TEMAS.length; i++) {
      temas.push(serieDeTema(TEMAS[i].titulo, TEMAS[i].tag));
    }
    salida.push({
      id: "fila.temas",
      title: "Canales por gusto",
      items: temas,
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

export async function categories() {
  const fuera = [];
  for (let i = 0; i < REGIONES_CATEGORIAS.length; i++) {
    fuera.push({ id: "cat." + REGIONES_CATEGORIAS[i].id, title: REGIONES_CATEGORIAS[i].titulo, ref: "r:" + REGIONES_CATEGORIAS[i].region });
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
  if (esVerificacion(e)) {
    return errorVerificacion("llamada");
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
  trazaBusqueda = "tikwm '" + clip(q, 30) + "': " + items.length + " resultados (página desde " + c + ")";
  return paginaBusqueda(q, items, cursorSiguiente(d, c));
}

export async function search(query) {
  const q = query && query.q ? String(query.q).trim() : "";
  const cursor = query && typeof query.cursor === "string" && query.cursor ? query.cursor : null;

  // Búsqueda DENTRO de una fila o categoría (capability scopedSearch).
  // Las filas de regiones no tienen búsqueda propia en tikwm: null y Kino
  // filtra la página él mismo.
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
        if (esVerificacion(e)) throw errorVerificacion("perfil");
        throw traducirError(e, "No se pudo abrir ese perfil (o es privado).");
      }
    }
    // Un "@algo" raro cae a la búsqueda normal.
  }

  // Texto o #hashtag.
  try {
    return await buscarTexto(q, null, 30);
  } catch (e) {
    if (esVerificacion(e)) throw errorVerificacion("búsqueda");
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

  // Las tendencias de un país (las filas de la portada y las categorías).
  if (ref.indexOf("r:") === 0) {
    const region = ref.slice(2).toUpperCase();
    const cNum = parseInt(c, 10) || 0;
    if (!/^[A-Z]{2}$/.test(region) || cNum > 150) return { items: [] };
    try {
      const d = await tkLlamada("ver más " + region, function () { return tkTendencias(region, c, 30); });
      const items = paginaBrowse(ref, itemsDeVideos(d));
      const r = { items: items };
      // El cursor de las tendencias es un desplazamiento: la siguiente
      // página sigue donde terminó esta. Si no hubo videos nuevos, se
      // acabó la lista.
      if (items.length > 0) r.next = String(cNum + 30);
      return r;
    } catch (e) {
      throw traducirError(e, "TikTok no respondió ahora mismo. Inténtalo otra vez en un momento.");
    }
  }

  // Un tema (#hashtag o palabras en español): el camino con verificación.
  if (ref.indexOf("h:") === 0) {
    const kw = ref.slice(2);
    try {
      const d = await tkLlamada("ver más", function () { return tkBuscar(kw, c, 30); });
      const items = paginaBrowse(ref, itemsDeVideos(d));
      const r = { items: items };
      const cur = cursorSiguiente(d, c);
      if (items.length > 0 && cur !== null) r.next = cur;
      return r;
    } catch (e) {
      if (esVerificacion(e)) throw errorVerificacion("ver más");
      throw traducirError(e, "TikTok no respondió ahora mismo. Inténtalo otra vez en un momento.");
    }
  }

  // Un creador (@usuario).
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
      if (esVerificacion(e)) throw errorVerificacion("perfil");
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

  // Las tendencias de un país como serie: los videos del momento son los
  // episodios, uno tras otro.
  if (ref.indexOf("r:") === 0) {
    const region = ref.slice(2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) throw kino.error("not_found", "región extraña " + clip(region, 60));
    try {
      const d = await tkLlamada("canal " + region, function () { return tkTendencias(region, "0", 30); });
      const items = itemsDeVideos(d);
      if (items.length === 0) {
        throw kino.error("not_found", "tendencias sin videos", {
          userMessage: "Esta región no trajo videos ahora mismo. Prueba con otra."
        });
      }
      guardarLista(ref, items);
      return { episodes: episodiosDe(items) };
    } catch (e) {
      if (e && e.code) throw e;
      throw traducirError(e, "El canal no respondió ahora mismo. Inténtalo otra vez.");
    }
  }

  // Un tema (#hashtag o palabras en español) como serie: se buscan DOS
  // páginas de videos (más material para el canal) y en los temas en
  // español los MÁS LARGOS salen primero.
  if (ref.indexOf("h:") === 0) {
    const kw = ref.slice(2);
    try {
      const d = await tkLlamada("canal " + kw, function () { return tkBuscar(kw, "0", 30); });
      let items = itemsDeVideos(d);
      const cur2 = cursorSiguiente(d, "0");
      if (items.length > 0 && cur2 !== null && items.length < 60) {
        await espera(1100);
        try {
          const d2 = await tkLlamada("canal " + kw + " (pág 2)", function () { return tkBuscar(kw, cur2, 30); });
          items = fusionarItems(items, itemsDeVideos(d2));
        } catch (e2) {
          // La primera página alcanza.
        }
      }
      if (temaLargo(kw)) items = ordenarLargos(items);
      if (items.length === 0) {
        throw kino.error("not_found", "tema sin videos", {
          userMessage: "Este tema no trajo videos ahora mismo. Prueba con otro."
        });
      }
      guardarLista(ref, items);
      return { episodes: episodiosDe(items) };
    } catch (e) {
      if (e && e.code) throw e;
      if (esVerificacion(e)) throw errorVerificacion("canal");
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
      if (esVerificacion(e)) throw errorVerificacion("canal");
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
  const g = galletaActual();
  if (g) {
    const hace = g.t ? Math.max(0, Math.round((Date.now() - g.t) / 60000)) : 0;
    texto = texto + " Verificación: pasada hace " + (hace >= 90 ? Math.round(hace / 60) + " h" : hace + " min") + ".";
  } else {
    texto = texto + " Verificación: sin pasar (los #hashtags y los perfiles la pueden pedir).";
  }
  if (ultimoResolve) texto = texto + " Último: " + clip(ultimoResolve.titulo || ultimoResolve.label, 40) + ".";
  return { estado: clip(texto + " Detalle: busca 'debug'.", 200) };
}

// La ventanita de verificación (Ajustes ▸ Loop ▸ Pasar verificación).
// TikTok a veces pide su revisión en el camino de los #hashtags: la ventana
// abre ESE camino, la persona espera a que cargue (la revisión se pasa sola
// o con un toque) y al tocar Listo la galleta y el disfraz del navegador
// llegan aquí y viajan desde entonces con cada petición. Una ventana por
// toque, solo tras un toque de la persona (requisito de la app) y solo si
// esta versión de la app tiene la ventanita disponible.
export async function action(key) {
  if (key !== "verificacion") return null;
  if (!kino.visualBrowser || !kino.visualBrowser.available) {
    throw kino.error("unavailable", "sin ventana del navegador", {
      userMessage: "Esta versión de la app no trae la ventana del navegador. Actualiza la app e inténtalo otra vez."
    });
  }
  let r = null;
  try {
    r = await kino.visualBrowser.open({
      url: BASE + "feed/search?keywords=" + encodeURIComponent("#fyp") + "&count=1&cursor=0",
      title: "Verificación de TikTok",
      collect: { cookies: ["cf_clearance", "__cf_bm"] },
      userAgent: "browser",
      timeoutMs: 120000
    });
  } catch (e) {
    trazaVentana = "ventana falló: " + clip(String((e && e.message) || e), 80);
    kino.log("Loop " + trazaVentana);
    throw kino.error("unavailable", clip(trazaVentana, 120), {
      userMessage: "La ventana no se pudo abrir ahora mismo. Inténtalo otra vez en un momento."
    });
  }
  const st = (r && r.status) || "sin-respuesta";
  // Las galletas pueden llegar de varias formas: se normalizan todas a un
  // objeto {nombre: valor}.
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
  trazaVentana = "ventana: " + st + ", galletas " + (nombres.length ? nombres.join(",") : "ninguna");
  kino.log("Loop " + trazaVentana);
  if (st !== "done" || nombres.length === 0) {
    throw kino.error("unavailable", clip(trazaVentana, 120), {
      userMessage: "La verificación no se completó. Ábrela otra vez y espera a que la página cargue antes de tocar Listo."
    });
  }
  const guardado = setJson("verificacion", { cookies: g, ua: String(r.userAgent || ""), t: Date.now() }, 21600000);
  if (!guardado) {
    throw kino.error("unavailable", "no se pudo guardar la verificación", {
      userMessage: "La verificación pasó pero no se pudo guardar. Vuelve a tocar el botón."
    });
  }
  return null;
}

// El informe técnico como resultados de búsqueda: cada línea es un
// resultado, así nada se corta (el Estado de Ajustes se corta en 200).
function informeDebug() {
  const lineas = [];
  const g = galletaActual();
  lineas.push("Loop " + VERSION + " — informe técnico. (Estas líneas no se pueden reproducir.)");
  lineas.push("Marca de agua: " + String(kino.config.get("marca") || "no"));
  lineas.push("Portada: " + (trazaPortada || "(la portada aún no se ha abierto)"));
  lineas.push("Galleta: " + (g
    ? "presente (gana el camino de #hashtags y @perfiles)"
    : "ninguna (los #hashtags y los @perfiles pueden pedir verificación)"));
  lineas.push("Ventana: " + (trazaVentana || "(la ventanita no se ha abierto)"));
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
