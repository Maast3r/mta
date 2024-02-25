const fs = require('node:fs');

const { fetch, setGlobalDispatcher, Agent } = require('undici');
setGlobalDispatcher(new Agent({ connect: { timeout: 20_000 } }));

const GtfsRealtimeBindings = require('./gtfs.js');
const Stops = require('../mta-data/stops.json');

// http://web.mta.info/developers/resources/line_colors.htm

const MTA_API_KEY = process.env.MTA_API_KEY;

const ACE =
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace';
const NUMBERS =
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';
const BDFM =
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm';
const NQRW =
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw';

const headers = { 'x-api-key': MTA_API_KEY };

const test = (feed) => {
    return fetch(feed, { headers })
        .then((response) => {
            return response.arrayBuffer();
        })
        .then((buffer) => {
            // const feed = require('../feed.json');

            const feed =
                GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                    new Uint8Array(buffer)
                );
            // fs.writeFile('./feed.json', JSON.stringify(feed), (_error) => {
            //     console.log('feed written');
            // });

            // const vehicles = feed.entity.filter((entity) => entity?.vehicle);
            // fs.writeFile('./vehicles.json', JSON.stringify(vehicles), (_error) => {
            //     console.log('vehicles written');
            // });

            const stopName = '59 St-Columbus Circle';
            // const stopName = '55 St';
            // const stopName = '182-183 Sts';
            const stopIds = Stops.filter(
                (stop) => stop.stop_name === stopName
            ).map((stop) => stop.stop_id);
            // console.log(stopIds);

            const trains = feed.entity.filter((entity) => {
                return stopIds.includes(entity?.vehicle?.stopId);
            });
            // console.log(trains);

            const currentTime = 1708794732 * 1000;

            const arrivals = feed.entity
                .filter((entity) => {
                    const doesStopExistArray =
                        entity?.tripUpdate?.stopTimeUpdate?.filter(
                            (stopTime) => {
                                return stopIds.includes(stopTime.stopId);
                            }
                        );
                    return doesStopExistArray?.length > 0;
                })
                .map((arrival) => {
                    const vehicle = feed.entity.find(
                        (entity) =>
                            entity?.vehicle?.trip?.tripId ===
                            arrival.tripUpdate.trip.tripId
                    );

                    return {
                        ...arrival,
                        ...vehicle,
                        stopUpdate: arrival.tripUpdate.stopTimeUpdate.find(
                            (stopUpdate) => stopIds.includes(stopUpdate.stopId)
                        ),
                    };
                });

            const north = {};
            const south = {};
            // fs.writeFile('../test.json', JSON.stringify(arrivals[0]), () => {});

            arrivals.forEach((arrival) => {
                const firstChar = arrival.tripUpdate.trip.tripId
                    .split('..')[1]
                    .charAt(0);
                const routeId = arrival.tripUpdate.trip.routeId;

                if (firstChar === 'N') {
                    if (!north[routeId]) {
                        north[routeId] = [];
                    }
                    north[routeId].push(arrival);
                } else if (firstChar === 'S') {
                    if (!south[routeId]) {
                        south[routeId] = [];
                    }
                    south[routeId].push(arrival);
                }
            });

            // console.log(south);
            // console.log(north);
            return { north, south };
        })
        .catch((error) => {
            console.log(':(', error);
        });
};

// test();

const testMultiple = async () => {
    const a = await Promise.all([
        test(BDFM),
        test(ACE),
        test(NUMBERS),
        test(NQRW),
    ]);
    const result = { north: {}, south: {} };

    a.forEach((fetchResult) => {
        Object.keys(fetchResult.north).forEach((routeId) => {
            result.north[routeId] = fetchResult.north[routeId];
        });
        Object.keys(fetchResult.south).forEach((routeId) => {
            result.south[routeId] = fetchResult.south[routeId];
        });
    });

    console.log(result);
};

testMultiple();
