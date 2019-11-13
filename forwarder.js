require('dotenv').config()
const util = require('util')

const { clientFromConnectionString } = require('azure-iot-device-mqtt');
const { Message } = require('azure-iot-device');

const { createConnection } = require('./azure/connect');
const { getDevices } = require('./azure/graph');

const { IndraClient } = require('./indraClient/IndraClient');
const { cmdTypes } = require('./indraClient/cmdTypes');

const log = require('./utils/logging').log.child({module: 'forwarder'});

function printResultFor(op) {
    return function printResult(err, res) {
        if (err) console.log(`${op} error: ${err.toString()}`);
        if (res) console.log(`${op} status: ${res.constructor.name}`);
    };
}

async function createMqttConnection(connectionString) {
    log.debug(connectionString);
    const client = clientFromConnectionString(connectionString);

    return new Promise( (resolve, reject) => {
        client.open( err => {
            if (err) reject(err);

            log.debug(`MQTT Connection ${connectionString} established`);
            resolve(client);
        })
    });
}

function createPayload(sensorId, data) {
    const message = new Message(
        JSON.stringify(data)
    );
    message.properties.add('DigitalTwins-Telemetry', '1.0');
    message.properties.add('DigitalTwins-SensorHardwareId', sensorId);
    message.properties.add('CreationTimeUtc', (new Date()).toISOString());
    //message.properties.add('x-ms-client-request-id'

    log.debug('payload:', sensorId, data);

    return message;
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

async function main() {

    const mqttConnections = new Map();

    try {
        const api = await createConnection(
            process.env.API_URL,
            process.env.APP_ID,
            process.env.AUTH_URL,
            process.env.SECRET,
            process.env.TWIN_RESOURCE
        );

        const devices = await getDevices(api);

        let counter = 0;

        const test = false;

        if (test) {
            const deviceId = 'b43e28a6-55ad-42b1-9d18-5371c3fdb628';
            const connectionString = await getConnectionString(api, deviceId);

            const client = await createMqttConnection(connectionString);
            mqttConnections.set('ea4cdec9.0', client);

            //const sensorId = 'd3d4c335-9a9a-4402-8e2d-290e1c998235';
            const sensorId = 'ea4cdec9.0';
            //const sensorId = 'ea4cdec9.0';
            const message = createPayload(sensorId, { SensorValue: "101" });

            client.sendEvent(message, printResultFor('send'));
        } else {
            const indraClient = new IndraClient(process.env.GW_ADDR, process.env.GW_ZMQ_SUB, process.env.GW_ZMQ_CMD);

            // Open up an MQTT connection per device
            for (const device of devices) {
                // eslint-disable-next-line no-await-in-loop
                const connectionString = await getConnectionString(api, device.id);

                // eslint-disable-next-line no-await-in-loop
                const client = await createMqttConnection(connectionString);
                mqttConnections.set(device.hardwareId, client);

                log.debug(`${++counter} of ${devices.length}`);
            }

            console.log([...mqttConnections.keys()]);

            indraClient.onCommand(cmdTypes.lightStatus, (id, cmd) => {
                const client = mqttConnections.get(cmd.longAddr.toString(16));

                if (!client) {
                    log.error(`No client for ${cmd.longAddr.toString(16)}`);
                    return;
                }

                const sensorId = `${cmd.longAddr.toString(16)}.${cmd.devNum}`;

                const message = createPayload(sensorId, {SensorValue: cmd.values[0]});
                client.sendEvent(message, printResultFor('send'));
            });

            await indraClient.connect();
        }

    } catch (err) {
        if (typeof err.toJSON === 'function') log.error(err.toJSON());
        else log.error(err);
    }

    process.on('SIGINT', () => {
        console.log('\nexiting');

        for (const client of mqttConnections.values()) {
            client.close();
        }

        process.exit(0);
    });

}

main();
