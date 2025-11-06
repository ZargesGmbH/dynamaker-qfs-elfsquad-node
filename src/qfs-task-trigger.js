import { getElfsquadApi, getAll, addQuotationLog, clearQuotationLogs } from "./services/elfsquadService.js";
import axios from "axios";

const QFS_API_JOBS_ENDPOINT = "https://qfs.dynamaker.com/jobs";
const QFS_TASK_NAME = process.env.QfsTaskName || "generate-pdf";
const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_CONFIGURATION_ADDED = 'quotation.configurationadded';
const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE = 'quotation.revisionmade';
const ELFSQUAD_WEBHOOK_TOPICS = [
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_CONFIGURATION_ADDED,
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE,
];

export const handler = async (event) => {
  // Parse webhook payload
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const quotationId = ELFSQUAD_WEBHOOK_TOPICS.includes(body.Topic) ? body.Content?.quotationId : body?.quotationId;
  const configurationId = (body.Topic === ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_CONFIGURATION_ADDED) ? body.Content?.configurationId : body?.configurationId;

  if (!quotationId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing quotationId in request body' }),
    };
  }

  // Get Elfsquad Api instance
  const elfsquadApi = await getElfsquadApi();

  // If invoked by the 'quotation.revisionmade' webhook, remove the previous PDF files first
  if (body.Topic === ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE) {
    const sourceQuotationId = body.Content?.sourceQuotationId;
    const sourceQuotationConfigurationIds = await getConfigurationIdsFromQuotation(elfsquadApi, sourceQuotationId);

    for (const configId of sourceQuotationConfigurationIds) {
      const configuration = await getConfigurationData(elfsquadApi, configId);
      await removeConfigurationFile(elfsquadApi, quotationId, `${configuration.code}.pdf`);
    }
    await clearQuotationLogs(elfsquadApi, quotationId);
  }

  // Get configurationIds for which we want to trigger the QFS job
  let configurationIds;
  if (configurationId) {
    // Use provided configurationId if available in payload.
    const isValidConfiguration = await checkConfigurationBelongsToQuotation(elfsquadApi, configurationId, quotationId);
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
    configurationIds = await getConfigurationIdsFromQuotation(elfsquadApi, quotationId);
  }

  const errors = [];
  for (const configurationId of configurationIds) {
    const result = await triggerQfsJobForConfiguration(elfsquadApi, quotationId, configurationId);

    if (result.statusCode >= 400) {
      const msg = `Failed to trigger QFS job for configuration ${configurationId}: ${result.message}`;
      await addQuotationLog(elfsquadApi, quotationId, msg);
      errors.push(msg);
    } else {
      await addQuotationLog(elfsquadApi, quotationId, `Requested file generation for configuration ${result.configurationCode}`);
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

async function checkConfigurationBelongsToQuotation(elfsquadApi, configurationId, quotationId) {
  const configurationIds = await getConfigurationIdsFromQuotation(elfsquadApi, quotationId);
  return configurationIds.has(configurationId);
}

async function getConfigurationIdsFromQuotation(elfsquadApi, quotationId) {
  const configurationIds = new Set();
  const configurationsRes = await getAll(
    elfsquadApi,
    `/data/1/quotationlines?\$filter=quotationId eq ${quotationId}&\$select=configurationId`,
  );
  configurationsRes.forEach(item => {
    if (item.configurationId) {
      configurationIds.add(item.configurationId);
    }
  });

  return configurationIds;
}

/**
 * Trigger QFS job for a specific configuration.
 * @param elfsquadApi
 * @param quotationId
 * @param configurationId
 */
async function triggerQfsJobForConfiguration(elfsquadApi, quotationId, configurationId) {
  const configuration = await getConfigurationData(elfsquadApi, configurationId);

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
  await removeConfigurationFile(elfsquadApi, quotationId, `${configuration.code}.pdf`);

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
    configurationCode: configuration.code,
  };
}

/**
 * Fetch configuration data from Elfsquad.
 * @param elfsquadApi
 * @param configurationId
 */
async function getConfigurationData(elfsquadApi, configurationId) {
  let configuration;
  try {
    configuration = await elfsquadApi.get(`/configurator/1/configurator/open/${configurationId}`);
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

  return configuration.data;
}

/**
 * Remove a file from a quotation.
 * @param elfsquadApi
 * @param quotationId
 * @param fileName
 */
async function removeConfigurationFile(elfsquadApi, quotationId, fileName) {
  const existingFiles = await getQuotationFilesExtended(elfsquadApi, quotationId);
  const existingDrawingFile = existingFiles.find(f => f.name === fileName);
  if (existingDrawingFile) {
    try {
      await elfsquadApi.delete(`/api/2/files/entities/${existingDrawingFile.id}`);
      await addQuotationLog(elfsquadApi, quotationId, `File ${fileName} deleted.`);
      console.log('Delete successful.');
    } catch (error) {
      await addQuotationLog(elfsquadApi, quotationId, `Failed to delete file ${fileName}.`);
      console.error('Delete failed:', error);
    }
  }
}

/**
 * Get quotation file IDs and file names.
 * @param elfsquadApi
 * @param quotationId
 */
async function getQuotationFilesExtended(elfsquadApi, quotationId) {
  const quotationFilesWithNames = [];
  const quotationFiles = await getAll(elfsquadApi, `/data/1/QuotationFiles?\$filter=quotationId eq ${quotationId}`);

  for (const file of quotationFiles) {
    const fileDetails = await elfsquadApi.get(`/data/1/FileEntities/${file.fileId}`);
    quotationFilesWithNames.push({
      id: file.fileId,
      name: fileDetails.data.name
    });
  }

  return quotationFilesWithNames;
}