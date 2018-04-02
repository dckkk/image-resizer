const request = require("request")
		, sharp = require('sharp')
		, fs = require("fs")
		, md5 = require('md5')
		, debug = require('debug')('static-app');

// Prefix of URL
var pUrl;

// use to download file from http / http URL
var download = (uri, filename, cb) => {
	request.get(uri)
		.on('error', function(err) {
			cb(err, null);
		})
		.on('end', function() {
			cb(undefined, filename);
		}).pipe(fs.createWriteStream(filename));
}

// use to extract filter rules in object
var ruleToObj = (req) => {
	var obj = {};
	if ('string' !== typeof req) {
		return obj;
	}
	if (req == '_') {
		return obj;
	}
	var _r = req.split(',');
	for (var i in _r) {
		if (/^c\d+x\d+(x[\d-]+x[\d-]+)?$/i.test(_r[i])) {
			obj.crop = _r[i].replace('X','x').replace(/c/i, '').split('x');
			if (obj.crop.length == 2) {
				obj.crop.push.apply(obj.crop, [0,0]);
			}
		} else if (/^\d+x\d+$/i.test(_r[i])) {
			obj.resize = _r[i].replace('X','x').split('x');
			obj.resize.push('^');
		} else if (/^r[\d-]+$/i.test(_r[i])) {
			obj.rotate = _r[i].replace(/r/i, '');
		} else if (/^q\d+$/i.test(_r[i])) {
			obj.quality = _r[i].replace(/q/i, '');
		} else {
			switch (_r[i]) {
				case 'flop':
					obj.flop = true;
				default:
					continue;
			}
		}
	}
	return obj;
}

var processingImg = (filename, rule) => {
	var fsharp = sharp(filename);
	var rules = ruleToObj(rule);
	for (var i in rules) {
		debug(i, rules[i]);
		switch (i) {
			case 'resize':
				fsharp.resize(parseInt(rules[i][0]),parseInt(rules[i][1]));
				fsharp.crop('centre');
				break;
			case 'rotate':
				fsharp.rotate('rgb(255,255,255,0)', rules[i]);
				break;
			case 'flop':
				fsharp.flop();
			case 'quality':
				fsharp.quality(rules[i]);
				break;
		}
	}
	// do the cropping at last
	if (rules['crop']) {
		fsharp.crop.apply(fsharp, rules['crop']);
	}

	return fsharp.toBuffer();
}

exports.filter = function(req, res, next) {

	var re = new RegExp("^"+ pUrl.replace('/','\\/') +"\\/([\\w-,]+)\\/(.+)");
	var m = req.url.match(re);

	// go to the next step, if the request doesn't meet the chosen url-prefix
	if (!m) next();
	else {
		if ('object'===typeof m && m.length >= 3) {
			var rule=m[1], imgUrl = m[2];
		} else {
			next()
		}

		var tmpname = md5(`${m[1]}/${imgUrl}`);
		var cache = `./resources/cache/${tmpname}`;
		var imageType = m[1].split(',')[1];
		var fileresult = (typeof imageType === 'undefined')? `${cache}.jpg` : `${cache}.${imageType}`;
		debug('m', m);

		fs.readFile(`${cache}.${imageType}`, function(err, data)	{
			// file not exist
			if (err)	{
				if (imgUrl.match(/^http/) == null) { //should be local file
					if (fs.existsSync(`./resources/${imgUrl}`))	{
						processingImg(`./resources/${imgUrl}`, rule).then((data) => {
							if (imageType === 'webp')	{
								res.set('Content-Type', 'image/webp');
								sharp(data).webp().toFile(fileresult);
							} else {
								res.set('Content-Type', 'image/jpeg');
								sharp(data).jpeg().toFile(fileresult);
							}

							try {
								fs.unlink(`resources/tmp/${tmpname}`);
							} catch(e)	{
								debug(e);
							}

							res.send(data);
						}).catch((err) => {
							debug(err);
							res.send(`Error to load: ${imgUrl}`)
						});
					} else {
						var readStream = fs.createReadStream('./resources/no_image_thumb.gif');
						readStream.pipe(res);
					}
				} else {
					download(imgUrl, `resources/tmp/${tmpname}`, function(err, filename) {
						if (err) {
							res.send(`Error to download: ${imgUrl}`);
							return;
						} else {
							processingImg(filename, rule).then((data) => {
								if (imageType === 'webp')	{
									res.set('Content-Type', 'image/webp');
									sharp(data).webp().toFile(fileresult);
								} else {
									res.set('Content-Type', 'image/jpeg');
									sharp(data).jpeg().toFile(fileresult);
								}

								try {
									fs.unlink(`resources/tmp/${tmpname}`);
								} catch(e)	{
									debug(e);
								}

								res.send(data);
							}).catch((err) => {
								debug(err);
								res.send(`Error to load: ${imgUrl}`)
							});
						}
					});
				}
			} else {
				if (imageType === 'webp')	{
					res.set('Content-Type', 'image/webp');
				} else {
					res.set('Content-Type', 'image/jpeg');
				}
				res.send(data);
			}
		});
	}
};

exports.loader = function(prefix) {
	pUrl = prefix || '/l';

	return exports.filter;
}
