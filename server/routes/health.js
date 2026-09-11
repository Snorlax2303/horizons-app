export function registerHealthRoute(app) {
  app.get('/health', (_, response) => response.json({ status: 'ok' }));
}
