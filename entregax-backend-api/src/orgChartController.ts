// ============================================
// ORGANIGRAMA CONTROLLER
// Estructura organizacional de EntregaX: departamentos, puestos,
// cadena de mando, asignación de personal y tareas por puesto (con checklist).
//
// FASE 1: el organigrama es autónomo — las "tareas por puesto" son la lista
// de actividades puntuales de cada puesto y NO se conectan (todavía) con el
// módulo Tareas. No llevan prioridad ni responsable.
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// Idempotent migration + seed
// ============================================
let migrated = false;

export const ensureOrgTables = async () => {
  if (migrated) return;

  // Nodos del organigrama (árbol auto-referenciado).
  // node_type: 'department' (raíz de sección) | 'position' (puesto).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_chart_nodes (
      id           SERIAL PRIMARY KEY,
      parent_id    INTEGER REFERENCES org_chart_nodes(id) ON DELETE CASCADE,
      node_type    VARCHAR(20) NOT NULL DEFAULT 'position',
      title        VARCHAR(200) NOT NULL,
      description  TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_nodes_parent ON org_chart_nodes(parent_id);`);

  // Asignación de personal a un puesto (muchos-a-muchos: un puesto puede tener
  // varias personas, p.ej. Asesores, Choferes, Gerentes de CEDIS).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_chart_assignments (
      id           SERIAL PRIMARY KEY,
      node_id      INTEGER NOT NULL REFERENCES org_chart_nodes(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by  INTEGER,
      assigned_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(node_id, user_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_assign_node ON org_chart_assignments(node_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_assign_user ON org_chart_assignments(user_id);`);

  // Tareas por puesto (actividades puntuales). Sin prioridad ni responsable.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_position_tasks (
      id           SERIAL PRIMARY KEY,
      node_id      INTEGER NOT NULL REFERENCES org_chart_nodes(id) ON DELETE CASCADE,
      title        VARCHAR(300) NOT NULL,
      description  TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER,
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_task_node ON org_position_tasks(node_id);`);

  // Checklist de trabajo dentro de una tarea de puesto.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_position_task_items (
      id           SERIAL PRIMARY KEY,
      task_id      INTEGER NOT NULL REFERENCES org_position_tasks(id) ON DELETE CASCADE,
      text         VARCHAR(500) NOT NULL,
      is_done      BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_task_item_task ON org_position_task_items(task_id);`);

  migrated = true;

  // Seed inicial solo si está vacío.
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM org_chart_nodes`);
  if (rows[0].n === 0) {
    await seedOrgChart();
  }
};

// Estructura del documento maestro EntregaX.
type SeedNode = { title: string; description?: string; children?: SeedNode[] };
const ORG_SEED: SeedNode[] = [
  {
    title: 'Dirección Estratégica',
    description: 'Definir el rumbo de la empresa, asegurar el crecimiento financiero, buscar nuevas oportunidades de mercado y garantizar que todos los demás departamentos cuenten con las herramientas para operar.',
    children: [
      { title: 'Director de Operaciones y Finanzas (Socio Fundador)', description: 'Responsable de garantizar la rentabilidad del negocio y la eficiencia operativa. Supervisa directamente los pilares de Administración, Logística y Servicio al Cliente.' },
      { title: 'Director Comercial y de Tecnología (Socio Fundador)', description: 'Responsable de la captación de ingresos y la innovación digital. Supervisa directamente los pilares de Ventas, Marketing y Desarrollo/Soporte Tecnológico.' },
    ],
  },
  {
    title: 'Administración y Finanzas',
    description: 'Proteger la salud financiera de la empresa, asegurar el cumplimiento legal/fiscal, administrar la nómina y garantizar que los recursos fluyan sin interrupciones.',
    children: [
      { title: 'Administradora General', description: 'Es el puente entre la Dirección y la operación diaria. Supervisa que las políticas internas se cumplan, autoriza presupuestos operativos y coordina las necesidades generales de la oficina y el personal.',
        children: [
          { title: 'Contador General', description: 'Responsable del registro contable, cálculo y pago de impuestos, estrategias fiscales y gestión de nóminas.' },
          { title: 'Auxiliar Administrativo', description: 'Encargado de la logística financiera física, realizar depósitos bancarios, trámites oficiales y gestión de mensajería o cobranza en sitio.' },
        ],
      },
    ],
  },
  {
    title: 'Comercial (Ventas y Marketing)',
    description: 'Atraer nuevos prospectos al negocio, cerrar ventas de importación y asegurar la colocación del portafolio completo (Fletes, XPAY y GEX) cumpliendo las metas de ingresos de la empresa.',
    children: [
      { title: 'Coordinadora de Marketing', description: 'Responsable de la generación de demanda (leads). Administra las redes sociales, diseña campañas publicitarias y cuida la imagen premium de la marca EntregaX.' },
      { title: 'Gerente de Ventas (Director Comercial)', description: 'Responsable de liderar a todo el equipo de ventas. Monitorea el CRM, audita el uso correcto del simulador de precios y aplica el esquema de comisiones y penalizaciones.',
        children: [
          { title: 'Líderes de Equipo (Team Leaders)', description: 'Vendedores senior que, además de cerrar cuentas clave, supervisan a un grupo asignado de asesores, apoyándolos en cotizaciones complejas y asegurando su productividad diaria.',
            children: [
              { title: 'Asesores Comerciales', description: 'Especialistas en cierre de negocios. Su deber es contactar prospectos, enviar cotizaciones exactas y cerrar la venta incluyendo los servicios complementarios (Seguro y XPAY).' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Operaciones y Logística',
    description: 'Ejecutar físicamente las promesas de venta. Asegurar que cada paquete cruce aduanas y llegue a su destino en el tiempo prometido, operando bajo el lema "Fácil y Seguro".',
    children: [
      { title: 'Coordinador de Operaciones Aéreas y Marítimas', description: 'Enlace principal con navieras, aerolíneas y aduanas. Gestiona los tiempos de tránsito internacional y resuelve bloqueos documentales de la carga.' },
      { title: 'Coordinador de Tráfico', description: 'Es la torre de control terrestre. Monitorea las rutas, vigila el cumplimiento de horarios y asigna recolecciones y entregas locales.',
        children: [
          { title: 'Choferes / Repartidores', description: 'Responsables del traslado seguro de la mercancía de primera y última milla. Reportan directamente a la Coordinadora de Tráfico.' },
        ],
      },
      { title: 'Gerentes de CEDIS (MTY, CDMX, USA)', description: 'Responsables absolutos del orden, seguridad y eficiencia de su respectivo almacén y del personal que labora dentro de él.',
        children: [
          { title: 'Capturistas y Auxiliares de Bodega', description: 'Responsables de la carga, descarga, empaque seguro y captura de datos (guías, pesos y medidas) en el sistema. Reportan a su respectivo Gerente de CEDIS.' },
        ],
      },
    ],
  },
  {
    title: 'Experiencia del Cliente (Customer Service)',
    description: 'Retener y fidelizar a los clientes actuales. Actuar como solucionadores de problemas, gestionando garantías, rastreos y quejas con empatía y rapidez.',
    children: [
      { title: 'Gerente de Servicio al Cliente', description: 'Líder del área. Tiene la autoridad para mediar disputas, autorizar garantías (GEX) según las políticas internas y evitar que los problemas escalen a la Dirección General.',
        children: [
          { title: 'Ejecutivo de Servicio al Cliente', description: 'Primer punto de contacto post-venta. Atiende llamadas, mensajes y correos de clientes con dudas sobre sus envíos, levanta tickets de soporte y da seguimiento hasta el cierre del caso.' },
        ],
      },
    ],
  },
  {
    title: 'Tecnología e Innovación (IT)',
    description: 'Garantizar que todo el ecosistema tecnológico de la empresa (App, XPAY, CRM y equipos físicos) funcione sin interrupciones para no detener la operación.',
    children: [
      { title: 'Soporte Técnico (IT)', description: 'Responsable del mantenimiento de computadoras, redes de internet en los CEDIS, soporte a usuarios internos y gestión de accesos o fallas menores en la plataforma de EntregaX.' },
    ],
  },
];

const seedOrgChart = async () => {
  const insertNode = async (n: SeedNode, parentId: number | null, type: 'department' | 'position', order: number): Promise<void> => {
    const res = await pool.query(
      `INSERT INTO org_chart_nodes (parent_id, node_type, title, description, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [parentId, type, n.title, n.description || null, order]
    );
    const id = res.rows[0].id;
    if (n.children) {
      let i = 0;
      for (const child of n.children) {
        await insertNode(child, id, 'position', i++);
      }
    }
  };
  let d = 0;
  for (const dept of ORG_SEED) {
    await insertNode(dept, null, 'department', d++);
  }
};

// ============================================
// GET /api/admin/hr/org-chart  → árbol completo + asignados + conteo de tareas
// ============================================
export const getOrgChart = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const nodesRes = await pool.query(`
      SELECT n.id, n.parent_id, n.node_type, n.title, n.description, n.sort_order,
             COALESCE((SELECT COUNT(*)::int FROM org_position_tasks t WHERE t.node_id = n.id), 0) AS task_count
        FROM org_chart_nodes n
       ORDER BY n.parent_id NULLS FIRST, n.sort_order, n.id
    `);
    const assignRes = await pool.query(`
      SELECT a.node_id, a.user_id, u.full_name, u.role, u.profile_photo_url, u.employee_number
        FROM org_chart_assignments a
        JOIN users u ON u.id = a.user_id
       ORDER BY u.full_name
    `);
    const assignByNode: Record<number, any[]> = {};
    for (const r of assignRes.rows) {
      (assignByNode[r.node_id] ||= []).push({
        user_id: r.user_id, full_name: r.full_name, role: r.role,
        profile_photo_url: r.profile_photo_url, employee_number: r.employee_number,
      });
    }
    const nodes = nodesRes.rows.map(n => ({ ...n, assignees: assignByNode[n.id] || [] }));
    res.json({ nodes });
  } catch (error) {
    console.error('Error getOrgChart:', error);
    res.status(500).json({ error: 'Error al obtener el organigrama' });
  }
};

// ============================================
// Nodos: crear / actualizar / eliminar
// ============================================
export const createOrgNode = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const { parent_id, title, description, node_type } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    const type = node_type === 'department' ? 'department' : 'position';
    // sort_order = al final de sus hermanos
    const ord = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM org_chart_nodes WHERE parent_id IS NOT DISTINCT FROM $1`,
      [parent_id || null]
    );
    const r = await pool.query(
      `INSERT INTO org_chart_nodes (parent_id, node_type, title, description, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parent_id || null, type, String(title).trim(), description || null, ord.rows[0].n]
    );
    res.json({ node: { ...r.rows[0], assignees: [], task_count: 0 } });
  } catch (error) {
    console.error('Error createOrgNode:', error);
    res.status(500).json({ error: 'Error al crear el puesto' });
  }
};

export const updateOrgNode = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const id = parseInt(String(req.params.id || ""), 10);
    const { title, description, parent_id, sort_order } = req.body;
    // Evitar ciclo: un nodo no puede colgar de sí mismo ni de un descendiente.
    if (parent_id !== undefined && parent_id !== null) {
      if (parseInt(parent_id) === id) return res.status(400).json({ error: 'Un puesto no puede depender de sí mismo' });
      const desc = await pool.query(
        `WITH RECURSIVE sub AS (
           SELECT id FROM org_chart_nodes WHERE id = $1
           UNION ALL
           SELECT n.id FROM org_chart_nodes n JOIN sub ON n.parent_id = sub.id
         ) SELECT 1 FROM sub WHERE id = $2`,
        [id, parseInt(parent_id)]
      );
      if (desc.rowCount) return res.status(400).json({ error: 'No puedes mover un puesto dentro de su propia rama' });
    }
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (title !== undefined) { sets.push(`title = $${i++}`); params.push(String(title).trim()); }
    if (description !== undefined) { sets.push(`description = $${i++}`); params.push(description || null); }
    if (parent_id !== undefined) { sets.push(`parent_id = $${i++}`); params.push(parent_id || null); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); params.push(parseInt(sort_order) || 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const r = await pool.query(`UPDATE org_chart_nodes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Puesto no encontrado' });
    res.json({ node: r.rows[0] });
  } catch (error) {
    console.error('Error updateOrgNode:', error);
    res.status(500).json({ error: 'Error al actualizar el puesto' });
  }
};

export const deleteOrgNode = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const id = parseInt(String(req.params.id || ""), 10);
    // ON DELETE CASCADE elimina hijos, asignaciones y tareas.
    const r = await pool.query(`DELETE FROM org_chart_nodes WHERE id = $1`, [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Puesto no encontrado' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleteOrgNode:', error);
    res.status(500).json({ error: 'Error al eliminar el puesto' });
  }
};

// ============================================
// Asignación de personal
// ============================================
export const assignPersonToNode = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const nodeId = parseInt(String(req.params.id || ""), 10);
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Falta el empleado' });
    await pool.query(
      `INSERT INTO org_chart_assignments (node_id, user_id, assigned_by)
       VALUES ($1, $2, $3) ON CONFLICT (node_id, user_id) DO NOTHING`,
      [nodeId, parseInt(user_id), (req as any).user?.id || null]
    );
    const r = await pool.query(
      `SELECT a.user_id, u.full_name, u.role, u.profile_photo_url, u.employee_number
         FROM org_chart_assignments a JOIN users u ON u.id = a.user_id
        WHERE a.node_id = $1 ORDER BY u.full_name`,
      [nodeId]
    );
    res.json({ assignees: r.rows });
  } catch (error) {
    console.error('Error assignPersonToNode:', error);
    res.status(500).json({ error: 'Error al asignar personal' });
  }
};

export const unassignPersonFromNode = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const nodeId = parseInt(String(req.params.id || ""), 10);
    const userId = parseInt(String(req.params.userId || ""), 10);
    await pool.query(`DELETE FROM org_chart_assignments WHERE node_id = $1 AND user_id = $2`, [nodeId, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unassignPersonFromNode:', error);
    res.status(500).json({ error: 'Error al quitar personal' });
  }
};

// ============================================
// Tareas por puesto (+ checklist)
// ============================================
export const getNodeTasks = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const nodeId = parseInt(String(req.params.id || ""), 10);
    const tasksRes = await pool.query(
      `SELECT id, node_id, title, description, sort_order FROM org_position_tasks
        WHERE node_id = $1 ORDER BY sort_order, id`,
      [nodeId]
    );
    const ids = tasksRes.rows.map(t => t.id);
    let itemsByTask: Record<number, any[]> = {};
    if (ids.length) {
      const itemsRes = await pool.query(
        `SELECT id, task_id, text, is_done, sort_order FROM org_position_task_items
          WHERE task_id = ANY($1::int[]) ORDER BY sort_order, id`,
        [ids]
      );
      for (const it of itemsRes.rows) (itemsByTask[it.task_id] ||= []).push(it);
    }
    const tasks = tasksRes.rows.map(t => ({ ...t, items: itemsByTask[t.id] || [] }));
    res.json({ tasks });
  } catch (error) {
    console.error('Error getNodeTasks:', error);
    res.status(500).json({ error: 'Error al obtener las tareas del puesto' });
  }
};

export const createNodeTask = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const nodeId = parseInt(String(req.params.id || ""), 10);
    const { title, description } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'El título de la tarea es obligatorio' });
    const ord = await pool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM org_position_tasks WHERE node_id = $1`, [nodeId]);
    const r = await pool.query(
      `INSERT INTO org_position_tasks (node_id, title, description, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, node_id, title, description, sort_order`,
      [nodeId, String(title).trim(), description || null, ord.rows[0].n, (req as any).user?.id || null]
    );
    res.json({ task: { ...r.rows[0], items: [] } });
  } catch (error) {
    console.error('Error createNodeTask:', error);
    res.status(500).json({ error: 'Error al crear la tarea' });
  }
};

export const updateNodeTask = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const taskId = parseInt(String(req.params.taskId || ""), 10);
    const { title, description } = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (title !== undefined) { sets.push(`title = $${i++}`); params.push(String(title).trim()); }
    if (description !== undefined) { sets.push(`description = $${i++}`); params.push(description || null); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push(`updated_at = NOW()`);
    params.push(taskId);
    const r = await pool.query(`UPDATE org_position_tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, node_id, title, description, sort_order`, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ task: r.rows[0] });
  } catch (error) {
    console.error('Error updateNodeTask:', error);
    res.status(500).json({ error: 'Error al actualizar la tarea' });
  }
};

export const deleteNodeTask = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const taskId = parseInt(String(req.params.taskId || ""), 10);
    const r = await pool.query(`DELETE FROM org_position_tasks WHERE id = $1`, [taskId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleteNodeTask:', error);
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
};

// ---- Checklist items ----
export const addTaskItem = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const taskId = parseInt(String(req.params.taskId || ""), 10);
    const { text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'El texto del punto es obligatorio' });
    const ord = await pool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM org_position_task_items WHERE task_id = $1`, [taskId]);
    const r = await pool.query(
      `INSERT INTO org_position_task_items (task_id, text, sort_order) VALUES ($1, $2, $3)
       RETURNING id, task_id, text, is_done, sort_order`,
      [taskId, String(text).trim(), ord.rows[0].n]
    );
    res.json({ item: r.rows[0] });
  } catch (error) {
    console.error('Error addTaskItem:', error);
    res.status(500).json({ error: 'Error al agregar el punto del checklist' });
  }
};

export const updateTaskItem = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const itemId = parseInt(String(req.params.itemId || ""), 10);
    const { text, is_done } = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (text !== undefined) { sets.push(`text = $${i++}`); params.push(String(text).trim()); }
    if (is_done !== undefined) { sets.push(`is_done = $${i++}`); params.push(!!is_done); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(itemId);
    const r = await pool.query(`UPDATE org_position_task_items SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, task_id, text, is_done, sort_order`, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Punto no encontrado' });
    res.json({ item: r.rows[0] });
  } catch (error) {
    console.error('Error updateTaskItem:', error);
    res.status(500).json({ error: 'Error al actualizar el punto' });
  }
};

export const deleteTaskItem = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureOrgTables();
    const itemId = parseInt(String(req.params.itemId || ""), 10);
    const r = await pool.query(`DELETE FROM org_position_task_items WHERE id = $1`, [itemId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Punto no encontrado' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleteTaskItem:', error);
    res.status(500).json({ error: 'Error al eliminar el punto' });
  }
};
