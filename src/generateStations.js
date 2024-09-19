const fs = require('node:fs');
const stops = require('../mta-data/stops.json');

function csvToJSON(text, quoteChar = '"', delimiter = ',') {
    const rows = text.split('\n');
    const headers = rows[0].split(',');

    const regex = new RegExp(
        `\\s*(${quoteChar})?(.*?)\\1\\s*(?:${delimiter}|$)`,
        'gs'
    );

    const match = (line) =>
        [...line.matchAll(regex)].map((m) => m[2]).slice(0, -1);

    let lines = text.split('\n');
    const heads = headers ?? match(lines.shift());
    lines = lines.slice(1);

    return lines.map((line) => {
        return match(line).reduce((acc, cur, i) => {
            // replace blank matches with `null`
            const val = cur.length <= 0 ? null : Number(cur) || cur;
            const key = heads[i] ?? `{i}`;
            return { ...acc, [key]: val };
        }, {});
    });
}

let stations = [];

const transfersTxt = fs.readFileSync('./mta-data/transfers.txt', 'utf8');
const transfers = csvToJSON(transfersTxt);

transfers.forEach((transfer) => {
    let station = stations.find((station) =>
        station?.parentStopIds?.has(transfer.from_stop_id)
    );

    if (!station) {
        station = { parentStopIds: new Set() };
        stations.push(station);
    }

    station.parentStopIds.add(transfer.from_stop_id);
    station.parentStopIds.add(transfer.to_stop_id);
});

stations = stations.map((station) => {
    const parentStopIds = Array.from(station.parentStopIds);
    const stopFamilies = {};
    parentStopIds.forEach((parentStopId) => {
        stopFamilies[parentStopId] = { parentStopId, children: [] };
    })

    return {
        id: parentStopIds.join(','),
        parentStopIds,
        stopIds: [],
        stopFamilies,
    };
});

stations.forEach((station) => {
    station.parentStopIds.forEach((parentStopId, index) => {
        const childrenStopIds = stops
            .filter((childStop) => childStop.parent_station === parentStopId)
            .map((childStop) => childStop.stop_id);
        station.stopIds = station.stopIds.concat(childrenStopIds);
        station.stopFamilies[parentStopId].children = childrenStopIds;

        if (index === 0) {
            const parentStop = stops.find(
                (parentStop) => parentStop.stop_id === parentStopId
            );

            station.latitude = parentStop.stop_lat;
            station.longitude = parentStop.stop_lon;
            station.name = parentStop.stop_name;
        }
    });
});

stations.forEach((station) => {
    station.stopFamilies = Object.values(station.stopFamilies);
});

fs.writeFileSync(
    './mta-data/stations.json',
    JSON.stringify(stations, null, '\t')
);
