import axios from "axios";
import { getElfsquadToken } from "./services/elfsquadService.js";

const ELFSQUAD_API_BASE_URL = "https://api.elfsquad.io";
const QFS_API_JOBS_ENDPOINT = "https://qfs.dynamaker.com/jobs";
const QFS_TASK_NAME = process.env.QfsTaskName || "generate-pdf";

export const handler = async (event) => {
  // Parse webhook payload
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const configurationId = body?.configurationId;
  const quotationId = body?.quotationId;

  if (!configurationId || !quotationId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing configurationId and/or quotationId in request body' }),
    };
  }

  // Get Elfsquad access token using OpenID client credentials
  const accessToken = await getElfsquadToken();

  // Fetch configuration details from Elfsquad using the access token
  let configRes;
  try {
    configRes = await axios.get(
      `${ELFSQUAD_API_BASE_URL}/configurator/1/configurator/open/${configurationId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Configuration not found', configurationId }),
      };
    } else {
      console.error('Error fetching configuration from Elfsquad:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Error fetching configuration', error: error }),
      };
    }
  }
  const configuration = configRes.data;

  // Check configuration model ID
  if (configuration.configurationModelId !== process.env.ElfsquadConfiguratorModelId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Model ID does not match. Flow stopped." }),
    };
  }

  // If a drawing already exists for this configuration, delete it first.
  const existingFiles = await getQuotationFilesExtended(accessToken, quotationId);
  const fileName = `${configuration.code}.pdf`;
  const existingDrawingFile = existingFiles.find(f => f.name === fileName);
  if (existingDrawingFile) {
    try {
      await axios.delete(
        `${ELFSQUAD_API_BASE_URL}/api/2/files/entities/${existingDrawingFile.id}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      console.log('Delete successful.');
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  // Start QFS job
  const qfsRes = await axios.post(QFS_API_JOBS_ENDPOINT, {
    applicationId: process.env.DynamakerApplicationId,
    task: QFS_TASK_NAME,
    environment: process.env.QfsEnvironment,
    configuration,
    callbackUrl: `${process.env.QfsCallbackFunctionUrl}?cid=${configurationId}&qid=${quotationId}`,
  }, {
    headers: { 'qfs-api-key': process.env.QfsApiKey }
  });

  return {
    statusCode: qfsRes.status,
    statusText: qfsRes.statusText,
    body: JSON.stringify({ message: qfsRes.data?.message || 'QFS job started' }),
  };
}

async function getQuotationFilesExtended(accessToken, quotationId) {
  const quotationFilesWithNames = [];
  const quotationFiles = await axios.get(
    `${ELFSQUAD_API_BASE_URL}/data/1/QuotationFiles?\$filter=quotationId eq ${quotationId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  for (const file of quotationFiles.data.value) {
    const fileDetails = await axios.get(
      `${ELFSQUAD_API_BASE_URL}/data/1/FileEntities/${file.fileId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
    quotationFilesWithNames.push({
      id: file.fileId,
      name: fileDetails.data.name
    });
  }

  return quotationFilesWithNames;
}
