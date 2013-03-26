var fs = require('fs');
var SshConnection = require('ssh2');

var ssh = module.exports.ssh = function(outputFileOutPath, outputFileErrPath, connectionOptions, callback) {
    var c = new SshConnection();

    c.on('ready', function() {
        c.exec(cmd, function(err, stream) {
            if (err) {
                c.removeAllListeners();
                return callback(err);
            }

            var outStream = fs.createWriteStream(outputFileOutPath, {'flags': 'a'});
            var errStream = fs.createWriteStream(outputFileErrPath, {'flags': 'a'});

            stream.on('data', function(data, ext) {
                if (ext === 'stderr') {
                    errStream.write(data);
                } else {
                    outStream.write(data);
                }
            });

            stream.on('end', function() {
                errStream.end();
                outStream.end();
            });

            stream.on('exit', function(code, signal) {
                c.removeAllListeners();
                c.end();
                return callback(null, code, signal);
            });
        });
    });

    c.on('error', function(err) {
        console.log('error');
        c.removeAllListeners();
        return callback(err);
    });

    console.log('Connecting to ' + host);

    var publicKey = require('fs').readFileSync(process.env.HOME + '/.ssh/id_rsa.pub');
    var privateKey = require('fs').readFileSync(process.env.HOME + '/.ssh/id_rsa');
    c.connect(connectionOptions);
};