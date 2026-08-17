import { setUserRoleInSystem } from './services/users.service.js';

const TARGET_UID = 'CioC9jh4GbNpNI8eM6141EGNzqo2';

async function run() {
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