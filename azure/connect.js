const axios = require('axios');
const AuthenticationContext = require('adal-node').AuthenticationContext;

async function createConnection(apiUrl, appId, authUrl, secret, twinResource) {
    const clientCredentials = {
        authorityUrl : authUrl,
        clientId     : appId,
        clientSecret : secret,
        resource     : twinResource
    };

    // Need to pass '' or null for version to override the default of 1.0 which does
    // not grant access (though does give a token) as the audience has 'spn:' prepended.
    // See https://github.com/AzureAD/azure-activedirectory-library-for-nodejs/issues/128
    const context = new AuthenticationContext(clientCredentials.authorityUrl,true,null,null);

    return new Promise( (resolve, reject) => {
        context.acquireTokenWithClientCredentials(
            clientCredentials.resource,
            clientCredentials.clientId,
            clientCredentials.clientSecret,
            (error, tokenResponse) => {
                if (error) {
                    reject(error);
                } else {
                    const api = axios.create({
                        baseURL: apiUrl,
                        headers: {
                            'Authorization': `Bearer ${tokenResponse.accessToken}`
                        },
                        responseType: 'json'
                    });

                    resolve(api);
                }
            }
        );
    });
}

module.exports = { createConnection };
