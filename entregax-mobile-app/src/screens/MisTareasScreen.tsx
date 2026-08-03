/**
 * MisTareasScreen — "Mis Tareas": las tareas asignadas al usuario, a través de
 * todos los tableros. Dos vistas: Lista y Matriz Eisenhower.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';
import { ORANGE, BG, TaskCard, TaskDetailModal, ViewToggle, MatrixView, CreateTaskModal, ScheduleTaskModal, TaskT } from './tasks/tasksShared';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTasks'>;

export default function MisTareasScreen({ navigation, route }: Props) {
  const { token, user } = route.params;
  const myId = Number(user?.id) || 0;
  const [tasks, setTasks] = useState<TaskT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/tasks/mine`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setTasks(d.tasks || []);
    } catch { /* */ } finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Mover una tarea de cuadrante = cambiar su prioridad (eisenhower). Optimista.
  const moveTask = useCallback(async (taskId: number, eisenhower: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, eisenhower } : t));
    try {
      await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eisenhower }),
      });
    } catch { load(); }
  }, [token, load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} hitSlop={10}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Mis Tareas</Text>
          <Text style={styles.hSub}>{tasks.length} pendiente(s)</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={styles.hBtn} hitSlop={10}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ViewToggle view={view} onChange={setView} firstLabel="Lista" />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.schedBtn} onPress={() => setSchedOpen(true)}>
          <Ionicons name="calendar-outline" size={16} color="#B07206" />
          <Text style={styles.schedBtnTxt}>Programar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.newBtn} onPress={() => setCreateOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnTxt}>Nueva</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : tasks.length === 0 ? (
        <View style={styles.center}><Ionicons name="checkmark-done-circle-outline" size={44} color="#BBB" /><Text style={styles.empty}>No tienes tareas pendientes 🎉</Text></View>
      ) : view === 'matrix' ? (
        // Matriz 2×2 que llena la pantalla (fuera del ScrollView; cada cuadrante hace scroll interno).
        <View style={{ flex: 1, padding: 10 }}>
          <MatrixView tasks={tasks} onOpen={setOpenId} showBoard myId={myId} onMove={moveTask} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}>
          <View style={{ gap: 10 }}>
            {tasks.map(t => <TaskCard key={t.id} task={t} onPress={() => setOpenId(t.id)} showBoard />)}
          </View>
        </ScrollView>
      )}

      <TaskDetailModal visible={openId != null} taskId={openId} token={token} canManage={false}
        onClose={() => setOpenId(null)} onChanged={load} />
      <CreateTaskModal visible={createOpen} token={token} myId={myId}
        onClose={() => setCreateOpen(false)} onCreated={load} />
      <ScheduleTaskModal visible={schedOpen} token={token} myId={myId}
        onClose={() => setSchedOpen(false)} onCreated={load} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  empty: { color: '#888', fontSize: 14 },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  hBtn: { padding: 6 },
  hTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },
  toolbar: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD', flexDirection: 'row', alignItems: 'center', gap: 8 },
  schedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#B07206' },
  schedBtnTxt: { color: '#B07206', fontWeight: '800', fontSize: 12.5 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: ORANGE },
  newBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
