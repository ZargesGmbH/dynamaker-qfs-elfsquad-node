import axios from 'axios';
import { getElfsquadApi, getAll, addQuotationLog } from "./services/elfsquadService.js";
import fs from "fs";
import FormData from "form-data";

const ELFSQUAD_API_BASE_URL = "https://api.elfsquad.io";

export const handler = async (event) => {
  const queryParams = event.queryStringParameters;

  if (queryParams?.success === 'false') {
    console.error('QFS job failed:', queryParams.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'QFS job failed', details: queryParams.message })
    };
  }

  const configurationId = queryParams?.cid;
  const quotationId = queryParams?.qid;
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