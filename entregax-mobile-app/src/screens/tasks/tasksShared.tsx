/**
 * tasksShared — utilidades y componentes compartidos del módulo Tareas (app).
 * Usado por MisTareasScreen y TareasScreen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert,
  ActivityIndicator, TextInput, Image, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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
export const taskTime = (t: { created_at?: string; completed_at?: string }) => {
  if (!t.created_at) return null;
  const start = new Date(t.created_at).getTime();
  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
  return { done: !!t.completed_at, ms: businessMs(start, end) };
};
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

// ── Usuarios asignables: agrupación por tipo + tiempo promedio (igual que web) ──
export interface UserOpt { id: number; full_name: string; role?: string; avg_resolution_seconds?: number | null; }
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Administración', admin: 'Administración', director: 'Dirección', finanzas: 'Finanzas',
  accountant: 'Contabilidad', abogado: 'Legal', branch_manager: 'Operación CEDIS', operaciones: 'Operaciones',
  warehouse_ops: 'Bodega', counter_staff: 'Mostrador', customer_service: 'Servicio a cliente',
  soporte_tecnico: 'Soporte técnico', advisor: 'Asesores', sub_advisor: 'Sub-asesores',
  repartidor: 'Repartidores', monitoreo: 'Monitoreo',
};
export const roleGroup = (r?: string): string => ROLE_LABEL[String(r || '')] || (r ? r : 'Otros');
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
export function InvolvedPicker({ users, myId, selected, onChange, fixedLabel = 'Yo' }: {
  users: UserOpt[]; myId: number; selected: number[]; onChange: (ids: number[]) => void; fixedLabel?: string;
}) {
  const [q, setQ] = useState('');
  const others = users.filter(u => u.id !== myId);
  const ql = q.trim().toLowerCase();
  const filtered = others.filter(u => !ql || u.full_name.toLowerCase().includes(ql) || roleGroup(u.role).toLowerCase().includes(ql))
    .sort((a, b) => roleGroup(a.role).localeCompare(roleGroup(b.role)) || a.full_name.localeCompare(b.full_name));
  // Agrupa por tipo para render.
  const groups: Array<{ g: string; items: UserOpt[] }> = [];
  filtered.forEach(u => {
    const g = roleGroup(u.role);
    let bucket = groups.find(x => x.g === g);
    if (!bucket) { bucket = { g, items: [] }; groups.push(bucket); }
    bucket.items.push(u);
  });
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
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
function EisPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <View style={styles.eisRow}>
      {Object.entries(EIS).map(([k, v]) => {
        const on = value === k;
        return (
          <TouchableOpacity key={k} onPress={() => onChange(k)}
            style={[styles.eisChip, { backgroundColor: on ? v.color : v.bg, borderColor: v.color }]}>
            <Text style={[styles.eisChipTxt, { color: on ? '#fff' : v.color }]}>{v.short}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Modal: crear tarea (mismas funciones que web) ──
export function CreateTaskModal({ visible, token, myId, onClose, onCreated }: {
  visible: boolean; token: string; myId: number; onClose: () => void; onCreated: () => void;
}) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string; sections?: Array<{ id: number; name: string }> }>>([]);
  const [catId, setCatId] = useState<number | null>(null);
  const [catSection, setCatSection] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [eis, setEis] = useState('estrella');
  const [dueOpt, setDueOpt] = useState<string>('none');
  const [involved, setInvolved] = useState<number[]>([]);
  const [photos, setPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const H = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDesc(''); setEis('estrella'); setDueOpt('none'); setInvolved([]); setPhotos([]); setCatSection(null);
    fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H })
      .then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
    fetch(`${API_URL}/api/tasks/categories`, { headers: H })
      .then(r => r.json()).then(d => {
        // Excluye el tablero personal: se representa como "Sin categoría".
        setCategories((d.categories || []).filter((c: any) => c.board_key !== 'personales'));
        setCatId(null); setCatSection(null); // Sin categoría por defecto
      }).catch(() => {});
  }, [visible]);

  const dueStamp = (): string | null => {
    if (dueOpt === 'none') return null;
    const d = new Date();
    if (dueOpt === 'today') { d.setHours(18, 0, 0, 0); }
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
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true, multiple: true });
      if (res.canceled) return;
      const assets = res.assets || [];
      setPhotos(prev => [...prev, ...assets.map(a => ({ uri: a.uri, name: a.name || 'archivo', type: a.mimeType || 'application/octet-stream' }))]);
    } catch { Alert.alert('Error', 'No se pudo adjuntar el archivo'); }
  };

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Falta título', 'Escribe un título con verbo de acción.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/tasks/personal`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: desc || null, eisenhower: eis, involved_ids: myId ? [myId, ...involved] : involved, due_at: dueStamp(), board_id: catId, section_id: catSection }),
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
    { k: 'none', l: 'Sin fecha' }, { k: 'today', l: 'Hoy' }, { k: 'tomorrow', l: 'Mañana' },
    { k: 'd3', l: '+3 días' }, { k: 'week', l: 'Próx. semana' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Nueva tarea</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLbl}>Título</Text>
            <TextInput style={styles.input} placeholder="Usa un verbo de acción…" value={title} onChangeText={setTitle} placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Categoría (flujo)</Text>
            <View style={styles.eisRow}>
              <TouchableOpacity onPress={() => setCatId(null)} style={[styles.dateChip, !catId && styles.dateChipOn]}>
                <Text style={[styles.dateChipTxt, !catId && { color: '#fff' }]}>Personal</Text>
              </TouchableOpacity>
              {categories.map(c => {
                const on = catId === c.id;
                return (
                  <TouchableOpacity key={c.id} onPress={() => { setCatId(c.id); setCatSection(null); }} style={[styles.dateChip, on && styles.dateChipOn]}>
                    <Text style={[styles.dateChipTxt, on && { color: '#fff' }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helpTxt}>«Personal» solo va a tu panel personal. Con categoría, aparece en ese flujo.</Text>
            {(() => {
              const secs = categories.find(c => c.id === catId)?.sections || [];
              return secs.length > 0 ? (
                <>
                  <Text style={styles.fieldLbl}>Sub-sección</Text>
                  <View style={styles.eisRow}>
                    <TouchableOpacity onPress={() => setCatSection(null)} style={[styles.dateChip, !catSection && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, !catSection && { color: '#fff' }]}>Sin sub-sección</Text>
                    </TouchableOpacity>
                    {secs.map(s => {
                      const on = catSection === s.id;
                      return (
                        <TouchableOpacity key={s.id} onPress={() => setCatSection(s.id)} style={[styles.dateChip, on && styles.dateChipOn]}>
                          <Text style={[styles.dateChipTxt, on && { color: '#fff' }]}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null;
            })()}
            <Text style={styles.fieldLbl}>Descripción</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Detalles (opcional)…" value={desc} onChangeText={setDesc} multiline placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Prioridad (Eisenhower)</Text>
            <EisPicker value={eis} onChange={setEis} />
            <Text style={styles.fieldLbl}>Fecha deseada</Text>
            <View style={styles.eisRow}>
              {DUE_OPTS.map(o => (
                <TouchableOpacity key={o.k} onPress={() => setDueOpt(o.k)} style={[styles.dateChip, dueOpt === o.k && styles.dateChipOn]}>
                  <Text style={[styles.dateChipTxt, dueOpt === o.k && { color: '#fff' }]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLbl}>Involucrados</Text>
            <InvolvedPicker users={users} myId={myId} selected={involved} onChange={setInvolved} />
            <Text style={styles.helpTxt}>Tú siempre quedas incluido. Agrega a quien deba participar.</Text>

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
export function ScheduleTaskModal({ visible, token, myId, onClose, onCreated }: {
  visible: boolean; token: string; myId: number; onClose: () => void; onCreated: () => void;
}) {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; board_key?: string; sections?: Array<{ id: number; name: string }> }>>([]);
  const [catId, setCatId] = useState<number | null>(null);
  const [catSection, setCatSection] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [eis, setEis] = useState('estrella');
  const [dayOpt, setDayOpt] = useState('tomorrow');
  const [hour, setHour] = useState(9);
  const [recurrence, setRecurrence] = useState('none');
  const [ordinal, setOrdinal] = useState(1);   // 1..4 o -1 (último)
  const [weekday, setWeekday] = useState(1);   // 0=domingo..6=sábado
  const [involved, setInvolved] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const H = { Authorization: `Bearer ${token}` };

  const loadSchedules = () => fetch(`${API_URL}/api/tasks/schedules`, { headers: H })
    .then(r => r.json()).then(d => setSchedules(d.schedules || [])).catch(() => {});
  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDesc(''); setEis('estrella'); setDayOpt('tomorrow'); setHour(9); setRecurrence('none'); setOrdinal(1); setWeekday(1); setInvolved([]); setCatSection(null);
    fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H }).then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
    fetch(`${API_URL}/api/tasks/categories`, { headers: H }).then(r => r.json()).then(d => {
      setCategories((d.categories || []).filter((c: any) => c.board_key !== 'personales'));
      setCatId(null); // Sin categoría por defecto
    }).catch(() => {});
    loadSchedules();
  }, [visible]);

  const firstRunStamp = (): string => {
    const d = new Date();
    if (dayOpt === 'today') { /* hoy */ }
    else if (dayOpt === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (dayOpt === 'd3') d.setDate(d.getDate() + 3);
    else if (dayOpt === 'week') d.setDate(d.getDate() + 7);
    d.setHours(hour, 0, 0, 0);
    return toStamp(d);
  };

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Falta título', 'Escribe un título con verbo de acción.'); return; }
    setBusy(true);
    try {
      const involvedIds = myId ? [myId, ...involved] : involved;
      const body: any = { title: title.trim(), description: desc || null, eisenhower: eis, involved_ids: involvedIds, recurrence, board_id: catId, section_id: catSection };
      if (recurrence === 'monthly_weekday') { body.recur_ordinal = ordinal; body.recur_weekday = weekday; body.hour = hour; body.minute = 0; }
      else { body.first_run_at = firstRunStamp(); }
      const r = await fetch(`${API_URL}/api/tasks/schedules`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo programar', e.error || ''); setBusy(false); return; }
      setTitle(''); setDesc(''); setInvolved([]);
      loadSchedules(); onCreated();
      Alert.alert('Programada', 'La tarea se creará automáticamente en la fecha elegida.');
    } catch { Alert.alert('Error', 'No se pudo programar'); } finally { setBusy(false); }
  };
  const del = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/schedules/${id}`, { method: 'DELETE', headers: H }); loadSchedules(); } catch { /* */ }
  };

  const DAY_OPTS = [{ k: 'today', l: 'Hoy' }, { k: 'tomorrow', l: 'Mañana' }, { k: 'd3', l: '+3 días' }, { k: 'week', l: 'Próx. semana' }];
  const HOURS = [9, 12, 15, 18];
  const RECUR = [{ k: 'none', l: 'Una vez' }, { k: 'daily', l: 'Diaria' }, { k: 'weekly', l: 'Semanal' }, { k: 'monthly', l: 'Mensual' }, { k: 'monthly_weekday', l: 'Día de semana' }];
  const RECUR_LABEL: Record<string, string> = { none: 'Una vez', daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', monthly_weekday: 'Mensual (día de semana)' };
  const ORDINALS = [{ v: 1, l: '1er' }, { v: 2, l: '2do' }, { v: 3, l: '3er' }, { v: 4, l: '4to' }, { v: -1, l: 'Último' }];
  const WEEKDAYS = [{ v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mié' }, { v: 4, l: 'Jue' }, { v: 5, l: 'Vie' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' }];
  const WD_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const ORD_FULL: Record<number, string> = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', 4: 'Cuarto', [-1]: 'Último' };
  const schedLabel = (s: any): string => s.recurrence === 'monthly_weekday' && s.recur_ordinal != null
    ? `${ORD_FULL[s.recur_ordinal] || ''} ${WD_FULL[s.recur_weekday] || ''} del mes`.trim()
    : (RECUR_LABEL[s.recurrence] || 'Una vez');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>📅 Programar tarea</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.helpTxt}>La tarea se creará automáticamente en la fecha y hora elegidas. Si es recurrente, se regenera en cada ciclo.</Text>
            <Text style={styles.fieldLbl}>Título</Text>
            <TextInput style={styles.input} placeholder="Usa un verbo de acción…" value={title} onChangeText={setTitle} placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Categoría (flujo)</Text>
            <View style={styles.eisRow}>
              <TouchableOpacity onPress={() => { setCatId(null); setCatSection(null); }} style={[styles.dateChip, !catId && styles.dateChipOn]}>
                <Text style={[styles.dateChipTxt, !catId && { color: '#fff' }]}>Personal</Text>
              </TouchableOpacity>
              {categories.map(c => {
                const on = catId === c.id;
                return (
                  <TouchableOpacity key={c.id} onPress={() => { setCatId(c.id); setCatSection(null); }} style={[styles.dateChip, on && styles.dateChipOn]}>
                    <Text style={[styles.dateChipTxt, on && { color: '#fff' }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(() => {
              const secs = categories.find(c => c.id === catId)?.sections || [];
              return secs.length > 0 ? (
                <>
                  <Text style={styles.fieldLbl}>Sub-sección</Text>
                  <View style={styles.eisRow}>
                    <TouchableOpacity onPress={() => setCatSection(null)} style={[styles.dateChip, !catSection && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, !catSection && { color: '#fff' }]}>Sin sub-sección</Text>
                    </TouchableOpacity>
                    {secs.map(s => {
                      const on = catSection === s.id;
                      return (
                        <TouchableOpacity key={s.id} onPress={() => setCatSection(s.id)} style={[styles.dateChip, on && styles.dateChipOn]}>
                          <Text style={[styles.dateChipTxt, on && { color: '#fff' }]}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null;
            })()}
            <Text style={styles.fieldLbl}>Descripción</Text>
            <TextInput style={[styles.input, styles.inputMulti]} placeholder="Detalles (opcional)…" value={desc} onChangeText={setDesc} multiline placeholderTextColor="#999" />
            <Text style={styles.fieldLbl}>Prioridad (Eisenhower)</Text>
            <EisPicker value={eis} onChange={setEis} />
            <Text style={styles.fieldLbl}>Repetir</Text>
            <View style={styles.eisRow}>
              {RECUR.map(o => (
                <TouchableOpacity key={o.k} onPress={() => setRecurrence(o.k)} style={[styles.dateChip, recurrence === o.k && styles.dateChipOn]}>
                  <Text style={[styles.dateChipTxt, recurrence === o.k && { color: '#fff' }]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {recurrence === 'monthly_weekday' ? (
              <>
                <Text style={styles.fieldLbl}>Ocurrencia</Text>
                <View style={styles.eisRow}>
                  {ORDINALS.map(o => (
                    <TouchableOpacity key={o.v} onPress={() => setOrdinal(o.v)} style={[styles.dateChip, ordinal === o.v && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, ordinal === o.v && { color: '#fff' }]}>{o.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLbl}>Día de la semana</Text>
                <View style={styles.eisRow}>
                  {WEEKDAYS.map(o => (
                    <TouchableOpacity key={o.v} onPress={() => setWeekday(o.v)} style={[styles.dateChip, weekday === o.v && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, weekday === o.v && { color: '#fff' }]}>{o.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.fieldLbl}>Hora</Text>
                <View style={styles.eisRow}>
                  {HOURS.map(h => (
                    <TouchableOpacity key={h} onPress={() => setHour(h)} style={[styles.dateChip, hour === h && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, hour === h && { color: '#fff' }]}>{String(h).padStart(2, '0')}:00</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.fieldLbl}>Primera ejecución</Text>
                <View style={styles.eisRow}>
                  {DAY_OPTS.map(o => (
                    <TouchableOpacity key={o.k} onPress={() => setDayOpt(o.k)} style={[styles.dateChip, dayOpt === o.k && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, dayOpt === o.k && { color: '#fff' }]}>{o.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.eisRow, { marginTop: 6 }]}>
                  {HOURS.map(h => (
                    <TouchableOpacity key={h} onPress={() => setHour(h)} style={[styles.dateChip, hour === h && styles.dateChipOn]}>
                      <Text style={[styles.dateChipTxt, hour === h && { color: '#fff' }]}>{String(h).padStart(2, '0')}:00</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.fieldLbl}>Involucrados</Text>
            <InvolvedPicker users={users} myId={myId} selected={involved} onChange={setInvolved} />

            {schedules.length > 0 && (
              <View style={{ marginTop: 18 }}>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Programaciones activas</Text>
                {schedules.map(s => (
                  <View key={s.id} style={styles.schedRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.schedTitle} numberOfLines={1}>{s.title}</Text>
                      <Text style={styles.optMeta}>{schedLabel(s)} · próxima: {fmtDate(s.next_run_at)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => del(s.id)} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#BBB" /></TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFoot}>
            <TouchableOpacity style={[styles.completeBtn, { backgroundColor: '#B07206' }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="calendar" size={18} color="#fff" /><Text style={styles.completeTxt}>Programar</Text></>}
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
  subtasks_total?: number; subtasks_done?: number; overdue?: boolean;
  board_name?: string; column_name?: string;
}

// ── Tarjeta de tarea ──
export function TaskCard({ task, onPress, showBoard }: { task: TaskT; onPress: () => void; showBoard?: boolean }) {
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
      </View>
      <Text style={[styles.cardTitle, done && { textDecorationLine: 'line-through', color: '#999' }]} numberOfLines={2}>{task.title}</Text>
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

// ── Modal de detalle de tarea ──
export function TaskDetailModal({ visible, taskId, token, canManage, columns, onClose, onChanged }: {
  visible: boolean; taskId: number | null; token: string; canManage?: boolean;
  columns?: Array<{ id: number; name: string; is_done?: boolean }>;
  onClose: () => void; onChanged: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [newSub, setNewSub] = useState('');
  const [busy, setBusy] = useState(false);
  // Edición inline
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eEis, setEEis] = useState('estrella');
  const [eDue, setEDue] = useState('keep');
  const [eUsers, setEUsers] = useState<UserOpt[]>([]);
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
  useEffect(() => { if (visible && taskId) { setData(null); setEditing(false); reload(); } }, [visible, taskId, reload]);

  const beginEdit = () => {
    if (!t) return;
    setETitle(t.title || ''); setEDesc(t.description || ''); setEEis(t.eisenhower || 'estrella'); setEDue('keep');
    setECat(t.board_key === 'personales' ? 0 : (Number(t.board_id) || 0));
    const creatorId = Number(t.created_by) || 0;
    const parts = (data?.participants || []).map((p: any) => Number(p.id)).filter((pid: number) => pid !== creatorId);
    setEInvolved(parts);
    setEAssignee(Number(t.assignee_id) || creatorId);
    if (eUsers.length === 0) fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H }).then(r => r.json()).then(d => setEUsers(d.users || [])).catch(() => {});
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
  const tt = t ? taskTime(t) : null;

  const put = async (url: string, body: any) => fetch(url, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const post = async (url: string, body: any) => fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const toggleSub = async (s: any) => {
    if (!s.done && s.requires_photo && !s.evidence_url) { Alert.alert('Evidencia requerida', 'Esta subtarea requiere una foto para completarse.'); return; }
    // Optimista: palomea al instante; luego confirma con el backend en silencio.
    setData((prev: any) => prev ? { ...prev, subtasks: (prev.subtasks || []).map((x: any) => x.id === s.id ? { ...x, done: !x.done } : x) } : prev);
    try { await put(`${API_URL}/api/tasks/subtasks/${s.id}`, { done: !s.done }); reload(true); onChanged(); }
    catch { reload(true); }
  };
  const addSub = async () => {
    if (!newSub.trim()) return;
    try { await post(`${API_URL}/api/tasks/${taskId}/subtasks`, { body: newSub.trim() }); setNewSub(''); reload(true); onChanged(); }
    catch (e: any) { Alert.alert('Error', 'No se pudo agregar la subtarea'); }
  };
  const deleteSub = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/subtasks/${id}`, { method: 'DELETE', headers: H }); reload(true); onChanged(); } catch { /* */ }
  };
  const move = async (colId: number) => {
    try {
      const r = await put(`${API_URL}/api/tasks/${taskId}`, { column_id: colId });
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo mover', e.error || ''); return; }
      reload(true); onChanged();
    } catch { /* */ }
  };
  const complete = async () => {
    // Gate: no se puede completar con checklist pendiente (Filtro de Cierre).
    if (pending > 0) {
      Alert.alert('Checklist pendiente', `Completa el checklist antes de terminar (${pending} pendiente${pending === 1 ? '' : 's'}).`);
      return;
    }
    setBusy(true);
    try {
      const r = await post(`${API_URL}/api/tasks/${taskId}/complete`, {});
      if (!r.ok) { const e = await r.json().catch(() => ({})); Alert.alert('No se pudo completar', e.error || ''); setBusy(false); return; }
      onChanged(); onClose();
    } catch { /* */ } finally { setBusy(false); }
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    try { await post(`${API_URL}/api/tasks/${taskId}/comments`, { body: comment.trim() }); setComment(''); reload(true); } catch { /* */ }
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
      reload();
    } catch { Alert.alert('Error', 'No se pudo subir la foto'); } finally { setBusy(false); }
  };
  const addDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true, multiple: true });
      if (res.canceled) return;
      setBusy(true);
      for (const a of (res.assets || [])) {
        const fd = new FormData();
        fd.append('photo', { uri: a.uri, name: a.name || 'archivo', type: a.mimeType || 'application/octet-stream' } as any);
        await fetch(`${API_URL}/api/tasks/${taskId}/attachments`, { method: 'POST', headers: H, body: fd });
      }
      reload();
    } catch { Alert.alert('Error', 'No se pudo subir el archivo'); } finally { setBusy(false); }
  };
  const deletePhoto = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/attachments/${id}`, { method: 'DELETE', headers: H }); reload(); } catch { /* */ }
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
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle} numberOfLines={1}>{t?.title || 'Tarea'}</Text>
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
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
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
                  <InvolvedPicker users={eUsers} myId={Number(t.created_by) || 0} selected={eInvolved} onChange={setEInvolved} fixedLabel={t.created_by_name || 'Creador'} />
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
              </View>
              {!!t.description && <Text style={styles.desc}>{t.description}</Text>}
              <Text style={styles.metaLine}><Text style={styles.metaB}>Responsable:</Text> {t.assignee_name || '—'}</Text>
              {!!t.created_by_name && <Text style={styles.metaLine}><Text style={styles.metaB}>Asignada por:</Text> {t.created_by_name}</Text>}
              {!!t.due_at && <Text style={[styles.metaLine, t.overdue && { color: '#C0392B' }]}><Text style={styles.metaB}>Fecha deseada:</Text> {fmtDate(t.due_at)}</Text>}
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

              {/* Checklist */}
              <Text style={styles.sectionTitle}>Checklist {subs.length > 0 && `(${subs.length - pending}/${subs.length})`}</Text>
              {subs.length === 0 ? <Text style={styles.metaMuted}>Sin subtareas.</Text> :
                subs.map((s: any) => (
                  <View key={s.id} style={styles.subRow}>
                    <TouchableOpacity onPress={() => toggleSub(s)} disabled={t.status === 'completed'} hitSlop={8}>
                      <Ionicons name={s.done ? 'checkbox' : 'square-outline'} size={22} color={s.done ? '#2E7D46' : '#999'} />
                    </TouchableOpacity>
                    <Text style={[styles.subTxt, s.done && { textDecorationLine: 'line-through', color: '#999' }]}>{s.body}{s.requires_photo ? ' 📷' : ''}</Text>
                    {canManage && t.status !== 'completed' && (
                      <TouchableOpacity onPress={() => deleteSub(s.id)} hitSlop={8}><Ionicons name="trash-outline" size={16} color="#BBB" /></TouchableOpacity>
                    )}
                  </View>
                ))}
              {canManage && t.status !== 'completed' && (
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

              {/* Comentarios */}
              <Text style={styles.sectionTitle}>Comentarios</Text>
              {(data.comments || []).map((c: any) => (
                <View key={c.id} style={{ marginBottom: 8 }}>
                  <Text style={styles.commentAuthor}>{c.author_name || '—'} · {fmtDate(c.created_at)}</Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))}
              <View style={styles.addSubRow}>
                <TextInput style={styles.input} placeholder="Deja un comentario…" value={comment} onChangeText={setComment} placeholderTextColor="#999" />
                <TouchableOpacity style={styles.addBtn} onPress={addComment}><Ionicons name="send" size={16} color="#fff" /></TouchableOpacity>
              </View>
            </ScrollView>
          )}
          {t && t.status !== 'completed' && (
            <View style={styles.modalFoot}>
              <TouchableOpacity style={[styles.completeBtn, pending > 0 && { backgroundColor: '#B7C3BB' }]} onPress={complete} disabled={busy || pending > 0}>
                {busy ? <ActivityIndicator color="#fff" /> : <>
                  <Ionicons name={pending > 0 ? 'lock-closed' : 'checkmark-circle'} size={18} color="#fff" />
                  <Text style={styles.completeTxt}>{pending > 0 ? `Completa el checklist (${pending})` : 'Completar'}</Text>
                </>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Toggle de vista (Lista/Columnas ↔ Matriz) ──
export function ViewToggle({ view, onChange, firstLabel }: { view: 'list' | 'matrix'; onChange: (v: 'list' | 'matrix') => void; firstLabel: string }) {
  return (
    <View style={styles.toggle}>
      <TouchableOpacity onPress={() => onChange('list')} style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}>
        <Ionicons name="list" size={16} color={view === 'list' ? ORANGE : '#777'} />
        <Text style={[styles.toggleTxt, view === 'list' && { color: ORANGE }]}>{firstLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onChange('matrix')} style={[styles.toggleBtn, view === 'matrix' && styles.toggleBtnActive]}>
        <Ionicons name="grid" size={16} color={view === 'matrix' ? ORANGE : '#777'} />
        <Text style={[styles.toggleTxt, view === 'matrix' && { color: ORANGE }]}>Matriz</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Vista Matriz (4 cuadrantes apilados) ──
export function MatrixView({ tasks, onOpen, showBoard }: { tasks: TaskT[]; onOpen: (id: number) => void; showBoard?: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      {QUADRANTS.map(q => {
        const qt = tasks.filter(t => t.eisenhower === q.key);
        return (
          <View key={q.key} style={[styles.quad, { backgroundColor: q.bg, borderTopColor: q.color }]}>
            <View style={styles.quadHead}>
              <Text style={[styles.quadTitle, { color: q.color }]}>{q.title}</Text>
              <View style={styles.countPill}><Text style={styles.countTxt}>{qt.length}</Text></View>
            </View>
            {qt.length === 0 ? <Text style={styles.metaMuted}>—</Text> :
              <View style={{ gap: 8 }}>{qt.map(t => <TaskCard key={t.id} task={t} onPress={() => onOpen(t.id)} showBoard={showBoard} />)}</View>}
          </View>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E2E2E2' },
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: '#C0392B' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipTxt: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#222', lineHeight: 18 },
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
  desc: { fontSize: 14, color: '#555', marginBottom: 10 },
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
  modalFoot: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  completeBtn: { backgroundColor: '#2E9E5B', borderRadius: 12, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  toggle: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 10, padding: 3, alignSelf: 'flex-start' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
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
});
