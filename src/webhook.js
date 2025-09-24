
const axios = require('axios');
const qs = require('querystring');

exports.handler = async (event) => {
  // Parse webhook payload
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const configurationId = body?.content?.configurationId;
  const quotationId = body?.content?.quotationId;


  // Get Elfsquad access token using OpenID client credentials
  const tokenRes = await axios.post(
    process.env.ELFSQUAD_LOGIN_ENDPOINT,
    qs.stringify({
      grant_type: process.env.ELFSQUAD_GRANT_TYPE,
      client_id: process.env.ELFSQUAD_CLIENT_ID,
      client_secret: process.env.ELFSQUAD_CLIENT_SECRET,
      scope: process.env.ELFSQUAD_SCOPE,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  const accessToken = tokenRes.data.access_token;

  // Fetch configuration details from Elfsquad using the access token
  const configRes = await axios.get(
    `${process.env.ELFSQUAD_BASE_URL}/configurator/1/configurator/open?configurationId=${configurationId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );
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
