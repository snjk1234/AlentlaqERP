const operations = ['findMany', 'findFirst', 'findUnique', 'count', 'create', 'update', 'delete', 'upsert'];
const models = [
  'user',
  'product',
  'category',
  'order',
  'orderReturn',
  'orderReturnItem',
  'customer',
  'customerPrice',
  'orderItem',
  'bank',
  'customerCeilingQuota',
  'payment',
  'supplier',
  'purchaseOrder',
  'purchaseOrderItem',
  'expensePayment',
  'expenseCategory',
  'generalExpense'
];

function createRemoteClient(getConfig, transactionId = null) {
  async function request(path, payload) {
    const config = getConfig();
    if (!config || !config.serverUrl) {
      throw new Error('Configure serverUrl in the AlEntlaqPOS server.json file.');
    }
    if (!config.apiToken) {
      throw new Error('Configure apiToken in the AlEntlaqPOS server.json file.');
    }
    let serverUrl;
    try {
      serverUrl = new URL(config.serverUrl);
    } catch {
      throw new Error('The configured POS server URL is invalid.');
    }
    if (serverUrl.protocol !== 'http:' && serverUrl.protocol !== 'https:') {
      throw new Error('The POS server URL must use HTTP or HTTPS.');
    }
    serverUrl.pathname = `${serverUrl.pathname.replace(/\/+$/, '')}${path}`;
    serverUrl.search = '';
    serverUrl.hash = '';

    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiToken}`
    };
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`POS server returned an invalid response (${response.status}).`);
    }
    if (!response.ok) {
      const error = new Error(result.error || `POS server request failed (${response.status}).`);
      if (typeof result.code === 'string') error.code = result.code;
      throw error;
    }
    return result.data;
  }

  const send = payload => request('/api/db', payload);
  const client = {};
  for (const modelName of models) {
    const delegate = {};
    for (const operation of operations) {
      delegate[operation] = (args = {}) => send({
        action: 'operation',
        modelName,
        operation,
        args,
        ...(transactionId ? { transactionId } : {})
      });
    }
    client[modelName] = delegate;
  }

  client.$transaction = async (callback) => {
    if (typeof callback !== 'function') throw new Error('Access transactions require a callback function.');
    const id = await send({ action: 'begin' });
    try {
      const result = await callback(createRemoteClient(getConfig, id));
      await send({ action: 'commit', transactionId: id });
      return result;
    } catch (error) {
      try {
        await send({ action: 'rollback', transactionId: id });
      } catch (rollbackError) {
        console.error('Failed to roll back remote Access transaction:', rollbackError);
      }
      throw error;
    }
  };
  client.createOrderReturn = data => request('/api/order-returns', data);
  client.createAccountDiscount = data => request('/api/discounts', data);
  client.$disconnect = async () => {};
  return client;
}

module.exports = { createRemoteClient };
