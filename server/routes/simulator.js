import { financialScenarios, validateReceiptScenario } from '../financialSimulator.js';

export function registerSimulatorRoutes(app, { requireAuthenticatedUser }) {
  app.get('/simulator/scenarios', requireAuthenticatedUser, (_, response) => {
    response.json({ scenarios: financialScenarios(), note: 'Payloads sintéticos para homologação local. Não enviam pagamento nem acessam painel externo.' });
  });

  app.post('/simulator/validate-receipt', requireAuthenticatedUser, (request, response) => {
    const result = validateReceiptScenario(request.body?.receipt || {}, request.body?.expected_amount);
    response.json({ validation: result });
  });
}
