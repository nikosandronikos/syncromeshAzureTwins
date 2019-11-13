const fs = require('fs');
const FormData = require('form-data');

async function provisionSpace(twinCtxt, parentId, space) {
    console.log(`provisioning space ${space.name}`);

    const res = await twinCtxt.api.post('/spaces', {
        name: space.name,
        type: space.subType,
        parentSpaceId: parentId
    });

    console.log(res.status, res.data);

    return res.data;
}

async function createTypeIfNeeded(twinCtxt, category, type) {
    console.log(`Checking ${category} ${type}`);

    if (twinCtxt.typesMap.has(type)) {
        console.log('  ...exists');

    } else {
        console.log(` ...creating`);

        let res = null;

        try {
            res = await twinCtxt.api.post('/types', {
                category,
                name: type,
                disabled: false,
                spaceId: twinCtxt.rootSpace,
            });
        } catch(err) {
            console.log(res);
            console.log('--------------------------');
            console.log(err.toJSON());
            throw err;
        }

        console.log(res.data);
        twinCtxt.typesMap.set(type, res.data);
    }
}

async function provisionDevice(twinCtxt, parentId, device) {

    if (!device.children || device.children.length < 1) {
        console.log(`Skipping Device ${device.name}`);
        return null;
    }

    console.log(`provisioning device ${device.name}`);

    const type = device.subType.replace(/ /ug, '');

    await createTypeIfNeeded(twinCtxt, 'DeviceType', type);

    let res = null;

    try {
        let name = device.name, address = device.address.toString(16);

        res = await twinCtxt.api.get('/devices', { params: { names: device.name }});

        if (res.data && res.data.length > 0) {

            const nDupes = (twinCtxt.dupesMap.get(device.name) || 0) + 1;

            twinCtxt.dupesMap.set(device.name, nDupes);

            name = `${device.name} (${nDupes})`;
            address = `${address} (${nDupes})`;
            // FIXME: Duplicate devices are likely to cause problems with
            // sending sensor updates because we look up the device based
            // on the longAddr of the sensor and can't know which of the
            // duplicates it is.
            console.log(`  device is duplicated. Renaming to ${name}`);
        }

        res = await twinCtxt.api.post('/devices', {
            name,
            type,
            hardwareId: address,
            spaceId: parentId
        });

    } catch(err) {
        console.log(res);
        console.log('--------------------------');
        console.log(err.toJSON());
        throw err;
    }

    console.log(res.status, res.data);

    return res.data;
}

async function provisionSensor(twinCtxt, parentId, sensor) {
    console.log(`provisioning sensor ${sensor.name}`);

    let dataType = null;

    if (sensor.type === 'Sensor') {
        // Only supprt one type of sensor currently
        switch(sensor.subType) {
            case 'Mech Sensor':
            case 'PIR Sensor':
            case 'V2 PIR Sensor':
            case 'V2 Lux Sensor':
                dataType = 'Motion';
                break;
            default: throw new Error(`Sensor type ${sensor.subType} has no associated data type`);
        }
    } else if (sensor.type === 'Lamp') {
        dataType = 'Light';
    }

    const type = sensor.subType.replace(/ /ug, '');

    await createTypeIfNeeded(twinCtxt, 'SensorType', type);

    let res = null;

    const hardwareId = `${sensor.address.toString(16)}.${sensor.devNumber}`;

    try {
        res = await twinCtxt.api.get('/sensors', { params: { hardwareIds: hardwareId }});

        if (res.data && res.data.length > 0) {
            console.log(`Sensor ${hardwareId} is duplicated. Skipping.`);
            return;
        }

        res = await twinCtxt.api.post('/sensors', {
            hardwareId,
            type,
            dataType: dataType,
            deviceId: parentId,
            //properties: { address: sensor.address, devNumber: sensor.devNumber}
        });
    } catch(err) {
        console.log(res);
        console.log('--------------------------');
        console.log(err.toJSON());
        throw err;
    }

    console.log(res.status, res.data);
}

async function provisionMatcher(twinCtxt, parentId, matcher) {
    try {
        const res = await twinCtxt.api.post('/matchers', {
            ...matcher,
            spaceId: parentId
        });

        console.log(res.status, res.data);

        return res.data;

    } catch (err) {
        console.log(err.toJSON());
        throw err;
    }
}

async function readStreamToBuffer(readStream) {
    return new Promise((resolve, reject) => {
        const buffers = [];
        readStream.on('data', data => buffers.push(data));
        readStream.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

async function provisionUDF(twinCtxt, parentId, udf) {
    const form = new FormData();
    console.log(udf.file);
    const readStream = fs.createReadStream(udf.file);

    const streamBuffer = await readStreamToBuffer(readStream);

    // FIXME: Try sending metadata also as a streamBuffer.
    // Or work out how to set content type for each part.
    form.append('contents', streamBuffer);
    form.append('metadata', Buffer.from(JSON.stringify({
        spaceId: parentId,
        name: udf.name,
        matchers: udf.matchers
    })));

    console.log(
        {
            spaceId: parentId,
            name: 'test',
            matchers: udf.matchers
        }
    );

    console.log('>',JSON.stringify(
        {
            spaceId: parentId,
            name: 'test',
            matchers: udf.matchers
        }
    ),'<');

    console.log('>', Buffer.from(JSON.stringify(
        {
            name: 'test',
            spaceId: parentId,
            matchers: udf.matchers
        }
    )).toString('ascii'), '<');

    console.log(form.getHeaders());

    try {
        const res = await twinCtxt.api.post(
            '/userdefinedfunctions',
            form.getBuffer(),
            { headers: form.getHeaders() }
        );
        console.log(res.status, res.data);

        return res.data;

    } catch (err) {
        console.log(err.response);

        if (typeof err.toJSON === 'function') {
            console.log(err.toJSON());
        } else {
            console.log(err.toString());
        }
        throw err;
    }
}

async function provision(twinCtxt, rootUUID, parentObj, obj) {
    let parentId = rootUUID || undefined;

    if (parentObj) {
        parentId = twinCtxt.twinsMap.get(parentObj.name);
        //console.log('=>', parentId, parentObj);
    }

    let provisionFn = null;

    console.log(`--- Provisioning ${obj.type} -----------------------------`);

    switch (obj.type) {
        case 'Space':
            provisionFn = provisionSpace;
            break;

        case 'Device':
            provisionFn =  provisionDevice;
            break;

        case 'Sensor':
        case 'Lamp':
            provisionFn = provisionSensor;
            break;

        default: throw new Error(`No provision function for ${obj.type}`);
    }

    const createdId = await provisionFn(twinCtxt, parentId, obj);

    if (!twinCtxt.rootSpace && !parentObj) {
        twinCtxt.rootSpace = parentId || createdId;
    }

    if (createdId !== null) twinCtxt.twinsMap.set(obj.name, createdId);
}

module.exports = { provision, provisionSensor, provisionMatcher, provisionUDF };
