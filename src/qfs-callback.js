import axios from 'axios';
import { getElfsquadToken } from "./services/elfsquadService.js";
import fs from "fs";
import FormData from "form-data";

const ELFSQUAD_API_BASE_URL = "https://api.elfsquad.io";

export const handler = async (event) => {
  const queryParams = event.queryStringParameters;

  if (queryParams?.success === 'false') {
    console.error('QFS job failed:', queryParams.message);
    return;
  }

  const configurationId = queryParams?.cid;
  const quotationId = queryParams?.qid;
  if (!configurationId || !quotationId) {
    console.error('Missing configurationId and/or quotationId in query parameters.');
    return;
  }

  const accessToken = await getElfsquadToken();
  const configuration = await axios.get(
    `${ELFSQUAD_API_BASE_URL}/data/1/Configurations/${configurationId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (!configuration.data) {
    console.error('Configuration not found for ID:', configurationId);
    return;
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
    const response = await axios.post(
      `${ELFSQUAD_API_BASE_URL}/quotation/1/quotations/${quotationId}/addfile`,
      form,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...form.getHeaders(),
        },
      }
    );
    console.log('Upload successful. Response:', response.data);
  } catch (error) {
    console.error('Upload failed:', error);
  }
}
