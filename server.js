console.log('starting');

var http = require('http');
var fs = require('fs');

var databaseURI = "192.168.145.213:27017/FSSRates";
//var db = require("mongojs").connect(databaseURI, ["AllMarketDataByYear", "AllMarketDataByMonth", "AllMarketDataByDay", "AllMarketDataByHour", "AllMarketDataBySecond"]);
var db = require("mongojs").connect(databaseURI, ["AllMarketDataWeekByYear", "AllMarketDataDayByWeek" , "AllMarketDataHourByDay" , "AllMarketDataMinuteByHour", "AllMarketDataBySecond"]);
var collectionWeekByYear = db.AllMarketDataWeekByYear;
var collectionDayByWeek = db.AllMarketDataDayByWeek;
var collectionHourByDay = db.AllMarketDataHourByDay;
var collectionMinuteByHour = db.AllMarketDataMinuteByHour;
var collectionBySecond = db.AllMarketDataBySecond;
var nbOfPoints = 100;

var server = http.createServer(function(req, res) {
    fs.readFile('./index.html', 'utf-8', function(error, content) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(content);
    });
});

var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {
	console.log('on connection');
	// load a new serie
    socket.on('addSeries', function (array) {
		console.log('addSeries for : '+array);
		console.log('symbols: '+array[1]);
		console.log('streams: '+array[0]);
		var colo  = new Date(array[2]);
		var dateStart  = new Date(array[3]);
		var dateEnd    = new Date(array[4]);
		extractAggregatedInformation(array);
    });	

  
    function extractAggregatedInformation(array) {
    	console.log('symbols: '+array[1]);
		console.log('streams: '+array[0]);
		var owner = array[0];
		var symbol = array[1];
		var colo = array[2];
		var dateStart  = new Date(array[3]);
		var dateEnd    = new Date(array[4]);
		var collection;
		var timeframeRange = dateEnd - dateStart;
		var itemRange;
		console.log("timeframeRange "+timeframeRange);

		if (timeframeRange < 2 * 60  * 1000) { //less than 2 minutes, use the second detail (max 120 points)
			collection = collectionBySecond;
			itemRange = 1000; //check +- 1 second 
		} else if (timeframeRange < 2 * 60 * 60  * 1000) { //less than 2 hours , use the minutes detail (max 120 points)
			collection = collectionMinuteByHour;
			itemRange = 60*60*1000; //check +- 1 hour 
		} else if (timeframeRange < 3 * 24 * 60 * 60  * 1000) { //less than 3 days, use the hour detail (max 72 points)
			collection = collectionHourByDay;
			itemRange = 24 * 3600 *1000;//check +- 1 day 
		} else if (timeframeRange < 10 * 7 * 24 * 60 * 60  * 1000) { //less than 10 weeks, use the day detail (max 70 points)
			collection = collectionDayByWeek;
			itemRange = 7 * 24 * 3600 *1000;//check +- 1 week 
		} else {
			collection = collectionWeekByYear;
			itemRange = 365 * 24 * 3600 *1000;//check +- 1 year		
		} 
		
		var actualDateStart  = new Date(array[3] - itemRange);
		var actualDateEnd    = new Date(array[4]+ itemRange);

		console.log( 'dateStart '+dateStart.getTime());
		console.log( 'end '+dateEnd.getTime());
		console.log( 'dateStart '+dateStart);
		console.log( 'end '+dateEnd);
		var timeDiff = dateEnd.getTime() - dateStart.getTime();
		
		console.log("aggregating "+timeframeRange);
		console.log("using "+collection);
		var analytics = array[6];
		var threshold = array[7];
		
		console.log('threshold '+threshold);
		var aggregate = collection.aggregate( 
				[
				 	{ $match:
					 	{ $and: 
				 			[
					 			{'owner' :  { $in : array[0]} }
					 			,{'securityID' :  { $in : array[1]} }
					 			,{'colo' :  { $eq : colo} }
					 			,{'timestamp' : { $gte: actualDateStart.getTime() } } 
					 			,{'timestamp' : { $lt: actualDateEnd.getTime() } }
				 			
					 	    ]
					 	}
				 	}
			 		 ,{$unwind: '$values'}
			 		 ,{ $match:
					 	{ $and: 
				 			[
					 			{'values.timestamp' : { $gte: dateStart.getTime() } }, 
					 			{'values.timestamp' : { $lt: dateEnd.getTime() } }
				 			
					 	    ]
					 	}
				 	}
			 		 ,{$sort:
			 			 { 'values.timestamp': 1}
			 		 }
				],
				function(err, entries) {
					console.log("aggregate function");
					if( err || !entries){
						console.log('No entries found between '+actualDateStart+' and '+actualDateEnd);
						console.log(' and error is '+err);
					}
					else {
						console.log('tutu count : '+entries.length+' between '+actualDateStart+' and '+actualDateEnd);
						processEntries(entries, owner, symbol, colo, analytics, threshold);

					}
				}
					);
		console.log("aggregate done");
    }

    function processEntries(entries, owner, symbol, colo, analytics, threshold) {
    	
    	switch (analytics) {
        case 'updates':
            handleUpdates(entries, owner, symbol, colo, threshold);
            break;
        case 'depth':
            handleDepth(entries, owner, symbol, colo, threshold);
            break;
        case 'spread':
            handleSpread(entries, owner, symbol, colo, threshold);
            break;
        case 'price':
            handlePrice(entries, owner, symbol, colo, threshold);
            break;
    	}
    	
    }

    function handleUpdates(entries, owner, symbol, colo, threshold) {
    	displayRange(entries, owner, symbol, colo, 'minItemsPerSecond', 'maxItemsPerSecond', 'updates-minMax', threshold);
//    	displayLine(entries, owner, symbol, colo, 'itemsPerSecond', 'updates-avg');
    }
    

    function displayRange(entries, owner, symbol, colo, minKey, maxKey, label, threshold) {
    	var consider = true;
    	if (threshold) {
    		consider = false;
    	}
    	var rangePoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			var min = eval('entries[i].values.'+minKey);
			var max = eval('entries[i].values.'+maxKey);
	    	if (threshold) {
	    		if (max > threshold) {
	    			consider = true;
				}
	    	}
	    	rangePoints.push( [(entries[i].values.timestamp), min, max]);
		}
		if (consider) {
	    	
			socket.emit('addSeries', {data: rangePoints, name: colo+'-'+owner+'-'+symbol+'-'+label, type: 'arearange'});
		}
    }
    
    function displayLine(entries, owner, symbol, colo, key, label, threshold) {
    	var consider = true;
    	if (threshold) {
    		consider = false;
    	}
    	var avgPoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			var avg = eval('entries[i].values.'+key);
			
	    	if (threshold) {
	    		if (avg > threshold) {
	    			consider = true;
				}
	    	}

	    	
			avgPoints.push( [(entries[i].values.timestamp), avg]);
		}
		if (consider) {
		socket.emit('addSeries', {data: avgPoints, name: colo+'-'+owner+'-'+symbol+'-'+label, type: 'line'});
		}
    }

    function handleSpread(entries, owner, symbol, colo, threshold) {
    	displayLine(entries, owner, symbol, colo, 'spread', 'spread', threshold);
    	displayRange(entries, owner, symbol, colo, 'minSpread', 'maxSpread', 'spread-minMax', threshold);
    }
    

    function handlePrice(entries, owner, symbol, colo, threshold) {
    	displayLine(entries, owner, symbol, colo, 'mid', 'mid', threshold);
    	displayRange(entries, owner, symbol, colo, 'bestBid', 'bestOffer', 'bid-offer', threshold);
    }

    function handleDepth(entries, owner, symbol, colo, threshold) {
    	displayLine(entries, owner, symbol, colo, 'maxBidDepth', 'bid', threshold);
    	displayLine(entries, owner, symbol, colo, 'maxOfferDepth', 'offer', threshold);
    }
    
	socket.on('distrinct stream', function (array) {
		collectionWeekByYear.distinct('owner', function(err, list) {
			if( err || !list) console.log('No streams found for '+array[0]);
			else {
				console.log('total of streams : '+list.length);
				socket.emit('streamList', JSON.stringify(list));
			}
		});
    });
	
	// extract distinct symbol
	socket.on('distrinct symbol', function (unused) {
		collectionWeekByYear.distinct('securityID', function(err, list) {
			if( err || !list) console.log('No symbol found');
			else {
				console.log('total of symbols : '+list.length);
				socket.emit('symbolList', JSON.stringify(list));
			}
		});
    });	
});


server.listen(8080);


