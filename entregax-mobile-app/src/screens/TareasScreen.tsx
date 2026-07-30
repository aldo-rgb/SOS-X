/**
 * TareasScreen — "Tareas": ver y gestionar TODOS los flujos (tableros).
 * Selector de tablero, vistas Columnas/Matriz, sub-secciones, crear tarea.
 * Para gerencia (super_admin / admin / director).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator,
  RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';
import { ORANGE, BG, EIS, TaskCard, TaskDetailModal, ViewToggle, MatrixView, TaskT } from './tasks/tasksShared';

type Props = NativeStackScreenProps<RootStackParamList, 'TareasAdmin'>;

interface Col { id: number; name: string; col_key: string; is_done?: boolean; gate_checklist?: boolean; sort_order: number; }
interface Sec { id: number; name: string; is_someday?: boolean; sort_order: number; }
interface Board { id: number; name: string; board_type: string; columns: Col[]; sections?: Sec[]; }
interface UserOpt { id: number; full_name: string; role?: string; avg_resolution_seconds?: number | null; }

const EIS_ORDER = ['fuego', 'estrella', 'delegar', 'eliminar'];

export default function TareasScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const H = { Authorization: `Bearer ${token}` };
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<TaskT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  // Crear tarea
  const [createOpen, setCreateOpen] = useState(false);
  const [assignees, setAssignees] = useState<UserOpt[]>([]);
  const [form, setForm] = useState<any>({ title: '', description: '', eisenhower: 'estrella', assignee_id: '', column_id: '', section_id: '' });
  const [saving, setSaving] = useState(false);

  const board = boards.find(b => b.id === activeId) || null;
  const sections: Sec[] = board?.sections || [];
  const somedayId = sections.find(s => s.is_someday)?.id ?? null;

  const loadBoards = useCallback(async (prefer?: number) => {
    try {
      const r = await fetch(`${API_URL}/api/tasks/boards`, { headers: H });
      const d = await r.json();
      const list: Board[] = d.boards || [];
      setBoards(list);
      setActiveId(prev => {
        const want = prefer ?? prev;
        if (want && list.some(b => b.id === want)) return want;
        return (list.find(b => b.board_type === 'operativo') || list[0])?.id ?? null;
      });
    } catch { /* */ } finally { setLoading(false); }
  }, [token]);

  const loadTasks = useCallback(async (bid: number) => {
    try {
      const r = await fetch(`${API_URL}/api/tasks?board_id=${bid}`, { headers: H });
      const d = await r.json();
      setTasks(d.tasks || []);
    } catch { /* */ } finally { setRefreshing(false); }
  }, [token]);

  const loadAssignees = useCallback(async (bid: number) => {
    try {
      const r = await fetch(`${API_URL}/api/tasks/boards/${bid}/assignees`, { headers: H });
      const d = await r.json();
      setAssignees(d.users || []);
    } catch { setAssignees([]); }
  }, [token]);

  useEffect(() => { loadBoards(); }, [loadBoards]);
  useEffect(() => { if (activeId) { loadTasks(activeId); loadAssignees(activeId); setActiveSection(null); } }, [activeId, loadTasks, loadAssignees]);

  const refresh = () => { if (activeId) loadTasks(activeId); };

  const openCreate = () => {
    setForm({ title: '', description: '', eisenhower: 'estrella', assignee_id: '',
      column_id: board?.columns?.[0]?.id || '', section_id: activeSection || '' });
    setCreateOpen(true);
  };
  const createTask = async () => {
    if (!form.title.trim()) { Alert.alert('Falta título', 'Escribe un título con verbo de acción.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: board?.id, title: form.title.trim(), description: form.description || null,
          eisenhower: form.eisenhower, assignee_id: form.assignee_id || null,
          column_id: form.column_id || null, section_id: form.section_id || activeSection || null,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error'); }
      setCreateOpen(false); refresh();
    } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo crear la tarea'); }
    finally { setSaving(false); }
  };

  const visibleCols = board?.columns || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} hitSlop={10}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Tareas</Text>
          <Text style={styles.hSub} numberOfLines={1}>{board?.name || 'Todos los flujos'}</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); refresh(); }} style={styles.hBtn} hitSlop={10}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      {/* Selector de tablero */}
      <View style={styles.boardsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 8, alignItems: 'center' }}>
          {boards.map(b => {
            const active = b.id === activeId;
            return (
              <TouchableOpacity key={b.id} onPress={() => setActiveId(b.id)} style={[styles.boardChip, active && styles.boardChipActive]}>
                <Text style={[styles.boardChipTxt, active && { color: '#fff' }]}>{b.board_type === 'operativo' ? '🎯 ' : '🗂️ '}{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Vista + Nueva tarea */}
      <View style={styles.toolbar}>
        <ViewToggle view={view} onChange={setView} firstLabel="Columnas" />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.newBtn} onPress={openCreate} disabled={!board}>
          <Ionicons name="add" size={18} color="#fff" /><Text style={styles.newBtnTxt}>Nueva</Text>
        </TouchableOpacity>
      </View>

      {/* Sub-secciones (solo vista columnas) */}
      {view === 'list' && sections.length > 0 && (
        <View style={styles.secBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 6, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setActiveSection(null)} style={[styles.secChip, activeSection === null && styles.secChipActive]}>
              <Text style={[styles.secChipTxt, activeSection === null && { color: '#fff' }]}>Todas</Text>
            </TouchableOpacity>
            {sections.map(s => {
              const active = activeSection === s.id;
              return (
                <TouchableOpacity key={s.id} onPress={() => setActiveSection(s.id)} style={[styles.secChip, active && styles.secChipActive]}>
                  <Text style={[styles.secChipTxt, active && { color: '#fff' }]}>{s.is_someday ? '💤 ' : ''}{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : !board ? (
        <View style={styles.center}><Text style={styles.empty}>No hay tableros.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} tintColor={ORANGE} />}>
          {view === 'matrix' ? (
            <MatrixView tasks={tasks} onOpen={setOpenId} />
          ) : (
            <View style={{ gap: 14 }}>
              {visibleCols.map(col => {
                const colTasks = tasks.filter(t => t.column_id === col.id && (
                  activeSection === null ? t.section_id !== somedayId : t.section_id === activeSection
                ));
                return (
                  <View key={col.id}>
                    <View style={styles.colHead}>
                      <View style={[styles.colDot, { backgroundColor: (col as any).color || ORANGE }]} />
                      <Text style={styles.colName}>{col.name}</Text>
                      {col.gate_checklist && <View style={styles.gate}><Text style={styles.gateTxt}>gate</Text></View>}
                      {col.is_done && <View style={styles.done}><Text style={styles.doneTxt}>cierra</Text></View>}
                      <View style={{ flex: 1 }} />
                      <Text style={styles.colCount}>{colTasks.length}</Text>
                    </View>
                    <View style={{ gap: 8, marginTop: 6 }}>
                      {colTasks.length === 0 ? <Text style={[styles.empty, { textAlign: 'left', paddingLeft: 4 }]}>—</Text> :
                        colTasks.map(t => <TaskCard key={t.id} task={t} onPress={() => setOpenId(t.id)} />)}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <TaskDetailModal visible={openId != null} taskId={openId} token={token} canManage columns={visibleCols}
        onClose={() => setOpenId(null)} onChanged={refresh} />

      {/* Crear tarea */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Nueva tarea · {board?.name}</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <TextInput style={styles.fInput} placeholder="Título (usa un verbo de acción)" value={form.title}
                onChangeText={v => setForm({ ...form, title: v })} placeholderTextColor="#999" />
              <TextInput style={[styles.fInput, { height: 72, textAlignVertical: 'top' }]} placeholder="Descripción" multiline
                value={form.description} onChangeText={v => setForm({ ...form, description: v })} placeholderTextColor="#999" />

              <Text style={styles.fLabel}>Prioridad</Text>
              <View style={styles.wrapRow}>
                {EIS_ORDER.map(k => (
                  <TouchableOpacity key={k} onPress={() => setForm({ ...form, eisenhower: k })}
                    style={[styles.optChip, form.eisenhower === k && { backgroundColor: EIS[k].color, borderColor: EIS[k].color }]}>
                    <Text style={[styles.optChipTxt, form.eisenhower === k && { color: '#fff' }]}>{EIS[k].short}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fLabel}>Columna</Text>
              <View style={styles.wrapRow}>
                {visibleCols.map(c => (
                  <TouchableOpacity key={c.id} onPress={() => setForm({ ...form, column_id: c.id })}
                    style={[styles.optChip, form.column_id === c.id && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                    <Text style={[styles.optChipTxt, form.column_id === c.id && { color: '#fff' }]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {form.eisenhower === 'eliminar' ? (
                <Text style={styles.hint}>Se asignará a 💤 Algún día (no aparece en "Todas").</Text>
              ) : sections.filter(s => !s.is_someday).length > 0 && (
                <>
                  <Text style={styles.fLabel}>Sub-sección</Text>
                  <View style={styles.wrapRow}>
                    <TouchableOpacity onPress={() => setForm({ ...form, section_id: '' })}
                      style={[styles.optChip, !form.section_id && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                      <Text style={[styles.optChipTxt, !form.section_id && { color: '#fff' }]}>Ninguna</Text>
                    </TouchableOpacity>
                    {sections.filter(s => !s.is_someday).map(s => (
                      <TouchableOpacity key={s.id} onPress={() => setForm({ ...form, section_id: s.id })}
                        style={[styles.optChip, form.section_id === s.id && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                        <Text style={[styles.optChipTxt, form.section_id === s.id && { color: '#fff' }]}>{s.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.fLabel}>Responsable</Text>
              <View style={styles.wrapRow}>
                <TouchableOpacity onPress={() => setForm({ ...form, assignee_id: '' })}
                  style={[styles.optChip, !form.assignee_id && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                  <Text style={[styles.optChipTxt, !form.assignee_id && { color: '#fff' }]}>Sin asignar</Text>
                </TouchableOpacity>
                {assignees.map(u => (
                  <TouchableOpacity key={u.id} onPress={() => setForm({ ...form, assignee_id: u.id })}
                    style={[styles.optChip, form.assignee_id === u.id && { backgroundColor: ORANGE, borderColor: ORANGE }]}>
                    <Text style={[styles.optChipTxt, form.assignee_id === u.id && { color: '#fff' }]}>{u.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFoot}>
              <TouchableOpacity style={styles.createBtn} onPress={createTask} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createTxt}>Crear tarea</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { color: '#999', fontSize: 13 },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  hBtn: { padding: 6 },
  hTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  boardsBar: { backgroundColor: '#fff', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E4E4E4' },
  boardChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F0F0F0' },
  boardChipActive: { backgroundColor: '#2B2B2B' },
  boardChipTxt: { fontSize: 13, fontWeight: '700', color: '#444' },

  toolbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: ORANGE, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  newBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  secBar: { backgroundColor: '#fff', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  secChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: '#F0F0F0' },
  secChipActive: { backgroundColor: ORANGE },
  secChipTxt: { fontSize: 12, fontWeight: '700', color: '#444' },

  colHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colName: { fontSize: 14, fontWeight: '800', color: '#222' },
  colCount: { fontSize: 12, fontWeight: '700', color: '#888' },
  gate: { backgroundColor: '#FBE6D8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  gateTxt: { fontSize: 9, color: '#B23F12', fontWeight: '700' },
  done: { backgroundColor: '#E4F1E8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  doneTxt: { fontSize: 9, color: '#2E7D46', fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#222', flex: 1, marginRight: 12 },
  fInput: { backgroundColor: '#F4F6F8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#222', marginBottom: 10 },
  fLabel: { fontSize: 13, fontWeight: '800', color: '#333', marginTop: 8, marginBottom: 6 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD' },
  optChipTxt: { fontSize: 12.5, fontWeight: '700', color: '#444' },
  hint: { fontSize: 12, color: '#5A6472', backgroundColor: '#F1F3F5', padding: 8, borderRadius: 8, marginTop: 10 },
  modalFoot: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  createBtn: { backgroundColor: ORANGE, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  createTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
