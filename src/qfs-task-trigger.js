import { getElfsquadApi, getAll, addQuotationLog, clearQuotationLogs, getQuotationLanguage } from "./services/elfsquadService.js";
import axios from "axios";

// A "job service" is anything that speaks the DynaMaker QFS job protocol: it accepts
// POST { configuration, callbackUrl, language, … } and later POSTs the finished PDF (or
// ?success=false with a JSON message) to that callbackUrl — see qfs-callback.js, which
// is job-service-agnostic. DynaMaker QFS (https://qfs.dynamaker.com/jobs) is one such
// service; any other implementation of the same protocol works the same way.
//
// `language` is the quotation's language ("Angebotssprache"), passed through verbatim from
// Elfsquad's Quotation.languageIso as a 2-letter ISO 639-1 code such as "de", so the service
// can render the drawing in the customer's language. It is omitted when the quotation has
// none; a service receiving no language should fall back to its own default. Compare it
// case-insensitively — Elfsquad is not consistent about casing across its entities.
//
// JobServicesByModelId configures which service renders which Elfsquad configurator
// model: a JSON array in which every entry carries its own destination, so different
// models can be routed to different services. Configurations whose model ID is not
// listed are skipped. See .env.example for the field reference.
const MODEL_ID_TO_SERVICE = buildServicesByModelId(process.env.JobServicesByModelId);

function buildServicesByModelId(raw) {
  const servicesByModelId = new Map();
  for (const service of parseJobServices(raw)) {
    for (const modelId of service.modelIds) {
      // Two entries claiming the same model would make the destination depend on array
      // order, so reject it instead of silently picking one.
      if (servicesByModelId.has(modelId)) {
        throw new Error(`JobServicesByModelId lists model ID ${modelId} more than once.`);
      }
      servicesByModelId.set(modelId, service);
    }
  }
  return servicesByModelId;
}

function parseJobServices(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`JobServicesByModelId is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('JobServicesByModelId must be a JSON array');
  for (const service of parsed) {
    if (!service || typeof service !== 'object' || !Array.isArray(service.modelIds) || service.modelIds.length === 0) {
      throw new Error(`JobServicesByModelId entry missing a non-empty modelIds array: ${JSON.stringify(service)}`);
    }
    if (!service.url || !service.apiKey) {
      throw new Error(`JobServicesByModelId entry for ${service.modelIds.join(', ')} is missing url or apiKey.`);
    }
  }
  return parsed;
}

const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_CONFIGURATION_ADDED = 'quotation.configurationadded';
const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE = 'quotation.revisionmade';
const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_COPIED = 'quotation.copied';
const ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REQUESTED = 'quotation.requested';
const ELFSQUAD_WEBHOOK_TOPICS = [
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_CONFIGURATION_ADDED,
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE,
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_COPIED,
  ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REQUESTED,
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

  // If invoked by the 'quotation.revisionmade' or 'quotation.copied' webhook, remove the previous PDF files first
  if (body.Topic === ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_REVISION_MADE || body.Topic === ELFSQUAD_WEBHOOK_TOPIC_QUOTATION_COPIED) {
    const sourceQuotationId = body.Content?.sourceQuotationId;
    const sourceQuotationConfigurationIds = await getConfigurationIdsFromQuotation(elfsquadApi, sourceQuotationId);

    for (const configId of sourceQuotationConfigurationIds) {
      const configuration = await getConfigurationData(elfsquadApi, configId);
      await removeConfigurationFile(elfsquadApi, quotationId, `${configuration.code}.pdf`);
    }
    await clearQuotationLogs(elfsquadApi, quotationId);
  }

  // Get configurationIds for which we want to trigger the render job
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

  // The quotation's language ("Angebotssprache"), fetched once: it belongs to the quotation,
  // not to the individual configuration. A language we cannot determine must never block PDF
  // generation — the job then goes out without it and the service uses its own default.
  let language;
  try {
    language = await getQuotationLanguage(elfsquadApi, quotationId);
    if (!language) {
      console.warn(`Quotation ${quotationId} has no languageIso; sending the job without a language.`);
    }
  } catch (error) {
    console.error(`Failed to read the language of quotation ${quotationId}:`, error);
    try {
      await addQuotationLog(elfsquadApi, quotationId,
        "Could not read the quotation language; the drawing is rendered in the job service's default language.");
    } catch (logError) {
      console.error('Could not write the language warning to the quotation log:', logError);
    }
  }

  const errors = [];
  let started = 0;
  let skipped = 0;
  for (const configurationId of configurationIds) {
    const result = await triggerRenderJobForConfiguration(elfsquadApi, quotationId, configurationId, language);

    if (result.statusCode >= 400) {
      const msg = `Failed to trigger render job for configuration ${configurationId}: ${result.message}`;
      await addQuotationLog(elfsquadApi, quotationId, msg);
      errors.push(msg);
    } else if (result.configurationCode) {
      await addQuotationLog(elfsquadApi, quotationId, `Requested file generation for configuration ${result.configurationCode}`);
      started++;
    } else {
      skipped++;
    }
  }

  if (errors.length > 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error triggering PDF generation', errors }),
    };
  }

  const parts = [];
  if (started > 0) parts.push(`${started} render job(s) successfully started`);
  if (skipped > 0) parts.push(`${skipped} configuration(s) skipped (unsupported model ID)`);

  return {
    statusCode: 200,
    body: parts.join(', ') + '.',
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
 * Trigger the job service responsible for a specific configuration's model ID (see
 * MODEL_ID_TO_SERVICE above). Same job/callback shape regardless of which service is
 * targeted — DynaMaker QFS or any other compatible service.
 * @param elfsquadApi
 * @param quotationId
 * @param configurationId
 * @param language Quotation language, e.g. "de"; omitted from the payload when falsy.
 */
async function triggerRenderJobForConfiguration(elfsquadApi, quotationId, configurationId, language) {
  const configuration = await getConfigurationData(elfsquadApi, configurationId);

  // Look up the job service responsible for this configuration's model ID
  const service = MODEL_ID_TO_SERVICE.get(configuration.configurationModelId);
  if (!service) {
    console.log(`Configuration ${configurationId} with model ID ${configuration.configurationModelId} is not in the` +
      ` list of supported model IDs (${[...MODEL_ID_TO_SERVICE.keys()].join(", ") || "none configured"}). Skipping.`);
    return {
      statusCode: 200,
      message: "Model ID not supported. Skipped."
    };
  }

  // If a drawing already exists for this configuration, delete it first.
  await removeConfigurationFile(elfsquadApi, quotationId, `${configuration.code}.pdf`);

  // Start the job. `language` is only present when the quotation has one. applicationId/task/
  // environment are DynaMaker-specific parameters — only sent when the service entry carries
  // them, so a non-DynaMaker service just gets { configuration, callbackUrl, language }.
  const payload = {
    configuration,
    callbackUrl: `${process.env.QfsCallbackFunctionUrl}?cid=${configurationId}&qid=${quotationId}`,
  };
  if (language) payload.language = language;
  if (service.applicationId) {
    payload.applicationId = service.applicationId;
    payload.task = service.task || 'generate-pdf';
  }
  if (service.environment) payload.environment = service.environment;

  const jobRes = await axios.post(service.url, payload, {
    headers: { [service.apiKeyHeader || 'qfs-api-key']: service.apiKey },
  });

  return {
    statusCode: jobRes.status,
    message: jobRes.statusText,
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
      throw new Error(`Configuration ${configurationId} not found.`);
    } else {
      throw new Error(`Error fetching configuration ${configurationId} from Elfsquad: ${JSON.stringify(error)}`);
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
