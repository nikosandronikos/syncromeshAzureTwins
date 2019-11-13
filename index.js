require('dotenv').config()
const util = require('util')

const { createTwinsContext } = require('./azure/context');
const { createConnection } = require('./azure/connect');
const { getRoot, getSpacesByName, destroyGraph } = require('./azure/graph');
const { provision, provisionSensor, provisionMatcher, provisionUDF } = require('./azure/provision');

const { buildIndracommSpaceGraph, traverseSpaceGraph } = require('./indracomm');

async function main() {
    const graph = await buildIndracommSpaceGraph(process.env.LIGHTS_DB, process.env.FITOUT_DB);

    console.log(util.inspect(graph, {depth: null}));

    try {

        const api = await createConnection(
            process.env.API_URL,
            process.env.APP_ID,
            process.env.AUTH_URL,
            process.env.SECRET,
            process.env.TWIN_RESOURCE
        );

        const twinCtxt = await createTwinsContext(api);

        const rootSpace = (await getSpacesByName(api, 'Quickstart Building'))[0];
        twinCtxt.rootSpace = rootSpace.id
        console.log(rootSpace);

        const deleteExisting = false;
        const buildSpaceGraph = false;
        const createTestSensor = false;
        const createUDF = true;

        if (deleteExisting) {
            const smCurrentHead = await getSpacesByName(api, graph.name);

            if (smCurrentHead) {
                console.log(`Destroying from ${smCurrentHead[0].id}`);
                await destroyGraph(api, smCurrentHead[0].id);
            }
        }

        if (buildSpaceGraph) {
            await getRoot(api);
            const smRoot = await getSpacesByName(api, 'Area A');
            console.log(smRoot[0]);

            traverseSpaceGraph(graph, async node => {
                await provision(twinCtxt, smRoot[0].id, node.parent, node);
            });
        }

        if (createTestSensor) {
            await provisionSensor(twinCtxt, 'b422df95-15a7-45a4-931f-8ef9f4923d60', {
                name: 'Test sensor',
                type: 'Lamp',
                subType: 'LED',
                address: 0xea4d2e5f,
                devNumber: 0,

            });
        }

        if (createUDF) {
            // A matcher for Light values
            const matcher = {
                name: 'Light matcher',
                conditions: [
                    {
                        target: "Sensor",
                        path: "$.dataType",
                        value: '"Light"',
                        comparison: "Equals"
                    }
                ]
            };

            //const matcherId = '29480951-e342-4aad-bb8c-22790e0b082a';
            const matcherId = await provisionMatcher(twinCtxt, twinCtxt.rootSpace, matcher);
            //console.log(matcherId);

            //const udf = {
            //    name: 'StoreValueUDF',
            //    file: './udfs/storeValue.js',
            //    matchers: [matcherId]
            //};

            //await provisionUDF(twinCtxt, twinCtxt.rootSpace, udf);
        }

    } catch (err) {
        console.error('Error:');
        if (typeof err.toJSON === 'function') console.log(err.toJSON());
        else console.log(err);
    }
}

main();
