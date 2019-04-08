//http://www.sitepoint.com/javascript-large-data-processing/
var ZoneModel = {
    id: "zoneId",
    fields: {
        zoneId: {
            type: "number",
            editable: false,
            nullable: true
        },
        zoneName: {
            type: "string"
        },
        freeCarCount: {
            type: "number"
        },
        waitTime: {
            type: "number"
        },
        carsList: {
            type: "array"
        }
    }
}

updateAllgridsLoop();

function processArray(data, handler, result, filters, doneCallback) {
    var maxtime = 100;
    var delay = 50;
    var queue = data;

    setTimeout(function () {
        var endtime = +new Date() + maxtime;
        do {
            handler(queue.shift(), result, filters);
        } while (queue.length > 0 && endtime > +new Date());

        if (queue.length > 0) {
            setTimeout(arguments.callee, delay);
        } else {
            if (doneCallback) doneCallback();
        }
    }, delay);
}


function processCar(car, result, filters) {
    car.isactive = isactive(car, filters);
    if (car) {
        if (!result.zonesDs) {
            result.zonesDs = new kendo.data.DataSource({
                pageSize: 25,
                schema: {
                    model: ZoneModel
                },
                sort: {
                    field: "zoneId",
                    dir: "asc"
                }
            })
        }
        if (!result.count) {
            result.count = [0, 0, 0, 0]
        }

        if (
            car.dispatchStatusId !== 5 &&
            car.m2mgwStatus == 1 &&
            car.isactive == true
        ) {
            var zone = result.zonesDs.get(car.zoneId)
            if (!zone) {
                zone = ZoneModelConstructor(car)
                result.zonesDs.add(zone)
            } else {
                zone.set("zoneId", car.zoneId)
            }
            zone.carsList.push(car);
            result.count[0] += car.dispatchStatusId === 0 ? 1 : 0
            result.count[1] += car.dispatchStatusId === 1 ? 1 : 0
            result.count[2] += car.dispatchStatusId === 2 ? 1 : 0
            result.count[3] += car.dispatchStatusId === 3 ? 1 : 0
        }
    }
}

function updateAllgridsLoop() {
    function processAllCars(cars) {
        var deferred = $.Deferred()
        var result = {}
        var authorizedCars = getAuthorizedData(cars, Gridfilters)
        processArray(authorizedCars, processCar, result, filters, function () {
            var zgrid = $("#zonesGrid").data("kendoGrid");
            if (result) {
                updateStatus(
                    result.count,
                    "freecars",
                    "soonfh",
                    "occupied",
                    "notavailable"
                );
                if (zgrid) {
                    var zoneDSArray = result.zonesDs.data()
                    for (var i = 0; i < zoneDSArray.length; i++) {
                        var sortedCars = _.chain(zoneDSArray[i].carsList)
                            .sort(desc_start_time)
                            .uniq("carNumber")
                            .value()

                        var freeCarCount = sortedCars.reduce(function (n, status) {
                            return n + (status.dispatchStatusId == 0)
                        }, 0)
                        var slicedfilteredZones = sortedCars.slice(0, 18)

                        var d = new Date()
                        var utcOffset = moment(d).utcOffset()
                        var c = slicedfilteredZones[0].statusTime
                        var waittimeLocal = moment().diff(c, "minutes")
                        var waittime = waittimeLocal - utcOffset
                        zoneDSArray[i].carsList = []
                        zoneDSArray[i].freeCarCount = freeCarCount
                        zoneDSArray[i].waitTime = waittime
                        zoneDSArray[i].carsList = slicedfilteredZones
                    }

                    var page = zgrid.dataSource.page()
                    var pageSize = zgrid.dataSource.pageSize()
                    zgrid.setDataSource(result.zonesDs)
                    zgrid.dataSource.filter({
                        logic: "or",
                        filters: poztingZones
                    })
                    zgrid.dataSource.page(page)
                    zgrid.dataSource.pageSize(pageSize)
                }
            }

            deferred.resolve()
        })
        return deferred.promise()
    }

    function updateAllGridDS() {
        allcars.read()
        processAllCars(allcars).then(function () {
            setTimeout(updateAllGridDS, 5000)
        })
    }
    updateAllGridDS()
    $.connection.hub.error(function (error) {
        console.log('SignalrAdapter: ' + error)
    })
    // when a connection is stopped attempt to connect back again.
    $.connection.hub.disconnected(function (error) {
        console.log('Disconnection error :' + error)
        $.connection.hub.start(function (connection) {
            console.log("reconnected:" + connection)
        })
    })

}

function updateStatus(data, id0, id1, id2, id3) {
    if (data) {
        document.getElementById(id0).innerHTML = data[0]
        document.getElementById(id1).innerHTML = data[1]
        document.getElementById(id2).innerHTML = data[2]
        document.getElementById(id3).innerHTML = data[3]
    }
};

function isactive(car, filters) {
    return (
        (car.operatingCompanyId === filters.operatingCompanyID ||
            !filters.operatingCompanyID) &&
        (car.postingId === filters.postingID || !filters.postingID) &&
        (car.carAndDriverAttributes === filters.carAndDriverAttributes ||
            !filters.carAndDriverAttributes) &&
        (car.carNumber === filters.carNumber || !filters.carNumber)
    )
}

function getAuthorizedData(datasource) {
    var origionaldata = [];
    for (var i = 0; i < allowedOC.length; i++) {
        origionaldata.push({
            field: "operatingCompanyId",
            operator: "eq",
            value: allowedOC[i].operatingCompanyId
        })
    }

    if (origionaldata.length === allowedOC.length) {
        origionaldata.push({
            logic: "and",
            filters: [{
                field: "isactive",
                operator: "eq",
                value: true
            }]
        })
    }
    datasource.filter({
        logic: "or",
        filters: origionaldata
    })
    var filters = datasource.filter()
    var allData = datasource.data()
    var query = new kendo.data.Query(allData)
    return query.filter(filters).data
}

function ZoneModelConstructor(car) {
    return {
        zoneId: car.zoneId,
        zoneName: car.zoneName,
        carsList: [{
            carString: car.carString,
            carNumber: car.carNumber,
            dispatchStatusId: car.dispatchStatusId,
            isWorkshift: car.isWorkshift,
            statusTime: car.statusTime,
            m2mgwStatus: car.m2mgwStatus,
            finishsuspend: car.finishsuspend,
            dataVersionNr: car.dataVersionNr,
            carAndDriverAttributes: car.carAndDriverAttributes,
            postingId: car.postingId,
            operatingCompanyId: car.operatingCompanyId
        }]
    }
}