function ensureField(params, fieldName) {
  if (!params || params[fieldName] === undefined) {
    throw new Error(`${fieldName} is required for documentation.`);
  }
}

function documentation(params = {}) {
  ensureField(params, 'method');
  ensureField(params, 'path');

  return {
    method: params.method,
    path: params.path,
    description: params.description || '',
  };
}

function message(params = {}) {
  if (!params.docs) {
    throw new Error('Docs is required for message.');
  }
  if (!params.message) {
    throw new Error('Message is required for message.');
  }

  const msg = {
    docs: params.docs,
    message: params.message,
    notes: params.notes || '',
  };

  if (params.data) {
    Object.assign(msg, params.data);
  } else {
    msg.data = {};
  }

  return msg;
}

function error(params = {}) {
  if (!params.docs) {
    throw new Error('Docs is required for error.');
  }
  if (!params.error) {
    throw new Error('Error message is required for error.');
  }

  return {
    docs: params.docs,
    error: params.error,
    details: params.details || '',
  };
}

module.exports = {
  documentation,
  message,
  error,
};
