import { setUserRoleInSystem } from './services/users.service.js';

const TARGET_UID = process.env.TARGET_ADMIN_UID || process.argv[2];

async function run() {
  if (!TARGET_UID) {
    console.error('❌ Hiba: Kérlek add meg a célfelhasználó UID-ját!');
    console.error('Használat: npm run make-admin <TARGET_UID> vagy TARGET_ADMIN_UID=<TARGET_UID> npm run make-admin');
    process.exit(1);
  }

  console.log(`⏳ Jogosultság beállítása Adminra (${TARGET_UID})...`);
  try {
    await setUserRoleInSystem(TARGET_UID, 'super_admin', 'system_init');
    console.log('✅ SIKER! A felhasználó mostantól Super Admin (super_admin).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Hiba történt:', err);
    process.exit(1);
  }
}

run();