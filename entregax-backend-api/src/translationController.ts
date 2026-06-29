// ============================================
// TRADUCCIÓN CON CACHÉ
// Traduce textos (típicamente nombres de mercancía en chino) al idioma del
// usuario. Cachea en la tabla `translations` para no repetir llamadas a OpenAI.
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import OpenAI from 'openai';

let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI | null => {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!openaiInstance) openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiInstance;
};

let tableReady: Promise<void> | null = null;
const ensureTable = (): Promise<void> => {
    if (!tableReady) {
        tableReady = pool.query(`
            CREATE TABLE IF NOT EXISTS translations (
                id SERIAL PRIMARY KEY,
                source_text TEXT NOT NULL,
                target_lang VARCHAR(5) NOT NULL,
                translated_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (source_text, target_lang)
            )
        `).then(() => {}).catch((e) => { console.error('No pude asegurar tabla translations:', e); tableReady = null; });
    }
    return tableReady;
};

const hasChinese = (s: string): boolean => /[一-鿿]/.test(s || '');

// POST /api/translate  { texts: string[], lang: 'es'|'en' }
// Respuesta: { translations: { [sourceText]: translatedText } }
export const translateTexts = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureTable();
        const lang = String(req.body?.lang || 'es').toLowerCase() === 'en' ? 'en' : 'es';
        const rawTexts: string[] = Array.isArray(req.body?.texts) ? req.body.texts : [];
        // Solo traducimos textos con caracteres chinos; el resto se devuelve igual.
        const texts = [...new Set(rawTexts.map(t => String(t || '').trim()).filter(t => t && hasChinese(t)))].slice(0, 100);

        const result: Record<string, string> = {};
        if (texts.length === 0) { res.json({ translations: result }); return; }

        // 1) Caché
        const cached = await pool.query(
            `SELECT source_text, translated_text FROM translations WHERE target_lang = $1 AND source_text = ANY($2)`,
            [lang, texts]
        );
        for (const r of cached.rows) result[r.source_text] = r.translated_text;

        const missing = texts.filter(t => !(t in result));
        if (missing.length === 0) { res.json({ translations: result }); return; }

        // 2) Traducir faltantes con OpenAI (una sola llamada)
        const openai = getOpenAI();
        if (!openai) {
            // Sin API key: devolver lo cacheado; los faltantes quedan sin traducir.
            res.json({ translations: result });
            return;
        }

        const langName = lang === 'en' ? 'English' : 'Spanish';
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            messages: [
                {
                    role: 'system',
                    content: `You translate Chinese product/merchandise names to ${langName}. Reply ONLY with a JSON object mapping each input string to its short ${langName} translation (a few words, no explanations).`,
                },
                { role: 'user', content: JSON.stringify(missing) },
            ],
            response_format: { type: 'json_object' },
        });

        let parsed: Record<string, string> = {};
        try { parsed = JSON.parse(completion.choices[0]?.message?.content || '{}'); } catch { parsed = {}; }

        // 3) Guardar en caché y armar respuesta
        for (const src of missing) {
            const translated = (parsed[src] || '').toString().trim();
            if (!translated) continue;
            result[src] = translated;
            await pool.query(
                `INSERT INTO translations (source_text, target_lang, translated_text) VALUES ($1, $2, $3)
                 ON CONFLICT (source_text, target_lang) DO UPDATE SET translated_text = EXCLUDED.translated_text`,
                [src, lang, translated]
            ).catch(() => {});
        }

        res.json({ translations: result });
    } catch (error) {
        console.error('Error translateTexts:', error);
        res.status(500).json({ error: 'Error al traducir', translations: {} });
    }
};
