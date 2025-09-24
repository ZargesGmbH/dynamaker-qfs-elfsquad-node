const axios = require('axios');

exports.handler = async (event) => {
  // Parse webhook payload
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const configurationId = body?.content?.configurationId;
  const quotationId = body?.content?.quotationId;

  // Fetch configuration details from Elfsquad
  const configRes = await axios.get(`https://api.elfsquad.io/configurator/1/configurator/open?configurationId=${configurationId}`, {
    headers: { 'Authorization': `Bearer ${process.env.ELFSQUAD_API_KEY}` }
  });
  const configuration = configRes.data;

  // Check configuration model ID
  if (configuration.configurationModelId !== process.env.CONFIG_MODEL_ID) {
    return { statusCode: 200, body: 'Model ID does not match. Flow stopped.' };
  }

  // Start QFS job
  const callbackUrl = `${event.headers['X-Forwarded-Proto'] || 'https'}://${event.headers.Host}/callback`;
  const qfsRes = await axios.post('https://qfs.dynamaker.com/jobs', {
    applicationId: process.env.APPLICATION_ID,
    task: process.env.QFS_TASK,
    environment: process.env.QFS_ENVIRONMENT,
    configuration,
    callbackUrl
  }, {
    headers: { 'qfs-api-key': process.env.QFS_API_KEY }
  });

  return { statusCode: 200, body: JSON.stringify({ message: 'QFS job started', job: qfsRes.data, quotationId }) };
};
