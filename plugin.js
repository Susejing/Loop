// Loop — TikTok en Kino · github.com/Susejing/Loop
// Copyright (C) 2026 Susejing
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Loop 0.4.0 — TikTok en Kino: la sección propia «Loop» con las pestañas
// LLENAS: más filas por gusto (la segunda página del tema principal —«Más
// doramas en español»—, K-dramas y música del momento), una fila «Continuar
// viendo» con lo último que se miró y los canales del gusto siempre al
// final de cada pestaña; «Países» sube a OCHO regiones ( Perú y Chile).
// Viene de la 0.3.0: sección con destacado y pestañas, colores TikTok (el
// acento cian pinta la barra del reproductor mientras suena un video de
// Loop); y de la 0.2.0: portada con criterio (doramas en español arriba,
// Colombia detrás), insignias en las tarjetas (Nuevo, Largo, Español),
// géneros por tema, categorías de países y temas, y el arte de fondo del
// video en su ficha. Además: tendencias por país, canales por gusto,
// búsqueda, creadores y enlaces pegados.
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
// — La sección propia «Loop» (chip arriba del Inicio en el teléfono,
//   barra lateral en la TV) abre con un video destacado arriba y sus
//   pestañas por gusto, cada una con VARIAS filas: lo mejor del tema, la
//   segunda página del tema principal («Más doramas en español»…), lo
//   último que se miró («Continuar viendo») y los canales del gusto al
//   final. «Países» trae las tendencias de OCHO regiones. Sin verificación
//   llega a «Países» (las tendencias no necesitan galleta); una pestaña
//   de temas sin verificación muestra «Continuar viendo» y sus canales.
// — La "descripción" de un video de TikTok ES su propio texto (caption):
//   el título llega más completo y la descripción entera, con la fecha de
//   subida y las cifras (vistas, me gusta), va en el detalle del video.
//   El @canal que lo subió va siempre como subtítulo; abrir un video
//   suelto deja su canal de lista detrás, y buscar «@usuario» abre su
//   canal directo.
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

const VERSION = "0.5.4";
const BASE = "https://tikwm.com/api/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// La verificación pasada dura ~7 días (o hasta que TikTok pida revisión de
// nuevo); la portada completa se recuerda 20 minutos.
const VERIF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PORTADA_CACHE_MS = 20 * 60 * 1000;

// El espejo de tikwm: si el dominio principal no responde (colgado, lento
// o bloqueando), la misma petición sale por el espejo tikwm.org.
const BASE_PRINCIPAL = "https://tikwm.com/api/";
const BASE_ESPEJO = "https://tikwm.org/api/"; // host ya aprobado en el teléfono: SI tikwm.com le cierra la puerta a su IP, el espejo puede tenerla abierta

// EL CARTERO (0.5.3): r.jina.ai es un lector público que recoge la respuesta
// del sitio que se le pide DESDE SUS PROPIOS servidores y la trae. Si tikwm
// y su espejo le simulan sordera a la IP del teléfono, el teléfono solo
// necesita hablar con el cartero (que no tiene pleito con nadie). Va de
// TERCERA mano y SIN reintento: primero tikwm.com, luego tikwm.org, y solo
// si ambos rinden sale el cartero (lento la primera vez, rápido de caché).
const CARTERO = "https://r.jina.ai/";

// ---------- el respaldo experimental (otro servicio, no tikwm) ----------
// douyin.wtf es un servicio público DISTINTO: si tikwm se rinde en sus dos
// rutas, jugar un video todavía tiene esta última red. SOLO se usa para
// REPRODUCIR un video pedido por la persona (portada, canales y memoria
// siguen en tikwm + semilla + memoria de fila). Es experimental: nunca lo
// pudimos probar desde el banco de pruebas, así que si falla, falla callado
// (se ve en el informe de "debug" en la línea «Respaldo»): no rompe nada.
const BASE_TERCERO = "https://douyin.wtf/api/hybrid/video_data?url=";
// RESPALDO REENCENDIDO (0.5.1): se usa SOLO para reproducir un video cuando
// tikwm.com y su espejo rinden. Si Kino bloquea el host douyin.wtf por no
// estar aprobado, el fallo queda escrito en el informe de "debug" y por fin
// sabremos CÓMO trata Kino a los hosts sin aprobar (jamás pidió aprobarlos).
const RESPALDO_ACTIVO = true;
const TOPE_TERCERO_MS = 12000;
let trazaRespaldo = "(sin usar aún)";

async function pedidoTercero(url) {
  const rr = await Promise.race([
    kino.fetch(url, { method: "GET", headers: { "Accept": "application/json", "User-Agent": UA }, timeoutMs: TOPE_TERCERO_MS }),
    espera(TOPE_TERCERO_MS + 500).then(function () { throw new Error("el respaldo douyin.wtf no respondió a tiempo"); })
  ]);
  if (!rr || !rr.ok) throw new Error("respaldo http " + (rr ? rr.status : "sin respuesta"));
  let cuerpo = "";
  try { cuerpo = await rr.text(); } catch (e) { throw new Error("respaldo: respuesta ilegible"); }
  const t = String(cuerpo || "").trim();
  if (t.charAt(0) !== "{") throw new Error("respaldo: respuesta no JSON");
  try { return JSON.parse(t); } catch (e) { throw new Error("respaldo: JSON roto"); }
}

// Busca en CUALQUIER JSON el enlace del MP4 y los datos del video, sin
// presuponer la forma de la respuesta: camina el árbol entero y recoge
// play_addr / download_addr y compañía donde los encuentre.
function datosDeArbol(j) {
  const enlaces = [];
  let titulo = "", autor = "", portada = "", minutos = 0;
  (function rec(n, prof) {
    if (!n || typeof n !== "object" || prof > 9) return;
    if (Array.isArray(n)) { for (let i = 0; i < n.length; i++) rec(n[i], prof + 1); return; }
    if (!titulo && typeof n.desc === "string" && n.desc) titulo = n.desc;
    if (!titulo && typeof n.title === "string" && n.title) titulo = n.title;
    if (!minutos && typeof n.duration === "number" && n.duration > 0) minutos = Math.max(1, Math.round((n.duration > 3600 ? n.duration / 1000 : n.duration) / 60));
    if (!autor && n.author && typeof n.author === "object") {
      autor = String(n.author.unique_id || n.author.uniqueId || n.author.nickname || "");
    }
    const v = n.video;
    if (v && !Array.isArray(v) && typeof v === "object") {
      const direcciones = [v.play_addr, v.download_addr, v.play_addr_bytevc1, v.play_addr_h264,
        (Array.isArray(v.bit_rate) && v.bit_rate[0] && typeof v.bit_rate[0] === "object") ? v.bit_rate[0].play_addr : null];
      for (let i = 0; i < direcciones.length; i++) {
        const dir = direcciones[i];
        if (dir && typeof dir === "object" && Array.isArray(dir.url_list)) {
          for (let k = 0; k < dir.url_list.length; k++) {
            if (typeof dir.url_list[k] === "string" && dir.url_list[k].indexOf("http") === 0) enlaces.push(dir.url_list[k]);
          }
        }
      }
      const c = v.cover || v.origin_cover || v.dynamic_cover;
      if (!portada && c && typeof c === "object" && Array.isArray(c.url_list) && typeof c.url_list[0] === "string") portada = c.url_list[0];
    }
    const claves = Object.keys(n);
    for (let i = 0; i < claves.length; i++) rec(n[claves[i]], prof + 1);
  })(j, 0);
  if (enlaces.length === 0) return null;
  let enlace = enlaces[0];
  for (let i = 0; i < enlaces.length; i++) if (/\.mp4/.test(enlaces[i])) { enlace = enlaces[i]; break; }
  return {
    play: enlace, wmplay: "", cover: portada, minutos: minutos,
    title: titulo || "Video de TikTok", author: { unique_id: autor }
  };
}

async function porRespaldo(enlace) {
  const j = await pedidoTercero(BASE_TERCERO + encodeURIComponent(enlace));
  const d = datosDeArbol(j);
  if (!d || !d.play || d.play.indexOf("http") !== 0) throw new Error("respaldo: no encontró el enlace del video");
  return d;
}

// ---------- diagnóstico (se ve con "debug" en el buscador) ----------

let trazaPortada = "";
let trazaBusqueda = "";
let trazaResolve = "";
let trazaVentana = "";
let trazaSeccion = "";
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

function borrarVerificacion() {
  try { kino.storage.remove("verificacion"); } catch (e) { }
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
  // Refuerzo de la galleta: si TikTok volvió a pedir la revisión a pesar
  // de tenerla, esa galleta ya no sirve — se borra para que la próxima
  // verificación se gane limpia (vale ~7 días o hasta el próximo challenge).
  if (galletaActual()) {
    borrarVerificacion();
    try { kino.log("Loop: verificación invalidada (" + clip(que, 40) + ")"); } catch (e) { }
  }
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
  // Tres destinos: el dominio principal, el espejo de tikwm y el cartero
  // (r.jina.ai), que recoge la respuesta desde afuera cuando los dos
  // primeros le dan la espalda a la IP del teléfono.
  const urls = [url];
  if (url.indexOf(BASE_PRINCIPAL) === 0) urls.push(BASE_ESPEJO + url.slice(BASE_PRINCIPAL.length));
  urls.push(CARTERO + url);
  for (let u = 0; u < urls.length; u++) {
    // El cartero va sin reintento: una carta lenta no se re-estampa.
    const tops = (u >= 2) ? 1 : 2;
    for (let intento = 0; intento < tops; intento++) {
      const cabeceras = { "Accept": "application/json", "User-Agent": UA };
      if (extra && extra["User-Agent"]) cabeceras["User-Agent"] = extra["User-Agent"];
      if (extra && extra["Cookie"]) cabeceras["Cookie"] = extra["Cookie"];
      // Tope duro PROPIO: si la petición queda colgada sin responder, se
      // abandona aquí y se sigue con el reintento o el espejo (una
      // promesa colgada se comía pantallas enteras: "esperaba a tikwm.com").
      const rr = await Promise.race([
        kino.fetch(urls[u], {
          method: "GET",
          headers: cabeceras,
          timeoutMs: timeoutMs || 15000
        }).then(function (v) { return { r: v }; }, function (e) { ultimoError = e; return { e: e }; }),
        espera((timeoutMs || 15000) + 500).then(function () {
          return { e: ultimoError || new Error("sin respuesta de " + (u === 0 ? "tikwm.com" : (u === 1 ? "el espejo tikwm.org" : "el cartero r.jina.ai"))) };
        })
      ]);
      const r = (rr && rr.r) ? rr.r : null;
      if (!r) {
        ultimoError = (rr && rr.e) ? rr.e : ultimoError;
        if (intento === 0) { await espera(900); continue; }
        break; // este destino se rinde: el espejo toma la mano
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
  // En apagón, solo los pedidos DIRECTOS de la persona (reproducir un
  // video) pasan: se les hace caso.
  if (apagado() && !/^resolve|^enlace|^búsqueda|^busqueda|^search/i.test(que)) {
    throw new Error("apagón: " + clip(que, 40) + " pospuesto");
  }
  try {
    const v = await hacer();
    anotarAcierto();
    return v;
  } catch (e) {
    anotarGolpe(String((e && e.apiMsg) || (e && e.message) || ""));
    const men = String((e && e.apiMsg) || (e && e.message) || "");
    if (/limit/i.test(men)) {
      await espera(1500);
      return await hacer();
    }
    throw e;
  }
}

// Desde la 0.5.2 la galleta viaja TAMBIÉN aquí (reproducir): si a tikwm le
// salió un portero (Cloudflare) para la IP del teléfono, la galleta y el
// disfraz del navegador son la llave — el portero no pregunta el destino,
// pregunta en TODAS las puertas.
async function tkPorEnlace(enlace) {
  return tkDatos(await pedirJson(BASE + "?url=" + encodeURIComponent(enlace),
    15000, cabecerasVerificadas()), "video por enlace");
}

// Tendencias de un país: antes el camino SIN verificación; desde la 0.5.2
// la galleta viaja también aquí (misma razón que en reproducir).
async function tkTendencias(region, cursor, cantidad, timeoutMs) {
  return tkDatos(
    await pedirJson(BASE + "feed/list?count=" + cantidad +
      "&region=" + encodeURIComponent(region) +
      "&cursor=" + encodeURIComponent(cursor || "0"),
      timeoutMs || 15000, cabecerasVerificadas()),
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

// La fila «Continuar viendo» SOLO cita videos que de verdad se
// reprodujeron (antes citaba los recién listados: por eso aparecían
// videos que nadie había puesto). Se guarda en el almacén (30 días).
var continuar = [];
var enPrecarga = false;
function recordarContinuar(id, titulo, cover, autor) {
  if (!id || enPrecarga) return;
  continuar = continuar.filter(function (c) { return c.id !== id; });
  continuar.unshift({ id: id, titulo: titulo || "Video de TikTok", cover: cover || "", autor: autor || "", t: Date.now() });
  if (continuar.length > 24) continuar = continuar.slice(0, 24);
  setJson("continuar", continuar, 30 * 24 * 60 * 60 * 1000);
}
try {
  const continuarGuardada = getJson("continuar", null);
  if (Array.isArray(continuarGuardada)) continuar = continuarGuardada;
} catch (e) { }

// Los @creadores favoritos: se guardan buscando «guardar @usuario» y se
// quitan con «quitar @usuario» (o revisándolos con «favoritos»). Salen
// como fila propia en el Inicio y como pestaña «Mis creadores».
var favoritos = [];
try {
  const favGuardados = getJson("favoritos", null);
  if (Array.isArray(favGuardados)) favoritos = favGuardados;
} catch (e) { }
function favoritosGuardar(uid) {
  uid = String(uid || "").trim();
  if (!uid) return;
  favoritos = favoritos.filter(function (f) { return f.uid !== uid; });
  favoritos.unshift({ uid: uid, t: Date.now() });
  if (favoritos.length > 24) favoritos = favoritos.slice(0, 24);
  setJson("favoritos", favoritos, 0);
}
function favoritosQuitar(uid) {
  uid = String(uid || "").trim();
  const antes = favoritos.length;
  favoritos = favoritos.filter(function (f) { return f.uid !== uid; });
  if (favoritos.length !== antes) setJson("favoritos", favoritos, 0);
  return favoritos.length !== antes;
}
function serieDeFavorito(uid) {
  return {
    id: "tk.u." + uid,
    ref: "u:" + uid,
    title: "@" + uid,
    kind: "series",
    overview: "Canal de este creador: sus últimos videos, uno tras otro."
  };
}
function favoritosCanales() {
  const canales = [];
  for (let i = 0; i < favoritos.length; i++) canales.push(serieDeFavorito(favoritos[i].uid));
  return canales;
}

// Lo que se sabe de cada video (quién lo subió, su título): al reproducir
// hay que armar el enlace canónico de TikTok, que lleva el @usuario.
var vistos = {};
function recordarVideo(id, autor, titulo, cover) {
  if (!id) return;
  vistos[id] = {
    autor: autor || "",
    titulo: titulo || "",
    cover: cover && String(cover).indexOf("http") === 0 ? String(cover) : "",
    t: Date.now()
  };
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

function itemDeVideo(v, ctx) {
  if (!v || typeof v !== "object") return null;
  const id = String(v.id || v.video_id || v.aweme_id || "");
  if (!/^\d{6,25}$/.test(id)) return null;
  const autor = v.author && (v.author.unique_id || v.author.uniqueId)
    ? String(v.author.unique_id || v.author.uniqueId)
    : "";
  const titulo = clip(String(v.title || "").replace(/\s+/g, " ").trim(), 120) || "Video de TikTok";
  const item = {
    id: "tk.v." + id,
    ref: "v:" + id,
    title: titulo,
    kind: "movie"
  };
  const cover = v.cover || v.origin_cover || "";
  if (String(cover).indexOf("http") === 0) item.poster = String(cover);
  // El arte de fondo de la ficha del video: su propia imagen grande.
  const fondo = v.origin_cover || v.cover || "";
  if (String(fondo).indexOf("http") === 0) item.backdrop = String(fondo);
  const nick = v.author && v.author.nickname ? String(v.author.nickname) : "";
  const firma = (autor ? "@" + autor : "") + (autor && nick ? " · " : "") + nick;
  if (firma) item.originalTitle = clip(firma, 120);
  // La "descripción" de un video de TikTok es su propio texto (caption):
  // la descripción entera va en el detalle, con las cifras detrás y la
  // fecha de subida.
  const descripcion = clip(String(v.title || "").replace(/\s+/g, " ").trim(), 220);
  const partes = [];
  if (v.play_count > 0) partes.push(miles(v.play_count) + " vistas");
  if (v.digg_count > 0) partes.push(miles(v.digg_count) + " me gusta");
  if (v.comment_count > 0) partes.push(miles(v.comment_count) + " comentarios");
  const detalle = [];
  if (descripcion && descripcion !== titulo) detalle.push(descripcion);
  if (partes.length > 0) detalle.push(partes.join(" · "));
  if (detalle.length > 0) item.overview = clip(detalle.join(" — "), 400);
  const seg = parseInt(v.duration, 10) || 0;
  if (seg > 0) item.runtimeMinutes = Math.max(1, Math.round(seg / 60));
  // La fecha de subida (en el detalle se ve cuántos días tiene el video).
  const crudo = parseInt(v.create_time, 10) || 0;
  if (crudo > 0) {
    try {
      const ms = crudo > 9999999999 ? crudo : crudo * 1000;
      item.releaseDate = new Date(ms).toISOString().slice(0, 10);
    } catch (e) { }
  }
  // Las insignias de la tarjeta (chips, máximo 3): «Nuevo» si se subió hace
  // menos de tres días, «Largo» si dura cinco minutos o más (las partes de
  // doramas se reconocen de un vistazo) y «Español» cuando sale de un tema
  // en español. El contexto lo pone quien llama (la fila o el canal).
  const insignias = [];
  if (crudo > 0) {
    const ms = crudo > 9999999999 ? crudo : crudo * 1000;
    if (Date.now() - ms < 259200000) insignias.push("Nuevo");
  }
  if (seg >= 300) insignias.push("Largo");
  if (ctx && ctx.espanol) insignias.push("Español");
  if (insignias.length > 0) item.badges = insignias.slice(0, 3);
  // Los géneros del video: los sabe el tema del que salió (Doramas, Anime,
  // K-pop…), y viajan a la ficha del título.
  if (ctx && Array.isArray(ctx.genero) && ctx.genero.length > 0) {
    item.genres = [];
    for (let gi = 0; gi < ctx.genero.length && item.genres.length < 5; gi++) {
      const g = clip(ctx.genero[gi], 30);
      if (g) item.genres.push(g);
    }
    if (item.genres.length === 0) delete item.genres;
  }
  if (ctx && ctx.espanol) item.lang = "es";
  recordarVideo(id, autor, titulo, cover);
  return item;
}

function itemsDeVideos(d, ctx) {
  const vids = videosDe(d);
  const items = [];
  const ya = {};
  for (let i = 0; i < vids.length; i++) {
    const item = itemDeVideo(vids[i], ctx || null);
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
// los videos del momento de ese tema, uno tras otro. Los géneros del tema
// viajan con la serie (la ficha del canal los muestra).
function serieDeTema(titulo, tag, genero) {
  const item = {
    id: "tk.h." + String(tag).replace(/[^a-z0-9]/gi, "").toLowerCase(),
    ref: "h:" + tag,
    title: clip(titulo, 90),
    kind: "series",
    overview: "Un canal que corre solo: los videos del momento de este tema, uno tras otro" + (temaLargo(tag) ? "; los más largos salen primero." : ".")
  };
  if (genero && genero.length > 0) {
    item.genres = [];
    for (let gi = 0; gi < genero.length && item.genres.length < 5; gi++) {
      const g = clip(genero[gi], 30);
      if (g) item.genres.push(g);
    }
    if (item.genres.length === 0) delete item.genres;
  }
  return item;
}

// ---------- portada ----------

const REGIONES_PORTADA = [
  { id: "co", titulo: "Tendencias en Colombia", region: "CO" },
  { id: "mx", titulo: "Tendencias en México", region: "MX" },
  { id: "us", titulo: "Tendencias en EE. UU.", region: "US" },
  { id: "es", titulo: "Tendencias en España", region: "ES" },
  { id: "ar", titulo: "Tendencias en Argentina", region: "AR" },
  { id: "br", titulo: "Tendencias en Brasil", region: "BR" }
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
// Desde la 0.2.0 es la PRIMERA fila de la portada.
const DORAMAS_FILA = { id: "doramas", titulo: "Doramas en español", tag: "doramas en español", respaldo: "#doramas", ref: "h:doramas en español" };

// Los canales por gusto: los de español primero (sus videos más largos
// salen primero). Sin galleta, tocarlos enseña el camino del botón de
// verificación. Cada tema sabe sus géneros (viajan a las fichas) y si es
// de español (insignia «Español» e idioma del video).
const TEMAS = [
  { titulo: "Doramas en español", tag: "doramas en español", genero: ["Doramas"], espanol: true },
  { titulo: "Doramas doblados", tag: "doramas doblados", genero: ["Doramas"], espanol: true },
  { titulo: "K-dramas", tag: "#kdrama", genero: ["Doramas"] },
  { titulo: "Anime en español", tag: "anime en español", genero: ["Anime"], espanol: true },
  { titulo: "Anime", tag: "#anime", genero: ["Anime"] },
  { titulo: "AMV", tag: "#amv", genero: ["Anime", "Música"] },
  { titulo: "K-pop", tag: "#kpop", genero: ["K-pop", "Música"] },
  { titulo: "Baile", tag: "#dance", genero: ["Baile"] },
  { titulo: "Música del momento", tag: "música", genero: ["Música"] },
  { titulo: "Memes", tag: "#memes", genero: ["Humor"] },
  { titulo: "Fútbol", tag: "#futbol", genero: ["Deportes", "Fútbol"] },
  { titulo: "Videojuegos", tag: "#gaming", genero: ["Videojuegos"] },
  { titulo: "Recetas", tag: "#recetas", genero: ["Cocina"] },
  { titulo: "Humor", tag: "#humor", genero: ["Humor"] },
  { titulo: "Comida", tag: "#comida", genero: ["Comida"] },
  { titulo: "Cocina", tag: "#cocina", genero: ["Cocina"] },
  { titulo: "Viajes", tag: "#viajes", genero: ["Viajes"] },
  { titulo: "Turismo", tag: "#turismo", genero: ["Viajes"] },
  { titulo: "Deportes", tag: "#deportes", genero: ["Deportes"] },
  { titulo: "Boxeo", tag: "#boxeo", genero: ["Deportes"] },
  { titulo: "Mascotas", tag: "#mascotas", genero: ["Mascotas"] }
];

// El contexto de un tema (sus géneros y si es de español) para los videos
// que salen de él — en «Ver más», en los canales y en la búsqueda dentro.
// El #doramas mundial (el respaldo de la fila de doramas) también sabe su
// género; un #hashtag que la persona escribió a mano no trae contexto y
// sus videos salen sin insignias ni géneros, como siempre.
function ctxDeTema(kw) {
  const k = String(kw || "").trim();
  for (let i = 0; i < TEMAS.length; i++) {
    if (TEMAS[i].tag === k) return { genero: TEMAS[i].genero, espanol: !!TEMAS[i].espanol };
  }
  if (k === "#doramas") return { genero: ["Doramas"] };
  return null;
}

const REGIONES_CATEGORIAS = REGIONES_PORTADA.concat([
  { id: "pe", titulo: "Tendencias en Perú", region: "PE" },
  { id: "cl", titulo: "Tendencias en Chile", region: "CL" }
]);

// Un renglón de la portada al almacén, compacto (8 videos con lo mínimo,
// kind incluido para que el canal siga funcionando): la próxima apertura
// arranca con lo ya traído aunque el reloj corra.
// Una fila guardada de antes, para la emergencia (tikwm sin responder).
function filaDeRespaldo(idFila, items) {
  let titulo = "Videos guardados";
  let ref = "";
  if (idFila === "doramas") { titulo = DORAMAS_FILA.titulo; ref = DORAMAS_FILA.ref; }
  for (let i = 0; i < REGIONES_PORTADA.length; i++) {
    if (REGIONES_PORTADA[i].id === idFila) { titulo = REGIONES_PORTADA[i].titulo; ref = "r:" + REGIONES_PORTADA[i].region; }
  }
  const fila = { id: "fila." + idFila, title: titulo, items: items, genre: idFila === "doramas" ? "series" : "entretenimiento" };
  if (ref) fila.ref = ref;
  return fila;
}

function guardarFilaEnCache(idFila, items) {
  try {
    const compacto = [];
    for (let i = 0; i < items.length && compacto.length < 8; i++) {
      const it = items[i];
      if (!it || !it.ref) continue;
      compacto.push({ id: it.id, ref: it.ref, title: it.title || "Video de TikTok", kind: "movie", poster: it.poster || "", runtimeMinutes: it.runtimeMinutes || 0 });
    }
    if (compacto.length === 0) return;
    const cf = getJson("portada_filas", {}) || {};
    cf[idFila] = { t: Date.now(), items: compacto };
    setJson("portada_filas", cf, 21600000);
  } catch (e) { }
}

// La semilla de fábrica: videos verdaderos de TikTok sembrados DENTRO del
// plugin (25 de noviembre de 2026) para que Loop JAMÁS quede en blanco,
// ni siquiera recién instalado con el servicio de malas. Se reproducen
// por el mismo camino de siempre; los pósters son una foto del día de la
// siembra (pueden envejecer, no pasa nada).
const SEMILLA_ITEMS = [{"id":"tk.v.7706622473042709791","ref":"v:7706622473042709791","title":"My idea of fun, hangin with my gf getting the yummiest hot coco from @Scoops on Main and a quesadilla from @Qu","kind":"movie","runtimeMinutes":1,"poster":"https://p19-common-sign.tiktokcdn-us.com/tos-useast8-p-0068-tx2/oM9FTEfEGA8GqzwVEQBvRqADW7QYFKEXDof2bz~tplv-tiktokx-shrink_ep:640:640:q78.jpeg?dr=8592&refresh_token=e6728d2a&x-expires=1795669200&x-signature=RqeeADj7K3pq4WnlfkQo0cGDSqY%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=useast5&biz_tag=tt_video&s=FEED&sc=cover","originalTitle":"@jennabooher"},{"id":"tk.v.7703231469858147614","ref":"v:7703231469858147614","title":"it’s officially christmas in houston!! 🎄✨ #christmas #houston #texas #holidays #christmaslights","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn-us.com/tos-useast8-p-0068-tx2/o0IAeiiKEsmPb0cME1IyAVqni1ICIkjPB6YViA~tplv-tiktokx-shrink_ep:640:640:q78.jpeg?dr=8592&refresh_token=54365d92&x-expires=1795669200&x-signature=%2Fukoq%2FQ1ufGAha6xqIH6dqm9zmQ%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=useast5&biz_tag=tt_video&s=FEED&sc=cover","originalTitle":"@rodeomillie"},{"id":"tk.v.7709338322656627988","ref":"v:7709338322656627988","title":"🌪️ The sands have arrived! The Doomsday: Last Survivors × Dune: Part Three collaboration officially begins to","kind":"movie","runtimeMinutes":1,"originalTitle":"@doomsdaylastsurvivor"},{"id":"tk.v.7705827486902258976","ref":"v:7705827486902258976","title":"still with you #seoulvlog #koreavlog #seoulvibe #stillwithyou #seoul","kind":"movie","runtimeMinutes":1,"poster":"https://p19-common-sign.tiktokcdn-us.com/tos-useast2a-p-0037-euttp/o4QRjmqAJCfHA0KhDDIun8FPG1GBkQf8EME4Fq~tplv-tiktokx-origin.image?dr=8593&refresh_token=daa689e0&x-expires=1795669200&x-signature=oEtrCKEevYH2QT4XFLz8IkyXCZI%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=useast5&biz_tag=tt_video&s=FEED&sc=cover&item=7705827486902258976","originalTitle":"@the.byzt"},{"id":"tk.v.7706651937634061598","ref":"v:7706651937634061598","title":"karina at Disney World today 💙 #karina #aespa #yujimin","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn-us.com/tos-useast8-p-0068-tx2/o0y4SD8ZIAVsI4AE6EhEULcAxEDRAAFeqzCbbf~tplv-tiktokx-shrink_ep:640:640:q78.jpeg?dr=8592&refresh_token=74fdf9d9&x-expires=1795669200&x-signature=k99alx667Ydgnij5IKL%2FNOrxKss%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=useast5&sc=cover&biz_tag=tt_video&s=FEED","originalTitle":"@ketaminjeong01"},{"id":"tk.v.7711637682782276887","ref":"v:7711637682782276887","title":"Meet Ibrahim, aged 12, from Hampshire; Lainey, aged 12, from the Scottish Highlands; Luna, aged eight, from Ke","kind":"movie","runtimeMinutes":1,"originalTitle":"@thebookerprizes"},{"id":"tk.v.7685500879855684877","ref":"v:7685500879855684877","title":"#outfitinspo #falloutfits #fallfashioninspo #fallseason #outfitideas","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn-us.com/tos-useast5-i-photomode-tx/1d2c6f2aeaae44d79ae53de7e357517e~tplv-photomode-image-cover:640:0:q70.webp?dr=12229&refresh_token=287a9b97&x-expires=1796878800&x-signature=aUYsfHn7P9aqMP7eC23LaZgViSw%3D&t=5897f7ec&ps=d5b8ac02&shp=d05b14bd&shcp=1a816805&idc=useast5&s=FEED&biz_tag=tt_photomode&sc=cover","originalTitle":"@a.vision.ary"},{"id":"tk.v.7692989748914294023","ref":"v:7692989748914294023","title":"\"what if i’m younger? i can take care of you better than anyone else\" #teeteepor #twnpich #porsuppakarn #duang","kind":"movie","runtimeMinutes":1,"poster":"https://p19-common-sign.tiktokcdn-us.com/tos-alisg-p-0037/o89rgDFrGA2ghcGwkIXueWTAL5fGCLNofwXeaR~tplv-tiktokx-shrink_ep:640:640:q78.jpeg?dr=8592&refresh_token=a0aaac8e&x-expires=1795669200&x-signature=psTAB8XrMxGBfCYbLMAMN7yCbtM%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=useast5&biz_tag=tt_video&s=FEED&sc=cover","originalTitle":"@pwettygzb"},{"id":"tk.v.7695265700255943937","ref":"v:7695265700255943937","title":"Bryan invita a Karla 😮 #bebes #memes","kind":"movie","runtimeMinutes":1,"poster":"https://p19-common-sign.tiktokcdn.com/tos-alisg-p-0037/o4dBsKqILnLDRBzEgmc3xfEkFEARzDythf82AI~tplv-tiktokx-shrink_ep:640:640:q78.webp?dr=1346&refresh_token=8a31bed4&x-expires=1795669200&x-signature=LW9Prj%2Fyzh6FQUrm%2B9qBb8ONydU%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=my3&s=FEED&sc=cover&bas=android_sc_bas_pb&biz_tag=tt_video","originalTitle":"@chalinoybryan"},{"id":"tk.v.7711180051663899905","ref":"v:7711180051663899905","title":"@𝑲𝒂𝒕𝒉𝒆 🐈‍⬛ 🙄","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn.com/tos-alisg-p-0037/ocW5QBqB1An2k7xii1BcUAIQCAoDfgcwBIIXor~tplv-tiktokx-shrink_ep:640:640:q78.webp?dr=1346&refresh_token=9cfd27f6&x-expires=1795669200&x-signature=9GHyB04QyZLG61obYcJf%2FmpLquQ%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=my3&biz_tag=tt_video&s=FEED&sc=cover&bas=android_sc_bas_pb","originalTitle":"@estebaanlopez"},{"id":"tk.v.7695240029358132511","ref":"v:7695240029358132511","title":"#BalliBotMagos #TredingReels #TredingReels #ForYouPage #FYP #FYP #ViralTikTok #MillionViews #TechMagic #SmartB","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn.com/tos-useast8-p-0068-tx2/osWIefuBIiURUFKFQVTGeQWGghALAtfAnU6rQy~tplv-tiktokx-shrink_ep:640:640:q78.webp?dr=1346&refresh_token=a4ed5f38&x-expires=1795669200&x-signature=S5xHzsr2Fj9KVdD8eFJvaNCl9Og%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=my3&biz_tag=tt_video&s=FEED&sc=cover","originalTitle":"@usafunny596"},{"id":"tk.v.7702808841376910614","ref":"v:7702808841376910614","title":"DI QUE SI 🎵 #marcaregistrada #grupofrontera #lyrics #fyp #dedicar #amor #diquesi","kind":"movie","runtimeMinutes":1,"poster":"https://p16-common-sign.tiktokcdn.com/tos-no1a-p-0037-no/ocf0ADzDdqewEgET3JHFnCNDCYAk5IVl83kAAF~tplv-tiktokx-shrink_ep:640:640:q78.webp?dr=1346&refresh_token=4306b0fc&x-expires=1795669200&x-signature=5Abh9%2F7SIQCYYXojjHkIdehA2S4%3D&t=bacd0480&ps=933b5bde&shp=d05b14bd&shcp=1a816805&idc=my3&biz_tag=tt_video&s=FEED&sc=cover","originalTitle":"@heyner_18v"}];

function filaSemilla(idFila) {
  return {
    id: "fila.semilla." + (idFila || "defecto"),
    title: "Tendencias de TikTok",
    items: SEMILLA_ITEMS,
    genre: "entretenimiento"
  };
}

// ---------- el apagón y la ración ----------

// Golpes seguidos = peticiones seguidas que no lograron nada: si se
// acumulan, el servicio está de malas y el plugin DEJA DE PEDIR por
// 5 minutos (sirve memoria de filas y la semilla), para no machacar un
// servidor tímido. Reproducir un video pide de todos modos: la persona
// mandó, se le hace caso.
var golpesSeguidos = 0;
var apagonHasta = 0;
var ultimoFalloRed = "";
var rotacionPortada = 0;
function apagado() { return Date.now() < apagonHasta; }
function anotarAcierto() {
  golpesSeguidos = 0;
  apagonHasta = 0;
}
function anotarGolpe(men) {
  if (/^apagón/.test(String(men || ""))) return; // el apagón no se extiende a sí mismo
  if (apagonHasta > Date.now()) return; // un apagón en curso no se alarga (los golpes que pasan DENTRO del apagón —cartero, respaldo— no lo estiran; en la 0.5.2 se estiraba solo: 29→32)
  golpesSeguidos = golpesSeguidos + 1;
  ultimoFalloRed = clip(String(men || ""), 90);
  if (golpesSeguidos >= 6) {
    apagonHasta = Date.now() + 300000;
    try { kino.log("Loop: apagón de 5 minutos (golpes: " + golpesSeguidos + ", último: " + clip(ultimoFalloRed, 60) + ")"); } catch (e) { }
  }
}

export async function home() {
  // La portada completa se recuerda 20 minutos: reabrir la app es
  // instantáneo y el plan gratuito de tikwm recibe menos peticiones.
  try {
    const enCache = getJson("portada_cache", null);
    if (enCache && enCache.rows && enCache.rows.length > 0 && enCache.t && (Date.now() - enCache.t) < PORTADA_CACHE_MS) {
      return enCache.rows;
    }
  } catch (e) { }
  // Memoria por fila (45 minutos fresca, 1 hora en el almacén): lo ya
  // traído sirve de una vez; si una apertura no alcanza, lo que faltó
  // llega en la siguiente. Así el Inicio NUNCA vuelve a pasarse de los
  // 20 segundos de Kino.
  const cacheFilas = {};
  try {
    const cf = getJson("portada_filas", null);
    if (cf && typeof cf === "object") for (const k in cf) cacheFilas[k] = cf[k];
  } catch (e) { }
  const posters = {};
  const progreso = { ok: 0, detalle: [] };
  // Ración: la fila de doramas SIEMPRE y hasta 4 regiones de red por
  // apertura (rotando el turno para que todas se refresquen); el resto
  // sale de la memoria de fila. Son ~5 peticiones por apertura: la
  // portada se ve LLENA otra vez sin volver a la tormenta de la 0.4.3
  // (que eran 28) ni al envenenamiento del plan gratuito.
  let cupos = 4;
  const pedirAhora = { doramas: true };
  for (let i = 0; i < REGIONES_PORTADA.length; i++) pedirAhora[REGIONES_PORTADA[i].id] = false;
  rotacionPortada = (rotacionPortada + 1) % REGIONES_PORTADA.length;
  for (let i = 0; i < REGIONES_PORTADA.length && cupos > 0; i++) {
    const fq = REGIONES_PORTADA[(rotacionPortada + i) % REGIONES_PORTADA.length];
    const enR = cacheFilas[fq.id];
    const fresco = enR && Array.isArray(enR.items) && enR.items.length > 0 && enR.t && (Date.now() - enR.t) < 2700000;
    if (!fresco) { pedirAhora[fq.id] = true; cupos--; }
  }
  // Las filas se piden A LA VEZ, con un escalonado de un segundo entre una
  // y otra (el plan gratuito de tikwm acepta más o menos una petición por
  // segundo: pedidas casi juntas las negaba TODAS con "Free Api Limit"):
  // pedidas en fila, los viajes de ida y vuelta se sumaban y la app corta
  // la portada a los 20 segundos. Así la portada tarda lo que tarda la
  // última fila, no la suma de las siete.
  const pedidas = [];
  // La fila de doramas en español ABRE la portada (petición del usuario):
  // primera en la pantalla y primera en el escalonado. Sin ella (falta la
  // verificación o la respuesta) las tendencias siguen su curso igual.
  pedidas.push((async function (f, retraso) {
    await espera(retraso);
    try {
      const enCache = cacheFilas[f.id];
      if (enCache && Array.isArray(enCache.items) && enCache.items.length > 0 && enCache.t && (Date.now() - enCache.t) < 2700000) return { f: f, items: enCache.items };
      if (!pedirAhora[f.id]) return { f: f, items: (enCache && Array.isArray(enCache.items)) ? enCache.items : [] };
    } catch (eC) { }
    try {
      let d = await tkLlamada("fila doramas", function () {
        return tkBuscar(f.tag, "0", 18, 6000);
      });
      let items = itemsDeVideos(d, { genero: ["Doramas"], espanol: true });
      if (items.length === 0 && f.respaldo) {
        // El buscador en español no trajo nada: el #doramas mundial.
        await espera(1100);
        try {
          d = await tkLlamada("fila doramas (respaldo)", function () {
            return tkBuscar(f.respaldo, "0", 18, 6000);
          });
          items = itemsDeVideos(d, { genero: ["Doramas"] });
        } catch (e2) {
          items = [];
        }
      }
      if (items.length > 0) {
        // Los doramas doblados se suben en partes largas: los largos primero.
        items = ordenarLargos(items);
        guardarFilaEnCache(f.id, items);
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
  })(DORAMAS_FILA, 0));
  for (let i = 0; i < REGIONES_PORTADA.length; i++) {
    pedidas.push((async function (f, retraso) {
      await espera(retraso);
      try {
        const enCache = cacheFilas[f.id];
        if (enCache && Array.isArray(enCache.items) && enCache.items.length > 0 && enCache.t && (Date.now() - enCache.t) < 2700000) return { f: f, items: enCache.items };
        if (!pedirAhora[f.id]) return { f: f, items: (enCache && Array.isArray(enCache.items)) ? enCache.items : [] };
      } catch (eC) { }
      try {
        const d = await tkLlamada("portada " + f.region, function () {
          return tkTendencias(f.region, "0", 18, 6000);
        });
        const items = itemsDeVideos(d);
        if (items.length > 0) {
          guardarFilaEnCache(f.id, items);
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
    })(REGIONES_PORTADA[i], (i + 1) * 1100));
  }
  // Límite interno de 16 segundos: la app corta el home a los 20. Con lo
  // que haya llegado se arma la portada (con la memoria por fila, lo que
  // faltó se completa en la siguiente apertura). Las filas que llegan
  // después igual quedan guardadas para la próxima.
  const resultados = [];
  for (let i = 0; i < pedidas.length; i++) {
    resultados.push(null);
    pedidas[i] = pedidas[i].then(function (r) { resultados[i] = r; return r; });
  }
  let filas = null;
  try {
    filas = await Promise.race([
      Promise.all(pedidas),
      espera(16000).then(function () { return null; })
    ]);
  } catch (eCorte) {
    filas = null;
  }
  if (filas === null) {
    filas = [];
    for (let i = 0; i < resultados.length; i++) if (resultados[i]) filas.push(resultados[i]);
  }
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
        genre: f.region ? "entretenimiento" : "series"
      });
    }
  }
  // Si la portada quedó coja (pocos videos por memoria fría o servidor
  // tímido), la fila sembrada aparece de todos modos: el Inicio SIEMPRE
  // se ve vivo, como en la sensation de la 0.4.3 pero sin su tormenta.
  const haySemilla = salida.some(function (f) { return String(f.id || "").indexOf(".semilla") >= 0; });
  if (salida.length < 5 && !haySemilla) {
    const semPortada = filaSemilla("portada");
    guardarLista("h:semilla", semPortada.items);
    salida.splice(1, 0, semPortada);
    trazaPortada = trazaPortada + "+SEMILLA";
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
      temas.push(serieDeTema(TEMAS[i].titulo, TEMAS[i].tag, TEMAS[i].genero));
    }
    salida.push({
      id: "fila.temas",
      title: "Canales por gusto",
      items: temas,
      genre: "otros"
    });
  }
  if (salida.length === 0) {
    // Memoria de emergencia: aunque las filas guardadas estén pasadas de
    // hora, algo guardado es mejor que el error vacío.
    const ordenRespaldo = ["doramas", "co", "mx", "us", "es", "ar", "br"];
    for (let i = 0; i < ordenRespaldo.length; i++) {
      const enCache = cacheFilas[ordenRespaldo[i]];
      if (enCache && Array.isArray(enCache.items) && enCache.items.length > 0) {
        salida.push(filaDeRespaldo(ordenRespaldo[i], enCache.items));
      }
    }
    if (salida.length > 0) {
      kino.log("Loop portada: memoria de emergencia (" + salida.length + " filas)");
      trazaPortada = "EMERGENCIA " + trazaPortada;
    }
  }
  if (salida.length === 0) {
    // Semilla de fábrica: el Inicio JAMÁS se queda en blanco, ni siquiera
    // recién instalado con el servicio de malas.
    const sem = filaSemilla("emergencia");
    guardarLista("h:semilla", sem.items);
    salida.push(sem);
    kino.log("Loop portada: SEMILLA de fábrica (" + sem.items.length + " videos)");
    trazaPortada = "SEMILLA";
  }
  const filaFavs = { id: "fila.favoritos", title: "Mis creadores", items: favoritosCanales(), genre: "otros" };
  if (filaFavs.items.length > 0) {
    if (salida.length > 1) salida.splice(1, 0, filaFavs);
    else salida.push(filaFavs);
  }
  try { setJson("portada_cache", { t: Date.now(), rows: salida }, PORTADA_CACHE_MS); } catch (e) { }
  return salida;
}

// ---------- sección propia (la entrada «Loop» de la app) ----------

// Las pestañas de la sección propia: los gustos de «Canales por gusto»
// agrupados para elegir de un vistazo. «Países» trae las tendencias por
// región (el camino SIN verificación); el resto, los temas (el camino de
// los #hashtags, que usa la verificación pasada en Ajustes). Las
// etiquetas son cortas a propósito: es lo que se lee en el chip.
const SECCION_TABS = [
  { id: "doramas", label: "Doramas", filas: [
    { tag: "doramas en español" },
    { tag: "doramas doblados" },
    { tag: "#kdrama" },
    { tag: "doramas en español", cursor: "18", titulo: "Más doramas en español" }
  ] },
  { id: "anime", label: "Anime", filas: [
    { tag: "anime en español" },
    { tag: "#anime" },
    { tag: "#amv" },
    { tag: "anime en español", cursor: "18", titulo: "Más anime en español" }
  ] },
  { id: "musica", label: "Música", filas: [
    { tag: "#kpop" },
    { tag: "#dance" },
    { tag: "música" },
    { tag: "#kpop", cursor: "18", titulo: "Más K-pop" }
  ] },
  { id: "varios", label: "Humor y más", filas: [
    { tag: "#memes" },
    { tag: "#humor" },
    { tag: "#futbol" },
    { tag: "#gaming" },
    { tag: "#recetas" },
    { tag: "#humor", cursor: "18", titulo: "Más humor" }
  ] },
  { id: "comida", label: "Comida", filas: [
    { tag: "#comida" },
    { tag: "#cocina" },
    { tag: "#comida", cursor: "18", titulo: "Más comida" }
  ] },
  { id: "viajes", label: "Viajes", filas: [
    { tag: "#viajes" },
    { tag: "#turismo" },
    { tag: "#viajes", cursor: "18", titulo: "Más viajes" }
  ] },
  { id: "deportes", label: "Deportes", filas: [
    { tag: "#deportes" },
    { tag: "#futbol" },
    { tag: "#boxeo" },
    { tag: "#deportes", cursor: "18", titulo: "Más deportes" }
  ] },
  { id: "favoritos", label: "Mis creadores", favoritos: true },
  { id: "paises", label: "Países", regiones: true }
];

function temaDeTag(tag) {
  const k = String(tag || "");
  for (let i = 0; i < TEMAS.length; i++) {
    if (TEMAS[i].tag === k) return TEMAS[i];
  }
  return null;
}

// El destacado de la sección: el primer video de la primera fila que
// llegó. Su imagen es el arte grande del propio video — la URL se acaba
// de pedir (las de TikTok expiran a las horas, pero Kino la carga en el
// momento); si no trae, el destacado sale solo con su texto.
function heroDe(item) {
  if (!item) return null;
  const hero = { title: clip(item.title || "Tendencia de TikTok", 90) };
  hero.text = clip(item.overview || item.originalTitle || "Un video del momento en TikTok.", 300);
  const img = (item.backdrop && String(item.backdrop).indexOf("http") === 0)
    ? item.backdrop
    : ((item.poster && String(item.poster).indexOf("http") === 0) ? item.poster : "");
  if (img) hero.image = String(img);
  return hero;
}

// Las filas de videos de una pestaña de temas: se piden a la vez con el
// mismo escalonado de la portada (el plan gratuito de tikwm acepta más o
// menos una petición por segundo). La que falla se omite y las demás
// siguen. Una fila puede pedir la SEGUNDA página de su tema (cursor 18):
// «Más doramas en español» y compañía.
async function filasDeSeccionTemas(tab, filas) {
  const pedidas = [];
  for (let i = 0; i < filas.length; i++) {
    pedidas.push((async function (fila, retraso) {
      await espera(retraso);
      const tema = temaDeTag(fila.tag);
      if (!tema) return { fila: fila, items: [] };
      try {
        const d = await tkLlamada("sección " + tema.tag, function () { return tkBuscar(tema.tag, fila.cursor || "0", 18, 6000); });
        let items = itemsDeVideos(d, { genero: tema.genero, espanol: !!tema.espanol });
        if (temaLargo(tema.tag)) items = ordenarLargos(items);
        return { fila: fila, items: items };
      } catch (e) {
        return { fila: fila, items: [] };
      }
    })(filas[i], i * 1100));
  }
  return await Promise.all(pedidas);
}

// «Continuar viendo»: lo último que se miró, lo más reciente primero —
// cada video recordado ya sabe su título y su portada (desde la 0.4.0 el
// registro las guarda). Tocar uno lo reproduce donde estaba. Solo sale la
// fila si hay al menos tres.
function filaContinuar() {
  const items = [];
  for (let i = 0; i < continuar.length && items.length < 12; i++) {
    const c = continuar[i];
    const it = { id: "tk.v." + c.id, ref: "v:" + c.id, title: clip(c.titulo || "Video de TikTok", 120), kind: "movie" };
    if (c.cover && String(c.cover).indexOf("http") === 0) it.poster = c.cover;
    if (c.autor) it.originalTitle = clip("@" + c.autor, 120);
    items.push(it);
  }
  return items;
}

// La sección propia: la entrada «Loop» de la app (chip arriba del Inicio
// en el teléfono, barra lateral en la TV) con un video destacado y sus
// pestañas por gusto. Sin verificación pasada llega a «Países» (las
// tendencias no necesitan galleta y la sección luce completa desde el
// primer toque); una pestaña de temas que no pudo traer videos muestra
// sus canales, como hace la portada.
export async function section(arg) {
  const pedida = arg && typeof arg.tab === "string" ? arg.tab : null;
  let tab = null;
  for (let i = 0; i < SECCION_TABS.length; i++) {
    if (SECCION_TABS[i].id === pedida) tab = SECCION_TABS[i];
  }
  if (!tab) tab = galletaActual() ? SECCION_TABS[0] : SECCION_TABS[SECCION_TABS.length - 1];
  const tabs = [];
  for (let i = 0; i < SECCION_TABS.length; i++) {
    tabs.push({ id: SECCION_TABS[i].id, label: SECCION_TABS[i].label });
  }
  const rows = [];
  let hero = null;
  // Memoria de la pestaña (1 hora): si hace poco se armó aquí, no se
  // pide otra vez (el plan gratuito de tikwm lo agradece).
  const claveSecCache = "sec_" + tab.id;
  const secCache = tab.favoritos ? null : getJson(claveSecCache, null);
  if (secCache && secCache.rows && secCache.rows.length > 1 && secCache.t && (Date.now() - secCache.t) < 3600000) {
    try { kino.log("Loop sección: memoria (" + tab.label + ")"); } catch (eC) { }
    const salMem = { tabs: tabs, tab: tab.id, rows: secCache.rows };
    if (secCache.hero) salMem.hero = secCache.hero;
    return salMem;
  }
  // «Continuar viendo»: lo último que se miró, en todas las pestañas.
  const cont = filaContinuar();
  if (cont.length >= 2) {
    rows.push({ id: "sec.continuar", title: "Continuar viendo", items: cont, genre: "otros" });
  }
  if (tab.favoritos) {
    // «Mis creadores»: los @usuarios guardados (sin peticiones a la red).
    const favs = favoritosCanales();
    if (favs.length > 0) {
      rows.push({ id: "sec.favoritos.canales", title: "Mis creadores", items: favs, genre: "otros" });
    } else {
      rows.push({
        id: "sec.favoritos.como",
        title: "Sin creadores guardados",
        items: [{ id: "tk.info.favoritos", ref: "v:debugfavoritos", title: "Para guardar uno: busca «guardar @usuario». Para quitarlo: «quitar @usuario».", kind: "movie" }],
        genre: "otros"
      });
    }
    trazaSeccion = "Mis creadores: " + favs.length + " canales";
  } else if (tab.regiones) {
    // «Países»: las tendencias de las OCHO regiones, el camino sin
    // verificación.
    const pedidas = [];
    for (let i = 0; i < REGIONES_CATEGORIAS.length; i++) {
      pedidas.push((async function (f, retraso) {
        await espera(retraso);
        try {
          const d = await tkLlamada("sección " + f.region, function () { return tkTendencias(f.region, "0", 18, 6000); });
          return { f: f, items: itemsDeVideos(d) };
        } catch (e) {
          return { f: f, items: [] };
        }
      })(REGIONES_CATEGORIAS[i], i * 1100));
    }
    // Tope de 16 s: con lo que llegó se arma la pestaña; lo que faltó
    // queda para la próxima apertura (la memoria por pestaña lo completa).
    const resultadosSec = [];
    for (let i = 0; i < pedidas.length; i++) {
      resultadosSec.push(null);
      pedidas[i] = pedidas[i].then(function (r) { resultadosSec[i] = r; return r; });
    }
    let filas = null;
    try {
      filas = await Promise.race([
        Promise.all(pedidas),
        espera(16000).then(function () { return null; })
      ]);
    } catch (eSecCorte) {
      filas = null;
    }
    if (filas === null) {
      filas = [];
      for (let i = 0; i < resultadosSec.length; i++) if (resultadosSec[i]) filas.push(resultadosSec[i]);
    }
    for (let i = 0; i < filas.length; i++) {
      const r = filas[i];
      if (r.items.length > 0) {
        guardarLista("r:" + r.f.region, r.items);
        rows.push({
          id: "sec.paises." + r.f.id,
          title: r.f.titulo,
          items: r.items,
          ref: "r:" + r.f.region,
          genre: "entretenimiento"
        });
        if (!hero) hero = heroDe(r.items[0]);
      }
    }
    if (rows.length === 1) {
      // Todo falló (¿límite del plan?): los canales de país, que no
      // necesitan red. («Continuar viendo» ya está arriba, si la había.)
      rows.push({
        id: "sec.paises.canales",
        title: "Canales que corren solos",
        items: [
          serieDeRegion("CO", "Canal Colombia", ""),
          serieDeRegion("US", "Canal EE. UU.", ""),
          serieDeRegion("MX", "Canal México", "")
        ],
        genre: "otros"
      });
    }
    trazaSeccion = tab.label + ": " + rows.length + " filas (tendencias)";
  } else {
    // Las filas del gusto, sin repetir videos entre ellas; las «Más X»
    // (segunda página del mismo tema) solo salen si traen al menos tres
    // videos NUEVOS — si tikwm no paginó, la fila se omite sin ruido.
    let filas = null;
    try {
      filas = await Promise.race([
        filasDeSeccionTemas(tab, tab.filas),
        espera(16000).then(function () { return null; })
      ]);
    } catch (eTemCorte) {
      filas = null;
    }
    if (filas === null) {
      filas = [];
      for (let i = 0; i < tab.filas.length; i++) filas.push({ fila: tab.filas[i], items: [] });
    }
    const ids = {};
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i].fila;
      const tema = temaDeTag(fila.tag);
      if (!tema) continue;
      const items = [];
      for (let j = 0; j < filas[i].items.length; j++) {
        const it = filas[i].items[j];
        if (!ids[it.id]) { ids[it.id] = 1; items.push(it); }
      }
      const esSegunda = fila.cursor && fila.cursor !== "0";
      if (items.length === 0 || (esSegunda && items.length < 3)) continue;
      guardarLista("h:" + tema.tag, items);
      rows.push({
        id: "sec." + tab.id + "." + String(tema.tag).replace(/[^a-z0-9]/gi, "").toLowerCase() + (esSegunda ? ".mas" : ""),
        title: fila.titulo || tema.titulo,
        items: items,
        ref: "h:" + tema.tag,
        genre: "otros"
      });
      if (!hero) hero = heroDe(items[0]);
    }
    // Los canales del gusto, SIEMPRE al final de la pestaña: otra manera
    // de entrar (el canal corre solo, episodio tras episodio) y el camino
    // del botón de verificación cuando faltó la galleta.
    const canales = [];
    const yaTag = {};
    for (let i = 0; i < tab.filas.length; i++) {
      const tema = temaDeTag(tab.filas[i].tag);
      if (!tema || yaTag[tema.tag]) continue;
      yaTag[tema.tag] = 1;
      canales.push(serieDeTema(tema.titulo, tema.tag, tema.genero));
    }
    if (canales.length > 0) {
      rows.push({ id: "sec." + tab.id + ".canales", title: "Canales de este gusto", items: canales, genre: "otros" });
    }
    trazaSeccion = tab.label + ": " + rows.length + " filas (temas y canales)";
  }
  if (!tab.favoritos) {
    const filasConVideos = rows.length - (cont.length >= 2 ? 1 : 0) - 1;
    if (filasConVideos >= 2) {
      setJson(claveSecCache, { t: Date.now(), rows: rows, hero: hero }, 3600000);
    } else if (filasConVideos === 0 && secCache && secCache.rows && secCache.rows.length > 1) {
      try { kino.log("Loop sección: memoria de emergencia (" + clip(tab.label, 30) + ")"); } catch (eEmer) { }
      const salEmer = { tabs: tabs, tab: tab.id, rows: secCache.rows };
      if (secCache.hero) salEmer.hero = secCache.hero;
      trazaSeccion = "EMERGENCIA " + trazaSeccion;
      kino.log("Loop sección: " + trazaSeccion);
      return salEmer;
    } else if (filasConVideos === 0) {
      // Sin videos y sin memoria: la semilla de fábrica da siempre algo
      // que ver (los canales del gusto cierran la pestaña).
      rows.push(filaSemilla(tab.id));
      trazaSeccion = "SEMILLA " + trazaSeccion;
    }
  }
  kino.log("Loop sección: " + trazaSeccion);
  const salida = { tabs: tabs, tab: tab.id, rows: rows };
  if (hero) salida.hero = hero;
  return salida;
}

// ---------- categorías ----------

export async function categories() {
  const fuera = [];
  for (let i = 0; i < REGIONES_CATEGORIAS.length; i++) {
    fuera.push({ id: "cat." + REGIONES_CATEGORIAS[i].id, title: REGIONES_CATEGORIAS[i].titulo, ref: "r:" + REGIONES_CATEGORIAS[i].region });
  }
  // Los temas también son categorías: el directorio de la pestaña
  // Categorías queda completo — países para las tendencias y un tema por
  // cada canal de «Canales por gusto».
  for (let i = 0; i < TEMAS.length; i++) {
    fuera.push({ id: "cat.tema." + String(TEMAS[i].tag).replace(/[^a-z0-9]/gi, "").toLowerCase(), title: TEMAS[i].titulo, ref: "h:" + TEMAS[i].tag });
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
  // Búsqueda nueva (sin cursor): aunque sea la misma palabra de hace un
  // momento, se empieza de cero. Solo las páginas siguientes de esa misma
  // búsqueda deduplican para no repetir videos.
  if (!cursor) vistosBusq = { q: q, ids: {} };
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
      return itemsDeVideos(d, ctxDeTema(tema));
    } catch (e) {
      return null;
    }
  }

  if (!q) return [];

  const qLower = q.toLowerCase();
  if (qLower === "debug" || qLower === "estado") return informeDebug();

  // Creadores favoritos: «guardar @usuario», «quitar @usuario» o «favoritos».
  const mGuardar = qLower.match(/^guardar\s+@?([a-z0-9._]{1,30})$/);
  if (mGuardar) {
    favoritosGuardar(mGuardar[1]);
    return avisoDebug(
      "✔ @" + mGuardar[1] + " guardado en Mis creadores. Saldrá como fila en el Inicio y en la pestaña «Mis creadores».",
      favoritos.length + " creador(es) en total. Para quitarlo: busca «quitar @" + mGuardar[1] + "»."
    );
  }
  const mQuitar = qLower.match(/^quitar\s+@?([a-z0-9._]{1,30})$/);
  if (mQuitar) {
    const salio = favoritosQuitar(mQuitar[1]);
    const lista = favoritos.length ? favoritos.map(function (f) { return "@" + f.uid; }).join(", ") : "(ninguno aún)";
    return avisoDebug(
      salio ? ("✔ @" + mQuitar[1] + " quitado de Mis creadores.") : ("@" + mQuitar[1] + " no estaba en Mis creadores."),
      "Tus creadores: " + lista
    );
  }
  if (qLower === "favoritos" || qLower === "mis creadores") {
    const canales = favoritosCanales();
    if (canales.length > 0) return canales;
    return avisoDebug(
      "Todavía no tienes creadores guardados.",
      "Entra al perfil (@usuario) para verlo bien, y luego busca «guardar @usuario» con el nombre del creador."
    );
  }

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
  // Abrir la misma lista otra vez (sin cursor): se empieza de cero. Solo
  // las páginas siguientes de esa misma tanda deduplican.
  if (typeof cursor !== "string" || !cursor) vistosBrowse = { ref: ref, ids: {} };

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
  // Sus videos salen con el contexto del tema (géneros e insignia de
  // español) para que las tarjetas y las fichas hablen.
  if (ref.indexOf("h:") === 0) {
    const kw = ref.slice(2);
    try {
      const d = await tkLlamada("ver más", function () { return tkBuscar(kw, c, 30); });
      const items = paginaBrowse(ref, itemsDeVideos(d, ctxDeTema(kw)));
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
      let items = itemsDeVideos(d, ctxDeTema(kw));
      const cur2 = cursorSiguiente(d, "0");
      if (items.length > 0 && cur2 !== null && items.length < 60) {
        await espera(1100);
        try {
          const d2 = await tkLlamada("canal " + kw + " (pág 2)", function () { return tkBuscar(kw, cur2, 30); });
          items = fusionarItems(items, itemsDeVideos(d2, ctxDeTema(kw)));
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
    const ep1 = { number: 1, ref: ref, title: clip(v && v.titulo ? v.titulo : "Video de TikTok", 120) };

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

export async function resolve(ref, opciones) {
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
  let viaRespaldo = false;
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
    // ÚLTIMA RED: el respaldo experimental (douyin.wtf, un servicio
    // distinto). Solo se armó para reproducción: si tikwm y su espejo
    // rinden, aquí está la última mano antes de rendirse con el video.
    try {
      if (!RESPALDO_ACTIVO) throw new Error("respaldo pausado (experimento dormido)");
      const t = await tkLlamada("resolve respaldo", function () { return porRespaldo(candidatos[0]); });
      if (t && (t.play || t.wmplay)) { d = t; viaRespaldo = true; trazaRespaldo = "FUNCIONÓ (video " + clip(s, 12) + ")"; }
    } catch (eT) {
      trazaRespaldo = clip(String((eT && eT.message) || "fallo"), 90);
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
  recordarVideo(s, autorNuevo || autor, clip(String(d.title || (v ? v.titulo : "")), 120), String(d.cover || ""));
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
  // Este video sí se está reproduciendo de verdad: entra a «Continuar
  // viendo». La precarga (prepare) pasa con noRecordar y no cuenta.
  if (!(opciones && opciones.noRecordar)) {
    recordarContinuar(s, clip(String(d.title || (v ? v.titulo : "")), 120), String(d.cover || ""), autorNuevo || autor);
  }
  const stream = { url: url, mime: "video/mp4" };
  stream.label = (url === sinMarca && sinMarca && !conMarca) ? "TikTok sin marca de agua" : "TikTok";
  trazaResolve = (viaRespaldo ? "respaldo: " : "tikwm: ") + stream.label + " (" + clip(String(d.title || ""), 40) + ")";
  ultimoResolve = { label: stream.label, titulo: clip(String(d.title || ""), 60) };
  return stream;
}

// Preparación anticipada (resolveAhead): con la referencia en la mano, el
// enlace absoluto se consigue YA, para que al tocar el video empiece casi
// al instante. Como los enlaces de TikTok expiran en horas, esto se hace
// al momento de listar, nunca mucho tiempo antes.
export async function prepare(ref) {
  try { return await resolve(ref, { noRecordar: true }); } catch (e) { return null; }
}

// ---------- estado en Ajustes ----------

export async function settingsStatus() {
  const conMarca = String(kino.config.get("marca") || "no").trim() === "si";
  let texto = "Loop " + VERSION + ". Videos " + (conMarca ? "con marca de agua." : "sin marca de agua.") + ".";
  const g = galletaActual();
  if (g) {
    const hace = g.t ? Math.max(0, Math.round((Date.now() - g.t) / 60000)) : 0;
    const haceTxt = hace >= 1440 ? Math.round(hace / 1440) + " d" : (hace >= 90 ? Math.round(hace / 60) + " h" : hace + " min");
    texto = texto + " Verificación: pasada hace " + haceTxt + " (vale ~7 días).";
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
  const guardado = setJson("verificacion", { cookies: g, ua: String(r.userAgent || ""), t: Date.now() }, VERIF_TTL_MS);
  if (!guardado) {
    throw kino.error("unavailable", "no se pudo guardar la verificación", {
      userMessage: "La verificación pasó pero no se pudo guardar. Vuelve a tocar el botón."
    });
  }
  return null;
}

// Mensajes informativos como resultados de búsqueda (no se reproducen):
// el mismo truco del informe técnico, para respuestas cortas.
function avisoDebug(linea1, linea2) {
  const lineas = [String(linea1 || "")];
  if (linea2) lineas.push(String(linea2));
  const items = [];
  for (let i = 0; i < lineas.length; i++) {
    items.push({ id: "tk.info." + Date.now() + "." + i, ref: "v:debuginfo." + i, title: clip(lineas[i], 110), kind: "movie" });
  }
  return items;
}

// El informe técnico como resultados de búsqueda: cada línea es un
// resultado, así nada se corta (el Estado de Ajustes se corta en 200).
function informeDebug() {
  const lineas = [];
  const g = galletaActual();
  lineas.push("Loop " + VERSION + " — informe técnico. (Estas líneas no se pueden reproducir.)");
  lineas.push("Marca de agua: " + String(kino.config.get("marca") || "no"));
  lineas.push("Portada: " + (trazaPortada || "(la portada aún no se ha abierto)"));
  lineas.push("Sección: " + (trazaSeccion || "(la sección propia aún no se ha abierto)"));
  lineas.push("Galleta: " + (g
    ? "presente (gana el camino de #hashtags y @perfiles)"
    : "ninguna (los #hashtags y los @perfiles pueden pedir verificación)"));
  lineas.push("Ventana: " + (trazaVentana || "(la ventanita no se ha abierto)"));
  lineas.push("Búsqueda: " + (trazaBusqueda || "(aún no se ha buscado)"));
  lineas.push("Reproducción: " + (trazaResolve || "(nada reproducido desde la actualización)"));
  lineas.push("Videos recordados: " + Object.keys(vistos).length + " (para enlaces y canales)");
  lineas.push("Continuar viendo (videos reproducidos): " + continuar.length);
  lineas.push("Listas en memoria: " + Object.keys(cacheListas).length + " (filas, búsquedas, perfiles)");
  lineas.push("Red: " + (apagado() ? "EN APAGÓN hasta " + new Date(apagonHasta).toISOString().slice(11, 19) : "normal") + ", golpes seguidos: " + golpesSeguidos + ", último fallo: " + (ultimoFalloRed || "ninguno"));
  lineas.push("Respaldo experimental (douyin.wtf): " + trazaRespaldo);
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

