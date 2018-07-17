var fs = require('fs');
var tv4 = require('tv4');
var series = require('async/series');
var childProcess = require('child_process');
var path = require('path');

/**
 * Spawn a modified version of visionmedia/deploy
 *
 * @param {string} hostJSON: config string to be piped to deploy
 * @param {array}  args: custom deploy command-line arguments
 * @callback cb
 */
function spawn(hostJSON, args, cb) {
  var shellSyntaxCommand = "echo '" + hostJSON + "' | \"" + __dirname.replace(/\\/g, '/') + "/deploy\" " + args.join(' ');
  var proc = childProcess.spawn('sh', ['-c', shellSyntaxCommand], { stdio: 'inherit' });
  var error;

  proc.on('error', function (e) {
    error = e;
  });

  proc.on('close', function (code) {
    if (code == 0) return cb(null, args);
    else return cb(error || code);
  });
}

/**
 * Deploy to a single environment
 *
 * @param {object} deploy_conf: object containing deploy configs for all environments
 * @param {string} env: the name of the environment to deploy to
 * @param {array}  args: custom deploy command-line arguments
 * @callback cb
 */
function deployForEnv(deploy_conf, env, args, cb) {
  if (!deploy_conf[env]) return cb(env + ' not defined in deploy section');

  var piped_data = JSON.stringify(deploy_conf[env]);
  var target_conf = JSON.parse(piped_data); //effectively clones the conf

  if (target_conf.ssh_options) {
    var ssh_opt = '';
    if (Array.isArray(target_conf.ssh_options)) {
      ssh_opt = '-o ' + target_conf.ssh_options.join(' -o ');
    } else {
      ssh_opt = '-o ' + target_conf.ssh_options;
    }
    target_conf.ssh_options = ssh_opt;
  }

  if (!tv4.validate(target_conf, {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        minLength: 1,
      },
      host: {
        type: ['string', 'array'],
      },
      repo: {
        type: 'string',
      },
      path: {
        type: 'string',
      },
      ref: {
        type: 'string',
      },
      fetch: {
        type: 'string',
      },
    },
    required: ["host", "repo", "path", "ref"],
  })) {
    return cb(tv4.error);
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log('--> Deploying to %s environment', env);
  }

  if (process.platform !== 'win32' && process.platform !== 'win64')
    target_conf.path = path.resolve(target_conf.path);

  if (Array.isArray(target_conf.host)) {
    series(target_conf.host.reduce(function (jobs, host) {
      jobs.push(function (done) {

        if (process.env.NODE_ENV !== 'test') {
          console.log('--> on host %s', host.host ? host.host : host);
        }

        target_conf.host = host;
        target_conf['post-deploy'] = 'export ' + objectToEnvVars(target_conf.env) + ' && ' + target_conf['post-deploy']
        var custom_data = JSON.stringify(target_conf);

        spawn(custom_data, args, done);
      });
      return jobs;
    }, []), cb);
  }
  else {
    if (process.env.NODE_ENV !== 'test') {
      console.log('--> on host %s', target_conf.host);
    }

    target_conf['post-deploy'] = 'export ' + objectToEnvVars(target_conf.env) + ' && ' + target_conf['post-deploy']
    spawn(JSON.stringify(target_conf), args, cb);
  }

  return false;
}

function objectToEnvVars(obj) {
  return !obj ? '' : Object.keys(obj).map(function (key) {
    return key.toUpperCase() + '=' + obj[key];
  }).join(' ')
}

function run() {
  var conf = JSON.parse(fs.readFileSync('app.json'));
  var args = process.argv;

  if (args.indexOf('deploy') == -1)
    throw new Error('deploy argument not found');

  args.splice(0, args.indexOf('deploy') + 1);

  var env = args[0];

  deployForEnv(conf.deploy, env, args, function (err, data) {
    console.log(arguments);
  });
}

module.exports = {
  deployForEnv: deployForEnv
};

if (require.main === module) {
  run();
}
