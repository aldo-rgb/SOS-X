/**
 * OCR Service — Google Cloud Vision API
 * Extracts payment amounts from bank receipt images (tickets de depósito)
 * Optimized for Mexican bank receipts (BBVA, Banorte, Santander, etc.)
 */

import vision from '@google-cloud/vision';

// Initialize with credentials from env
let client: any = null;

function getClient(): any {
  if (!client) {
    const credentials = process.env.GOOGLE_VISION_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS)
      : undefined;
    client = new vision.ImageAnnotatorClient(
      credentials ? { credentials } : undefined
    );
  }
  return client;
}

export interface OcrResult {
  detected_amount: number | null;
  confidence: number; // 0-100
  raw_text: string;
  all_amounts: number[]; // All amounts found in the image
  reference_found: string | null; // If we detect the payment reference
}

/**
 * Extract payment amount from a bank receipt image
 * @param imageBuffer - The image file buffer (JPG, PNG, or PDF page)
 * @param expectedReference - The payment reference to look for (e.g. "EP-8655DA19")
 * @returns OCR result with detected amount
 */
export async function extractAmountFromReceipt(
  imageBuffer: Buffer,
  expectedReference?: string
): Promise<OcrResult> {
  const result: OcrResult = {
    detected_amount: null,
    confidence: 0,
    raw_text: '',
    all_amounts: [],
    reference_found: null,
  };

  try {
    const visionClient = getClient();

    // Use TEXT_DETECTION for bank receipts (better than DOCUMENT for tickets)
    const [response] = await visionClient.textDetection({
      image: { content: imageBuffer.toString('base64') },
    });

    const detections = response.textAnnotations;
    if (!detections || detections.length === 0) {
      return result;
    }

    // Full text from the image
    result.raw_text = (detections[0] as any).description || '';
    const text = result.raw_text;

    // --- Extract all monetary amounts ---
    // Mexican bank receipt patterns:
    // $1,234.56 | $1234.56 | 1,234.56 | MXN 1,234.56 | IMPORTE: $1,234.56
    const amountPatterns = [
      /\$\s*([\d,]+\.\d{2})/g,                          // $1,234.56
      /(?:IMPORTE|MONTO|TOTAL|CANTIDAD|DEPOSITO|DEPÓSITO|ABONO)\s*[:.]?\s*\$?\s*([\d,]+\.\d{2})/gi,
      /(?:MXN|MN)\s*\$?\s*([\d,]+\.\d{2})/gi,           // MXN 1,234.56
      /([\d,]+\.\d{2})\s*(?:MXN|MN|PESOS)/gi,           // 1,234.56 MXN
    ];

    const allAmounts = new Set<number>();

    for (const pattern of amountPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const cleanNum = (match[1] || '').replace(/,/g, '');
        const num = parseFloat(cleanNum);
        if (num > 0 && num < 10_000_000) { // Sanity check: max 10M
          allAmounts.add(num);
        }
      }
    }

    result.all_amounts = Array.from(allAmounts).sort((a, b) => b - a);

    // --- Detect the payment reference ---
    if (expectedReference) {
      const refClean = expectedReference.replace(/[-\s]/g, '');
      const textClean = text.replace(/[-\s]/g, '');
      if (textClean.toUpperCase().includes(refClean.toUpperCase())) {
        result.reference_found = expectedReference;
        result.confidence += 30; // Bonus: reference was found
      }
    }

    // --- Pick the most likely payment amount ---
    if (result.all_amounts.length > 0) {
      // Heuristic: Look for amounts near keywords like IMPORTE, TOTAL, MONTO
      const keywordPattern = /(?:IMPORTE|MONTO|TOTAL|CANTIDAD)\s*[:.]?\s*\$?\s*([\d,]+\.\d{2})/gi;
      let keywordMatch;
      const keywordAmounts: number[] = [];
      while ((keywordMatch = keywordPattern.exec(text)) !== null) {
        const num = parseFloat((keywordMatch[1] || '').replace(/,/g, ''));
        if (num > 0) keywordAmounts.push(num);
      }

      if (keywordAmounts.length > 0) {
        // Prefer the amount next to a keyword
        result.detected_amount = keywordAmounts[0] ?? null;
        result.confidence = Math.min(95, 60 + (result.reference_found ? 30 : 0));
      } else {
        // Fallback: use the largest amount (usually the deposit total)
        result.detected_amount = result.all_amounts[0] ?? null;
        result.confidence = Math.min(85, 40 + (result.reference_found ? 30 : 0));
      }
    }

    // Minimum confidence if we found something
    if (result.detected_amount && result.confidence === 0) {
      result.confidence = 30;
    }

  } catch (error: any) {
    console.error('[OCR] Google Vision error:', error.message);
    // Return empty result — user will input manually
    result.raw_text = `OCR_ERROR: ${error.message}`;
  }

  return result;
}

/**
 * Check if Google Vision is configured
 */
export function isOcrAvailable(): boolean {
  return !!(
    process.env.GOOGLE_VISION_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}
