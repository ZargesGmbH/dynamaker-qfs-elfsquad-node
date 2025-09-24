const axios = require('axios');

exports.handler = async (event) => {
  // Parse callback payload
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { success, file, message, quotationId } = body;

  if (!success) {
    return { statusCode: 500, body: JSON.stringify({ error: message || 'QFS job failed' }) };
  }

  // Attach PDF to Elfsquad quotation
  await axios.post(`https://api.elfsquad.io/quotations/${quotationId}/addfile`, {
    file: file.body,
    fileName: file.fileName || `drawing_${new Date().toISOString()}.pdf`
  }, {
    headers: { 'Authorization': `Bearer ${process.env.ELFSQUAD_API_KEY}` }
  });

  return { statusCode: 200, body: JSON.stringify({ message: 'PDF attached to quotation' }) };
};
