import { getLocales } from 'expo-localization';

/**
 * Maps ISO 3166-1 alpha-2 region codes to international calling codes.
 */
const REGION_TO_CALLING_CODE: Record<string, string> = {
  // Americas
  US: '+1', CA: '+1', MX: '+52',
  BR: '+55', AR: '+54', PY: '+595',
  UY: '+598', CL: '+56', CO: '+57',
  PE: '+51', BO: '+591', EC: '+593',
  VE: '+58', PA: '+507', CR: '+506',
  GT: '+502', HN: '+504', SV: '+503',
  NI: '+505', DO: '+1809', PR: '+1787',
  CU: '+53', HT: '+509', JM: '+1876',
  TT: '+1868', BB: '+1246', BS: '+1242',
  GY: '+592', SR: '+597', BZ: '+501',
  // Europe
  GB: '+44', DE: '+49', FR: '+33',
  ES: '+34', IT: '+39', PT: '+351',
  NL: '+31', BE: '+32', CH: '+41',
  AT: '+43', SE: '+46', NO: '+47',
  DK: '+45', FI: '+358', PL: '+48',
  RU: '+7', UA: '+380', TR: '+90',
  GR: '+30', CZ: '+420', HU: '+36',
  RO: '+40', BG: '+359', HR: '+385',
  RS: '+381', SK: '+421', SI: '+386',
  EE: '+372', LV: '+371', LT: '+370',
  LU: '+352', IE: '+353', IS: '+354',
  AL: '+355', BA: '+387', ME: '+382',
  MK: '+389', BY: '+375', MD: '+373',
  // Asia-Pacific
  CN: '+86', JP: '+81', KR: '+82',
  IN: '+91', PK: '+92', BD: '+880',
  AU: '+61', NZ: '+64', SG: '+65',
  ID: '+62', MY: '+60', PH: '+63',
  TH: '+66', VN: '+84', MM: '+95',
  KH: '+855', LA: '+856', TW: '+886',
  HK: '+852', MO: '+853', MN: '+976',
  KZ: '+7', UZ: '+998', TM: '+993',
  KG: '+996', TJ: '+992', AF: '+93',
  NP: '+977', LK: '+94', MV: '+960',
  // Middle East
  SA: '+966', AE: '+971', IL: '+972',
  JO: '+962', LB: '+961', SY: '+963',
  IQ: '+964', IR: '+98', KW: '+965',
  QA: '+974', BH: '+973', OM: '+968',
  YE: '+967',
  // Africa
  ZA: '+27', NG: '+234', EG: '+20',
  KE: '+254', GH: '+233', MA: '+212',
  ET: '+251', TZ: '+255', UG: '+256',
  DZ: '+213', TN: '+216', LY: '+218',
  SD: '+249', CM: '+237', CI: '+225',
  SN: '+221', MZ: '+258', ZM: '+260',
  ZW: '+263', RW: '+250', MG: '+261',
};

/**
 * Returns the international calling code for the device's region.
 * Falls back to '+1' if the region cannot be determined.
 */
export function getDeviceCallingCode(): string {
  try {
    const locales = getLocales();
    const regionCode = locales[0]?.regionCode;
    if (regionCode && REGION_TO_CALLING_CODE[regionCode]) {
      return REGION_TO_CALLING_CODE[regionCode];
    }
  } catch {}
  return '+595';
}

/**
 * Returns a phone value pre-filled with the device calling code,
 * but only if the existing value is empty.
 */
export function prefillPhone(existingPhone?: string | null): string {
  if (existingPhone && existingPhone.trim()) return existingPhone;
  return getDeviceCallingCode();
}
