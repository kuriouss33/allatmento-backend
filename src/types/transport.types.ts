export type TransportStatus = 'nyitott' | 'megoldva' | 'elvallalva' | 'folyamatban' | 'teljesitve';
export type TransportUrgency = 'normal' | 'surgos' | 'fix_idopont';
export type TransportCargoType = 'kutya' | 'macska' | 'egyeb_allat' | 'adomany_tap';
export type TransportCargoSize = 'kicsi' | 'kozepes' | 'nagy' | 'tobb_allat' | 'csomag';
export type TransportCrateRequirement = 'box_szukseges' | 'sajat_box_van' | 'nem_szukseges';

export interface TransportJob {
  id: string;
  honnanVaros: string;
  honnanCim?: string;
  honnanMegye: string;
  honnanLat: number;
  honnanLon: number;

  hovaVaros: string;
  hovaCim?: string;
  hovaMegye: string;
  hovaLat: number;
  hovaLon: number;

  tavolsagKm?: number;

  cargoType: TransportCargoType;
  cargoSize: TransportCargoSize;
  allatNev?: string;
  allatFajta?: string;
  leiras: string;
  crateRequirement: TransportCrateRequirement;

  datum: string;
  idosav?: string;
  urgency: TransportUrgency;

  statusz: TransportStatus;

  feladoNev: string;
  feladoTelefon: string;
  feladoSzervezet?: string;
  feladoUserId?: string;
  consentGiven?: boolean;

  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  megoldvaAt?: string;

  messages?: any[];
  createdAt: string;
  updatedAt?: string;
}
