
const port = process.env.PORT || 5001;

var express = require("express");
var app = express();

const Storage = require('./src/Storage');

var log = console.log;
require('console-stamp')(console);



// --------------------Authentication middleware start -------------------------------------

app.use((req, res, next) => {

	var auth;
	const VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);

	if ((VCAP_SERVICES.xsuaa[0].credentials.clientid) && (VCAP_SERVICES.xsuaa[0].credentials.clientsecret))

	{
		auth = {
			login: VCAP_SERVICES.xsuaa[0].credentials.clientid,
			password: VCAP_SERVICES.xsuaa[0].credentials.clientsecret.slice(0,20)
		}

	} else {

		const VCAP_APPLICATION = JSON.parse(process.env.VCAP_APPLICATION);

		auth = {
			login: VCAP_APPLICATION.space_name,
			password: VCAP_APPLICATION.application_name
		}
	}
	

	// parse login and password from headers

	if (auth) {

		const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
		const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

		// Verify login and password are set and correct

		if (login && password && login === auth.login && password === auth.password) {
			// Access granted
			return next();
		}

		// Access denied
		res.set('WWW-Authenticate', 'Basic realm="401"');
		res.status(401).send('Authentication required.');

	}

}) // app.use((req, res, next)

// --------------------Authentication middleware end -------------------------------------

async function getAnomalityListFromDB(timestamp, callback) {

	console.log('[PATROL] Patrol, give us anomaly list for timestamp=', timestamp);

	let storage = new Storage(

		async function (connection_status) {

			if (connection_status == false)

			{

				console.log('[PATROL] There was an error while connecting to HANA database');
				return callback(null);

			} else {


				await storage.GetAnomalityListFromDB(timestamp, async function (response) {

					var result = response;
					
					await storage.closeSession();

					if (result) {

						console.log('[PATROL] Received ', result.length, ' record(s) from metric_anomaly table');

						return callback(result);
					} else {
						return callback(null);
					}
				});

			}

		});

};


app.listen(port, () => {
	console.log("[PATROL] Patrol (MAI backward interface) running on port " + port);
});


app.get('/list', function (req, res) {


	console.log('[PATROL] Someone is calling Patrol with parameters', req.originalUrl);

	var responseValue;
	var requestParameters = {};

	var errorMessage = {
		code: 2,
		value: "MAI backward interface: records not found"
	};

	var errorMessageString = JSON.stringify(errorMessage, 0);

	errorMessageString = errorMessageString.replace(/\\/g, "");


	// Changing all parameters names to lowercase

	for (i in req.query) {
		requestParameters[i.toLowerCase()] = req.query[i];
	}

	var timestamp = requestParameters.timestamp;

	// Calling for anomality list for a specifc timestamp

	if (timestamp) // if parameters are entered
	{

		console.log('[PATROL] Waiting for the list output...');

		getAnomalityListFromDB(timestamp, function (result) {

			if (result) {

				if (result.length > 0) {

					for (let i = 0; i < result.length; i++) {
						
						var abnormalityRating = result[i].METRIC_ABNORMALITY.toString();

						if (responseValue) {
			
							// Sending a result to output
							// As context id and event_type id could be changed on backend -> no need to pass it back
							// Possible separators not used in mai_hash_value: # & !
							
							responseValue = responseValue + '#' + result[i].CONTEXT_NAME + ';' + 
								result[i].MNAME + ';' + 
								result[i].M_SHORT_TEXT + ';' + 
								result[i].DATA_COLLECTION_TIMESTAMP + ';' +
//								result[i].CONTEXT_ID + ';' + 
//								result[i].EVENT_TYPE_ID + ';' + 
								abnormalityRating.substring(0, 5);
						} else 
							
							responseValue = result[i].CONTEXT_NAME + ';' + 
								result[i].MNAME + ';' + 
								result[i].M_SHORT_TEXT + ';' + 
								result[i].DATA_COLLECTION_TIMESTAMP + ';' +
//								result[i].CONTEXT_ID + ';' + 
//								result[i].EVENT_TYPE_ID + ';' + 
								abnormalityRating.substring(0, 5);
					};

					var patrolResponse = {
						code: 0,
						value: responseValue
					};

					var patrolResponseString = JSON.stringify(patrolResponse, 0);

					res.send(patrolResponseString);

					console.log('[PATROL] List successfully generated');
					console.log('[PATROL] Closing session with Patrol');

				} // if (result.length > 0)
				else {

					console.log('[PATROL] ERROR: cannot get an anomaly rating list from internal database');
					monitoring_collection = '[PATROL] ERROR: cannot get an anomaly rating list from internal database';
					res.send(errorMessageString);
				}
			} else {

				console.log('[PATROL] ERROR: cannot get an anomaly rating list from internal database');
				monitoring_collection = '[PATROL] ERROR: cannot get an anomaly rating list from internal database';
				res.send(errorMessageString);

			} //  if (result)

		}); //	getAnomalityListFromDB(function (result)


	} else {

		console.log('[PATROL]Patrol cannot understand the parameters, it needs timestamp');

		errorMessage = {
			code: 1,
			value: 'welcome to MAI backward interface: provide timestamp'
		};
		
		errorMessageString = JSON.stringify(errorMessage, 0);

		errorMessageString = errorMessageString.replace(/\\/g, "");

		res.send(errorMessageString);

		console.log('[PATROL] Closing session with Patrol');
	}


}); // app.get('/url', function (req, res)