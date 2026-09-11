import nodemailer from 'nodemailer';
import { adminDb } from '../config/firebase.js';

let transporter: nodemailer.Transporter | null = null;
let isInitialized = false;

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (isInitialized) return transporter;

  // 1. Saját SMTP beállítás (.env)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('📧 Éles SMTP fiók sikeresen inicializálva.');
  } else if (process.env.NODE_ENV !== 'production') {
    // 2. Csak nem-éles (development) módban hozunk létre Ethereal fiókot egyszer
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('🧪 Ethereal teszt email fiók inicializálva:', testAccount.user);
    } catch (e) {
      console.warn('⚠️ Nem sikerült létrehozni az Ethereal fiókot, az értesítő emailek kihagyva.');
      transporter = null;
    }
  } else {
    console.log('ℹ️ Éles környezetben nincs SMTP megadva. E-mail értesítések inaktívak.');
    transporter = null;
  }

  isInitialized = true;
  return transporter;
}

interface ReportNotificationData {
  allatFajta: string;
  megye: string;
  megjegyzes: string;
  telefon?: string;
  lat?: number;
  lon?: number;
}

export async function sendNotificationToRescuers(report: ReportNotificationData) {
  try {
    const activeTransporter = await getTransporter();
    if (!activeTransporter) {
      return; // Ha nincs e-mail konfigurálva, csendben kihagyjuk felesleges Firestore terhelés nélkül
    }

    // Lekérjük a hitelesített mentőket és adminokat
    const snapshot = await adminDb.collection('users')
      .where('role', 'in', ['verified_rescuer', 'super_admin'])
      .get();

    if (snapshot.empty) return;

    const recipientEmails = snapshot.docs
      .map((doc: any) => doc.data().email)
      .filter((email: any) => Boolean(email));

    if (recipientEmails.length === 0) return;

    const mapsUrl = (report.lat && report.lon)
      ? `https://www.google.com/maps?q=${report.lat},${report.lon}`
      : 'Nincs megadva';

    const mailOptions = {
      from: '"Állatmentő Portál Riasztás" <riasztas@allatmento.hu>',
      to: recipientEmails.join(', '),
      subject: `🚨 ÚJ MENTÉSI ESET [${report.megye}] - ${report.allatFajta}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #ef4444; margin-top: 0;">🚨 Új Állatmentési Bejelentés Érkezett!</h2>
          <p style="font-size: 14px; color: #334155;"><b>Érintett régió:</b> ${report.megye}</p>
          <p style="font-size: 14px; color: #334155;"><b>Állatfajta:</b> ${report.allatFajta}</p>
          <p style="font-size: 14px; color: #334155;"><b>Leírás / Helyzet:</b> ${report.megjegyzes || 'Nincs külön megjegyzés'}</p>
          <p style="font-size: 14px; color: #334155;"><b>Bejelentő telefonszáma:</b> ${report.telefon || 'Nincs megadva'}</p>
          <div style="margin: 25px 0;">
            <a href="${mapsUrl}" target="_blank" style="background: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📍 Megnyitás a Google Térképen</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <small style="color: #94a3b8;">Ez egy automatikus értesítés a hitelesített mentők részére.</small>
        </div>
      `,
    };

    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`✉️ Riasztó e-mail sikeresen elküldve (${recipientEmails.length} címzettnek).`);
    
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`🔗 E-mail előnézet: ${previewUrl}`);
  } catch (error) {
    console.error('Hiba az értesítő e-mail kiküldésekor:', error);
  }
}