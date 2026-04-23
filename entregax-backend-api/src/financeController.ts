// ============================================
// CONTROLADOR FINANCIERO - MONEDERO Y CRÉDITO
// Sistema de billetera B2B con integración STP
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// INTERFACES
// ============================================

interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
    role?: string;
    level?: number;
  };
}

interface WalletInfo {
  wallet_balance: number;
  virtual_clabe: string | null;
  has_credit: boolean;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  is_credit_blocked: boolean;
}

// ============================================
// GENERAR CLABE VIRTUAL (Simulación)
// En producción esto viene de Openpay/STP
// ============================================

const generateVirtualClabe = (userId: number): string => {
  // Formato CLABE: 3 dígitos banco + 3 dígitos plaza + 11 dígitos cuenta + 1 dígito verificador
  // Este es un ejemplo simulado - en producción viene de Openpay
  const banco = '646'; // STP
  const plaza = '180';
  const cuenta = String(userId).padStart(10, '0') + '1';
  const verificador = String((userId * 7) % 10);
  return banco + plaza + cuenta + verificador;
};

// ============================================
// OBTENER ESTADO DEL MONEDERO
// ============================================

export const getWalletStatus = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;

    const result = await pool.query(`
      SELECT 
        wallet_balance,
        virtual_clabe,
        has_credit,
        credit_limit,
        used_credit,
        credit_days,
        is_credit_blocked
      FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // Si no tiene CLABE virtual, generarla
    let virtualClabe = user.virtual_clabe;
    if (!virtualClabe && userId) {
      virtualClabe = generateVirtualClabe(userId);
      await pool.query('UPDATE users SET virtual_clabe = $1 WHERE id = $2', [virtualClabe, userId]);
    }

    const walletInfo: WalletInfo = {
      wallet_balance: parseFloat(user.wallet_balance) || 0,
      virtual_clabe: virtualClabe,
      has_credit: user.has_credit || false,
      credit_limit: parseFloat(user.credit_limit) || 0,
      used_credit: parseFloat(user.used_credit) || 0,
      available_credit: (parseFloat(user.credit_limit) || 0) - (parseFloat(user.used_credit) || 0),
      credit_days: user.credit_days || 0,
      is_credit_blocked: user.is_credit_blocked || false,
    };

    // Obtener facturas pendientes de crédito
    const pendingInvoices = await pool.query(`
      SELECT id, invoice_number, amount, amount_paid, due_date, status,
             (amount - amount_paid) as pending_amount,
             (due_date < CURRENT_DATE) as is_overdue
      FROM credit_invoices 
      WHERE user_id = $1 AND status != 'paid'
      ORDER BY due_date ASC
    `, [userId]);

    res.json({
      ...walletInfo,
      pending_invoices: pendingInvoices.rows,
      total_pending: pendingInvoices.rows.reduce((sum: number, inv: any) => 
        sum + (parseFloat(inv.amount) - parseFloat(inv.amount_paid)), 0)
    });

  } catch (error) {
    console.error('Error getting wallet status:', error);
    res.status(500).json({ error: 'Error al obtener estado del monedero' });
  }
};

// ============================================
// HISTORIAL DE TRANSACCIONES
// ============================================

export const getTransactionHistory = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { limit = 50, offset = 0, type } = req.query;

    let query = `
      SELECT 
        id,
        type,
        amount,
        balance_after,
        description,
        reference_id,
        reference_type,
        created_at
      FROM financial_transactions 
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (type) {
      query += ` AND type = $2`;
      params.push(type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Contar total
    const countRes = await pool.query(
      'SELECT COUNT(*) FROM financial_transactions WHERE user_id = $1',
      [userId]
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countRes.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

  } catch (error) {
    console.error('Error getting transaction history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

// ============================================
// WEBHOOK DE OPENPAY (SPEI/STP)
// Recibe notificaciones de depósitos
// ============================================

export const handleOpenpayWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const event = req.body;
    console.log('📥 Webhook Openpay recibido:', JSON.stringify(event, null, 2));

    // Verificar si es una transferencia SPEI completada
    if (event.type === 'charge.succeeded' && event.transaction?.method === 'bank_account') {
      
      const openpayCustomerId = event.transaction.customer_id;
      const amountDeposited = parseFloat(event.transaction.amount);
      const openpayTxId = event.transaction.id;

      // Buscar usuario por su ID de Openpay o CLABE
      const userRes = await pool.query(
        'SELECT id, wallet_balance, email, used_credit, is_credit_blocked FROM users WHERE openpay_customer_id = $1',
        [openpayCustomerId]
      );
      
      if (userRes.rows.length > 0) {
        const userId = userRes.rows[0].id;
        const currentBalance = parseFloat(userRes.rows[0].wallet_balance);
        const usedCredit = parseFloat(userRes.rows[0].used_credit) || 0;
        const newBalance = currentBalance + amountDeposited;

        // Actualizar saldo
        await pool.query(
          'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
          [amountDeposited, userId]
        );

        // Registrar transacción
        await pool.query(`
          INSERT INTO financial_transactions 
          (user_id, type, amount, balance_after, description, reference_id, reference_type)
          VALUES ($1, 'deposit_spei', $2, $3, 'Fondeo de monedero vía SPEI (STP)', $4, 'openpay')
        `, [userId, amountDeposited, newBalance, openpayTxId]);

        console.log(`✅ Fondeo SPEI: $${amountDeposited} MXN al usuario ${userId}`);

        // ============================================
        // 🔓 DESBLOQUEO AUTOMÁTICO SI PAGA SU DEUDA
        // ============================================
        if (usedCredit > 0 && newBalance >= usedCredit) {
          console.log(`🔓 Usuario ${userId} tiene saldo suficiente para liquidar deuda de $${usedCredit}`);
          
          // Calcular el pago: mínimo entre el saldo y la deuda
          const paymentAmount = Math.min(newBalance, usedCredit);
          const balanceAfterPayment = newBalance - paymentAmount;
          const creditAfterPayment = usedCredit - paymentAmount;
          
          // Liquidar deuda automáticamente
          await pool.query(`
            UPDATE users 
            SET wallet_balance = $1,
                used_credit = $2,
                credit_due_date = CASE WHEN $2 = 0 THEN NULL ELSE credit_due_date END,
                is_credit_blocked = FALSE
            WHERE id = $3
          `, [balanceAfterPayment, creditAfterPayment, userId]);

          // Registrar transacción de liquidación
          await pool.query(`
            INSERT INTO financial_transactions 
            (user_id, type, amount, balance_after, description, reference_type)
            VALUES ($1, 'credit_settlement', $2, $3, 'Liquidación automática de crédito por depósito SPEI', 'auto_settlement')
          `, [userId, -paymentAmount, balanceAfterPayment]);

          // Marcar facturas como pagadas
          await pool.query(`
            UPDATE credit_invoices 
            SET status = 'paid', paid_at = NOW(), amount_paid = amount
            WHERE user_id = $1 AND status != 'paid'
          `, [userId]);

          console.log(`✅ Deuda liquidada y cuenta desbloqueada para usuario ${userId}`);
          
          // TODO: Enviar notificación push de desbloqueo
          // await sendPushNotification(userId, '¡Pago Recibido! ✅', 'Tu transferencia SPEI fue procesada. Tu deuda está liquidada y tu cuenta ha sido desbloqueada.');
        }
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Error en webhook Openpay:', error);
    res.status(500).send('Error');
  }
};

// ============================================
// PROCESAR PAGO (Monedero o Crédito)
// ============================================

export const processPayment = async (
  userId: number, 
  amount: number, 
  description: string,
  referenceType: string,
  referenceId: string | number
): Promise<{ success: boolean; paymentMethod: string; message: string }> => {
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Obtener datos del usuario
    const userRes = await client.query(`
      SELECT wallet_balance, has_credit, credit_limit, used_credit, 
             credit_days, is_credit_blocked 
      FROM users WHERE id = $1 FOR UPDATE
    `, [userId]);

    if (userRes.rows.length === 0) {
      throw new Error('Usuario no encontrado');
    }

    const user = userRes.rows[0];
    const walletBalance = parseFloat(user.wallet_balance) || 0;
    const creditLimit = parseFloat(user.credit_limit) || 0;
    const usedCredit = parseFloat(user.used_credit) || 0;
    const availableCredit = creditLimit - usedCredit;

    // REGLA 1: Verificar si está bloqueado
    if (user.is_credit_blocked) {
      throw new Error('Tu cuenta está bloqueada por adeudos vencidos. Fondea tu monedero para regularizarte.');
    }

    let paymentMethod = '';
    let newBalance = walletBalance;
    let newUsedCredit = usedCredit;

    // REGLA 2: Intentar pagar con Monedero primero
    if (walletBalance >= amount) {
      newBalance = walletBalance - amount;
      paymentMethod = 'wallet';

      await client.query(
        'UPDATE users SET wallet_balance = $1 WHERE id = $2',
        [newBalance, userId]
      );

      await client.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, balance_after, description, reference_id, reference_type)
        VALUES ($1, 'payment_wallet', $2, $3, $4, $5, $6)
      `, [userId, -amount, newBalance, description, referenceId, referenceType]);

    }
    // REGLA 3: Si no alcanza el monedero, usar crédito (si tiene)
    else if (user.has_credit && availableCredit >= amount) {
      newUsedCredit = usedCredit + amount;
      paymentMethod = 'credit';

      await client.query(
        'UPDATE users SET used_credit = $1 WHERE id = $2',
        [newUsedCredit, userId]
      );

      // Crear factura de crédito con fecha de vencimiento
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (user.credit_days || 15));

      await client.query(`
        INSERT INTO credit_invoices 
        (user_id, invoice_number, amount, due_date, reference_type, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        userId, 
        `CR-${Date.now()}`, 
        amount, 
        dueDate.toISOString().split('T')[0],
        referenceType,
        referenceId
      ]);

      await client.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, balance_after, description, reference_id, reference_type)
        VALUES ($1, 'payment_credit', $2, $3, $4, $5, $6)
      `, [userId, -amount, newBalance, `${description} (Crédito)`, referenceId, referenceType]);

    }
    // REGLA 4: Pago parcial (monedero + crédito)
    else if (user.has_credit && walletBalance > 0 && (walletBalance + availableCredit) >= amount) {
      const fromWallet = walletBalance;
      const fromCredit = amount - walletBalance;
      
      newBalance = 0;
      newUsedCredit = usedCredit + fromCredit;
      paymentMethod = 'mixed';

      await client.query(
        'UPDATE users SET wallet_balance = 0, used_credit = $1 WHERE id = $2',
        [newUsedCredit, userId]
      );

      // Registrar pago del monedero
      await client.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, balance_after, description, reference_id, reference_type)
        VALUES ($1, 'payment_wallet', $2, 0, $3, $4, $5)
      `, [userId, -fromWallet, `${description} (Monedero)`, referenceId, referenceType]);

      // Crear factura de crédito
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (user.credit_days || 15));

      await client.query(`
        INSERT INTO credit_invoices 
        (user_id, invoice_number, amount, due_date, reference_type, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, `CR-${Date.now()}`, fromCredit, dueDate.toISOString().split('T')[0], referenceType, referenceId]);

      await client.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, balance_after, description, reference_id, reference_type)
        VALUES ($1, 'payment_credit', $2, 0, $3, $4, $5)
      `, [userId, -fromCredit, `${description} (Crédito)`, referenceId, referenceType]);

    }
    else {
      throw new Error(`Saldo insuficiente. Disponible: $${walletBalance.toFixed(2)} MXN${user.has_credit ? ` + $${availableCredit.toFixed(2)} crédito` : ''}. Deposita a tu CLABE virtual.`);
    }

    await client.query('COMMIT');

    return { 
      success: true, 
      paymentMethod,
      message: `Pago procesado con ${paymentMethod === 'wallet' ? 'monedero' : paymentMethod === 'credit' ? 'línea de crédito' : 'pago mixto'}`
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// PAGAR SALDO DE CRÉDITO (Liquidar deuda)
// ============================================

export const payCredit = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.userId;
    const { amount, invoice_id } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    await client.query('BEGIN');

    // Obtener saldo del monedero
    const userRes = await client.query(
      'SELECT wallet_balance, used_credit FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    const walletBalance = parseFloat(userRes.rows[0].wallet_balance) || 0;
    const usedCredit = parseFloat(userRes.rows[0].used_credit) || 0;

    if (walletBalance < amount) {
      throw new Error(`Saldo insuficiente en monedero. Disponible: $${walletBalance.toFixed(2)} MXN`);
    }

    if (amount > usedCredit) {
      throw new Error(`El monto excede tu deuda actual. Deuda: $${usedCredit.toFixed(2)} MXN`);
    }

    const newBalance = walletBalance - amount;
    const newUsedCredit = usedCredit - amount;

    // Actualizar usuario
    await client.query(`
      UPDATE users 
      SET wallet_balance = $1, 
          used_credit = $2,
          is_credit_blocked = CASE WHEN $2 = 0 THEN FALSE ELSE is_credit_blocked END
      WHERE id = $3
    `, [newBalance, newUsedCredit, userId]);

    // Registrar transacción
    await client.query(`
      INSERT INTO financial_transactions 
      (user_id, type, amount, balance_after, description, reference_type)
      VALUES ($1, 'credit_settlement', $2, $3, 'Pago de línea de crédito', 'credit_payment')
    `, [userId, -amount, newBalance]);

    // Si se especificó una factura, marcarla como pagada
    if (invoice_id) {
      await client.query(`
        UPDATE credit_invoices 
        SET amount_paid = amount_paid + $1,
            status = CASE WHEN amount_paid + $1 >= amount THEN 'paid' ELSE 'partial' END,
            paid_at = CASE WHEN amount_paid + $1 >= amount THEN NOW() ELSE paid_at END
        WHERE id = $2 AND user_id = $3
      `, [amount, invoice_id, userId]);
    } else {
      // Pagar facturas en orden de vencimiento
      const invoices = await client.query(`
        SELECT id, amount, amount_paid FROM credit_invoices 
        WHERE user_id = $1 AND status != 'paid'
        ORDER BY due_date ASC
      `, [userId]);

      let remaining = amount;
      for (const inv of invoices.rows) {
        if (remaining <= 0) break;
        
        const pending = parseFloat(inv.amount) - parseFloat(inv.amount_paid);
        const toPay = Math.min(remaining, pending);
        
        await client.query(`
          UPDATE credit_invoices 
          SET amount_paid = amount_paid + $1,
              status = CASE WHEN amount_paid + $1 >= amount THEN 'paid' ELSE 'partial' END,
              paid_at = CASE WHEN amount_paid + $1 >= amount THEN NOW() ELSE paid_at END
          WHERE id = $2
        `, [toPay, inv.id]);

        remaining -= toPay;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Pago de $${amount.toFixed(2)} MXN aplicado a tu línea de crédito`,
      new_balance: newBalance,
      new_credit_used: newUsedCredit
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error paying credit:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
};

// ============================================
// FONDEO MANUAL (Admin)
// ============================================

export const manualDeposit = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user?.userId;
    const { user_id, amount, description, type = 'deposit_spei' } = req.body;

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Obtener saldo actual
    const userRes = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [user_id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const newBalance = parseFloat(userRes.rows[0].wallet_balance) + amount;

    // Actualizar saldo
    await pool.query('UPDATE users SET wallet_balance = $1 WHERE id = $2', [newBalance, user_id]);

    // Registrar transacción
    await pool.query(`
      INSERT INTO financial_transactions 
      (user_id, type, amount, balance_after, description, reference_type, created_by)
      VALUES ($1, $2, $3, $4, $5, 'manual', $6)
    `, [user_id, type, amount, newBalance, description || 'Fondeo manual', adminId]);

    res.json({
      success: true,
      message: `Depósito de $${amount.toFixed(2)} MXN aplicado`,
      new_balance: newBalance
    });

  } catch (error) {
    console.error('Error manual deposit:', error);
    res.status(500).json({ error: 'Error al procesar depósito' });
  }
};

// ============================================
// GESTIÓN DE LÍNEA DE CRÉDITO (Admin)
// ============================================

export const updateCreditLine = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user?.userId;
    const { user_id, credit_limit, credit_days, notes, is_active } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id es requerido' });
    }

    // Verificar si ya tiene línea de crédito
    const existing = await pool.query('SELECT id FROM credit_lines WHERE user_id = $1', [user_id]);

    if (existing.rows.length > 0) {
      // Actualizar
      await pool.query(`
        UPDATE credit_lines 
        SET credit_limit = COALESCE($1, credit_limit),
            credit_days = COALESCE($2, credit_days),
            notes = COALESCE($3, notes),
            is_active = COALESCE($4, is_active),
            updated_at = NOW()
        WHERE user_id = $5
      `, [credit_limit, credit_days, notes, is_active, user_id]);
    } else {
      // Crear nueva
      await pool.query(`
        INSERT INTO credit_lines (user_id, credit_limit, credit_days, notes, approved_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [user_id, credit_limit || 0, credit_days || 15, notes, adminId]);
    }

    // Actualizar también en la tabla users
    await pool.query(`
      UPDATE users 
      SET has_credit = $1,
          credit_limit = COALESCE($2, credit_limit),
          credit_days = COALESCE($3, credit_days),
          credit_approved_at = CASE WHEN $1 = TRUE AND credit_approved_at IS NULL THEN NOW() ELSE credit_approved_at END,
          credit_approved_by = CASE WHEN $1 = TRUE THEN $4 ELSE credit_approved_by END
      WHERE id = $5
    `, [is_active !== false && credit_limit > 0, credit_limit, credit_days, adminId, user_id]);

    res.json({ success: true, message: 'Línea de crédito actualizada' });

  } catch (error) {
    console.error('Error updating credit line:', error);
    res.status(500).json({ error: 'Error al actualizar línea de crédito' });
  }
};

// ============================================
// OBTENER USUARIOS CON CRÉDITO (Admin)
// ============================================

export const getCreditUsers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.company_name,
        u.wallet_balance,
        u.has_credit,
        u.credit_limit,
        u.used_credit,
        (u.credit_limit - u.used_credit) as available_credit,
        u.credit_days,
        u.is_credit_blocked,
        u.credit_approved_at,
        cl.notes as credit_notes,
        (SELECT COUNT(*) FROM credit_invoices ci WHERE ci.user_id = u.id AND ci.status != 'paid') as pending_invoices,
        (SELECT SUM(amount - amount_paid) FROM credit_invoices ci WHERE ci.user_id = u.id AND ci.status != 'paid') as total_pending
      FROM users u
      LEFT JOIN credit_lines cl ON u.id = cl.user_id
      WHERE u.has_credit = TRUE OR u.credit_limit > 0
      ORDER BY u.used_credit DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Error getting credit users:', error);
    res.status(500).json({ error: 'Error al obtener usuarios con crédito' });
  }
};

// ============================================
// BLOQUEAR CUENTAS MOROSAS (Cron Job)
// ============================================

export const blockOverdueAccounts = async (): Promise<void> => {
  try {
    // Buscar facturas vencidas no pagadas
    const result = await pool.query(`
      UPDATE users u
      SET is_credit_blocked = TRUE
      FROM (
        SELECT DISTINCT user_id 
        FROM credit_invoices 
        WHERE status != 'paid' 
        AND due_date < CURRENT_DATE - INTERVAL '1 day'
      ) overdue
      WHERE u.id = overdue.user_id 
      AND u.is_credit_blocked = FALSE
      RETURNING u.id, u.email
    `);

    if (result.rows.length > 0) {
      console.log(`🔒 Cuentas bloqueadas por morosidad: ${result.rows.length}`);
      result.rows.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
      
      // TODO: Enviar notificación por email/push
    }

  } catch (error) {
    console.error('Error blocking overdue accounts:', error);
  }
};

// ============================================
// OBTENER RESUMEN FINANCIERO (Admin Dashboard)
// ============================================

export const getFinancialSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const summary = await pool.query(`
      SELECT 
        (SELECT COALESCE(SUM(wallet_balance), 0) FROM users) as total_wallets,
        (SELECT COALESCE(SUM(used_credit), 0) FROM users WHERE has_credit = TRUE) as total_credit_used,
        (SELECT COALESCE(SUM(credit_limit), 0) FROM users WHERE has_credit = TRUE) as total_credit_limit,
        (SELECT COUNT(*) FROM users WHERE has_credit = TRUE) as users_with_credit,
        (SELECT COUNT(*) FROM users WHERE is_credit_blocked = TRUE) as blocked_users,
        (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM credit_invoices WHERE status != 'paid') as total_pending_invoices,
        (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM credit_invoices WHERE status != 'paid' AND due_date < CURRENT_DATE) as total_overdue
    `);

    // Últimas transacciones
    const recentTx = await pool.query(`
      SELECT ft.*, u.email, u.full_name
      FROM financial_transactions ft
      JOIN users u ON ft.user_id = u.id
      ORDER BY ft.created_at DESC
      LIMIT 20
    `);

    res.json({
      summary: summary.rows[0],
      recent_transactions: recentTx.rows
    });

  } catch (error) {
    console.error('Error getting financial summary:', error);
    res.status(500).json({ error: 'Error al obtener resumen financiero' });
  }
};

// ============================================
// OBTENER ESTADO FINANCIERO DE TODOS LOS CLIENTES
// Para panel de Riesgo y Crédito B2B
// ============================================

export const getClientsFinancialStatus = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        full_name, 
        email, 
        box_id,
        company_name,
        virtual_clabe,
        wallet_balance, 
        has_credit, 
        credit_limit, 
        used_credit, 
        credit_days,
        credit_due_date,
        is_credit_blocked,
        (credit_limit - used_credit) AS available_credit,
        (SELECT COUNT(*) FROM credit_invoices ci WHERE ci.user_id = users.id AND ci.status != 'paid') as pending_invoices_count,
        (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM credit_invoices ci WHERE ci.user_id = users.id AND ci.status != 'paid' AND ci.due_date < CURRENT_DATE) as overdue_amount
      FROM users 
      WHERE role = 'cliente'
      ORDER BY 
        is_credit_blocked DESC,
        used_credit DESC, 
        wallet_balance DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting clients financial status:', error);
    res.status(500).json({ error: 'Error obteniendo datos financieros' });
  }
};

// ============================================
// ACTUALIZAR LÍNEA DE CRÉDITO DE UN CLIENTE
// Con registro de auditoría
// ============================================

export const updateClientCredit = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user?.userId;
    const { clientId } = req.params;
    const { has_credit, credit_limit, credit_days, is_credit_blocked } = req.body;

    // Obtener datos actuales del cliente
    const currentUser = await pool.query(
      'SELECT full_name, credit_limit as old_limit, credit_days as old_days, has_credit as old_has_credit, is_credit_blocked as was_blocked FROM users WHERE id = $1',
      [clientId]
    );

    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const oldData = currentUser.rows[0];

    // Actualizar usuario
    await pool.query(`
      UPDATE users 
      SET has_credit = $1, 
          credit_limit = $2, 
          credit_days = $3, 
          is_credit_blocked = $4,
          credit_approved_at = CASE WHEN $1 = TRUE AND credit_approved_at IS NULL THEN NOW() ELSE credit_approved_at END,
          credit_approved_by = CASE WHEN $1 = TRUE THEN $5 ELSE credit_approved_by END
      WHERE id = $6
    `, [has_credit, credit_limit, credit_days, is_credit_blocked, adminId, clientId]);

    // Registrar cambio en bitácora de auditoría
    const changes = [];
    if (oldData.old_has_credit !== has_credit) changes.push(`crédito: ${has_credit ? 'activado' : 'desactivado'}`);
    if (parseFloat(oldData.old_limit) !== credit_limit) changes.push(`límite: $${oldData.old_limit} → $${credit_limit}`);
    if (oldData.old_days !== credit_days) changes.push(`plazo: ${oldData.old_days} → ${credit_days} días`);
    if (oldData.was_blocked !== is_credit_blocked) changes.push(is_credit_blocked ? 'BLOQUEADO' : 'DESBLOQUEADO');

    await pool.query(`
      INSERT INTO financial_transactions (user_id, type, amount, description, created_by)
      VALUES ($1, 'adjustment', 0, $2, $3)
    `, [clientId, `Línea de crédito actualizada: ${changes.join(', ')}`, adminId]);

    // Actualizar o crear en credit_lines
    const creditLine = await pool.query('SELECT id FROM credit_lines WHERE user_id = $1', [clientId]);
    if (creditLine.rows.length > 0) {
      await pool.query(`
        UPDATE credit_lines 
        SET credit_limit = $1, credit_days = $2, is_active = $3, approved_by = $4, updated_at = NOW()
        WHERE user_id = $5
      `, [credit_limit, credit_days, has_credit, adminId, clientId]);
    } else if (has_credit) {
      await pool.query(`
        INSERT INTO credit_lines (user_id, credit_limit, credit_days, approved_by)
        VALUES ($1, $2, $3, $4)
      `, [clientId, credit_limit, credit_days, adminId]);
    }

    console.log(`💳 Crédito actualizado para ${oldData.full_name} (ID: ${clientId}) por admin ${adminId}`);

    res.json({ 
      success: true, 
      message: `Línea de crédito actualizada para ${oldData.full_name}`,
      changes
    });

  } catch (error) {
    console.error('Error updating client credit:', error);
    res.status(500).json({ error: 'Error al actualizar el crédito del cliente' });
  }
};

// ============================================
// MOTOR DE COBRANZA AUTOMÁTICA
// Avisos preventivos y bloqueos
// ============================================

export const runCreditCollectionEngine = async (): Promise<void> => {
  console.log("⏳ Iniciando motor de cobranza automática...");
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Buscar a todos los clientes que deben dinero
    const debtorsRes = await client.query(`
      SELECT id, full_name, email, used_credit, credit_due_date, is_credit_blocked 
      FROM users 
      WHERE used_credit > 0 AND has_credit = TRUE
    `);

    const today = new Date();
    let warned3Days = 0;
    let warnedToday = 0;
    let blocked = 0;

    for (const user of debtorsRes.rows) {
      if (!user.credit_due_date) continue;

      const dueDate = new Date(user.credit_due_date);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 🟢 REGLA 1: AVISO PREVENTIVO (Faltan 3 días)
      if (diffDays === 3 && !user.is_credit_blocked) {
        console.log(`📧 Aviso 3 días: ${user.full_name} - Deuda: $${user.used_credit}`);
        // TODO: sendPushNotification(user.id, 'Aviso de Vencimiento 🗓️', msg);
        // TODO: sendEmail(user.email, 'Tu estado de cuenta EntregaX', msg);
        warned3Days++;
      }

      // 🟡 REGLA 2: DÍA DE VENCIMIENTO (Hoy es el día)
      else if (diffDays === 0 && !user.is_credit_blocked) {
        console.log(`⚠️ Vence HOY: ${user.full_name} - Deuda: $${user.used_credit}`);
        // TODO: sendPushNotification(user.id, 'Crédito Vence Hoy', msg);
        warnedToday++;
      }

      // 🔴 REGLA 3: VENCIDO Y BLOQUEO AUTOMÁTICO (Pasó el día)
      else if (diffDays < 0 && !user.is_credit_blocked) {
        await client.query('UPDATE users SET is_credit_blocked = TRUE WHERE id = $1', [user.id]);
        console.log(`🔒 BLOQUEADO por morosidad: ${user.full_name} - Deuda vencida: $${user.used_credit}`);
        // TODO: sendPushNotification(user.id, 'Cuenta Bloqueada', msg);
        blocked++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Cobranza: ${warned3Days} avisos 3 días, ${warnedToday} vencen hoy, ${blocked} bloqueados`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error en motor de cobranza:", error);
  } finally {
    client.release();
  }
};
