/**
 * Servicio de integración con Asana
 * Crea tickets de soporte cuando la IA escala a humanos
 */

// Asana API usando fetch nativo (sin dependencias adicionales)
const ASANA_TOKEN = process.env.ASANA_TOKEN || '';
const ASANA_PROJECT_GID = process.env.ASANA_PROJECT_GID || '';

interface AsanaTask {
  gid: string;
  name: string;
  permalink_url: string;
}

interface AsanaTaskResponse {
  data: AsanaTask;
}

/**
 * Crea un ticket en Asana para el equipo de soporte
 */
export const createAsanaTicket = async (
  title: string,
  description: string,
  userEmail: string,
  priority: 'low' | 'medium' | 'high' = 'medium'
): Promise<{ success: boolean; ticketUrl?: string; ticketId?: string; error?: string }> => {
  if (!ASANA_TOKEN || !ASANA_PROJECT_GID) {
    console.warn('⚠️ Asana no configurado. Token o Project GID faltante.');
    // En modo desarrollo, simulamos la creación
    const mockTicketId = `MOCK-${Date.now()}`;
    return {
      success: true,
      ticketId: mockTicketId,
      ticketUrl: `https://app.asana.com/mock/${mockTicketId}`,
    };
  }

  try {
    const priorityEmoji = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
    const now = new Date().toISOString();

    const response = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          projects: [ASANA_PROJECT_GID],
          name: `${priorityEmoji} [IA Escalado] ${title}`,
          notes: `📧 Cliente: ${userEmail}\n📅 Fecha: ${now}\n\n📝 Problema:\n${description}\n\n---\n🤖 Ticket generado automáticamente por EntregaX AI`,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error Asana API:', errorText);
      return { success: false, error: `Error Asana: ${response.status}` };
    }

    const result = (await response.json()) as AsanaTaskResponse;
    
    console.log('✅ Ticket Asana creado:', result.data.gid);
    
    return {
      success: true,
      ticketId: result.data.gid,
      ticketUrl: result.data.permalink_url,
    };
  } catch (error) {
    console.error('Error creando ticket Asana:', error);
    return { success: false, error: 'Error de conexión con Asana' };
  }
};

/**
 * Obtiene los tickets abiertos de un cliente por email
 */
export const getClientTickets = async (userEmail: string): Promise<AsanaTask[]> => {
  if (!ASANA_TOKEN || !ASANA_PROJECT_GID) {
    return [];
  }

  try {
    const response = await fetch(
      `https://app.asana.com/api/1.0/projects/${ASANA_PROJECT_GID}/tasks?opt_fields=name,permalink_url,completed,notes`,
      {
        headers: {
          'Authorization': `Bearer ${ASANA_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const result = await response.json() as { data: AsanaTask[] };
    // Filtrar por email del cliente en las notas
    return result.data.filter((task) => 
      !(task as any).completed && (task as any).notes?.includes(userEmail)
    );
  } catch (error) {
    console.error('Error obteniendo tickets:', error);
    return [];
  }
};
