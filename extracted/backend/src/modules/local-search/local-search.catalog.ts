/**
 * Curated Egypt landmark + city catalogue.
 *
 * Ships in code (not DB) so search works on a fresh install. Every
 * entry includes:
 *   - one canonical Arabic name (DB-friendly)
 *   - English + franko aliases that real Egyptians type
 *   - lat/lng (approximate centroid)
 *   - kind: 'landmark' or 'city'
 *
 * Coverage: top 30 transit hubs + 27 governorate capitals.
 * Source: OpenStreetMap-derived public coordinates, cross-checked
 * against widely-used Egyptian transit references. Coordinates are
 * rounded to 4 decimals (≈11 m precision) to keep this file small
 * and to avoid implying false precision.
 */
import type { LocalSearchKind } from './local-search.types';

export interface CatalogEntry {
  id: string;
  kind: Extract<LocalSearchKind, 'landmark' | 'city'>;
  name: string;
  area?: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const EGYPT_LANDMARKS: CatalogEntry[] = [
  // ---- Cairo transit hubs ----
  { id: 'ramses-square', kind: 'landmark', name: 'ميدان رمسيس', area: 'القاهرة', lat: 30.0626, lng: 31.2497, aliases: ['ramses', 'midan ramses', 'ramsis', 'rmses', 'محطة مصر', 'misr station', 'مصر ستيشن'] },
  { id: 'tahrir-square', kind: 'landmark', name: 'ميدان التحرير', area: 'القاهرة', lat: 30.0444, lng: 31.2357, aliases: ['tahrir', 'el tahrir', 'midan tahrir', 'ta7rir', 'التحرير', 'liberation square'] },
  { id: 'attaba', kind: 'landmark', name: 'العتبة', area: 'القاهرة', lat: 30.0518, lng: 31.2470, aliases: ['attaba', 'ataba', 'el attaba', 'عتبه', 'العتبه'] },
  { id: 'abdel-moneim-riad', kind: 'landmark', name: 'موقف عبد المنعم رياض', area: 'القاهرة', lat: 30.0479, lng: 31.2333, aliases: ['abdel moneim riad', 'abdulmonim', 'مونيم رياض', 'موقف رياض'] },
  { id: 'abbasiya', kind: 'landmark', name: 'العباسية', area: 'القاهرة', lat: 30.0676, lng: 31.2806, aliases: ['abbasiya', 'abbassia', 'el abbasia', 'العباسيه'] },
  { id: 'ghamra', kind: 'landmark', name: 'موقف غمرة', area: 'القاهرة', lat: 30.0749, lng: 31.2745, aliases: ['ghamra', '8amra', 'غمره'] },
  { id: 'sayeda-aisha', kind: 'landmark', name: 'موقف السيدة عائشة', area: 'القاهرة', lat: 30.0287, lng: 31.2571, aliases: ['sayeda aisha', 'sayda aisha', 'السيده عائشه'] },
  { id: 'maadi-corniche', kind: 'landmark', name: 'كورنيش المعادي', area: 'القاهرة', lat: 29.9603, lng: 31.2569, aliases: ['maadi corniche', 'el maadi', 'kornich maadi', 'المعادي'] },
  { id: 'helwan-station', kind: 'landmark', name: 'محطة حلوان', area: 'القاهرة', lat: 29.8487, lng: 31.3346, aliases: ['helwan', 'mahattet helwan', 'حلوان'] },
  { id: 'shubra', kind: 'landmark', name: 'موقف شبرا', area: 'القاهرة', lat: 30.0925, lng: 31.2454, aliases: ['shubra', 'shobra', 'شبرا'] },
  { id: 'ain-shams', kind: 'landmark', name: 'عين شمس', area: 'القاهرة', lat: 30.1076, lng: 31.3187, aliases: ['ain shams', '3in shams', 'عين شمس'] },
  { id: 'matareya', kind: 'landmark', name: 'المطرية', area: 'القاهرة', lat: 30.1213, lng: 31.3033, aliases: ['matareya', 'mataria', 'المطريه'] },
  { id: 'nasr-city-mall', kind: 'landmark', name: 'مدينة نصر', area: 'القاهرة', lat: 30.0561, lng: 31.3388, aliases: ['nasr city', 'madinet nasr', 'مدينة نصر'] },
  { id: 'heliopolis-roxy', kind: 'landmark', name: 'روكسي', area: 'القاهرة', lat: 30.0904, lng: 31.3211, aliases: ['roxy', 'heliopolis', 'مصر الجديدة', 'masr el gedida'] },
  { id: 'salah-salem', kind: 'landmark', name: 'صلاح سالم', area: 'القاهرة', lat: 30.0610, lng: 31.2860, aliases: ['salah salem', 'salah saalem', 'صلاح سالم'] },
  { id: 'imbaba', kind: 'landmark', name: 'موقف إمبابة', area: 'الجيزة', lat: 30.0773, lng: 31.2050, aliases: ['imbaba', 'embaba', 'امبابه'] },
  { id: 'mohandessin', kind: 'landmark', name: 'المهندسين', area: 'الجيزة', lat: 30.0567, lng: 31.2080, aliases: ['mohandessin', 'mohandeseen', 'المهندسين'] },
  { id: 'dokki', kind: 'landmark', name: 'الدقي', area: 'الجيزة', lat: 30.0381, lng: 31.2089, aliases: ['dokki', 'doki', 'الدقي', 'الدوقي'] },
  { id: 'giza-square', kind: 'landmark', name: 'ميدان الجيزة', area: 'الجيزة', lat: 30.0131, lng: 31.2089, aliases: ['giza', 'gizeh', 'midan el giza', 'الجيزه'] },
  { id: 'pyramids', kind: 'landmark', name: 'الأهرامات', area: 'الجيزة', lat: 29.9792, lng: 31.1342, aliases: ['pyramids', 'haram', 'الأهرام', 'الهرم'] },
  { id: 'faisal', kind: 'landmark', name: 'فيصل', area: 'الجيزة', lat: 30.0118, lng: 31.1830, aliases: ['faisal', 'faysal', 'فيصل'] },
  { id: 'october-city', kind: 'landmark', name: '6 أكتوبر', area: 'الجيزة', lat: 29.9667, lng: 30.9333, aliases: ['october', '6 october', 'sixth of october', '6 اكتوبر'] },
  { id: 'sheikh-zayed', kind: 'landmark', name: 'الشيخ زايد', area: 'الجيزة', lat: 30.0319, lng: 30.9745, aliases: ['sheikh zayed', 'el sheikh zayed', 'الشيخ زايد'] },
  { id: 'rehab', kind: 'landmark', name: 'الرحاب', area: 'القاهرة الجديدة', lat: 30.0588, lng: 31.4904, aliases: ['rehab', 'el rehab', 'الرحاب'] },
  { id: 'tagamoa', kind: 'landmark', name: 'التجمع الخامس', area: 'القاهرة الجديدة', lat: 30.0259, lng: 31.4913, aliases: ['tagamoa', 'tagamo3', 'fifth settlement', 'التجمع'] },
  { id: 'new-capital', kind: 'landmark', name: 'العاصمة الإدارية', area: 'العاصمة الإدارية', lat: 30.0190, lng: 31.7398, aliases: ['new capital', 'al asema al edaria', 'العاصمه الاداريه'] },
  // ---- Alexandria ----
  { id: 'alex-misr-station', kind: 'landmark', name: 'محطة مصر بالإسكندرية', area: 'الإسكندرية', lat: 31.1936, lng: 29.9050, aliases: ['alex misr', 'mahattet misr alex', 'محطه مصر اسكندريه'] },
  { id: 'alex-mahatet-raml', kind: 'landmark', name: 'محطة الرمل', area: 'الإسكندرية', lat: 31.1989, lng: 29.8939, aliases: ['raml station', 'mahattet el raml', 'الرمل'] },
  { id: 'alex-mansheya', kind: 'landmark', name: 'المنشية', area: 'الإسكندرية', lat: 31.1987, lng: 29.8853, aliases: ['mansheya', 'mansheyya', 'المنشيه'] },
  { id: 'alex-sidi-gaber', kind: 'landmark', name: 'سيدي جابر', area: 'الإسكندرية', lat: 31.2169, lng: 29.9408, aliases: ['sidi gaber', 'sidigaber', 'سيدي جابر'] },
];

export const EGYPT_CITIES: CatalogEntry[] = [
  { id: 'cairo', kind: 'city', name: 'القاهرة', lat: 30.0444, lng: 31.2357, aliases: ['cairo', 'kairo', 'al qahira', 'القاهره'] },
  { id: 'giza', kind: 'city', name: 'الجيزة', lat: 30.0131, lng: 31.2089, aliases: ['giza', 'gizeh', 'الجيزه'] },
  { id: 'alexandria', kind: 'city', name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, aliases: ['alexandria', 'alex', 'iskandariya', 'الاسكندريه'] },
  { id: 'shubra-el-kheima', kind: 'city', name: 'شبرا الخيمة', lat: 30.1286, lng: 31.2444, aliases: ['shubra el kheima', 'shobra el khema', 'شبرا الخيمه'] },
  { id: 'port-said', kind: 'city', name: 'بورسعيد', lat: 31.2653, lng: 32.3019, aliases: ['port said', 'borsaid', 'بورسعيد'] },
  { id: 'suez', kind: 'city', name: 'السويس', lat: 29.9737, lng: 32.5263, aliases: ['suez', 'al suis', 'السويس'] },
  { id: 'ismailia', kind: 'city', name: 'الإسماعيلية', lat: 30.5965, lng: 32.2715, aliases: ['ismailia', 'al ismailia', 'الاسماعيليه'] },
  { id: 'mansoura', kind: 'city', name: 'المنصورة', lat: 31.0364, lng: 31.3807, aliases: ['mansoura', 'al mansura', 'المنصوره'] },
  { id: 'tanta', kind: 'city', name: 'طنطا', lat: 30.7865, lng: 31.0004, aliases: ['tanta', 'tantah', 'طنطا'] },
  { id: 'zagazig', kind: 'city', name: 'الزقازيق', lat: 30.5877, lng: 31.5022, aliases: ['zagazig', 'zaqaziq', 'الزقازيق'] },
  { id: 'damanhour', kind: 'city', name: 'دمنهور', lat: 31.0341, lng: 30.4682, aliases: ['damanhour', 'damanhur', 'دمنهور'] },
  { id: 'damietta', kind: 'city', name: 'دمياط', lat: 31.4165, lng: 31.8133, aliases: ['damietta', 'dumyat', 'دمياط'] },
  { id: 'kafr-el-sheikh', kind: 'city', name: 'كفر الشيخ', lat: 31.1107, lng: 30.9388, aliases: ['kafr el sheikh', 'kafr al sheikh', 'كفر الشيخ'] },
  { id: 'banha', kind: 'city', name: 'بنها', lat: 30.4607, lng: 31.1849, aliases: ['banha', 'benha', 'بنها'] },
  { id: 'beni-suef', kind: 'city', name: 'بني سويف', lat: 29.0744, lng: 31.0978, aliases: ['beni suef', 'banisuwayf', 'بني سويف'] },
  { id: 'fayoum', kind: 'city', name: 'الفيوم', lat: 29.3084, lng: 30.8428, aliases: ['fayoum', 'fayyum', 'الفيوم'] },
  { id: 'minya', kind: 'city', name: 'المنيا', lat: 28.0871, lng: 30.7618, aliases: ['minya', 'menya', 'المنيا'] },
  { id: 'asyut', kind: 'city', name: 'أسيوط', lat: 27.1809, lng: 31.1837, aliases: ['asyut', 'assiut', 'اسيوط'] },
  { id: 'sohag', kind: 'city', name: 'سوهاج', lat: 26.5569, lng: 31.6948, aliases: ['sohag', 'suhaj', 'سوهاج'] },
  { id: 'qena', kind: 'city', name: 'قنا', lat: 26.1551, lng: 32.7160, aliases: ['qena', 'qena city', 'قنا'] },
  { id: 'luxor', kind: 'city', name: 'الأقصر', lat: 25.6872, lng: 32.6396, aliases: ['luxor', 'al uqsur', 'الاقصر'] },
  { id: 'aswan', kind: 'city', name: 'أسوان', lat: 24.0889, lng: 32.8998, aliases: ['aswan', 'aswaan', 'اسوان'] },
  { id: 'red-sea', kind: 'city', name: 'الغردقة', lat: 27.2579, lng: 33.8116, aliases: ['hurghada', 'ghardaqa', 'الغردقه'] },
  { id: 'sharm', kind: 'city', name: 'شرم الشيخ', lat: 27.9158, lng: 34.3300, aliases: ['sharm', 'sharm el sheikh', 'شرم'] },
  { id: 'matruh', kind: 'city', name: 'مرسى مطروح', lat: 31.3525, lng: 27.2453, aliases: ['marsa matruh', 'matrouh', 'مرسي مطروح'] },
  { id: 'arish', kind: 'city', name: 'العريش', lat: 31.1313, lng: 33.8030, aliases: ['arish', 'el arish', 'العريش'] },
  { id: 'new-valley', kind: 'city', name: 'الخارجة', lat: 25.4536, lng: 30.5466, aliases: ['kharga', 'el kharga', 'الخارجه'] },
];

export const EGYPT_CATALOG: CatalogEntry[] = [...EGYPT_LANDMARKS, ...EGYPT_CITIES];
