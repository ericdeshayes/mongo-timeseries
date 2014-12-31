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

		if (timeframeRange < 5 * 60  * 1000) { //less than 5 minutes, use the second detail (max 300 points)
			collection = collectionBySecond;
		} else if (timeframeRange < 5 * 60 * 60  * 1000) { //less than 5 hours , use the minutes detail (max 300 points)
			collection = collectionMinuteByHour;
		} else if (timeframeRange < 7 * 24 * 60 * 60  * 1000) { //less than 7 days, use the hour detail (max 168 points)
			collection = collectionHourByDay;
		} else if (timeframeRange < 20 * 7 * 24 * 60 * 60  * 1000) { //less than 20 weeks, use the day detail (max 140 points)
			collection = collectionDayByWeek;
		} else {
			collection = collectionWeekByYear;
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
						processEntries(entries, owner, symbol, colo, analytics);

					}
				}
					);
		console.log("aggregate done");
    }

    function processEntries(entries, owner, symbol, colo, analytics) {
    	
    	switch (analytics) {
        case 'updates':
            handleUpdates(entries, owner, symbol, colo);
            break;
        case 'depth':
            handleDepth(entries, owner, symbol, colo);
            break;
        case 'spread':
            handleSpread(entries, owner, symbol, colo);
            break;
        case 'price':
            handlePrice(entries, owner, symbol, colo);
            break;
    	}
    	
    }

    function handleUpdates(entries, owner, symbol, colo) {
    	var rangePoints = [];
    	var avgPoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			console.log('entry ts: '+entries[i].values.timestamp);
			console.log('entry minItemsPerSecond: '+entries[i].values.minItemsPerSecond);
			console.log('entry maxItemsPerSecond: '+entries[i].values.maxItemsPerSecond);
			console.log('entry itemsPerSecond: '+entries[i].values.itemsPerSecond);
			rangePoints.push( [(entries[i].values.timestamp), entries[i].values.minItemsPerSecond, entries[i].values.maxItemsPerSecond]);
			avgPoints.push( [(entries[i].values.timestamp), entries[i].values.itemsPerSecond]);
		}
		socket.emit('addSeries', {data: rangePoints, name: colo+'-'+owner+'-'+symbol+'-updates-minMax', type: 'arearange'});
		socket.emit('addSeries', {data: avgPoints, name: colo+'-'+owner+'-'+symbol+'-updates-avg', type: 'line'});
    }
    

    function handleDepth(entries, owner, symbol, colo) {


    	var bidPoints = [];
    	var offerPoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			bidPoints.push( [(entries[i].values.timestamp), entries[i].values.bidDepth, entries[i].values.maxBidDepth]);
			offerPoints.push( [(entries[i].values.timestamp), entries[i].values.offerDepth, entries[i].values.maxOfferDepth]);
		}
		socket.emit('addSeries', {data: bidPoints, name: colo+'-'+owner+'-'+symbol+'-bid', type: 'arearange'});
		socket.emit('addSeries', {data: offerPoints, name: colo+'-'+owner+'-'+symbol+'-offer', type: 'arearange'});
    }
    

    function handleSpread(entries, owner, symbol, colo) {

    		
    	var rangePoints = [];
    	var avgPoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			rangePoints.push( [(entries[i].values.timestamp), entries[i].values.minSpread, entries[i].values.maxSpread]);
			avgPoints.push( [(entries[i].values.timestamp), entries[i].values.spread]);
		}
		socket.emit('addSeries', {data: rangePoints, name: colo+'-'+owner+'-'+symbol+'-spread-minMax', type : 'arearange'});
		socket.emit('addSeries', {data: avgPoints, name: colo+'-'+owner+'-'+symbol+'-spread-avg', type : 'line'});
    }
    

    function handlePrice(entries, owner, symbol, colo) {

	var rangePoints = [];
    	var avgPoints = [];
		for(var i=0 ; i < entries.length ; i++) {
			var bestBid = entries[i].values.bestBid;
			var bestOffer = entries[i].values.bestOffer;
			console.log('entry ts: '+entries[i].values.timestamp);
			console.log('entry bestBid: '+entries[i].values.bestBid);
			console.log('entry bestOffer: '+entries[i].values.bestOffer);
			console.log('entry mid: '+entries[i].values.mid);
			
//			if (bestBid < bestOffer) {
				rangePoints.push( [(entries[i].values.timestamp), entries[i].values.bestBid, entries[i].values.bestOffer]);
//			}
			avgPoints.push( [(entries[i].values.timestamp), entries[i].values.mid]);
		}
		socket.emit('addSeries', {data: rangePoints, name: colo+'-'+owner+'-'+symbol+'-bid-offer', type : 'areasplinerange'});
		socket.emit('addSeries', {data: avgPoints, name: colo+'-'+owner+'-'+symbol+'-mid', type : 'line'});
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


