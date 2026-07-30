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
import { API_URL } from '../../services/api';

export const ORANGE = '#F05A28';
export const BG = '#F4F6F8';

// Prioridad Eisenhower (igual que web): etiqueta corta para tarjetas.
export const EIS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  fuego:    { label: 'Urgente e importante',       short: '🔥 Urgente',           color: '#C0392B', bg: '#F9E5E2' },
  estrella: { label: 'Importante y no urgente',    short: '⭐ Importante',         color: '#2E7D46', bg: '#E4F1E8' },
  delegar:  { label: 'Urgente y no importante',    short: '🔄 Atención Inmediata', color: '#B07206', bg: '#F7ECD5' },
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
export const taskTime = (t: { created_at?: string; completed_at?: string }) => {
  if (!t.created_at) return null;
  const start = new Date(t.created_at).getTime();
  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
  return { done: !!t.completed_at, ms: end - start };
};
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

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
  useEffect(() => { if (visible && taskId) { setData(null); reload(); } }, [visible, taskId, reload]);

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
  const deletePhoto = async (id: number) => {
    try { await fetch(`${API_URL}/api/tasks/attachments/${id}`, { method: 'DELETE', headers: H }); reload(); } catch { /* */ }
  };

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
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          {loading || !t ? (
            <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={ORANGE} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <View style={styles.chipsRow}>
                <View style={[styles.chip, { backgroundColor: eis?.bg }]}><Text style={[styles.chipTxt, { color: eis?.color }]}>{eis?.short}</Text></View>
                {t.status === 'completed' && <View style={[styles.chip, { backgroundColor: '#E4F1E8' }]}><Text style={[styles.chipTxt, { color: '#2E7D46' }]}>✅ Completada</Text></View>}
              </View>
              {!!t.description && <Text style={styles.desc}>{t.description}</Text>}
              <Text style={styles.metaLine}><Text style={styles.metaB}>Responsable:</Text> {t.assignee_name || '—'}</Text>
              {!!t.due_at && <Text style={[styles.metaLine, t.overdue && { color: '#C0392B' }]}><Text style={styles.metaB}>Fecha deseada:</Text> {fmtDate(t.due_at)}</Text>}

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

              {/* Fotos */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Fotos {atts.length > 0 && `(${atts.length})`}</Text>
                <TouchableOpacity onPress={addPhoto} disabled={busy} style={styles.photoBtn}>
                  <Ionicons name="camera-outline" size={16} color={ORANGE} /><Text style={styles.photoBtnTxt}>Agregar</Text>
                </TouchableOpacity>
              </View>
              {atts.length === 0 ? <Text style={styles.metaMuted}>Sin fotos.</Text> : (
                <View style={styles.photoGrid}>
                  {atts.map((a: any) => (
                    <View key={a.id} style={{ position: 'relative' }}>
                      {a.url ? <Image source={{ uri: a.url }} style={styles.photo} /> : <View style={[styles.photo, { backgroundColor: '#EEE' }]} />}
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

  quad: { borderRadius: 12, padding: 10, borderTopWidth: 3 },
  quadHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  quadTitle: { fontSize: 14, fontWeight: '800' },
  countPill: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  countTxt: { fontSize: 12, fontWeight: '700', color: '#444' },
});
