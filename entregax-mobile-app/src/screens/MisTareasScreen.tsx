/**
 * MisTareasScreen — "Mis Tareas": las tareas asignadas al usuario, a través de
 * todos los tableros. Dos vistas: Lista y Matriz Eisenhower.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';
import { ORANGE, BG, TaskCard, TaskDetailModal, ViewToggle, MatrixView, CreateTaskModal, ScheduleTaskModal, TaskT, esPendienteDeMi } from './tasks/tasksShared';

type Props = NativeStackScreenProps<RootStackParamList, 'MyTasks'>;

export default function MisTareasScreen({ navigation, route }: Props) {
  const { token, user } = route.params;
  const myId = Number(user?.id) || 0;
  // Asesor/sub-asesor: al crear tarea NO ve categorías ni involucrados (solo Personal).
  const isAdvisorUser = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider'].includes(String(user?.role || '').toLowerCase());
  const [tasks, setTasks] = useState<TaskT[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [eventDetail, setEventDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  // Ocultar tareas personales en horario laboral (10am–7pm). El toggle se apaga
  // por default cada vez que se entra a la pantalla (useFocusEffect).
  const [showPersonal, setShowPersonal] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // Global = todas donde estoy involucrado; !global = solo mis tareas (responsable,
  // sin leer, o esperando mi confirmación).
  const [globalView, setGlobalView] = useState(false);
  const [catFilter, setCatFilter] = useState<number | 'all'>('all');
  // 🔍 Buscador de texto (título, descripción, responsable, involucrados, id).
  const [searchText, setSearchText] = useState('');
  useFocusEffect(useCallback(() => { setShowPersonal(false); }, []));
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);

  // La búsqueda la resuelve el servidor, no el filtro local: filtrando aquí solo
  // se encontraba lo que ya estaba cargado —o sea, las abiertas— y el super
  // admin no podía dar con una tarea del equipo. Con ?q= el backend busca en las
  // terminadas también, y para el super admin en todas las del equipo.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    try {
      const params = debouncedQ
        ? `?q=${encodeURIComponent(debouncedQ)}`
        : (showDone ? '?all=true' : '');
      const r = await fetch(`${API_URL}/api/tasks/mine${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setTasks(d.tasks || []);
      setEvents(d.events || []);
    } catch { /* */ } finally { setLoading(false); setRefreshing(false); }
  }, [token, showDone, debouncedQ]);
  useEffect(() => { load(); }, [load]);
  // Abrir una tarea específica al llegar desde una notificación ("te involucraron en una tarea").
  useEffect(() => { if (route.params?.openTaskId) setOpenId(route.params.openTaskId); }, [route.params?.openTaskId]);

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

  // Tarea "personal" = tablero personal sin más involucrados. Se oculta en horario laboral.
  const isPersonalTask = (t: TaskT) => t.board_key === 'personales' && (t.participants_count || 0) <= 1;
  const nowHour = new Date().getHours();
  const isWorkHours = nowHour >= 10 && nowHour < 19; // 10am–7pm
  const hidePersonal = isWorkHours && !showPersonal;
  const personalOk = hidePersonal ? tasks.filter(t => !isPersonalTask(t)) : tasks;
  // Opciones de categoría (tablero) presentes en las tareas.
  const boardOptions = Array.from(
    new Map(tasks.filter(t => t.board_id).map(t => [Number(t.board_id), t.board_name || 'Sin categoría'])).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const catTasks = catFilter === 'all' ? personalOk : personalOk.filter(t => Number(t.board_id) === catFilter);
  const isMine = (t: TaskT) => Number(t.assignee_id) === myId
    || (t.unread_count || 0) > 0
    || (t.status === 'awaiting_confirmation' && Number((t as any).created_by) === myId);
  // Buscando NO se aplica el filtro de "mías": el servidor ya definió el alcance
  // —las propias para todos, todas las del equipo para el super admin— y
  // recortarlo aquí volvería a esconder justo lo que se está buscando.
  const hayBusqueda = searchText.trim().length > 0;
  const mineTasks = (globalView || hayBusqueda) ? catTasks : catTasks.filter(isMine);
  // Filtro de búsqueda: normaliza sin acentos y compara contra título,
  // descripción, categoría, responsable, involucrados e ID.
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normSearch = (s: any) => stripAccents(String(s ?? '')).toLowerCase();
  // El backend ya filtró por texto; aquí solo se afina mientras se escribe, para
  // que la lista responda sin esperar al debounce. Si el término aún no llega al
  // servidor, este filtro evita mostrar resultados que no corresponden.
  const searchQ = normSearch(searchText).trim();
  const visibleTasks = !searchQ ? mineTasks : mineTasks.filter(t => {
    const parts: string[] = [
      String(t.id),
      `t-${t.id}`,
      t.title || '',
      (t as any).description || '',
      t.board_name || '',
      (t as any).assignee_name || '',
      ...((t as any).participant_names || []),
    ];
    return parts.some(p => normSearch(p).includes(searchQ));
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} hitSlop={10}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>Mis Tareas</Text>
          {/* Cuenta lo que espera algo de MI: lo asignado a mi, mas lo que yo
              asigne y ya esta esperando que YO lo confirme. */}
          <Text style={styles.hSub}>{tasks.filter(t => esPendienteDeMi(t, myId)).length} pendiente(s){showDone ? ' · con terminadas' : ''}</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={styles.hBtn} hitSlop={10}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      {/* La fila era fija y desbordaba el ancho del teléfono: el botón de crear
          quedaba fuera de pantalla. Ahora los filtros van en un carrusel que se
          encoge, y "Nueva" queda anclado a la derecha con flexShrink 0, así que
          siempre se ve sin importar cuántos filtros haya. */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 8 }}
        >
          <ViewToggle view={view} onChange={setView} firstLabel="Lista" iconOnly />
          {isWorkHours && (
            <TouchableOpacity onPress={() => setShowPersonal(v => !v)} style={[styles.iconBtnOutline, showPersonal && styles.persBtnOn]}>
              <Ionicons name="home" size={18} color={showPersonal ? '#fff' : '#B07206'} />
            </TouchableOpacity>
          )}
          {/* Global vs solo mis tareas */}
          <TouchableOpacity onPress={() => setGlobalView(v => !v)} style={[styles.iconBtnOutline, { borderColor: '#5E35B1' }, globalView && { backgroundColor: '#5E35B1' }]} hitSlop={8}>
            <Ionicons name={globalView ? 'earth' : 'person'} size={18} color={globalView ? '#fff' : '#5E35B1'} />
          </TouchableOpacity>
          {/* Ver completadas (incluye terminadas) */}
          <TouchableOpacity onPress={() => setShowDone(v => !v)} style={[styles.iconBtnOutline, { borderColor: '#2E7D46' }, showDone && { backgroundColor: '#2E7D46' }]} hitSlop={8}>
            <Ionicons name="checkmark-done" size={18} color={showDone ? '#fff' : '#2E7D46'} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtnOutline} onPress={() => setSchedOpen(true)} hitSlop={8}>
            <Ionicons name="calendar-outline" size={20} color="#B07206" />
          </TouchableOpacity>
        </ScrollView>
        <TouchableOpacity style={styles.newTaskBtn} onPress={() => setCreateOpen(true)} hitSlop={8} accessibilityLabel="Nueva tarea">
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 🔍 Buscador de tareas */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar tarea…"
            placeholderTextColor="#999"
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {boardOptions.length > 1 && (
        <View style={styles.catBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            <TouchableOpacity onPress={() => setCatFilter('all')} style={[styles.catChip, catFilter === 'all' && styles.catChipOn]}>
              <Text style={[styles.catChipTxt, catFilter === 'all' && styles.catChipTxtOn]}>Todas</Text>
            </TouchableOpacity>
            {boardOptions.map(b => (
              <TouchableOpacity key={b.id} onPress={() => setCatFilter(b.id)} style={[styles.catChip, catFilter === b.id && styles.catChipOn]}>
                <Text style={[styles.catChipTxt, catFilter === b.id && styles.catChipTxtOn]} numberOfLines={1}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Eventos del calendario de HOY (usuario involucrado) */}
      {events.length > 0 && (
        <View style={styles.evBox}>
          <Text style={styles.evHead}>📅 Hoy tienes {events.length} evento{events.length === 1 ? '' : 's'}</Text>
          {events.map(ev => (
            <TouchableOpacity key={ev.id} style={styles.evCard} onPress={() => setEventDetail(ev)}>
              <Ionicons name="calendar" size={18} color="#1565C0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.evTitle} numberOfLines={1}>{ev.title}</Text>
                <Text style={styles.evSub}>🕒 {ev.all_day ? 'Todo el día' : new Date(ev.start_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}{ev.location ? ` · 📍 ${ev.location}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0B0B0" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : tasks.length === 0 && events.length === 0 ? (
        <View style={styles.center}><Ionicons name="checkmark-done-circle-outline" size={44} color="#BBB" /><Text style={styles.empty}>No tienes tareas pendientes 🎉</Text></View>
      ) : visibleTasks.length === 0 ? (
        personalOk.length === 0 && hidePersonal ? (
          <View style={styles.center}>
            <Ionicons name="home-outline" size={44} color="#BBB" />
            <Text style={styles.empty}>Tus tareas personales están ocultas en horario laboral (10am–7pm).</Text>
            <TouchableOpacity onPress={() => setShowPersonal(true)} style={[styles.persBtn, styles.persBtnOn, { marginTop: 14 }]}>
              <Ionicons name="home" size={14} color="#fff" />
              <Text style={[styles.persBtnTxt, { color: '#fff' }]}>Mostrar personales</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <Ionicons name="folder-open-outline" size={44} color="#BBB" />
            <Text style={styles.empty}>No hay tareas en esta categoría.</Text>
            <TouchableOpacity onPress={() => setCatFilter('all')} style={[styles.persBtn, styles.persBtnOn, { marginTop: 14 }]}>
              <Text style={[styles.persBtnTxt, { color: '#fff' }]}>Ver todas</Text>
            </TouchableOpacity>
          </View>
        )
      ) : view === 'matrix' ? (
        // Matriz 2×2 que llena la pantalla (fuera del ScrollView; cada cuadrante hace scroll interno).
        <View style={{ flex: 1, padding: 10 }}>
          <MatrixView tasks={visibleTasks} onOpen={setOpenId} showBoard myId={myId} onMove={moveTask} preScoped />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}>
          <View style={{ gap: 16 }}>
            {(() => {
              const ms = (s?: string) => (s ? new Date(s).getTime() : 0);
              const nueva = visibleTasks.filter(t => t.status === 'open' && !t.started_at).sort((a, b) => ms(b.created_at) - ms(a.created_at));
              const proceso = visibleTasks.filter(t => t.status === 'open' && !!t.started_at).sort((a, b) => ms(a.started_at) - ms(b.started_at));
              const espera = visibleTasks.filter(t => t.status === 'awaiting_confirmation').sort((a, b) => ms(a.updated_at) - ms(b.updated_at));
              const terminadas = visibleTasks.filter(t => t.status === 'completed').sort((a, b) => ms(b.completed_at) - ms(a.completed_at));
              const secs = [
                { key: 'nueva', title: '🆕 Nueva', color: '#1D6FB8', tasks: nueva },
                { key: 'proceso', title: '⚙️ En proceso', color: '#B07206', tasks: proceso },
                { key: 'espera', title: '⏳ En espera de confirmación', color: '#C77800', tasks: espera },
                { key: 'done', title: '✅ Terminadas', color: '#2E7D46', tasks: terminadas },
              ];
              return secs.filter(s => s.tasks.length > 0).map(s => (
                <View key={s.key} style={{ gap: 8 }}>
                  <Text style={{ fontWeight: '800', fontSize: 13, color: s.color }}>{s.title} ({s.tasks.length})</Text>
                  {s.tasks.map(t => <TaskCard key={t.id} task={t} onPress={() => setOpenId(t.id)} showBoard myId={myId} />)}
                </View>
              ));
            })()}
          </View>
        </ScrollView>
      )}

      <TaskDetailModal visible={openId != null} taskId={openId} token={token} canManage={false} myId={myId}
        onClose={() => setOpenId(null)} onChanged={load} />
      <CreateTaskModal visible={createOpen} token={token} myId={myId} advisorMode={isAdvisorUser}
        onClose={() => setCreateOpen(false)} onCreated={load} />
      <ScheduleTaskModal visible={schedOpen} token={token} myId={myId} advisorMode={isAdvisorUser}
        onClose={() => setSchedOpen(false)} onCreated={load} />

      {/* Detalle de evento */}
      <Modal visible={!!eventDetail} transparent animationType="fade" onRequestClose={() => setEventDetail(null)}>
        <View style={styles.evBackdrop}>
          <View style={styles.evModal}>
            {eventDetail && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={styles.evModalTitle}>📅 {eventDetail.title}</Text>
                  <TouchableOpacity onPress={() => setEventDetail(null)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
                </View>
                <Text style={styles.evSub}>🕒 {eventDetail.all_day ? 'Todo el día' : `${new Date(eventDetail.start_at).toLocaleString('es-MX')}${eventDetail.end_at ? ' – ' + new Date(eventDetail.end_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}`}</Text>
                {!!eventDetail.location && <Text style={[styles.evSub, { marginTop: 4 }]}>📍 {eventDetail.location}</Text>}
                {!!eventDetail.description && <Text style={{ fontSize: 14, color: '#333', marginTop: 10 }}>{eventDetail.description}</Text>}
                <TouchableOpacity style={styles.evCloseBtn} onPress={() => setEventDetail(null)}><Text style={{ color: '#fff', fontWeight: '700' }}>Cerrar</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  evBox: { paddingHorizontal: 12, paddingTop: 10 },
  evHead: { fontSize: 13, fontWeight: '800', color: '#1565C0', marginBottom: 6 },
  evCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F9FF', borderLeftWidth: 4, borderLeftColor: '#1565C0', borderRadius: 10, padding: 10, marginBottom: 8 },
  evTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  evSub: { fontSize: 12, color: '#777', marginTop: 2 },
  evBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  evModal: { backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  evModalTitle: { fontSize: 16, fontWeight: '800', color: '#1565C0', flex: 1 },
  evCloseBtn: { backgroundColor: '#777', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
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
  persBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#B07206', marginLeft: 8 },
  persBtnOn: { backgroundColor: '#B07206' },
  persBtnTxt: { color: '#B07206', fontWeight: '800', fontSize: 12.5 },
  iconBtnOutline: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#B07206', alignItems: 'center', justifyContent: 'center' },
  iconBtnFilled: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  // Redondo y compacto: con la etiqueta "Nueva" se comía el ancho y tapaba los
  // filtros. flexShrink 0 para que nunca se encoja ni se salga de pantalla.
  newTaskBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ORANGE, flexShrink: 0, marginLeft: 4 },
  catBar: { paddingBottom: 8, backgroundColor: BG },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', maxWidth: 180 },
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#DDD' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F4F4', borderRadius: 10, paddingHorizontal: 10, height: 36 },
  searchInput: { flex: 1, fontSize: 14, color: '#222', padding: 0 },
  catChipOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  catChipTxt: { fontSize: 12.5, fontWeight: '700', color: '#555' },
  catChipTxtOn: { color: '#fff' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: ORANGE },
  newBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
