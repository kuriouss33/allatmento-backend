export type ReportStatus = 'fuggoben' | 'folyamatban' | 'megoldva';

export interface CreateReportDTO {
  allatFajta: string;
  allapot?: string;
  helyszinLeiras?: string;
  megye?: string;
  cim?: string;
  lat: number;
  lng: number;
  bejelentoNev?: string;
  bejelentoTelefon?: string;
  kepUrl?: string | null;
  createrId?: string;
}

export interface Report extends CreateReportDTO {
  id: string;
  status: ReportStatus;
  createdAt: string;
  rescuerUid?: string | null;
  rescuerName?: string | null;
  resolvedAt?: string | null;
  lezarasFotoUrl?: string | null;
}