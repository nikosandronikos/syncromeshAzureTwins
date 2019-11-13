async function createTwinsContext(api) {
    const ctxt = { api };

    const res = await api.get('/types');

    ctxt.typesMap = new Map();

    for (const type of res.data) {
        ctxt.typesMap.set(type.name, type);
    }

    ctxt.twinsMap = new Map();

    ctxt.dupesMap = new Map();

    return ctxt;
}

module.exports = { createTwinsContext };
