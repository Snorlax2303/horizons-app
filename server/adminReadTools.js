const safeCustomer = (customer) => ({
  id: customer.id,
  name: customer.name || null,
  phone: customer.phone || null,
  monthly_value: customer.value == null ? null : Number(customer.value),
  paid: customer.paid ?? null,
  created_at: customer.created_at || null,
  updated_at: customer.updated_at || null,
});

function periodStart(period, dateFrom) {
  if (period === 'custom') return dateFrom;
  const now = new Date();
  if (period === 'today') now.setHours(0, 0, 0, 0);
  else if (period === 'week') now.setDate(now.getDate() - 7);
  else now.setMonth(now.getMonth() - 1);
  return now.toISOString();
}

async function findCustomers(db, userId, query) {
  const normalized = String(query || '').trim().replace(/[,%()]/g, '');
  if (normalized.length < 2) throw new Error('Informe ao menos dois caracteres para localizar o cliente.');
  const digits = normalized.replace(/\D/g, '');
  const filters = [`name.ilike.%${normalized}%`];
  if (digits.length >= 4) filters.push(`phone.ilike.%${digits}%`);
  const { data, error } = await db.from('customers').select('*').eq('user_id', userId)
    .or(filters.join(',')).order('name').limit(10);
  if (error) throw new Error('Não foi possível localizar clientes.');
  return { customers: (data || []).map(safeCustomer), count: data?.length || 0 };
}

async function resolveCustomer(db, userId, args) {
  if (args.customer_id) {
    const { data, error } = await db.from('customers').select('*').eq('user_id', userId)
      .eq('id', args.customer_id).maybeSingle();
    if (error || !data) throw new Error('Cliente não encontrado.');
    return data;
  }
  const found = await findCustomers(db, userId, args.query);
  if (found.count !== 1) return { ambiguous: true, matches: found.customers };
  const { data } = await db.from('customers').select('*').eq('user_id', userId)
    .eq('id', found.customers[0].id).maybeSingle();
  return data;
}

async function customerSummary(db, userId, args, includeCheckout) {
  const customer = await resolveCustomer(db, userId, args);
  if (customer?.ambiguous) return customer;
  const fields = includeCheckout
    ? 'id,external_username,external_plan,screens,active,access_type,adult_profile,test_status,valid_until,dns,checkout_url,server_id,created_at'
    : 'id,external_username,external_plan,screens,active,access_type,adult_profile,test_status,valid_until,dns,server_id,created_at';
  const { data: accesses, error } = await db.from('customer_panel_targets').select(fields)
    .eq('user_id', userId).eq('customer_id', customer.id).order('active', { ascending: false });
  if (error) throw new Error('Não foi possível consultar os acessos do cliente.');
  return { customer: safeCustomer(customer), accesses: accesses || [] };
}

async function unpaidCustomers(db, userId) {
  const { data, error } = await db.from('customers').select('*').eq('user_id', userId)
    .eq('paid', false).order('name').limit(200);
  if (error) throw new Error('Não foi possível consultar clientes pendentes.');
  const customers = (data || []).map(safeCustomer);
  return { customers, count: customers.length, expected_monthly_total: customers.reduce((sum, item) => sum + Number(item.monthly_value || 0), 0) };
}

async function businessMetrics(db, userId, args) {
  const from = periodStart(args.period || 'month', args.date_from);
  const to = args.period === 'custom' ? args.date_to : new Date().toISOString();
  const [{ data: ownedCustomers, error: ownedError }, customers, prospects] = await Promise.all([
    db.from('customers').select('id').eq('user_id', userId),
    db.from('customers').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', from).lte('created_at', to),
    db.from('prospects').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', from).lte('created_at', to),
  ]);
  if (ownedError || customers.error || prospects.error) throw new Error('Não foi possível calcular as métricas.');
  const ids = (ownedCustomers || []).map((item) => item.id);
  let paid = [];
  if (ids.length) {
    const { data, error } = await db.from('payment_events').select('amount,customer_id,status,paid_at')
      .in('customer_id', ids).eq('status', 'paid').gte('paid_at', from).lte('paid_at', to);
    if (error) throw new Error('Não foi possível calcular os recebimentos.');
    paid = data || [];
  }
  return {
    period: { from, to }, new_customers: customers.count || 0, new_prospects: prospects.count || 0,
    payments_count: paid.length, received_total: paid.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    paying_customers: new Set(paid.map((item) => item.customer_id).filter(Boolean)).size,
  };
}

export async function executeReadOnlyAdminTool(db, userId, intent) {
  switch (intent.tool) {
    case 'help': return { available_tools: ['find_customer', 'get_customer_summary', 'get_checkout', 'get_unpaid_customers', 'get_business_metrics', 'list_plans'] };
    case 'list_plans': {
      const { data, error } = await db.from('plans').select('id,name,value,quantity_screens,description')
        .eq('user_id', userId).order('name');
      if (error) throw error;
      return { count: data.length, plans: data };
    }
    case 'find_customer': return findCustomers(db, userId, intent.arguments.query);
    case 'get_customer_summary': return customerSummary(db, userId, intent.arguments, false);
    case 'get_checkout': return customerSummary(db, userId, intent.arguments, true);
    case 'get_unpaid_customers': return unpaidCustomers(db, userId);
    case 'get_business_metrics': return businessMetrics(db, userId, intent.arguments);
    default: throw new Error('Ferramenta administrativa não autorizada.');
  }
}
