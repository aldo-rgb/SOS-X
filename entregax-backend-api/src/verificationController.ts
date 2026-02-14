import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { createNotification } from './notificationController';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Inicializar cliente OpenAI (lazy init para asegurar que env está cargado)
let openaiClient: OpenAI | null = null;
const getOpenAI = () => {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
};

// ============ COMPARAR ROSTROS CON GPT-4 VISION ============
async function compareFacesWithAI(selfieBase64: string, ineBase64: string): Promise<{ match: boolean; confidence: string; reason: string }> {
    try {
        const response = await getOpenAI().chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Eres un experto en verificación de identidad. Tu trabajo es comparar dos imágenes:
1. Una selfie de una persona
2. Una foto de identificación oficial (Identificacion Oficial)

Debes determinar si la persona en la selfie es la misma que aparece en el documento de identidad.

IMPORTANTE: Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "match": true/false,
  "confidence": "high"/"medium"/"low",
  "reason": "explicación breve en español"
}

Criterios de evaluación:
- Rasgos faciales (ojos, nariz, boca, forma del rostro)
- Considerar que puede haber diferencias por edad, iluminación, ángulo
- Si la imagen está borrosa o no se ve bien el rostro, indica confidence "low"
- Si claramente no es la misma persona, match=false con confidence "high"`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Compara estas dos imágenes. La primera es la selfie del usuario, la segunda es su INE. ¿Es la misma persona?"
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: selfieBase64.startsWith('data:') ? selfieBase64 : `data:image/jpeg;base64,${selfieBase64}`,
                                detail: "high"
                            }
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: ineBase64.startsWith('data:') ? ineBase64 : `data:image/jpeg;base64,${ineBase64}`,
                                detail: "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens: 300,
        });

        const content = response.choices[0]?.message?.content || '';
        
        // Extraer JSON de la respuesta
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                match: result.match === true,
                confidence: result.confidence || 'medium',
                reason: result.reason || 'Análisis completado'
            };
        }

        // Si no hay JSON válido, asumir que no hubo match
        return {
            match: false,
            confidence: 'low',
            reason: 'No se pudo analizar correctamente las imágenes'
        };

    } catch (error: any) {
        console.error('Error en OpenAI Vision:', error);
        
        // Si no hay API key o hay error, usar modo simulado
        if (error.code === 'invalid_api_key' || !process.env.OPENAI_API_KEY) {
            console.log('⚠️ MODO SIMULADO: No hay API key de OpenAI configurada');
            return {
                match: true,
                confidence: 'simulated',
                reason: 'Verificación simulada - Configurar OPENAI_API_KEY para verificación real'
            };
        }
        
        throw new Error('Error al procesar verificación de identidad');
    }
}

// ============ SUBIR DOCUMENTOS DE VERIFICACIÓN ============
export const uploadVerificationDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        
        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const { ineFrontBase64, ineBackBase64, selfieBase64, signatureBase64 } = req.body;

        // Validar que todos los documentos estén presentes
        if (!ineFrontBase64 || !ineBackBase64 || !selfieBase64 || !signatureBase64) {
            res.status(400).json({ error: 'Todos los documentos son requeridos (ID frente, ID reverso, selfie y firma)' });
            return;
        }

        // ============ VERIFICACIÓN CON GPT-4 VISION ============
        console.log('🔍 Iniciando verificación facial con IA...');
        
        const aiAnalysis = await compareFacesWithAI(selfieBase64, ineFrontBase64);
        
        console.log('📊 Resultado IA:', aiAnalysis);

        let verificationStatus: string;
        let isVerified: boolean;

        if (aiAnalysis.match && aiAnalysis.confidence !== 'low') {
            // IA aprobó con confianza
            verificationStatus = 'verified';
            isVerified = true;
        } else {
            // IA no pudo verificar o tiene baja confianza -> Revisión manual
            verificationStatus = 'pending_review';
            isVerified = false;
        }

        // Guardar documentos (base64) y actualizar estado de verificación
        const timestamp = Date.now();
        await pool.query(
            `UPDATE users 
             SET ine_front_url = $1, 
                 ine_back_url = $2, 
                 selfie_url = $3, 
                 signature_url = $4, 
                 verification_status = $5, 
                 is_verified = $6,
                 verification_submitted_at = NOW(),
                 ai_verification_reason = $8
             WHERE id = $7`,
            [
                ineFrontBase64, 
                ineBackBase64, 
                selfieBase64, 
                signatureBase64, 
                verificationStatus, 
                isVerified,
                userId,
                aiAnalysis.reason
            ]
        );

        if (isVerified) {
            res.json({ 
                success: true,
                message: '✅ ¡Identidad verificada exitosamente!',
                confidence: aiAnalysis.confidence,
                status: verificationStatus
            });
        } else {
            // Enviar respuesta de éxito pero indicando revisión pendiente
            res.json({ 
                success: true,
                pendingReview: true,
                message: '📋 Tus documentos han sido recibidos y están en revisión',
                confidence: aiAnalysis.confidence,
                reason: 'Un administrador revisará tu documentación en las próximas 24-48 horas.',
                status: verificationStatus
            });
        }

    } catch (error) {
        console.error('Error en verificación:', error);
        res.status(500).json({ error: 'Error al procesar verificación' });
    }
};

// ============ OBTENER ESTADO DE VERIFICACIÓN ============
export const getVerificationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const result = await pool.query(
            'SELECT is_verified, verification_status, has_address FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        const user = result.rows[0];

        res.json({
            isVerified: user.is_verified,
            verificationStatus: user.verification_status,
            hasAddress: user.has_address
        });

    } catch (error) {
        console.error('Error al obtener estado de verificación:', error);
        res.status(500).json({ error: 'Error al consultar estado' });
    }
};

// ============ VERIFICAR SI TIENE DOMICILIO ============
export const checkAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const result = await pool.query(
            'SELECT has_address FROM users WHERE id = $1',
            [userId]
        );

        res.json({ 
            hasAddress: result.rows[0]?.has_address || false 
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al verificar domicilio' });
    }
};

// ============ REGISTRAR DOMICILIO ============
export const registerAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const { street, number, colony, city, state, zipCode, country, phone, reference } = req.body;

        if (!street || !city || !state || !zipCode || !country) {
            res.status(400).json({ error: 'Dirección incompleta' });
            return;
        }

        // TODO: Guardar en tabla de direcciones cuando se cree
        // Por ahora solo actualizamos el flag
        await pool.query(
            'UPDATE users SET has_address = TRUE WHERE id = $1',
            [userId]
        );

        res.json({
            success: true,
            message: '✅ Domicilio registrado correctamente'
        });

    } catch (error) {
        console.error('Error al registrar domicilio:', error);
        res.status(500).json({ error: 'Error al guardar domicilio' });
    }
};

// ============ ADMIN: LISTAR VERIFICACIONES PENDIENTES ============
export const getPendingVerifications = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(`
            SELECT 
                id, full_name, email, box_id, phone,
                verification_status, verification_submitted_at,
                ine_front_url, ine_back_url, selfie_url, signature_url,
                ai_verification_reason, created_at
            FROM users 
            WHERE verification_status = 'pending_review'
            ORDER BY verification_submitted_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo verificaciones pendientes:', error);
        res.status(500).json({ error: 'Error al obtener verificaciones' });
    }
};

// ============ ADMIN: APROBAR VERIFICACIÓN ============
export const approveVerification = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const adminId = authReq.user?.userId;
        const { userId } = req.params;

        if (!userId) {
            res.status(400).json({ error: 'ID de usuario requerido' });
            return;
        }

        await pool.query(`
            UPDATE users 
            SET verification_status = 'verified',
                is_verified = TRUE,
                verification_reviewed_by = $1,
                verification_reviewed_at = NOW()
            WHERE id = $2
        `, [adminId, userId]);

        // Enviar notificación al usuario
        await createNotification(
            parseInt(String(userId)),
            'VERIFICATION_APPROVED',
            '¡Felicidades! Tu cuenta ha sido verificada exitosamente. Ya puedes disfrutar de todos los beneficios de EntregaX.',
            { verifiedAt: new Date().toISOString() }
        );

        res.json({ 
            success: true, 
            message: '✅ Usuario verificado manualmente' 
        });
    } catch (error) {
        console.error('Error aprobando verificación:', error);
        res.status(500).json({ error: 'Error al aprobar verificación' });
    }
};

// ============ ADMIN: RECHAZAR VERIFICACIÓN ============
export const rejectVerification = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const adminId = authReq.user?.userId;
        const { userId } = req.params;
        const { reason } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'ID de usuario requerido' });
            return;
        }

        await pool.query(`
            UPDATE users 
            SET verification_status = 'rejected',
                is_verified = FALSE,
                verification_reviewed_by = $1,
                verification_reviewed_at = NOW(),
                ai_verification_reason = $3
            WHERE id = $2
        `, [adminId, userId, reason || 'Rechazado por administrador']);

        // Enviar notificación al usuario
        await createNotification(
            parseInt(String(userId)),
            'VERIFICATION_REJECTED',
            `Tu verificación fue rechazada. Motivo: ${reason || 'Documentos no válidos'}. Por favor, intenta nuevamente con documentos claros.`,
            { reason: reason || 'Documentos no válidos', rejectedAt: new Date().toISOString() }
        );

        res.json({ 
            success: true, 
            message: '❌ Verificación rechazada' 
        });
    } catch (error) {
        console.error('Error rechazando verificación:', error);
        res.status(500).json({ error: 'Error al rechazar verificación' });
    }
};

// ============ ADMIN: OBTENER ESTADÍSTICAS DE VERIFICACIÓN ============
export const getVerificationStats = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE verification_status = 'pending_review') as pending,
                COUNT(*) FILTER (WHERE verification_status = 'verified') as verified,
                COUNT(*) FILTER (WHERE verification_status = 'rejected') as rejected,
                COUNT(*) FILTER (WHERE verification_status IS NULL OR verification_status = 'not_started') as not_started
            FROM users
            WHERE role = 'client'
        `);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};
