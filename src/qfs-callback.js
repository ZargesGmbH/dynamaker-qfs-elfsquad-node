import axios from 'axios';
import { getElfsquadApi, getAll, addQuotationLog } from "./services/elfsquadService.js";
import fs from "fs";
import FormData from "form-data";

const ELFSQUAD_API_BASE_URL = "https://api.elfsquad.io";

export const handler = async (event) => {
  const queryParams = event.queryStringParameters;
  const configurationId = queryParams?.cid;
  const quotationId = queryParams?.qid;

  if (queryParams?.success === 'false') {
    const message = getFailureMessage(event);
    console.error('QFS job failed:', message);
    if (quotationId) {
      try {
        const elfsquadApi = await getElfsquadApi();
        await addQuotationLog(elfsquadApi, quotationId, `QFS job failed for configuration ${configurationId}: ${message}`);
      } catch (error) {
        console.error('Failed to write failure message to quotation log:', error);
      }
    }
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'QFS job failed', details: message })
    };
  }

  if (!configurationId || !quotationId) {
    console.error('Missing configurationId and/or quotationId in query parameters.');
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing configurationId and/or quotationId in query parameters.' })
    };
  }

  // Get Elfsquad Api instance
  const elfsquadApi = await getElfsquadApi();
  const configuration = await elfsquadApi.get(`/data/1/Configurations/${configurationId}`);

  if (!configuration.data) {
    console.error('Configuration not found for ID:', configurationId);
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Configuration not found', configurationId })
    };
  }

  // Save callback body as PDF file
  const fileName = `${configuration.data.code}.pdf`;
  const isBase64 = /^[A-Za-z0-9+/=]+$/.test(event.body);
  if (isBase64) {
    fs.writeFileSync(`/tmp/${fileName}`, event.body, { encoding: 'base64' });
  } else {
    fs.writeFileSync(`/tmp/${fileName}`, event.body);
  }

  // Upload PDF to Elfsquad
  const form = new FormData();
  form.append('file', fs.createReadStream(`/tmp/${fileName}`));
  try {
    const response = await elfsquadApi.post(`/quotation/1/quotations/${quotationId}/addfile`, form);
    console.log('Upload successful. Response:', response.data);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Upload successful', response: response.data })
    };
  } catch (error) {
    console.error('Upload failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Upload failed', error: error?.message || error })
    };
  }
}

/**
 * Extract the failure message from the callback request. On failure, QFS sends a JSON body
 * containing a message property (not a query parameter).
 * @param event
 */
function getFailureMessage(event) {
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body;
  try {
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    return body?.message ?? 'No failure message provided.';
  } catch {
    return rawBody || 'No failure message provided.';
  }
}