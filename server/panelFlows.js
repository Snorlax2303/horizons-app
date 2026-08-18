function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 300) throw new Error(`Campo obrigatório inválido: ${field}.`);
  return value.trim();
}

// The Unix panel creates a test from the "Adicionar Cliente" screen.  The
// local agent resolves the visible labels/text at execution time because the
// panel's generated element IDs change on every session.
export function buildPanelFlow(operation, panel) {
  const provider = panel.provider.toLowerCase();
  if (operation.action === 'renew_customer' && provider === 'union') {
    const renewal = operation.input?.union_renew;
    if (!renewal) return operation.input?.flow || null;
    const customerName = requiredText(renewal.customer_name, 'nome do cliente');
    const plan = requiredText(renewal.plan, 'plano');
    const alreadyInCustomers = renewal.already_in_customers === true;
    const chooseRenewalPlan = (option) => ([{ type: 'select_visible_combobox', text: 'Plano', value: option }]);
    return {
      version: 'union-renew-customer-v2',
      steps: [
        // With saved credentials, Union may open either at the sign-in page
        // or directly in the authenticated dashboard.  Click the visible
        // entry button when it exists; otherwise continue without failing.
        { type: 'click_text_if_present', text: 'Entrar' },
        { type: 'click_text_if_present', text: 'Continuar' },
        ...(alreadyInCustomers ? [
          { type: 'wait_for_text', text: 'Clientes', timeout_ms: 15000 },
        ] : [
          { type: 'wait', ms: 1800 },
          { type: 'wait_for_text', text: 'Clientes', timeout_ms: 15000 },
        ]),
        // Exact sidebar route captured from the authenticated dashboard.
        { type: 'click', selector: 'div:nth-of-type(2) > div > div > div:nth-of-type(15) > a' },
        { type: 'wait_for', selector: 'input[placeholder="Pesquisar"]', timeout_ms: 8000 },
        // Filtro superior da lista de Clientes, confirmado na captura atual.
        { type: 'fill', selector: 'input[placeholder="Pesquisar"]', value: customerName },
        { type: 'wait', ms: 700 },
        // O ícone de calendário abre o menu de ações da linha; a renovação
        // diretamente na janela de renovação.
        { type: 'click_row_selector', text: customerName, selector: 'td:nth-of-type(5) > div:nth-of-type(1) > button:nth-of-type(2)' },
        { type: 'wait_for_text', text: 'Plano', timeout_ms: 8000 },
        ...chooseRenewalPlan(plan),
        { type: 'click_form_submit', text: 'Criar pedido de cliente para este pagamento' },
        { type: 'wait_for_text', text: 'Confirmação de Renovação', timeout_ms: 8000 },
        { type: 'click_text', text: 'Fechar', scope_text: 'Confirmação de Renovação' },
      ],
    };
  }
  if (operation.action !== 'create_test') return operation.input?.flow || null;
  if (provider === 'now') {
    const test = operation.input?.now_test;
    if (!test) return operation.input?.flow || null;

    const name = requiredText(test.name, 'nome');
    const username = requiredText(test.username, 'usuário');
    if (username.length > 15) throw new Error('Usuário do NOW deve ter no máximo 15 caracteres.');
    if (typeof test.adult_profile !== 'boolean') throw new Error('Perfil do NOW deve ser informado.');
    const phone = typeof test.phone === 'string' ? test.phone.trim().slice(0, 80) : '';

    const promoteToUser = test.promote_to_user === true;
    // Based on capture c4a7c673: the NOW panel exposes stable field IDs in
    // its "Adicionar Teste" dialog. When explicitly requested, the captured
    // row action promotes the newly-created test to a regular user.
    return {
      version: 'now-create-test-v1',
      steps: [
        { type: 'click_text', text: 'Teste' },
        { type: 'wait_for_text', text: 'Adicionar Teste', timeout_ms: 8000 },
        { type: 'click_text', text: 'Adicionar Teste' },
        { type: 'wait_for', selector: '#EditarNome', timeout_ms: 8000 },
        { type: 'fill', selector: '#EditarNome', value: name },
        { type: 'fill', selector: '#EditarUsuario', value: username },
        { type: 'click_text', text: 'Gerar Senha' },
        { type: 'wait', ms: 300 },
        ...(phone ? [{ type: 'fill', selector: '#EditarCelular', value: phone }] : []),
        { type: 'click_text', text: test.adult_profile ? 'COM ADULTO' : 'SEM ADULTO' },
        { type: 'extract', selector: '#EditarUsuario', key: 'username' },
        { type: 'extract', selector: '#EditarSenha', key: 'password' },
        { type: 'click', selector: 'div > div:nth-of-type(2) > div > div:nth-of-type(3) > button:nth-of-type(1)' },
        { type: 'wait', ms: 1200 },
        { type: 'click_text', text: 'Fechar' },
        { type: 'wait', ms: 500 },
        ...(promoteToUser ? [
          { type: 'click', selector: 'tbody > tr > td:nth-of-type(7) > div > a:nth-of-type(1)' },
          { type: 'wait', ms: 400 },
          { type: 'click', selector: 'div > div > div:nth-of-type(3) > div > a' },
          { type: 'wait_for_text', text: 'Adicionar Usuário', timeout_ms: 8000 },
        ] : []),
      ],
    };
  }
  if (provider === 'union') {
    const test = operation.input?.union_test;
    if (!test) return operation.input?.flow || null;

    // Union's generated input IDs change between sessions. The capture shows
    // stable labels and searchable comboboxes, so resolve those at runtime.
    const server = requiredText(test.server, 'servidor');
    const plan = requiredText(test.plan, 'plano');
    const hours = requiredText(test.hours, 'horas de teste');
    const name = requiredText(test.name, 'nome');
    const phone = typeof test.phone === 'string' ? test.phone.trim().slice(0, 80) : '';

    const choose = (label, option) => ([{ type: 'select_visible_combobox', text: label, value: option }]);
    return {
      version: 'union-create-test-v2',
      steps: [
        { type: 'click_text_if_present', text: 'Entrar' },
        { type: 'click_text_if_present', text: 'Continuar' },
        { type: 'wait_for', selector: 'div:nth-of-type(2) > div > div > div:nth-of-type(15) > a', timeout_ms: 15000 },
        { type: 'click', selector: 'div:nth-of-type(2) > div > div > div:nth-of-type(15) > a' },
        { type: 'wait_for_text', text: 'Adicionar', timeout_ms: 8000 },
        { type: 'click_text', text: 'Adicionar' },
        { type: 'wait_for_text', text: 'Adicionar Cliente', timeout_ms: 8000 },
        ...choose('Servidor', server),
        ...choose('Plano', plan),
        { type: 'fill_label', label: 'Horas de Teste', value: hours },
        // The captured form has generator buttons next to these fields.  Never
        // manufacture credentials when the panel can generate them itself.
        ...(typeof test.username === 'string' && test.username.trim()
          ? [{ type: 'fill_label', label: 'Usuário', value: requiredText(test.username, 'usuário') }]
          : [{ type: 'click_label_action', label: 'Usuário' }]),
        ...(typeof test.password === 'string' && test.password.trim()
          ? [{ type: 'fill_label', label: 'Senha', value: requiredText(test.password, 'senha') }]
          : [{ type: 'click_label_action', label: 'Senha' }]),
        { type: 'fill_label', label: 'Nome', value: name },
        ...(phone ? [{ type: 'fill_label', label: 'WhatsApp', value: phone }] : []),
        { type: 'extract_label', label: 'Usuário', key: 'username' },
        // In Union the final blue submit control has no visible text. Resolve
        // its enclosing form by captured text and click its submit control.
        { type: 'click_form_submit', text: 'Continue nesta tela após clicar em salvar' },
        { type: 'wait', ms: 1500 },
      ],
    };
  }
  if (provider !== 'unix') return operation.input?.flow || null;
  const test = operation.input?.unix_test;
  if (!test) return operation.input?.flow || null;

  const server = requiredText(test.server, 'servidor');
  const plan = requiredText(test.plan, 'plano');
  const hours = requiredText(test.hours, 'horas de teste');
  const name = requiredText(test.name, 'nome');
  const phone = typeof test.phone === 'string' ? test.phone.trim().slice(0, 80) : '';

  const choose = (label, option) => ([
    { type: 'click_label', label },
    { type: 'fill_label', label, value: option },
    { type: 'wait', ms: 350 },
    { type: 'click_text', text: option },
  ]);
  return {
    version: 'unix-create-test-v1',
    steps: [
      { type: 'click_text', text: 'Adicionar Cliente' },
      { type: 'wait_for_text', text: 'Servidor', timeout_ms: 8000 },
      ...choose('Servidor', server),
      ...choose('Plano', plan),
      ...choose('Horas de Teste', hours),
      { type: 'fill_label', label: 'Nome', value: name },
      ...(phone ? [{ type: 'fill_label', label: 'WhatsApp', value: phone }] : []),
      { type: 'extract_label', label: 'Usuário', key: 'username' },
      { type: 'extract_label', label: 'Senha', key: 'password' },
      { type: 'click_text', text: 'Salvar' },
    ],
  };
}
