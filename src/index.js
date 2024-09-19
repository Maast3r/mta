const axios = require('axios');
const express = require('express');
const cors = require('cors');

const GtfsRealtimeBindings = require('./gtfs.js');

const stops = require('../mta-data/stops.json');
const stations = require('../mta-data/stations.json');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

axios.defaults.headers.common['x-api-key'] = process.env.MTA_API_KEY;

const FEEDS = [
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
];

const getTrainsFromFeed = ({ feed, stationName }) => {
    const station = stations.find((station) => station.name === stationName);

    return axios.get(feed, { responseType: 'arraybuffer' })
        .then((response) => {
            const buffer = response.data;
            const feed =
                GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                    new Uint8Array(buffer)
                );

            const arrivals = feed.entity
                .filter((entity) => {
                    const doesStopExistArray =
                        entity?.tripUpdate?.stopTimeUpdate?.filter(
                            (stopTime) => {
                                return station.stopIds.includes(stopTime.stopId);
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
                            (stopUpdate) => station.stopIds.includes(stopUpdate.stopId)
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

const getAllTrains = async (stationName) => {
    const feedResults = await Promise.all(
        FEEDS.map((feed) => getTrainsFromFeed({ feed, stationName }))
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

app.get('/stations', (req, res) => {
    const stationsToReturn = stations.map((station) => ({
        ...station,
        parentStopIds: station.parentStopIds.map((parentStopId) => String(parentStopId)),
        stopIds: station.stopIds.map((stopId) => String(stopId)),
        stopFamilies: station.stopFamilies.map((stopFamily) => ({
            ...stopFamily,
            parentStopId: String(stopFamily.parentStopId),
        })),
    }));

    res.send(stationsToReturn);
});

app.get('/stops', (req, res) => {
    res.send(stops);
});

app.get('/trains', async (req, res) => {
    const trains = await getAllTrains(req.query.stationName);
    res.send(trains);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
