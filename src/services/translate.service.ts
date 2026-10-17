import translate from 'translate';

// Alapértelmezett beállítás ingyenes Google motorra
translate.engine = 'google';

/**
 * Automatikus fordító segédfüggvény
 * Ha a fordítás bármilyen hálózati okból meghiúsul, csendben visszaadja az eredeti szöveget,
 * így a bejelentés vagy a lezárás sosem akad el miatta.
 */
export async function autoTranslate(
  text: string, 
  toLang: 'en' | 'hu' = 'en',
  fromLang?: 'en' | 'hu'
): Promise<string> {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return '';
  }

  const from = fromLang || (toLang === 'en' ? 'hu' : 'en');

  try {
    const translated = await translate(text, { from, to: toLang });
    return translated;
  } catch (error) {
    console.warn(`[AutoTranslate] Nem sikerült lefordítani a szöveget (${from} -> ${toLang}):`, error);
    return text;
  }
}