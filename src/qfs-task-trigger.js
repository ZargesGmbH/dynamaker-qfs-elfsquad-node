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

  if (!quotationId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing quotationId in request body' }),
    };
  }

  // Get Elfsquad access token using OpenID client credentials
  const accessToken = await getElfsquadToken();

  let configurationIds;
  if (configurationId) {
    // Use provided configurationId if available in payload.
    const isValidConfiguration = await checkConfigurationBelongsToQuotation(accessToken, configurationId, quotationId);
    if (!isValidConfiguration) {
      console.log("QuotationId and configurationId don't match.");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "QuotationId and configurationId don't match." }),
      };
    }
    configurationIds = new Set([configurationId]);
  } else {
    // Get configurationIds from quotation if not provided in payload.
    configurationIds = await getConfigurationIdsFromQuotation(accessToken, quotationId);
  }

  const errors = [];
  for (const configurationId of configurationIds) {
    const result = await triggerQfsJobForConfiguration(accessToken, quotationId, configurationId);

    if (result.statusCode >= 400) {
      errors.push(`Failed to trigger QFS job for configuration ${configurationId}: ${result.message}`);
    }
  }

  if (errors.length > 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error triggering PDF generation', errors }),
    };
  }

  return {
    statusCode: 200,
    body: 'QFS job(s) successfully started.',
  };
}

async function checkConfigurationBelongsToQuotation(accessToken, configurationId, quotationId) {
  const configurationIds = await getConfigurationIdsFromQuotation(accessToken, quotationId);
  return configurationIds.has(configurationId);
}

async function getConfigurationIdsFromQuotation(accessToken, quotationId) {
  const configurationIds = new Set();
  const configurationsRes = await axios.get(
    `${ELFSQUAD_API_BASE_URL}/data/1/quotationlines?\$filter=quotationId eq ${quotationId}&\$select=configurationId`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );
  configurationsRes.data.value.forEach(item => {
    if (item.configurationId) {
      configurationIds.add(item.configurationId);
    }
  });

  return configurationIds;
}

async function triggerQfsJobForConfiguration(accessToken, quotationId, configurationId) {
  // Fetch configuration details from Elfsquad
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
      console.error(`Configuration ${configurationId} not found.`);
      return {
        statusCode: error.response.status,
        message: `Configuration ${configurationId} not found.`,
      };
    } else {
      console.error('Error fetching configuration from Elfsquad:', error);
      return {
        statusCode: 500,
        message: `Error fetching configuration ${configurationId}: ${JSON.stringify(error)}`,
      };
    }
  }
  const configuration = configRes.data;

  // Check configuration model ID
  if (configuration.configurationModelId !== process.env.ElfsquadConfiguratorModelId) {
    console.error(`Configuration ${configurationId} with model ID ${configuration.configurationModelId} does not match` +
      ` expected ${process.env.ElfsquadConfiguratorModelId}. Skipping.`);
    return {
      statusCode: 400,
      message: "Model ID does not match. Flow stopped."
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
    message: qfsRes.statusText,
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
