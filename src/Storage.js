
const config = require('./../src/config/internal_config.json');
const cfenv = require("cfenv");

class Storage {

	constructor(callback) {

	    // Environment variables HANA_DB_USER_LOGIN, HANA_DB_USER_PASSWORD and HANA_DB_SCHEMA should be set

		const hdb = require('hdb');
		this.connection_status = false;	

		this.schemaName = process.env.HANA_DB_SCHEMA || 'SMART_MONITORING';
		const VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);

		if (config.execution_environment == 'SCP') {

			// HANA Connection parameters for SCP mode

			const hanaServiceName = VCAP_SERVICES['hana-cloud'][0]['name'];
			const appEnv = cfenv.getAppEnv();
			const hanaCredentials = appEnv.getServiceCreds(hanaServiceName);

			this.client = hdb.createClient({
				host: hanaCredentials.host,
				port: hanaCredentials.port,
				user: process.env.HANA_DB_USER_LOGIN,
				password: process.env.HANA_DB_USER_PASSWORD,
				cert: hanaCredentials.certificate
			});

		} else {

			// HANA Connection parameters for XSA mode

			const hanaCredentials = VCAP_SERVICES.hana[0].credentials;

			this.client = hdb.createClient({
				host: hanaCredentials.host,
				port: hanaCredentials.port,
				user: process.env.HANA_DB_USER_LOGIN,
				password: process.env.HANA_DB_USER_PASSWORD,

			});

		} // if (config.execution_environment == 'SCP')


		this.client.on('error', function (err) {
			console.error('[PATROL] [DB INTERFACE] Network connection error during client.on', err);
			return callback(false);
		});


		this.client.connect(function (err) {
			if (err) {
				console.error('[PATROL] [DB INTERFACE] HANA database connection error during client.connect');
				console.error(err);

				return callback(false);
			} else {
				return callback(true);
			}
		});
	}

	async GetAnomalityListFromDB(timestamp, callback) {

		var schemaName = this.schemaName;

		// Limited to 1000 metrics
		
		var getAnomalityListFromDB = 'select top 1000 context_name, mname, m_short_text, t.data_collection_timestamp, metric_abnormality ' +
			'from ' + schemaName + '.metric_anomaly t ' +
			'inner join (select context_id, event_type_id, max(data_collection_timestamp) as MaxDate ' +
			'from ' + schemaName + '.metric_anomaly ' +
			'where ' + schemaName + '.metric_anomaly.metric_abnormality_indicator = true group by context_id, event_type_id ' +
			') tm on t.context_id = tm.context_id and t.event_type_id = tm.event_type_id' +
			' and t.data_collection_timestamp = tm.MaxDate and tm.MaxDate > ' + timestamp + 
			' INNER JOIN ' + 
			this.schemaName + '.mai_scope ON ' + 't.context_id = ' + this.schemaName + '.mai_scope.context_id AND ' +	
			' t.event_type_id = ' + this.schemaName + '.mai_scope.event_type_id';

		this.execsql(getAnomalityListFromDB, function (response) {

			return callback(response);
		});

	} // async GetAnomalityListFromDB(timestamp, callback)


	disconnectSession() {
		this.client.disconnect();
	}

	closeSession() {
		this.client.end();
		return true;
	}

	execsql(statement, callback) {
		
		this.client.exec(statement, function (err, rows) {

			if (err) {
				return console.error('[PATROL] [DB INTERFACE] SQL execution error:', err);
			}

			if (rows.length > 0) {

				return callback(rows);

			} else {
				console.log('[PATROL] [DB INTERFACE] Internal database table does not contain records');
				return callback(0);

			}

		});

	}

	exec(statement) {

		this.client.exec(statement, function (err) {
			if (err) {
				return console.error('[PATROL] [DB INTERFACE] SQL execution error:', err);
			}

		});
	}
}

module.exports = Storage;