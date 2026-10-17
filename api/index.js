let app;

try {
  const serverModule = await import('../dist/server.js');
  app = serverModule.default || serverModule.app;
} catch (err) {
  try {
    const serverModule = await import('../src/server.js');
    app = serverModule.default || serverModule.app;
  } catch (innerErr) {
    console.error('Nem sikerult betolteni az Express szervert:', err, innerErr);
  }
}

export default app;
