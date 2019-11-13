//require('dotenv').config()
const axios = require('axios');
const AuthenticationContext = require('adal-node').AuthenticationContext;

const { clientFromConnectionString } = require('azure-iot-device-mqtt');
const { Message } = require('azure-iot-device');

const tenantId = 'e2c67d4d-97b9-4ad4-9ded-2c029c85e115';

// Cognian test app registration
//const appId = '7b435617-6183-4fee-a9de-4e1de05fd714';
//const secret = '3oK/wW_34cBPLnyhbSJwzANAYBndj7?.';

// ADAL auth test app registration
//const appId = 'b87380df-dbf1-40ab-bbdc-f3403e34c64d';
//const secret = 'bi3k8Mq=J_KLoO@YH@MBog68?x?s9uUX';

// nikosdigitaltwins yammer
const appId = 'cd505e2d-d02b-45b4-93e9-37ae18098db0';
const secret = 'Gu-IdtbWTZ-jh1/A2M7BHIE6B_PG5XrJ';
const objectId = 'df1b941a-59f4-4329-b6f7-88055b8d12d9';

const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
//const authUrl = `https://login.microsoftonline.com/${tenantId}`
//const authUrl = `https://login.microsoftonline.com/Cognian.onmicrosoft.com`
const apiUrl = 'https://nikosdigitaltwins.australiaeast.azuresmartspaces.net/management/api/v1.0';

const twinResource = '0b07f429-9f4b-4714-9392-cc5e8e80c8b0';

function printResultFor(op) {
    return function printResult(err, res) {
        if (err) console.log(op + ' error: ' + err.toString());
        if (res) console.log(op + ' status: ' + res.constructor.name);
    };
}

async function getTypes(api) {
    try {
        const response = await api.get('/types');

        for (const type of response.data) {
            console.log(type.name, type.category);
        }

    } catch (error) {
        console.error(error.toString());
    }
}

async function getSpaces(api) {
    try {
        const response = await api.get('/spaces');

        console.log('Spaces:', response.data);
    } catch (error) {
        console.error(error.toString());
    }
}

async function createSpaces(api) {
    try {
        const response = await api.post(
            '/spaces',
            {
                "name": "dungeon",
                "description": "Super secret hidden dungeon of doom",
                "type": "Room",
                parentSpaceId: 'a4640512-4c01-435b-8f92-a88a946c9029',
                //"parentSpaceId": "00000000-0000-0000-0000-000000000000",
                //"location": {
                //    "longitude": 151.1230181,
                //    "latitude": -33.7769934,
                //},
                //"timeZoneId": 255
            }
        );

        console.info('Created space: ', response.data);

    } catch (error) {
        console.error(error.toString());
    }
}

async function getRoleAssignments(api) {
    try {
        const response = await api.get('/roleassignments', { params: { path: '/' }});

        console.log('role assignments', response.data);

    } catch (error) {
        console.error(error.toString());
    }
}

async function setRoleAssignment(api) {
    try {
        const response = await api.post(
            '/roleassignments',
            {
                roleId: "98e44ad7-28d4-4007-853b-b9968ad132d1",
                objectId: "b87380df-dbf1-40ab-bbdc-f3403e34c64d",
                objectIdType: "ServicePrincipalId",
                tenantId: "e2c67d4d-97b9-4ad4-9ded-2c029c85e115",
                path: `/`
            }
        );

        console.log('setRoleAssignment', response.data);
    } catch (error) {
        console.error(error.toString());
    }
}

async function getConnectionString(api, deviceId) {
    try {
        const response = await api.get(
            `devices/${deviceId}`, { params: { includes: 'ConnectionString' } }
        );

        return response.data.connectionString;
    } catch (error) {
        console.error(error.toString());
    }
}

function testPayload(connectionString) {
    console.log(connectionString);
    const client = clientFromConnectionString(connectionString);

    client.open( err => {
        if (err) {
            console.log('Error', err);
            return;
        }

        console.log('Connected');
        const message = new Message(
            JSON.stringify({CarbonDioxide: 666})
        );
        message.properties.add('DigitalTwins-Telemetry', '1.0');
        message.properties.add('DigitalTwins-SensorHardwareId', 'SAMPLE_SENSOR_CARBONDIOXIDE');
        //message.properties.add('CreationTimeUtc', Date().toString());

        client.sendEvent(message, printResultFor('send'));

        client.close();
    });
}

function getToken() {
    // Create credential object helper
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

    context.acquireTokenWithClientCredentials(
        clientCredentials.resource,
        clientCredentials.clientId,
        clientCredentials.clientSecret,
        async (error, tokenResponse) => {
            if (error) {
                console.error(`Error: ${error.stack}`);
            } else {
                console.log('token', tokenResponse.accessToken);

                const api = axios.create({
                    baseURL: apiUrl,
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.accessToken}`
                    },
                    responseType: 'json'
                });

                // Create Bearer Token for Headers
                //let appToken = `Bearer ${tokenResponse.accessToken}`;
                //let appToken = `Bearer ${swaggerToken}`;
                await getTypes(api);
                await getRoleAssignments(api);
                //await createSpaces(api);
                //await setRoleAssignment(api);
                await getSpaces(api);

                await testPayload(
                    await getConnectionString(api, 'b422df95-15a7-45a4-931f-8ef9f4923d60')
                );
            }
        }
    );
}

getToken();

