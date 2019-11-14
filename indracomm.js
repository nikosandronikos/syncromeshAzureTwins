const knex = require('knex');

/**
 * Get group IDs from a blob as found in the DALI_dynamic lights.db table.
 *
 * @param {Buffer} buf      Buffer containing group data in blob form.
 *
 * @returns {Array}         An array of numeric group IDs
 *
 * @throws {Error}          If buf is not the expected size
 */
function grpsBlobToArray(buf) {
    const nGroups = buf[0];
    const groups = [];

    if (buf.length !== (nGroups * 2) + 1) {
        throw new Error(`grpsBlobToArray: buf size is incorrect. nGroups=${nGroups}. length=${buf.length}`);
    }

    // little endian. Group numbers are two bytes
    for (let i = 1; i < buf.length; i += 2) {
        groups.push((buf[i]) | (buf[i + 1] << 8)); // eslint-disable-line no-bitwise
    }

    return groups;
}

function deviceType(type) {
    switch (type) {
        // Output devices
        case 0: return {type: 'Fluorescent',      superType: 'Lamp',   interfaceType: 'Output'};
        case 1: return {type: 'Emergency',        superType: 'Lamp',   interfaceType: 'Output'};
        case 2: return {type: 'Discharge (HID)',  superType: 'Lamp',   interfaceType: 'Output'};
        case 3: return {type: 'Low volt halogen', superType: 'Lamp',   interfaceType: 'Output'};
        case 4: return {type: 'Incandescent',     superType: 'Lamp',   interfaceType: 'Output'};
        case 5: return {type: 'D.C. converter',   superType: 'Lamp',   interfaceType: 'Output'};
        case 6: return {type: 'LED',              superType: 'Lamp',   interfaceType: 'Output'};
        case 7: return {type: 'Switching',        superType: 'Lamp',   interfaceType: 'Output'};
        case 8: return {type: 'Colour',           superType: 'Lamp',   interfaceType: 'Output'};
        case 251: return {type: 'WRI',            superType: 'Relay',  interfaceType: 'Output'};
        // Input devices
        case 181: return { type: 'Switch',        superType: 'Switch', interfaceType: 'Input' };
        case 240: return { type: 'V2 Switch',     superType: 'Switch', interfaceType: 'Input' };
        case 182: return { type: 'Mech Sensor',   superType: 'Sensor', interfaceType: 'Input' };
        case 183: return { type: 'PIR Sensor',    superType: 'Sensor', interfaceType: 'Input' };
        case 241: return { type: 'V2 PIR Sensor', superType: 'Sensor', interfaceType: 'Input' };
        case 242: return { type: 'V2 Lux Sensor', superType: 'Sensor', interfaceType: 'Input' };
        default: return null;
    }
}

function getDbHandle(filename) {
    const handle = knex({
        client: 'sqlite3',
        useNullAsDefault: true,
        connection: {filename},
        pool: { afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)}
    });

    return handle;
}

async function getGroups(lightsDb) {
    const rows
        = await lightsDb
        .select('grp_id')
        .from('Group_dynamic');

    return rows.map( row => row.grp_id );
}


async function getGroupsByTag(fitoutDb) {
    const rows
        = await fitoutDb
        .select('group.lightsDb_id', 'tag.label')
        .from('group')
        .leftJoin('groupTags', 'groupTags.group_id', 'group.lightsDb_id')
        .leftJoin('tag', 'tag.id', 'groupTags.tag_id');

    const tags = new Map();

    for (const row of rows) {
        const tagGroups = tags.get(row.label) || [];
        tagGroups.push(row.lightsDb_id);
        tags.set(row.label, tagGroups);
    }

    //console.log(tags);

    return tags;
}

async function getGroupDetails(lightsDb, groupIds) {
    const rows
        = await lightsDb
        .select()
        .from('Group_dynamic')
        .whereIn('grp_id', groupIds);

    const groups = new Map();

    for (const row of rows) {
        groups.set(row.grp_id, row);
    }

    //console.log(groups);

    return groups;
}

async function getDevicesByGroup(lightsDb) {
    const rows
        = await lightsDb
        .select()
        .from('DALI_dynamic');

    const devices = new Map();

    for (const row of rows) {
        const groups = grpsBlobToArray(row.grps);

        for(const group of groups) {
            if( group < 2 || group >= 240) continue;

            const deviceGroups = devices.get(group) || [];
            deviceGroups.push(row);
            devices.set(group, deviceGroups);
        }
    }

    //console.log('devices', devices);

    return devices;
}

// BFS traversal with an action performed per node
async function traverseSpaceGraph(graph, action) {
    let node = graph;
    let parent = null;

    const queue = [graph];

    const visited = new Set();

    while (node) {
        if (!visited.has(node)) {
            visited.add(node);

            // eslint-disable-next-line no-await-in-loop
            await action(node);

            if (node.children) {
                for (const child of node.children) {
                    queue.unshift(child);
                }
            }
        }

        node = queue.pop();
    }
}

async function buildIndracommSpaceGraph(lightsDbFilename, fitoutDbFilename) {
    const fitoutDb = getDbHandle(fitoutDbFilename);
    const lightsDb = getDbHandle(lightsDbFilename);

    const root = {
        name: 'Cognian Office',
        type: 'Space',
        subType: 'Venue',
        children: []
    };

    // Map of tag names to array of group IDs
    const tags = await getGroupsByTag(fitoutDb);

    // Map of group ID to array of device rows
    const devices = await getDevicesByGroup(lightsDb);

    for (const [tag, groupIds] of tags.entries()) {
        const area = {
            name: tag || 'blank',
            type: 'Space',
            subType: 'Area',
            children: [],
            parent: root
        };

        root.children.push(area);

        // eslint-disable-next-line no-await-in-loop
        const groups = await getGroupDetails(lightsDb, groupIds);

        for (const group of [...groups.values()]) {
            if (!group.name) continue;

            const room = {
                name: group.name.trim(),
                type: 'Space',
                subType: 'Room',
                children: [],
                parent: area
            };


            area.children.push(room);

            // eslint-disable-next-line no-await-in-loop
            const groupDevices = devices.get(group.grp_id) || [];

            const wdis = new Map();

            for (const device of groupDevices) {

                let wdi = wdis.get(device.address);

                if (!wdi) {
                    wdi = {
                        name: `WDI ${device.address.toString(16)}`,
                        type: 'Device',
                        subType: 'WDI',
                        address: device.address,
                        children: [],
                        parent: room,
                    };

                    wdis.set(device.address, wdi);

                    room.children.push(wdi);
                }

                const type = deviceType(device.devType);

                if (!type) continue;

                if (type.superType === 'Sensor') {
                    wdi.children.push({
                        name: `${type.type} - ${device.address.toString(16)}.${device.dev_number}`,
                        type: 'Sensor',
                        subType: type.type,
                        address: device.address,
                        devNumber: device.dev_number,
                        parent: wdi
                    });
                } else if (type.superType === 'Lamp') {
                    wdi.children.push({
                        name: `${type.type} - ${device.address.toString(16)}.${device.dev_number}`,
                        type: 'Lamp',
                        subType: type.type,
                        address: device.address,
                        devNumber: device.dev_number,
                        parent: wdi
                    });
                }
            }
        }
    }

    fitoutDb.destroy();
    lightsDb.destroy();

    return root;
}

async function buildIndracommSpaceGraphNoTags(lightsDbFilename) {
    const lightsDb = getDbHandle(lightsDbFilename);

    const area = {
        name: 'LowerEast',
        type: 'Space',
        subType: 'Area',
        children: []
    };

    // Map of tag names to array of group IDs
    const groupIds = await getGroups(lightsDb);
    console.log(groupIds);
    const groups = await getGroupDetails(lightsDb, groupIds);
    console.log(groups);

    // Map of group ID to array of device rows
    const devices = await getDevicesByGroup(lightsDb);

    for (const group of groups.values()) {

        console.log('group', group);

        if (!group.name) continue;

        // eslint-disable-next-line no-await-in-loop

        const room = {
            name: group.name.trim(),
            type: 'Space',
            subType: 'Room',
            children: [],
            parent: area
        };

        area.children.push(room);

        // eslint-disable-next-line no-await-in-loop
        const groupDevices = devices.get(group.grp_id) || [];

        const wdis = new Map();

        for (const device of groupDevices) {

            let wdi = wdis.get(device.address);

            if (!wdi) {
                wdi = {
                    name: `WDI ${device.address.toString(16)}`,
                    type: 'Device',
                    subType: 'WDI',
                    address: device.address,
                    children: [],
                    parent: room,
                };

                wdis.set(device.address, wdi);

                room.children.push(wdi);
            }

            const type = deviceType(device.devType);

            if (!type) continue;

            if (type.superType === 'Sensor') {
                wdi.children.push({
                    name: `${type.type} - ${device.address.toString(16)}.${device.dev_number}`,
                    type: 'Sensor',
                    subType: type.type,
                    address: device.address,
                    devNumber: device.dev_number,
                    parent: wdi
                });
            } else if (type.superType === 'Lamp') {
                wdi.children.push({
                    name: `${type.type} - ${device.address.toString(16)}.${device.dev_number}`,
                    type: 'Lamp',
                    subType: type.type,
                    address: device.address,
                    devNumber: device.dev_number,
                    parent: wdi
                });
            }
        }
    }

    lightsDb.destroy();

    return area;
}

module.exports = { buildIndracommSpaceGraph, buildIndracommSpaceGraphNoTags, traverseSpaceGraph };
