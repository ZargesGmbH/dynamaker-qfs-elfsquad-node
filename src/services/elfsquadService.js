import axios from "axios";
import qs from "querystring";

const ELFSQUAD_API_LOGIN_ENDPOINT = "https://login.elfsquad.io/oauth2/token";
const ELFSQUAD_API_BASE_URL = "https://api.elfsquad.io";
const ELFSQUAD_GRANT_TYPE = "client_credentials";
const ELFSQUAD_SCOPE = "Elfskot.Api";
const DEVELOPER_LOGS_QUOTATION_PROPERTY_ID = "c9c8532e-3593-4967-d3fe-08de1b88cd0c";

export async function getElfsquadApi() {
  const token = await getElfsquadToken();
  const elfsquadApi = axios.create({
    baseURL: ELFSQUAD_API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return elfsquadApi;
}

export async function getAll(elfsquadApi, url) {
  let nextUrl = url;
  let result = [];
  while (nextUrl) {
    let response = await elfsquadApi.get(nextUrl);
    result.push(...response.data.value);
    nextUrl = response.data["@odata.nextLink"];
  }
  return result;
}

export async function clearQuotationLogs(elfsquadApi, quotationId) {
  await forceRefreshElfsquadUI(elfsquadApi, quotationId, "", true);
}

export async function addQuotationLog(elfsquadApi, quotationId, logMessage) {
  await forceRefreshElfsquadUI(elfsquadApi, quotationId, logMessage);
}

async function forceRefreshElfsquadUI(elfsquadApi, quotationId, logMessage = "", clearLogs = false) {
  const quotationDeveloperLogsProperty = await getQuotationProperty(elfsquadApi, quotationId, DEVELOPER_LOGS_QUOTATION_PROPERTY_ID);
  const existingLogs = quotationDeveloperLogsProperty?.value ?? "";

  let newLogsValue = "";
  if (clearLogs) {
    // do nothing, just clear the logs
  } else {
    newLogsValue = existingLogs;
    if (logMessage) {
      const timestamp = new Date().toLocaleString('en-GB', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(',', '');
      newLogsValue = `${timestamp} UTC: ${logMessage}\n` + existingLogs;
    }
  }

  if (quotationDeveloperLogsProperty) {
    await elfsquadApi.delete(`/data/1/QuotationPropertyValues(${quotationDeveloperLogsProperty.id})`);
  }

  await elfsquadApi.post(`/data/1/QuotationPropertyValues`, {
    entityId: quotationId,
    entityPropertyId: DEVELOPER_LOGS_QUOTATION_PROPERTY_ID,
    value: newLogsValue.toString()
  });
}

async function getQuotationProperty(elfsquadApi, quotationId, propertyId) {
  const values = await getAll(elfsquadApi, `/data/1/QuotationPropertyValues?$filter=entityId eq ${quotationId} and entityPropertyId eq ${propertyId}`);
  return values[0];
}

async function getElfsquadToken() {
  const requestParams = {
    grant_type: ELFSQUAD_GRANT_TYPE,
    client_id: process.env.ElfsquadClientId,
    client_secret: process.env.ElfsquadClientSecret,
    scope: ELFSQUAD_SCOPE,
  };

  const tokenRes = await axios.post(
    ELFSQUAD_API_LOGIN_ENDPOINT,
    qs.stringify(requestParams),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  return tokenRes.data.access_token;
}