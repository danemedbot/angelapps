"use client";

import { useMemo, useState } from "react";

type Contact = { nombre: string; cedula: string; whatsapp: string; ciudad: string; correo: string };
type CrmInfo = { cliente: "viejo" | "nuevo" | "desconocido"; valor?: number; raw?: Record<string, unknown> };
type CedulaInfo = { result: null | { cedula?: string; nombre?: string; carrera?: string; universidad?: string; estado?: string; anio?: string }; source?: string; count?: number };
type ReviewField = "nombre" | "profesion";
type ResultRow = { mes: string; fecha: string; hora: string; fuente: string; nombre: string; whatsapp: string; ciudad: string; cedula: string; profesion: string; agente: string; quienAsigna: string; crmAnterior: string; colorCrm: string; contactoAsesor: string; interes: string };

const emptyContact: Contact = { nombre: "", cedula: "", whatsapp: "", ciudad: "", correo: "" };

const asignadores = ["Angel", "Antonio", "Kiara"];
const fuentes = ["Instagram Danemed", "Facebook Danemed", "Rejeunesse - Formulario Med-Dent 2026-copy", "Instagram Pink Intimate", "Facebook Pink Intimate", "Web Pink Intimate", "Instagram Rejeunesse", "Facebook Rejeunesse", "Web Rejeunesse", "Instagram LusciousLips", "Facebook LusciousLips", "Formulario lUCIOS LIPS", "Web LusciousLips", "Instagram CursosMedEstetica", "Facebook CursosMedEstetica", "Whatsapp Danemed", "Emagister", "Formulario LAPUROON Aurora"];
const productos = ["Rejeunesse", "Pink Intimate System", "LusciousLips", "V-Tech System", "ExoTech Gel", "SkinFill BACIO", "Cursos", "Catálogo de Productos", "Kenacort / Triamcinolona", "Renovah", "Toxina Botulínica", "Productos BCN", "Libros", "Hilos PDO", "AGF", "Lapuroon"];
const agentes = ["amairani", "amejia", "btostado", "zulay", "bperez2", "selene2", "DISTRITATI", "cristina", "diana", "marisa2", "micaela", "stefany", "moncho", "josecarlos", "katerin", "mariel", "daisy", "lupita", "juan", "pefa", "reison", "distribuidores"];

function digits(value: string) { return value.replace(/\D/g, ""); }
function titleCase(value: string) { return value.toLowerCase().split(/\s+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function nowParts() {
  const d = new Date();
  return {
    mes: new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "America/Mexico_City" }).format(d).toUpperCase(),
    fecha: new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeZone: "America/Mexico_City" }).format(d),
    hora: new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/Mexico_City" }).format(d).toLowerCase(),
  };
}

function parseContact(text: string): Contact {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const contact: Contact = { ...emptyContact, nombre: lines[0] || "" };
  const rest = lines.slice(1);
  for (const line of rest) {
    const clean = line.trim();
    const ds = digits(clean);
    if (!contact.correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) contact.correo = clean.toLowerCase();
    else if (!contact.whatsapp && ds.length >= 10 && ds.length <= 13) contact.whatsapp = ds.slice(-10);
    else if (!contact.cedula && /^\d{4,10}$/.test(ds)) contact.cedula = ds;
    else if (!contact.ciudad) contact.ciudad = clean;
  }
  if (!contact.ciudad) {
    const city = rest.find((line) => !line.includes("@") && !/^\+?[\d\s()\-.]{4,}$/.test(line));
    if (city) contact.ciudad = city;
  }
  return contact;
}

function rawString(raw: Record<string, unknown> | undefined, keys: string[]) {
  if (!raw) return "";
  for (const key of keys) {
    const found = Object.entries(raw).find(([k]) => normalize(k) === normalize(key));
    if (found && found[1] != null && String(found[1]).trim()) return String(found[1]).trim();
  }
  return "";
}

export default function Home() {
  const [quienAsigna, setQuienAsigna] = useState("");
  const [datos, setDatos] = useState("");
  const [fuente, setFuente] = useState("");
  const [producto, setProducto] = useState("");
  const [agente, setAgente] = useState("");
  const [crmAnterior, setCrmAnterior] = useState("");
  const [colorCrm, setColorCrm] = useState("");
  const [contactoAsesor, setContactoAsesor] = useState("");
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [profesion, setProfesion] = useState("");
  const [crm, setCrm] = useState<CrmInfo | null>(null);
  const [cedula, setCedula] = useState<CedulaInfo | null>(null);
  const [review, setReview] = useState<Record<ReviewField, boolean>>({ nombre: false, profesion: false });
  const [showProfessionModal, setShowProfessionModal] = useState(false);
  const [showCrmModal, setShowCrmModal] = useState(false);
  const [resultado, setResultado] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const parsed = useMemo(() => parseContact(datos), [datos]);
  const activeContact = { ...parsed, ...Object.fromEntries(Object.entries(contact).filter(([, v]) => v)) } as Contact;
  const crmAgent = rawString(crm?.raw, ["agente", "asesor", "agent", "assigned_agent", "usuario", "nombre_agente"]);
  const crmColor = rawString(crm?.raw, ["color", "colorCrm", "color_crm", "color en crm", "status_color"]) || (crm?.cliente === "viejo" ? colorCrm : "");

  function syncParsed() {
    const next = parseContact(datos);
    setContact(next);
    return next;
  }

  async function buscarProfesion() {
    setError("");
    const found = activeContact;
    if (!found.cedula) { setError("No detecté una cédula profesional en Datos del contacto."); return; }
    setBusy("profesion");
    try {
      const response = await fetch("/api/lead/profession", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: found.cedula }) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo consultar la profesión.");
      setCedula(data.cedula);
      setReview({ nombre: false, profesion: false });
      setShowProfessionModal(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar la profesión."); }
    finally { setBusy(""); }
  }

  async function buscarCrm() {
    setError("");
    const found = activeContact;
    if (found.whatsapp.length !== 10) { setError("El WhatsApp debe tener exactamente 10 dígitos."); return; }
    if (!found.cedula) { setError("No detecté una cédula para consultar CRM."); return; }
    setBusy("crm");
    try {
      const response = await fetch("/api/lead/crm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ whatsapp: found.whatsapp, cedula: found.cedula }) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo consultar CRM.");
      setCrm(data.crm);
      if (data.crm.cliente === "viejo") {
        setCrmAnterior("SI");
        setColorCrm(rawString(data.crm.raw, ["color", "colorCrm", "color_crm", "color en crm", "status_color"]));
        setShowCrmModal(true);
      } else {
        setCrmAnterior("NO");
        setColorCrm("");
        setContactoAsesor("");
        setShowCrmModal(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar CRM."); }
    finally { setBusy(""); }
  }

  function acceptOfficial(field: ReviewField) {
    const result = cedula?.result;
    if (!result) return;
    if (field === "nombre" && result.nombre) setContact((c) => ({ ...c, nombre: result.nombre || c.nombre }));
    if (field === "profesion" && result.carrera) setProfesion(result.carrera);
    setReview((r) => ({ ...r, [field]: true }));
  }
  function keepOriginal(field: ReviewField) { setReview((r) => ({ ...r, [field]: true })); }

  function mantenerAsignacion() {
    if (crmAgent) setAgente(crmAgent);
    if (crmColor) setColorCrm(crmColor);
    setContactoAsesor("SI");
    setCrmAnterior("SI");
    setShowCrmModal(false);
  }
  function reasignar() {
    setAgente("");
    if (crmColor) setColorCrm(crmColor);
    setContactoAsesor("NO");
    setCrmAnterior("SI");
    setShowCrmModal(false);
  }

  function buildOrganizedData() {
    const found = syncParsed();
    const finalContact = { ...found, ...Object.fromEntries(Object.entries(contact).filter(([, v]) => v)) } as Contact;
    if (!quienAsigna || !fuente || !producto || !agente || !crmAnterior) throw new Error("Faltan campos obligatorios de asignación/origen.");
    if (!finalContact.nombre || finalContact.whatsapp.length !== 10 || !finalContact.cedula || !finalContact.ciudad) throw new Error("Revisa Datos del contacto: nombre, WhatsApp de 10 dígitos, cédula y ciudad son obligatorios.");
    if (crmAnterior === "SI" && (!colorCrm || !contactoAsesor)) throw new Error("Si existe en CRM, falta color CRM o confirmar si el contacto es de ese asesor.");
    const productosEspeciales = ["Rejeunesse", "Pink Intimate System", "LusciousLips", "Hilos PDO", "Lapuroon"];
    const tieneFormulario = fuente.includes("Formulario");
    const finalProfesion = titleCase(profesion || cedula?.result?.carrera || "Por Definir");
    const encabezado = tieneFormulario
      ? `*Contacto Campaña ${titleCase(producto)}*\n${fuente}`
      : productosEspeciales.includes(producto)
        ? `*Contacto Campaña ${titleCase(producto)}:*`
        : `*Contacto ${fuente}:*`;
    const crmPrefix = crmAnterior === "SI"
      ? contactoAsesor === "SI" ? `Existe en CRM y *es tuyo*, ${colorCrm}\n\n` : `Existe en CRM, se te *REASIGNÓ*, ${colorCrm}\n\n`
      : "Contacto *NUEVO* *️⃣\n\n";
    const text = `${crmPrefix}${encabezado}\n\n${titleCase(finalContact.nombre)}\nCiudad: ${titleCase(finalContact.ciudad)}\n${finalContact.correo ? `Correo: ${finalContact.correo}\n` : ""}Cédula Prof: ${finalContact.cedula}\nProfesión: ${finalProfesion}\nWhatsapp: ${finalContact.whatsapp}\n\nInterés en *${titleCase(producto)}*`;
    const fh = nowParts();
    const row: ResultRow = { mes: fh.mes, fecha: fh.fecha, hora: fh.hora, fuente, nombre: titleCase(finalContact.nombre), whatsapp: finalContact.whatsapp, ciudad: titleCase(finalContact.ciudad), cedula: finalContact.cedula, profesion: finalProfesion, agente, quienAsigna, crmAnterior, colorCrm: crmAnterior === "SI" ? colorCrm : "N/A", contactoAsesor: crmAnterior === "SI" ? contactoAsesor : "N/A", interes: titleCase(producto) };
    return { text, row, finalContact };
  }

  function generarResultado() {
    setError("");
    try {
      const { text } = buildOrganizedData();
      setResultado(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo organizar la información.");
    }
  }

  async function enviarTablaYCopiar() {
    setError("");
    setBusy("save");
    try {
      const { text, row, finalContact } = buildOrganizedData();
      setResultado(text);
      const body = { quienAsigna, fuente, producto, agente, nombre: finalContact.nombre, whatsapp: finalContact.whatsapp, ciudad: finalContact.ciudad, cedula: finalContact.cedula, interes: producto, eraDeEseAsesor: contactoAsesor || "N/A" };
      const response = await fetch("/api/lead/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.errors?.join(" ") || "No se pudo guardar.");
      setRows((current) => [row, ...current]);
      await navigator.clipboard.writeText(text);
      setError(`Enviado a tabla y copiado. Guardado en ${data.sheet?.updatedRange || "Google Sheets"}`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar a tabla y copiar."); }
    finally { setBusy(""); }
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  return <main className="page-shell compact">
    <section className="lead-card">
      <div className="section-title"><span>01</span><div><h2>Entrada de datos</h2><p>Pega los datos en cualquier orden. La primera línea siempre es el nombre.</p></div></div>
      <div className="grid three">
        <Field label="Quién asignará" required><select value={quienAsigna} onChange={(e) => setQuienAsigna(e.target.value)}><option value="">-</option>{asignadores.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Fuente" required><select value={fuente} onChange={(e) => setFuente(e.target.value)}><option value="">-</option>{fuentes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Producto / Interés" required><select value={producto} onChange={(e) => setProducto(e.target.value)}><option value="">-</option>{productos.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Datos del contacto" required><textarea value={datos} onChange={(e) => { setDatos(e.target.value); setContact(emptyContact); }} rows={7} placeholder={"Juan Pérez López\n12345678\n5512345678\nMonterrey, Nuevo León\ncorreo@ejemplo.com"} /></Field>
        <div className="detected featured readonly"><h3>Detectado</h3>{activeContact.nombre && <DetectedValue label="Nombre" value={activeContact.nombre} />}{activeContact.cedula && <DetectedValue label="Cédula" value={activeContact.cedula} />}{activeContact.whatsapp && <DetectedValue label="WhatsApp" value={activeContact.whatsapp} />}{activeContact.ciudad && <DetectedValue label="Ciudad" value={activeContact.ciudad} />}{activeContact.correo && <DetectedValue label="Correo" value={activeContact.correo} />}{(profesion || cedula?.result?.carrera) && <DetectedValue label="Profesión" value={profesion || cedula?.result?.carrera || ""} highlighted />}{!activeContact.nombre && !activeContact.cedula && !activeContact.whatsapp && !activeContact.ciudad && !activeContact.correo && !(profesion || cedula?.result?.carrera) && <p className="detected-empty">Pega datos del contacto para detectar información.</p>}</div>
        <div className="stacked-actions"><button className="primary" type="button" disabled={!!busy} onClick={buscarProfesion}>{busy === "profesion" ? "Buscando..." : "Buscar Profesión"}</button><button className="primary" type="button" disabled={!!busy} onClick={buscarCrm}>{busy === "crm" ? "Buscando..." : "Buscar CRM"}</button></div>
      </div>
      <div className="section-title second"><span>02</span><div><h2>Asignación CRM</h2><p>Campos derivados de la consulta CRM, respetando la operación actual.</p></div></div>
      <div className="grid three small-gap">
        <Field label="Agente" required><select value={agente} onChange={(e) => setAgente(e.target.value)}><option value="">-</option>{agentes.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="CRM Anterior" required><select value={crmAnterior} onChange={(e) => setCrmAnterior(e.target.value)}><option value="">-</option><option>SI</option><option>NO</option></select></Field>
        {crmAnterior === "SI" && <><Field label="Color CRM" required><input value={colorCrm} onChange={(e) => setColorCrm(e.target.value)} placeholder="Color obtenido del CRM" /></Field><Field label="El contacto es de ese asesor" required><select value={contactoAsesor} onChange={(e) => setContactoAsesor(e.target.value)}><option value="">-</option><option>SI</option><option>NO</option></select></Field></>}
      </div>
      {error && <div className={error.startsWith("Guardado") ? "alert success" : "alert error"}>{error}</div>}
      <div className="actions"><button className="secondary" type="button" onClick={generarResultado}>Organizar Datos</button><button className="primary" type="button" disabled={!!busy} onClick={enviarTablaYCopiar}>{busy === "save" ? "Enviando..." : "Enviar a Tabla y Copiar"}</button></div>
    </section>
    {resultado && <section className="lead-card result-output"><div className="section-title"><span>03</span><div><h2>Resultado</h2><p>Formato compatible con datos.danemed.com</p></div></div><pre>{resultado}</pre><button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(resultado)}>Copiar resultado</button></section>}

    <section className="lead-card table-card">
      <div className="section-title"><span>04</span><div><h2>Tabla</h2><p>Misma estructura visual y operativa de datos.danemed.com</p></div></div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Mes</th><th>Fecha</th><th>Hora</th><th>Fuente</th><th>Nombre</th><th>Whatsapp</th><th>Ciudad</th><th>Cédula</th><th>Profesión</th><th>Agente</th><th>Quién asigna</th><th>CRM Anterior</th><th>Color CRM</th><th>Era de ese Asesor?</th><th>Interés</th><th>Acciones</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={16} className="empty-cell">Aún no hay filas enviadas desde esta sesión.</td></tr> : rows.map((row, index) => <tr key={`${row.whatsapp}-${index}`} className={index === 0 ? "ultima-fila" : ""}><td>{row.mes}</td><td>{row.fecha}</td><td>{row.hora}</td><td>{row.fuente}</td><td>{row.nombre}</td><td>{row.whatsapp}</td><td>{row.ciudad}</td><td>{row.cedula}</td><td>{row.profesion}</td><td>{row.agente}</td><td>{row.quienAsigna}</td><td>{row.crmAnterior}</td><td>{row.colorCrm}</td><td>{row.contactoAsesor}</td><td>{row.interes}</td><td><button className="boton-eliminar" type="button" onClick={() => removeRow(index)}>Eliminar</button></td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="actions"><button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(rows.map((r) => [r.mes, r.fecha, r.hora, r.fuente, r.nombre, r.whatsapp, r.ciudad, r.cedula, r.profesion, r.agente, r.quienAsigna, r.crmAnterior, r.colorCrm, r.contactoAsesor, r.interes].join("\t")).join("\n"))}>Copiar Tabla</button></div>
    </section>

    {showProfessionModal && <div className="modal-backdrop"><section className={cedula?.result ? "modal wide" : "modal simple-modal"}>{!cedula?.result ? <><button className="close" type="button" onClick={() => setShowProfessionModal(false)} aria-label="Cerrar">×</button><p className="eyebrow">Consulta de profesión</p><div className="empty-state"><span className="empty-icon">×</span><h2>No se encontró información con esa cédula.</h2><p>Revisa el número capturado e intenta nuevamente.</p></div></> : <><p className="eyebrow">Comparativo de profesión</p><h2>Revisa cada dato antes de continuar</h2><div className="compare inline-decisions"><div><h3>Capturado</h3><ReviewChoice label="Nombre" value={activeContact.nombre} decided={review.nombre} onKeep={() => keepOriginal("nombre")} keepTitle="Conservar nombre capturado" /><ReviewChoice label="Profesión" value={profesion || "Sin profesión capturada"} decided={review.profesion} onKeep={() => keepOriginal("profesion")} keepTitle="Conservar profesión capturada" /></div><div><h3>Consulta oficial</h3><ReviewChoice label="Nombre" value={cedula.result.nombre || "Sin resultado"} decided={review.nombre} onAccept={() => acceptOfficial("nombre")} acceptTitle="Aceptar nombre oficial" /><ReviewChoice label="Profesión" value={cedula.result.carrera || "Sin resultado"} decided={review.profesion} onAccept={() => acceptOfficial("profesion")} acceptTitle="Aceptar profesión oficial" /></div></div><p className="modal-hint">Usa ✓ para aceptar el dato oficial o ↺ para conservar el capturado. Debes revisar ambos campos.</p><div className="modal-actions"><button className="primary" disabled={!review.nombre || !review.profesion} onClick={() => setShowProfessionModal(false)}>Continuar</button></div></>}</section></div>}

    {showCrmModal && <div className="modal-backdrop"><section className={crm?.cliente === "viejo" ? "modal" : "modal simple-modal"}>{crm?.cliente === "viejo" ? <><p className="eyebrow">Resultado CRM</p><h2>Contacto existente</h2><ReviewLine label="Agente asignado" value={crmAgent || "El CRM no devolvió agente"} /><ReviewLine label="Color CRM" value={crmColor || "El CRM no devolvió color"} /><p className="subtitle small">¿Desea mantener la asignación actual o reasignar este contacto?</p><div className="modal-actions"><button className="secondary" onClick={reasignar}>Reasignar</button><button className="primary" onClick={mantenerAsignacion}>Mantener asignación</button></div></> : <><button className="close" type="button" onClick={() => setShowCrmModal(false)} aria-label="Cerrar">×</button><p className="eyebrow">Resultado CRM</p><div className="empty-state"><span className="empty-icon">×</span><h2>El contacto no existe en CRM.</h2><p>Se marcó automáticamente CRM Anterior como NO.</p></div></>}</section></div>}
  </main>;
}

function DetectedValue({ label, value, highlighted }: { label: string; value: string; highlighted?: boolean }) { return <div className={`detected-row ${highlighted ? "changed" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) { return <label className="field"><span>{label} {required && <b>*</b>}</span>{children}{error && <small className="field-error">{error}</small>}</label>; }
function ReviewLine({ label, value }: { label: string; value: string }) { return <div className="review"><span>{label}</span><strong>{value || "-"}</strong></div>; }
function ReviewChoice({ label, value, decided, onAccept, onKeep, acceptTitle, keepTitle }: { label: string; value: string; decided: boolean; onAccept?: () => void; onKeep?: () => void; acceptTitle?: string; keepTitle?: string }) {
  return <div className={`review review-choice ${decided ? "decided" : ""}`}><div><span>{label}</span><strong>{value || "-"}</strong></div><div className="choice-icons">{onAccept && <button type="button" aria-label={acceptTitle || "Aceptar"} title={acceptTitle || "Aceptar"} onClick={onAccept}>✓</button>}{onKeep && <button type="button" aria-label={keepTitle || "Conservar"} title={keepTitle || "Conservar"} onClick={onKeep}>↺</button>}</div></div>;
}
