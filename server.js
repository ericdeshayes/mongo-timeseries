var http = require('http');
var fs = require('fs');

var databaseURI = "edeshayes3:27017/FSSRates";
var db = require("mongojs").connect(databaseURI, ["AllMarketDataByYear", "AllMarketDataByMonth", "AllMarketDataByDay", "AllMarketDataByHour"]);

var collectionByYear = db.AllMarketDataByYear;
var collectionByMonth = db.AllMarketDataByMonth;
var collectionByDay = db.AllMarketDataByDay;
var collectionByHour = db.AllMarketDataByHour;
var nbOfPoints = 50;

var server = http.createServer(function(req, res) {
    fs.readFile('./index.html', 'utf-8', function(error, content) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(content);
    });
});

var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {
	// load a new serie
    socket.on('addSeries', function (array) {
		console.log('addSeries for : '+array);
		console.log('symbols: '+array[1]);
		console.log('streams: '+array[0]);
		var dateStart  = new Date(array[2]);
		var dateEnd    = new Date(array[3]);
		console.log( 'dateStart '+dateStart);
		console.log( 'end '+dateEnd);
		var timeDiff = dateEnd.getTime() - dateStart.getTime();
		
		var collection;
		var secondsPerHour = 3600 * 1000;
		var secondsPerDay =  24 * secondsPerHour;
		var secondsPerMonth =  31 * secondsPerDay;
		var secondsPerYear =  366 * secondsPerDay;

		//if (timeDiff < secondsPerDay) {
			collection = collectionByHour;
		//} else if (timeDiff < secondsPerMonth) {
		//	collection = collectionByDay;
		//} else if (timeDiff < secondsPerYear) {
		//	collection = collectionByMonth;
		//}  else {
		//	collection = collectionByYear;
		//}
				
		var points = [];
		
		console.log('using  : '+collection);
		
			
		var timeframeRange = (dateEnd - dateStart) / nbOfPoints; 
		console.log("timeframeRange "+timeframeRange);

		console.log("dateStart "+new Date(dateStart));
			console.log("dateEnd "+new Date(dateEnd));

			var start = dateStart / 1000 * 1000 //to round to the second
		var end = dateEnd / 1000 * 1000 //to round to the second
		
			console.log("start "+new Date(start));
			console.log("end "+new Date(end));
			var counter = 0;
		for (var i = start; i<=end; i += timeframeRange)  {
			console.log((counter++) + "considering "+new Date(i));
			console.log("between "+new Date(i-timeframeRange)+" and "+new Date(i+timeframeRange));
			
			var aggregate = collection.aggregate( [ { 'owner' :  { $eq : array[0]} , { 'securityID' :  { $eq : array[1]} },{ 'timestamp' : { $gte: new Date(i-timeframeRange) }}, { 'timestamp' : { $lt: new Date(i+timeframeRange) }}},
									{ $project : { timestamp : new Date(i), _id:0, maxBidDepth : { $max: "$maxBidDepth" }, maxOfferDepth : { $max : "$maxOfferDepth"  } }}
			]); 
			
		}
		
		collection.find({ $and: [ { 'owner' :  { $in : array[0]} }, { 'securityID' :  { $in : array[1]} },{ 'timestamp' : { $gte: dateStart }}, { 'timestamp' : { $lte: dateEnd }}] },
			function(err, entries) {
			if( err || !entries) console.log('No entries found between '+dateStart+' and '+dateEnd+' and error is '+err);
			else {
				console.log('toto count : '+entries.length+' between '+new Date(array[2])+' and '+new Date(array[3]));
				for(var i=0 ; i < entries.length ; i++) {
					//array += '['+entries[i]._id.ts.getTimeentries[i].value.count+']';
					console.log('time '+entries[i].timestamp);
					var time = entries[i].timestamp.getTime();
//					console.log('time '+entries[i].timestamp);
	//				console.log('time '+entries[i].timestamp.getTime());
					 for(var j=0 ; j < entries[i].values.length ; j++) {
						for(var k=0 ; k < entries[i].values[j].length ; k++) {
							var value = entries[i].values[j][k];
							//console.log('j '+j);
							//console.log('k '+k);
							//console.log('time '+time);
							//console.log('value '+value);
							points.push( [(time+value.deltaTimestamp), value.items]);
						}	
					}
				}
				socket.emit('addSeries', {data: points, name: array[0]+'-'+array[1]});
			}
		});
    });	
	
	socket.on('distrinct stream', function (array) {
		collectionByMonth.distinct('owner', function(err, list) {
			if( err || !list) console.log('No streams found for '+array[0]);
			else {
				console.log('total of streams : '+list.length);
				socket.emit('streamList', JSON.stringify(list));
			}
		});
    });
	
	// extract distinct symbol
	socket.on('distrinct symbol', function (unused) {
		collectionByMonth.distinct('securityID', function(err, list) {
			if( err || !list) console.log('No symbol found');
			else {
				console.log('total of symbols : '+list.length);
				socket.emit('symbolList', JSON.stringify(list));
			}
		});
    });	
});


server.listen(8080);


