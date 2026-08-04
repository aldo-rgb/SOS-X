/**
 * CalendarScreen — Calendario (app): vista mensual con eventos y tareas.
 * Refleja el módulo web: filtro Eventos y tareas / Solo eventos / Solo tareas,
 * crear/editar eventos con involucrados. No es agenda ni control de horario.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput,
  ActivityIndicator, Switch, Alert, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { InvolvedPicker, UserOpt } from './tasks/tasksShared';

const ORANGE = '#F05A28';
const EVENT_COLOR = '#1565C0';
const EIS_COLOR: Record<string, string> = { fuego: '#C62828', estrella: '#F09300', programar: '#2E7D46', eliminar: '#8A8A8A' };
const EIS_LABEL: Record<string, string> = { fuego: 'Urgente', estrella: 'Importante', programar: 'Atención', eliminar: 'Algún día' };
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

interface Participant { user_id: number; full_name: string; role?: string }
interface CalEvent { id: number; title: string; description?: string | null; location?: string | null; start_at: string; end_at?: string | null; all_day: boolean; color?: string | null; created_by?: number; participants: Participant[] }
interface CalTask { id: number; title: string; eisenhower: string; status: string; date: string; is_commitment: boolean; board_name?: string; assignee_name?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function CalendarScreen({ navigation, route }: any) {
  const { token, user } = route.params || {};
  const myId = Number(user?.id) || 0;
  const H = { Authorization: `Bearer ${token}` };

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'both' | 'events' | 'tasks'>('both');
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [editEvent, setEditEvent] = useState<CalEvent | 'new' | null>(null);
  const [viewTask, setViewTask] = useState<CalTask | null>(null);

  const gridStart = useMemo(() => addDays(startOfMonth(cursor), -startOfMonth(cursor).getDay()), [cursor]);
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dayKey(gridStart), to = dayKey(addDays(gridStart, 41));
      const r = await fetch(`${API_URL}/api/calendar/feed?from=${from}&to=${to}`, { headers: H });
      const d = await r.json();
      setEvents(d?.events || []); setTasks(d?.tasks || []);
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, [gridStart, token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`${API_URL}/api/tasks/assignable-users`, { headers: H }).then(r => r.json()).then(d => setUsers(d?.users || [])).catch(() => {}); }, [token]);

  const byDay = useMemo(() => {
    const map: Record<string, { events: CalEvent[]; tasks: CalTask[] }> = {};
    const b = (k: string) => (map[k] ||= { events: [], tasks: [] });
    if (filter !== 'tasks') for (const e of events) {
      const s = new Date(e.start_at), en = e.end_at ? new Date(e.end_at) : s;
      let d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = new Date(en.getFullYear(), en.getMonth(), en.getDate());
      for (let g = 0; d <= last && g < 60; g++, d = addDays(d, 1)) b(dayKey(d)).events.push(e);
    }
    if (filter !== 'events') for (const t of tasks) b(dayKey(new Date(t.date))).tasks.push(t);
    return map;
  }, [events, tasks, filter]);

  const todayKey = dayKey(new Date());

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hIcon}><Ionicons name="arrow-back" size={24} color="#222" /></TouchableOpacity>
        <Text style={styles.hTitle}>Calendario</Text>
        <TouchableOpacity onPress={() => setEditEvent('new')} style={styles.hIcon}><Ionicons name="add" size={26} color={ORANGE} /></TouchableOpacity>
      </View>

      {/* Navegación de mes */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setCursor(c => addMonths(c, -1))}><Ionicons name="chevron-back" size={24} color="#444" /></TouchableOpacity>
        <TouchableOpacity onPress={() => setCursor(startOfMonth(new Date()))}>
          <Text style={styles.monthLabel}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCursor(c => addMonths(c, 1))}><Ionicons name="chevron-forward" size={24} color="#444" /></TouchableOpacity>
      </View>

      {/* Filtro */}
      <View style={styles.filterRow}>
        {([['both', 'Eventos y tareas'], ['events', 'Solo eventos'], ['tasks', 'Solo tareas']] as const).map(([v, l]) => (
          <TouchableOpacity key={v} onPress={() => setFilter(v)} style={[styles.filterChip, filter === v && styles.filterChipOn]}>
            <Text style={[styles.filterTxt, filter === v && styles.filterTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Días de la semana */}
      <View style={styles.wdRow}>{WD.map((w, i) => <Text key={i} style={styles.wd}>{w}</Text>)}</View>

      {/* Grid */}
      <ScrollView>
        {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
        <View style={styles.grid}>
          {gridDays.map((d, i) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = k === todayKey;
            const cell = byDay[k] || { events: [], tasks: [] };
            const items = [...cell.events.map(e => ({ kind: 'e', e } as any)), ...cell.tasks.map(t => ({ kind: 't', t } as any))];
            return (
              <TouchableOpacity key={i} style={[styles.cell, !inMonth && styles.cellOut]} onPress={() => setDayOpen(d)} activeOpacity={0.7}>
                <View style={[styles.dayNum, isToday && styles.dayNumToday]}>
                  <Text style={[styles.dayNumTxt, isToday && { color: '#fff' }, !inMonth && !isToday && { color: '#BBB' }]}>{d.getDate()}</Text>
                </View>
                {items.slice(0, 2).map((it, idx) => (
                  <View key={idx} style={[styles.pill, { backgroundColor: (it.kind === 'e' ? (it.e.color || EVENT_COLOR) : (EIS_COLOR[it.t.eisenhower] || '#888')) + '22', borderLeftColor: it.kind === 'e' ? (it.e.color || EVENT_COLOR) : (EIS_COLOR[it.t.eisenhower] || '#888') }]}>
                    <Text numberOfLines={1} style={styles.pillTxt}>{it.kind === 'e' ? it.e.title : it.t.title}</Text>
                  </View>
                ))}
                {items.length > 2 && <Text style={styles.more}>+{items.length - 2}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Modal del día */}
      <Modal visible={!!dayOpen} transparent animationType="slide" onRequestClose={() => setDayOpen(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {dayOpen && (() => {
              const cell = byDay[dayKey(dayOpen)] || { events: [], tasks: [] };
              const evs = filter === 'tasks' ? [] : cell.events;
              const tks = filter === 'events' ? [] : cell.tasks;
              return (
                <>
                  <View style={styles.sheetHead}>
                    <Text style={styles.sheetTitle}>{dayOpen.getDate()} de {MONTHS[dayOpen.getMonth()]}</Text>
                    <TouchableOpacity onPress={() => setDayOpen(null)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 360 }}>
                    {evs.length === 0 && tks.length === 0 && <Text style={styles.muted}>Sin eventos ni tareas este día.</Text>}
                    {evs.map(e => (
                      <TouchableOpacity key={`e${e.id}`} style={[styles.row, { borderLeftColor: e.color || EVENT_COLOR }]} onPress={() => { setDayOpen(null); setEditEvent(e); }}>
                        <Ionicons name="calendar" size={16} color={e.color || EVENT_COLOR} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{e.title}</Text>
                          <Text style={styles.rowSub}>{e.all_day ? 'Todo el día' : `${hhmm(e.start_at)}${e.end_at ? ' – ' + hhmm(e.end_at) : ''}`}{e.location ? ` · ${e.location}` : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {tks.map(t => (
                      <TouchableOpacity key={`t${t.id}`} style={[styles.row, { borderLeftColor: EIS_COLOR[t.eisenhower] || '#888' }]} onPress={() => { setDayOpen(null); setViewTask(t); }}>
                        <Ionicons name="checkbox-outline" size={16} color={EIS_COLOR[t.eisenhower] || '#888'} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowTitle, t.status === 'completed' && { textDecorationLine: 'line-through', color: '#999' }]}>{t.title}</Text>
                          <Text style={styles.rowSub}>{hhmm(t.date)} · {t.board_name || 'Tarea'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={styles.newBtn} onPress={() => { setEditEvent('new'); }}>
                    <Ionicons name="add" size={18} color="#fff" /><Text style={styles.newBtnTxt}>Nuevo evento</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Modal evento */}
      {editEvent && (
        <EventModal value={editEvent === 'new' ? null : editEvent} users={users} myId={myId} token={token}
          defaultDate={dayOpen || cursor} onClose={() => setEditEvent(null)} onSaved={() => { setEditEvent(null); load(); }} />
      )}

      {/* Modal tarea (solo lectura) */}
      <Modal visible={!!viewTask} transparent animationType="fade" onRequestClose={() => setViewTask(null)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            {viewTask && (
              <>
                <View style={styles.sheetHead}>
                  <Text style={[styles.badge, { backgroundColor: (EIS_COLOR[viewTask.eisenhower] || '#888') + '22', color: EIS_COLOR[viewTask.eisenhower] }]}>{EIS_LABEL[viewTask.eisenhower] || viewTask.eisenhower}</Text>
                  <TouchableOpacity onPress={() => setViewTask(null)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                </View>
                <Text style={styles.evTitle}>{viewTask.title}</Text>
                <Text style={styles.rowSub}>📅 {viewTask.is_commitment ? 'Objetivo' : 'Fecha deseada'}: {fmtDate(viewTask.date)}</Text>
                {!!viewTask.board_name && <Text style={styles.rowSub}>📋 {viewTask.board_name}</Text>}
                {!!viewTask.assignee_name && <Text style={styles.rowSub}>👤 Responsable: {viewTask.assignee_name}</Text>}
                {viewTask.status === 'completed' && <Text style={[styles.rowSub, { color: '#2E7D46', fontWeight: '700' }]}>✓ Completada</Text>}
                <TouchableOpacity style={[styles.newBtn, { backgroundColor: '#777', marginTop: 14 }]} onPress={() => setViewTask(null)}><Text style={styles.newBtnTxt}>Cerrar</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Modal crear / editar evento ──
function EventModal({ value, users, myId, token, defaultDate, onClose, onSaved }: {
  value: CalEvent | null; users: UserOpt[]; myId: number; token: string; defaultDate: Date; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!value;
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const seedDate = value ? new Date(value.start_at) : defaultDate;
  const [title, setTitle] = useState(value?.title || '');
  const [desc, setDesc] = useState(value?.description || '');
  const [loc, setLoc] = useState(value?.location || '');
  const [allDay, setAllDay] = useState(!!value?.all_day);
  const [date, setDate] = useState(dayKey(seedDate));
  const [start, setStart] = useState(value && !value.all_day ? hhmm(value.start_at) : '09:00');
  const [end, setEnd] = useState(value?.end_at && !value.all_day ? hhmm(value.end_at) : '');
  const [involved, setInvolved] = useState<number[]>(value?.participants?.map(p => p.user_id).filter(id => id !== myId) || []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) { Alert.alert('Falta título', 'Escribe el título del evento'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD'); return; }
    const startIso = new Date(`${date}T${allDay ? '00:00' : (start || '09:00')}:00`).toISOString();
    const endIso = allDay ? new Date(`${date}T23:59:00`).toISOString() : (end ? new Date(`${date}T${end}:00`).toISOString() : null);
    setBusy(true);
    try {
      const payload = { title: title.trim(), description: desc.trim() || null, location: loc.trim() || null, start_at: startIso, end_at: endIso, all_day: allDay, participant_ids: involved };
      const url = isEdit ? `${API_URL}/api/calendar/events/${value!.id}` : `${API_URL}/api/calendar/events`;
      const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json())?.error || 'Error');
      onSaved();
    } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo guardar el evento'); }
    finally { setBusy(false); }
  };
  const del = () => {
    if (!value) return;
    Alert.alert('Eliminar evento', `¿Eliminar «${value.title}»?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { const r = await fetch(`${API_URL}/api/calendar/events/${value.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(); onSaved(); }
        catch { Alert.alert('Error', 'No se pudo eliminar'); }
      } },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{isEdit ? 'Editar evento' : 'Nuevo evento'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <TextInput style={styles.input} placeholder="Título del evento" value={title} onChangeText={setTitle} placeholderTextColor="#999" />
            <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top' }]} placeholder="Descripción / detalles" value={desc} onChangeText={setDesc} multiline placeholderTextColor="#999" />
            <TextInput style={styles.input} placeholder="Lugar (opcional)" value={loc} onChangeText={setLoc} placeholderTextColor="#999" />
            <View style={styles.switchRow}>
              <Text style={styles.label}>Todo el día</Text>
              <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: ORANGE }} />
            </View>
            <Text style={styles.label}>Fecha</Text>
            <TextInput style={styles.input} placeholder="AAAA-MM-DD" value={date} onChangeText={setDate} placeholderTextColor="#999" />
            {!allDay && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Inicio (HH:mm)</Text>
                  <TextInput style={styles.input} placeholder="09:00" value={start} onChangeText={setStart} placeholderTextColor="#999" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Fin (opcional)</Text>
                  <TextInput style={styles.input} placeholder="10:00" value={end} onChangeText={setEnd} placeholderTextColor="#999" />
                </View>
              </View>
            )}
            <Text style={[styles.label, { marginTop: 10 }]}>👥 Involucrados</Text>
            <InvolvedPicker users={users} myId={myId} selected={involved} onChange={setInvolved} />
            <Text style={styles.hint}>Los involucrados verán este evento en su calendario.</Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {isEdit && <TouchableOpacity style={styles.delBtn} onPress={del}><Ionicons name="trash-outline" size={18} color="#C62828" /></TouchableOpacity>}
            <TouchableOpacity style={[styles.newBtn, { flex: 1 }]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.newBtnTxt}>{isEdit ? 'Guardar' : 'Crear'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  hIcon: { padding: 4, width: 40, alignItems: 'center' },
  hTitle: { fontSize: 18, fontWeight: '800', color: '#222' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 10 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: '#222' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8, justifyContent: 'center' },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#ddd' },
  filterChipOn: { backgroundColor: '#FFF3EC', borderColor: ORANGE },
  filterTxt: { fontSize: 11.5, color: '#666', fontWeight: '600' },
  filterTxtOn: { color: ORANGE },
  wdRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#FAFAFA' },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#999', paddingVertical: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, minHeight: 74, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f0f0f0', padding: 2 },
  cellOut: { backgroundColor: '#FCFCFC' },
  dayNum: { alignSelf: 'flex-end', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayNumToday: { backgroundColor: ORANGE },
  dayNumTxt: { fontSize: 11.5, fontWeight: '600', color: '#333' },
  pill: { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, marginTop: 1 },
  pillTxt: { fontSize: 8.5, color: '#222' },
  more: { fontSize: 8.5, color: '#999', paddingLeft: 3, marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, margin: 24, marginTop: 'auto', marginBottom: 'auto' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#222' },
  muted: { color: '#999', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 4, backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  rowSub: { fontSize: 12, color: '#777', marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 12, marginTop: 10 },
  newBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { width: 48, borderRadius: 10, borderWidth: 1, borderColor: '#F1C0C0', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#222', marginBottom: 8, backgroundColor: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 4 },
  hint: { fontSize: 11.5, color: '#999', marginTop: 4, marginBottom: 8 },
  evTitle: { fontSize: 16, fontWeight: '800', color: '#222', marginBottom: 6 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
});
