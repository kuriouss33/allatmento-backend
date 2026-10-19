export type ReportStatus = 'fuggoben' | 'folyamatban' | 'megoldva';

export interface CreateReportDTO {
  allatFajta: string;
  allapot?: string;
  helyszinLeiras?: string;
  megjegyzes_en?: string;
  megjegyzes_hu?: string;
  sourceLang?: string;
  megye?: string;
  cim?: string;
  lat: number;
  lng: number;
  bejelentoNev?: string;
  bejelentoTelefon?: string;
  kepUrl?: string | null;
  kepek?: string[];
  kepekUrl?: string[];
  createrId?: string;
  deleteToken?: string;
}

export interface Report extends CreateReportDTO {
  id: string;
  status: ReportStatus;
  createdAt: string;
  rescuerUid?: string | null;
  rescuerName?: string | null;
  resolvedAt?: string | null;
  lezarasFotoUrl?: string | null;
  lezaras_en?: string | null;
  lezaras_hu?: string | null;
  lezaras_sourceLang?: string | null;
  deleteToken?: string;
}