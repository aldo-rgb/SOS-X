/**
 * Script de prueba para Tradlinx Ocean Visibility API
 * Ejecutar con: node test_tradlinx.js
 */

require('dotenv').config();
const axios = require('axios');

const TRADLINX_API_KEY = process.env.TRADLINX_API_KEY;
const TRADLINX_API_URL = process.env.TRADLINX_API_URL || 'https://api.tradlinx.com/v1';
const TRADLINX_SANDBOX_URL = 'https://sandbox.api.tradlinx.com/v1';
const USE_SANDBOX = process.env.TRADLINX_USE_SANDBOX === 'true';
const CLIENT_ID = process.env.TRADLINX_CLIENT_ID || 'entregax';

const API_URL = USE_SANDBOX ? TRADLINX_SANDBOX_URL : TRADLINX_API_URL;

console.log('='.repeat(60));
console.log('🛰️  TRADLINX OCEAN VISIBILITY - TEST');
console.log('='.repeat(60));
console.log('');
console.log('📋 Configuración:');
console.log(`   API Key: ${TRADLINX_API_KEY ? TRADLINX_API_KEY.substring(0, 20) + '...' : '❌ NO CONFIGURADA'}`);
console.log(`   Client ID: ${CLIENT_ID}`);
console.log(`   Modo: ${USE_SANDBOX ? '🧪 SANDBOX (Pruebas)' : '🚀 PRODUCCIÓN'}`);
console.log(`   URL: ${API_URL}`);
console.log('');

async function testConnection() {
    console.log('1️⃣  Probando conexión a Tradlinx...');
    
    if (!TRADLINX_API_KEY) {
        console.log('   ❌ Error: TRADLINX_API_KEY no está configurada');
        return false;
    }

    try {
        // Intentar obtener el estado de la API o hacer una petición básica
        const response = await axios.get(`${API_URL}/health`, {
            headers: {
                'Authorization': `Bearer ${TRADLINX_API_KEY}`,
                'X-Client-Id': CLIENT_ID,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log(`   ✅ Conexión exitosa!`);
        console.log(`   Response: ${JSON.stringify(response.data)}`);
        return true;
    } catch (error) {
        if (error.response) {
            console.log(`   ⚠️ Respuesta del servidor: ${error.response.status}`);
            console.log(`   Body: ${JSON.stringify(error.response.data)}`);
            
            // Si es 404, la API no tiene endpoint /health pero está respondiendo
            if (error.response.status === 404) {
                console.log('   ℹ️  La API responde pero no tiene endpoint /health');
                return true;
            }
            // Si es 401/403, hay problema con la API key
            if (error.response.status === 401 || error.response.status === 403) {
                console.log('   ❌ Error de autenticación - Verifica tu API Key');
                return false;
            }
        } else {
            console.log(`   ❌ Error de conexión: ${error.message}`);
        }
        return false;
    }
}

async function testSubscription() {
    console.log('');
    console.log('2️⃣  Simulando suscripción de contenedor...');
    
    // Datos de prueba
    const testData = {
        master_bl_number: 'TEST-BL-2026001',
        container_number: 'WHSU1234567',
        carrier_code: 'WHLC',
        callback_url: process.env.TRADLINX_WEBHOOK_URL || 'https://entregax.app/api/webhooks/tradlinx'
    };
    
    console.log(`   📦 Contenedor: ${testData.container_number}`);
    console.log(`   📄 BL: ${testData.master_bl_number}`);
    console.log(`   🚢 Naviera: ${testData.carrier_code}`);
    console.log(`   🔗 Webhook: ${testData.callback_url}`);
    
    try {
        const response = await axios.post(`${API_URL}/shipments/subscribe`, testData, {
            headers: {
                'Authorization': `Bearer ${TRADLINX_API_KEY}`,
                'X-Client-Id': CLIENT_ID,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('   ✅ Suscripción exitosa!');
        console.log(`   Reference ID: ${response.data.subscription_id || response.data.reference_id || response.data.id}`);
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.log(`   ⚠️ Status: ${error.response.status}`);
            console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
            
            // En sandbox puede que no procese realmente la suscripción
            if (error.response.status === 400) {
                console.log('   ℹ️  El endpoint respondió - verifica los parámetros requeridos');
            }
        } else {
            console.log(`   ❌ Error: ${error.message}`);
        }
        return null;
    }
}

async function testWebhookEndpoint() {
    console.log('');
    console.log('3️⃣  Probando que nuestro webhook está configurado...');
    
    const webhookUrl = process.env.TRADLINX_WEBHOOK_URL || 'https://entregax.app/api/webhooks/tradlinx';
    console.log(`   URL: ${webhookUrl}`);
    
    // Simular un payload de Tradlinx
    const testPayload = {
        container_number: 'WHSU1234567',
        master_bl_number: 'TEST-BL-2026001',
        event_type: 'ETA_UPDATE',
        event_timestamp: new Date().toISOString(),
        location: 'Test Location',
        predicted_eta: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        carrier_code: 'WHLC',
        _test: true
    };
    
    try {
        // Intentar llamar nuestro propio webhook (solo si es localhost)
        if (webhookUrl.includes('localhost')) {
            const response = await axios.post(webhookUrl, testPayload, {
                timeout: 5000
            });
            console.log(`   ✅ Webhook respondió: ${response.status}`);
        } else {
            console.log('   ℹ️  Webhook configurado para producción (no se puede probar desde local)');
            console.log('   Para probar en producción, usa: curl -X POST ' + webhookUrl);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('   ⚠️ El servidor local no está corriendo');
            console.log('   Ejecuta: npm run dev');
        } else {
            console.log(`   ⚠️ ${error.message}`);
        }
    }
}

// Ejecutar pruebas
async function runTests() {
    console.log('');
    
    await testConnection();
    await testSubscription();
    await testWebhookEndpoint();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Pruebas completadas');
    console.log('='.repeat(60));
    console.log('');
    console.log('📝 Próximos pasos:');
    console.log('   1. Si las pruebas fallaron, verifica tu API Key con Tradlinx');
    console.log('   2. Asegúrate de que el webhook URL sea accesible públicamente');
    console.log('   3. Cuando estés listo, cambia TRADLINX_USE_SANDBOX=false');
    console.log('');
}

runTests();
