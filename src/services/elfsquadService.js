import axios from "axios";
import qs from "querystring";

const ELFSQUAD_API_LOGIN_ENDPOINT = "https://login.elfsquad.io/oauth2/token";
const ELFSQUAD_GRANT_TYPE = "client_credentials";
const ELFSQUAD_SCOPE = "Elfskot.Api";

export async function getElfsquadToken() {
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
