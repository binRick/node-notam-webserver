#!/usr/bin/env node

var app = require('express')(),
    notams = require('notams'),
    c = require('chalk'),
    _ = require('underscore'),
    clear = require('clear'),
    config = require('./config'),
    server = require('http').createServer(app),
    io = require('socket.io')(server),
    spawn = require('child_process').spawn,
    icaoDatabase = require('icao'),
    redis = require('redis');

clear();
console.log('starting redis-server...');
var redisServerProcess = spawn('redis-server', ['--bind', config.redis.host, '--port', config.redis.port]);
redisServerProcess.stdout.on('data', function(dat) {});
redisServerProcess.stderr.on('data', function(dat) {
    console.log('redis server error:', dat.toString());
});
redisServerProcess.on('close', function(code) {
//    console.log('redis process exited with code', code);
});
console.log('Spawned redis server on host', config.redis.host, 'port', config.redis.port, 'as pid', redisServerProcess.pid);
var redisClient = redis.createClient(config.redis.port, config.redis.host);
var geo = require('georedis').initialize(redisClient);
console.log('GeoRedis Service ready for locations import..');
var getNearbyIcaos = function(lat, lng, distance, unit, _fn) {
    geo.nearby({
        latitude: lat,
        longitude: lng
    }, distance, {
        units: unit,
        withDistances: true,
        accurate: true
    }, function(err, nearbys) {
        var r = {
            icaos: nearbys.map(function(nb) {
                return nb.key
            }),
            distances: nearbys.map(function(nb) {
                return {
                    icao: nb.key,
                    distance: nb.distance
                };
            }),
        };
        _fn(err, r);
    });
};

var icaoLocations = {};
_.each(_.keys(icaoDatabase), function(icao) {
    if (icaoDatabase[icao][0] > 0)
        icaoLocations[icao] = {
            latitude: icaoDatabase[icao][0],
            longitude: icaoDatabase[icao][1]
        };
});
console.log('trying to add', _.size(icaoLocations), 'locations objects to geo database...');
geo.addLocations(icaoLocations, function(err, reply) {
    if (err) throw err;
    else console.log('added', reply, 'ICAO locations to geo database');

console.log(c.yellow('Creating API Endpoints...'));

    app.get('/nearby/:nearbyType/:lat/:lng/:distance/:unit/:brief?', function(req, res) {
        if (!_.contains(['icaos', 'notams'], req.params.nearbyType))
            return res.end('Invalid Nearby Type');
        var distance = 50;
        var unit = 'mi';
        if (_.contains(['m', 'km', 'mi', 'ft'], req.params.unit))
            unit = req.params.unit;
        if (req.params.distance > 0 && req.params.distance < 200)
            distance = req.params.distance;
        getNearbyIcaos(req.params.lat, req.params.lng, distance, unit, function(err, nearbyLocations) {
            if (err) throw err;
            if (req.params.nearbyType == 'icaos')
                return res.json(nearbyLocations.icaos);
            else if (req.params.nearbyType == 'notams') {
                notams(nearbyLocations.icaos, {
                    format: 'ICAO'
                }).then(function(results) {
                    results = results.filter(function(r) {
                        return r.notams.length > 0;
                    });
                    if (req.params.brief == 'brief')
                        return res.json(results.map(function(r) {
                            return {
                                icao: r.icao,
                                notamQty: r.notams.length,
                                distance: _.findWhere(nearbyLocations.distances, {
                                    icao: r.icao
                                }).distance,
                                unit: unit,
                            };
                        }));
                    else return res.json(results);
                });
            }
        });
    });

    app.get('/icaoNotams/:icaos/:notamFormat?', function(req, res) {
        if (req.params.notamFormat == 'DOMESTIC' || req.params.notamFormat == 'ICAO')
            notamFormat = req.params.notamFormat;
        else
            notamFormat = 'ICAO';
        if (req.params.icaos.split(',').length > 1)
            var icaos = req.params.icaos.split(',');
        else
            var icaos = [req.params.icaos];
        notams(icaos, {
            format: notamFormat
        }).then(function(results) {
            res.json(results);
        });
    });

    app.get('/icaos/:type?', function(req, res) {
        if (req.params.type == 'locations')
            return res.json(icaoLocations);
        else if (req.params.type == 'database')
            return res.json(icaoDatabase);
        else
            return res.json(_.keys(icaoDatabase));
    });

    app.get('/', function(req, res) {
        res.send('welcome to the homepage');
    });

    io.on('connection', function() {
        console.log('socketio connection established.');
    });
    server.listen(config.webserver.port, config.webserver.host, function() {
        console.log('Webserver listening on port', config.webserver.port);
    });
});
