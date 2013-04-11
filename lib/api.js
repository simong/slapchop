var _ = require('underscore');
var async = require('async');
var prompt = require('prompt');
var smartdc = require('smartdc');
var smartdcCommon = require('smartdc/lib/cli_common');
var util = require('util');

var SlapchopUtil = require('./util');

var client = null;

/**
 * Using the local cloud config, build the JavaScript object of nodes (keyed by node name) holding the
 * node meta information.
 */
var buildLocalNodes = module.exports.buildLocalNodes = function(cloudConfig) {
    var nodeTypes = cloudConfig.nodeTypes;
    var nodes = cloudConfig.nodes;

    var compiledNodes = {};
    _.each(nodes, function(nodeConfig, nodeName) {
        if (!nodeConfig.type) {
            throw new Error('Node "' + nodeName + '" did not have a type associated to it.');
        } else if (!nodeTypes[nodeConfig.type]) {
            throw new Error('Node "' + nodeName + '" references non-existent node type.');
        }

        compiledNodes[nodeName] = _.extend({}, nodeTypes[nodeConfig.type], nodeConfig);
    });

    return compiledNodes;
};

/**
 * Request remote machine information from the server and apply it to a `machine` property on the local node
 * configurations.
 */
var applyRemoteMachineInfo = module.exports.applyRemoteMachineInfo = function(localNodes, opts, callback) {
    createClient(opts.argv, function(client) {
        logStatus('slapchop', 'Fetching remote machine information');

        client.listMachines(function(err, machines) {
            if (err) {
                return callback(err);
            }

            _.each(machines, function(machine) {
                if (localNodes[machine.name]) {
                    localNodes[machine.name].machine = machine;
                }
            });

            return callback();
        });
    });
};

/**
 * List the machines in the remote cloud
 */
var listMachines = module.exports.listMachines = function(opts, callback) {
    createClient(opts.argv, function(client) {
        client.listMachines(callback);
    });
};

/**
 * Create the array of given nodes in the cloud, applying the remote representation to the node.
 */
var createMachines = module.exports.createMachines = function(nodes, opts, callback) {
    _createMachines(_createNodeArray(nodes), opts, callback);
};

var _createMachines = function(nodeArray, opts, callback, _failures) {
    _failures = _failures || {};
    nodeArray = nodeArray || [];
    if (nodeArray.length === 0) {
        return callback();
    }

    var node = nodeArray.shift();
    createClient(opts.argv, function(client) {
        var msg = 'Sending creation request to ' + node.name;
        if (_failures[node.name]) {
            msg += ' (Retry #' + _failures[node.name] + ')';
        }
        logStatus('slapchop', msg);

        client.createMachine({'name': node.name, 'dataset': node.node.system.datasetUrn, 'package': node.node.system['package']}, function(err, machine) {
            if (err) {
                logStatus(node.name, 'Error receiving creation request', 'red');
                logStatus(node.name, JSON.stringify(err, null, 2), 'red');

                // Increment the failures for this node and push it back on the stack to be retried
                _failures[node.name] = (_failures[node.name]) ? _failures[node.name] + 1 : 1;
                nodeArray.push(node);

            } else {
                logStatus(node.name, 'Successfully received creation request. Starting up.', 'green');
                node.node.machine = machine;
            }

            _createMachines(nodeArray, opts, callback, _failures);
        });
    });
};

/**
 * Waits for the given JavaScript object of nodes (keyed by node name) to be in the running state
 */
var whenRunning = module.exports.whenRunning = function(nodes, opts, callback) {
    logStatus('slapchop', 'Waiting for all nodes to become available');

    createClient(opts.argv, function(client) {
        _monitor(client, nodes, 'running', callback);
    });
};

var startupMachines = module.exports.startupMachines = function(nodes, opts, callback) {
    _startupMachines(_createNodeArray(nodes), opts, callback);
};

var _startupMachines = function(nodeArray, opts, callback, _failures) {
    _failures = _failures || {};
    nodeArray = nodeArray || [];
    if (nodeArray.length === 0) {
        return callback();
    }

    var node = nodeArray.shift();
    createClient(opts.argv, function(client) {
        var msg = 'Sending startup request to ' + node.name;
        if (_failures[node.name]) {
            msg += ' (Retry #' + _failures[node.name] + ')';
        }
        logStatus('slapchop', msg);

        client.startMachine(node.node.machine.id, function(err) {
            if (err) {
                logStatus(node.name, 'Error receiving startup request', 'red');
                logStatus(node.name, JSON.stringify(err, null, 2), 'red');

                // Increment the failures for this node and push it back on the stack to be retried
                _failures[node.name] = (_failures[node.name]) ? _failures[node.name] + 1 : 1;
                nodeArray.push(node);
            } else {
                logStatus(node.name, 'Successfully received startup request.', 'green');
            }

            _startupMachines(nodeArray, opts, callback, _failures);
        });
    });
};

/**
 * Delete the nodes defined in the nodes object
 */
var shutdownMachines = module.exports.shutdownMachines = function(nodes, opts, callback) {
    _shutdownMachines(_createNodeArray(nodes), opts, callback);
};

var _shutdownMachines = function(nodeArray, opts, callback, _failures) {
    _failures = _failures || {};
    nodeArray = nodeArray || [];
    if (nodeArray.length === 0) {
        return callback();
    }

    var node = nodeArray.shift();
    createClient(opts.argv, function(client) {
        var msg = 'Sending shutdown request to ' + node.name;
        if (_failures[node.name]) {
            msg += ' (Retry #' + _failures[node.name] + ')';
        }
        logStatus('slapchop', msg);

        client.stopMachine(node.node.machine.id, function(err) {
            if (err) {
                logStatus(node.name, 'Error receiving shutdown request', 'red');
                logStatus(node.name, JSON.stringify(err, null, 2), 'red');

                // Increment the failures for this node and push it back on the stack to be retried
                _failures[node.name] = (_failures[node.name]) ? _failures[node.name] + 1 : 1;
                nodeArray.push(node);

            } else {
                logStatus(node.name, 'Successfully received shutdown request. Powering down.', 'green');
            }

            _shutdownMachines(nodeArray, opts, callback, _failures);
        });
    });
};

/**
 * Waits for the given JavaScript object of nodes (keyed by node name) to be in the stopped state
 */
var whenStopped = module.exports.whenStopped = function(nodes, opts, callback) {
    logStatus('slapchop', 'Waiting for all nodes to shut down');
    createClient(opts.argv, function(client) {
        _monitor(client, nodes, 'stopped', callback);
    });
};

/**
 * Permanently deletes the nodes contained in the JavaScript object of nodes (keyed by node name)
 */
var destroyMachines = module.exports.destroyMachines = function(nodes, opts, callback) {
    _deleteMachines(_createNodeArray(nodes), opts, callback);
};

var _deleteMachines = function(nodeArray, opts, callback, _failures) {
    _failures = _failures || {};
    nodeArray = nodeArray || [];
    if (nodeArray.length === 0) {
        return callback();
    }

    var node = nodeArray.shift();
    createClient(opts.argv, function(client) {
        var msg = 'Sending delete request to ' + node.name;
        if (_failures[node.name]) {
            msg += ' (Retry #' + _failures[node.name] + ')';
        }
        logStatus('slapchop', msg);

        client.deleteMachine(node.node.machine.id, function(err) {
            if (err) {
                logStatus(node.name, 'Error receiving delete request', 'red');
                logStatus(node.name, JSON.stringify(err, null, 2), 'red');

                // Increment the failures for this node and push it back on the stack to be retried
                _failures[node.name] = (_failures[node.name]) ? _failures[node.name] + 1 : 1;
                nodeArray.push(node);

            } else {
                logStatus(node.name, 'Successfully received delete request.', 'green');
            }

            _deleteMachines(nodeArray, opts, callback, _failures);
        });
    });
};

/**
 * Waits for the given JavaScript object of nodes (keyed by node name) to be completely deleted from the cloud account
 */
var whenDeleted = module.exports.whenDeleted = function(nodes, opts, callback) {
    logStatus('slapchop', 'Waiting for all nodes to be deleted');
    createClient(opts.argv, function(client) {
        _monitorDeleted(client, nodes, callback);
    });
};

var uptime = module.exports.uptime = function(nodes, opts, callback) {
    if (_.isEmpty(nodes)) {
        return callback();
    }

    var errs = null;
    var todo = 0;
    var cmd = 'uptime';
    _.each(nodes, function(node, nodeName) {
        todo++;

        var logFile = node.logFile || './' + nodeName;
        var stdoutFile = logFile + '.stdout.log';
        var stderrFile = logFile + '.stderr.log';

        logStatus(nodeName, 'Running: ' + cmd, 'yellow');
        SlapchopUtil.ssh(node.machine.primaryIp, 'root', cmd, stdoutFile, stderrFile, function(err) {
            if (err) {
                errs = errs || [];
                errs.push(err);
                logStatus(nodeName, 'Error running command', 'red');
                logStatus(nodeName, JSON.stringify(err, null, 2), 'red');
            }

            if (--todo === 0) {
                return callback(errs);
            }
        });
    });
};

/**
 * Output a log entry
 */
var logStatus = module.exports.logStatus = function(who, msg, color) {
    color = color || 'grey';
    console.log('['[color] + who.white + '] '[color] + msg[color]);
};

var _monitorDeleted = function(client, nodes, callback, _deleted) {
    _deleted = _deleted || {};
    client.listMachines(function(err, machines) {
        if (err) {
            return callback(err);
        }

        var toDelete = _.keys(nodes);
        var existing = [];
        _.each(machines, function(machine) {
            existing.push(machine.name);
        });

        var remaining = _.intersection(toDelete, existing);
        var deleted = _.difference(toDelete, existing);

        _.each(deleted, function(nodeName) {
            if (!_deleted[nodeName]) {
                logStatus(nodeName, 'I am deleted', 'green');
                _deleted[nodeName] = nodes[nodeName];
            }
        });

        if (remaining.length > 0) {
            return setTimeout(_monitorDeleted, 1000, client, nodes, callback, _deleted);
        } else {
            return callback();
        }
    });
};

var _monitor = function(client, nodes, status, callback, _inStatus) {
    _inStatus = _inStatus || {};
    client.listMachines(function(err, machines) {
        if (err) {
            logStatus('slapchop', 'Error polling for machine status. Skipping and continuing to poll any way.', 'red');
            return setTimeout(_monitor, 1000, client, nodes, status, callback, _inStatus);
        }

        var hadNodeNotInStatus = false;
        _.each(machines, function(machine) {
            if (machine.state !== status && nodes[machine.name]) {
                hadNodeNotInStatus = true;
            }

            if (nodes[machine.name] && machine.state === status && !_inStatus[machine.name]) {
                _inStatus[machine.name] = machine;
                logStatus(machine.name, 'In status "' + status + '"', 'green');
            }
        });

        if (hadNodeNotInStatus) {
            return setTimeout(_monitor, 1000, client, nodes, status, callback, _inStatus);
        } else {
            return callback();
        }
    });
};

var _createNodeArray = function(nodes) {
    var nodeArray = [];
    _.each(nodes, function(node, nodeName) {
        nodeArray.push({'name': nodeName, 'node': node});
    });
    return nodeArray;
};

var createClient = function(argv, callback) {
    if (client) {
        return callback(client);
    }

    var processArgvBefore = process.argv;
    process.argv = process.argv.slice(0, 2);

    if (argv.a) {
        process.argv.push('-a');
        process.argv.push(argv.a);
    }

    if (argv.d) {
        process.argv.push('-u');
        process.argv.push(util.format('https://%s.api.joyentcloud.com', argv.d));
    }

    if (argv.k) {
        process.argv.push('-k');
        process.argv.push(argv.k);
    }

    var options = {'account': String, 'url': String, 'keyId': String};
    var shortOptions = {'a': ['--account'], 'u': ['--url'], 'k': ['--keyId']};

    smartdcCommon.parseArguments(options, shortOptions, function(parsed) {
        process.argv = processArgvBefore;
        callback(smartdcCommon.newClient(parsed));
    });
};
