import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');
import { writeFileSync } from 'fs';

// ─── HELPERS ──────────────────────────────────────────────────────
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function setColor(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setTextColor(r,g,b); }
function setFill(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setFillColor(r,g,b); }
function setDraw(doc, hex) { const [r,g,b] = hexToRgb(hex); doc.setDrawColor(r,g,b); }

const C = { primary: '#3B82F6', dark: '#0F172A', muted: '#64748B', border: '#E2E8F0', white: '#FFFFFF', bg: '#F8FAFC' };
const W = 210, H = 297, M = 15;
let pageNum = 0;

function footer(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setFont('helvetica','normal'); setColor(doc, C.muted);
    doc.text(`Vibook — Brand Kit  |  Pagina ${i-1} de ${total-1}`, W/2, H-8, { align:'center' });
    doc.text('Febrero 2026', W-M, H-8, { align:'right' });
  }
}

function sectionHeader(doc, y, text) {
  setFill(doc, C.dark); doc.roundedRect(M, y, W-2*M, 10, 2, 2, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(13); setColor(doc, C.white);
  doc.text(text, M+5, y+7); return y+16;
}

function subHeader(doc, y, text) {
  doc.setFont('helvetica','bold'); doc.setFontSize(10); setColor(doc, C.dark);
  doc.text(text, M, y); return y+6;
}

// ─── COVER ────────────────────────────────────────────────────────
const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
doc.setProperties({ title:'Vibook — Brand Kit', author:'Vibook' });

// Cover page
setFill(doc, C.dark); doc.rect(0,0,W,H,'F');
setFill(doc, C.primary); doc.rect(0,0,W,5,'F');
doc.setFont('helvetica','bold'); doc.setFontSize(42); setColor(doc, C.white);
doc.text('Vibook', W/2, H/2-30, { align:'center' });
setFill(doc, C.primary); doc.rect(W/2-20, H/2-18, 40, 2, 'F');
doc.setFont('helvetica','normal'); doc.setFontSize(18); setColor(doc, '#94A3B8');
doc.text('Brand Kit', W/2, H/2-4, { align:'center' });
doc.setFontSize(11); setColor(doc, '#475569');
doc.text('Guia de identidad visual y directrices de marca', W/2, H/2+10, { align:'center' });
doc.text('Febrero 2026', W/2, H/2+20, { align:'center' });
setFill(doc, C.primary); doc.rect(0, H-5, W, 5, 'F');

// ─── LOGO SECTION ─────────────────────────────────────────────────
doc.addPage(); let y = M;
y = sectionHeader(doc, y, '01 — Logo');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('El logotipo de Vibook se utiliza en dos variantes: fondo claro (logo-black-2.png) y fondo oscuro (logo-white-2.png).', M, y); y += 8;

// Light variant
setFill(doc, C.white); setDraw(doc, C.border); doc.setLineWidth(0.3);
doc.roundedRect(M, y, 80, 35, 3, 3, 'FD');
doc.setFont('helvetica','bold'); doc.setFontSize(20); setColor(doc, C.dark);
doc.text('Vibook', M+20, y+22);
doc.setFontSize(7); setColor(doc, C.muted); doc.text('Fondo claro — logo-black-2.png', M, y+40);

// Dark variant
setFill(doc, C.dark); doc.roundedRect(M+90, y, 80, 35, 3, 3, 'F');
doc.setFont('helvetica','bold'); doc.setFontSize(20); setColor(doc, C.white);
doc.text('Vibook', M+110, y+22);
doc.setFontSize(7); setColor(doc, C.muted); doc.text('Fondo oscuro — logo-white-2.png', M+90, y+40);
y += 50;

y = subHeader(doc, y, 'Zona de respeto');
doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.muted);
doc.text('Mantener un espacio minimo equivalente a la altura del simbolo alrededor del logo.', M, y); y += 8;
setDraw(doc, '#93C5FD'); doc.setLineWidth(0.5); doc.setLineDashPattern([2,2],0);
doc.rect(M+30, y, 70, 30); doc.setLineDashPattern([],0);
setFill(doc, C.white); setDraw(doc, C.border); doc.setLineWidth(0.3);
doc.roundedRect(M+42, y+8, 46, 14, 2, 2, 'FD');
doc.setFont('helvetica','bold'); doc.setFontSize(14); setColor(doc, C.dark);
doc.text('Vibook', M+52, y+18);
y += 40;

y = subHeader(doc, y, 'Tamanos');
const sizes = [['200px (Header)', 22], ['120px (Login)', 16], ['80px (Sidebar)', 12]];
let sx = M;
for (const [label, fontSize] of sizes) {
  setFill(doc, C.white); setDraw(doc, C.border); doc.setLineWidth(0.3);
  doc.roundedRect(sx, y, 50, 20, 2, 2, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(fontSize); setColor(doc, C.dark);
  doc.text('Vibook', sx+10, y+13);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.muted);
  doc.text(label, sx, y+26);
  sx += 58;
}

// ─── COLORS SECTION ───────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '02 — Paleta de Colores');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('Sistema de colores semanticos con CSS variables HSL.', M, y); y += 8;

const colors = [
  ['Primary', '#3B82F6', 'Acciones principales, CTAs, links activos', '--primary'],
  ['Success', '#059669', 'Confirmaciones, estados exitosos, ingresos', '--success'],
  ['Warning', '#F59E0B', 'Alertas, estados pendientes, precauciones', '--warning'],
  ['Destructive', '#EF4444', 'Errores, eliminaciones, egresos', '--destructive'],
  ['Info', '#2196F3', 'Informacion contextual, estados neutrales', '--info'],
  ['Background', '#FFFFFF', 'Fondo principal de la aplicacion', '--background'],
  ['Foreground', '#0F172A', 'Texto principal, headings', '--foreground'],
  ['Muted', '#F0F4F8', 'Fondos secundarios, areas inactivas', '--muted'],
  ['Muted FG', '#64748B', 'Texto secundario, labels, placeholders', '--muted-foreground'],
  ['Border', '#E2E8F0', 'Bordes de cards, inputs, separadores', '--border'],
];

const colW = (W-2*M)/2;
for (let i = 0; i < colors.length; i++) {
  const [name, hex, desc, varName] = colors[i];
  const col = i % 2; const row = Math.floor(i/2);
  const cx = M + col * colW; const cy = y + row * 28;

  setFill(doc, hex); const [r,g,b] = hexToRgb(hex);
  if (r+g+b > 700) { setDraw(doc, C.border); doc.setLineWidth(0.3); doc.roundedRect(cx, cy, colW-5, 12, 2, 2, 'FD'); }
  else { doc.roundedRect(cx, cy, colW-5, 12, 2, 2, 'F'); }

  doc.setFont('helvetica','bold'); doc.setFontSize(9); setColor(doc, C.dark);
  doc.text(name, cx, cy+17);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.muted);
  doc.text(`${hex}  |  var(${varName})`, cx, cy+22);
  doc.text(desc, cx, cy+26);
}
y += Math.ceil(colors.length/2) * 28 + 4;

y = subHeader(doc, y, 'Colores de graficos');
const charts = [
  ['Chart 1', '#4D8BF5'], ['Chart 2', '#06B6D4'], ['Chart 3', '#8B5CF6'],
  ['Chart 4', '#F59E0B'], ['Chart 5', '#22C55E'], ['Chart 6', '#EF4444'],
];
const chartW = (W-2*M)/6;
for (let i = 0; i < charts.length; i++) {
  const [name, hex] = charts[i]; const cx = M + i * chartW;
  setFill(doc, hex); doc.roundedRect(cx, y, chartW-3, 12, 2, 2, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(7); setColor(doc, C.dark); doc.text(name, cx, y+17);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.muted); doc.text(hex, cx, y+21);
}

// ─── TYPOGRAPHY ───────────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '03 — Tipografia');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('Inter (Google Fonts) — La tipografia oficial del sistema.', M, y); y += 10;

setFill(doc, C.bg); setDraw(doc, C.border); doc.setLineWidth(0.3);
doc.roundedRect(M, y, W-2*M, 28, 3, 3, 'FD');
doc.setFont('helvetica','bold'); doc.setFontSize(26); setColor(doc, C.dark);
doc.text('Inter', M+8, y+17);
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ  abcdefghijklmnopqrstuvwxyz  0123456789', M+42, y+12);
doc.text('Sans-serif  |  Variable weight  |  Latin Extended  |  Google Fonts', M+42, y+20);
y += 36;

y = subHeader(doc, y, 'Pesos tipograficos');
const weights = [
  ['Regular (400)', 'normal', 'Cuerpo de texto, descripciones, contenido general'],
  ['Medium (500)', 'normal', 'Labels, botones, navegacion'],
  ['Semibold (600)', 'bold', 'Sub-encabezados, titulos de cards'],
  ['Bold (700)', 'bold', 'Titulos principales, headings, KPIs'],
];
for (const [label, style, usage] of weights) {
  doc.setFont('helvetica', style); doc.setFontSize(11); setColor(doc, C.dark);
  doc.text(label, M, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.muted);
  doc.text(usage, M+50, y);
  y += 9;
}
y += 6;

y = subHeader(doc, y, 'Escala tipografica');
const scale = [
  ['text-xs','12px','Regular'], ['text-sm','14px','Regular'], ['text-base','16px','Regular'],
  ['text-lg','18px','Regular'], ['text-xl','20px','Semibold'], ['text-2xl','24px','Semibold'],
  ['text-3xl','30px','Bold'], ['text-4xl','36px','Bold'],
];
setFill(doc, C.dark); doc.roundedRect(M, y, W-2*M, 8, 1, 1, 'F');
doc.setFont('helvetica','bold'); doc.setFontSize(7); setColor(doc, C.white);
doc.text('Clase', M+3, y+5.5); doc.text('Tamano', M+35, y+5.5); doc.text('Peso', M+65, y+5.5); doc.text('Preview', M+95, y+5.5);
y += 11;
for (let i = 0; i < scale.length; i++) {
  const [cls, size, weight] = scale[i];
  if (i%2===0) { setFill(doc, C.bg); doc.rect(M, y-4, W-2*M, 9, 'F'); }
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.primary); doc.text(cls, M+3, y+2);
  setColor(doc, C.muted); doc.text(size, M+35, y+2); doc.text(weight, M+65, y+2);
  doc.setFont('helvetica', weight==='Bold'?'bold':'normal'); doc.setFontSize(Math.min(parseInt(size),16));
  setColor(doc, C.dark); doc.text('Vibook', M+95, y+2);
  y += 9;
}

// ─── ICONS ────────────────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '04 — Iconografia');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('Lucide React — Libreria oficial. Tamano estandar: 16px (botones), 20px (standalone).', M, y); y += 8;

const icons = [
  ['Plane','Operaciones, viajes'], ['Users','Clientes, pasajeros'], ['DollarSign','Ventas, montos, finanzas'],
  ['Calendar','Fechas, calendario'], ['Search','Busqueda global'], ['Settings','Configuracion'],
  ['Bell','Notificaciones, alertas'], ['Mail','Email, mensajes'], ['Phone','Telefono, WhatsApp'],
  ['MapPin','Ubicacion, destinos'], ['FileText','Documentos, reportes'], ['BarChart3','Estadisticas, graficos'],
  ['CreditCard','Pagos, suscripciones'], ['Star','Favoritos, ranking'], ['Download','Exportar, descargar'],
  ['Upload','Subir archivos'], ['Trash2','Eliminar'], ['Edit','Editar'],
  ['Plus','Crear, agregar'], ['Check','Confirmar, exito'], ['X','Cerrar, cancelar'],
  ['AlertTriangle','Advertencia'], ['Info','Informacion'], ['Heart','Favoritos, likes'],
];

setFill(doc, C.dark); doc.roundedRect(M, y, W-2*M, 8, 1, 1, 'F');
doc.setFont('helvetica','bold'); doc.setFontSize(7); setColor(doc, C.white);
doc.text('Icono', M+3, y+5.5); doc.text('Uso en la aplicacion', M+55, y+5.5);
y += 11;
for (let i = 0; i < icons.length; i++) {
  const [name, usage] = icons[i];
  if (i%2===0) { setFill(doc, C.bg); doc.rect(M, y-4, W-2*M, 8, 'F'); }
  doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.dark); doc.text(name, M+3, y+1.5);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.muted); doc.text(usage, M+55, y+1.5);
  y += 8;
}

// ─── SPACING & RADIUS ─────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '05 — Espaciado & Radius');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('Sistema de espaciado Tailwind CSS y bordes redondeados.', M, y); y += 8;

y = subHeader(doc, y, 'Escala de espaciado');
const spacings = [['p-1','4px',4],['p-2','8px',8],['p-3','12px',12],['p-4','16px',16],['p-6','24px',24],['p-8','32px',32],['p-12','48px',48]];
for (const [cls, px, barLen] of spacings) {
  doc.setFont('helvetica','bold'); doc.setFontSize(9); setColor(doc, C.primary); doc.text(cls, M, y+3);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.muted); doc.text(px, M+18, y+3);
  setFill(doc, '#93C5FD'); doc.roundedRect(M+38, y, barLen*1.2, 6, 1, 1, 'F');
  y += 11;
}
y += 6;

y = subHeader(doc, y, 'Border Radius');
const radii = [['SM','4px',1],['MD','6px',1.5],['LG','8px',2],['XL','12px',3],['Full','9999px',12]];
const rW = (W-2*M)/5;
for (let i = 0; i < radii.length; i++) {
  const [name, px, r] = radii[i]; const rx = M + i * rW;
  setFill(doc, C.primary); doc.roundedRect(rx, y, 22, 22, r, r, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); setColor(doc, C.dark); doc.text(name, rx, y+28);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.muted); doc.text(px, rx, y+33);
}
y += 42;

// ─── DARK MODE ────────────────────────────────────────────────────
y = sectionHeader(doc, y, '06 — Dark Mode');
y += 2;
const dmTokens = [
  ['Background','#FFFFFF','#0F172A'], ['Foreground','#0F172A','#F8FAFC'],
  ['Primary','#3B82F6','#60A5FA'], ['Muted','#F0F4F8','#1E293B'],
  ['Muted FG','#64748B','#94A3B8'], ['Border','#E2E8F0','#334155'],
];
setFill(doc, C.dark); doc.roundedRect(M, y, W-2*M, 8, 1, 1, 'F');
doc.setFont('helvetica','bold'); doc.setFontSize(7); setColor(doc, C.white);
doc.text('Token', M+3, y+5.5); doc.text('Light', M+55, y+5.5); doc.text('Dark', M+110, y+5.5);
y += 11;
for (let i = 0; i < dmTokens.length; i++) {
  const [name, light, dark] = dmTokens[i];
  if (i%2===0) { setFill(doc, C.bg); doc.rect(M, y-4, W-2*M, 10, 'F'); }
  doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.dark); doc.text(name, M+3, y+2);
  setFill(doc, light); doc.roundedRect(M+55, y-2, 10, 7, 1, 1, 'F');
  const [lr,lg,lb] = hexToRgb(light); if(lr+lg+lb>700){setDraw(doc,C.border);doc.setLineWidth(0.3);doc.roundedRect(M+55,y-2,10,7,1,1,'S');}
  doc.setFontSize(8); setColor(doc, C.muted); doc.text(light, M+68, y+2);
  setFill(doc, dark); doc.roundedRect(M+110, y-2, 10, 7, 1, 1, 'F');
  doc.setFontSize(8); setColor(doc, C.muted); doc.text(dark, M+123, y+2);
  y += 10;
}

// ─── TENANT PALETTES ──────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '07 — Paletas Tenant');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('5 paletas predefinidas disponibles para personalizacion por agencia.', M, y); y += 10;

const tenants = [
  { name:'Vibook (Default)', colors:['#4A154B','#36C5F0','#2EB67D'] },
  { name:'Trello', colors:['#0079BF','#026AA7','#5AAC44'] },
  { name:'Linear', colors:['#5E6AD2','#7B61FF','#00C4CC'] },
  { name:'GitHub', colors:['#24292F','#0969DA','#2DA44E'] },
  { name:'Asana', colors:['#F06A6A','#FF9A7B','#FFC857'] },
];
for (const t of tenants) {
  setFill(doc, C.bg); setDraw(doc, C.border); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W-2*M, 30, 3, 3, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); setColor(doc, C.dark); doc.text(t.name, M+6, y+10);
  const labels = ['Primary','Secondary','Accent'];
  for (let i = 0; i < t.colors.length; i++) {
    const cx = M+6 + i*40;
    setFill(doc, t.colors[i]); doc.roundedRect(cx, y+14, 32, 7, 1, 1, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.muted);
    doc.text(`${labels[i]}: ${t.colors[i]}`, cx, y+27);
  }
  y += 36;
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '08 — Design Tokens');
y += 2;
doc.setFont('helvetica','normal'); doc.setFontSize(9); setColor(doc, C.muted);
doc.text('Mapas de colores centralizados por dominio.', M, y); y += 10;

function tokenGroup(doc, y0, title, tokens) {
  let y = subHeader(doc, y0, title);
  for (const [label, hex] of tokens) {
    setFill(doc, hex); doc.circle(M+4, y+1, 2.5, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.dark); doc.text(label, M+10, y+2);
    doc.setFontSize(7); setColor(doc, C.muted); doc.text(hex, M+60, y+2);
    y += 8;
  }
  return y + 4;
}

y = tokenGroup(doc, y, 'Operaciones', [
  ['Pre-reserva','#6B7280'],['Reservado','#3B82F6'],['Confirmado','#059669'],['Cancelado','#EF4444'],['Viajado','#8B5CF6'],['Cerrado','#475569'],
]);
y = tokenGroup(doc, y, 'Pagos', [['Pendiente','#F59E0B'],['Pagado','#059669'],['Vencido','#EF4444']]);
y = tokenGroup(doc, y, 'Roles de Usuario', [
  ['Super Admin','#8B5CF6'],['Administrador','#3B82F6'],['Contable','#059669'],['Vendedor','#F97316'],['Observador','#6B7280'],
]);
y = tokenGroup(doc, y, 'Regiones de Leads', [
  ['Argentina','#3B82F6'],['Caribe','#06B6D4'],['Brasil','#22C55E'],['Europa','#8B5CF6'],['EEUU','#EF4444'],['Cruceros','#F97316'],['Otros','#6B7280'],
]);
y = tokenGroup(doc, y, 'Contabilidad', [
  ['Ingreso','#F59E0B'],['Egreso','#EF4444'],['Ganancia Cambio','#F59E0B'],['Perdida Cambio','#F97316'],['Pago Operador','#8B5CF6'],
]);

// ─── CONVENTIONS ──────────────────────────────────────────────────
doc.addPage(); y = M;
y = sectionHeader(doc, y, '09 — Convenciones de Color');
y += 2;

const rules = [
  ['Verde (Success)', 'Valores positivos, ingresos, estados exitosos, confirmaciones, activos contables', '#059669'],
  ['Rojo (Destructive)', 'Valores negativos, egresos, errores, cancelaciones, pasivos contables', '#EF4444'],
  ['Amarillo (Warning)', 'Pendientes, alertas, precauciones, estados que requieren atencion', '#F59E0B'],
  ['Azul (Info)', 'Informacion contextual, estados neutros, reservas, datos informativos', '#2196F3'],
];
for (const [name, desc, hex] of rules) {
  setFill(doc, C.bg); setDraw(doc, C.border); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W-2*M, 16, 2, 2, 'FD');
  setFill(doc, hex); doc.circle(M+8, y+5, 3, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); setColor(doc, C.dark); doc.text(name, M+16, y+7);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.muted); doc.text(desc, M+6, y+13);
  y += 20;
}
y += 4;

y = subHeader(doc, y, 'Reglas de uso');
const convRules = [
  'Usar financialColor(value) para colorear valores monetarios positivos/negativos',
  'Usar Badge variant="success-soft" para estados suaves en paneles admin',
  'Siempre incluir variante dark: cuando se usen colores hardcodeados',
  'Importar color maps desde @/lib/design-tokens, nunca definir localmente',
  'Para botones destructivos usar variant="destructive" en vez de className="bg-red-600"',
];
for (const rule of convRules) {
  setFill(doc, C.primary); doc.circle(M+3, y, 1.2, 'F');
  doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.dark); doc.text(rule, M+8, y+1);
  y += 7;
}

// ─── BACK COVER ───────────────────────────────────────────────────
doc.addPage();
setFill(doc, C.dark); doc.rect(0,0,W,H,'F');
setFill(doc, C.primary); doc.rect(0,0,W,4,'F');
doc.setFont('helvetica','bold'); doc.setFontSize(36); setColor(doc, C.white);
doc.text('Vibook', W/2, H/2-8, { align:'center' });
setFill(doc, C.primary); doc.rect(W/2-15, H/2+2, 30, 1.5, 'F');
doc.setFont('helvetica','normal'); doc.setFontSize(12); setColor(doc, '#94A3B8');
doc.text('Brand Kit — Febrero 2026', W/2, H/2+16, { align:'center' });
doc.setFontSize(10); setColor(doc, '#475569');
doc.text('vibook.ai', W/2, H/2+28, { align:'center' });
setFill(doc, C.primary); doc.rect(0, H-4, W, 4, 'F');

// ─── FOOTER & SAVE ───────────────────────────────────────────────
footer(doc);

const out = '/Users/tomiisanchezz/Desktop/Vibook-Brand-Kit.pdf';
const buf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(out, buf);
console.log(`Brand Kit PDF: ${out} (${(buf.length/1024).toFixed(0)} KB, ${doc.getNumberOfPages()} pages)`);
