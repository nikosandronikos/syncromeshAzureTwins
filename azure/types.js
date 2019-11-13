async function createType(api) {

    const res = await api.post('/types', {
        "category": "DeviceType",
        "name": "Sensor",
        "disabled": false
    });

    return res.data[0];
}

module.exports = { createType };
