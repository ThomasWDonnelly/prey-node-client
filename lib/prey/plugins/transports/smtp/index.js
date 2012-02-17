//////////////////////////////////////////
// Prey SMTP Transport Class
// (c) 2011 - Fork Ltd.
// by Tomas Pollak - http://forkhq.com
// GPLv3 Licensed
//////////////////////////////////////////

var common = require('./../../../common'),
		util = require('util'),
		dns = require('dns'),
		mailer = require('nodemailer'),
		fs = require('fs'),
		path = require('path'),
		Transport = require('./../../../transport');

var SMTPTransport = function(options){

	Transport.call(this, options);
	var self = this;
	this.name = 'smtp';

	this.recipient = options.to || options.recipient;
	this.subject = options.subject || '[Prey] Status report';
	this.sender = options.sender || 'Prey Anti-Theft <no-reply@gmail.com>';
	this.user_agent = options.user_agent || common.user_agent;

	this.send = function(data){

		this.emit('start');

		if(!this.recipient) 
			return this.emit('end', new Error("You need to provide a recipient!"));

		this.build_email(data, function(email_data){

			self.get_smtp_servers(function(hosts){

				self.try_to_send(hosts, email_data, 0);

			});

		});

	};

	this.format_data = function(data, callback){

		var body = [], attachments = [];

		for(key in data){

			var val = data[key];
			
			if(val.file && val.content_type){

				attachments.push({
					filename: path.basename(val.file),
					contents: fs.readFileSync(val.file)
				})

			} else if(val) {

				var str = (typeof val == 'string') ? val : JSON.stringify(val);
				body.push(key + " :: " + str);

			}

		};

		callback(body.join("\n"), attachments);

	};

	this.build_email = function(data, callback){

		var email_data = {
			sender: this.sender,
			to: this.recipient,
			subject: this.subject,
			headers: {
				'X-Mailer': this.user_agent
			},
			debug: process.env.DEBUG
		}

		this.format_data(data, function(body, attachments){

			email_data.body = body;
			if(attachments.length > 0) email_data.attachments = attachments;
			callback(email_data);

		});

	};

	this.get_smtp_servers = function(callback){

		var domain = this.recipient.replace(/.*@/, '');
		// console.log(domain);

		dns.resolveMx(domain, function(err, addresses) {

			if (err) throw err;
			var hosts = [];

			var sorted = addresses.sort(function(a, b){ return (a.priority > b.priority); });

			sorted.forEach(function(host){
				hosts.push(host.exchange);
			});

			callback(hosts);

		});

	};

	this.try_to_send = function(hosts, email_data, attempt){

		var host = hosts[attempt];

		if(typeof host == 'undefined')
			return this.emit('end', new Error("No more SMTP servers available."));

		this.send_email(host, email_data, function(err){

			if(!err)
				return self.emit('end', null, email_data); // all good
			else
				return self.try_to_send(hosts, email_data, ++attempt);

		});

	};

	this.send_email = function(host, email_data, callback){

		this.log('Trying to send to ' + email_data.to + ' at ' + host);

		if(!this.em) this.em = new mailer.EmailMessage(email_data);
		else { // nasty fix to prevent nodemailer from duplicating from/to addresses
			this.em.fromAddress = [];
			this.em.toAddress = [];
		}

		this.em.SERVER = { host: host }
		this.em.send(function(error, success){

			// if(error) common.logger.error(error);
			// if(success) self.log('Message sent!');

			return callback(error);

		});

	};

}

util.inherits(SMTPTransport, Transport);

exports.send = function(data, options){
	var transport = new SMTPTransport(options);
	transport.send(data);
	return transport;
	// return transport;
};