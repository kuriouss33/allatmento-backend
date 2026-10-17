export interface TranslationDetail {
  original: string;
  translated: string;
  detectedSourceLang: string;
  targetLang: 'en' | 'hu';
  isTranslated: boolean;
}

/**
 * Megbízható nyelvfelismerő (magyar vs angol)
 * Alapvető magyar ékezetek és szótári gyakoriság alapján azonosítja a nyelvet.
 */
export function detectLanguage(text: string): 'hu' | 'en' {
  if (!text || typeof text !== 'string') return 'hu';
  const clean = text.trim();
  if (!clean) return 'hu';

  // 1. Ha specifikus magyar ékezetes karaktereket tartalmaz (á, é, í, ó, ö, ő, ú, ü, ű)
  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(clean)) {
    return 'hu';
  }

  // 2. Szavak gyakorisági elemzése
  const words = clean.toLowerCase().match(/[a-z]{2,}/g) || [];
  if (words.length === 0) {
    return 'hu';
  }

  const huWords = new Set([
    'a', 'az', 'es', 'és', 'hogy', 'nem', 'van', 'volt', 'lesz', 'egy', 'ez', 'itt', 'ott',
    'meg', 'de', 'ha', 'csak', 'mar', 'már', 'vagy', 'kell', 'be', 'ki', 'el', 'le', 'fel',
    'szia', 'sziasztok', 'koszi', 'köszi', 'koszonom', 'köszönöm', 'kutya', 'kutyus', 'macska',
    'cica', 'cicat', 'kutyat', 'allat', 'állat', 'mento', 'mentő', 'segitseg', 'segítség',
    'serult', 'sérült', 'verzik', 'vérzik', 'latom', 'látom', 'lattam', 'láttam', 'talaltam',
    'találtam', 'merre', 'ment', 'helyszin', 'helyszín', 'utca', 'orvos', 'rendelo', 'rendelő',
    'tudok', 'tudsz', 'megyek', 'jovok', 'jövök', 'udv', 'üdv', 'rendben', 'igen', 'baba', 'nappal'
  ]);

  const enWords = new Set([
    'the', 'and', 'is', 'are', 'was', 'were', 'to', 'in', 'at', 'on', 'of', 'for', 'with',
    'this', 'that', 'it', 'its', 'dog', 'cat', 'kitten', 'puppy', 'animal', 'rescue', 'injured',
    'hurt', 'bleeding', 'help', 'found', 'saw', 'see', 'seen', 'here', 'there', 'please',
    'thank', 'thanks', 'hello', 'hi', 'hey', 'just', 'very', 'well', 'can', 'could', 'would',
    'should', 'have', 'has', 'had', 'not', 'no', 'yes', 'but', 'or', 'if', 'because', 'where',
    'what', 'when', 'how', 'who', 'why', 'sweetie', 'park', 'fed', 'street', 'road', 'today', 'now'
  ]);

  let huScore = 0;
  let enScore = 0;

  for (const w of words) {
    if (huWords.has(w)) huScore += 1;
    if (enWords.has(w)) enScore += 1;
  }

  if (enScore > huScore) {
    return 'en';
  }
  if (huScore > enScore) {
    return 'hu';
  }

  // Alapértelmezés: a magyar állatmentő oldalon a szövegek alapértelmezetten magyarok
  return 'hu';
}

/**
 * Automatikus fordító segédfüggvény részletes adatokkal
 * Azonos célnyelv esetén (pl. magyar szöveg magyar nézetben) KIKAPCSOLJA a fordítást.
 */
export async function autoTranslateDetailed(
  text: string,
  toLang: 'en' | 'hu' = 'en'
): Promise<TranslationDetail> {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {
      original: '',
      translated: '',
      detectedSourceLang: toLang,
      targetLang: toLang,
      isTranslated: false,
    };
  }

  const detectedSourceLang = detectLanguage(trimmed);

  // Ha a szöveg nyelve megegyezik a célnyelvvel: KIKAPCSOLJUK a fordítást!
  if (detectedSourceLang === toLang) {
    return {
      original: trimmed,
      translated: trimmed,
      detectedSourceLang,
      targetLang: toLang,
      isTranslated: false,
    };
  }

  try {
    const sl = detectedSourceLang === 'en' ? 'en' : 'hu';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${toLang}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Google Translate HTTP hiba: ${res.status}`);
    }

    const data: any = await res.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((s: any) => s?.[0] || '').join('')
      : trimmed;

    const isSame = translated.trim().toLowerCase() === trimmed.toLowerCase();
    const isTranslated = !isSame;

    return {
      original: trimmed,
      translated: isTranslated ? (translated || trimmed) : trimmed,
      detectedSourceLang,
      targetLang: toLang,
      isTranslated,
    };
  } catch (error) {
    console.warn(`[AutoTranslate] Nem sikerült lefordítani (${detectedSourceLang} -> ${toLang}):`, error);
    return {
      original: trimmed,
      translated: trimmed,
      detectedSourceLang,
      targetLang: toLang,
      isTranslated: false,
    };
  }
}

/**
 * Egyszerű visszafelé kompatibilis fordítófüggvény
 */
export async function autoTranslate(
  text: string,
  toLang: 'en' | 'hu' = 'en'
): Promise<string> {
  const res = await autoTranslateDetailed(text, toLang);
  return res.translated;
}