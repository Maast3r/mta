const express = require('express');
const cors = require('cors');
const { Agent, fetch, setGlobalDispatcher } = require('undici');

const Stops = require('../mta-data/stops.json');
const GtfsRealtimeBindings = require('./gtfs.js');

setGlobalDispatcher(new Agent({ connect: { timeout: 20_000 } }));

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const MTA_API_KEY = process.env.MTA_API_KEY;

const FEEDS = [
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
];

const headers = { 'x-api-key': MTA_API_KEY };

const getStopNames = () => {
    const stops = new Set();
    Stops.forEach((stopInfo) => {
        if (!stops.has(stopInfo.stop_name)) {
            stops.add(stopInfo.stop_name);
        }
    });

    return Array.from(stops);
};

const getTrainsFromFeed = ({ feed, stopName }) => {
    return fetch(feed, { headers })
        .then((response) => {
            return response.arrayBuffer();
        })
        .then((buffer) => {
            const feed =
                GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                    new Uint8Array(buffer)
                );

            const stopIds = Stops.filter(
                (stop) => stop.stop_name === stopName
            ).map((stop) => stop.stop_id);

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

            return { north, south };
        });
};

const getAllTrains = async (stopName) => {
    const feedResults = await Promise.all(
        FEEDS.map((feed) => getTrainsFromFeed({ feed, stopName }))
    );
    const result = { north: {}, south: {} };

    feedResults.forEach((feedResult) => {
        Object.keys(feedResult.north).forEach((routeId) => {
            result.north[routeId] = feedResult.north[routeId];
        });
        Object.keys(feedResult.south).forEach((routeId) => {
            result.south[routeId] = feedResult.south[routeId];
        });
    });

    return result;
};

app.get('/stops', (req, res) => {
    res.send(Stops);
});

app.get('/stopNames', (req, res) => {
    const stops = getStopNames();
    res.send(stops);
});

app.get('/trains', async (req, res) => {
    const trains = await getAllTrains(req.query.stopName);
    res.send(trains);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
