/**
 * tasksShared — utilidades y componentes compartidos del módulo Tareas (app).
 * Usado por MisTareasScreen y TareasScreen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert,
  ActivityIndicator, TextInput, Image, Platform, Linking, KeyboardAvoidingView, Keyboard,
  Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { setStringAsync as copyToClipboard } from 'expo-clipboard';
import { API_URL } from '../../services/api';

export const ORANGE = '#F05A28';
export const BG = '#F4F6F8';

// Prioridad Eisenhower (igual que web): etiqueta corta para tarjetas.
export const EIS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  fuego:    { label: 'Urgente e importante',       short: '🔥 Urgente',           color: '#C0392B', bg: '#F9E5E2' },
  estrella: { label: 'Importante y no urgente',    short: '⭐ Importante',         color: '#2E7D46', bg: '#E4F1E8' },
  delegar:  { label: 'Urgente y no importante',    short: '🔄 Atención', color: '#B07206', bg: '#F7ECD5' },
  eliminar: { label: 'No importante y no urgente', short: '🗑️ Algún día',         color: '#5A6472', bg: '#ECEEF0' },
};
// Matriz Eisenhower — orden de lectura Q1..Q4.
export const QUADRANTS: Array<{ key: string; title: string; color: string; bg: string }> = [
  { key: 'fuego',    title: 'Importante y urgente',       color: '#C0392B', bg: '#FCEDEA' },
  { key: 'estrella', title: 'Importante y no urgente',    color: '#2E7D46', bg: '#ECF6EF' },
  { key: 'delegar',  title: 'Urgente y no importante',    color: '#B07206', bg: '#FAF3E4' },
  { key: 'eliminar', title: 'No importante y no urgente', color: '#5A6472', bg: '#F1F3F5' },
];

export const fmtDur = (ms: number): string => {
  if (!isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), mm = min % 60;
  if (h < 24) return `${h}h ${mm}m`;
  const d = Math.floor(h / 24), hh = h % 24;
  return `${d}d ${hh}h`;
};
// Milisegundos HÁBILES entre dos momentos: solo cuenta el horario laboral
// 10:30–18:30 (hora de México, UTC−6 fijo) de lunes a viernes. No cuenta
// noches ni fines de semana.
const MX_OFFSET_MS = 6 * 3600 * 1000; // México sin horario de verano (UTC−6)
const BIZ_START_MS = (10 * 60 + 30) * 60000; // 10:30
const BIZ_END_MS = (18 * 60 + 30) * 60000;   // 18:30
export const businessMs = (startMs: number, endMs: number): number => {
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return 0;
  const s = startMs - MX_OFFSET_MS;
  const e = endMs - MX_OFFSET_MS;
  const first = new Date(s);
  let day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  let total = 0;
  for (; day <= e; day += 86400000) {
    const dow = new Date(day).getUTCDay(); // 0=dom … 6=sáb
    if (dow === 0 || dow === 6) continue;
    const winStart = day + BIZ_START_MS;
    const winEnd = day + BIZ_END_MS;
    const ov = Math.min(e, winEnd) - Math.max(s, winStart);
    if (ov > 0) total += ov;
  }
  return total;
};
export const taskTime = (t: { created_at?: string; completed_at?: string; status?: string; updated_at?: string }) => {
  if (!t.created_at) return null;
  const start = new Date(t.created_at).getTime();
  // En espera de confirmación el reloj se CONGELA (updated_at). Se reanuda si un
  // comentario regresa la tarea a pendientes.
  const awaiting = t.status === 'awaiting_confirmation';
  const end = t.completed_at ? new Date(t.completed_at).getTime()
    : (awaiting && t.updated_at ? new Date(t.updated_at).getTime() : Date.now());
  return { done: !!t.completed_at, paused: awaiting, ms: businessMs(start, end) };
};
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

// Paleta de colores para autores de comentarios (estilo WhatsApp): cada
// usuario recibe un color distinto y estable a partir de su id. Antes salía
// todo el mundo en morado y los usuarios se confundían entre sí.
const AUTHOR_COLOR_PALETTE = [
  '#1976D2', '#7B1FA2', '#2E7D32', '#EF6C00', '#C2185B',
  '#00838F', '#5D4037', '#455A64', '#AD1457', '#0288D1',
  '#388E3C', '#F57C00', '#5E35B1', '#00695C', '#BF360C',
];
const authorColor = (id?: number | string | null, name?: string | null): string => {
  const key = String(id ?? name ?? '').trim();
  if (!key) return AUTHOR_COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AUTHOR_COLOR_PALETTE[hash % AUTHOR_COLOR_PALETTE.length];
};

// ── Usuarios asignables: agrupación por tipo + tiempo promedio (igual que web) ──
export interface UserOpt { id: number; full_name: string; role?: string; avg_resolution_seconds?: number | null; }
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Administración', admin: 'Administración', director: 'Dirección', finanzas: 'Finanzas',
  accountant: 'Contabilidad', abogado: 'Legal', branch_manager: 'Operación CEDIS', operaciones: 'Operaciones',
  warehouse_ops: 'Bodega', counter_staff: 'Mostrador', customer_service: 'Servicio a cliente',
  soporte_tecnico: 'Soporte técnico', advisor: 'Asesores', sub_advisor: 'Sub-asesores',
  repartidor: 'Repartidores', monitoreo: 'Monitoreo',
  external_partner: 'Grupo Rino', // usuarios sincronizados desde la app de Grupo Rino
};
export const roleGroup = (r?: string): string => ROLE_LABEL[String(r || '')] || (r ? r : 'Otros');
// Orden de grupos en el selector (los no listados van al final). Legal se oculta.
const GROUP_ORDER = ['Administración', 'Dirección', 'Servicio a cliente', 'Operación CEDIS', 'Contabilidad', 'Grupo Rino', 'Bodega', 'Monitoreo', 'Repartidores', 'Mostrador'];
const groupRank = (g: string): number => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length : i; };
const HIDDEN_GROUPS = new Set<string>(['Legal']);
const isPickableGroup = (r?: string): boolean => !HIDDEN_GROUPS.has(roleGroup(r));
export const avgLabel = (u: UserOpt): string => {
  const s = u.avg_resolution_seconds != null ? Number(u.avg_resolution_seconds) : null;
  return s && s > 0 ? `⏱ ${fmtDur(s * 1000)} prom.` : '⏱ sin datos';
};
// Adjuntos: distinguir imagen de documento (PDF/Excel/…).
export const isImgName = (name?: string): boolean => /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(String(name || ''));
export const fileEmoji = (name?: string): string => {
  const n = String(name || '').toLowerCase();
  if (/\.pdf$/.test(n)) return '📄';
  if (/\.(xls|xlsx|csv)$/.test(n)) return '📊';
  if (/\.(doc|docx)$/.test(n)) return '📝';
  return '📎';
};

// 'YYYY-MM-DDTHH:mm' en hora local (mismo formato que el datetime-local de web).
const toStamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ── Selector de involucrados (buscable, agrupado por tipo; "Yo" siempre incluido) ──
export function InvolvedPicker({ users, myId, selected, onChange, fixedLabel = 'Yo', frequent = [] }: {
  users: UserOpt[]; myId: number; selected: number[]; onChange: (ids: number[]) => void; fixedLabel?: string; frequent?: number[];
}) {
  const [q, setQ] = useState('');
  const [showGroups, setShowGroups] = useState(false);
  // Excluye el fijo y los grupos ocultos (Legal).
  const others = users.filter(u => u.id !== myId && isPickableGroup(u.role));
  const ql = q.trim().toLowerCase();
  const filtered = others.filter(u => !ql || u.full_name.toLowerCase().includes(ql) || roleGroup(u.role).toLowerCase().includes(ql))
    .sort((a, b) => groupRank(roleGroup(a.role)) - groupRank(roleGroup(b.role)) || roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name));
  // Agrupa por tipo para render.
  const groups: Array<{ g: string; items: UserOpt[] }> = [];
  filtered.forEach(u => {
    const g = roleGroup(u.role);
    let bucket = groups.find(x => x.g === g);
    if (!bucket) { bucket = { g, items: [] }; groups.push(bucket); }
    bucket.items.push(u);
  });
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  // Grupos (roles) para agregar a todos de un tipo, en el orden definido.
  const allGroups = Array.from(new Set(others.map(u => roleGroup(u.role))))
    .sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b));
  const addGroup = (g: string) => {
    const ids = others.filter(u => g === '__ALL__' || roleGroup(u.role) === g).map(u => u.id);
    onChange(Array.from(new Set([...selected, ...ids])));
    setShowGroups(false);
  };
  // Usuarios frecuentes: a quién asigno más (botones rápidos).
  const freqUsers = frequent
    .map(id => users.find(u => u.id === id))
    .filter((u): u is UserOpt => !!u && u.id !== myId)
    .slice(0, 8);
  return (
    <View>
      <View style={styles.involvedChips}>
        <View style={styles.meChip}><Text style={styles.meChipTxt}>{fixedLabel}</Text></View>
        {selected.map(id => {
          const u = users.find(x => x.id === id);
          if (!u) return null;
          return (
            <TouchableOpacity key={id} style={styles.selChip} onPress={() => toggle(id)}>
              <Text style={styles.selChipTxt}>{u.full_name}</Text>
              <Ionicons name="close" size={13} color="#5E35B1" />
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Grupos (desplegable) + usuarios frecuentes */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => setShowGroups(v => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: '#F0B79A', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: '#D6521C', fontWeight: '800', fontSize: 12.5 }}>👥 Grupos</Text>
          <Ionicons name={showGroups ? 'chevron-up' : 'chevron-down'} size={13} color="#D6521C" />
        </TouchableOpacity>
        {freqUsers.map(u => {
          const on = selected.includes(u.id);
          return (
            <TouchableOpacity key={u.id} onPress={() => toggle(u.id)}
              style={{ backgroundColor: on ? '#EDE7F6' : '#fff', borderWidth: 1, borderColor: on ? '#5E35B1' : '#ddd', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: on ? '#5E35B1' : '#555', fontWeight: '700', fontSize: 12.5 }}>{u.full_name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {showGroups && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, padding: 8, backgroundColor: '#FAF7F3', borderRadius: 10 }}>
          <TouchableOpacity onPress={() => addGroup('__ALL__')}
            style={{ backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: '#F0B79A', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: '#D6521C', fontWeight: '800', fontSize: 12.5 }}>👥 Todos los empleados</Text>
          </TouchableOpacity>
          {allGroups.map(g => (
            <TouchableOpacity key={g} onPress={() => addGroup(g)}
              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: '#555', fontWeight: '700', fontSize: 12.5 }}>+ {g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Buscar por nombre o tipo…" value={q} onChangeText={setQ} placeholderTextColor="#999" />
      <View style={styles.involvedList}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
          {groups.length === 0 ? <Text style={[styles.metaMuted, { padding: 10 }]}>Sin coincidencias.</Text> :
            groups.map(gr => (
              <View key={gr.g}>
                <Text style={styles.groupHead}>{gr.g}</Text>
                {gr.items.map(u => {
                  const on = selected.includes(u.id);
                  return (
                    <TouchableOpacity key={u.id} style={styles.optRow} onPress={() => toggle(u.id)}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#5E35B1' : '#AAA'} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optName}>{u.full_name}</Text>
                        <Text style={styles.optMeta}>{avgLabel(u)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ── Selector de prioridad Eisenhower (chips) ──
// Prioridades ofrecidas al CREAR una tarea nueva. Solo las dos que la operación
// usa de verdad; 'delegar' y 'eliminar' siguen disponibles al EDITAR y en la
// matriz, para no romper las tareas que ya las tienen.
const EIS_ALTA = ['fuego', 'estrella'];
// Compromiso de atención que se muestra junto a la prioridad AL CREAR. No se
// toca EIS: su `short` también pinta los chips de las tarjetas.
const EIS_ALTA_NOTA: Record<string, string> = { fuego: '24 hrs' };

// Palabras que delatan una tarea de dinero. Se compara sin acentos, así que
// "depósito" y "deposito" caen igual.
const RE_PAGO = /\b(pag(?:o|os|ar|are|aran|ando)|depos(?:ito|itos|itar)|abon(?:o|os|ar)|transferenc|liquidar|mensualidad|quincena|nomina)\b/;

/**
 * Prioridad de una tarea programada. Ya no se elige a mano: una programación
 * siempre es "Importante" salvo que sea ir a pagar o depositar, que es lo único
 * que no aguanta esperar (si la tarjeta se pasa de fecha, hay intereses).
 */
export function prioridadProgramada(titulo: string): string {
  const t = String(titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return RE_PAGO.test(t) ? 'fuego' : 'estrella';
}

function EisPicker({ value, onChange, soloAlta }: { value: string; onChange: (k: string) => void; soloAlta?: boolean }) {
  const opciones = soloAlta
    ? Object.entries(EIS).filter(([k]) => EIS_ALTA.includes(k))
    : Object.entries(EIS);
  return (
    <View style={styles.eisRow}>
      {opciones.map(([k, v]) => {
        const on = value === k;
        return (
          <TouchableOpacity key={k} onPress={() => onChange(k)}
            style={[styles.eisChip, { backgroundColor: on ? v.color : v.bg, borderColor: v.color }]}>
            <Text style={[styles.eisChipTxt, { color: on ? '#fff' : v.color }]}>
              {v.short}{soloAlta && EIS_ALTA_NOTA[k] ? ` (${EIS_ALTA_NOTA[k]})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Modal: crear tarea (mismas funciones que web) ──
export function CreateTaskModal({ visible, token, myId, onClose, onCreated, advisorMode }: {
  visible: boolean; token: string; myId: number; onClose: () => void; onCreated: () => void; advisorMode?: boolean;
}) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [frequent, setFrequent] = useState<number[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string; sections?: Array<{ id: number; name: string }> }>>([]);
  const altoTeclado = useAltoTeclado();
  const [catId, setCatId] = useState<number | null | undefined>(undefined); // undefined = sin elegir; null = Personal
  const [catSection, setCatSection] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [chkInput, setChkInput] = useState('');
  const agregarChk = () => {
    const v = chkInput.trim();
    if (!v) return;
    setChecklist((prev) => [...prev, v]);
    setChkInput('');
  };
  const [eis, setEis] = useState(''); // en blanco: obligatorio elegir
  const [dueOpt, setDueOpt] = useState<string>(''); // en blanco: fecha obligatoria
  // Fecha puesta en el calendario. Los atajos (Hoy, +3 días…) no alcanzaban
  // para nada que cayera más allá de la próxima semana.
  const [fechaCustom, setFechaCustom] = useState<Date | null>(null);
  const [involved, setInvolved] = useState<number[]>([]);
  const [assignee, setAssignee] = useState<number>(0); // responsable principal
  const [assigneeTouched, setAssigneeTouched] = useState(false); // el usuario eligió manualmente
  const [photos, setPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const H = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDesc(''); setEis(''); setDueOpt(''); setInvolved([]); setAssignee(0); setAssigneeTouched(false); setPhotos([]); setCatSection(null); setCatId(undefined);
    fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H })
      .then(r => r.json()).then(d => { setUsers(d.users || []); setFrequent(d.frequent || []); }).catch(() => {});
    fetch(`${API_URL}/api/tasks/categories`, { headers: H })
      .then(r => r.json()).then(d => {
        // Excluye el tablero personal: se representa como "Sin categoría".
        setCategories((d.categories || []).filter((c: any) => c.board_key !== 'personales'));
        setCatSection(null); // categoría queda sin elegir (obligatoria)
      }).catch(() => {});
  }, [visible]);

  // Responsable por default = primer involucrado seleccionado (después del creador);
  // si no hay involucrados, el creador. Se respeta si el usuario lo elige a mano.
  useEffect(() => {
    if (assigneeTouched) return;
    setAssignee(involved.length ? involved[0] : (myId || 0));
  }, [involved, myId, assigneeTouched, visible]);

  const dueStamp = (): string | null => {
    if (!dueOpt || dueOpt === 'none') return null;
    const d = new Date();
    if (dueOpt === 'custom' && fechaCustom) {
      d.setFullYear(fechaCustom.getFullYear(), fechaCustom.getMonth(), fechaCustom.getDate());
      // Si la fecha elegida es hoy, el cierre del día; cualquier otra, en la mañana.
      const esHoy = new Date().toDateString() === fechaCustom.toDateString();
      d.setHours(esHoy ? 18 : 9, 0, 0, 0);
    }
    else if (dueOpt === 'today') { d.setHours(18, 0, 0, 0); }
    else if (dueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else if (dueOpt === 'd3') { d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); }
    else if (dueOpt === 'week') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
    return toStamp(d);
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso', 'Se necesita acceso a las fotos.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPhotos(prev => [...prev, { uri: a.uri, name: a.fileName || 'foto.jpg', type: a.mimeType || 'image/jpeg' }]);
    } catch { /* */ }
  };
  const pickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/csv',
          'text/plain',
          'application/rtf',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled) return;
      const assets = res.assets || [];
      setPhotos(prev => [...prev, ...assets.map(a => ({ uri: a.uri, name: a.name || 'archivo', type: a.mimeType || 'application/octet-stream' }))]);
    } catch { Alert.alert('Error', 'No se pudo adjuntar el archivo'); }
  };

  const submit = async () => {
    if (busy) return; // anti doble-envío
    if (!title.trim()) { Alert.alert('Falta título', 'Escribe un título con verbo de acción.'); return; }
    if (!advisorMode && catId === undefined) { Alert.alert('Falta categoría', 'Selecciona una categoría (o «Personal»).'); return; }
    if (!eis) { Alert.alert('Falta prioridad', 'Selecciona la prioridad de la tarea.'); return; }
    if (!dueOpt) { Alert.alert('Falta fecha', 'Selecciona la fecha deseada.'); return; }
    if (!advisorMode && !assignee) { Alert.alert('Falta responsable', 'Elige quién es el responsable de la tarea. Solo esa persona la puede marcar como completada.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/tasks/personal`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc || null, eisenhower: eis, involved_ids: myId ? [myId, ...involved] : involved, assignee_id: assignee || myId || null, due_at: dueStamp(), board_id: catId ?? null, section_id: catSection,
          // El backend ya aceptaba subtasks al crear; solo la app no las mandaba.
          // Solo se manda si hay pasos: si va vacio, el backend deja de sembrar
          // el checklist del Filtro de Cierre en Flujo de Ventas.
          ...(checklist.length ? { subtasks: checklist.map((b) => ({ body: b })) } : {}) }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo crear', e.error || ''); setBusy(false); return; }
      const d = await r.json();
      const newId = d?.task?.id;
      for (const p of photos) {
        try {
          const fd = new FormData();
          fd.append('photo', { uri: p.uri, name: p.name || 'foto.jpg', type: p.type || 'image/jpeg' } as any);
          await fetch(`${API_URL}/api/tasks/${newId}/attachments`, { method: 'POST', headers: H, body: fd });
        } catch { /* continúa */ }
      }
      onCreated(); onClose();
    } catch { Alert.alert('Error', 'No se pudo crear la tarea'); } finally { setBusy(false); }
  };

  const DUE_OPTS = [
    { k: 'today', l: 'Hoy' }, { k: 'tomorrow', l: 'Mañana' },
    { k: 'd3', l: '+3 días' }, { k: 'week', l: 'Próx. semana' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, altoTeclado > 0 && { marginBottom: altoTeclado, maxHeight: '78%' }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Nueva tarea</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLbl}>Título</Text>
            <TextInput style={styles.input} placeholder="Usa un verbo de acción…" value={title} onChangeText={setTitle} placeholderTextColor="#999" />
            {!advisorMode && (<>
            <Plegable
              titulo="Categoría (flujo)"
              resumen={catId === null ? 'Personal' : (categories.find(c => c.id === catId)?.name || 'Sin elegir')}
            >
            <SelectorLista
              opciones={[{ k: null, l: 'Personal' }, ...categories.map(c => ({ k: c.id, l: c.name }))]}
              valor={catId}
              onChange={k => { setCatId(k); setCatSection(null); }}
            />
            <Text style={styles.helpTxt}>«Personal» solo va a tu panel personal. Con categoría, aparece en ese flujo.</Text>
            {(() => {
              const secs = categories.find(c => c.id === catId)?.sections || [];
              return secs.length > 0 ? (
                <>
                  <Text style={styles.fieldLbl}>Sub-sección</Text>
                  <SelectorLista
                    opciones={[{ k: null, l: 'Sin sub-sección' }, ...secs.map((x: any) => ({ k: x.id, l: x.name }))]}
                    valor={catSection ?? null}
                    onChange={setCatSection}
                  />
                </>
              ) : null;
            })()}
            </Plegable>
            </>)}
            <Text style={styles.fieldLbl}>Descripción</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Detalles (opcional)…" value={desc} onChangeText={setDesc} multiline placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Prioridad (Eisenhower)</Text>
            <EisPicker value={eis} onChange={setEis} soloAlta />
            <Plegable
              titulo="Fecha deseada"
              resumen={
                dueOpt === 'custom' && fechaCustom
                  ? fechaCustom.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'long' })
                  : (DUE_OPTS.find(o => o.k === dueOpt)?.l || 'Sin elegir')
              }
            >
            <View style={styles.eisRow}>
              {DUE_OPTS.map(o => (
                <TouchableOpacity key={o.k} onPress={() => { setDueOpt(o.k); setFechaCustom(null); }}
                  style={[styles.dateChip, dueOpt === o.k && styles.dateChipOn]}>
                  <Text style={[styles.dateChipTxt, dueOpt === o.k && { color: '#fff' }]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLbl, { marginTop: 10 }]}>O elígela en el calendario</Text>
            <Calendario valor={fechaCustom} onChange={d => { setFechaCustom(d); setDueOpt('custom'); }} />
            </Plegable>
            {/* Checklist opcional. El backend ya la aceptaba al crear; la app
                simplemente no la ofrecia, asi que habia que crear la tarea,
                abrirla y agregar los pasos uno por uno. */}
            <Text style={styles.fieldLbl}>Checklist (opcional)</Text>
            {checklist.map((b, i) => (
              <View key={`${b}-${i}`} style={styles.subRow}>
                <Ionicons name="square-outline" size={20} color="#999" />
                <Text style={styles.subTxt}>{b}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => setChecklist((prev) => prev.filter((_, k) => k !== i))}>
                  <Ionicons name="trash-outline" size={16} color="#BBB" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addSubRow}>
              <TextInput style={styles.input} placeholder="Agregar paso…" value={chkInput}
                onChangeText={setChkInput} onSubmitEditing={agregarChk} returnKeyType="done"
                placeholderTextColor="#999" />
              <TouchableOpacity style={styles.addBtn} onPress={agregarChk}><Text style={styles.addBtnTxt}>Agregar</Text></TouchableOpacity>
            </View>
            {!advisorMode && (<>
            <Plegable
              titulo="Involucrados"
              resumen={involved.length === 0 ? 'Solo tú' : `Tú y ${involved.length} más`}
            >
            <InvolvedPicker users={users} myId={myId} selected={involved} onChange={setInvolved} frequent={frequent} />
            </Plegable>
            <Text style={styles.helpTxt}>Tú siempre quedas incluido. Agrega a quien deba participar.</Text>

            <Text style={styles.fieldLbl}>Responsable <Text style={{ color: '#C0392B' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from(new Set<number>([...(myId ? [myId] : []), ...involved])).map((cid) => {
                const nombre = cid === myId ? 'Yo' : (users.find((u: any) => u.id === cid)?.full_name || `#${cid}`);
                const on = assignee === cid;
                return (
                  <TouchableOpacity key={cid} onPress={() => { setAssignee(cid); setAssigneeTouched(true); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: on ? ORANGE : '#D8D8DD', backgroundColor: on ? ORANGE : '#FFF' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#FFF' : '#333' }}>{nombre}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helpTxt}>El responsable ejecuta la tarea y la envía a confirmación. Solo tú (quien la asigna) puedes marcarla como completada.</Text>
            </>)}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <Text style={[styles.fieldLbl, { marginTop: 0 }]}>Archivos {photos.length > 0 && `(${photos.length})`}</Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <TouchableOpacity onPress={pickPhoto} style={styles.photoBtn}><Ionicons name="camera-outline" size={16} color={ORANGE} /><Text style={styles.photoBtnTxt}>Foto</Text></TouchableOpacity>
                <TouchableOpacity onPress={pickDoc} style={styles.photoBtn}><Ionicons name="document-attach-outline" size={16} color={ORANGE} /><Text style={styles.photoBtnTxt}>PDF/Excel</Text></TouchableOpacity>
              </View>
            </View>
            {photos.length > 0 && (
              <View style={styles.photoGrid}>
                {photos.map((p, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    {isImgName(p.name) ? (
                      <Image source={{ uri: p.uri }} style={styles.photo} />
                    ) : (
                      <View style={styles.fileChip}>
                        <Text style={{ fontSize: 22 }}>{fileEmoji(p.name)}</Text>
                        <Text style={styles.fileChipTxt} numberOfLines={2}>{p.name}</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} style={styles.photoDel}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFoot}>
            <TouchableOpacity style={[styles.completeBtn, { backgroundColor: ORANGE }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="add-circle" size={18} color="#fff" /><Text style={styles.completeTxt}>Crear tarea</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Modal: programar tarea (futura / recurrente) ──
export function ScheduleTaskModal({ visible, token, myId, onClose, onCreated, advisorMode }: {
  visible: boolean; token: string; myId: number; onClose: () => void; onCreated: () => void; advisorMode?: boolean;
}) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [frequent, setFrequent] = useState<number[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string; sections?: Array<{ id: number; name: string }> }>>([]);
  const altoTeclado = useAltoTeclado();
  const [catId, setCatId] = useState<number | null>(null);
  const [catSection, setCatSection] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  // Programación que se está editando (null = alta nueva).
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [fechaTocada, setFechaTocada] = useState(false);
  // Mes de la primera ejecución (0=enero). null = el más próximo, que era el
  // único comportamiento posible: no había forma de programar "1 de enero"
  // porque el selector solo elegía el día y el mes siempre era el actual.
  const [mesElegido, setMesElegido] = useState<number | null>(null);
  // Las parrillas de día y mes se pliegan solas al elegir: 31 + 12 botones
  // abiertos tapaban el resto del formulario. Se reabren tocando el renglón.
  const [abrirDia, setAbrirDia] = useState(false);
  const [abrirMes, setAbrirMes] = useState(false);
  const scrollProgRef = React.useRef<ScrollView>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [chkInput, setChkInput] = useState('');
  const agregarChk = () => {
    const v = chkInput.trim();
    if (!v) return;
    setChecklist((prev) => [...prev, v]);
    setChkInput('');
  };
  const [dayOpt, setDayOpt] = useState('tomorrow');
  // Día del mes elegido (1..31). null = usar los atajos de arriba.
  const [diaMes, setDiaMes] = useState<number | null>(null);
  const [hour, setHour] = useState(9);
  const [recurrence, setRecurrence] = useState('none');
  const [ordinal, setOrdinal] = useState(1);   // 1..4 o -1 (último)
  const [weekday, setWeekday] = useState(1);   // 0=domingo..6=sábado
  const [involved, setInvolved] = useState<number[]>([]);
  const [assignee, setAssignee] = useState<number>(0); // responsable principal
  const [assigneeTouched, setAssigneeTouched] = useState(false); // el usuario eligió manualmente
  const [busy, setBusy] = useState(false);
  const H = { Authorization: `Bearer ${token}` };

  const loadSchedules = () => fetch(`${API_URL}/api/tasks/schedules`, { headers: H })
    .then(r => r.json()).then(d => setSchedules(d.schedules || [])).catch(() => {});
  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDesc(''); setDayOpt('tomorrow'); setDiaMes(null); setMesElegido(null); setHour(9); setRecurrence('none'); setOrdinal(1); setWeekday(1); setInvolved([]); setAssignee(0); setAssigneeTouched(false); setCatSection(null);
    fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H }).then(r => r.json()).then(d => { setUsers(d.users || []); setFrequent(d.frequent || []); }).catch(() => {});
    fetch(`${API_URL}/api/tasks/categories`, { headers: H }).then(r => r.json()).then(d => {
      setCategories((d.categories || []).filter((c: any) => c.board_key !== 'personales'));
      setCatId(null); // Sin categoría por defecto
    }).catch(() => {});
    loadSchedules();
  }, [visible]);

  // Responsable por default = primer involucrado seleccionado; si no hay
  // involucrados, el creador. Se respeta si el usuario lo elige a mano.
  useEffect(() => {
    if (assigneeTouched) return;
    setAssignee(involved.length ? involved[0] : (myId || 0));
  }, [involved, myId, assigneeTouched, visible]);

  const firstRunStamp = (): string => {
    const d = new Date();
    if (diaMes) {
      d.setHours(hour, 0, 0, 0);
      if (mesElegido != null) {
        // Mes explícito: si esa fecha ya pasó este año, se va al año siguiente.
        // Así "1 de enero" queda en el próximo enero y no en el que ya pasó.
        d.setMonth(mesElegido, 1);
        const ultimo = new Date(d.getFullYear(), mesElegido + 1, 0).getDate();
        d.setDate(Math.min(diaMes, ultimo));
        if (d.getTime() <= Date.now()) {
          d.setFullYear(d.getFullYear() + 1);
          const ultimoProx = new Date(d.getFullYear(), mesElegido + 1, 0).getDate();
          d.setMonth(mesElegido, Math.min(diaMes, ultimoProx));
        }
        return toStamp(d);
      }
      // Sin mes: el día elegido del mes en curso; si ya pasó, el mes siguiente.
      const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(diaMes, ultimoDia));
      if (d.getTime() <= Date.now()) {
        d.setMonth(d.getMonth() + 1);
        const ultimoSig = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(diaMes, ultimoSig));
      }
      return toStamp(d);
    }
    if (dayOpt === 'today') { /* hoy */ }
    else if (dayOpt === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (dayOpt === 'd3') d.setDate(d.getDate() + 3);
    else if (dayOpt === 'week') d.setDate(d.getDate() + 7);
    d.setHours(hour, 0, 0, 0);
    return toStamp(d);
  };

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Falta título', 'Escribe un título con verbo de acción.'); return; }
    if (!advisorMode && !assignee) { Alert.alert('Falta responsable', 'Elige quién será el responsable de la tarea programada.'); return; }
    setBusy(true);
    try {
      const involvedIds = myId ? [myId, ...involved] : involved;
      const body: any = { title: title.trim(), description: desc || null, eisenhower: prioridadProgramada(title), involved_ids: involvedIds, assignee_id: assignee || myId || null, recurrence, board_id: catId, section_id: catSection };
      // El checklist se guarda en la programacion y se siembra en CADA tarea que
      // genere, para no recapturar los mismos pasos en cada repeticion.
      if (checklist.length) body.subtasks = checklist.map((b) => ({ body: b }));
      if (recurrence === 'monthly_weekday') {
        // La ocurrencia sale de la fecha de primera ejecución: si cae en el 3er
        // lunes, se repite cada 3er lunes. Así el usuario solo elige el día de
        // la semana y la fecha, sin llenar ordinal ni hora por separado.
        const base = new Date(firstRunStamp());
        const dm = base.getDate();
        body.recur_ordinal = dm > 28 ? -1 : Math.ceil(dm / 7);
        body.recur_weekday = weekday;
        body.hour = base.getHours();
        body.minute = base.getMinutes();
      }
      // Al editar, la proxima corrida solo se mueve si el usuario tocó la fecha:
      // cambiar el titulo no debe reprogramar algo que ya estaba por dispararse.
      else if (editandoId == null || fechaTocada) { body.first_run_at = firstRunStamp(); }

      const editando = editandoId != null;
      const r = await fetch(
        editando ? `${API_URL}/api/tasks/schedules/${editandoId}` : `${API_URL}/api/tasks/schedules`,
        {
          method: editando ? 'PUT' : 'POST',
          headers: { ...H, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        Alert.alert(editando ? 'No se pudo guardar' : 'No se pudo programar', e.error || '');
        setBusy(false); return;
      }
      limpiarEdicion();
      loadSchedules(); onCreated();
      Alert.alert(
        editando ? 'Guardada' : 'Programada',
        editando ? 'La programación quedó actualizada.' : 'La tarea se creará automáticamente en la fecha elegida.');
    } catch { Alert.alert('Error', 'No se pudo programar'); } finally { setBusy(false); }
  };
  const del = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/tasks/schedules/${id}`, { method: 'DELETE', headers: H });
      if (editandoId === id) limpiarEdicion();
      loadSchedules();
    } catch { /* */ }
  };

  /** Deja el formulario listo para un alta nueva. */
  const limpiarEdicion = () => {
    setEditandoId(null); setFechaTocada(false);
    setTitle(''); setDesc(''); setInvolved([]); setAssignee(0); setAssigneeTouched(false);
    setChecklist([]); setChkInput(''); setRecurrence('none'); setDiaMes(null); setMesElegido(null);
  };

  /** Carga una programación existente en el formulario para editarla. */
  const editar = (s: any) => {
    // La lista vive hasta abajo: sin subir la pantalla, tocar el lápiz parecía
    // no hacer nada porque el formulario queda fuera de vista.
    scrollProgRef.current?.scrollTo({ y: 0, animated: true });
    setEditandoId(Number(s.id));
    setFechaTocada(false);
    setTitle(String(s.title || ''));
    setDesc(String(s.description || ''));
    setRecurrence(String(s.recurrence || 'none'));
    setAssignee(Number(s.assignee_id) || 0);
    setAssigneeTouched(true);
    setCatId(s.board_id ?? null);
    setCatSection(s.section_id ?? null);
    const inv = Array.isArray(s.involved_ids) ? s.involved_ids.map((x: any) => Number(x)).filter((x: number) => x && x !== myId) : [];
    setInvolved(inv);
    setChecklist(Array.isArray(s.subtasks) ? s.subtasks.map((x: any) => String(x?.body ?? x ?? '')).filter(Boolean) : []);
    // Día y mes de la próxima corrida, para que al abrirla se vea cuándo toca.
    if (s.next_run_at) {
      const n = new Date(s.next_run_at);
      if (!isNaN(n.getTime())) { setDiaMes(n.getDate()); setMesElegido(n.getMonth()); setHour(n.getHours()); }
    }
  };

  const DAY_OPTS = [{ k: 'today', l: 'Hoy' }, { k: 'tomorrow', l: 'Mañana' }, { k: 'd3', l: '+3 días' }, { k: 'week', l: 'Próx. semana' }];
  const HOURS = [9, 12, 15, 18];
  const RECUR = [{ k: 'none', l: 'Una vez' }, { k: 'daily', l: 'Diaria' }, { k: 'weekly', l: 'Semanal' }, { k: 'monthly', l: 'Mensual' }, { k: 'yearly', l: 'Anual' }, { k: 'monthly_weekday', l: 'Día de semana' }];
  const RECUR_LABEL: Record<string, string> = { none: 'Una vez', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual', monthly_weekday: 'Mensual (día de semana)' };
  // Los 31 días del mes. Antes solo se podía elegir Hoy / Mañana / +3 / Próx.
  // semana, así que no había forma de programar "el 15 de cada mes".
  const DIAS_MES = Array.from({ length: 31 }, (_, i) => i + 1);
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  /** Resumen legible de la programación, para el encabezado plegado. */
  const resumenCuando = (): string => {
    const rep = RECUR.find(r => r.k === recurrence)?.l || '';
    const cuando = diaMes
      ? `día ${diaMes}${mesElegido != null ? ` de ${MESES[mesElegido]}` : ''}`
      : (DAY_OPTS.find(d => d.k === dayOpt)?.l || '');
    return `${rep} · ${cuando} · ${String(hour).padStart(2, '0')}:00`;
  };
  const WEEKDAYS = [{ v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mié' }, { v: 4, l: 'Jue' }, { v: 5, l: 'Vie' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' }];
  const WD_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const ORD_FULL: Record<number, string> = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', 4: 'Cuarto', [-1]: 'Último' };
  const schedLabel = (s: any): string => s.recurrence === 'monthly_weekday' && s.recur_ordinal != null
    ? `${ORD_FULL[s.recur_ordinal] || ''} ${WD_FULL[s.recur_weekday] || ''} del mes`.trim()
    : (RECUR_LABEL[s.recurrence] || 'Una vez');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, altoTeclado > 0 && { marginBottom: altoTeclado, maxHeight: '78%' }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>📅 Programar tarea</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView ref={scrollProgRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.helpTxt}>La tarea se creará automáticamente en la fecha y hora elegidas. Si es recurrente, se regenera en cada ciclo.</Text>
            <Text style={styles.fieldLbl}>Título</Text>
            <TextInput style={styles.input} placeholder="Usa un verbo de acción…" value={title} onChangeText={setTitle} placeholderTextColor="#999" />
            {/* Checklist opcional. El backend ya la aceptaba al crear; la app
                simplemente no la ofrecia, asi que habia que crear la tarea,
                abrirla y agregar los pasos uno por uno. */}
            <Text style={styles.fieldLbl}>Checklist (opcional)</Text>
            {checklist.map((b, i) => (
              <View key={`${b}-${i}`} style={styles.subRow}>
                <Ionicons name="square-outline" size={20} color="#999" />
                <Text style={styles.subTxt}>{b}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => setChecklist((prev) => prev.filter((_, k) => k !== i))}>
                  <Ionicons name="trash-outline" size={16} color="#BBB" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addSubRow}>
              <TextInput style={styles.input} placeholder="Agregar paso…" value={chkInput}
                onChangeText={setChkInput} onSubmitEditing={agregarChk} returnKeyType="done"
                placeholderTextColor="#999" />
              <TouchableOpacity style={styles.addBtn} onPress={agregarChk}><Text style={styles.addBtnTxt}>Agregar</Text></TouchableOpacity>
            </View>
            {!advisorMode && (<>
            <Plegable
              titulo="Categoría (flujo)"
              resumen={catId === null ? 'Personal' : (categories.find(c => c.id === catId)?.name || 'Sin elegir')}
            >
            <SelectorLista
              opciones={[{ k: null, l: 'Personal' }, ...categories.map(c => ({ k: c.id, l: c.name }))]}
              valor={catId ?? null}
              onChange={k => { setCatId(k); setCatSection(null); }}
            />
            {(() => {
              const secs = categories.find(c => c.id === catId)?.sections || [];
              return secs.length > 0 ? (
                <>
                  <Text style={styles.fieldLbl}>Sub-sección</Text>
                  <SelectorLista
                    opciones={[{ k: null, l: 'Sin sub-sección' }, ...secs.map((x: any) => ({ k: x.id, l: x.name }))]}
                    valor={catSection ?? null}
                    onChange={setCatSection}
                  />
                </>
              ) : null;
            })()}
            </Plegable>
            </>)}
            <Text style={styles.fieldLbl}>Descripción</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Detalles (opcional)…" value={desc} onChangeText={setDesc} multiline placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Prioridad</Text>
            {/* La prioridad de una programación ya no se elige: sale del título.
                Todas son "Importante" menos las de pagar o depositar. */}
            {(() => {
              const k = prioridadProgramada(title);
              const v = (EIS as any)[k];
              return (
                <View style={[styles.eisChip, { alignSelf: 'flex-start', backgroundColor: v.bg, borderColor: v.color }]}>
                  <Text style={[styles.eisChipTxt, { color: v.color }]}>
                    {v.short}{k === 'fuego' ? ' · es un pago' : ''}
                  </Text>
                </View>
              );
            })()}
            <Text style={styles.helpTxt}>
              Las programaciones se registran como Importante. Si el título habla de pagar o
              depositar, se marca Urgente sola.
            </Text>
            {/* Todo el "cuándo" en una sola sección plegable: repetición,
                primera ejecución, día, mes y hora. Abiertos a la vez eran una
                pared de ~50 botones y había que adivinar dónde estaba cada cosa. */}
            <Plegable titulo="Cuándo" resumen={resumenCuando()}>
              <Text style={styles.fieldLbl}>Repetir</Text>
              <View style={styles.eisRow}>
                {RECUR.map(o => (
                  <TouchableOpacity key={o.k} onPress={() => setRecurrence(o.k)} style={[styles.dateChip, recurrence === o.k && styles.dateChipOn]}>
                    <Text style={[styles.dateChipTxt, recurrence === o.k && { color: '#fff' }]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* "Día de semana" ya solo pide el día: la ocurrencia (1er, 2do…) y la
                  hora se deducen de la fecha de primera ejecución que se elige
                  abajo, así no hay que llenar lo mismo dos veces. */}
              {recurrence === 'monthly_weekday' && (
                <>
                  <Text style={styles.fieldLbl}>Día de la semana</Text>
                  <View style={styles.eisRow}>
                    {WEEKDAYS.map(o => (
                      <TouchableOpacity key={o.v} onPress={() => setWeekday(o.v)} style={[styles.dateChip, weekday === o.v && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, weekday === o.v && { color: '#fff' }]}>{o.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Atajos de primera ejecución. Desaparecen cuando ya se fijó un día
                  del mes: son la otra forma de decidir lo mismo. */}
              {!diaMes && (<>
              <Text style={styles.fieldLbl}>Primera ejecución</Text>
              <View style={styles.eisRow}>
                {DAY_OPTS.map(o => (
                  <TouchableOpacity key={o.k} onPress={() => { setDayOpt(o.k); setDiaMes(null); setFechaTocada(true); }}
                    style={[styles.dateChip, dayOpt === o.k && styles.dateChipOn]}>
                    <Text style={[styles.dateChipTxt, dayOpt === o.k && { color: '#fff' }]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              </>)}

              {/* Día exacto del mes. Si el elegido ya pasó, la primera ejecución se
                  va al mes siguiente; y en meses cortos se ajusta al último día
                  (elegir 31 en febrero cae en el 28 o 29). */}
              {!diaMes || abrirDia ? (
                <>
                  <Text style={[styles.fieldLbl, { marginTop: 10 }]}>
                    {diaMes ? 'Día del mes' : 'O elige el día del mes'}
                  </Text>
                  <View style={styles.eisRow}>
                    {DIAS_MES.map(d => (
                      <TouchableOpacity key={d}
                        onPress={() => {
                          const nuevo = diaMes === d ? null : d;
                          setDiaMes(nuevo);
                          setFechaTocada(true);
                          setAbrirDia(false);
                          // Al soltar el día ya no hay mes que elegir.
                          if (!nuevo) { setMesElegido(null); setAbrirMes(false); }
                        }}
                        style={[styles.dayCell, diaMes === d && styles.dateChipOn]}>
                        <Text style={[styles.dayCellTxt, diaMes === d && { color: '#fff' }]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <FilaElegida etiqueta="Día del mes" valor={`día ${diaMes}`} onPress={() => setAbrirDia(true)} />
              )}

              {/* Mes de la primera ejecución. Solo aparece cuando ya se eligió un
                  día: sirve para fechas fijas del año ("1 de enero"), que antes
                  no se podían programar. */}
              {!!diaMes && (
                mesElegido == null || abrirMes ? (
                <>
                  <Text style={[styles.fieldLbl, { marginTop: 10 }]}>
                    Mes{mesElegido != null ? ` · ${MESES[mesElegido]}` : ' · el más próximo'}
                  </Text>
                  <View style={styles.eisRow}>
                    {MESES.map((m, i) => (
                      <TouchableOpacity key={m}
                        onPress={() => {
                          const nuevo = mesElegido === i ? null : i;
                          setMesElegido(nuevo);
                          setFechaTocada(true);
                          setAbrirMes(false);
                        }}
                        style={[styles.dateChip, mesElegido === i && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, mesElegido === i && { color: '#fff' }]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
                ) : (
                  <FilaElegida etiqueta="Mes" valor={MESES[mesElegido]} onPress={() => setAbrirMes(true)} />
                )
              )}

              <Text style={[styles.fieldLbl, { marginTop: 10 }]}>Hora</Text>
              <View style={styles.eisRow}>
                {HOURS.map(h => (
                  <TouchableOpacity key={h} onPress={() => { setHour(h); setFechaTocada(true); }} style={[styles.dateChip, hour === h && styles.dateChipOn]}>
                    <Text style={[styles.dateChipTxt, hour === h && { color: '#fff' }]}>{String(h).padStart(2, '0')}:00</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Plegable>
            {!advisorMode && (<>
            <Plegable
              titulo="Involucrados"
              resumen={involved.length === 0 ? 'Solo tú' : `Tú y ${involved.length} más`}
            >
            <InvolvedPicker users={users} myId={myId} selected={involved} onChange={setInvolved} frequent={frequent} />
            </Plegable>
            <Text style={styles.helpTxt}>Tú siempre quedas incluido. Agrega a quien deba participar.</Text>

            <Text style={styles.fieldLbl}>Responsable <Text style={{ color: '#C0392B' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Array.from(new Set<number>([...(myId ? [myId] : []), ...involved])).map((cid) => {
                const nombre = cid === myId ? 'Yo' : (users.find((u: any) => u.id === cid)?.full_name || `#${cid}`);
                const on = assignee === cid;
                return (
                  <TouchableOpacity key={cid} onPress={() => { setAssignee(cid); setAssigneeTouched(true); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: on ? ORANGE : '#D8D8DD', backgroundColor: on ? ORANGE : '#FFF' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#FFF' : '#333' }}>{nombre}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helpTxt}>Cada tarea que genere esta programación quedará a cargo de esta persona.</Text>
            </>)}

            {schedules.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Programaciones activas</Text>
                {editandoId != null && (
                  <Text style={{ fontSize: 11.5, color: '#B07206', fontWeight: '700', marginBottom: 6 }}>
                    Editando una programación · los cambios se guardan con el botón de abajo
                  </Text>
                )}
                {schedules.map(s => (
                  <View key={s.id} style={styles.schedRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.schedTitle} numberOfLines={1}>{s.title}</Text>
                      <Text style={styles.optMeta}>
                        {schedLabel(s)} · próxima: {fmtDate(s.next_run_at)}
                        {s.assignee_name ? ` · ${Number(s.assignee_id) === Number(myId) ? 'Yo' : s.assignee_name}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => editar(s)} hitSlop={8} style={{ marginRight: 14 }}>
                      <Ionicons name="create-outline" size={18} color={ORANGE} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => del(s.id)} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#BBB" /></TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFoot}>
            {editandoId != null && (
              <TouchableOpacity onPress={limpiarEdicion} style={{ paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: '#9AA0A6', fontWeight: '700', fontSize: 12.5 }}>Cancelar edición</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.completeBtn, { backgroundColor: '#B07206' }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={editandoId != null ? 'save' : 'calendar'} size={18} color="#fff" />
                  <Text style={styles.completeTxt}>{editandoId != null ? 'Guardar cambios' : 'Programar'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface TaskT {
  id: number; board_id?: number; column_id?: number; section_id?: number | null;
  title: string; description?: string; assignee_id?: number; assignee_name?: string;
  due_at?: string; eisenhower: string; status: string; created_at?: string; completed_at?: string;
  started_at?: string; updated_at?: string;
  subtasks_total?: number; subtasks_done?: number; overdue?: boolean;
  board_name?: string; board_key?: string; column_name?: string; participants_count?: number; unread_count?: number;
}

/**
 * ¿Esta tarea está esperando algo de MÍ?
 *
 * Cuando una tarea queda "en espera de confirmación" deja de ser trabajo del
 * responsable y pasa a ser trabajo de quien la asignó: le toca revisarla y
 * cerrarla. Antes el conteo de pendientes solo miraba al responsable, así que
 * quien las creó veía "Sin tareas pendientes" con cuatro esperando su
 * confirmación, y el responsable las seguía cargando aunque ya no pudiera
 * hacer nada con ellas.
 */
export function esPendienteDeMi(t: any, myId?: number | null): boolean {
  if (!myId || !t || t.status === 'completed') return false;
  if (t.status === 'awaiting_confirmation') return Number(t.created_by) === Number(myId);
  return Number(t.assignee_id) === Number(myId);
}

/** ¿Soy yo quien tiene que confirmarla? (para rotular la etiqueta) */
export const esperaMiConfirmacion = (t: any, myId?: number | null): boolean =>
  !!myId && t?.status === 'awaiting_confirmation' && Number(t.created_by) === Number(myId);

/**
 * Sección plegable para los formularios de tarea.
 *
 * Los selectores estaban todos abiertos a la vez —categorías, involucrados,
 * días del mes, meses, horas— y el formulario se convertía en una pared de
 * botones donde había que hacer scroll a ciegas. Cada sección se colapsa y
 * muestra en el encabezado lo que ya está elegido, así se ve el estado
 * completo sin abrir nada.
 */
/**
 * Lista de una sola opción, con scroll propio. Sustituye a las filas de chips:
 * con nueve flujos, los botones se envolvían en cuatro renglones y había que
 * leerlos todos para encontrar el que buscabas.
 */
export function SelectorLista({ opciones, valor, onChange }: {
  opciones: { k: number | null; l: string }[];
  valor: number | null | undefined;
  onChange: (k: number | null) => void;
}) {
  return (
    <View style={styles.listaSel}>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {opciones.map(o => {
          const on = valor === o.k;
          return (
            <TouchableOpacity key={String(o.k)} onPress={() => onChange(o.k)} style={styles.listaOpt}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? ORANGE : '#C9CDD2'} />
              <Text style={[styles.listaOptTxt, on && styles.listaOptTxtOn]}>{o.l}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Calendario de mes, escrito a mano: la app no trae datetimepicker y meter la
 * dependencia a horas de un build de tienda no valía el riesgo. Empieza en
 * lunes, no deja elegir días ya pasados y navega mes a mes, que es todo lo que
 * hace falta para poner una fecha deseada.
 */
export function Calendario({ valor, onChange }: { valor: Date | null; onChange: (d: Date) => void }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [cursor, setCursor] = useState(() => {
    const b = valor || new Date();
    return new Date(b.getFullYear(), b.getMonth(), 1);
  });
  const anio = cursor.getFullYear();
  const mes = cursor.getMonth();
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  // getDay() manda 0 en domingo; se corre para que la semana empiece en lunes.
  const hueco = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const celdas: (number | null)[] = [
    ...Array.from({ length: hueco }, () => null),
    ...Array.from({ length: diasDelMes }, (_, i) => i + 1),
  ];
  const mesAnterior = new Date(anio, mes - 1, 1);
  const puedeAtras = mesAnterior >= new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  return (
    <View style={styles.cal}>
      <View style={styles.calCab}>
        <TouchableOpacity hitSlop={10} disabled={!puedeAtras}
          onPress={() => setCursor(new Date(anio, mes - 1, 1))}>
          <Ionicons name="chevron-back" size={20} color={puedeAtras ? '#444' : '#DDD'} />
        </TouchableOpacity>
        <Text style={styles.calMes}>{MES_LARGO[mes]} {anio}</Text>
        <TouchableOpacity hitSlop={10} onPress={() => setCursor(new Date(anio, mes + 1, 1))}>
          <Ionicons name="chevron-forward" size={20} color="#444" />
        </TouchableOpacity>
      </View>
      <View style={styles.calFila}>
        {DOW.map((d, i) => <Text key={i} style={styles.calDow}>{d}</Text>)}
      </View>
      <View style={styles.calFila}>
        {celdas.map((d, i) => {
          if (d === null) return <View key={`h${i}`} style={styles.calCelda} />;
          const fecha = new Date(anio, mes, d);
          const pasado = fecha < hoy;
          const esHoy = fecha.getTime() === hoy.getTime();
          const on = !!valor && valor.getFullYear() === anio && valor.getMonth() === mes && valor.getDate() === d;
          return (
            <TouchableOpacity key={d} disabled={pasado} onPress={() => onChange(fecha)} style={styles.calCelda}>
              <View style={[styles.calDia, on && styles.calDiaOn, !on && esHoy && styles.calDiaHoy]}>
                <Text style={[styles.calTxt, pasado && { color: '#CFCFCF' }, on && { color: '#fff', fontWeight: '800' }]}>{d}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Renglón compacto que sustituye a una parrilla ya resuelta: muestra lo elegido
 * y se vuelve a abrir al tocarlo. Sin esto, elegir "día 4 de enero" dejaba 43
 * botones en pantalla que ya no servían para nada.
 */
export function FilaElegida({ etiqueta, valor, onPress }: { etiqueta: string; valor: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.filaElegida} activeOpacity={0.7}>
      <Text style={styles.filaElegidaLbl}>{etiqueta}</Text>
      <Text style={styles.filaElegidaVal}>{valor}</Text>
      <Ionicons name="chevron-down" size={15} color="#9AA0A6" />
    </TouchableOpacity>
  );
}

export function Plegable({
  titulo, resumen, children, abiertoInicial = false, requerido = false,
}: {
  titulo: string; resumen?: string; children: React.ReactNode;
  abiertoInicial?: boolean; requerido?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <View style={styles.plegable}>
      <TouchableOpacity style={styles.plegableCab} onPress={() => setAbierto(v => !v)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={styles.plegableTitulo}>
            {titulo}{requerido ? <Text style={{ color: '#C0392B' }}> *</Text> : null}
          </Text>
          {!!resumen && <Text style={styles.plegableResumen} numberOfLines={1}>{resumen}</Text>}
        </View>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color="#9AA0A6" />
      </TouchableOpacity>
      {abierto && <View style={styles.plegableCuerpo}>{children}</View>}
    </View>
  );
}

// ── Tarjeta de tarea ──
export function TaskCard({ task, onPress, showBoard, myId }: { task: TaskT; onPress: () => void; showBoard?: boolean; myId?: number | null }) {
  const eis = EIS[task.eisenhower];
  const tt = taskTime(task);
  const done = task.status === 'completed';
  return (
    <TouchableOpacity style={[styles.card, done && { opacity: 0.72 }, task.overdue && styles.cardOverdue]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.chipsRow}>
        <View style={[styles.chip, { backgroundColor: eis?.bg }]}>
          <Text style={[styles.chipTxt, { color: eis?.color }]}>{eis?.short || task.eisenhower}</Text>
        </View>
        {done && <View style={[styles.chip, { backgroundColor: '#E4F1E8' }]}><Text style={[styles.chipTxt, { color: '#2E7D46' }]}>✅ Completada</Text></View>}
        {task.status === 'awaiting_confirmation' && (
          esperaMiConfirmacion(task, myId)
            ? <View style={[styles.chip, { backgroundColor: '#FDE7C7' }]}><Text style={[styles.chipTxt, { color: '#8A4B00' }]}>⏳ Esperando tu confirmación</Text></View>
            : <View style={[styles.chip, { backgroundColor: '#FBE9D0' }]}><Text style={[styles.chipTxt, { color: '#B07206' }]}>⏳ En espera</Text></View>
        )}
        {(task.unread_count || 0) > 0 && (
          <View style={styles.unreadChip}><Ionicons name="chatbubble-ellipses" size={11} color="#fff" /><Text style={styles.unreadTxt}>{task.unread_count} sin leer</Text></View>
        )}
      </View>
      {/* El numero de tarea es como se refieren a ella entre ellos ("la 387"),
          asi que va junto al titulo igual que en la web. */}
      <Text style={[styles.cardTitle, done && { textDecorationLine: 'line-through', color: '#999' }]} numberOfLines={2}>
        <Text style={styles.cardFolio}>#{task.id} </Text>{task.title}
      </Text>
      {showBoard && (task.board_name || task.column_name) && (
        <Text style={styles.cardBoard} numberOfLines={1}>🗂️ {task.board_name}{task.column_name ? ` · ${task.column_name}` : ''}</Text>
      )}
      <View style={styles.cardFooter}>
        {task.assignee_name ? (
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(task.assignee_name || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}</Text></View>
        ) : <Text style={styles.metaMuted}>Sin asignar</Text>}
        <View style={{ flex: 1 }} />
        {(task.subtasks_total || 0) > 0 && (
          <Text style={[styles.metaMuted, task.subtasks_done === task.subtasks_total && { color: '#2E7D46' }]}>☑ {task.subtasks_done}/{task.subtasks_total}</Text>
        )}
        {!!task.due_at && <Text style={[styles.metaMuted, task.overdue && { color: '#C0392B' }]}>  {new Date(task.due_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</Text>}
      </View>
      {tt && (
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={tt.done ? '#2E7D46' : '#8A8A8A'} />
          <Text style={[styles.timeTxt, { color: tt.done ? '#2E7D46' : '#8A8A8A' }]}>
            {tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} en curso`}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Alto del teclado abierto.
 *
 * app.json usa softwareKeyboardLayoutMode "pan", y en Android el sistema NO
 * mueve el contenido de un Modal: las hojas de abajo se quedan donde estan y el
 * teclado tapa justo el campo donde escribes. Con la altura real se levanta la
 * hoja lo necesario, sin depender del comportamiento del sistema.
 */
function useAltoTeclado(): number {
  const [alto, setAlto] = useState(0);
  useEffect(() => {
    const mostrar = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: any) => setAlto(e?.endCoordinates?.height || 0),
    );
    const ocultar = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setAlto(0),
    );
    return () => { mostrar.remove(); ocultar.remove(); };
  }, []);
  return alto;
}

/**
 * Texto de tarea con el folio del ticket como enlace.
 *
 * Las tareas que nacen de un ticket traen "TKT-2026-2365" en el texto y para
 * abrirlo habia que copiarlo y buscarlo a mano. Aqui el folio se vuelve
 * tocable y lleva directo al ticket.
 */
// Hay dos formatos vivos: TKT-2026-1919 y TKT-ACQ-MPWYSX9X-4PW.
const RE_TKT_SPLIT = /(TKT-[A-Za-z0-9]+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g;  // con g: parte el texto
const RE_TKT_ES = /^TKT-[A-Za-z0-9]+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;      // sin g: prueba cada pedazo
function TextoConTicket({ texto, style }: { texto: string; style?: any }) {
  const navigation = useNavigation<any>();
  const partes = String(texto).split(RE_TKT_SPLIT);
  if (partes.length === 1) return <Text style={style} selectable>{texto}</Text>;
  return (
    <Text style={style} selectable>
      {partes.map((p, i) => (
        RE_TKT_ES.test(p) ? (
          <Text
            key={i}
            style={{ color: ORANGE, fontWeight: '800', textDecorationLine: 'underline' }}
            onPress={() => navigation.navigate('SupportTickets', { openFolio: p })}
          >{p}</Text>
        ) : <Text key={i}>{p}</Text>
      ))}
    </Text>
  );
}

// ── Modal de detalle de tarea ──
export function TaskDetailModal({ visible, taskId, token, canManage, columns, onClose, onChanged, myId }: {
  visible: boolean; taskId: number | null; token: string; canManage?: boolean; myId?: number;
  columns?: Array<{ id: number; name: string; is_done?: boolean }>;
  onClose: () => void; onChanged: () => void;
}) {
  const altoTeclado = useAltoTeclado();
  const scrollRef = React.useRef<ScrollView>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [mentions, setMentions] = useState<{ id: number; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const onCommentChange = (txt: string) => {
    setComment(txt);
    const m = txt.match(/(?:^|\s)@([^\s@]*)$/); // @palabra al final
    setMentionQuery(m ? m[1] : null);
  };
  const pickMention = (p: { id: number; full_name: string }) => {
    setComment(prev => prev.replace(/(?:^|\s)@([^\s@]*)$/, (mt) => `${mt.startsWith('@') ? '' : mt[0]}@${p.full_name} `));
    setMentionQuery(null);
    setMentions(prev => prev.some(x => x.id === p.id) ? prev : [...prev, { id: p.id, name: p.full_name }]);
  };
  const [newSub, setNewSub] = useState('');
  const [busy, setBusy] = useState(false);
  // Bandera específica del envío de comentario: deshabilita el botón y muestra spinner
  // mientras la petición POST está en curso para evitar envíos múltiples.
  const [sendingComment, setSendingComment] = useState(false);
  // Marca "sucio": se activa cuando el usuario hace CUALQUIER cambio en la tarea
  // (categoría, responsable, involucrados, checklist, archivos, comentarios, etc.)
  // y hace que el botón inferior cambie de "Completar" → "Guardar" para salir sin cerrar la tarea.
  const [dirty, setDirty] = useState(false);
  // Edición inline
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eEis, setEEis] = useState('estrella');
  const [eDue, setEDue] = useState('keep');
  const [eUsers, setEUsers] = useState<UserOpt[]>([]);
  const [eFrequent, setEFrequent] = useState<number[]>([]);
  const [eInvolved, setEInvolved] = useState<number[]>([]);
  const [eAssignee, setEAssignee] = useState<number>(0); // responsable principal
  const [eCats, setECats] = useState<Array<{ id: number; name: string; board_key?: string }>>([]);
  const [eCat, setECat] = useState<number>(0); // 0 = Sin categoría

  const H = { Authorization: `Bearer ${token}` };
  // silent = refresco en segundo plano (sin spinner) para no tapar el contenido
  // al palomear una subtarea, comentar o subir foto.
  const reload = useCallback(async (silent = false) => {
    if (!taskId) return;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/tasks/${taskId}`, { headers: H });
      setData(await r.json());
    } catch { /* */ } finally { if (!silent) setLoading(false); }
  }, [taskId, token]);
  useEffect(() => { if (visible && taskId) { setData(null); setEditing(false); setDirty(false); reload(); } }, [visible, taskId, reload]);
  // Cargar usuarios y categorías cuando el detalle es editable (para editar inline).
  useEffect(() => {
    if (!visible || !data?.can_edit) return;
    if (eUsers.length === 0) fetch(`${API_URL}/api/tasks/assignable-users`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => { setEUsers(d.users || []); setEFrequent(d.frequent || []); }).catch(() => {});
    if (eCats.length === 0) fetch(`${API_URL}/api/tasks/categories`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => setECats((d.categories || []).filter((c: any) => c.board_key !== 'personales'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, data?.can_edit]);

  const beginEdit = () => {
    if (!t) return;
    setETitle(t.title || ''); setEDesc(t.description || ''); setEEis(t.eisenhower || 'estrella'); setEDue('keep');
    setECat(t.board_key === 'personales' ? 0 : (Number(t.board_id) || 0));
    const creatorId = Number(t.created_by) || 0;
    const parts = (data?.participants || []).map((p: any) => Number(p.id)).filter((pid: number) => pid !== creatorId);
    setEInvolved(parts);
    setEAssignee(Number(t.assignee_id) || creatorId);
    if (eUsers.length === 0) fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H }).then(r => r.json()).then(d => { setEUsers(d.users || []); setEFrequent(d.frequent || []); }).catch(() => {});
    if (eCats.length === 0) fetch(`${API_URL}/api/tasks/categories`, { headers: H }).then(r => r.json()).then(d => setECats((d.categories || []).filter((c: any) => c.board_key !== 'personales'))).catch(() => {});
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!eTitle.trim()) { Alert.alert('Falta título', 'El título no puede quedar vacío.'); return; }
    const body: any = { title: eTitle.trim(), description: eDesc || null, eisenhower: eEis, board_id: eCat || null };
    // Involucrados aplican en cualquier categoría (el creador siempre incluido).
    const cid = Number(t.created_by) || 0;
    body.involved_ids = cid ? [cid, ...eInvolved] : eInvolved;
    // Responsable principal explícito (debe estar entre creador + involucrados).
    const cand = (cid ? [cid, ...eInvolved] : eInvolved);
    body.assignee_id = cand.includes(eAssignee) ? eAssignee : (cand[0] || cid);
    if (eDue !== 'keep') {
      if (eDue === 'none') body.due_at = null;
      else {
        const d = new Date();
        if (eDue === 'today') d.setHours(18, 0, 0, 0);
        else if (eDue === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
        else if (eDue === 'd3') { d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); }
        else if (eDue === 'week') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
        body.due_at = toStamp(d);
      }
    }
    setBusy(true);
    try {
      const r = await put(`${API_URL}/api/tasks/${taskId}`, body);
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo editar', e.error || ''); setBusy(false); return; }
      setEditing(false); reload(true); onChanged();
    } catch { Alert.alert('Error', 'No se pudo editar la tarea'); } finally { setBusy(false); }
  };

  const t = data?.task;
  const subs = data?.subtasks || [];
  const atts = data?.attachments || [];
  const pending = subs.filter((s: any) => !s.done).length;
  // Quien puede tocar el checklist: gerencia, el responsable o quien la asigno.
  // NO se reutiliza canManage porque esa bandera tambien decide quien confirma.
  const puedeEditarChecklist = !!canManage || (
    myId != null && !!t && (Number(t.assignee_id) === Number(myId) || Number(t.created_by) === Number(myId))
  );
  const tt = t ? taskTime(t) : null;

  const put = async (url: string, body: any) => fetch(url, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const post = async (url: string, body: any) => fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const patch = async (url: string, body: any) => fetch(url, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const del = async (url: string) => fetch(url, { method: 'DELETE', headers: H });

  // Cambio parcial inline (prioridad, categoría, responsable, involucrados) sin modo edición.
  const patchTask = async (body: any) => {
    setBusy(true);
    try {
      const r = await put(`${API_URL}/api/tasks/${taskId}`, body);
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo actualizar', e.error || ''); return; }
      setDirty(true);
      reload(true); onChanged();
    } catch { Alert.alert('Error', 'No se pudo actualizar'); } finally { setBusy(false); }
  };
  // Datos para edición inline en el detalle.
  const canInline = !!data?.can_edit && !editing && t?.status !== 'completed';
  const partIds: number[] = (data?.participants || []).map((p: any) => Number(p.id));
  const creatorId = Number(t?.created_by) || 0;
  const involvedExtra = partIds.filter(pid => pid !== creatorId);
  const curCat = t?.board_key === 'personales' ? 0 : (Number(t?.board_id) || 0);
  const respCands = Array.from(new Set<number>([creatorId, ...partIds, Number(t?.assignee_id) || 0].filter(Boolean)));
  const nameFor = (uid: number) => uid === creatorId
    ? (t?.created_by_name || 'Creador')
    : ((data?.participants || []).find((p: any) => Number(p.id) === uid)?.full_name || eUsers.find(u => u.id === uid)?.full_name || `#${uid}`);

  const toggleSub = async (s: any) => {
    if (!s.done && s.requires_photo && !s.evidence_url) { Alert.alert('Evidencia requerida', 'Esta subtarea requiere una foto para completarse.'); return; }
    // Optimista: palomea al instante; luego confirma con el backend en silencio.
    setData((prev: any) => prev ? { ...prev, subtasks: (prev.subtasks || []).map((x: any) => x.id === s.id ? { ...x, done: !x.done } : x) } : prev);
    setDirty(true);
    try { await put(`${API_URL}/api/tasks/subtasks/${s.id}`, { done: !s.done }); reload(true); onChanged(); }
    catch { reload(true); }
  };
  const addSub = async () => {
    if (!newSub.trim()) return;
    try { await post(`${API_URL}/api/tasks/${taskId}/subtasks`, { body: newSub.trim() }); setNewSub(''); setDirty(true); reload(true); onChanged(); }
    catch (e: any) { Alert.alert('Error', 'No se pudo agregar la subtarea'); }
  };
  const deleteSub = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/subtasks/${id}`, { method: 'DELETE', headers: H }); setDirty(true); reload(true); onChanged(); } catch { /* */ }
  };
  const move = async (colId: number) => {
    try {
      const r = await put(`${API_URL}/api/tasks/${taskId}`, { column_id: colId });
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo mover', e.error || ''); return; }
      reload(true); onChanged();
    } catch { /* */ }
  };
  const complete = async (force = false) => {
    // Gate: no se puede completar con checklist pendiente (Filtro de Cierre).
    if (pending > 0) {
      Alert.alert('Checklist pendiente', `Completa el checklist antes de terminar (${pending} pendiente${pending === 1 ? '' : 's'}).`);
      return;
    }
    setBusy(true);
    try {
      const r = await post(`${API_URL}/api/tasks/${taskId}/complete`, force ? { force_confirm: true } : {});
      const d = await r.json().catch(() => ({}));
      // La tarea ya está en espera y quien la cierra no es quien la asignó:
      // pregunta doble antes de forzar el cierre sin su revisión.
      if (r.status === 409 && d?.needs_force_confirm) {
        setBusy(false);
        Alert.alert(
          'En espera de confirmación',
          '¿Seguro que deseas marcar esta tarea como COMPLETADA sin la revisión de quien la asignó?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sí, completar', style: 'destructive', onPress: () => complete(true) },
          ],
        );
        return;
      }
      if (!r.ok) { Alert.alert('No se pudo completar', d.error || ''); setBusy(false); return; }
      // Doble confirmación: si el responsable termina una tarea asignada por otra
      // persona, NO se cierra — queda "En espera de confirmación" y regresa a
      // quien la asignó para que él la marque como completada.
      if (d?.awaiting_confirmation) {
        Alert.alert('⏳ En espera de confirmación', 'Marcaste la tarea como terminada. Regresó a quien la asignó para que la revise y la marque como completada.');
        onChanged(); reload(true);
      } else {
        onChanged(); onClose();
      }
    } catch { /* */ } finally { setBusy(false); }
  };
  const reopen = async () => {
    setBusy(true);
    try {
      const r = await post(`${API_URL}/api/tasks/${taskId}/reopen`, {});
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo reabrir', e.error || ''); setBusy(false); return; }
      onChanged(); reload(true);
    } catch { /* */ } finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim() || sendingComment) return;
    const activeMentions = mentions.filter(m => comment.includes(`@${m.name}`)).map(m => m.id);
    setSendingComment(true);
    try { const r = await post(`${API_URL}/api/tasks/${taskId}/comments`, { body: comment.trim(), mentions: activeMentions }); const d = await r.json().catch(() => ({})); setComment(''); setMentions([]); setMentionQuery(null); setDirty(true); reload(true); onChanged(); if (d?.reopened) Alert.alert('💬 Comentario agregado', 'La tarea volvió a pendientes (se reanuda el conteo de tiempo).'); }
    catch { /* */ }
    finally { setSendingComment(false); }
  };
  const saveEditComment = async () => {
    if (!editingText.trim() || editingCommentId == null) return;
    try {
      const r = await patch(`${API_URL}/api/tasks/${taskId}/comments/${editingCommentId}`, { body: editingText.trim() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo editar', e.error || ''); return; }
      setEditingCommentId(null); setEditingText(''); setDirty(true); reload(true); onChanged();
    } catch { /* */ }
  };
  const deleteComment = (commentId: number) => {
    Alert.alert('Borrar comentario', '¿Seguro que deseas borrar este comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        try {
          const r = await del(`${API_URL}/api/tasks/${taskId}/comments/${commentId}`);
          if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo borrar', e.error || ''); return; }
          setDirty(true); reload(true); onChanged();
        } catch { /* */ }
      } },
    ]);
  };
  const addPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso', 'Se necesita acceso a las fotos.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setBusy(true);
      const fd = new FormData();
      fd.append('photo', { uri: a.uri, name: a.fileName || 'foto.jpg', type: a.mimeType || 'image/jpeg' } as any);
      const r = await fetch(`${API_URL}/api/tasks/${taskId}/attachments`, { method: 'POST', headers: H, body: fd });
      if (!r.ok) throw new Error();
      setDirty(true);
      reload();
    } catch { Alert.alert('Error', 'No se pudo subir la foto'); } finally { setBusy(false); }
  };
  const addDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/csv',
          'text/plain',
          'application/rtf',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled) return;
      setBusy(true);
      for (const a of (res.assets || [])) {
        const fd = new FormData();
        fd.append('photo', { uri: a.uri, name: a.name || 'archivo', type: a.mimeType || 'application/octet-stream' } as any);
        await fetch(`${API_URL}/api/tasks/${taskId}/attachments`, { method: 'POST', headers: H, body: fd });
      }
      setDirty(true);
      reload();
    } catch { Alert.alert('Error', 'No se pudo subir el archivo'); } finally { setBusy(false); }
  };
  const deletePhoto = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/attachments/${id}`, { method: 'DELETE', headers: H }); setDirty(true); reload(); } catch { /* */ }
  };
  const openAttachment = (url?: string) => { if (url) Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir el archivo')); };

  const eis = t ? EIS[t.eisenhower] : null;
  const contactPhone: string = t?.contact_phone || '';
  const callProspect = () => { if (contactPhone) Linking.openURL(`tel:${contactPhone.replace(/[^\d+]/g, '')}`); };
  const waProspect = () => {
    if (!contactPhone) return;
    const digits = contactPhone.replace(/\D/g, '');
    const waPhone = digits.length === 10 ? `52${digits}` : digits; // MX 10 dígitos → +52
    const name = (t.title || '').split('—').pop()?.trim() || '';
    const ref = t.assignee_referral_code;
    const link = ref ? `https://entregax.app/register?ref=${ref}` : 'https://entregax.app';
    const msg = `¡Hola ${name}! 👋 Te saluda tu asesor de *EntregaX*. Gracias por tu interés en nuestros envíos internacionales 🌎📦.\n\nDescarga la app y regístrate con mi enlace para cotizar y dar seguimiento a tus envíos:\n${link}`;
    Linking.openURL(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* La hoja se levanta el alto del teclado: en Android el sistema no lo
            hace dentro de un Modal y el campo de comentario quedaba tapado. */}
        <View style={[styles.modalCard, altoTeclado > 0 && { marginBottom: altoTeclado, maxHeight: '78%' }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {!!taskId && <Text style={styles.cardFolio}>#{taskId} </Text>}
              <TextoConTicket texto={String(t?.title || 'Tarea')} />
            </Text>
            {data?.can_edit && !editing && t && t.status !== 'completed' && (
              <TouchableOpacity onPress={beginEdit} hitSlop={10} style={{ marginRight: 12 }}>
                <Ionicons name="create-outline" size={22} color={ORANGE} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          {loading || !t ? (
            <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {editing ? (
                <View style={styles.editBox}>
                  <Text style={styles.fieldLbl}>Título</Text>
                  <TextInput style={styles.input} value={eTitle} onChangeText={setETitle} placeholder="Título…" placeholderTextColor="#999" />
                  <Text style={styles.fieldLbl}>Descripción</Text>
                  <TextInput style={[styles.input, styles.inputMulti]} value={eDesc} onChangeText={setEDesc} multiline placeholder="Detalles…" placeholderTextColor="#999" />
                  <Text style={styles.fieldLbl}>Prioridad (Eisenhower)</Text>
                  <EisPicker value={eEis} onChange={setEEis} />
                  <Text style={styles.fieldLbl}>Fecha deseada</Text>
                  <View style={styles.eisRow}>
                    {[{ k: 'keep', l: 'Mantener' }, { k: 'none', l: 'Sin fecha' }, { k: 'today', l: 'Hoy' }, { k: 'tomorrow', l: 'Mañana' }, { k: 'd3', l: '+3 días' }, { k: 'week', l: 'Próx. semana' }].map(o => (
                      <TouchableOpacity key={o.k} onPress={() => setEDue(o.k)} style={[styles.dateChip, eDue === o.k && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, eDue === o.k && { color: '#fff' }]}>{o.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {eDue === 'keep' && !!t.due_at && <Text style={styles.helpTxt}>Actual: {fmtDate(t.due_at)}</Text>}
                  <Text style={styles.fieldLbl}>Categoría (flujo)</Text>
                  <View style={styles.eisRow}>
                    <TouchableOpacity onPress={() => setECat(0)} style={[styles.dateChip, !eCat && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, !eCat && { color: '#fff' }]}>Personal</Text>
                    </TouchableOpacity>
                    {eCats.map(c => (
                      <TouchableOpacity key={c.id} onPress={() => setECat(c.id)} style={[styles.dateChip, eCat === c.id && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, eCat === c.id && { color: '#fff' }]}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLbl}>Responsables</Text>
                  <InvolvedPicker users={eUsers} myId={Number(t.created_by) || 0} selected={eInvolved} onChange={setEInvolved} fixedLabel={t.created_by_name || 'Creador'} frequent={eFrequent} />
                  <Text style={styles.helpTxt}>El creador siempre queda incluido. Elige abajo quién es el responsable principal.</Text>
                  {(() => {
                    const cid = Number(t.created_by) || 0;
                    const cand = Array.from(new Set<number>([cid, ...eInvolved].filter(Boolean)));
                    const nameFor = (uid: number) => uid === cid ? (t.created_by_name || 'Creador') : (eUsers.find(u => u.id === uid)?.full_name || `#${uid}`);
                    const effective = cand.includes(eAssignee) ? eAssignee : (cand[0] || cid);
                    return (
                      <>
                        <Text style={styles.fieldLbl}>Responsable principal</Text>
                        <View style={styles.eisRow}>
                          {cand.map(uid => (
                            <TouchableOpacity key={uid} onPress={() => setEAssignee(uid)} style={[styles.dateChip, effective === uid && styles.dateChipOn]}>
                              <Text style={[styles.dateChipTxt, effective === uid && { color: '#fff' }]}>{nameFor(uid)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    );
                  })()}
                  <View style={styles.editBtns}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={busy}><Text style={styles.cancelBtnTxt}>Cancelar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={busy}>
                      {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.saveBtnTxt}>Guardar</Text></>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
              <>
              <View style={styles.chipsRow}>
                <View style={[styles.chip, { backgroundColor: eis?.bg }]}><Text style={[styles.chipTxt, { color: eis?.color }]}>{eis?.short}</Text></View>
                {t.status === 'completed' && <View style={[styles.chip, { backgroundColor: '#E4F1E8' }]}><Text style={[styles.chipTxt, { color: '#2E7D46' }]}>✅ Completada</Text></View>}
                {t.status === 'awaiting_confirmation' && (
                  esperaMiConfirmacion(t, myId)
                    ? <View style={[styles.chip, { backgroundColor: '#FDE7C7' }]}><Text style={[styles.chipTxt, { color: '#8A4B00' }]}>⏳ Esperando tu confirmación</Text></View>
                    : <View style={[styles.chip, { backgroundColor: '#FBE9D0' }]}><Text style={[styles.chipTxt, { color: '#B07206' }]}>⏳ En espera de confirmación</Text></View>
                )}
              </View>
              {!!t.description && (
                <View>
                  <TextoConTicket texto={String(t.description)} style={styles.desc} />
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={async () => { try { await copyToClipboard(String(t.description || '')); Alert.alert('Copiado', 'La descripción se copió al portapapeles.'); } catch { /* */ } }}
                  >
                    <Ionicons name="copy-outline" size={14} color={ORANGE} />
                    <Text style={styles.copyBtnTxt}>Copiar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {canInline ? (
                // ── Edición inline: prioridad, categoría, responsable, involucrados ──
                <View style={{ marginTop: 6, padding: 10, backgroundColor: '#FBF8F4', borderRadius: 10, borderWidth: 1, borderColor: '#ECE4D8' }}>
                  <Text style={styles.fieldLbl}>Prioridad</Text>
                  <EisPicker value={t.eisenhower} onChange={(v: string) => patchTask({ eisenhower: v })} />
                  <Text style={styles.fieldLbl}>Categoría</Text>
                  <View style={styles.eisRow}>
                    <TouchableOpacity onPress={() => patchTask({ board_id: null })} style={[styles.dateChip, !curCat && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, !curCat && { color: '#fff' }]}>Personal</Text>
                    </TouchableOpacity>
                    {eCats.map(c => (
                      <TouchableOpacity key={c.id} onPress={() => patchTask({ board_id: c.id })} style={[styles.dateChip, curCat === c.id && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, curCat === c.id && { color: '#fff' }]}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLbl}>Responsable</Text>
                  <View style={styles.eisRow}>
                    {respCands.map(uid => (
                      <TouchableOpacity key={uid} onPress={() => patchTask({ assignee_id: uid, involved_ids: Array.from(new Set<number>([creatorId, ...partIds, uid].filter(Boolean))) })}
                        style={[styles.dateChip, Number(t.assignee_id) === uid && styles.dateChipOn]}>
                        <Text style={[styles.dateChipTxt, Number(t.assignee_id) === uid && { color: '#fff' }]}>{nameFor(uid)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLbl}>Involucrados</Text>
                  <InvolvedPicker users={eUsers} myId={creatorId} selected={involvedExtra}
                    onChange={(ids: number[]) => patchTask({ involved_ids: creatorId ? [creatorId, ...ids] : ids, assignee_id: Number(t.assignee_id) || undefined })}
                    fixedLabel={t.created_by_name || 'Creador'} frequent={eFrequent} />
                  {!!t.due_at && <Text style={[styles.metaLine, t.overdue && { color: '#C0392B' }, { marginTop: 8 }]}><Text style={styles.metaB}>Fecha deseada:</Text> {fmtDate(t.due_at)}</Text>}
                  {busy && <ActivityIndicator color={ORANGE} style={{ marginTop: 6 }} />}
                </View>
              ) : (
                <>
                  <Text style={styles.metaLine}><Text style={styles.metaB}>Responsable:</Text> {t.assignee_name || '—'}</Text>
                  {!!t.created_by_name && <Text style={styles.metaLine}><Text style={styles.metaB}>Asignada por:</Text> {t.created_by_name}</Text>}
                  {!!t.due_at && <Text style={[styles.metaLine, t.overdue && { color: '#C0392B' }]}><Text style={styles.metaB}>Fecha deseada:</Text> {fmtDate(t.due_at)}</Text>}
                </>
              )}
              </>
              )}

              {/* Contacto del prospecto: llamar / WhatsApp */}
              {!!contactPhone && (
                <View style={styles.contactBox}>
                  <Text style={styles.contactLabel}>📞 Contacto del prospecto</Text>
                  <TouchableOpacity onPress={callProspect}><Text style={styles.contactPhone}>{contactPhone}</Text></TouchableOpacity>
                  <View style={styles.contactBtns}>
                    <TouchableOpacity style={styles.callBtn} onPress={callProspect}>
                      <Ionicons name="call" size={16} color="#fff" /><Text style={styles.contactBtnTxt}>Llamar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.waBtn} onPress={waProspect}>
                      <Ionicons name="logo-whatsapp" size={16} color="#fff" /><Text style={styles.contactBtnTxt}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Tiempo */}
              <View style={styles.timeBox}>
                <Text style={styles.metaLine}><Text style={styles.metaB}>Creada:</Text> {fmtDate(t.created_at)}</Text>
                {!!t.completed_at && <Text style={styles.metaLine}><Text style={styles.metaB}>Terminada:</Text> {fmtDate(t.completed_at)}</Text>}
                {tt && <Text style={[styles.metaLine, { fontWeight: '700', color: tt.done ? '#2E7D46' : ORANGE }]}>⏱ {tt.done ? `Resuelta en ${fmtDur(tt.ms)}` : `${fmtDur(tt.ms)} transcurrido`}</Text>}
              </View>

              {/* Mover columna (solo gerencia) */}
              {canManage && columns && columns.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.sectionTitle}>Mover a columna</Text>
                  <View style={styles.colRow}>
                    {columns.map(c => (
                      <TouchableOpacity key={c.id} onPress={() => move(c.id)}
                        style={[styles.colChip, t.column_id === c.id && { backgroundColor: ORANGE }]}>
                        <Text style={[styles.colChipTxt, t.column_id === c.id && { color: '#fff' }]} numberOfLines={1}>{c.name}{c.is_done ? ' ✓' : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Checklist.
                  Se puede editar aunque no seas gerencia: quien la va a ejecutar
                  o quien la asigno son los que saben en que pasos se parte. En
                  Mis Tareas el modal recibe canManage=false, asi que sin esto la
                  caja de "Nueva subtarea" no aparecia nunca y el checklist se
                  quedaba vacio para siempre.
                  Se calcula aparte de canManage a proposito: esa bandera tambien
                  decide quien puede CONFIRMAR una tarea, y eso no debe abrirse. */}
              <Text style={styles.sectionTitle}>Checklist {subs.length > 0 && `(${subs.length - pending}/${subs.length})`}</Text>
              {subs.length === 0 ? <Text style={styles.metaMuted}>Sin subtareas.</Text> :
                subs.map((s: any) => (
                  <View key={s.id} style={styles.subRow}>
                    <TouchableOpacity onPress={() => toggleSub(s)} disabled={t.status === 'completed'} hitSlop={8}>
                      <Ionicons name={s.done ? 'checkbox' : 'square-outline'} size={22} color={s.done ? '#2E7D46' : '#999'} />
                    </TouchableOpacity>
                    <Text style={[styles.subTxt, s.done && { textDecorationLine: 'line-through', color: '#999' }]}>{s.body}{s.requires_photo ? ' 📷' : ''}</Text>
                    {puedeEditarChecklist && t.status !== 'completed' && (
                      <TouchableOpacity onPress={() => deleteSub(s.id)} hitSlop={8}><Ionicons name="trash-outline" size={16} color="#BBB" /></TouchableOpacity>
                    )}
                  </View>
                ))}
              {puedeEditarChecklist && t.status !== 'completed' && (
                <View style={styles.addSubRow}>
                  <TextInput style={styles.input} placeholder="Nueva subtarea…" value={newSub} onChangeText={setNewSub} placeholderTextColor="#999" />
                  <TouchableOpacity style={styles.addBtn} onPress={addSub}><Text style={styles.addBtnTxt}>Agregar</Text></TouchableOpacity>
                </View>
              )}

              {/* Archivos (fotos, PDF, Excel…) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Archivos {atts.length > 0 && `(${atts.length})`}</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <TouchableOpacity onPress={addPhoto} disabled={busy} style={styles.photoBtn}>
                    <Ionicons name="camera-outline" size={16} color={ORANGE} /><Text style={styles.photoBtnTxt}>Foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addDoc} disabled={busy} style={styles.photoBtn}>
                    <Ionicons name="document-attach-outline" size={16} color={ORANGE} /><Text style={styles.photoBtnTxt}>PDF/Excel</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {atts.length === 0 ? <Text style={styles.metaMuted}>Sin archivos.</Text> : (
                <View style={styles.photoGrid}>
                  {atts.map((a: any) => (
                    <View key={a.id} style={{ position: 'relative' }}>
                      {isImgName(a.file_name) ? (
                        <TouchableOpacity onPress={() => openAttachment(a.url)}>
                          {a.url ? <Image source={{ uri: a.url }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: '#EEE' }]} />}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.fileChip} onPress={() => openAttachment(a.url)}>
                          <Text style={{ fontSize: 22 }}>{fileEmoji(a.file_name)}</Text>
                          <Text style={styles.fileChipTxt} numberOfLines={2}>{a.file_name}</Text>
                          <Text style={styles.fileChipOpen}>Abrir</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => deletePhoto(a.id)} style={styles.photoDel}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Comentarios — hilo estilo chat (mis mensajes a la derecha en verde) */}
              <Text style={styles.sectionTitle}>Comentarios</Text>
              {(data.comments || []).map((c: any) => {
                const mine = myId != null && Number(c.author_id) === Number(myId);
                return (
                  <View key={c.id} style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
                    <View style={[styles.msgBubble, mine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
                      {!mine && (
                        <Text style={[styles.msgAuthor, { color: authorColor(c.author_id, c.author_name) }]}>
                          {c.author_name || '—'}
                        </Text>
                      )}
                      {editingCommentId === c.id ? (
                        <View>
                          <TextInput
                            style={[styles.input, { backgroundColor: '#fff', minWidth: 200 }]}
                            value={editingText}
                            onChangeText={setEditingText}
                            multiline
                            autoFocus
                            placeholderTextColor="#999"
                          />
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 6 }}>
                            <TouchableOpacity onPress={() => { setEditingCommentId(null); setEditingText(''); }}>
                              <Text style={{ fontSize: 12.5, color: '#9AA0A6', fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveEditComment} disabled={!editingText.trim()}>
                              <Text style={{ fontSize: 12.5, color: '#2E7D46', fontWeight: '800', opacity: editingText.trim() ? 1 : 0.5 }}>Guardar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <Text style={[styles.msgText, mine && { color: '#0B3D1E' }]}>{c.body}</Text>
                      )}
                      {/* Un comentario puede traer archivo (asi llegan los de
                          Grupo Rino). Sin esto decia "Adjunto un archivo" y no
                          habia archivo por ningun lado. */}
                      {/* Se intenta como imagen salvo que la extension diga que
                          no lo es: sus enlaces no traen extension. */}
                      {!!c.attachment_url && (
                        !/\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv|txt)(\?|$)/i.test(String(c.attachment_url)) ? (
                          <TouchableOpacity onPress={() => Linking.openURL(String(c.attachment_url))} style={{ marginTop: 6 }}>
                            <Image source={{ uri: String(c.attachment_url) }} style={{ width: 160, height: 160, borderRadius: 8, backgroundColor: '#EEE' }} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity onPress={() => Linking.openURL(String(c.attachment_url))} style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="attach" size={13} color="#5F6368" />
                            <Text style={{ fontSize: 11.5, color: '#3C4043', fontWeight: '700' }}>Abrir archivo adjunto</Text>
                          </TouchableOpacity>
                        )
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 2 }}>
                        {mine && editingCommentId !== c.id && (
                          <>
                            <TouchableOpacity onPress={() => { setEditingCommentId(c.id); setEditingText(c.body); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={{ fontSize: 11.5, color: '#3A7D53', fontWeight: '700' }}>Editar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteComment(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={{ fontSize: 11.5, color: '#C0392B', fontWeight: '700' }}>Borrar</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        <Text style={[styles.msgTime, mine ? { color: '#3A7D53' } : { color: '#9AA0A6' }]}>
                          {c.edited_at ? `editado · ${fmtDate(c.edited_at)}` : fmtDate(c.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {(data.comments || []).length === 0 && <Text style={styles.commentBody}>Sin comentarios todavía.</Text>}
              {/* Selector de @menciones (involucrados de la tarea) */}
              {mentionQuery !== null && (() => {
                const q = mentionQuery.toLowerCase();
                const opts = ((data?.participants || []) as any[])
                  .filter(p => Number(p.id) !== Number(myId) && String(p.full_name || '').toLowerCase().includes(q))
                  .slice(0, 6);
                if (opts.length === 0) return null;
                return (
                  <View style={styles.mentionBox}>
                    {opts.map(p => (
                      <TouchableOpacity key={p.id} style={styles.mentionOpt} onPress={() => pickMention(p)}>
                        <Ionicons name="at" size={14} color="#5E35B1" />
                        <Text style={styles.mentionName}>{p.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
              <View style={styles.addSubRow}>
                <TextInput style={styles.input} placeholder="Deja un comentario…  (@ para mencionar)" value={comment} onChangeText={onCommentChange} placeholderTextColor="#999" editable={!sendingComment}
                  // Al abrirse el teclado la hoja se encoge; sin esto el campo
                  // podia quedar fuera de la parte visible del scroll.
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)} />
                <TouchableOpacity
                  style={[styles.addBtn, (sendingComment || !comment.trim()) && { opacity: 0.5 }]}
                  onPress={addComment}
                  disabled={sendingComment || !comment.trim()}
                >
                  {sendingComment ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {t && t.status !== 'completed' && (() => {
            const typing = comment.trim().length > 0;
            const iAmCreator = creatorId > 0 && Number(myId) === creatorId;
            const isAwaiting = t.status === 'awaiting_confirmation';
            const assigneeId = Number(t.assignee_id) || 0;
            const differentCreator = creatorId > 0 && assigneeId > 0 && creatorId !== assigneeId;

            // ── En espera de confirmación ──
            // El responsable terminó su parte. Quien la asignó (o gerencia) la
            // confirma directo; cualquier otro involucrado puede forzar el cierre
            // sin su revisión, pero con la pregunta doble (la maneja complete()).
            if (isAwaiting) {
              const canConfirm = iAmCreator || !!canManage;
              const dis = busy || pending > 0 || typing;
              return (
                <View style={styles.modalFoot}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 8 }}>
                    <Ionicons name="hourglass-outline" size={14} color={iAmCreator ? '#8A4B00' : '#B07206'} />
                    <Text style={{ color: iAmCreator ? '#8A4B00' : '#B07206', fontWeight: '700', fontSize: 12.5 }}>
                      {iAmCreator ? 'Esperando TU confirmación · revísala y ciérrala' : 'En espera de confirmación de quien la asignó'}
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.completeBtn, { backgroundColor: canConfirm ? '#2E7D46' : '#B07206' }, dis && { backgroundColor: '#B7C3BB' }]} onPress={() => complete(false)} disabled={dis}>
                    {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-done" size={18} color="#fff" /><Text style={styles.completeTxt}>{pending > 0 ? `Completa el checklist (${pending})` : (canConfirm ? 'Confirmar y cerrar' : 'Completar (en espera)')}</Text></>}
                  </TouchableOpacity>
                </View>
              );
            }

            const disabled = busy || pending > 0 || typing;
            // Si el usuario hizo cualquier cambio (categoría, responsable, involucrados,
            // checklist, archivos, comentarios) el botón cambia a "Guardar" para salir
            // sin cerrar la tarea. Los cambios ya se persisten al hacerlos, así que
            // "Guardar" simplemente cierra el modal y regresa a la vista anterior.
            if (dirty && !typing && !busy && pending === 0) {
              return (
                <View style={styles.modalFoot}>
                  <TouchableOpacity
                    style={[styles.completeBtn, { backgroundColor: '#1F6FEB' }]}
                    onPress={() => { setDirty(false); onChanged(); onClose(); }}
                  >
                    <Ionicons name="save" size={18} color="#fff" />
                    <Text style={styles.completeTxt}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const label = pending > 0
              ? `Completa el checklist (${pending})`
              : typing
                ? 'Envía o borra el comentario para completar'
                : (differentCreator && !iAmCreator ? 'Marcar terminada' : 'Completar');
            const icon = pending > 0 ? 'lock-closed' : typing ? 'chatbubble-ellipses' : 'checkmark-circle';
            return (
              <View style={styles.modalFoot}>
                <TouchableOpacity
                  style={[styles.completeBtn, disabled && { backgroundColor: '#B7C3BB' }]}
                  onPress={() => complete(false)}
                  disabled={disabled}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name={icon as any} size={18} color="#fff" />
                      <Text style={styles.completeTxt}>{label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })()}
          {t && t.status === 'completed' && (
            <View style={styles.modalFoot}>
              <TouchableOpacity style={[styles.completeBtn, { backgroundColor: '#B07206' }]} onPress={reopen} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <>
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.completeTxt}>Reabrir (regresar a pendientes)</Text>
                </>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Toggle de vista (Lista/Columnas ↔ Matriz) ──
// iconOnly: en Mis Tareas la barra lleva además cuatro filtros y el botón de
// crear, y con las etiquetas "Lista"/"Matriz" no cabía todo. En Tareas se
// conservan porque ahí el primer botón dice "Columnas", que no se adivina por
// el ícono.
export function ViewToggle({ view, onChange, firstLabel, iconOnly }: { view: 'list' | 'matrix'; onChange: (v: 'list' | 'matrix') => void; firstLabel: string; iconOnly?: boolean }) {
  return (
    <View style={styles.toggle}>
      <TouchableOpacity
        onPress={() => onChange('list')}
        accessibilityLabel={firstLabel}
        style={[styles.toggleBtn, iconOnly && styles.toggleBtnIcon, view === 'list' && styles.toggleBtnActive]}
      >
        <Ionicons name="list" size={iconOnly ? 20 : 16} color={view === 'list' ? ORANGE : '#777'} />
        {!iconOnly && <Text style={[styles.toggleTxt, view === 'list' && { color: ORANGE }]}>{firstLabel}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange('matrix')}
        accessibilityLabel="Matriz"
        style={[styles.toggleBtn, iconOnly && styles.toggleBtnIcon, view === 'matrix' && styles.toggleBtnActive]}
      >
        <Ionicons name="grid" size={iconOnly ? 20 : 16} color={view === 'matrix' ? ORANGE : '#777'} />
        {!iconOnly && <Text style={[styles.toggleTxt, view === 'matrix' && { color: ORANGE }]}>Matriz</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Vista Matriz (4 cuadrantes apilados) ──
export function MatrixView({ tasks, onOpen, showBoard, myId, onMove, preScoped }: { tasks: TaskT[]; onOpen: (id: number) => void; showBoard?: boolean; myId?: number; onMove?: (taskId: number, eisenhower: string) => void; preScoped?: boolean }) {
  // Si se pasa myId, la matriz muestra SOLO las tareas donde el usuario es el
  // responsable (assignee), no en las que solo está involucrado.
  // Matriz: tareas donde soy responsable + tareas con comentarios sin leer (para que
  // el involucrado se dé cuenta de que hay respuesta pendiente).
  // Si ya viene scopeado (preScoped) se muestra tal cual; si no y hay myId, se
  // filtra a "mis tareas" (responsable, sin leer, o esperando mi confirmación).
  const base = (myId && !preScoped)
    ? tasks.filter(t => Number(t.assignee_id) === Number(myId) || (t.unread_count || 0) > 0 || (t.status === 'awaiting_confirmation' && Number((t as any).created_by) === Number(myId)))
    : tasks;
  // Orden (menor = más arriba): sin leer primero; luego en espera que ME toca
  // confirmar (soy quien la asignó); luego lo normal; al fondo las en espera
  // donde YO soy el que espera.
  const rank = (t: TaskT) => {
    if ((t.unread_count || 0) > 0) return 0;
    const iAssigned = myId != null && Number((t as any).created_by) === Number(myId);
    if (t.status === 'awaiting_confirmation') return iAssigned ? 1 : 3;
    return 2;
  };
  // Orden del cuadrante:
  //   1. Lo que ESPERA ALGO DE TI arriba (rank): comentarios sin leer y las que
  //      te toca confirmar. Antes esto era el ultimo criterio y la fecha lo
  //      tapaba: un comentario nuevo podia quedar hasta el fondo.
  //   2. Dentro de cada grupo, lo que vence primero; sin fecha, al final.
  const vence = (t: TaskT) => (t.due_at ? new Date(t.due_at).getTime() : Number.POSITIVE_INFINITY);
  const cells = QUADRANTS.map(q => ({
    q,
    qt: base.filter(t => t.eisenhower === q.key).sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return vence(a) - vence(b);
    }),
  }));
  // Tarea seleccionada para mover (mantén presionada una tarjeta).
  const [moveFor, setMoveFor] = useState<TaskT | null>(null);

  // ── Arrastrar entre cuadrantes ──────────────────────────────────────────
  // Lo mismo que en la web, adaptado al dedo. El arrastre NO puede arrancar al
  // primer movimiento porque pelearía con el scroll de cada cuadrante: arranca
  // con una pulsación sostenida (~260 ms), que además es el gesto que la app ya
  // usaba para mover. Mientras arrastras, una copia de la tarjeta sigue al dedo
  // y el cuadrante debajo se resalta. Si sueltas fuera de los cuatro, se abre la
  // hoja de "Mover a…" de siempre: la función nunca se pierde.
  const raiz = React.useRef<View>(null);
  const origen = React.useRef({ x: 0, y: 0 });
  const cajas = React.useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const cajaRefs = React.useRef<Record<string, View | null>>({});
  const tareasRef = React.useRef<Record<number, TaskT>>({});
  tareasRef.current = Object.fromEntries(base.map(t => [t.id, t]));

  const [arrastrando, setArrastrando] = useState<TaskT | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const pos = React.useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const activoRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<any>(null);
  const inicioRef = React.useRef({ x: 0, y: 0 });

  // Se remiden al terminar cada layout: el teclado, el filtro de tablero o un
  // cambio de orientación mueven los cuadrantes y las cajas quedarían viejas.
  const medir = useCallback(() => {
    raiz.current?.measureInWindow((x, y) => { origen.current = { x, y }; });
    for (const k of Object.keys(cajaRefs.current)) {
      cajaRefs.current[k]?.measureInWindow((x, y, w, h) => { cajas.current[k] = { x, y, w, h }; });
    }
  }, []);

  const cuadranteEn = (x: number, y: number): string | null => {
    for (const [k, r] of Object.entries(cajas.current)) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k;
    }
    return null;
  };

  const moverFantasma = (px: number, py: number) =>
    pos.setValue({ x: px - origen.current.x - 62, y: py - origen.current.y - 16 });

  const limpiarArrastre = () => {
    activoRef.current = null;
    setArrastrando(null);
    setDestino(null);
  };

  const soltar = (px: number, py: number) => {
    const t = activoRef.current != null ? tareasRef.current[activoRef.current] : null;
    const q = cuadranteEn(px, py);
    limpiarArrastre();
    if (!t) return;
    if (!q) { setMoveFor(t); return; }            // fuera del tablero: la hoja de siempre
    if (q !== t.eisenhower && onMove) onMove(t.id, q);
  };

  const panCache = React.useRef<Record<number, any>>({});
  const panDe = (id: number) => {
    if (panCache.current[id]) return panCache.current[id];
    const pr = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Mientras no haya arrastre, el scroll del cuadrante manda.
      onPanResponderTerminationRequest: () => activoRef.current !== id,
      onShouldBlockNativeResponder: () => activoRef.current === id,
      onPanResponderGrant: e => {
        inicioRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        clearTimeout(timerRef.current);
        if (!onMove) return;
        timerRef.current = setTimeout(() => {
          const t = tareasRef.current[id];
          if (!t) return;
          medir();
          activoRef.current = id;
          moverFantasma(inicioRef.current.x, inicioRef.current.y);
          setArrastrando(t);
          setDestino(t.eisenhower);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }, 260);
      },
      onPanResponderMove: (e, g) => {
        if (activoRef.current !== id) {
          // Se movió antes de que el arrastre arrancara: era un scroll.
          if (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) clearTimeout(timerRef.current);
          return;
        }
        const { pageX, pageY } = e.nativeEvent;
        moverFantasma(pageX, pageY);
        const q = cuadranteEn(pageX, pageY);
        setDestino(prev => (prev === q ? prev : q));
      },
      onPanResponderRelease: (e, g) => {
        clearTimeout(timerRef.current);
        if (activoRef.current === id) { soltar(e.nativeEvent.pageX, e.nativeEvent.pageY); return; }
        // Toque corto = abrir. El umbral evita abrir una tarea al scrollear.
        if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) onOpen(id);
      },
      onPanResponderTerminate: () => {
        clearTimeout(timerRef.current);
        if (activoRef.current === id) limpiarArrastre();
      },
    });
    panCache.current[id] = pr;
    return pr;
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const renderCell = ({ q, qt }: { q: typeof QUADRANTS[number]; qt: TaskT[] }) => (
    <View key={q.key} ref={r => { cajaRefs.current[q.key] = r; }} onLayout={medir}
      style={[styles.mxCell, { backgroundColor: q.bg, borderTopColor: q.color },
              !!arrastrando && destino === q.key && arrastrando.eisenhower !== q.key
                && { borderWidth: 2, borderColor: q.color }]}>
      <View style={styles.mxHead}>
        <Text style={[styles.mxTitle, { color: q.color }]} numberOfLines={2}>{q.title}</Text>
        <View style={styles.mxCount}><Text style={styles.mxCountTxt}>{qt.length}</Text></View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 5, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        {qt.length === 0 ? <Text style={styles.mxEmpty}>—</Text> : qt.map(t => {
          const done = t.status === 'completed';
          return (
            <View key={t.id} {...panDe(t.id).panHandlers}
              style={[styles.mxCard, t.overdue && styles.cardOverdue, done && { opacity: 0.6 },
                      arrastrando?.id === t.id && styles.mxCardArrastrada]}>
              <Text style={[styles.mxCardTitle, done && { textDecorationLine: 'line-through', color: '#999' }]} numberOfLines={3}>
                <Text style={styles.mxCardFolio}>#{t.id} </Text>{t.title}
              </Text>
              {t.status === 'awaiting_confirmation' && <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#B07206', marginTop: 2 }}>⏳ En espera</Text>}
              {(t.unread_count || 0) > 0 && (
                <View style={styles.mxUnread}><Ionicons name="chatbubble-ellipses" size={9} color="#fff" /><Text style={styles.mxUnreadTxt}>{t.unread_count}</Text></View>
              )}
              <View style={styles.mxCardMeta}>
                {showBoard && !!t.board_name && <Text style={styles.mxCardBoard} numberOfLines={1}>🗂️ {t.board_name}</Text>}
                <View style={{ flex: 1 }} />
                {(t.subtasks_total || 0) > 0 && <Text style={[styles.mxCardMetaTxt, t.subtasks_done === t.subtasks_total && { color: '#2E7D46' }]}>☑{t.subtasks_done}/{t.subtasks_total}</Text>}
                {!!t.due_at && <Text style={[styles.mxCardMetaTxt, t.overdue && { color: '#C0392B' }]}>{new Date(t.due_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
  // 2×2 que llena la pantalla: dos filas flex:1, cada una con dos cuadrantes flex:1.
  return (
    <View ref={raiz} onLayout={medir} style={{ flex: 1, gap: 6 }}>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>{cells.slice(0, 2).map(renderCell)}</View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>{cells.slice(2, 4).map(renderCell)}</View>
      {/* Copia de la tarjeta pegada al dedo. pointerEvents none para no robarle
          los toques al tablero que está debajo. */}
      {!!arrastrando && (
        <Animated.View pointerEvents="none"
          style={[styles.mxFantasma, { transform: pos.getTranslateTransform() }]}>
          <Text style={styles.mxCardTitle} numberOfLines={2}>
            <Text style={styles.mxCardFolio}>#{arrastrando.id} </Text>{arrastrando.title}
          </Text>
        </Animated.View>
      )}
      {/* Mover de cuadrante: mantén presionada una tarjeta → elige destino. */}
      <Modal visible={!!moveFor} transparent animationType="fade" onRequestClose={() => setMoveFor(null)}>
        <TouchableOpacity style={styles.mvBackdrop} activeOpacity={1} onPress={() => setMoveFor(null)}>
          <View style={styles.mvSheet}>
            <Text style={styles.mvTitle} numberOfLines={2}>Mover a…</Text>
            {!!moveFor && <Text style={styles.mvSub} numberOfLines={2}>{moveFor.title}</Text>}
            {QUADRANTS.filter(q => q.key !== moveFor?.eisenhower).map(q => (
              <TouchableOpacity key={q.key} style={[styles.mvOpt, { borderLeftColor: q.color, backgroundColor: q.bg }]}
                onPress={() => { if (moveFor && onMove) onMove(moveFor.id, q.key); setMoveFor(null); }}>
                <Text style={[styles.mvOptTxt, { color: q.color }]}>{q.title}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.mvCancel} onPress={() => setMoveFor(null)}><Text style={styles.mvCancelTxt}>Cancelar</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E2E2E2' },
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: '#C0392B' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipTxt: { fontSize: 11, fontWeight: '700' },
  cal: { marginTop: 8, borderWidth: 1, borderColor: '#ECECEC', borderRadius: 10, padding: 8, backgroundColor: '#FFF' },
  calCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  calMes: { fontSize: 14, fontWeight: '800', color: '#222' },
  calFila: { flexDirection: 'row', flexWrap: 'wrap' },
  calDow: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9AA0A6', paddingBottom: 4 },
  calCelda: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  calDia: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDiaOn: { backgroundColor: ORANGE },
  calDiaHoy: { borderWidth: 1.5, borderColor: ORANGE },
  calTxt: { fontSize: 13.5, fontWeight: '600', color: '#333' },
  listaSel: { maxHeight: 240, borderWidth: 1, borderColor: '#ECECEC', borderRadius: 10, backgroundColor: '#FFF' },
  listaOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  listaOptTxt: { flex: 1, fontSize: 14, color: '#333' },
  listaOptTxtOn: { fontWeight: '800', color: ORANGE },
  filaElegida: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
    backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: '#F0B79A',
  },
  filaElegidaLbl: { fontSize: 12.5, fontWeight: '700', color: '#8A5B45' },
  filaElegidaVal: { flex: 1, fontSize: 13.5, fontWeight: '800', color: ORANGE },
  plegable: { borderWidth: 1, borderColor: '#ECECEC', borderRadius: 10, marginTop: 10, overflow: 'hidden', backgroundColor: '#FFF' },
  plegableCab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  plegableTitulo: { fontSize: 13, fontWeight: '800', color: '#222' },
  plegableResumen: { fontSize: 11.5, color: '#6B7280', marginTop: 1 },
  plegableCuerpo: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EEE' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#222', lineHeight: 18 },
  cardFolio: { color: '#8A8A8A', fontWeight: '800' },
  cardBoard: { fontSize: 11, color: '#777', marginTop: 3 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 9 },
  metaMuted: { fontSize: 11, color: '#999' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  timeTxt: { fontSize: 11 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#222', flex: 1, marginRight: 12 },
  desc: { fontSize: 14, color: '#555', marginBottom: 6 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F0B79A', backgroundColor: '#FFF3EC', marginBottom: 10 },
  copyBtnTxt: { color: ORANGE, fontWeight: '700', fontSize: 12.5 },
  metaLine: { fontSize: 13, color: '#333', marginTop: 2 },
  metaB: { fontWeight: '700' },
  timeBox: { backgroundColor: '#F7F4EF', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ECE4D8' },
  contactBox: { backgroundColor: '#FFF7F3', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#F3D9CC' },
  contactLabel: { fontSize: 12, fontWeight: '700', color: '#B23F12' },
  contactPhone: { fontSize: 20, fontWeight: '800', color: '#222', marginTop: 2, letterSpacing: 0.5 },
  contactBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  callBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 10, height: 42 },
  waBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: 10, height: 42 },
  contactBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#222', marginTop: 18, marginBottom: 6 },
  colRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  colChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F0F0F0' },
  colChipTxt: { fontSize: 12, fontWeight: '700', color: '#444' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  subTxt: { flex: 1, fontSize: 13.5, color: '#333' },
  addSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: { flex: 1, backgroundColor: '#F4F6F8', borderRadius: 8, paddingHorizontal: 12, height: 40, fontSize: 14, color: '#222' },
  addBtn: { backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 14, height: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  photoBtnTxt: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  fileChip: { width: 120, height: 80, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', backgroundColor: '#FAFAFA', padding: 6, justifyContent: 'center' },
  fileChipTxt: { fontSize: 11, color: '#333', marginTop: 2 },
  fileChipOpen: { fontSize: 11, color: ORANGE, fontWeight: '700', marginTop: 2 },
  photo: { width: 80, height: 80, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  photoDel: { position: 'absolute', top: -6, right: -6, backgroundColor: '#C0392B', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  commentAuthor: { fontSize: 11, color: '#999' },
  commentBody: { fontSize: 13.5, color: '#333' },
  // Hilo de comentarios estilo chat (globos)
  msgRow: { flexDirection: 'row', marginBottom: 6 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '82%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14 },
  msgBubbleMine: { backgroundColor: '#DCF8C6', borderTopRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#F1F0F0', borderTopLeftRadius: 4 },
  msgAuthor: { fontSize: 11, fontWeight: '800', color: '#5E35B1', marginBottom: 2 },
  msgText: { fontSize: 14, color: '#222', lineHeight: 19 },
  msgTime: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  modalFoot: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  completeBtn: { backgroundColor: '#2E9E5B', borderRadius: 12, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  toggle: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 10, padding: 3, alignSelf: 'flex-start' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleBtnIcon: { paddingHorizontal: 10, paddingVertical: 7 },
  // Cuadrícula compacta de los 31 días del mes.
  dayCell: { width: 40, height: 36, borderRadius: 9, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center' },
  dayCellTxt: { fontSize: 13.5, fontWeight: '700', color: '#555' },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleTxt: { fontSize: 13, fontWeight: '700', color: '#777' },

  // Crear / programar
  fieldLbl: { fontSize: 13, fontWeight: '800', color: '#333', marginTop: 14, marginBottom: 6 },
  inputMulti: { height: 72, textAlignVertical: 'top', paddingTop: 10 },
  helpTxt: { fontSize: 11.5, color: '#888', marginTop: 6 },
  eisRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  eisChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  eisChipTxt: { fontSize: 12, fontWeight: '700' },
  dateChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F0F0F0' },
  dateChipOn: { backgroundColor: ORANGE },
  dateChipTxt: { fontSize: 12.5, fontWeight: '700', color: '#555' },
  involvedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  meChip: { backgroundColor: '#EDE7F6', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  meChipTxt: { color: '#5E35B1', fontWeight: '800', fontSize: 12 },
  selChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3EEFB', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  selChipTxt: { color: '#5E35B1', fontWeight: '700', fontSize: 12 },
  involvedList: { marginTop: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDD', borderRadius: 10, backgroundColor: '#FAFAFA' },
  groupHead: { fontSize: 11, fontWeight: '800', color: '#999', textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  optName: { fontSize: 14, color: '#222', fontWeight: '600' },
  optMeta: { fontSize: 11, color: '#999', marginTop: 1 },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  schedTitle: { fontSize: 13.5, fontWeight: '700', color: '#222' },
  editBox: { backgroundColor: '#FFF9F5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F3D9CC' },
  editBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center' },
  cancelBtnTxt: { color: '#666', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: ORANGE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  quad: { borderRadius: 12, padding: 10, borderTopWidth: 3 },
  quadHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  quadTitle: { fontSize: 14, fontWeight: '800' },
  countPill: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  countTxt: { fontSize: 12, fontWeight: '700', color: '#444' },
  // Matriz Eisenhower 2×2 compacta (los 4 cuadrantes en una pantalla).
  mxCardArrastrada: { opacity: 0.3, borderStyle: 'dashed', borderWidth: 1, borderColor: '#9AA0A6' },
  mxFantasma: {
    position: 'absolute', top: 0, left: 0, width: 128, padding: 7, borderRadius: 7,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: ORANGE, zIndex: 50,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  mxCell: { flex: 1, borderRadius: 10, borderTopWidth: 3, padding: 6, overflow: 'hidden' },
  mxHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 4 },
  mxTitle: { flex: 1, fontSize: 11, fontWeight: '800', lineHeight: 13 },
  mxCount: { minWidth: 18, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  mxCountTxt: { fontSize: 10, fontWeight: '700', color: '#333' },
  mxEmpty: { fontSize: 11, color: '#AAA', textAlign: 'center', paddingVertical: 6 },
  mxCard: { backgroundColor: '#fff', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E2E2E2' },
  mxCardTitle: { fontSize: 11.5, fontWeight: '600', color: '#222', lineHeight: 14 },
  mxCardFolio: { color: '#8A8A8A', fontWeight: '800' },
  mxCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  mxCardBoard: { fontSize: 9.5, color: '#888', flexShrink: 1 },
  mxCardMetaTxt: { fontSize: 9.5, color: '#888' },
  mentionBox: { borderWidth: 1, borderColor: '#E2DFF0', borderRadius: 10, backgroundColor: '#FAF9FF', marginBottom: 6, overflow: 'hidden' },
  mentionOpt: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECE9F5' },
  mentionName: { fontSize: 14, fontWeight: '600', color: '#333' },
  unreadChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E53935', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  unreadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mxUnread: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', backgroundColor: '#E53935', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 7, marginTop: 3 },
  mxUnreadTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  // Modal "Mover a" (long-press en la matriz).
  mvBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  mvSheet: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  mvTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  mvSub: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 10 },
  mvOpt: { borderLeftWidth: 4, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginTop: 8 },
  mvOptTxt: { fontSize: 14, fontWeight: '700' },
  mvCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  mvCancelTxt: { fontSize: 14, fontWeight: '700', color: '#888' },
});
