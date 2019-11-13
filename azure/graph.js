async function getRoot(api) {

    const res = await api.get('/spaces', { params: { maxLevel: 1 }});

    console.log('Root:', res.data[0]);

    return res.data[0];
}

async function getSpacesByName(api, name) {
    const res = await api.get('/spaces', { params: { name }});

    if (res.data.length < 1) return null;

    return res.data;
}

async function destroyGraph(api, rootId=null) {
    let root = rootId;

    if (!root) {
        root = (await getRoot(api)).id;
    }

    await api.delete(`/spaces/${root}`);
}

async function getDevices(api) {
    const res = await api.get('/devices');

    if (!res.data || res.data.length < 1) return [];

    return res.data;
}

module.exports = { getRoot, getSpacesByName, getDevices, destroyGraph };
