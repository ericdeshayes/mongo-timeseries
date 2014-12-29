console.log('starting');

var http = require('http');
var fs = require('fs');

var databaseURI = "192.168.145.213:27017/FSSRates";
//var db = require("mongojs").connect(databaseURI, ["AllMarketDataByYear", "AllMarketDataByMonth", "AllMarketDataByDay", "AllMarketDataByHour", "AllMarketDataBySecond"]);
var db = require("mongojs").connect(databaseURI, ["AllMarketDataWeekByYear", "AllMarketDataDayByWeek" , "AllMarketDataHourByDay" , "AllMarketDataBySecond"]);
var collectionWeekByYear = db.AllMarketDataWeekByYear;
var collectionDayByWeek = db.AllMarketDataDayByWeek;
var collectionHourByDay = db.AllMarketDataHourByDay;
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
		var details = array[5];
		
		if (details) {
			extractDetailledInformation(array);
		} else {
			extractAggregatedInformation(array);
		}
    });	

    
    function extractDetailledInformation(array) {
    	console.log('symbols: '+array[1]);
		console.log('streams: '+array[0]);
		var owner = array[0];
		var symbol = array[1];
		var colo = array[2];
		var dateStart  = new Date(array[3]);
		var dateEnd    = new Date(array[4]);
		var collection = collectionBySecond;
		var timeframeRange = (dateEnd - dateStart) / nbOfPoints; 
		console.log("timeframeRange "+timeframeRange);

		var points1 = [];
		var points2 = [];
		console.log( 'dateStart '+dateStart);
		console.log( 'end '+dateEnd);
		var timeDiff = dateEnd.getTime() - dateStart.getTime();
		
		console.log("detailled aggregating "+timeframeRange);
		var aggregate = collection.aggregate( 
				[
				 	{ $match:
					 	{ $and: 
				 			[
					 			{'owner' :  { $in : array[0]} }, 
					 			{'securityID' :  { $in : array[1]} },
					 			{'colo' :  { $eq : colo} },
					 			{'timestamp' : { $gte: dateStart } }, 
					 			{'timestamp' : { $lt: dateEnd } }
				 			
					 	    ]
					 	}
				 	}
			 		 ,{$group: {
					 			'_id' : {
					                'timestampAsLong' : { 
					                	'$subtract' :
					                		[ 
					                		  {'$divide' : ['$timestampAsLong', timeframeRange ]}, 
					                		  { '$mod' : [
					                		              {'$divide' : ['$timestampAsLong', timeframeRange ]}
					                		              ,1
					                		              ] 
					                		  }
					                		  ] 
					                }
					            }
			            ,'max_items' : { '$max' : '$value.items'}
			            ,'max_bid' : { '$max' : '$value.maxBidDepth'}
			            ,'max_offer' : { '$max' : '$value.maxOfferDepth'}
			            ,'avg_items' : { '$avg' : '$value.items'}
			            ,'avg_bid' : { '$avg' : '$value.maxBidDepth'}
			            ,'avg_offer' : { '$avg' : '$value.maxOfferDepth'}
			 		 	}
			 		 }
			 		 ,{$sort:
			 			 { '_id.timestampAsLong': 1}
			 		 }
				],
				function(err, entries) {
					console.log("aggregate function");
					if( err || !entries){
						console.log('No entries found between '+dateStart+' and '+dateEnd);
						console.log(' and error is '+err);
					}
					else {
						console.log('tutu count : '+entries.length+' between '+dateStart+' and '+dateEnd);
						for(var i=0 ; i < entries.length ; i++) {
							//array += '['+entries[i]._id.ts.getTimeentries[i].value.count+']';
							var ts = entries[i]._id.timestampAsLong * timeframeRange;
//							console.log('timeStampAsDate '+entries[i].timestampAsLong);
//							console.log('_id '+new Date(ts) );
//							console.log('sum_value '+entries[i].sum_value);
							//console.log('maxOfferDepth '+entries[i].value.maxOfferDepth);
							points1.push( [(entries[i]._id.timestampAsLong * timeframeRange), entries[i].max_bid]);
							points2.push( [(entries[i]._id.timestampAsLong * timeframeRange), entries[i].avg_b]);
						}
						socket.emit('addSeries', {data: points1, name: array[0]+'-'+array[1]+'-max'});
						socket.emit('addSeries', {data: points2, name: array[0]+'-'+array[1]+'-avg'});

					}
				}
					);
		console.log("aggregate done");
    }

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
		if (timeframeRange > 24 * 3600 *1000* 31) { //one year
			collection = collectionWeekByYear;
			itemRange = 24 * 3600 *1000* 31 * 12;
		} else if (timeframeRange > 24 * 3600*1000 * 3) { //one week
			collection = collectionDayByWeek;
			itemRange = 24 * 3600 *1000 * 7;
		}  else if (timeframeRange > 24 * 3600 * 1000) { //one day
			collection = collectionHourByDay;
			itemRange = 24 * 3600 *1000;
		}  else  if (timeframeRange > 3600 * 1000) {
			itemRange = 3600 *1000;
			collection = collectionMinuteByHour;
		}  else {
			extractDetailledInformation(array);
			return;
		}
		console.log("timeframeRange "+timeframeRange);

		var actualDateStart  = new Date(array[3] - itemRange);
		var actualDateEnd    = new Date(array[4]+ itemRange);

		var points1 = [];
		var points2 = [];
		console.log( 'dateStart '+dateStart.getTime());
		console.log( 'end '+dateEnd.getTime());
		console.log( 'dateStart '+dateStart);
		console.log( 'end '+dateEnd);
		var timeDiff = dateEnd.getTime() - dateStart.getTime();
		
		console.log("aggregating "+timeframeRange);
		console.log("using "+collection);
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
						for(var i=0 ; i < entries.length ; i++) {
							//array += '['+entries[i]._id.ts.getTimeentries[i].value.count+']';
//							console.log('timeStamp1 '+new Date(entries[i].timestamp));
//							console.log('values '+entries[i].values);
							console.log('timeStamp2 '+new Date(entries[i].values.timestamp)+ ' ('+new Date(entries[i].timestamp)+')');
//							console.log('max '+entries[i].values.maxItemsPerSecond);
//							console.log('avg '+entries[i].values.itemsPerSecond);
							points1.push( [(entries[i].values.timestamp), entries[i].values.maxItemsPerSecond]);
							points2.push( [(entries[i].values.timestamp), entries[i].values.itemsPerSecond]);
						}
						socket.emit('addSeries', {data: points1, name: array[0]+'-'+array[1]+'-max'});
						socket.emit('addSeries', {data: points2, name: array[0]+'-'+array[1]+'-avg'});

					}
				}
					);
		console.log("aggregate done");
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


