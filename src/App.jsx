import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════
   TEMA Y CONSTANTES
═══════════════════════════════════════ */
const C = {
  bg: "#0D1B2A", surf: "#1E3048", surf2: "#243757",
  border: "rgba(255,255,255,.08)", green: "#00C896", red: "#FF6B6B",
  amber: "#FFB432", blue: "#4A9FFF", purple: "#A78BFA",
  text: "#fff", sec: "rgba(255,255,255,.55)", ter: "rgba(255,255,255,.28)",
};
const SORA = { fontFamily: "'Sora',sans-serif" };
const DM = { fontFamily: "'DM Sans',sans-serif" };

const fmt = (n) => `$${Math.round(n || 0).toLocaleString("es-CO")}`;
const fmtD = (d) => {
  try {
    return new Date(d + "T12:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch { return d; }
};
const uid = () => Math.random().toString(36).slice(2, 9);
const daysTo = (d) => { if (!d) return 999; return Math.ceil((new Date(d) - new Date()) / 864e5); };
const monthsFrom = (d) => Math.max(1, Math.floor((new Date() - new Date(d)) / (30 * 864e5)));
const curMonth = () => new Date().toISOString().slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);

const CATS = [
  { id: "comida", label: "Comida", icon: "🍽️", color: C.green },
  { id: "vivienda", label: "Vivienda", icon: "🏠", color: C.blue },
  { id: "transporte", label: "Transporte", icon: "🚗", color: C.amber },
  { id: "salud", label: "Salud", icon: "🏥", color: C.red },
  { id: "entrete", label: "Entrete.", icon: "🎬", color: C.purple },
  { id: "educacion", label: "Educación", icon: "📚", color: "#60E1FF" },
  { id: "ropa", label: "Ropa", icon: "👕", color: "#F472B6" },
  { id: "servicios", label: "Servicios", icon: "💡", color: C.amber },
  { id: "otros", label: "Otros", icon: "📦", color: C.sec },
];

const ACCOUNT_ICONS = { efectivo: "💵", banco: "🏦", tarjeta_debito: "💳", tarjeta_credito: "💳" };
const ACCOUNT_LABELS = { efectivo: "Efectivo", banco: "Cuenta bancaria", tarjeta_debito: "Tarjeta débito", tarjeta_credito: "Tarjeta crédito" };

/* ═══════════════════════════════════════
   CÁLCULO DE PRÉSTAMOS
═══════════════════════════════════════ */
const calcL = (l) => {
  const capPag = l.pagos.reduce((s, p) => s + (p.aCapital || 0), 0);
  const capPend = Math.max(0, l.capitalOriginal - capPag);
  const m = monthsFrom(l.fechaInicio);
  const intGen = capPend * (l.tasaMensual / 100) * m;
  const intPag = l.pagos.reduce((s, p) => s + (p.aInteres || 0), 0);
  const intAcum = Math.max(0, intGen - intPag);
  const total = capPend + intAcum;
  const dias = l.fechaVencimiento ? daysTo(l.fechaVencimiento) : 999;
  const isPag = l.estado === "pagado" || capPend === 0;
  const isVen = !isPag && dias < 0;
  return { capPend, capPag, intAcum, intPag, intGen, total, dias, isPag, isVen, m };
};

/* ═══════════════════════════════════════
   CÁLCULO DE ALERTAS
═══════════════════════════════════════ */
const calcAlertas = (data) => {
  const alertas = [];
  const m = curMonth();

  // ── Préstamos vencidos y próximos a vencer ──
  (data.loans || []).filter((l) => !calcL(l).isPag).forEach((l) => {
    const c = calcL(l);
    if (c.isVen) {
      alertas.push({ id: `pv-${l.id}`, urgencia: "alta", icon: "🚨", titulo: `${l.nombre} — Préstamo VENCIDO`, detalle: `Hace ${Math.abs(c.dias)} días · Deuda: ${fmt(c.total)}`, tab: "loans" });
    } else if (l.fechaVencimiento && c.dias <= 7) {
      alertas.push({ id: `pp-${l.id}`, urgencia: "media", icon: "⚠️", titulo: `${l.nombre} — Vence en ${c.dias} días`, detalle: `Por cobrar: ${fmt(c.total)}`, tab: "loans" });
    }
  });

  // ── Presupuestos agotados o por agotarse ──
  const gastosM = (data.transactions || []).filter((t) => t.tipo === "gasto" && t.fecha.startsWith(m));
  CATS.slice(0, 8).forEach((cat) => {
    const presupuesto = (data.budgets || {})[cat.id] || 0;
    if (!presupuesto) return;
    const gastado = gastosM.filter((t) => t.categoria === cat.id).reduce((s, t) => s + t.monto, 0);
    const pct = Math.round((gastado / presupuesto) * 100);
    if (pct >= 100) {
      alertas.push({ id: `ba-${cat.id}`, urgencia: "alta", icon: "🔴", titulo: `Presupuesto de ${cat.label} agotado`, detalle: `Gastaste ${fmt(gastado)} de ${fmt(presupuesto)} (${pct}%)`, tab: "budget" });
    } else if (pct >= 80) {
      alertas.push({ id: `bp-${cat.id}`, urgencia: "media", icon: "🟡", titulo: `Presupuesto de ${cat.label} casi agotado`, detalle: `${pct}% usado · Quedan ${fmt(presupuesto - gastado)}`, tab: "budget" });
    }
  });

  // ── Saldo del Tío pendiente ──
  const tio = data.tio;
  if (tio) {
    const saldo = tio.arriendos.reduce((s, a) => s + a.monto, 0)
      + tio.prestamos.reduce((s, l) => s + (l.pagos || []).reduce((ss, p) => ss + p.monto, 0), 0)
      - tio.gastos.reduce((s, g) => s + g.monto, 0)
      - tio.entregas.reduce((s, e) => s + e.monto, 0);
    if (saldo > 0) {
      alertas.push({ id: "tio-saldo", urgencia: "baja", icon: "👴", titulo: `Saldo pendiente por entregar a ${tio.nombre}`, detalle: `Tienes ${fmt(saldo)} por rendir`, tab: "tio" });
    }
  }

  return alertas;
};
/* ═══════════════════════════════════════
   COMPONENTE RECIBO (renderizado inline)
═══════════════════════════════════════ */
function ReciboOverlay({ loan, pago, cuentaNombre, recordatorio, onClose }) {
  const total = pago.monto;
  const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tipoLabel = pago.tipo === "interes" ? "Solo interés" : pago.tipo === "capital" ? "Solo capital" : "Capital + Interés";
  const c = calcL(loan);
  const printId = "recibo-print-area";

  const handlePrint = () => {
    const el = document.getElementById(printId);
    if (!el) return;
    const original = document.body.innerHTML;
    document.body.innerHTML = el.innerHTML;
    window.print();
    document.body.innerHTML = original;
    window.location.reload();
  };

  const Row = ({ label, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ color: "#555", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: valueColor || "#111" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
      {/* Botones acción */}
      <div style={{ width: "100%", maxWidth: 480, padding: "16px 16px 0", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={handlePrint} style={{ background: "#00C896", color: "#0D1B2A", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>🖨 Imprimir / Guardar PDF</button>
        <button onClick={onClose} style={{ background: "#1E3048", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✕ Cerrar</button>
      </div>

      {/* Recibo */}
      <div id={printId} style={{ width: "100%", maxWidth: 480, padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, color: "#111", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "2px solid #00C896", paddingBottom: 18, marginBottom: 20 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: "#0D1B2A", letterSpacing: 1 }}>💰 RECIBO DE ABONO</p>
            <p style={{ color: "#666", fontSize: 12, marginTop: 4 }}>{fechaHoy}</p>
            <span style={{ display: "inline-block", background: "#00C89622", color: "#00A87A", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, marginTop: 8 }}>Comprobante #{pago.id.toUpperCase()}</span>
          </div>

          {/* Total destacado */}
          <div style={{ background: "#0D1B2A", borderRadius: 12, padding: "18px 20px", marginBottom: 18, textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", letterSpacing: 1, marginBottom: 6 }}>TOTAL RECIBIDO</p>
            <p style={{ fontSize: 34, fontWeight: 700, color: "#00C896" }}>{fmt(total)}</p>
          </div>

          {/* Deudor */}
          <div style={{ background: "#f7f9fc", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
            <p style={{ fontSize: 10, letterSpacing: 1, color: "#888", textTransform: "uppercase", marginBottom: 12 }}>Información del deudor</p>
            <Row label="Nombre" value={loan.nombre} />
            {loan.telefono && <Row label="Teléfono" value={loan.telefono} />}
            <Row label="Categoría" value={loan.categoria} />
          </div>

          {/* Detalle abono */}
          <div style={{ background: "#f7f9fc", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
            <p style={{ fontSize: 10, letterSpacing: 1, color: "#888", textTransform: "uppercase", marginBottom: 12 }}>Detalle del abono</p>
            <Row label="Tipo" value={tipoLabel} />
            <Row label="Fecha" value={fmtD(pago.fecha)} />
            {cuentaNombre && <Row label="Cuenta origen" value={cuentaNombre} />}
            {pago.nota && <Row label="Nota" value={pago.nota} />}
            {pago.tipo === "ambos" && (
              <>
                <div style={{ height: 1, background: "#e0e0e0", margin: "8px 0" }} />
                <Row label="A capital" value={fmt(pago.aCapital)} valueColor="#00A87A" />
                <Row label="A interés" value={fmt(pago.aInteres)} valueColor="#e67e22" />
              </>
            )}
          </div>

          {/* Saldo pendiente */}
          <div style={{ background: "#f7f9fc", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
            <p style={{ fontSize: 10, letterSpacing: 1, color: "#888", textTransform: "uppercase", marginBottom: 12 }}>Saldo pendiente tras este abono</p>
            <Row label="Capital pendiente" value={fmt(c.capPend)} valueColor="#e74c3c" />
            <Row label="Interés pendiente" value={fmt(c.intAcum)} valueColor="#e67e22" />
            <div style={{ height: 1, background: "#e0e0e0", margin: "8px 0" }} />
            <Row label="Total deuda" value={fmt(c.total)} valueColor="#e74c3c" />
          </div>

          {/* Recordatorio puente */}
          {recordatorio && (
            <div style={{ background: "#FFF3CD", border: "1.5px solid #FFB432", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8B6000", marginBottom: 10, letterSpacing: 0.5 }}>🔔 RECORDATORIO — PRÉSTAMO PUENTE</p>
              {recordatorio.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "#5C4300", fontSize: 13 }}>Pasarle {item.tipo} a {recordatorio.acreedor}</span>
                  <span style={{ color: "#8B0000", fontWeight: 700, fontSize: 14 }}>{fmt(item.monto)}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "#FFB43255", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#5C4300", fontWeight: 700, fontSize: 13 }}>Lo que entró a tu cuenta</span>
                <span style={{ color: "#006400", fontWeight: 700, fontSize: 14 }}>{fmt(recordatorio.montoParaMi)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 11, borderTop: "1px solid #eee", paddingTop: 14 }}>
            <p>Generado por <strong>MisCuentas</strong> · {new Date().toLocaleString("es-CO")}</p>
            <p style={{ marginTop: 4 }}>Comprobante interno de registro.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   COMPONENTE REPORTE TÍO (renderizado inline)
═══════════════════════════════════════ */
function ReporteOverlay({ tio, totales, desde, hasta, onClose }) {
  const { totalArriendos, totalCobradoPrestamos, totalGastos, totalEntregas, saldoPendiente } = totales;
  const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const printId = "reporte-print-area";

  const handlePrint = () => {
    const el = document.getElementById(printId);
    if (!el) return;
    const original = document.body.innerHTML;
    document.body.innerHTML = el.innerHTML;
    window.print();
    document.body.innerHTML = original;
    window.location.reload();
  };

  const Row = ({ label, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ color: "#555", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: valueColor || "#111" }}>{value}</span>
    </div>
  );

  const SectionTitle = ({ children }) => (
    <p style={{ fontSize: 10, letterSpacing: 1, color: "#888", textTransform: "uppercase", fontWeight: 700, margin: "20px 0 8px", borderBottom: "1px solid #eee", paddingBottom: 4 }}>{children}</p>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
      {/* Botones acción */}
      <div style={{ width: "100%", maxWidth: 560, padding: "16px 16px 0", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={handlePrint} style={{ background: "#4A9FFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🖨 Imprimir / Guardar PDF</button>
        <button onClick={onClose} style={{ background: "#1E3048", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✕ Cerrar</button>
      </div>

      {/* Contenido del reporte */}
      <div id={printId} style={{ width: "100%", maxWidth: 560, padding: "20px 16px 40px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, color: "#111", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

          {/* Encabezado */}
          <div style={{ borderBottom: "2px solid #4A9FFF", paddingBottom: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: "#0D1B2A" }}>📊 Informe de Administración</p>
            <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{tio.nombre} · {fechaHoy}</p>
            {(desde || hasta) && (
              <div style={{ display: "inline-block", background: "#EEF4FF", border: "1px solid #4A9FFF55", borderRadius: 8, padding: "4px 12px", marginTop: 8 }}>
                <span style={{ color: "#1a56c4", fontSize: 12, fontWeight: 700 }}>
                  📅 Período: {desde ? new Date(desde + "T12:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "inicio"} → {hasta ? new Date(hasta + "T12:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "hoy"}
                </span>
              </div>
            )}
          </div>

          {/* Resumen financiero */}
          <div style={{ background: "#f7f9fc", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
            <SectionTitle>Resumen financiero</SectionTitle>
            <Row label="Arriendos recibidos"       value={`+$${totalArriendos.toLocaleString("es-CO")}`}        valueColor="#00a875" />
            <Row label="Cobros de préstamos"        value={`+$${totalCobradoPrestamos.toLocaleString("es-CO")}`} valueColor="#00a875" />
            <Row label="Gastos pagados"             value={`-$${totalGastos.toLocaleString("es-CO")}`}           valueColor="#e53935" />
            <Row label="Ya entregado"               value={`-$${totalEntregas.toLocaleString("es-CO")}`}         valueColor="#f57c00" />
          </div>

          {/* Total a entregar */}
          <div style={{ background: saldoPendiente >= 0 ? "#e8f8f4" : "#fdecea", border: `1.5px solid ${saldoPendiente >= 0 ? "#00a875" : "#e53935"}`, borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Saldo pendiente por entregar</span>
            <span style={{ fontWeight: 800, fontSize: 26, color: saldoPendiente >= 0 ? "#00a875" : "#e53935" }}>${Math.abs(saldoPendiente).toLocaleString("es-CO")}</span>
          </div>

          {/* Arriendos */}
          {tio.arriendos.length > 0 && (
            <>
              <SectionTitle>Arriendos recibidos</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["Inmueble", "Descripción", "Fecha", "Monto"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tio.arriendos.map((a) => (
                    <tr key={a.id}>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{a.inmueble}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{a.descripcion}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{a.fecha}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5", color: "#00a875", fontWeight: 700 }}>${a.monto.toLocaleString("es-CO")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Gastos */}
          {tio.gastos.length > 0 && (
            <>
              <SectionTitle>Gastos pagados por ti</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["Descripción", "Categoría", "Fecha", "Monto"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tio.gastos.map((g) => (
                    <tr key={g.id}>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{g.descripcion}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{g.categoria}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{g.fecha}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5", color: "#e53935", fontWeight: 700 }}>${g.monto.toLocaleString("es-CO")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Préstamos cobrados */}
          {tio.prestamos.length > 0 && (
            <>
              <SectionTitle>Préstamos administrados</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["Deudor", "Capital", "Cobrado", "Pendiente"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tio.prestamos.map((l) => {
                    const cobrado = (l.pagos || []).reduce((s, p) => s + p.monto, 0);
                    const c = calcL(l);
                    return (
                      <tr key={l.id}>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{l.nombre}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>${l.capitalOriginal.toLocaleString("es-CO")}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5", color: "#00a875", fontWeight: 700 }}>${cobrado.toLocaleString("es-CO")}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5", color: "#e53935", fontWeight: 700 }}>${c.total.toLocaleString("es-CO")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {/* Entregas */}
          {tio.entregas.length > 0 && (
            <>
              <SectionTitle>Entregas realizadas</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["Fecha", "Nota", "Monto"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tio.entregas.map((e) => (
                    <tr key={e.id}>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{e.fecha}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5" }}>{e.nota || "—"}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f5f5f5", color: "#f57c00", fontWeight: 700 }}>${e.monto.toLocaleString("es-CO")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Pie */}
          <div style={{ textAlign: "center", color: "#aaa", fontSize: 11, borderTop: "1px solid #eee", paddingTop: 14, marginTop: 20 }}>
            <p>Generado por <strong>MisCuentas</strong> · {new Date().toLocaleString("es-CO")}</p>
            <p style={{ marginTop: 4 }}>Informe de uso interno — administración cartera {tio.nombre}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
const INIT = {
  transactions: [
    { id: "t1", tipo: "ingreso", monto: 3500000, categoria: "otros", descripcion: "Salario junio", fecha: "2026-06-01", esFijo: true },
    { id: "t2", tipo: "gasto", monto: 800000, categoria: "vivienda", descripcion: "Arriendo", fecha: "2026-06-01", esFijo: true },
    { id: "t3", tipo: "gasto", monto: 95000, categoria: "comida", descripcion: "Mercado semana", fecha: "2026-06-02", esFijo: false },
    { id: "t4", tipo: "gasto", monto: 40000, categoria: "transporte", descripcion: "Gasolina", fecha: "2026-06-02", esFijo: false },
    { id: "t5", tipo: "ingreso", monto: 125000, categoria: "otros", descripcion: "Abono préstamo Carlos", fecha: "2026-06-01", esFijo: false },
  ],
  budgets: { comida: 300000, vivienda: 900000, transporte: 150000, salud: 100000, entrete: 80000 },
  loans: [
    { id: "l1", nombre: "Carlos Pérez", telefono: "3001234567", capitalOriginal: 500000, tasaMensual: 5, fechaInicio: "2026-02-01", fechaVencimiento: "2026-05-01", categoria: "Conocido", notas: "Segundo préstamo", pagos: [{ id: "p1", fecha: "2026-03-01", monto: 25000, aCapital: 0, aInteres: 25000, tipo: "interes", nota: "Cuota marzo", cuentaOrigen: "" }], estado: "activo", tipoPuente: false, fuenteNombre: "", fuenteTasa: "" },
    { id: "l2", nombre: "María Rodríguez", telefono: "3109876543", capitalOriginal: 200000, tasaMensual: 3, fechaInicio: "2026-05-01", fechaVencimiento: "2026-06-08", categoria: "Amigo", notas: "", pagos: [], estado: "activo", tipoPuente: false, fuenteNombre: "", fuenteTasa: "" },
    { id: "l3", nombre: "Luis Torres", telefono: "", capitalOriginal: 150000, tasaMensual: 4, fechaInicio: "2026-04-15", fechaVencimiento: "2026-07-15", categoria: "Familiar", notas: "Para cirugía", pagos: [{ id: "p2", fecha: "2026-05-15", monto: 150000, aCapital: 150000, aInteres: 0, tipo: "capital", nota: "Pago completo", cuentaOrigen: "" }], estado: "pagado", tipoPuente: false, fuenteNombre: "", fuenteTasa: "" },
  ],
  goals: [
    { id: "g1", nombre: "Fondo de emergencia", montoMeta: 5000000, montoActual: 1500000, fechaLimite: "2026-12-31", plazo: "largo", color: C.green },
    { id: "g2", nombre: "Viaje a Cartagena", montoMeta: 1200000, montoActual: 800000, fechaLimite: "2026-08-15", plazo: "corto", color: C.blue },
  ],
  accounts: [
    { id: "a1", nombre: "Efectivo", tipo: "efectivo", saldo: 500000, color: C.green, subcuentas: [] },
    { id: "a2", nombre: "Bancolombia", tipo: "banco", saldo: 1200000, color: C.blue, subcuentas: [
      { id: "s1", nombre: "Cuenta principal", saldo: 700000, color: C.blue },
      { id: "s2", nombre: "Bolsillo Gastos Fijos", saldo: 300000, color: C.amber },
      { id: "s3", nombre: "Bolsillo Ahorro", saldo: 200000, color: C.green },
    ]},
  ],
  tio: {
    nombre: "Mi Tío",
    prestamos: [
      { id: "tl1", nombre: "Pedro Gómez", telefono: "3205551234", capitalOriginal: 800000, tasaMensual: 4, fechaInicio: "2026-03-01", fechaVencimiento: "2026-09-01", notas: "Arreglo de casa", pagos: [], estado: "activo" },
    ],
    arriendos: [
      { id: "ar1", inmueble: "Casa Calle 5", descripcion: "Arriendo mayo", monto: 450000, fecha: "2026-05-01", notas: "" },
      { id: "ar2", inmueble: "Casa Calle 5", descripcion: "Arriendo junio", monto: 450000, fecha: "2026-06-01", notas: "" },
    ],
    gastos: [
      { id: "tg1", descripcion: "Predial casa", monto: 120000, fecha: "2026-05-15", categoria: "Impuesto", notas: "" },
    ],
    entregas: [
      { id: "te1", monto: 500000, fecha: "2026-05-30", nota: "Entrega mayo" },
    ],
  },
};

/* ═══════════════════════════════════════
   COMPONENTES COMPARTIDOS
═══════════════════════════════════════ */
const s = {
  card: { background: C.surf, borderRadius: 16, padding: "16px", border: `0.5px solid ${C.border}` },
  inp: { width: "100%", background: C.surf2, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", color: C.text, fontSize: 16, outline: "none", boxSizing: "border-box", ...DM },
};

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ ...s.card, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
);

const Badge = ({ label, color }) => (
  <span style={{ background: `${color}22`, color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" }}>{label}</span>
);

const ProgBar = ({ value, max, color = C.green, h = 6 }) => {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = p >= 100 ? C.red : p >= 80 ? C.amber : color;
  return (
    <div style={{ background: C.surf2, borderRadius: 99, height: h, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: fill, borderRadius: 99, transition: "width .4s" }} />
    </div>
  );
};

const Inp = ({ label, ...p }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 4 }}>{label}</label>}
    <input {...p} style={{ ...s.inp, ...p.style }} />
  </div>
);

const Sel = ({ label, children, ...p }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 4 }}>{label}</label>}
    <select {...p} style={{ ...s.inp, ...p.style }}>{children}</select>
  </div>
);

const PrimaryBtn = ({ children, onClick, color = C.green, outline = false, style = {} }) => (
  <button onClick={onClick} style={{ background: outline ? "transparent" : color, color: outline ? color : "#0D1B2A", border: outline ? `1px solid ${color}` : "none", borderRadius: 12, padding: "13px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", ...DM, transition: "opacity .15s", ...style }}>{children}</button>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.78)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
    <div style={{ background: C.surf, width: "100%", maxWidth: 430, borderRadius: "20px 20px 0 0", padding: "20px 20px 40px", maxHeight: "92vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 17, fontWeight: 700, ...SORA }}>{title}</span>
        <button onClick={onClose} style={{ background: C.surf2, border: "none", color: C.sec, width: 32, height: 32, borderRadius: 99, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const Divider = () => <div style={{ height: 0.5, background: C.border, margin: "14px 0" }} />;

const InfoBox = ({ children }) => (
  <div style={{ background: C.surf2, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12 }}>{children}</div>
);

/* ═══════════════════════════════════════
   BOTTOM NAV
═══════════════════════════════════════ */
const NAV = [
  { id: "dash", icon: "🏠", label: "Inicio" },
  { id: "tx", icon: "💸", label: "Gastos" },
  { id: "loans", icon: "🤝", label: "Préstamos" },
  { id: "accounts", icon: "🏦", label: "Cuentas" },
  { id: "budget", icon: "📊", label: "Stats" },
  { id: "goals", icon: "🎯", label: "Metas" },
  { id: "tio", icon: "👴", label: "Mi Tío" },
];

const BottomNav = ({ tab, setTab, badges = {} }) => (
  <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: C.surf, borderTop: `0.5px solid ${C.border}`, display: "flex", overflowX: "auto", padding: "10px 4px 22px", zIndex: 200 }}>
    {NAV.map((n) => (
      <button key={n.id} onClick={() => setTab(n.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: tab === n.id ? 1 : 0.42, minWidth: 54, flexShrink: 0, padding: 0, position: "relative" }}>
        <span style={{ fontSize: 19 }}>{n.icon}</span>
        {badges[n.id] > 0 && (
          <span style={{ position: "absolute", top: -2, right: 6, background: C.red, color: "#fff", fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${C.surf}` }}>
            {badges[n.id]}
          </span>
        )}
        <span style={{ fontSize: 9, color: tab === n.id ? C.green : C.sec, fontWeight: tab === n.id ? 700 : 400, ...DM }}>{n.label}</span>
      </button>
    ))}
  </div>
);

/* ═══════════════════════════════════════
   SCREEN: DASHBOARD
═══════════════════════════════════════ */
function Dashboard({ data, setTab }) {
  const m = curMonth();
  const txM = data.transactions.filter((t) => t.fecha.startsWith(m));
  const ing = txM.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gst = txM.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  const saldo = ing - gst;
  const activeL = data.loans.filter((l) => !calcL(l).isPag);
  const totPrest = activeL.reduce((s, l) => s + calcL(l).total, 0);
  const totalCuentas = (data.accounts || []).reduce((s, a) => s + a.saldo, 0);
  const recent = [...data.transactions].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
  const fechaStr = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const alertas = calcAlertas(data);
  const altas = alertas.filter((a) => a.urgencia === "alta");
  const medias = alertas.filter((a) => a.urgencia === "media");
  const bajas = alertas.filter((a) => a.urgencia === "baja");
  const urgColors = { alta: { bg: `${C.red}18`, border: `${C.red}55`, text: C.red }, media: { bg: `${C.amber}18`, border: `${C.amber}55`, text: C.amber }, baja: { bg: `${C.blue}14`, border: `${C.blue}44`, text: C.blue } };

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 20px" }}>
        <p style={{ color: C.sec, fontSize: 14 }}>{fechaStr}</p>
        <p style={{ fontSize: 24, fontWeight: 700, ...SORA }}>Hola 👋</p>
      </div>

      <div style={{ background: "linear-gradient(135deg,#0F3460,#1B4F72)", borderRadius: 20, padding: 20, marginBottom: 16, border: `1px solid rgba(0,200,150,.2)` }}>
        <p style={{ color: C.sec, fontSize: 11, marginBottom: 6, letterSpacing: 0.8 }}>SALDO DEL MES</p>
        <p style={{ fontSize: 36, fontWeight: 700, ...SORA, color: saldo >= 0 ? C.green : C.red, marginBottom: 16 }}>{fmt(saldo)}</p>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {[
            { l: "↑ Ingresos", v: ing, c: C.green },
            { l: "↓ Gastos", v: gst, c: C.red },
            { l: "🤝 Préstamos", v: totPrest, c: C.amber },
            { l: "🏦 En cuentas", v: totalCuentas, c: C.blue },
          ].map((x) => (
            <div key={x.l}>
              <p style={{ color: C.sec, fontSize: 11 }}>{x.l}</p>
              <p style={{ color: x.c, fontWeight: 700, ...SORA, fontSize: 15 }}>{fmt(x.v)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Banner de alertas ── */}
      {alertas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🔔</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Alertas</span>
            <span style={{ background: altas.length > 0 ? C.red : C.amber, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99 }}>{alertas.length}</span>
          </div>
          {[...altas, ...medias, ...bajas].map((a) => {
            const col = urgColors[a.urgencia];
            return (
              <div key={a.id} onClick={() => setTab(a.tab)} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: col.text }}>{a.titulo}</p>
                  <p style={{ color: C.sec, fontSize: 12, marginTop: 2 }}>{a.detalle}</p>
                </div>
                <span style={{ color: C.sec, fontSize: 18, flexShrink: 0 }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Últimos movimientos</span>
        <span onClick={() => setTab("tx")} style={{ color: C.green, fontSize: 13, cursor: "pointer" }}>Ver todos →</span>
      </div>
      {recent.length === 0 ? (
        <Card><p style={{ textAlign: "center", color: C.sec }}>Sin movimientos aún</p></Card>
      ) : (
        recent.map((tx) => {
          const cat = CATS.find((c) => c.id === tx.categoria) || CATS[CATS.length - 1];
          return (
            <Card key={tx.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: `${cat.color}22`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.descripcion}</p>
                  <p style={{ color: C.sec, fontSize: 12 }}>{fmtD(tx.fecha)} · {cat.label}</p>
                </div>
                <p style={{ fontWeight: 700, color: tx.tipo === "ingreso" ? C.green : C.red, ...SORA, flexShrink: 0 }}>
                  {tx.tipo === "ingreso" ? "+" : "-"}{fmt(tx.monto)}
                </p>
              </div>
            </Card>
          );
        })
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, marginBottom: 16 }}>
        {[
          { icon: "🏦", label: "Cuentas", tab: "accounts", color: C.blue },
          { icon: "🎯", label: "Metas", tab: "goals", color: C.purple },
        ].map((i) => (
          <Card key={i.tab} style={{ textAlign: "center", padding: "16px 12px" }} onClick={() => setTab(i.tab)}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{i.icon}</div>
            <p style={{ fontSize: 13, color: i.color, fontWeight: 700 }}>{i.label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN: TRANSACCIONES
═══════════════════════════════════════ */
function Transacciones({ data, saveData }) {
  const [modal, setModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [filter, setFilter] = useState("todos");
  const emptyF = { tipo: "gasto", monto: "", categoria: "comida", descripcion: "", fecha: todayStr(), esFijo: false };
  const [f, setF] = useState(emptyF);
  const m = curMonth();
  const txM = data.transactions.filter((t) => t.fecha.startsWith(m));
  const ing = txM.filter((t) => t.tipo === "ingreso").reduce((s, t) => s + t.monto, 0);
  const gst = txM.filter((t) => t.tipo === "gasto").reduce((s, t) => s + t.monto, 0);
  let list = [...data.transactions].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (filter !== "todos") list = list.filter((t) => t.tipo === filter);

  const openEdit = (tx) => {
    setEditTx(tx.id);
    setF({ tipo: tx.tipo, monto: String(tx.monto), categoria: tx.categoria, descripcion: tx.descripcion, fecha: tx.fecha, esFijo: tx.esFijo });
    setModal(true);
  };

  const save = () => {
    if (!f.monto || !f.descripcion) return;
    const monto = parseFloat(String(f.monto).replace(/[^0-9.]/g, "")) || 0;
    if (editTx) {
      saveData({ ...data, transactions: data.transactions.map((t) => t.id === editTx ? { ...t, ...f, monto } : t) });
    } else {
      saveData({ ...data, transactions: [{ ...f, id: uid(), monto }, ...data.transactions] });
    }
    setModal(false);
    setEditTx(null);
    setF(emptyF);
  };

  const deleteTx = (id) => saveData({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>Movimientos</p>
        <PrimaryBtn onClick={() => { setEditTx(null); setF(emptyF); setModal(true); }} style={{ padding: "8px 16px", fontSize: 13 }}>+ Agregar</PrimaryBtn>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[{ l: "Ingresos", v: ing, c: C.green }, { l: "Gastos", v: gst, c: C.red }].map((x) => (
          <div key={x.l} style={{ flex: 1, background: C.surf, borderRadius: 14, padding: "12px 14px", border: `0.5px solid ${C.border}` }}>
            <p style={{ color: C.sec, fontSize: 11, marginBottom: 4 }}>{x.l} este mes</p>
            <p style={{ color: x.c, fontWeight: 700, fontSize: 18, ...SORA }}>{fmt(x.v)}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["todos", "ingreso", "gasto"].map((fi) => (
          <button key={fi} onClick={() => setFilter(fi)} style={{ background: filter === fi ? C.green : C.surf, color: filter === fi ? "#0D1B2A" : C.sec, border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", ...DM }}>
            {fi === "todos" ? "Todos" : fi === "ingreso" ? "Ingresos" : "Gastos"}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card><p style={{ textAlign: "center", color: C.sec }}>Sin movimientos</p></Card>
      ) : (
        list.map((tx) => {
          const cat = CATS.find((c) => c.id === tx.categoria) || CATS[CATS.length - 1];
          return (
            <Card key={tx.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, background: `${cat.color}22`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.descripcion}</p>
                  <p style={{ color: C.sec, fontSize: 12 }}>{fmtD(tx.fecha)} · {cat.label}{tx.esFijo ? " · Fijo" : ""}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <p style={{ fontWeight: 700, color: tx.tipo === "ingreso" ? C.green : C.red, ...SORA }}>
                    {tx.tipo === "ingreso" ? "+" : "-"}{fmt(tx.monto)}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(tx)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, padding: 0 }}>✏️</button>
                    <button onClick={() => deleteTx(tx.id)} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}

      {modal && (
        <Modal title={editTx ? "Editar movimiento" : "Nuevo movimiento"} onClose={() => { setModal(false); setEditTx(null); setF(emptyF); }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["gasto", "ingreso"].map((t) => (
              <button key={t} onClick={() => setF((x) => ({ ...x, tipo: t }))} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", cursor: "pointer", ...DM, fontWeight: 700, fontSize: 14, background: f.tipo === t ? (t === "gasto" ? C.red : C.green) : C.surf2, color: f.tipo === t ? "#0D1B2A" : C.sec }}>
                {t === "gasto" ? "💸 Gasto" : "💰 Ingreso"}
              </button>
            ))}
          </div>
          <Inp label="Monto" type="number" placeholder="0" value={f.monto} onChange={(e) => setF((x) => ({ ...x, monto: e.target.value }))} />
          <Inp label="Descripción" placeholder="¿En qué?" value={f.descripcion} onChange={(e) => setF((x) => ({ ...x, descripcion: e.target.value }))} />
          <Sel label="Categoría" value={f.categoria} onChange={(e) => setF((x) => ({ ...x, categoria: e.target.value }))}>
            {CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </Sel>
          <Inp label="Fecha" type="date" value={f.fecha} onChange={(e) => setF((x) => ({ ...x, fecha: e.target.value }))} />
          <label style={{ display: "flex", alignItems: "center", gap: 10, color: C.sec, fontSize: 14, marginBottom: 20, cursor: "pointer" }}>
            <input type="checkbox" checked={f.esFijo} onChange={(e) => setF((x) => ({ ...x, esFijo: e.target.checked }))} style={{ width: 18, height: 18 }} />
            Gasto / Ingreso fijo (recurrente)
          </label>
          <PrimaryBtn onClick={save} style={{ width: "100%" }}>{editTx ? "Guardar cambios" : "Guardar movimiento"}</PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN: PRÉSTAMOS
═══════════════════════════════════════ */
function Prestamos({ data, saveData }) {
  const [filter, setFilter] = useState("todos");
  const [addModal, setAddModal] = useState(false);
  const [editLoan, setEditLoan] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [reciboData, setReciboData] = useState(null);
  const accounts = data.accounts || [];

  const emptyLf = { nombre: "", telefono: "", capitalOriginal: "", tasaMensual: "", fechaInicio: todayStr(), fechaVencimiento: "", categoria: "Amigo", notas: "", cuentaOrigen: accounts[0]?.id || "", tipoPuente: false, fuenteNombre: "", fuenteTasa: "" };
  const [lf, setLf] = useState(emptyLf);
  const [pf, setPf] = useState({ fecha: todayStr(), tipo: "interes", monto: "", aCapital: "", aInteres: "", nota: "", cuentaOrigen: accounts[0]?.id || "", puenteInteresAcreedor: "" });

  const loans = data.loans.filter((l) => {
    if (filter === "todos") return true;
    const c = calcL(l);
    if (filter === "vencidos") return c.isVen;
    if (filter === "pagados") return c.isPag;
    if (filter === "activos") return !c.isPag && !c.isVen;
    return true;
  });

  const activos = data.loans.filter((l) => !calcL(l).isPag);
  const totCapital = activos.reduce((s, l) => s + calcL(l).capPend, 0);
  const totInteres = activos.reduce((s, l) => s + calcL(l).intAcum, 0);

  const openEdit = (loan) => {
    setEditLoan(loan.id);
    setLf({ nombre: loan.nombre, telefono: loan.telefono, capitalOriginal: String(loan.capitalOriginal), tasaMensual: String(loan.tasaMensual), fechaInicio: loan.fechaInicio, fechaVencimiento: loan.fechaVencimiento || "", categoria: loan.categoria, notas: loan.notas, cuentaOrigen: loan.cuentaOrigen || "", tipoPuente: loan.tipoPuente || false, fuenteNombre: loan.fuenteNombre || "", fuenteTasa: String(loan.fuenteTasa || "") });
    setAddModal(true);
  };

  const saveLoan = () => {
    if (!lf.nombre || !lf.capitalOriginal) return;
    if (editLoan) {
      saveData({ ...data, loans: data.loans.map((l) => l.id === editLoan ? { ...l, ...lf, capitalOriginal: parseFloat(lf.capitalOriginal) || 0, tasaMensual: parseFloat(lf.tasaMensual) || 0, fuenteTasa: parseFloat(lf.fuenteTasa) || 0 } : l) });
    } else {
      const loan = { ...lf, id: uid(), capitalOriginal: parseFloat(lf.capitalOriginal) || 0, tasaMensual: parseFloat(lf.tasaMensual) || 0, fuenteTasa: parseFloat(lf.fuenteTasa) || 0, pagos: [], estado: "activo" };
      saveData({ ...data, loans: [...data.loans, loan] });
    }
    setAddModal(false);
    setEditLoan(null);
    setLf(emptyLf);
  };

  const addPago = () => {
    const loan = data.loans.find((l) => l.id === detail);
    if (!loan) return;

    // Montos base
    let aK = 0, aI = 0, total = 0;
    if (pf.tipo === "interes")       { aI = parseFloat(pf.monto) || 0; total = aI; }
    else if (pf.tipo === "capital")  { aK = parseFloat(pf.monto) || 0; total = aK; }
    else                             { aK = parseFloat(pf.aCapital) || 0; aI = parseFloat(pf.aInteres) || 0; total = aK + aI; }
    if (!total) return;

    // ── Lógica puente: cuánto entra a mi cuenta vs recordatorio ──
    const esPuente = loan.tipoPuente && loan.fuenteNombre;
    const interesAcreedor = esPuente ? (parseFloat(pf.puenteInteresAcreedor) || 0) : 0;
    let montoParaMi = total;
    let recordatorio = null;

    if (esPuente) {
      const items = [];
      if (pf.tipo === "interes") {
        montoParaMi = total - interesAcreedor;
        if (interesAcreedor > 0) items.push({ tipo: "interés", monto: interesAcreedor });
      } else if (pf.tipo === "capital") {
        montoParaMi = aK; // el capital lo guarda el usuario para devolvérselo al acreedor
        if (aK > 0) items.push({ tipo: "capital", monto: aK });
      } else {
        montoParaMi = aK + (aI - interesAcreedor);
        if (aK > 0) items.push({ tipo: "capital", monto: aK });
        if (interesAcreedor > 0) items.push({ tipo: "interés", monto: interesAcreedor });
      }
      if (items.length > 0) recordatorio = { acreedor: loan.fuenteNombre, items, montoParaMi };
    }

    // Guardar el pago
    const pago = { id: uid(), fecha: pf.fecha, tipo: pf.tipo, monto: total, aCapital: aK, aInteres: aI, nota: pf.nota, cuentaOrigen: pf.cuentaOrigen, puenteInteresAcreedor: interesAcreedor, montoParaMi };
    const newPagos = [...loan.pagos, pago];
    const capPagTotal = newPagos.reduce((s, p) => s + p.aCapital, 0);
    const estado = capPagTotal >= loan.capitalOriginal ? "pagado" : loan.estado;
    const updatedLoan = { ...loan, pagos: newPagos, estado };

    // ── Actualizar saldo de la cuenta (entra plata, no sale) ──
    let newAccounts = data.accounts || [];
    if (pf.cuentaOrigen && montoParaMi > 0) {
      newAccounts = newAccounts.map((a) =>
        a.id === pf.cuentaOrigen ? { ...a, saldo: (parseFloat(a.saldo) || 0) + montoParaMi } : a
      );
    }

    saveData({ ...data, loans: data.loans.map((l) => l.id === detail ? updatedLoan : l), accounts: newAccounts });
    setPayModal(false);
    setPf({ fecha: todayStr(), tipo: "interes", monto: "", aCapital: "", aInteres: "", nota: "", cuentaOrigen: accounts[0]?.id || "", puenteInteresAcreedor: "" });
    setReciboData({ loan: updatedLoan, pago, cuentaNombre: accounts.find((a) => a.id === pf.cuentaOrigen)?.nombre || "", recordatorio });
  };

  /* ── DETALLE ── */
  if (detail) {
    const loan = data.loans.find((l) => l.id === detail);
    if (!loan) { setDetail(null); return null; }
    const c = calcL(loan);
    const sc = c.isPag ? C.green : c.isVen ? C.red : c.dias <= 7 ? C.amber : C.green;
    const sl = c.isPag ? "✅ Pagado" : c.isVen ? `🚨 Vencido hace ${Math.abs(c.dias)}d` : c.dias <= 7 ? `⚠️ Vence en ${c.dias}d` : `✓ Activo · vence ${fmtD(loan.fechaVencimiento)}`;
    const pPct = Math.round((c.capPag / loan.capitalOriginal) * 100) || 0;
    const sorted = [...loan.pagos].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const cuentaOrigen = accounts.find((a) => a.id === loan.cuentaOrigen);

    const diferencial = loan.tipoPuente ? ((parseFloat(loan.tasaMensual) || 0) - (parseFloat(loan.fuenteTasa) || 0)) : 0;

    return (
      <div style={{ padding: "0 16px" }}>
        <div style={{ padding: "52px 0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setDetail(null)} style={{ background: C.surf, border: "none", color: C.text, width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700, ...SORA }}>{loan.nombre}</p>
              <p style={{ color: C.sec, fontSize: 13 }}>{loan.categoria} · {loan.tasaMensual}% mensual</p>
            </div>
          </div>
          <button onClick={() => openEdit(loan)} style={{ background: `${C.blue}22`, border: "none", color: C.blue, borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, ...DM }}>✏️ Editar</button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <Badge label={sl} color={sc} />
          {loan.tipoPuente && <Badge label="🌉 Tipo puente" color={C.purple} />}
          {cuentaOrigen && <Badge label={`Salió de: ${cuentaOrigen.nombre}`} color={C.blue} />}
        </div>

        {/* Card puente */}
        {loan.tipoPuente && loan.fuenteNombre && (
          <Card style={{ marginBottom: 12, background: `${C.purple}14`, border: `0.5px solid ${C.purple}44` }}>
            <p style={{ color: C.purple, fontSize: 11, letterSpacing: 0.8, marginBottom: 10, fontWeight: 700 }}>🌉 ANÁLISIS DE PUENTE</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.sec, fontSize: 13 }}>Prestado por</span>
              <span style={{ fontWeight: 700 }}>{loan.fuenteNombre}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.sec, fontSize: 13 }}>Tasa que le pagas a {loan.fuenteNombre}</span>
              <span style={{ color: C.red, fontWeight: 700 }}>{loan.fuenteTasa}%/mes</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.sec, fontSize: 13 }}>Tasa que cobras a {loan.nombre}</span>
              <span style={{ color: C.green, fontWeight: 700 }}>{loan.tasaMensual}%/mes</span>
            </div>
            <div style={{ height: 0.5, background: `${C.purple}44`, margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>Tu ganancia neta</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ color: diferencial >= 0 ? C.green : C.red, ...SORA, fontWeight: 700, fontSize: 16 }}>
                  {diferencial >= 0 ? "+" : ""}{diferencial.toFixed(2)}%/mes
                </span>
                <p style={{ color: diferencial >= 0 ? C.green : C.red, fontSize: 12 }}>{fmt(loan.capitalOriginal * (diferencial / 100))}/mes</p>
              </div>
            </div>
          </Card>
        )}

        <Card style={{ marginBottom: 12 }}>
          <p style={{ color: C.sec, fontSize: 11, marginBottom: 14, letterSpacing: 0.8 }}>DESGLOSE FINANCIERO</p>
          <div style={{ marginBottom: 14 }}>
            {[{ l: "Capital original", v: loan.capitalOriginal, c: C.text }, { l: "Capital pagado", v: c.capPag, c: C.green, pre: "− " }].map((r) => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.sec, fontSize: 13 }}>{r.l}</span>
                <span style={{ color: r.c, ...SORA, fontWeight: 600 }}>{r.pre || ""}{fmt(r.v)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `0.5px solid ${C.border}`, marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Capital pendiente</span>
              <span style={{ color: C.red, ...SORA, fontWeight: 700, fontSize: 16 }}>{fmt(c.capPend)}</span>
            </div>
            <ProgBar value={c.capPag} max={loan.capitalOriginal} color={C.green} h={8} />
            <p style={{ color: C.ter, fontSize: 11, marginTop: 4 }}>{pPct}% del capital recuperado</p>
          </div>
          <Divider />
          <div>
            {[{ l: `Interés generado (${c.m} mes${c.m !== 1 ? "es" : ""})`, v: c.intGen, c: C.text }, { l: "Interés pagado", v: c.intPag, c: C.green, pre: "− " }].map((r) => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.sec, fontSize: 13 }}>{r.l}</span>
                <span style={{ color: r.c, ...SORA, fontWeight: 600 }}>{r.pre || ""}{fmt(r.v)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `0.5px solid ${C.border}` }}>
              <span style={{ fontWeight: 700 }}>Interés pendiente</span>
              <span style={{ color: C.amber, ...SORA, fontWeight: 700, fontSize: 16 }}>{fmt(c.intAcum)}</span>
            </div>
          </div>
          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>DEUDA TOTAL</span>
            <span style={{ color: C.red, ...SORA, fontSize: 22, fontWeight: 700 }}>{fmt(c.total)}</span>
          </div>
        </Card>

        {(loan.telefono || loan.notas) && (
          <Card style={{ marginBottom: 12, padding: "12px 14px" }}>
            {loan.telefono && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loan.notas ? 8 : 0 }}>
                <span style={{ color: C.sec, fontSize: 14 }}>📞 {loan.telefono}</span>
                <a href={`https://wa.me/57${loan.telefono}?text=Hola%20${encodeURIComponent(loan.nombre)}%2C%20te%20recuerdo%20tu%20saldo%20pendiente%20de%20${encodeURIComponent(fmt(c.total))}.%20Gracias%20%F0%9F%99%8F`} style={{ background: `${C.green}22`, color: C.green, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>WhatsApp 💬</a>
              </div>
            )}
            {loan.notas && <p style={{ color: C.sec, fontSize: 13 }}>📝 {loan.notas}</p>}
          </Card>
        )}

        {!c.isPag && (
          <PrimaryBtn onClick={() => {
            const interesAuto = loan.tipoPuente && loan.fuenteNombre
              ? String(Math.round(loan.capitalOriginal * ((parseFloat(loan.fuenteTasa) || 0) / 100)))
              : "";
            setPf((x) => ({ ...x, puenteInteresAcreedor: interesAuto }));
            setPayModal(true);
          }} style={{ width: "100%", marginBottom: 12 }}>+ Registrar abono</PrimaryBtn>
        )}

        <button onClick={() => { saveData({ ...data, loans: data.loans.filter((l) => l.id !== detail) }); setDetail(null); }} style={{ background: "none", border: `0.5px solid ${C.red}55`, color: C.red, borderRadius: 10, padding: "8px 16px", cursor: "pointer", ...DM, marginBottom: 20, fontSize: 13 }}>🗑 Eliminar préstamo</button>

        <p style={{ fontWeight: 700, marginBottom: 10 }}>Historial de abonos ({loan.pagos.length})</p>
        {sorted.length === 0 ? (
          <Card><p style={{ textAlign: "center", color: C.sec }}>Sin abonos registrados</p></Card>
        ) : (
          sorted.map((p) => {
            const pc = p.tipo === "capital" ? C.blue : p.tipo === "interes" ? C.amber : C.green;
            const pl = p.tipo === "capital" ? "Capital" : p.tipo === "interes" ? "Interés" : "Ambos";
            const cta = accounts.find((a) => a.id === p.cuentaOrigen);
            return (
              <Card key={p.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500 }}>{fmtD(p.fecha)}{p.nota ? ` · ${p.nota}` : ""}</p>
                    <p style={{ color: C.sec, fontSize: 12, marginTop: 2 }}>{p.tipo === "interes" ? "Solo interés" : p.tipo === "capital" ? "Solo capital" : "Capital + Interés"}</p>
                    {cta && <p style={{ color: C.blue, fontSize: 11, marginTop: 2 }}>💳 {cta.nombre}</p>}
                    {p.tipo === "ambos" && <p style={{ color: C.ter, fontSize: 11 }}>Cap: {fmt(p.aCapital)} · Int: {fmt(p.aInteres)}</p>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ color: C.green, fontWeight: 700, ...SORA }}>{fmt(p.monto)}</p>
                    <Badge label={pl} color={pc} />
                  </div>
                </div>
              </Card>
            );
          })
        )}

        {payModal && (() => {
          const esPuente = loan.tipoPuente && loan.fuenteNombre;
          const interesAcreedor = parseFloat(pf.puenteInteresAcreedor) || 0;
          const montoTotal = pf.tipo === "ambos"
            ? (parseFloat(pf.aCapital) || 0) + (parseFloat(pf.aInteres) || 0)
            : parseFloat(pf.monto) || 0;
          const aI_val = pf.tipo === "ambos" ? (parseFloat(pf.aInteres) || 0) : (pf.tipo === "interes" ? montoTotal : 0);
          const aK_val = pf.tipo === "ambos" ? (parseFloat(pf.aCapital) || 0) : (pf.tipo === "capital" ? montoTotal : 0);
          const miInteres = pf.tipo !== "capital" ? Math.max(0, aI_val - interesAcreedor) : 0;
          const miTotal = esPuente
            ? (pf.tipo === "interes" ? miInteres : pf.tipo === "capital" ? aK_val : aK_val + miInteres)
            : montoTotal;

          return (
            <Modal title="Registrar abono" onClose={() => setPayModal(false)}>
              <InfoBox>
                <p style={{ color: C.sec }}>Capital pendiente: <b style={{ color: C.text }}>{fmt(c.capPend)}</b></p>
                <p style={{ color: C.sec }}>Interés pendiente: <b style={{ color: C.amber }}>{fmt(c.intAcum)}</b></p>
                {esPuente && <p style={{ color: C.purple, fontSize: 12, marginTop: 4 }}>🌉 Puente con {loan.fuenteNombre} · {loan.fuenteTasa}%/mes</p>}
              </InfoBox>

              <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 6 }}>Tipo de abono</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {[{ id: "interes", label: "Solo interés" }, { id: "capital", label: "Solo capital" }, { id: "ambos", label: "Capital + Interés" }].map((t) => (
                  <button key={t.id} onClick={() => setPf((x) => ({ ...x, tipo: t.id }))} style={{ flex: 1, padding: "9px 4px", borderRadius: 8, border: "none", cursor: "pointer", ...DM, background: pf.tipo === t.id ? C.green : C.surf2, color: pf.tipo === t.id ? "#0D1B2A" : C.sec, fontSize: 11, fontWeight: 700 }}>{t.label}</button>
                ))}
              </div>

              {/* ── Campos según tipo ── */}
              {pf.tipo !== "ambos" ? (
                <Inp
                  label={esPuente ? `Total que te pagó ${loan.nombre}` : "Monto del abono"}
                  type="number" placeholder="0"
                  value={pf.monto}
                  onChange={(e) => setPf((x) => ({ ...x, monto: e.target.value }))}
                />
              ) : (
                <>
                  <Inp label={esPuente ? `Capital que te pagó ${loan.nombre}` : "Monto a capital"} type="number" placeholder="0" value={pf.aCapital} onChange={(e) => setPf((x) => ({ ...x, aCapital: e.target.value }))} />
                  <Inp label={esPuente ? `Interés total que te pagó ${loan.nombre}` : "Monto a interés"} type="number" placeholder="0" value={pf.aInteres} onChange={(e) => setPf((x) => ({ ...x, aInteres: e.target.value }))} />
                  {!esPuente && (pf.aCapital || pf.aInteres) && (
                    <p style={{ color: C.sec, fontSize: 13, marginBottom: 12 }}>Total: <b style={{ color: C.green }}>{fmt(aK_val + aI_val)}</b></p>
                  )}
                </>
              )}

              {/* ── Desglose puente ── */}
              {esPuente && pf.tipo !== "capital" && (
                <div style={{ background: `${C.purple}14`, border: `0.5px solid ${C.purple}44`, borderRadius: 12, padding: "14px 14px 8px", marginBottom: 14 }}>
                  <p style={{ color: C.purple, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>🌉 DESGLOSE INTERÉS PUENTE</p>
                  <Inp
                    label={`Para ${loan.fuenteNombre} (${loan.fuenteTasa}%/mes · editable)`}
                    type="number" placeholder="0"
                    value={pf.puenteInteresAcreedor}
                    onChange={(e) => setPf((x) => ({ ...x, puenteInteresAcreedor: e.target.value }))}
                  />
                  <div style={{ background: C.surf2, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.sec, fontSize: 13 }}>Interés total recibido</span>
                      <span style={{ fontWeight: 700 }}>{fmt(aI_val)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.sec, fontSize: 13 }}>Para {loan.fuenteNombre}</span>
                      <span style={{ color: C.red, fontWeight: 700 }}>− {fmt(interesAcreedor)}</span>
                    </div>
                    <div style={{ height: 0.5, background: C.border, margin: "6px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Tu interés neto</span>
                      <span style={{ color: C.green, fontWeight: 700, fontSize: 15 }}>{fmt(miInteres)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Resumen: cuánto entra a mi cuenta ── */}
              {esPuente && montoTotal > 0 && (
                <div style={{ background: `${C.green}14`, border: `0.5px solid ${C.green}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>✅ Entra a tu cuenta</span>
                    <span style={{ color: C.green, fontWeight: 700, fontSize: 18, ...SORA }}>{fmt(miTotal)}</span>
                  </div>
                </div>
              )}

              <Inp label="Fecha" type="date" value={pf.fecha} onChange={(e) => setPf((x) => ({ ...x, fecha: e.target.value }))} />
              <Inp label="Nota (opcional)" placeholder="Ej: Cuota de junio" value={pf.nota} onChange={(e) => setPf((x) => ({ ...x, nota: e.target.value }))} />

              {accounts.length > 0 && (
                <Sel label="¿A qué cuenta entra este abono?" value={pf.cuentaOrigen} onChange={(e) => setPf((x) => ({ ...x, cuentaOrigen: e.target.value }))}>
                  <option value="">— Sin especificar —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{ACCOUNT_ICONS[a.tipo]} {a.nombre}</option>)}
                </Sel>
              )}

              <PrimaryBtn onClick={addPago} style={{ width: "100%" }}>Registrar abono</PrimaryBtn>
            </Modal>
          );
        })()}

        {addModal && (
          <Modal title={editLoan ? "Editar préstamo" : "Nuevo préstamo"} onClose={() => { setAddModal(false); setEditLoan(null); setLf(emptyLf); }}>
            <Inp label="Nombre del deudor *" placeholder="¿A quién le prestaste?" value={lf.nombre} onChange={(e) => setLf((x) => ({ ...x, nombre: e.target.value }))} />
            <Inp label="Teléfono (opcional)" type="tel" placeholder="3001234567" value={lf.telefono} onChange={(e) => setLf((x) => ({ ...x, telefono: e.target.value }))} />
            <Inp label="Capital prestado *" type="number" placeholder="0" value={lf.capitalOriginal} onChange={(e) => setLf((x) => ({ ...x, capitalOriginal: e.target.value }))} />
            <Inp label="Tasa de interés mensual (%)" type="number" placeholder="0 si es sin interés" value={lf.tasaMensual} onChange={(e) => setLf((x) => ({ ...x, tasaMensual: e.target.value }))} />
            <Inp label="Fecha del préstamo" type="date" value={lf.fechaInicio} onChange={(e) => setLf((x) => ({ ...x, fechaInicio: e.target.value }))} />
            <Inp label="Fecha de vencimiento" type="date" value={lf.fechaVencimiento} onChange={(e) => setLf((x) => ({ ...x, fechaVencimiento: e.target.value }))} />
            <Sel label="Tipo de deudor" value={lf.categoria} onChange={(e) => setLf((x) => ({ ...x, categoria: e.target.value }))}>
              {["Familiar", "Amigo", "Cliente", "Conocido"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Sel>
            {accounts.length > 0 && (
              <Sel label="¿De qué cuenta salió el dinero?" value={lf.cuentaOrigen} onChange={(e) => setLf((x) => ({ ...x, cuentaOrigen: e.target.value }))}>
                <option value="">— Sin especificar —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{ACCOUNT_ICONS[a.tipo]} {a.nombre}</option>)}
              </Sel>
            )}
            <Inp label="Notas privadas (opcional)" placeholder="Contexto del préstamo..." value={lf.notas} onChange={(e) => setLf((x) => ({ ...x, notas: e.target.value }))} />

            {/* ── Tipo Puente ── */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 4 }}>
                <input type="checkbox" checked={lf.tipoPuente} onChange={(e) => setLf((x) => ({ ...x, tipoPuente: e.target.checked, fuenteNombre: "", fuenteTasa: "" }))} style={{ width: 18, height: 18, accentColor: C.purple }} />
                <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>🌉 Préstamo tipo puente</span>
              </label>
              <p style={{ fontSize: 12, color: C.sec, marginLeft: 28 }}>Prestas dinero que otra persona te prestó a ti.</p>
            </div>
            {lf.tipoPuente && (
              <div style={{ background: `${C.purple}14`, border: `0.5px solid ${C.purple}44`, borderRadius: 12, padding: "14px 14px 8px", marginBottom: 14 }}>
                <p style={{ color: C.purple, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>¿QUIÉN TE PRESTÓ EL DINERO A TI?</p>
                <Inp label="Nombre del acreedor (quien te prestó)" placeholder="Ej: Mi novia, Banco, Familiar..." value={lf.fuenteNombre} onChange={(e) => setLf((x) => ({ ...x, fuenteNombre: e.target.value }))} />
                <Inp label="Tasa que te cobran a ti (%/mes)" type="number" placeholder="Ej: 6" value={lf.fuenteTasa} onChange={(e) => setLf((x) => ({ ...x, fuenteTasa: e.target.value }))} />
                {lf.fuenteTasa && lf.tasaMensual && (() => {
                  const dif = (parseFloat(lf.tasaMensual) || 0) - (parseFloat(lf.fuenteTasa) || 0);
                  const capital = parseFloat(lf.capitalOriginal) || 0;
                  return (
                    <div style={{ background: C.surf2, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                      <p style={{ color: C.sec, fontSize: 11, marginBottom: 10, letterSpacing: 0.5 }}>RESUMEN DEL PUENTE</p>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: C.sec, fontSize: 13 }}>Pagas a {lf.fuenteNombre || "acreedor"}</span>
                        <span style={{ color: C.red, fontWeight: 700 }}>{lf.fuenteTasa}%/mes</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: C.sec, fontSize: 13 }}>Cobras a {lf.nombre || "deudor"}</span>
                        <span style={{ color: C.green, fontWeight: 700 }}>{lf.tasaMensual}%/mes</span>
                      </div>
                      <div style={{ height: 0.5, background: C.border, margin: "8px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Tu ganancia neta</span>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: dif >= 0 ? C.green : C.red, fontWeight: 700, fontSize: 15 }}>{dif >= 0 ? "+" : ""}{dif.toFixed(2)}%/mes</span>
                          {capital > 0 && <p style={{ color: dif >= 0 ? C.green : C.red, fontSize: 12 }}>{fmt(capital * (dif / 100))}/mes</p>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <PrimaryBtn onClick={saveLoan} style={{ width: "100%" }}>{editLoan ? "Guardar cambios" : "Crear préstamo"}</PrimaryBtn>
          </Modal>
        )}
        {reciboData && (
          <ReciboOverlay
            loan={reciboData.loan}
            pago={reciboData.pago}
            cuentaNombre={reciboData.cuentaNombre}
            recordatorio={reciboData.recordatorio || null}
            onClose={() => setReciboData(null)}
          />
        )}
      </div>
    );
  }

  /* ── LISTA ── */
  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>Préstamos</p>
        <PrimaryBtn onClick={() => { setEditLoan(null); setLf(emptyLf); setAddModal(true); }} style={{ padding: "8px 16px", fontSize: 13 }}>+ Nuevo</PrimaryBtn>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ color: C.sec, fontSize: 11, marginBottom: 10, letterSpacing: 0.8 }}>TOTAL POR RECUPERAR</p>
        <p style={{ ...SORA, fontSize: 30, fontWeight: 700, color: C.amber, marginBottom: 10 }}>{fmt(totCapital + totInteres)}</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[{ l: "Capital", v: totCapital, c: C.red }, { l: "Interés acum.", v: totInteres, c: C.amber }, { l: "Activos", v: `${activos.length}`, c: C.text }].map((x) => (
            <div key={x.l}>
              <p style={{ color: C.sec, fontSize: 11 }}>{x.l}</p>
              <p style={{ color: x.c, fontWeight: 700, ...SORA, fontSize: 14 }}>{x.l === "Activos" ? x.v + " préstamos" : fmt(x.v)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {[{ id: "todos", l: "Todos" }, { id: "activos", l: "Al día" }, { id: "vencidos", l: "🚨 Vencidos" }, { id: "pagados", l: "✅ Pagados" }].map((fi) => (
          <button key={fi.id} onClick={() => setFilter(fi.id)} style={{ background: filter === fi.id ? C.green : C.surf, color: filter === fi.id ? "#0D1B2A" : C.sec, border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", ...DM }}>{fi.l}</button>
        ))}
      </div>

      {loans.length === 0 ? (
        <Card><p style={{ textAlign: "center", color: C.sec }}>Sin préstamos aquí</p></Card>
      ) : (
        loans.map((loan) => {
          const c = calcL(loan);
          const sc = c.isPag ? C.green : c.isVen ? C.red : c.dias <= 7 ? C.amber : C.green;
          const sl = c.isPag ? "Pagado" : c.isVen ? `Vencido ${Math.abs(c.dias)}d` : `Vence ${c.dias}d`;
          const pPct = Math.round((c.capPag / loan.capitalOriginal) * 100) || 0;
          return (
            <Card key={loan.id} style={{ marginBottom: 10 }} onClick={() => setDetail(loan.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>{loan.nombre}</p>
                  <p style={{ color: C.sec, fontSize: 12 }}>{loan.categoria} · {loan.tasaMensual}% mensual{loan.tipoPuente ? " · 🌉 Puente" : ""}</p>
                </div>
                <Badge label={sl} color={sc} />
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                {[{ l: "Capital", v: c.capPend, c: C.red }, { l: "Interés acum.", v: c.intAcum, c: C.amber }, { l: "Total", v: c.total, c: C.text }].map((x) => (
                  <div key={x.l}>
                    <p style={{ color: C.sec, fontSize: 11 }}>{x.l}</p>
                    <p style={{ color: x.c, fontWeight: 700, ...SORA, fontSize: 14 }}>{fmt(x.v)}</p>
                  </div>
                ))}
              </div>
              <ProgBar value={c.capPag} max={loan.capitalOriginal} color={C.green} h={5} />
              <p style={{ color: C.ter, fontSize: 11, marginTop: 4 }}>{pPct}% del capital recuperado</p>
            </Card>
          );
        })
      )}

      {addModal && (
        <Modal title={editLoan ? "Editar préstamo" : "Nuevo préstamo"} onClose={() => { setAddModal(false); setEditLoan(null); setLf(emptyLf); }}>
          <Inp label="Nombre del deudor *" placeholder="¿A quién le prestaste?" value={lf.nombre} onChange={(e) => setLf((x) => ({ ...x, nombre: e.target.value }))} />
          <Inp label="Teléfono (opcional)" type="tel" placeholder="3001234567" value={lf.telefono} onChange={(e) => setLf((x) => ({ ...x, telefono: e.target.value }))} />
          <Inp label="Capital prestado *" type="number" placeholder="0" value={lf.capitalOriginal} onChange={(e) => setLf((x) => ({ ...x, capitalOriginal: e.target.value }))} />
          <Inp label="Tasa de interés mensual (%)" type="number" placeholder="0 si es sin interés" value={lf.tasaMensual} onChange={(e) => setLf((x) => ({ ...x, tasaMensual: e.target.value }))} />
          <Inp label="Fecha del préstamo" type="date" value={lf.fechaInicio} onChange={(e) => setLf((x) => ({ ...x, fechaInicio: e.target.value }))} />
          <Inp label="Fecha de vencimiento" type="date" value={lf.fechaVencimiento} onChange={(e) => setLf((x) => ({ ...x, fechaVencimiento: e.target.value }))} />
          <Sel label="Tipo de deudor" value={lf.categoria} onChange={(e) => setLf((x) => ({ ...x, categoria: e.target.value }))}>
            {["Familiar", "Amigo", "Cliente", "Conocido"].map((c) => <option key={c} value={c}>{c}</option>)}
          </Sel>
          {accounts.length > 0 && (
            <Sel label="¿De qué cuenta salió el dinero?" value={lf.cuentaOrigen} onChange={(e) => setLf((x) => ({ ...x, cuentaOrigen: e.target.value }))}>
              <option value="">— Sin especificar —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{ACCOUNT_ICONS[a.tipo]} {a.nombre}</option>)}
            </Sel>
          )}
          <Inp label="Notas privadas (opcional)" placeholder="Contexto del préstamo..." value={lf.notas} onChange={(e) => setLf((x) => ({ ...x, notas: e.target.value }))} />

          {/* ── Tipo Puente ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 4 }}>
              <input type="checkbox" checked={lf.tipoPuente} onChange={(e) => setLf((x) => ({ ...x, tipoPuente: e.target.checked, fuenteNombre: "", fuenteTasa: "" }))} style={{ width: 18, height: 18, accentColor: C.purple }} />
              <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>🌉 Préstamo tipo puente</span>
            </label>
            <p style={{ fontSize: 12, color: C.sec, marginLeft: 28 }}>Prestas dinero que otra persona te prestó a ti.</p>
          </div>

          {lf.tipoPuente && (
            <div style={{ background: `${C.purple}14`, border: `0.5px solid ${C.purple}44`, borderRadius: 12, padding: "14px 14px 8px", marginBottom: 14 }}>
              <p style={{ color: C.purple, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>¿QUIÉN TE PRESTÓ EL DINERO A TI?</p>
              <Inp label="Nombre del acreedor (quien te prestó)" placeholder="Ej: Mi novia, Banco, Familiar..." value={lf.fuenteNombre} onChange={(e) => setLf((x) => ({ ...x, fuenteNombre: e.target.value }))} />
              <Inp label="Tasa que te cobran a ti (%/mes)" type="number" placeholder="Ej: 6" value={lf.fuenteTasa} onChange={(e) => setLf((x) => ({ ...x, fuenteTasa: e.target.value }))} />
              {lf.fuenteTasa && lf.tasaMensual && (() => {
                const dif = (parseFloat(lf.tasaMensual) || 0) - (parseFloat(lf.fuenteTasa) || 0);
                const capital = parseFloat(lf.capitalOriginal) || 0;
                return (
                  <div style={{ background: C.surf2, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <p style={{ color: C.sec, fontSize: 11, marginBottom: 10, letterSpacing: 0.5 }}>RESUMEN DEL PUENTE</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.sec, fontSize: 13 }}>Pagas a {lf.fuenteNombre || "acreedor"}</span>
                      <span style={{ color: C.red, fontWeight: 700 }}>{lf.fuenteTasa}%/mes</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.sec, fontSize: 13 }}>Cobras a {lf.nombre || "deudor"}</span>
                      <span style={{ color: C.green, fontWeight: 700 }}>{lf.tasaMensual}%/mes</span>
                    </div>
                    <div style={{ height: 0.5, background: C.border, margin: "8px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Tu ganancia neta</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: dif >= 0 ? C.green : C.red, fontWeight: 700, fontSize: 15 }}>{dif >= 0 ? "+" : ""}{dif.toFixed(2)}%/mes</span>
                        {capital > 0 && <p style={{ color: dif >= 0 ? C.green : C.red, fontSize: 12 }}>{fmt(capital * (dif / 100))}/mes</p>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <PrimaryBtn onClick={saveLoan} style={{ width: "100%" }}>{editLoan ? "Guardar cambios" : "Crear préstamo"}</PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN: CUENTAS Y BILLETERAS
═══════════════════════════════════════ */
function Cuentas({ data, saveData }) {
  const [modal, setModal] = useState(false);
  const [editAcc, setEditAcc] = useState(null);
  const [transferModal, setTransferModal] = useState(false);
  const [subModal, setSubModal] = useState(null); // accId para gestionar bolsillos
  const [expandedAcc, setExpandedAcc] = useState({});
  const accounts = data.accounts || [];
  const emptyF = { nombre: "", tipo: "efectivo", saldo: "", color: C.green };
  const [f, setF] = useState(emptyF);
  const [tf, setTf] = useState({ origen: "", origenSub: "", destino: "", destinoSub: "", monto: "", nota: "" });
  const emptySf = { nombre: "", saldo: "", color: C.blue };
  const [sf, setSf] = useState(emptySf);
  const [editSub, setEditSub] = useState(null);

  const COLORS = [C.green, C.blue, C.amber, C.purple, C.red, "#F472B6", "#60E1FF"];

  // Saldo efectivo de una cuenta (suma bolsillos si los tiene)
  const accSaldo = (acc) => {
    const subs = acc.subcuentas || [];
    if (subs.length === 0) return acc.saldo;
    return subs.reduce((s, b) => s + b.saldo, 0);
  };

  const openEdit = (acc) => {
    setEditAcc(acc.id);
    setF({ nombre: acc.nombre, tipo: acc.tipo, saldo: String(acc.saldo), color: acc.color });
    setModal(true);
  };

  const saveAcc = () => {
    if (!f.nombre) return;
    const saldo = parseFloat(String(f.saldo).replace(/[^0-9.]/g, "")) || 0;
    if (editAcc) {
      const acc = accounts.find(a => a.id === editAcc);
      const hasSubs = (acc?.subcuentas || []).length > 0;
      saveData({ ...data, accounts: accounts.map((a) => a.id === editAcc ? { ...a, ...f, saldo: hasSubs ? accSaldo(a) : saldo } : a) });
    } else {
      saveData({ ...data, accounts: [...accounts, { ...f, id: uid(), saldo, subcuentas: [] }] });
    }
    setModal(false);
    setEditAcc(null);
    setF(emptyF);
  };

  const deleteAcc = (id) => saveData({ ...data, accounts: accounts.filter((a) => a.id !== id) });

  // ── Bolsillos ──
  const openSubModal = (accId) => {
    setSf(emptySf);
    setEditSub(null);
    setSubModal(accId);
  };

  const openEditSub = (sub) => {
    setEditSub(sub.id);
    setSf({ nombre: sub.nombre, saldo: String(sub.saldo), color: sub.color });
  };

  const saveSub = () => {
    if (!sf.nombre) return;
    const saldo = parseFloat(String(sf.saldo).replace(/[^0-9.]/g, "")) || 0;
    const acc = accounts.find(a => a.id === subModal);
    if (!acc) return;
    let newSubs;
    if (editSub) {
      newSubs = (acc.subcuentas || []).map(s => s.id === editSub ? { ...s, nombre: sf.nombre, saldo, color: sf.color } : s);
    } else {
      newSubs = [...(acc.subcuentas || []), { id: uid(), nombre: sf.nombre, saldo, color: sf.color }];
    }
    const newSaldo = newSubs.reduce((s, b) => s + b.saldo, 0);
    saveData({ ...data, accounts: accounts.map(a => a.id === subModal ? { ...a, subcuentas: newSubs, saldo: newSaldo } : a) });
    setSf(emptySf);
    setEditSub(null);
  };

  const deleteSub = (subId) => {
    const acc = accounts.find(a => a.id === subModal);
    if (!acc) return;
    const newSubs = (acc.subcuentas || []).filter(s => s.id !== subId);
    const newSaldo = newSubs.reduce((s, b) => s + b.saldo, 0);
    saveData({ ...data, accounts: accounts.map(a => a.id === subModal ? { ...a, subcuentas: newSubs, saldo: newSaldo } : a) });
  };

  // ── Transferencias (soporta bolsillos) ──
  // Construir lista plana de "cuentas destino" incluyendo bolsillos
  const transferTargets = [];
  accounts.forEach(a => {
    const subs = a.subcuentas || [];
    if (subs.length > 0) {
      subs.forEach(s => transferTargets.push({ label: `${ACCOUNT_ICONS[a.tipo]} ${a.nombre} › ${s.nombre}`, accId: a.id, subId: s.id, saldo: s.saldo }));
    } else {
      transferTargets.push({ label: `${ACCOUNT_ICONS[a.tipo]} ${a.nombre}`, accId: a.id, subId: null, saldo: a.saldo });
    }
  });

  const doTransfer = () => {
    const monto = parseFloat(tf.monto) || 0;
    if (!monto) return;
    const origenKey = tf.origen;
    const destinoKey = tf.destino;
    if (origenKey === destinoKey) return;
    const origen = transferTargets.find(t => `${t.accId}:${t.subId}` === origenKey);
    const destino = transferTargets.find(t => `${t.accId}:${t.subId}` === destinoKey);
    if (!origen || !destino) return;

    const updated = accounts.map(a => {
      let newA = { ...a, subcuentas: [...(a.subcuentas || [])] };
      // origen
      if (a.id === origen.accId) {
        if (origen.subId) {
          newA.subcuentas = newA.subcuentas.map(s => s.id === origen.subId ? { ...s, saldo: s.saldo - monto } : s);
          newA.saldo = newA.subcuentas.reduce((s, b) => s + b.saldo, 0);
        } else {
          newA.saldo = newA.saldo - monto;
        }
      }
      // destino
      if (a.id === destino.accId) {
        if (destino.subId) {
          newA.subcuentas = newA.subcuentas.map(s => s.id === destino.subId ? { ...s, saldo: s.saldo + monto } : s);
          newA.saldo = newA.subcuentas.reduce((s, b) => s + b.saldo, 0);
        } else {
          newA.saldo = newA.saldo + monto;
        }
      }
      return newA;
    });
    saveData({ ...data, accounts: updated });
    setTransferModal(false);
    setTf({ origen: "", destino: "", monto: "", nota: "" });
  };

  const total = accounts.reduce((s, a) => s + accSaldo(a), 0);

  const subModalAcc = accounts.find(a => a.id === subModal);

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>Mis Cuentas</p>
        <div style={{ display: "flex", gap: 8 }}>
          {transferTargets.length >= 2 && (
            <PrimaryBtn onClick={() => { setTf({ origen: `${transferTargets[0].accId}:${transferTargets[0].subId}`, destino: `${transferTargets[1].accId}:${transferTargets[1].subId}`, monto: "", nota: "" }); setTransferModal(true); }} color={C.blue} style={{ padding: "8px 12px", fontSize: 12 }}>⇄ Transferir</PrimaryBtn>
          )}
          <PrimaryBtn onClick={() => { setEditAcc(null); setF(emptyF); setModal(true); }} style={{ padding: "8px 12px", fontSize: 12 }}>+ Nueva</PrimaryBtn>
        </div>
      </div>

      {/* Total general */}
      <div style={{ background: "linear-gradient(135deg,#0F3460,#1B4F72)", borderRadius: 20, padding: 20, marginBottom: 16, border: `1px solid rgba(74,159,255,.2)` }}>
        <p style={{ color: C.sec, fontSize: 11, marginBottom: 6, letterSpacing: 0.8 }}>TOTAL EN TODAS LAS CUENTAS</p>
        <p style={{ fontSize: 34, fontWeight: 700, ...SORA, color: C.blue }}>{fmt(total)}</p>
      </div>

      {accounts.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "36px 20px" }}>
          <p style={{ fontSize: 36, marginBottom: 10 }}>🏦</p>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Sin cuentas aún</p>
          <p style={{ color: C.sec, fontSize: 14 }}>Agrega tu efectivo, bancos y tarjetas</p>
        </Card>
      ) : (
        accounts.map((acc) => {
          const subs = acc.subcuentas || [];
          const realSaldo = accSaldo(acc);
          const isExpanded = expandedAcc[acc.id];
          return (
            <div key={acc.id} style={{ marginBottom: 10 }}>
              <Card style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 46, height: 46, background: `${acc.color}22`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{ACCOUNT_ICONS[acc.tipo]}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: 15 }}>{acc.nombre}</p>
                    <p style={{ color: C.sec, fontSize: 12 }}>{ACCOUNT_LABELS[acc.tipo]}{subs.length > 0 ? ` · ${subs.length} bolsillos` : ""}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ ...SORA, fontWeight: 700, fontSize: 18, color: realSaldo >= 0 ? acc.color : C.red }}>{fmt(realSaldo)}</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4, alignItems: "center" }}>
                      {subs.length > 0 && (
                        <button onClick={() => setExpandedAcc(x => ({ ...x, [acc.id]: !x[acc.id] }))} style={{ background: "none", border: "none", color: C.sec, cursor: "pointer", fontSize: 13, padding: 0 }}>{isExpanded ? "▲" : "▼"}</button>
                      )}
                      <button onClick={() => openSubModal(acc.id)} style={{ background: `${C.purple}22`, border: "none", color: C.purple, cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 8, fontWeight: 700, ...DM }}>bolsillos</button>
                      <button onClick={() => openEdit(acc)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 14, padding: 0 }}>✏️</button>
                      <button onClick={() => deleteAcc(acc.id)} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 14, padding: 0 }}>🗑</button>
                    </div>
                  </div>
                </div>

                {/* Bolsillos expandidos */}
                {isExpanded && subs.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: `0.5px solid ${C.border}`, paddingTop: 12 }}>
                    {subs.map((s, i) => {
                      const pct = realSaldo > 0 ? Math.round((s.saldo / realSaldo) * 100) : 0;
                      return (
                        <div key={s.id} style={{ marginBottom: i < subs.length - 1 ? 10 : 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                            <div style={{ width: 28, height: 28, background: `${s.color}22`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👜</div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600 }}>{s.nombre}</p>
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: s.color, ...SORA }}>{fmt(s.saldo)}</p>
                            <span style={{ fontSize: 11, color: C.sec, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                          </div>
                          <ProgBar value={s.saldo} max={realSaldo} color={s.color} h={4} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          );
        })
      )}

      {/* Distribución */}
      {accounts.length > 1 && (
        <Card style={{ marginTop: 8 }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Distribución del dinero</p>
          {accounts.map((acc) => {
            const realSaldo = accSaldo(acc);
            const pct = total > 0 ? Math.round((realSaldo / total) * 100) : 0;
            return (
              <div key={acc.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>{ACCOUNT_ICONS[acc.tipo]} {acc.nombre}</span>
                  <span style={{ fontSize: 13, color: acc.color, fontWeight: 700 }}>{pct}% · {fmt(realSaldo)}</span>
                </div>
                <ProgBar value={realSaldo} max={total} color={acc.color} h={6} />
              </div>
            );
          })}
        </Card>
      )}

      {/* Modal cuenta */}
      {modal && (
        <Modal title={editAcc ? "Editar cuenta" : "Nueva cuenta"} onClose={() => { setModal(false); setEditAcc(null); setF(emptyF); }}>
          <Inp label="Nombre de la cuenta *" placeholder="Ej: Bancolombia, Efectivo..." value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} />
          <Sel label="Tipo" value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
            <option value="efectivo">💵 Efectivo</option>
            <option value="banco">🏦 Cuenta bancaria</option>
            <option value="tarjeta_debito">💳 Tarjeta débito</option>
            <option value="tarjeta_credito">💳 Tarjeta crédito</option>
          </Sel>
          {(() => { const acc = accounts.find(a => a.id === editAcc); return (acc?.subcuentas || []).length > 0; })() ? (
            <InfoBox><p style={{ color: C.sec }}>El saldo se calcula automáticamente desde los bolsillos.</p></InfoBox>
          ) : (
            <Inp label="Saldo actual" type="number" placeholder="0" value={f.saldo} onChange={(e) => setF((x) => ({ ...x, saldo: e.target.value }))} />
          )}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 8 }}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((col) => (
                <div key={col} onClick={() => setF((x) => ({ ...x, color: col }))} style={{ width: 30, height: 30, borderRadius: 99, background: col, cursor: "pointer", border: f.color === col ? "3px solid #fff" : "3px solid transparent", transition: "border .2s" }} />
              ))}
            </div>
          </div>
          <PrimaryBtn onClick={saveAcc} style={{ width: "100%" }}>{editAcc ? "Guardar cambios" : "Crear cuenta"}</PrimaryBtn>
        </Modal>
      )}

      {/* Modal transferencia */}
      {transferModal && (
        <Modal title="Transferencia" onClose={() => setTransferModal(false)}>
          <InfoBox><p style={{ color: C.sec }}>Mueve saldo entre cuentas o bolsillos. No se registra como gasto ni ingreso.</p></InfoBox>
          <Sel label="Origen" value={tf.origen} onChange={(e) => setTf((x) => ({ ...x, origen: e.target.value }))}>
            {transferTargets.map((t) => <option key={`${t.accId}:${t.subId}`} value={`${t.accId}:${t.subId}`}>{t.label} — {fmt(t.saldo)}</option>)}
          </Sel>
          <Sel label="Destino" value={tf.destino} onChange={(e) => setTf((x) => ({ ...x, destino: e.target.value }))}>
            {transferTargets.map((t) => <option key={`${t.accId}:${t.subId}`} value={`${t.accId}:${t.subId}`}>{t.label} — {fmt(t.saldo)}</option>)}
          </Sel>
          <Inp label="Monto a transferir" type="number" placeholder="0" value={tf.monto} onChange={(e) => setTf((x) => ({ ...x, monto: e.target.value }))} />
          <Inp label="Nota (opcional)" placeholder="Ej: Mover al bolsillo de gastos" value={tf.nota} onChange={(e) => setTf((x) => ({ ...x, nota: e.target.value }))} />
          <PrimaryBtn onClick={doTransfer} style={{ width: "100%" }}>Transferir</PrimaryBtn>
        </Modal>
      )}

      {/* Modal bolsillos */}
      {subModal && subModalAcc && (
        <Modal title={`Bolsillos · ${subModalAcc.nombre}`} onClose={() => { setSubModal(null); setSf(emptySf); setEditSub(null); }}>
          <InfoBox>
            <p style={{ color: C.sec }}>Los bolsillos dividen el saldo de <strong style={{ color: C.text }}>{subModalAcc.nombre}</strong>. El total de la cuenta será la suma de todos los bolsillos.</p>
          </InfoBox>

          {/* Lista de bolsillos existentes */}
          {(subModalAcc.subcuentas || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {(subModalAcc.subcuentas || []).map((s) => (
                <div key={s.id} style={{ background: C.surf2, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{s.nombre}</p>
                    <p style={{ fontSize: 12, color: s.color, fontWeight: 700, ...SORA }}>{fmt(s.saldo)}</p>
                  </div>
                  <button onClick={() => openEditSub(s)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 14, padding: 0 }}>✏️</button>
                  <button onClick={() => deleteSub(s.id)} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 14, padding: 0 }}>🗑</button>
                </div>
              ))}
            </div>
          )}

          <Divider />
          <p style={{ fontSize: 13, fontWeight: 700, color: C.sec, marginBottom: 12 }}>{editSub ? "EDITAR BOLSILLO" : "NUEVO BOLSILLO"}</p>
          <Inp label="Nombre del bolsillo *" placeholder="Ej: Bolsillo ahorro, Nómina, Gastos fijos..." value={sf.nombre} onChange={(e) => setSf((x) => ({ ...x, nombre: e.target.value }))} />
          <Inp label="Saldo" type="number" placeholder="0" value={sf.saldo} onChange={(e) => setSf((x) => ({ ...x, saldo: e.target.value }))} />
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 8 }}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((col) => (
                <div key={col} onClick={() => setSf((x) => ({ ...x, color: col }))} style={{ width: 28, height: 28, borderRadius: 99, background: col, cursor: "pointer", border: sf.color === col ? "3px solid #fff" : "3px solid transparent", transition: "border .2s" }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {editSub && <PrimaryBtn onClick={() => { setEditSub(null); setSf(emptySf); }} outline color={C.sec} style={{ flex: 1 }}>Cancelar</PrimaryBtn>}
            <PrimaryBtn onClick={saveSub} style={{ flex: 1 }}>{editSub ? "Actualizar" : "Agregar bolsillo"}</PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN: PRESUPUESTO / ESTADÍSTICAS
═══════════════════════════════════════ */
function Presupuesto({ data, saveData }) {
  const [editModal, setEditModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [editVal, setEditVal] = useState("");
  const m = curMonth();
  const gastosM = data.transactions.filter((t) => t.tipo === "gasto" && t.fecha.startsWith(m));
  const catData = CATS.slice(0, 8).map((cat) => ({ ...cat, gastado: gastosM.filter((t) => t.categoria === cat.id).reduce((s, t) => s + t.monto, 0), presupuesto: data.budgets[cat.id] || 0 }));
  const pieData = catData.filter((c) => c.gastado > 0).map((c) => ({ name: c.label, value: c.gastado, color: c.color }));
  const barData = catData.filter((c) => c.presupuesto > 0).map((c) => ({ name: c.label.slice(0, 6), gastado: Math.round(c.gastado), presupuesto: Math.round(c.presupuesto) }));

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 16px" }}>
        <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>Estadísticas</p>
        <p style={{ color: C.sec, fontSize: 13 }}>{new Date().toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</p>
      </div>

      {pieData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Distribución de gastos</p>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" paddingAngle={3}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 12px" }}>
            {pieData.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.sec }}>{d.name}: {fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {barData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Presupuesto vs Real</p>
          <ResponsiveContainer width="100%" height={175}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.sec, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
              <Bar dataKey="presupuesto" fill={`${C.blue}66`} radius={[4, 4, 0, 0]} name="Presupuesto" />
              <Bar dataKey="gastado" fill={C.green} radius={[4, 4, 0, 0]} name="Gastado" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            {[{ c: `${C.blue}88`, l: "Presupuesto" }, { c: C.green, l: "Gastado" }].map((x) => (
              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: x.c, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.sec }}>{x.l}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p style={{ fontWeight: 700, marginBottom: 4 }}>Por categoría</p>
      <p style={{ color: C.sec, fontSize: 12, marginBottom: 12 }}>Toca para establecer tu límite mensual</p>
      {catData.map((cat) => {
        const pct = cat.presupuesto > 0 ? Math.min(100, Math.round((cat.gastado / cat.presupuesto) * 100)) : 0;
        const alc = pct >= 100 ? C.red : pct >= 80 ? C.amber : cat.color;
        return (
          <Card key={cat.id} style={{ marginBottom: 8, padding: "12px 14px" }} onClick={() => { setEditCat(cat.id); setEditVal(String(cat.presupuesto || "")); setEditModal(true); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: cat.presupuesto ? 8 : 0 }}>
              <span style={{ fontSize: 18 }}>{cat.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{cat.label}</span>
                  <span style={{ ...SORA, fontSize: 13 }}>
                    <span style={{ color: alc }}>{fmt(cat.gastado)}</span>
                    {cat.presupuesto > 0 && <span style={{ color: C.ter }}> / {fmt(cat.presupuesto)}</span>}
                  </span>
                </div>
                {!cat.presupuesto && <p style={{ color: C.ter, fontSize: 11, marginTop: 2 }}>Toca para fijar límite</p>}
              </div>
            </div>
            {cat.presupuesto > 0 && (
              <>
                <ProgBar value={cat.gastado} max={cat.presupuesto} color={cat.color} h={5} />
                {pct >= 80 && <p style={{ color: alc, fontSize: 11, marginTop: 4 }}>{pct >= 100 ? "🔴 ¡Límite superado!" : "🟡 Casi en el límite"} ({pct}%)</p>}
              </>
            )}
          </Card>
        );
      })}

      {editModal && (
        <Modal title={`Presupuesto · ${CATS.find((c) => c.id === editCat)?.label}`} onClose={() => setEditModal(false)}>
          <p style={{ color: C.sec, fontSize: 14, marginBottom: 16 }}>Límite de gasto mensual para esta categoría.</p>
          <Inp label="Monto límite" type="number" placeholder="0" value={editVal} onChange={(e) => setEditVal(e.target.value)} />
          <PrimaryBtn onClick={() => { saveData({ ...data, budgets: { ...data.budgets, [editCat]: parseFloat(editVal) || 0 } }); setEditModal(false); }} style={{ width: "100%" }}>Guardar presupuesto</PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SCREEN: METAS DE AHORRO
═══════════════════════════════════════ */
function Metas({ data, saveData }) {
  const [addModal, setAddModal] = useState(false);
  const [contribId, setContribId] = useState(null);
  const [contrib, setContrib] = useState("");
  const [f, setF] = useState({ nombre: "", montoMeta: "", montoActual: "", fechaLimite: "", plazo: "corto", color: C.green });
  const GOAL_COLORS = [C.green, C.blue, C.amber, C.purple, C.red, "#F472B6", "#60E1FF"];

  const addGoal = () => {
    if (!f.nombre || !f.montoMeta) return;
    const goal = { ...f, id: uid(), montoMeta: parseFloat(f.montoMeta) || 0, montoActual: parseFloat(f.montoActual) || 0 };
    saveData({ ...data, goals: [...data.goals, goal] });
    setAddModal(false);
    setF({ nombre: "", montoMeta: "", montoActual: "", fechaLimite: "", plazo: "corto", color: C.green });
  };

  const addContrib = (gid) => {
    const amt = parseFloat(contrib) || 0;
    if (!amt) return;
    const goals = data.goals.map((g) => g.id === gid ? { ...g, montoActual: Math.min(g.montoMeta, g.montoActual + amt) } : g);
    saveData({ ...data, goals });
    setContribId(null);
    setContrib("");
  };

  const GoalCard = ({ g }) => {
    const pct = Math.min(100, Math.round((g.montoActual / g.montoMeta) * 100));
    const dias = g.fechaLimite ? daysTo(g.fechaLimite) : null;
    const done = pct >= 100;
    return (
      <Card style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ width: 12, height: 12, borderRadius: 99, background: g.color, flexShrink: 0 }} />
            <p style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nombre}</p>
          </div>
          <button onClick={() => saveData({ ...data, goals: data.goals.filter((x) => x.id !== g.id) })} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 16, padding: 0, marginLeft: 8, flexShrink: 0 }}>✕</button>
        </div>
        {dias !== null && <p style={{ color: dias < 0 ? C.red : dias <= 30 ? C.amber : C.sec, fontSize: 12, marginBottom: 8 }}>{dias < 0 ? `Venció hace ${Math.abs(dias)} días` : `${dias} días restantes`}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: C.sec, fontSize: 13 }}>Ahorrado</span>
          <span style={{ ...SORA, fontWeight: 700 }}>
            <span style={{ color: g.color }}>{fmt(g.montoActual)}</span>
            <span style={{ color: C.ter }}> / {fmt(g.montoMeta)}</span>
          </span>
        </div>
        <ProgBar value={g.montoActual} max={g.montoMeta} color={g.color} h={10} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ color: C.sec, fontSize: 12 }}>{pct}% · Falta {fmt(g.montoMeta - g.montoActual)}</span>
          {!done ? (
            <button onClick={() => setContribId(g.id)} style={{ background: `${g.color}22`, color: g.color, border: "none", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", ...DM }}>+ Abonar</button>
          ) : (
            <Badge label="✅ Completada" color={C.green} />
          )}
        </div>
      </Card>
    );
  };

  const corto = data.goals.filter((g) => g.plazo === "corto");
  const largo = data.goals.filter((g) => g.plazo === "largo");

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ padding: "52px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>Metas de ahorro</p>
        <PrimaryBtn onClick={() => setAddModal(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Nueva</PrimaryBtn>
      </div>

      {data.goals.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[{ l: "Total ahorrado", v: data.goals.reduce((s, g) => s + g.montoActual, 0), c: C.green }, { l: "Por ahorrar", v: data.goals.reduce((s, g) => s + Math.max(0, g.montoMeta - g.montoActual), 0), c: C.amber }].map((x) => (
            <div key={x.l} style={{ flex: 1, background: C.surf, borderRadius: 14, padding: "12px 14px", border: `0.5px solid ${C.border}` }}>
              <p style={{ color: C.sec, fontSize: 11, marginBottom: 4 }}>{x.l}</p>
              <p style={{ color: x.c, fontWeight: 700, fontSize: 17, ...SORA }}>{fmt(x.v)}</p>
            </div>
          ))}
        </div>
      )}

      {data.goals.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "36px 20px" }}>
          <p style={{ fontSize: 36, marginBottom: 10 }}>🎯</p>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Sin metas aún</p>
          <p style={{ color: C.sec, fontSize: 14 }}>Define tu primer objetivo de ahorro</p>
        </Card>
      ) : (
        <>
          {corto.length > 0 && (<><p style={{ fontWeight: 700, color: C.sec, fontSize: 12, marginBottom: 10, letterSpacing: 0.8 }}>CORTO PLAZO</p>{corto.map((g) => <GoalCard key={g.id} g={g} />)}</>)}
          {largo.length > 0 && (<><p style={{ fontWeight: 700, color: C.sec, fontSize: 12, marginBottom: 10, marginTop: corto.length ? 14 : 0, letterSpacing: 0.8 }}>LARGO PLAZO</p>{largo.map((g) => <GoalCard key={g.id} g={g} />)}</>)}
        </>
      )}

      {addModal && (
        <Modal title="Nueva meta de ahorro" onClose={() => setAddModal(false)}>
          <Inp label="Nombre de la meta *" placeholder="Ej: Viaje, Celular, Fondo..." value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} />
          <Inp label="Monto objetivo *" type="number" placeholder="0" value={f.montoMeta} onChange={(e) => setF((x) => ({ ...x, montoMeta: e.target.value }))} />
          <Inp label="Ya tengo ahorrado" type="number" placeholder="0" value={f.montoActual} onChange={(e) => setF((x) => ({ ...x, montoActual: e.target.value }))} />
          <Inp label="Fecha límite (opcional)" type="date" value={f.fechaLimite} onChange={(e) => setF((x) => ({ ...x, fechaLimite: e.target.value }))} />
          <Sel label="Plazo" value={f.plazo} onChange={(e) => setF((x) => ({ ...x, plazo: e.target.value }))}>
            <option value="corto">Corto plazo (menos de 1 año)</option>
            <option value="largo">Largo plazo (más de 1 año)</option>
          </Sel>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 8 }}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {GOAL_COLORS.map((col) => (<div key={col} onClick={() => setF((x) => ({ ...x, color: col }))} style={{ width: 30, height: 30, borderRadius: 99, background: col, cursor: "pointer", border: f.color === col ? "3px solid #fff" : "3px solid transparent", transition: "border .2s" }} />))}
            </div>
          </div>
          <PrimaryBtn onClick={addGoal} style={{ width: "100%" }}>Crear meta</PrimaryBtn>
        </Modal>
      )}

      {contribId && (
        <Modal title="Abonar a meta" onClose={() => { setContribId(null); setContrib(""); }}>
          <p style={{ color: C.sec, fontSize: 14, marginBottom: 16 }}>¿Cuánto vas a abonar hoy?</p>
          <Inp label="Monto" type="number" placeholder="0" value={contrib} onChange={(e) => setContrib(e.target.value)} />
          <PrimaryBtn onClick={() => addContrib(contribId)} style={{ width: "100%" }}>Guardar abono</PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════
   SCREEN: MI TÍO
═══════════════════════════════════════ */
function generarReporteTio(tio, totales) {
  const { totalArriendos, totalCobradoPrestamos, totalGastos, totalEntregas, saldoPendiente } = totales;
  const fechaHoy = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const html = `
    <html><head><meta charset="utf-8"/>
    <style>
      body { font-family: Arial, sans-serif; color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px; }
      h1 { color: #0D1B2A; font-size: 22px; margin-bottom: 4px; }
      .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
      .section { margin-bottom: 20px; }
      .section-title { font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #888; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
      .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f5f5f5; }
      .row:last-child { border-bottom: none; }
      .label { color: #555; }
      .value { font-weight: 600; }
      .green { color: #00a875; }
      .red { color: #e53935; }
      .amber { color: #f57c00; }
      .total-box { background: #f8f9fa; border-radius: 10px; padding: 16px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
      .total-label { font-size: 14px; font-weight: 700; }
      .total-value { font-size: 24px; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f0f0f0; padding: 7px 10px; text-align: left; font-weight: 700; }
      td { padding: 6px 10px; border-bottom: 1px solid #f5f5f5; }
      .footer { margin-top: 30px; font-size: 11px; color: #aaa; text-align: center; }
    </style></head><body>
    <h1>Informe de Administración</h1>
    <p class="sub">${tio.nombre} · Generado el ${fechaHoy}</p>

    <div class="section">
      <div class="section-title">RESUMEN FINANCIERO</div>
      <div class="row"><span class="label">Arriendos recibidos</span><span class="value green">+$${totalArriendos.toLocaleString("es-CO")}</span></div>
      <div class="row"><span class="label">Cobros de préstamos</span><span class="value green">+$${totalCobradoPrestamos.toLocaleString("es-CO")}</span></div>
      <div class="row"><span class="label">Gastos pagados</span><span class="value red">-$${totalGastos.toLocaleString("es-CO")}</span></div>
      <div class="row"><span class="label">Ya entregado</span><span class="value amber">-$${totalEntregas.toLocaleString("es-CO")}</span></div>
    </div>

    <div class="total-box">
      <span class="total-label">Saldo pendiente por entregar</span>
      <span class="total-value ${saldoPendiente >= 0 ? "green" : "red"}">$${Math.abs(saldoPendiente).toLocaleString("es-CO")}</span>
    </div>

    ${tio.arriendos.length > 0 ? `
    <div class="section" style="margin-top:24px">
      <div class="section-title">ARRIENDOS RECIBIDOS</div>
      <table><tr><th>Inmueble</th><th>Descripción</th><th>Fecha</th><th>Monto</th></tr>
      ${tio.arriendos.map(a => `<tr><td>${a.inmueble}</td><td>${a.descripcion}</td><td>${a.fecha}</td><td>$${a.monto.toLocaleString("es-CO")}</td></tr>`).join("")}
      </table>
    </div>` : ""}

    ${tio.gastos.length > 0 ? `
    <div class="section">
      <div class="section-title">GASTOS PAGADOS</div>
      <table><tr><th>Descripción</th><th>Categoría</th><th>Fecha</th><th>Monto</th></tr>
      ${tio.gastos.map(g => `<tr><td>${g.descripcion}</td><td>${g.categoria}</td><td>${g.fecha}</td><td>$${g.monto.toLocaleString("es-CO")}</td></tr>`).join("")}
      </table>
    </div>` : ""}

    ${tio.entregas.length > 0 ? `
    <div class="section">
      <div class="section-title">ENTREGAS REALIZADAS</div>
      <table><tr><th>Fecha</th><th>Nota</th><th>Monto</th></tr>
      ${tio.entregas.map(e => `<tr><td>${e.fecha}</td><td>${e.nota || "—"}</td><td>$${e.monto.toLocaleString("es-CO")}</td></tr>`).join("")}
      </table>
    </div>` : ""}

    <div class="footer">Este reporte es de uso interno. MisCuentas App.</div>
    </body></html>`;
  return html;
}

function Tio({ data, saveData }) {
  const [subTab, setSubTab] = useState("resumen");
  const [prestDetail, setPrestDetail] = useState(null);
  const [addPrestModal, setAddPrestModal] = useState(false);
  const [editPrestId, setEditPrestId] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [addArriendoModal, setAddArriendoModal] = useState(false);
  const [editArriendoId, setEditArriendoId] = useState(null);
  const [addGastoModal, setAddGastoModal] = useState(false);
  const [editGastoId, setEditGastoId] = useState(null);
  const [addEntregaModal, setAddEntregaModal] = useState(false);
  const [reporteVisible, setReporteVisible] = useState(false);

  // Fecha inicial = primer día del mes actual
  const primerDiaMes = new Date(); primerDiaMes.setDate(1);
  const [reporteDesde, setReporteDesde] = useState(primerDiaMes.toISOString().slice(0, 10));
  const [reporteHasta, setReporteHasta] = useState(todayStr());

  const tio = data.tio || { nombre: "Mi Tío", prestamos: [], arriendos: [], gastos: [], entregas: [] };
  const saveTio = (newTio) => saveData({ ...data, tio: newTio });

  // ── Cálculos globales ──
  const totalArriendos = tio.arriendos.reduce((s, a) => s + a.monto, 0);
  const totalGastos = tio.gastos.reduce((s, g) => s + g.monto, 0);
  const totalEntregas = tio.entregas.reduce((s, e) => s + e.monto, 0);
  const totalCobradoPrestamos = tio.prestamos.reduce((s, l) => s + (l.pagos || []).reduce((ss, p) => ss + p.monto, 0), 0);
  const saldoPendiente = totalArriendos + totalCobradoPrestamos - totalGastos - totalEntregas;

  // ── Préstamos ──
  const emptyLf = { nombre: "", telefono: "", capitalOriginal: "", tasaMensual: "", fechaInicio: todayStr(), fechaVencimiento: "", notas: "" };
  const [lf, setLf] = useState(emptyLf);
  const [pf, setPf] = useState({ fecha: todayStr(), tipo: "interes", monto: "", aCapital: "", aInteres: "", nota: "" });

  const openEditPrest = (loan) => {
    setEditPrestId(loan.id);
    setLf({ nombre: loan.nombre, telefono: loan.telefono, capitalOriginal: String(loan.capitalOriginal), tasaMensual: String(loan.tasaMensual), fechaInicio: loan.fechaInicio, fechaVencimiento: loan.fechaVencimiento || "", notas: loan.notas });
    setAddPrestModal(true);
  };

  const savePrest = () => {
    if (!lf.nombre || !lf.capitalOriginal) return;
    const base = { ...lf, capitalOriginal: parseFloat(lf.capitalOriginal) || 0, tasaMensual: parseFloat(lf.tasaMensual) || 0 };
    let prestamos;
    if (editPrestId) {
      prestamos = tio.prestamos.map((l) => l.id === editPrestId ? { ...l, ...base } : l);
    } else {
      prestamos = [...tio.prestamos, { ...base, id: uid(), pagos: [], estado: "activo" }];
    }
    saveTio({ ...tio, prestamos });
    setAddPrestModal(false); setEditPrestId(null); setLf(emptyLf);
  };

  const addPagoTio = () => {
    const loan = tio.prestamos.find((l) => l.id === prestDetail);
    if (!loan) return;
    let aK = 0, aI = 0, total = 0;
    if (pf.tipo === "interes") { aI = parseFloat(pf.monto) || 0; total = aI; }
    else if (pf.tipo === "capital") { aK = parseFloat(pf.monto) || 0; total = aK; }
    else { aK = parseFloat(pf.aCapital) || 0; aI = parseFloat(pf.aInteres) || 0; total = aK + aI; }
    if (!total) return;
    const pago = { id: uid(), fecha: pf.fecha, tipo: pf.tipo, monto: total, aCapital: aK, aInteres: aI, nota: pf.nota };
    const newPagos = [...(loan.pagos || []), pago];
    const capPagTotal = newPagos.reduce((s, p) => s + p.aCapital, 0);
    const estado = capPagTotal >= loan.capitalOriginal ? "pagado" : loan.estado;
    saveTio({ ...tio, prestamos: tio.prestamos.map((l) => l.id === prestDetail ? { ...l, pagos: newPagos, estado } : l) });
    setPayModal(false);
    setPf({ fecha: todayStr(), tipo: "interes", monto: "", aCapital: "", aInteres: "", nota: "" });
  };

  // ── Arriendos ──
  const emptyAf = { inmueble: "", descripcion: "", monto: "", fecha: todayStr(), notas: "" };
  const [af, setAf] = useState(emptyAf);
  const openEditArriendo = (a) => { setEditArriendoId(a.id); setAf({ inmueble: a.inmueble, descripcion: a.descripcion, monto: String(a.monto), fecha: a.fecha, notas: a.notas }); setAddArriendoModal(true); };
  const saveArriendo = () => {
    if (!af.descripcion || !af.monto) return;
    const item = { ...af, monto: parseFloat(af.monto) || 0 };
    const arriendos = editArriendoId
      ? tio.arriendos.map((a) => a.id === editArriendoId ? { ...a, ...item } : a)
      : [...tio.arriendos, { ...item, id: uid() }];
    saveTio({ ...tio, arriendos });
    setAddArriendoModal(false); setEditArriendoId(null); setAf(emptyAf);
  };

  // ── Gastos ──
  const emptyGf = { descripcion: "", monto: "", fecha: todayStr(), categoria: "Servicios", notas: "" };
  const [gf, setGf] = useState(emptyGf);
  const openEditGasto = (g) => { setEditGastoId(g.id); setGf({ descripcion: g.descripcion, monto: String(g.monto), fecha: g.fecha, categoria: g.categoria, notas: g.notas }); setAddGastoModal(true); };
  const saveGasto = () => {
    if (!gf.descripcion || !gf.monto) return;
    const item = { ...gf, monto: parseFloat(gf.monto) || 0 };
    const gastos = editGastoId
      ? tio.gastos.map((g) => g.id === editGastoId ? { ...g, ...item } : g)
      : [...tio.gastos, { ...item, id: uid() }];
    saveTio({ ...tio, gastos });
    setAddGastoModal(false); setEditGastoId(null); setGf(emptyGf);
  };

  // ── Entregas ──
  const [ef, setEf] = useState({ monto: "", fecha: todayStr(), nota: "" });
  const saveEntrega = () => {
    const monto = parseFloat(ef.monto) || 0;
    if (!monto) return;
    saveTio({ ...tio, entregas: [...tio.entregas, { id: uid(), ...ef, monto }] });
    setAddEntregaModal(false); setEf({ monto: "", fecha: todayStr(), nota: "" });
  };

  // ── Vista detalle préstamo ──
  if (prestDetail) {
    const loan = tio.prestamos.find((l) => l.id === prestDetail);
    if (!loan) { setPrestDetail(null); return null; }
    const c = calcL(loan);
    const sc = c.isPag ? C.green : c.isVen ? C.red : c.dias <= 7 ? C.amber : C.blue;
    const sl = c.isPag ? "✅ Pagado" : c.isVen ? `🚨 Vencido hace ${Math.abs(c.dias)}d` : `✓ Activo`;
    const pPct = Math.round((c.capPag / loan.capitalOriginal) * 100) || 0;
    const sorted = [...(loan.pagos || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
    return (
      <div style={{ padding: "0 16px" }}>
        <div style={{ padding: "52px 0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setPrestDetail(null)} style={{ background: C.surf, border: "none", color: C.text, width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700, ...SORA }}>{loan.nombre}</p>
              <p style={{ color: C.sec, fontSize: 13 }}>{loan.tasaMensual}% mensual · {tio.nombre}</p>
            </div>
          </div>
          <button onClick={() => openEditPrest(loan)} style={{ background: `${C.blue}22`, border: "none", color: C.blue, borderRadius: 10, padding: "7px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, ...DM }}>✏️ Editar</button>
        </div>
        <Badge label={sl} color={sc} />
        <Card style={{ marginTop: 12, marginBottom: 12 }}>
          <p style={{ color: C.sec, fontSize: 11, marginBottom: 14, letterSpacing: 0.8 }}>DESGLOSE FINANCIERO</p>
          {[{ l: "Capital original", v: loan.capitalOriginal, c: C.text }, { l: "Capital pagado", v: c.capPag, c: C.green, pre: "− " }].map((r) => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.sec, fontSize: 13 }}>{r.l}</span>
              <span style={{ color: r.c, ...SORA, fontWeight: 600 }}>{r.pre || ""}{fmt(r.v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `0.5px solid ${C.border}`, marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Capital pendiente</span>
            <span style={{ color: C.red, ...SORA, fontWeight: 700, fontSize: 16 }}>{fmt(c.capPend)}</span>
          </div>
          <ProgBar value={c.capPag} max={loan.capitalOriginal} color={C.blue} h={8} />
          <p style={{ color: C.ter, fontSize: 11, marginTop: 4 }}>{pPct}% recuperado</p>
          <Divider />
          {[{ l: `Interés generado (${c.m} mes${c.m !== 1 ? "es" : ""})`, v: c.intGen, c: C.text }, { l: "Interés cobrado", v: c.intPag, c: C.green, pre: "− " }].map((r) => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: C.sec, fontSize: 13 }}>{r.l}</span>
              <span style={{ color: r.c, ...SORA, fontWeight: 600 }}>{r.pre || ""}{fmt(r.v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `0.5px solid ${C.border}` }}>
            <span style={{ fontWeight: 700 }}>Interés pendiente</span>
            <span style={{ color: C.amber, ...SORA, fontWeight: 700, fontSize: 16 }}>{fmt(c.intAcum)}</span>
          </div>
          <Divider />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>DEUDA TOTAL</span>
            <span style={{ color: C.red, ...SORA, fontSize: 22, fontWeight: 700 }}>{fmt(c.total)}</span>
          </div>
        </Card>
        {loan.notas && <Card style={{ marginBottom: 12, padding: "12px 14px" }}><p style={{ color: C.sec, fontSize: 13 }}>📝 {loan.notas}</p></Card>}
        {!c.isPag && <PrimaryBtn onClick={() => setPayModal(true)} color={C.blue} style={{ width: "100%", marginBottom: 10 }}>+ Registrar cobro</PrimaryBtn>}
        <button onClick={() => { saveTio({ ...tio, prestamos: tio.prestamos.filter((l) => l.id !== prestDetail) }); setPrestDetail(null); }} style={{ background: "none", border: `0.5px solid ${C.red}55`, color: C.red, borderRadius: 10, padding: "8px 16px", cursor: "pointer", ...DM, marginBottom: 20, fontSize: 13 }}>🗑 Eliminar préstamo</button>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Historial de cobros ({(loan.pagos || []).length})</p>
        {sorted.length === 0 ? <Card><p style={{ textAlign: "center", color: C.sec }}>Sin cobros registrados</p></Card> : sorted.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div><p style={{ fontSize: 14, fontWeight: 500 }}>{fmtD(p.fecha)}{p.nota ? ` · ${p.nota}` : ""}</p>
                <p style={{ color: C.sec, fontSize: 12 }}>{p.tipo === "interes" ? "Solo interés" : p.tipo === "capital" ? "Solo capital" : "Capital + Interés"}</p></div>
              <p style={{ color: C.green, fontWeight: 700, ...SORA }}>{fmt(p.monto)}</p>
            </div>
          </Card>
        ))}
        {payModal && (
          <Modal title="Registrar cobro" onClose={() => setPayModal(false)}>
            <InfoBox><p style={{ color: C.sec }}>Capital pendiente: <b style={{ color: C.text }}>{fmt(c.capPend)}</b> · Interés: <b style={{ color: C.amber }}>{fmt(c.intAcum)}</b></p></InfoBox>
            <label style={{ fontSize: 12, color: C.sec, display: "block", marginBottom: 6 }}>Tipo</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[{ id: "interes", label: "Solo interés" }, { id: "capital", label: "Solo capital" }, { id: "ambos", label: "Capital + Interés" }].map((t) => (
                <button key={t.id} onClick={() => setPf((x) => ({ ...x, tipo: t.id }))} style={{ flex: 1, padding: "9px 4px", borderRadius: 8, border: "none", cursor: "pointer", ...DM, background: pf.tipo === t.id ? C.blue : C.surf2, color: pf.tipo === t.id ? "#fff" : C.sec, fontSize: 11, fontWeight: 700 }}>{t.label}</button>
              ))}
            </div>
            {pf.tipo !== "ambos" ? <Inp label="Monto" type="number" placeholder="0" value={pf.monto} onChange={(e) => setPf((x) => ({ ...x, monto: e.target.value }))} /> : (
              <><Inp label="A capital" type="number" placeholder="0" value={pf.aCapital} onChange={(e) => setPf((x) => ({ ...x, aCapital: e.target.value }))} />
              <Inp label="A interés" type="number" placeholder="0" value={pf.aInteres} onChange={(e) => setPf((x) => ({ ...x, aInteres: e.target.value }))} /></>
            )}
            <Inp label="Fecha" type="date" value={pf.fecha} onChange={(e) => setPf((x) => ({ ...x, fecha: e.target.value }))} />
            <Inp label="Nota (opcional)" placeholder="Ej: Cuota junio" value={pf.nota} onChange={(e) => setPf((x) => ({ ...x, nota: e.target.value }))} />
            <PrimaryBtn onClick={addPagoTio} color={C.blue} style={{ width: "100%" }}>Registrar cobro</PrimaryBtn>
          </Modal>
        )}
        {addPrestModal && (
          <Modal title={editPrestId ? "Editar préstamo" : "Nuevo préstamo"} onClose={() => { setAddPrestModal(false); setEditPrestId(null); setLf(emptyLf); }}>
            <Inp label="Nombre del deudor *" placeholder="Nombre completo" value={lf.nombre} onChange={(e) => setLf((x) => ({ ...x, nombre: e.target.value }))} />
            <Inp label="Teléfono" type="tel" placeholder="3001234567" value={lf.telefono} onChange={(e) => setLf((x) => ({ ...x, telefono: e.target.value }))} />
            <Inp label="Capital prestado *" type="number" placeholder="0" value={lf.capitalOriginal} onChange={(e) => setLf((x) => ({ ...x, capitalOriginal: e.target.value }))} />
            <Inp label="Tasa mensual (%)" type="number" placeholder="0" value={lf.tasaMensual} onChange={(e) => setLf((x) => ({ ...x, tasaMensual: e.target.value }))} />
            <Inp label="Fecha del préstamo" type="date" value={lf.fechaInicio} onChange={(e) => setLf((x) => ({ ...x, fechaInicio: e.target.value }))} />
            <Inp label="Fecha de vencimiento" type="date" value={lf.fechaVencimiento} onChange={(e) => setLf((x) => ({ ...x, fechaVencimiento: e.target.value }))} />
            <Inp label="Notas (opcional)" placeholder="Contexto..." value={lf.notas} onChange={(e) => setLf((x) => ({ ...x, notas: e.target.value }))} />
            <PrimaryBtn onClick={savePrest} color={C.blue} style={{ width: "100%" }}>{editPrestId ? "Guardar cambios" : "Crear préstamo"}</PrimaryBtn>
          </Modal>
        )}
      </div>
    );
  }

  // ── Sub-tabs ──
  const SUB_TABS = [
    { id: "resumen", label: "Resumen" },
    { id: "prestamos", label: "Préstamos" },
    { id: "arriendos", label: "Arriendos" },
    { id: "gastos", label: "Gastos" },
    { id: "reporte", label: "📄 Reporte" },
  ];

  return (
    <div style={{ padding: "0 16px" }}>
      {/* Cabecera */}
      <div style={{ padding: "52px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 700, ...SORA }}>👴 {tio.nombre}</p>
          <p style={{ color: C.sec, fontSize: 12 }}>Cartera administrada · solo tuya</p>
        </div>
        {subTab === "prestamos" && (
          <PrimaryBtn onClick={() => { setEditPrestId(null); setLf(emptyLf); setAddPrestModal(true); }} color={C.blue} style={{ padding: "8px 14px", fontSize: 13 }}>+ Préstamo</PrimaryBtn>
        )}
        {subTab === "arriendos" && (
          <PrimaryBtn onClick={() => { setEditArriendoId(null); setAf(emptyAf); setAddArriendoModal(true); }} color={C.blue} style={{ padding: "8px 14px", fontSize: 13 }}>+ Arriendo</PrimaryBtn>
        )}
        {subTab === "gastos" && (
          <PrimaryBtn onClick={() => { setEditGastoId(null); setGf(emptyGf); setAddGastoModal(true); }} color={C.blue} style={{ padding: "8px 14px", fontSize: 13 }}>+ Gasto</PrimaryBtn>
        )}
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {SUB_TABS.map((st) => (
          <button key={st.id} onClick={() => setSubTab(st.id)} style={{ background: subTab === st.id ? C.blue : C.surf, color: subTab === st.id ? "#fff" : C.sec, border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", ...DM }}>{st.label}</button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {subTab === "resumen" && (
        <>
          {/* Saldo a entregar */}
          <div style={{ background: saldoPendiente >= 0 ? "linear-gradient(135deg,#0a2e40,#0d3d5c)" : "linear-gradient(135deg,#3d0a0a,#5c1010)", borderRadius: 20, padding: 20, marginBottom: 14, border: `1px solid ${saldoPendiente >= 0 ? "rgba(74,159,255,.25)" : "rgba(255,107,107,.25)"}` }}>
            <p style={{ color: C.sec, fontSize: 11, marginBottom: 6, letterSpacing: 0.8 }}>SALDO A ENTREGAR A {tio.nombre.toUpperCase()}</p>
            <p style={{ fontSize: 34, fontWeight: 700, ...SORA, color: saldoPendiente >= 0 ? C.blue : C.red }}>{fmt(Math.abs(saldoPendiente))}</p>
            {saldoPendiente < 0 && <p style={{ color: C.red, fontSize: 12, marginTop: 4 }}>⚠️ Los gastos superan lo recibido</p>}
          </div>

          <Card style={{ marginBottom: 14 }}>
            <p style={{ color: C.sec, fontSize: 11, marginBottom: 12, letterSpacing: 0.8 }}>DESGLOSE</p>
            {[
              { l: "Arriendos recibidos", v: totalArriendos, c: C.green, sign: "+" },
              { l: "Cobros de préstamos", v: totalCobradoPrestamos, c: C.green, sign: "+" },
              { l: "Gastos pagados", v: totalGastos, c: C.red, sign: "−" },
              { l: "Ya entregado al tío", v: totalEntregas, c: C.amber, sign: "−" },
            ].map((r) => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: C.sec, fontSize: 14 }}>{r.l}</span>
                <span style={{ color: r.c, fontWeight: 700, ...SORA }}>{r.sign} {fmt(r.v)}</span>
              </div>
            ))}
            <Divider />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700 }}>Pendiente por entregar</span>
              <span style={{ color: saldoPendiente >= 0 ? C.blue : C.red, fontWeight: 700, ...SORA, fontSize: 17 }}>{fmt(saldoPendiente)}</span>
            </div>
          </Card>

          {/* Registrar entrega */}
          <PrimaryBtn onClick={() => setAddEntregaModal(true)} color={C.blue} style={{ width: "100%", marginBottom: 14 }}>💵 Registrar entrega al tío</PrimaryBtn>

          {/* Historial de entregas */}
          {tio.entregas.length > 0 && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: C.sec, marginBottom: 8, letterSpacing: 0.8 }}>ENTREGAS REALIZADAS</p>
              {[...tio.entregas].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((e) => (
                <Card key={e.id} style={{ marginBottom: 8, padding: "11px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{fmtD(e.fecha)}</p>
                      {e.nota && <p style={{ color: C.sec, fontSize: 12 }}>{e.nota}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <p style={{ color: C.amber, fontWeight: 700, ...SORA }}>{fmt(e.monto)}</p>
                      <button onClick={() => saveTio({ ...tio, entregas: tio.entregas.filter((x) => x.id !== e.id) })} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {/* ── PRÉSTAMOS ── */}
      {subTab === "prestamos" && (
        <>
          {tio.prestamos.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "36px 20px" }}>
              <p style={{ fontSize: 36, marginBottom: 10 }}>🤝</p>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>Sin préstamos del tío</p>
              <p style={{ color: C.sec, fontSize: 14 }}>Agrega los préstamos que administras para él</p>
            </Card>
          ) : (
            tio.prestamos.map((loan) => {
              const c = calcL(loan);
              const sc = c.isPag ? C.green : c.isVen ? C.red : C.blue;
              const sl = c.isPag ? "Pagado" : c.isVen ? `Vencido ${Math.abs(c.dias)}d` : `Activo`;
              return (
                <Card key={loan.id} style={{ marginBottom: 10 }} onClick={() => setPrestDetail(loan.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 15 }}>{loan.nombre}</p>
                      <p style={{ color: C.sec, fontSize: 12 }}>{loan.tasaMensual}% mensual</p>
                    </div>
                    <Badge label={sl} color={sc} />
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {[{ l: "Capital pend.", v: c.capPend, c: C.red }, { l: "Interés acum.", v: c.intAcum, c: C.amber }, { l: "Total", v: c.total, c: C.text }].map((x) => (
                      <div key={x.l}><p style={{ color: C.sec, fontSize: 11 }}>{x.l}</p><p style={{ color: x.c, fontWeight: 700, ...SORA, fontSize: 14 }}>{fmt(x.v)}</p></div>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </>
      )}

      {/* ── ARRIENDOS ── */}
      {subTab === "arriendos" && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <p style={{ color: C.sec, fontSize: 11, marginBottom: 4, letterSpacing: 0.8 }}>TOTAL ARRIENDOS RECIBIDOS</p>
            <p style={{ ...SORA, fontSize: 26, fontWeight: 700, color: C.green }}>{fmt(totalArriendos)}</p>
          </Card>
          {tio.arriendos.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "30px 20px" }}><p style={{ color: C.sec }}>Sin arriendos registrados</p></Card>
          ) : (
            [...tio.arriendos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((a) => (
              <Card key={a.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{a.descripcion}</p>
                    <p style={{ color: C.sec, fontSize: 12 }}>🏠 {a.inmueble} · {fmtD(a.fecha)}</p>
                    {a.notas && <p style={{ color: C.ter, fontSize: 11 }}>{a.notas}</p>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ color: C.green, fontWeight: 700, ...SORA }}>{fmt(a.monto)}</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                      <button onClick={() => openEditArriendo(a)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, padding: 0 }}>✏️</button>
                      <button onClick={() => saveTio({ ...tio, arriendos: tio.arriendos.filter((x) => x.id !== a.id) })} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {/* ── GASTOS ── */}
      {subTab === "gastos" && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <p style={{ color: C.sec, fontSize: 11, marginBottom: 4, letterSpacing: 0.8 }}>TOTAL GASTOS PAGADOS</p>
            <p style={{ ...SORA, fontSize: 26, fontWeight: 700, color: C.red }}>{fmt(totalGastos)}</p>
          </Card>
          {tio.gastos.length === 0 ? (
            <Card style={{ textAlign: "center", padding: "30px 20px" }}><p style={{ color: C.sec }}>Sin gastos registrados</p></Card>
          ) : (
            [...tio.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((g) => (
              <Card key={g.id} style={{ marginBottom: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{g.descripcion}</p>
                    <p style={{ color: C.sec, fontSize: 12 }}>{g.categoria} · {fmtD(g.fecha)}</p>
                    {g.notas && <p style={{ color: C.ter, fontSize: 11 }}>{g.notas}</p>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ color: C.red, fontWeight: 700, ...SORA }}>{fmt(g.monto)}</p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                      <button onClick={() => openEditGasto(g)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 13, padding: 0 }}>✏️</button>
                      <button onClick={() => saveTio({ ...tio, gastos: tio.gastos.filter((x) => x.id !== g.id) })} style={{ background: "none", border: "none", color: C.ter, cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </>
      )}

      {/* ── REPORTE ── */}
      {subTab === "reporte" && (() => {
        const inRange = (f) => (!reporteDesde || f >= reporteDesde) && (!reporteHasta || f <= reporteHasta);

        const arriendosFiltrados   = tio.arriendos.filter((a) => inRange(a.fecha));
        const gastosFiltrados      = tio.gastos.filter((g) => inRange(g.fecha));
        const entregasFiltradas    = tio.entregas.filter((e) => inRange(e.fecha));
        const prestamosFiltrados   = tio.prestamos.map((l) => ({ ...l, pagos: (l.pagos || []).filter((p) => inRange(p.fecha)) }));

        const rArriendos  = arriendosFiltrados.reduce((s, a) => s + a.monto, 0);
        const rGastos     = gastosFiltrados.reduce((s, g) => s + g.monto, 0);
        const rEntregas   = entregasFiltradas.reduce((s, e) => s + e.monto, 0);
        const rCobros     = prestamosFiltrados.reduce((s, l) => s + l.pagos.reduce((ss, p) => ss + p.monto, 0), 0);
        const rSaldo      = rArriendos + rCobros - rGastos - rEntregas;

        const tioFiltrado = { ...tio, arriendos: arriendosFiltrados, gastos: gastosFiltrados, entregas: entregasFiltradas, prestamos: prestamosFiltrados };
        const totalesFiltrados = { totalArriendos: rArriendos, totalCobradoPrestamos: rCobros, totalGastos: rGastos, totalEntregas: rEntregas, saldoPendiente: rSaldo };

        return (
          <>
            <Card style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📄 Reporte para {tio.nombre}</p>
              <p style={{ color: C.sec, fontSize: 12, marginBottom: 16 }}>Solo se incluirán los registros dentro del rango de fechas seleccionado.</p>

              {/* Selector de fechas */}
              <div style={{ background: C.surf2, borderRadius: 12, padding: "14px 14px 8px", marginBottom: 16 }}>
                <p style={{ color: C.blue, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>📅 PERÍODO DEL REPORTE</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>Desde</label>
                    <input type="date" value={reporteDesde} onChange={(e) => setReporteDesde(e.target.value)}
                      style={{ width: "100%", background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>Hasta</label>
                    <input type="date" value={reporteHasta} onChange={(e) => setReporteHasta(e.target.value)}
                      style={{ width: "100%", background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Atajos de período */}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Este mes", fn: () => { const d = new Date(); d.setDate(1); setReporteDesde(d.toISOString().slice(0,10)); setReporteHasta(todayStr()); } },
                    { label: "Mes pasado", fn: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); const h = new Date(d.getFullYear(), d.getMonth()+1, 0); setReporteDesde(d.toISOString().slice(0,10)); setReporteHasta(h.toISOString().slice(0,10)); } },
                    { label: "Este año", fn: () => { const y = new Date().getFullYear(); setReporteDesde(`${y}-01-01`); setReporteHasta(`${y}-12-31`); } },
                    { label: "Todo", fn: () => { setReporteDesde(""); setReporteHasta(""); } },
                  ].map((s) => (
                    <button key={s.label} onClick={s.fn} style={{ background: C.surf, border: `0.5px solid ${C.border}`, color: C.sec, borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", ...DM }}>{s.label}</button>
                  ))}
                </div>
              </div>

              {/* Previsualización filtrada */}
              <p style={{ color: C.sec, fontSize: 11, letterSpacing: 0.8, marginBottom: 10 }}>PREVISUALIZACIÓN DEL PERÍODO</p>
              {[
                { l: "Arriendos recibidos",  v: rArriendos, c: C.green,  n: arriendosFiltrados.length },
                { l: "Cobros de préstamos",  v: rCobros,    c: C.green,  n: prestamosFiltrados.reduce((s,l)=>s+l.pagos.length,0) },
                { l: "Gastos pagados",       v: rGastos,    c: C.red,    n: gastosFiltrados.length },
                { l: "Ya entregado",         v: rEntregas,  c: C.amber,  n: entregasFiltradas.length },
              ].map((r) => (
                <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ color: C.sec, fontSize: 13 }}>{r.l} <span style={{ fontSize: 11, color: C.ter }}>({r.n} registros)</span></span>
                  <span style={{ color: r.c, fontWeight: 700, ...SORA, fontSize: 14 }}>{fmt(r.v)}</span>
                </div>
              ))}
              <Divider />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>Saldo del período</span>
                <span style={{ color: rSaldo >= 0 ? C.blue : C.red, fontWeight: 700, ...SORA, fontSize: 18 }}>{fmt(rSaldo)}</span>
              </div>

              <PrimaryBtn color={C.blue} style={{ width: "100%", marginTop: 16 }} onClick={() => setReporteVisible({ tio: tioFiltrado, totales: totalesFiltrados, desde: reporteDesde, hasta: reporteHasta })}>
                🖨️ Generar e imprimir reporte
              </PrimaryBtn>
            </Card>
          </>
        );
      })()}

      {/* ── MODALES ── */}
      {addPrestModal && (
        <Modal title={editPrestId ? "Editar préstamo" : "Nuevo préstamo del tío"} onClose={() => { setAddPrestModal(false); setEditPrestId(null); setLf(emptyLf); }}>
          <Inp label="Nombre del deudor *" placeholder="Nombre completo" value={lf.nombre} onChange={(e) => setLf((x) => ({ ...x, nombre: e.target.value }))} />
          <Inp label="Teléfono" type="tel" placeholder="3001234567" value={lf.telefono} onChange={(e) => setLf((x) => ({ ...x, telefono: e.target.value }))} />
          <Inp label="Capital prestado *" type="number" placeholder="0" value={lf.capitalOriginal} onChange={(e) => setLf((x) => ({ ...x, capitalOriginal: e.target.value }))} />
          <Inp label="Tasa mensual (%)" type="number" placeholder="0" value={lf.tasaMensual} onChange={(e) => setLf((x) => ({ ...x, tasaMensual: e.target.value }))} />
          <Inp label="Fecha del préstamo" type="date" value={lf.fechaInicio} onChange={(e) => setLf((x) => ({ ...x, fechaInicio: e.target.value }))} />
          <Inp label="Fecha de vencimiento" type="date" value={lf.fechaVencimiento} onChange={(e) => setLf((x) => ({ ...x, fechaVencimiento: e.target.value }))} />
          <Inp label="Notas (opcional)" placeholder="Contexto del préstamo..." value={lf.notas} onChange={(e) => setLf((x) => ({ ...x, notas: e.target.value }))} />
          <PrimaryBtn onClick={savePrest} color={C.blue} style={{ width: "100%" }}>{editPrestId ? "Guardar cambios" : "Crear préstamo"}</PrimaryBtn>
        </Modal>
      )}

      {addArriendoModal && (
        <Modal title={editArriendoId ? "Editar arriendo" : "Nuevo arriendo"} onClose={() => { setAddArriendoModal(false); setEditArriendoId(null); setAf(emptyAf); }}>
          <Inp label="Inmueble" placeholder="Ej: Casa Calle 5, Apto 302..." value={af.inmueble} onChange={(e) => setAf((x) => ({ ...x, inmueble: e.target.value }))} />
          <Inp label="Descripción *" placeholder="Ej: Arriendo junio" value={af.descripcion} onChange={(e) => setAf((x) => ({ ...x, descripcion: e.target.value }))} />
          <Inp label="Monto *" type="number" placeholder="0" value={af.monto} onChange={(e) => setAf((x) => ({ ...x, monto: e.target.value }))} />
          <Inp label="Fecha" type="date" value={af.fecha} onChange={(e) => setAf((x) => ({ ...x, fecha: e.target.value }))} />
          <Inp label="Notas (opcional)" placeholder="Observaciones..." value={af.notas} onChange={(e) => setAf((x) => ({ ...x, notas: e.target.value }))} />
          <PrimaryBtn onClick={saveArriendo} color={C.blue} style={{ width: "100%" }}>{editArriendoId ? "Guardar cambios" : "Registrar arriendo"}</PrimaryBtn>
        </Modal>
      )}

      {addGastoModal && (
        <Modal title={editGastoId ? "Editar gasto" : "Nuevo gasto del tío"} onClose={() => { setAddGastoModal(false); setEditGastoId(null); setGf(emptyGf); }}>
          <Inp label="Descripción *" placeholder="Ej: Predial, Servicios..." value={gf.descripcion} onChange={(e) => setGf((x) => ({ ...x, descripcion: e.target.value }))} />
          <Inp label="Monto *" type="number" placeholder="0" value={gf.monto} onChange={(e) => setGf((x) => ({ ...x, monto: e.target.value }))} />
          <Sel label="Categoría" value={gf.categoria} onChange={(e) => setGf((x) => ({ ...x, categoria: e.target.value }))}>
            {["Impuesto", "Servicios", "Mantenimiento", "Reparación", "Administración", "Otros"].map((c) => <option key={c} value={c}>{c}</option>)}
          </Sel>
          <Inp label="Fecha" type="date" value={gf.fecha} onChange={(e) => setGf((x) => ({ ...x, fecha: e.target.value }))} />
          <Inp label="Notas (opcional)" placeholder="Observaciones..." value={gf.notas} onChange={(e) => setGf((x) => ({ ...x, notas: e.target.value }))} />
          <PrimaryBtn onClick={saveGasto} color={C.blue} style={{ width: "100%" }}>{editGastoId ? "Guardar cambios" : "Registrar gasto"}</PrimaryBtn>
        </Modal>
      )}

      {addEntregaModal && (
        <Modal title="Registrar entrega al tío" onClose={() => { setAddEntregaModal(false); setEf({ monto: "", fecha: todayStr(), nota: "" }); }}>
          <InfoBox><p style={{ color: C.sec }}>Saldo pendiente actual: <b style={{ color: C.blue }}>{fmt(saldoPendiente)}</b></p></InfoBox>
          <Inp label="Monto entregado *" type="number" placeholder="0" value={ef.monto} onChange={(e) => setEf((x) => ({ ...x, monto: e.target.value }))} />
          <Inp label="Fecha" type="date" value={ef.fecha} onChange={(e) => setEf((x) => ({ ...x, fecha: e.target.value }))} />
          <Inp label="Nota (opcional)" placeholder="Ej: Entrega junio" value={ef.nota} onChange={(e) => setEf((x) => ({ ...x, nota: e.target.value }))} />
          <PrimaryBtn onClick={saveEntrega} color={C.blue} style={{ width: "100%" }}>Registrar entrega</PrimaryBtn>
        </Modal>
      )}

      {reporteVisible && (
        <ReporteOverlay
          tio={reporteVisible.tio}
          totales={reporteVisible.totales}
          desde={reporteVisible.desde}
          hasta={reporteVisible.hasta}
          onClose={() => setReporteVisible(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   APP PRINCIPAL
═══════════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [data, setData] = useState(null);
  const [alertaModal, setAlertaModal] = useState(true);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=DM+Sans:wght@400;500;700&display=swap";
    document.head.appendChild(link);
    try {
      const r = localStorage.getItem("miscuentas-v3");
      const saved = r ? JSON.parse(r) : null;
      if (saved && !saved.accounts) saved.accounts = INIT.accounts;
      if (saved && saved.accounts) saved.accounts = saved.accounts.map(a => ({ subcuentas: [], ...a }));
      if (saved && !saved.tio) saved.tio = JSON.parse(JSON.stringify(INIT.tio));
      setData(saved || JSON.parse(JSON.stringify(INIT)));
    } catch {
      setData(JSON.parse(JSON.stringify(INIT)));
    }
  }, []);

  const saveData = useCallback((nd) => {
    setData(nd);
    try { localStorage.setItem("miscuentas-v3", JSON.stringify(nd)); } catch {}
  }, []);

  const setTabSafe = useCallback((t) => setTab(t), []);

  if (!data) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 52 }}>💰</div>
      <p style={{ ...SORA, color: C.green, fontWeight: 700, fontSize: 20 }}>MisCuentas</p>
      <p style={{ color: C.sec, fontSize: 13 }}>Cargando tu información...</p>
    </div>
  );

  // Calcular alertas y badges
  const alertas = calcAlertas(data);
  const alertasAltas = alertas.filter((a) => a.urgencia === "alta");
  const badges = alertas.reduce((acc, a) => { acc[a.tab] = (acc[a.tab] || 0) + 1; return acc; }, {});

  const screens = {
    dash: <Dashboard data={data} setTab={setTabSafe} />,
    tx: <Transacciones data={data} saveData={saveData} />,
    loans: <Prestamos data={data} saveData={saveData} />,
    accounts: <Cuentas data={data} saveData={saveData} />,
    budget: <Presupuesto data={data} saveData={saveData} />,
    goals: <Metas data={data} saveData={saveData} />,
    tio: <Tio data={data} saveData={saveData} />,
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", ...DM, color: C.text, paddingBottom: 90, overflowX: "hidden" }}>
      {screens[tab]}
      <BottomNav tab={tab} setTab={setTabSafe} badges={badges} />

      {/* ── Modal de alertas al abrir ── */}
      {alertaModal && alertasAltas.length > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", zIndex: 3000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: C.surf, width: "100%", maxWidth: 430, borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <p style={{ fontWeight: 700, fontSize: 18, ...SORA }}>¡Atención requerida!</p>
              <span style={{ background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, marginLeft: "auto" }}>{alertasAltas.length} urgente{alertasAltas.length > 1 ? "s" : ""}</span>
            </div>
            <p style={{ color: C.sec, fontSize: 13, marginBottom: 20 }}>Estos asuntos requieren tu atención hoy:</p>
            {alertasAltas.map((a) => (
              <div key={a.id} onClick={() => { setAlertaModal(false); setTab(a.tab); }} style={{ background: `${C.red}14`, border: `1px solid ${C.red}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: C.red }}>{a.titulo}</p>
                  <p style={{ color: C.sec, fontSize: 12, marginTop: 2 }}>{a.detalle}</p>
                </div>
                <span style={{ color: C.sec, fontSize: 18 }}>›</span>
              </div>
            ))}
            <button onClick={() => setAlertaModal(false)} style={{ width: "100%", background: C.surf2, border: "none", color: C.sec, borderRadius: 12, padding: "13px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 6, ...DM }}>
              Entendido, ver después
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
