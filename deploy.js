
var fs    = require('fs');
var spawn = require('child_process').spawn;

var tv4   = require('tv4');

var Deploy = module.exports = {};

//ADD POST FUNC FOR RELOAD / RESTART APP PM2

/**
 * Call modified version of visionmedia/deploy
 *
 * @param {string} deploy_conf
 * @param {string} env
 * @param {array}  ags
 * @callback cb
 */
Deploy.deployForEnv = function(deploy_conf, env, args, cb) {
  if (!deploy_conf[env]) return cb(env + ' not defined in deploy section');

  var target_conf = deploy_conf[env];
  var piped_data  = JSON.stringify(target_conf);

  if (!tv4.validate(target_conf, {
    "required": ["user", "host", "repo", "path", "ref"]
  })) {
    return cb(tv4.error);
  }

  console.log('--> Deploying in %s environment on host %s', env, target_conf.host);

  var shellSyntaxCommand = "echo '" + piped_data + "' | " + __dirname + "/deploy " + args.join(' ');
  var proc = spawn('sh', ['-c', shellSyntaxCommand], { stdio: 'inherit' });

  proc.on('error', function(e) {
    return cb(e.stack || e);
  });

  proc.on('close', function(code) {
    if (code == 0) return cb(null, args);
    else return cb(code);
  });
  return false;
};

function deploy() {
  var conf    = JSON.parse(fs.readFileSync('app.json'));
  var args    = process.argv;

  if (args.indexOf('deploy') == -1)
    throw new Error('deploy argument not found');

  args.splice(0, args.indexOf('deploy') + 1);

  var env = args[0];

  Deploy.deployForEnv(conf.deploy, env, args, function(err, data) {
    console.log(arguments);
  });

}

if (require.main === module) {
  deploy();
}
