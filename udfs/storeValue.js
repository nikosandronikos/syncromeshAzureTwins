/* eslint-disable no-unused-vars, no-undef */

function process(telemetry, executionContext) {
    try {
        setSensorValue(telemetry.SensorId, 'Light', {hello: 'world'});
        // Log SensorId and Message
        log(`Sensor ID: ${telemetry.SensorId}. `);
        log(`Sensor value: ${JSON.stringify(telemetry.Message)}.`);

        // Get sensor metadata
        const sensor = getSensorMetadata(telemetry.SensorId);

        // Retrieve the sensor reading
        const parseReading = JSON.parse(telemetry.Message);

        // Set the sensor reading as the current value for the sensor.
        setSensorValue(telemetry.SensorId, sensor.DataType, parseReading.SensorValue);

    } catch (error) {
        setSensorValue(telemetry.SensorId, 'Light', {error: error.name, message: error.message});
        log(`An error has occurred processing the UDF Error: ${error.name} Message ${error.message}.`);
    }
}


