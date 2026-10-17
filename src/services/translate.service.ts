export interface TranslationDetail {
  original: string;
  translated: string;
  detectedSourceLang: string;
  targetLang: 'en' | 'hu';
  isTranslated: boolean;
}

/**
 * Automatikus fordító segédfüggvény részletes adatokkal (valós forrásnyelv és fordítási státusz)
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

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${toLang}&dt=t&q=${encodeURIComponent(trimmed)}`;
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
    const detectedSourceLang = typeof data?.[2] === 'string' ? data[2] : '';

    const isSame = translated.trim().toLowerCase() === trimmed.toLowerCase();
    const isTranslated = !isSame && detectedSourceLang !== toLang;

    return {
      original: trimmed,
      translated: translated || trimmed,
      detectedSourceLang: detectedSourceLang || (toLang === 'en' ? 'hu' : 'en'),
      targetLang: toLang,
      isTranslated,
    };
  } catch (error) {
    console.warn(`[AutoTranslate] Nem sikerült lefordítani (${toLang}):`, error);
    return {
      original: trimmed,
      translated: trimmed,
      detectedSourceLang: toLang,
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