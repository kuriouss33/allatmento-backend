export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import('../src/server.js');
    const app = serverModule.default || serverModule.app;
    if (!app || typeof app !== 'function') {
      return res.status(500).json({
        error: 'APP_NOT_A_FUNCTION',
        serverModuleKeys: Object.keys(serverModule),
        appType: typeof app
      });
    }
    return app(req, res);
  } catch (err: any) {
    console.error('SERVER INITIALIZATION ERROR:', err);
    return res.status(500).json({
      error: 'SERVER_INITIALIZATION_ERROR',
      message: err?.message || String(err),
      stack: err?.stack,
      name: err?.name
    });
  }
}
