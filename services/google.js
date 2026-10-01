var { OAuth2Client } = require('google-auth-library');

function createGoogleVerifier(clientId) {
  var client = new OAuth2Client();
  return {
    verify: async function (idToken) {
      // Checks the signature, issuer, audience and expiry.
      var ticket = await client.verifyIdToken({ idToken: idToken, audience: clientId });
      var payload = ticket.getPayload();
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name,
      };
    },
  };
}

module.exports = { createGoogleVerifier };
