'use strict';

// eslint-disable-next-line camelcase
var child_process = require('child_process');
var format = require('util').format;
var path = require('path');
var series = require('run-series');
var tv4 = require('tv4');

var schema = {
  type: 'object',
  properties: {
    user: { type: 'string', minLength: 1 },
    host: { type: ['string', 'array'] },
    repo: { type: 'string' },
    path: { type: 'string' },
    ref: { type: 'string' },
    fetch: { type: 'string' },
  },
  required: ['host', 'repo', 'path', 'ref'],
};

/**
 * Spawn a modified version of visionmedia/deploy
 * @private
 * @param {object} config config to be piped to deploy
 * @param {array}  args custom deploy command-line arguments
 * @param {DeployCallback} cb done callback
 */
function spawn(config, args, cb) {
  var cmd = format('echo \'%j\' | "%s"', config, require.resolve('./deploy'));

  args = args || [];
  if (args.length > 0) {
    cmd = args.reduce(function (acc, arg) {
      acc += format(' "%s"', arg);
      return acc;
    }, cmd).trim();
  }

  var proc = child_process.spawn('sh', ['-c', cmd], { stdio: 'inherit' });
  var error;

  proc.on('error', function (err) {
    error = err;
  });

  proc.on('close', function (code) {
    if (code === 0) return cb(null, args);
    error = error || new Error(format('Deploy failed with exit code: %s', code));
    error.code = code;
    return cb(error);
  });
}

function isFunction(arg) {
  return typeof arg === 'function';
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function castArray(arg) {
  return Array.isArray(arg) ? arg : [arg];
}

/**
 * Deploy to a single environment
 * @param {object} deployConfig object containing deploy configs for all environments
 * @param {string} env the name of the environment to deploy to
 * @param {array} args custom deploy command-line arguments
 * @param {object} [options={}] deploy options
 * @param {boolean|function} [options.logging=console.log] logging function or `false` to disable logging
 * @param {DeployCallback} cb done callback
 * @returns {boolean} return value is always `false`
 */
function deployForEnv(deployConfig, env, args, options, cb) {
  if (isFunction(options)) {
    cb = options;
    options = {};
  }

  options = options || {};
  options.logging = options.hasOwnProperty('logging') ? options.logging : console.log;
  if (options.logging === true) options.logging = console.log;

  function log() {
    if (!isFunction(options.logging)) return;
    var args = arguments.slice(0);
    if (options.logging === console.log) args.shift();
    return options.logging.apply(options, args);
  }

  if (!deployConfig[env]) {
    return cb(new Error(format('%s not defined in deploy section', env)));
  }

  var envConfig = clone(deployConfig[env]);
  var result = tv4.validateResult(envConfig, schema);
  if (!result.valid) {
    return cb(result.error);
  }

  if (envConfig.ssh_options) {
    envConfig.ssh_options = castArray(envConfig.ssh_options)
      .reduce(function (acc, option) {
        acc += format(' -o %s', option);
        return acc;
      }, '').trim();
  }

  if (process.platform !== 'win32') {
    envConfig.path = path.resolve(envConfig.path);
  }

  var hosts = castArray(envConfig.host);
  var jobs = hosts.map(function (host) {
    return function job(done) {
      var config = clone(envConfig);
      config.host = host;
      config['post-deploy'] = prependEnv(config['post-deploy'], config.env);

      log({ host: host }, format('--> on host %s', host));
      spawn(config, args, done);
    };
  });

  log({ env: env }, format('--> Deploying to %s environment', env));
  series(jobs, function (err, result) {
    if (!Array.isArray(envConfig.host)) result = result && result[0];
    cb(err, result);
  });

  return false;
}

function envToString(env) {
  env = env || {};
  return Object.keys(env)
    .reduce(function (acc, name) {
      acc += format(' %s=%s', name.toUpperCase(), env[name]);
      return acc;
    }, '').trim();
}

/**
 * Prepend command with environment variables
 * @private
 * @param {string} cmd command
 * @param {object} env object containing environment variables
 * @returns {string} concatenated shell command
 */
function prependEnv(cmd, env) {
  const envVars = envToString(env);
  if (!envVars) return cmd;
  if (!cmd) return format('export %s', envVars);
  return format('export %s && %s', envVars, cmd);
}

module.exports = {
  deployForEnv: deployForEnv,
};

/**
* @callback DeployCallback
* @param {Error} error deployment error
* @param {array} args custom command-line arguments provided to deploy
*/
