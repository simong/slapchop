var _ = require('underscore');
var colors = require('colors');
var prompt = require('prompt');
var slapchop = require('./lib/api');
var util = require('util');

///////////////////////
// COMMAND-LINE ARGS //
///////////////////////

var argv = require('optimist')
            .usage('Usage: $0 -a <account> -d <data-center> [-e <path/to/env.json>] command\n\n' +
                '<command> can be one of: list, bootstrap, destroy')

            .describe('h', 'Show this help dialogue')
            .alias('h', 'help')

            .describe('e', 'The location of the environment descriptor.')
            .alias('e', 'environment')['default']('e', 'env.json')

            .demand('a')
            .describe('a', 'The account you would like to use')
            .alias('a', 'account')

            .demand('d')
            .describe('d', 'The data-center to use')
            .alias('d', 'data-center')

            .describe('f', 'The (comma-separated list) of node names to which to apply this action. To exclude one, prefix it with a "~"')
            .alias('f', 'filter-names')

            .argv;

var envPath = argv.e;
if (envPath[0] !== '/') {
    envPath = process.cwd() + '/' + envPath;
}

var cloudConfig = require(envPath);

//////////////////////
// APPLICATION FLOW //
//////////////////////

var commands = {};

commands['list'] = function(cloudConfig, argv, callback) {
    slapchop.listMachines({'argv': argv}, function(err, machines) {
        if (err) {
            return callback(JSON.stringify(err, null, 2).red);
        }

        slapchop.logStatus('slapchop', JSON.stringify(machines, null, 2));
        return callback();
    });
};

commands['bootstrap'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);

    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        // Collect all nodes that don't have a remote mapping, they need to be created
        var machinesToCreate = {};
        _.each(nodes, function(node, nodeName) {
            if (!node.machine) {
                machinesToCreate[nodeName] = node;
            }
        });

        // Abort if there are no new machines to create
        if (_.isEmpty(machinesToCreate)) {
            slapchop.logStatus('slapchop', 'All nodes already exist.', 'green');
            return _whenRunning(nodes, opts, callback);
        }

        // Prompt user to create machines
        prompt.start();
        prompt.get({
            'name': 'create',
            'description': 'The following nodes will be created: '+JSON.stringify(_.keys(machinesToCreate))+'. Continue? (y / n)'
        }, function(err, result) {
            if (err) {
                _logError('slapchop', 'Error accepting input:', err);
                return callback(err);
            } else if (result.create !== 'y') {
                slapchop.logStatus('slapchop', 'Aborting bootstrap.');
                return callback();
            }

            slapchop.createMachines(machinesToCreate, opts, function(err) {
                if (err) {
                    return callback(err);
                }

                slapchop.logStatus('slapchop', 'Machines created.', 'green');
                _whenRunning(nodes, opts, callback);
            });
        });
    });
};

commands['uptime'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);
    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        var machinesToCheck = {};
        _.each(nodes, function(node, nodeName) {
            if (node.machine) {
                machinesToCheck[nodeName] = node;
            }
        });

        slapchop.uptime(machinesToCheck, opts, function(err) {
            if (err) {
                _logError('slapchop', 'Error checking uptime:', err);
                return callback(err);
            }

            return callback();
        });
    });
};

commands['env'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);
    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        _.each(nodes, function(node, nodeName) {
            console.log(util.format('export %s="%s"', _getEnvVarPublic(nodeName), _getPublicIp(node)));
            console.log(util.format('export %s="%s"', _getEnvVarInternal(nodeName), _getInternalIp(node)));
        });

        return callback();
    });
};

commands['create-provision-script'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);
    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        console.log('#!/bin/bash');
        console.log('');

        _.each(nodes, function(node, nodeName) {
            console.log(util.format('%s="%s"', _getEnvVarPublic(nodeName), _getPublicIp(node)));
            console.log(util.format('%s="%s"', _getEnvVarInternal(nodeName), _getInternalIp(node)));
        });

        console.log('');

        _.each(nodes, function(node, nodeName) {
            if (nodeName === 'puppet')
                return;

            var nodeVar = nodeName.replace(/-/g, '_');

            console.log(util.format('ssh -oStrictHostKeyChecking=no root@$%s "curl https://raw.github.com/sakaiproject/puppet-hilary/master/provisioning/ubuntu.sh | bash -s performance %s $%s" &',
                _getEnvVarPublic(nodeName), nodeName, _getEnvVarInternal('puppet')));
        });

        return callback();
    });
};

commands['reboot'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);
    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        var nodesToShutdown = {};
        var nodesToStartup = {};
        _.each(nodes, function(node, nodeName) {
            if (node.machine) {
                nodesToStartup[nodeName] = node;
                if (node.machine.state === 'running') {
                    nodesToShutdown[nodeName] = node;
                }
            }
        });

        prompt.start();
        prompt.get({
            'name': 'shutdown',
            'description': 'The following nodes will be shutdown: ' + JSON.stringify(_.keys(nodesToShutdown)) + '. Continue? (y / n)'
        }, function(err, result) {
            if (err) {
                _logError('slapchop', 'Error accepting input:', err);
                return callback(err);
            } else if (result.shutdown !== 'y') {
                slapchop.logStatus('slapchop', 'Aborting reboot process.');
                return callback();
            }


            slapchop.shutdownMachines(nodesToShutdown, opts, function(err) {
                if (err) {
                    _logError('slapchop', 'Error shutting down machines:', err);
                    return callback(err);
                }

                slapchop.whenStopped(nodesToStartup, opts, function(err) {
                    if (err) {
                        _logError('slapchop', 'Error polling for nodes to shut down:', err);
                        return callback(err);
                    }

                    slapchop.startupMachines(nodesToStartup, opts, function(err) {
                        if (err) {
                            _logError('slapchop', 'Error starting up machines:', err);
                            return callback(err);
                        }

                        slapchop.whenRunning(nodesToStartup, opts, function(err) {
                            if (err) {
                                _logError('slapchop', 'Error polling for nodes to start up:', err);
                                return callback(err);
                            }

                            return callback();
                        });
                    });
                });
            });
        });
    });
};

commands['destroy'] = function(cloudConfig, argv, callback) {
    var opts = {'argv': argv};
    var nodes = _filterNames(slapchop.buildLocalNodes(cloudConfig), argv.f);
    slapchop.applyRemoteMachineInfo(nodes, opts, function(err) {
        if (err) {
            _logError('slapchop', 'Error applying remote machines:', err);
            return callback(err);
        }

        var nodesToShutdown = {};
        var nodesToDestroy = {};
        _.each(nodes, function(node, nodeName) {
            if (node.machine) {
                nodesToDestroy[nodeName] = node;
                if (node.machine.state === 'running') {
                    nodesToShutdown[nodeName] = node;
                }
            }
        });

        if (_.isEmpty(nodesToDestroy)) {
            slapchop.logStatus('slapchop', 'All nodes are already destroyed.', 'green');
            return callback();
        }

        prompt.start();
        prompt.get({
            'name': 'destroy',
            'description': 'The following nodes will be irrecoverably destroyed: ' + JSON.stringify(_.keys(nodesToDestroy)) + '. Continue? (y / n)'
        }, function(err, result) {
            if (err) {
                _logError('slapchop', 'Error accepting input:', err);
                return callback(err);
            } else if (result.destroy !== 'y') {
                slapchop.logStatus('slapchop', 'Aborting destroy process.');
                return callback();
            }

            slapchop.shutdownMachines(nodesToShutdown, opts, function(err) {
                if (err) {
                    _logError('slapchop', 'Error shutting down machines:', err);
                    return callback(err);
                }

                slapchop.whenStopped(nodesToDestroy, opts, function(err) {
                    if (err) {
                        _logError('slapchop', 'Error polling for nodes to shut down:', err);
                        return callback(err);
                    }

                    slapchop.destroyMachines(nodesToDestroy, opts, function(err) {
                        if (err) {
                            _logError('slapchop', 'Error polling for nodes to shut down:', err);
                            return callback(err);
                        }

                        slapchop.whenDeleted(nodesToDestroy, opts, function(err) {
                            if (err) {
                                _logError('slapchop', 'Error polling for nodes to be deleted:', err);
                                return callback(err);
                            }

                            return callback();
                        });
                    });
                });
            });
        });
    });
};

var _filterNames = function(nodes, filterArg) {
    if (!filterArg) {
        return nodes;
    }

    var includes = [];
    var excludes = [];
    var filterNames = filterArg.split(',');
    _.each(filterNames, function(filterName) {
        if (filterName[0] === '~') {
            excludes.push(filterName.slice(1));
        } else {
            includes.push(filterName);
        }
    });

    var filteredNodes = _.extend({}, nodes);
    if (includes.length > 0) {
        filteredNodes = {};
        _.each(includes, function(includeName) {
            filteredNodes[includeName] = nodes[includeName];
        });
    }

    _.each(excludes, function(excludeName) {
        delete filteredNodes[excludeName];
    });

    return filteredNodes;
};

var _whenRunning = function(nodes, opts, callback) {
    slapchop.whenRunning(nodes, opts, function(err) {
        if (err) {
            slapchop.logStatus('slapchop', 'Error while polling for machine startup', 'red');
            slapchop.logStatus('slapchop', JSON.stringify(err, null, 2), 'red');
        }

        return callback();
    });
};

var _logError = function(who, msg, err) {
    slapchop.logStatus(who, msg, 'red');
    slapchop.logStatus(who, JSON.stringify(err, null, 2), 'red');
};

var _getPublicIp = function(node) {
    if (!node.machine) {
        throw new Error('Node did not have a remote machine: ' + JSON.stringify(node, null, 4));
    }

    return node.machine.primaryIp;
};

var _getInternalIp = function(node) {
    if (!node.machine) {
        throw new Error('Node did not have a remote machine: ' + JSON.stringify(node, null, 4));
    }

    return (node.machine.ips[0] === node.machine.primaryIp) ? node.machine.ips[1] : node.machine.ips[0];
};

var _getEnvVarPublic = function(nodeName) {
    var nodeVar = nodeName.replace(/-/g, '_');
    return util.format('%s_%s', argv.a, nodeVar);
};

var _getEnvVarInternal = function(nodeName) {
    var nodeVar = nodeName.replace(/-/g, '_');
    return util.format('%s_%s_internal', argv.a, nodeVar);
};

if (argv.h !== undefined) {
    require('optimist').printUsage();
    process.exit();
}

commands[argv._[0]](cloudConfig, argv, function() {
    slapchop.logStatus('slapchop', 'Complete');
    process.exit();
});