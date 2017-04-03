var notams = require('notams'),
    _ = require('underscore'),
    c = require('chalk'),
    notamData = {
        icaoNotams: {}
    };

notams.fetch(['KDEN'], {
    format: 'DOMESTIC'
}).then(function(results) {
    notamData.icaoNotams['KDEN'] = results;
    notams.fetchAllSpecialNotices({}).then(function(results) {
        notamData.specialNotices = results;
        notams.fetchAllTFR({}).then(function(results) {
            notamData.tfr = results;
            notams.fetchAllGPS({}).then(function(results) {
                notamData.gps = results;
                notams.fetchAllCARF({}).then(function(results) {
                    notamData.carf = results;
                    console.log(_.keys(notamData), notamData.tfr.length);
                });
            });
        });
    });
});
